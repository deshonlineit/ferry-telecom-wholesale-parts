"""Integration checks against the isolated native test shop only."""
import concurrent.futures
import http.cookiejar
import json
import os
import pathlib
import secrets
import subprocess
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = "https://" + os.environ["REPLIT_DEV_DOMAIN"] + "/test-shop/api"
checks = []


def check(condition, name):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = ""
        self.csrf = self.call("GET", "/session")["csrf"]

    def call(self, method, path, data=None, expected=(200, 201, 202), csrf=True, raw=False, content_type=None):
        headers = {}
        if method != "GET" and csrf:
            headers["X-CSRF-Token"] = self.csrf
        payload = None
        if data is not None:
            payload = data if isinstance(data, bytes) else json.dumps(data).encode()
            headers["Content-Type"] = content_type or "application/json"
        request = urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        result = response.read()
        if response.status not in expected:
            message = json.loads(result).get("error", "Unexpected response") if result.startswith(b"{") else "Non-JSON response"
            raise AssertionError(f"{method} {path}: {response.status}: {message}")
        parsed = result if raw else json.loads(result)
        if isinstance(parsed, dict) and parsed.get("csrf"):
            self.csrf = parsed["csrf"]
        return parsed

    def upload(self, path, name, filename, content, mime, fields=None):
        boundary = "qa-" + secrets.token_hex(16)
        chunks = []
        for key, value in (fields or {}).items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        chunks.extend([
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),
            content, f"\r\n--{boundary}--\r\n".encode(),
        ])
        return self.call("POST", path, b"".join(chunks), content_type="multipart/form-data; boundary=" + boundary)


fixtures = [
    {"email": "qa-api-" + secrets.token_hex(6) + "@test.invalid", "password": secrets.token_urlsafe(32), "role": role, "group_id": group}
    for role, group in [("staff", 1), ("customer", 1), ("customer", 3)]
]
fixtures[1]["payment_entitlements"] = ["swiss_qr_invoice"]
staff_email, staff_password = fixtures[0]["email"], fixtures[0]["password"]


def fixture(action="create"):
    for data in fixtures:
        subprocess.run(["php", str(ROOT / "bin/qa-user.php")], input=json.dumps({**data, "action": action}), text=True, capture_output=True, check=True)


fixture()
try:
    guest = Client()
    session = guest.call("GET", "/session")
    check(
        session["test_mode"]
        and session["capabilities"]["payments"]
        and not session["capabilities"]["live_stock"]
        and not session["capabilities"]["email"],
        "payments enabled while remote stock and email capabilities stay disabled",
    )
    guest.call("POST", "/auth/demo", {"persona": "staff"}, expected=(403,))
    check(True, "anonymous staff impersonation rejected")
    guest.call("POST", "/auth/demo", {"persona": "customer"}, csrf=False, expected=(403,))
    check(True, "CSRF required for authentication")
    guest.call("GET", "/admin/customers", expected=(401,))
    check(True, "staff data denied to guests")
    products = guest.call("GET", "/products?limit=3")["products"]
    check(all(p["price_cents"] is None and "list_price_cents" not in p for p in products), "guest price privacy")

    staff = Client()
    staff.call("POST", "/auth/login", {"email": staff_email, "password": staff_password})
    customer = Client()
    customer.call("POST", "/auth/login", {"email": fixtures[1]["email"], "password": fixtures[1]["password"]})
    partner = Client()
    partner.call("POST", "/auth/login", {"email": fixtures[2]["email"], "password": fixtures[2]["password"]})
    customer.call("GET", "/admin/products", expected=(403,))
    check(True, "customer cannot access staff product prices")
    guest.call("GET", "/admin/invoices", expected=(401,))
    customer.call("GET", "/admin/invoices", expected=(403,))
    check(True, "invoice control is staff-only")
    catalog = customer.call("GET", "/catalog")
    check(catalog["total"] >= 7851 and len(catalog["categories"]) >= 12, "offline catalog imported")
    unique = secrets.token_hex(5)
    payload = {
        "sku": "QA-" + unique, "name": "QA isolated stock fixture " + unique,
        "description": "Synthetic QA record", "category_id": catalog["categories"][0]["id"],
        "brand_id": catalog["brands"][0]["id"], "quality": "Test", "stock": 5,
        "list_price_cents": 101, "list_price_eur_cents": 101,
        "minimum_quantity": 1, "featured": False,
        "group_prices": [
            {"group_id": 1, "price_cents": 101, "price_eur_cents": 101},
            {"group_id": 3, "price_cents": 71, "price_eur_cents": 71},
        ],
    }
    product = staff.call("POST", "/admin/products", payload)["product"]
    pid = product["id"]
    staff.call("DELETE", f"/admin/products/{pid}")
    archived = staff.call("GET", f"/admin/products?status=archived&q=QA-{unique}")
    check(archived["total"] == 1 and not archived["products"][0]["active"], "archived products remain controllable")
    staff.call("POST", f"/admin/products/{pid}/restore")
    restored = staff.call("GET", f"/admin/products?status=active&q=QA-{unique}&page=999")
    check(restored["page"] == restored["pages"] and restored["products"][0]["active"], "product restore and page clamp work")
    cp = customer.call("GET", f"/products/{pid}")["product"]
    pp = partner.call("GET", f"/products/{pid}")["product"]
    check(
        cp["currency"] == pp["currency"] == "CHF"
        and cp["price_cents"] > pp["price_cents"] > 0,
        "server resolves assigned group prices in the customer's current currency",
    )
    check("group_prices" not in cp and "list_price_cents" not in cp, "other group pricing never returned")
    customer.call("DELETE", "/cart")
    customer.call("POST", "/cart", {"product_id": pid, "quantity": 3})
    addresses = customer.call("GET", "/addresses")["addresses"]
    aid = addresses[0]["id"]
    partner.call("PATCH", f"/addresses/{aid}", {"label": "Not mine"}, expected=(403, 404))
    check(True, "address ownership enforced")
    quote = customer.call("POST", "/checkout/quote", {"address_id": aid, "shipping_method": "swiss_post_priority"})
    order_body = {
        "address_id": aid, "quote_token": quote["quote_token"],
        "payment_method": "swiss_qr_invoice", "shipping_method": "swiss_post_priority", "notes": "QA only",
        "idempotency_key": "qa-" + unique,
    }
    order = customer.call("POST", "/checkout", order_body)["order"]
    repeated = customer.call("POST", "/checkout", order_body)["order"]
    check(order["id"] == repeated["id"], "checkout retry returns the same order")
    check(staff.call("GET", f"/admin/products/{pid}")["product"]["stock"] == 2, "isolated stock decremented exactly once")
    oid = order["id"]
    check(order["status"] == "on_hold", "Swiss QR order waits for payment")
    detail = customer.call("GET", f"/orders/{oid}")
    initial_invoice = staff.call("GET", f"/admin/invoices?q={order['number']}&limit=1")["invoices"][0]
    check(initial_invoice["payment_status"] == "unverified" and initial_invoice["outstanding_cents"] is None
          and initial_invoice["version"] == 0, "existing orders start unverified with unknown outstanding")
    staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": 0, "verified": True, "due_date": "2024-02-30", "paid_cents": 0, "note": "invalid QA date"
    }, expected=(422,))
    staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": 0, "verified": False, "due_date": None, "paid_cents": 1, "note": "invalid QA cents"
    }, expected=(422,))
    staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": 0, "verified": True, "due_date": "2000-01-01", "paid_cents": 1, "note": "QA local receipt"
    }, csrf=False, expected=(403,))
    overdue = staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": 0, "verified": True, "due_date": "2000-01-01", "paid_cents": 1, "note": "QA local receipt"
    })["invoice"]
    check(overdue["payment_status"] == "overdue" and overdue["outstanding_cents"] == order["total_cents"] - 1,
          "verified overdue invoice uses integer local accounting")
    staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": 0, "verified": True, "due_date": None, "paid_cents": 0, "note": "stale QA update"
    }, expected=(409,))
    partial = staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": overdue["version"], "verified": True, "due_date": None,
        "paid_cents": 1, "note": "QA partial receipt"
    })["invoice"]
    check(partial["payment_status"] == "partial", "partial invoice status is derived from received cents")
    invoice_page = staff.call("GET", f"/admin/invoices?q={fixtures[1]['email']}&status=unpaid&page=999&limit=1")
    check(
        invoice_page["page"] == invoice_page["pages"]
        and all("unverified_count" in summary for summary in invoice_page["summary"]),
        "invoice search filter pagination and currency-separated global summaries work",
    )
    check(
        detail["items"][0]["price_cents"] == cp["price_cents"]
        and detail["order"]["subtotal_cents"] == cp["price_cents"] * 3,
        "immutable own-price order snapshot",
    )
    check(
        detail["order"]["shipping_method_code"] == "swiss_post_priority"
        and detail["order"]["shipping_method_name"] == "Swiss Post Priority"
        and detail["order"]["shipping_carrier"] == "Swiss Post",
        "immutable shipping method snapshot",
    )
    partner.call("GET", f"/orders/{oid}", expected=(403, 404))
    partner.call("GET", f"/documents/{oid}/invoice.pdf", expected=(403, 404))
    check(True, "order and PDF ownership enforced")
    invoice = customer.call("GET", f"/documents/{oid}/invoice.pdf", raw=True)
    check(
        invoice.startswith(b"%PDF-") and b"Swiss QR payment section" in invoice,
        "on-hold Swiss QR order exposes its owned payment PDF",
    )
    customer.call("GET", f"/documents/{oid}/packing-slip.pdf", expected=(403,))
    check(True, "customer packing slip remains forbidden before fulfillment")
    return_body = {"order_id": oid, "reason": "QA damaged screen", "items": [{"order_item_id": detail["items"][0]["id"], "quantity": 1}]}
    customer.call("POST", "/returns", return_body, expected=(409, 422))
    check(True, "unfulfilled orders cannot be returned")
    staff.call("PATCH", f"/admin/orders/{oid}", {"status": "processing", "note": "Test processing only"})
    staff.call("PATCH", f"/admin/orders/{oid}", {"status": "shipped", "tracking": "QA-TRACK", "note": "Test shipment only"})
    credits = 0
    for _ in range(3):
        ret = customer.call("POST", "/returns", return_body)["return"]
        check(staff.call("GET", f"/admin/returns/{ret['id']}")["return"]["id"] == ret["id"], "staff can inspect return details")
        partner.call("GET", f"/admin/returns/{ret['id']}", expected=(403,))
        partner.call("GET", f"/returns/{ret['id']}", expected=(404,))
        staff.call("PATCH", f"/admin/returns/{ret['id']}", {"status": "approved", "note": "QA approved"})
        credited = staff.call("PATCH", f"/admin/returns/{ret['id']}", {"status": "credited", "note": "QA local credit"})["return"]
        credits += credited["credit_cents"]
        pdf = customer.call("GET", f"/documents/returns/{ret['id']}/credit-note.pdf", raw=True)
        check(pdf.startswith(b"%PDF-"), "credited return generates owned PDF")
    original = detail["order"]
    goods_tax = original["tax_cents"] - (original["shipping_cents"] * original["tax_bps"] + 5000) // 10000
    check(credits == original["subtotal_cents"] + goods_tax, "split-return credits reconcile exactly, excluding shipping VAT")
    credited_invoice = staff.call("GET", f"/admin/invoices?q={order['number']}")["invoices"][0]
    check(credited_invoice["credited_cents"] == credits, "issued return credits reduce invoice payable")
    paid_invoice = staff.call("PATCH", f"/admin/invoices/{oid}", {
        "version": credited_invoice["version"], "verified": True, "due_date": None,
        "paid_cents": order["total_cents"], "note": "QA paid locally"
    })["invoice"]
    check(paid_invoice["payment_status"] == "paid" and paid_invoice["credit_balance_cents"] == credits,
          "paid invoice preserves an overpaid credit balance")
    customer.call("POST", "/returns", return_body, expected=(409, 422))
    check(True, "over-return rejected")
    check(staff.call("GET", f"/admin/products/{pid}")["product"]["stock"] == 2, "damaged returns never restock automatically")

    customer.call("POST", "/cart", {"product_id": pid, "quantity": 2})
    stale_quote = customer.call("POST", "/checkout/quote", {"address_id": aid, "shipping_method": "swiss_post_priority"})
    staff.call("PATCH", f"/admin/products/{pid}", {"stock": 1})
    customer.call("POST", "/checkout", {
        **order_body, "quote_token": stale_quote["quote_token"],
        "idempotency_key": "stale-" + unique,
    }, expected=(409, 422))
    check(True, "checkout catches changed stock")
    check(staff.call("GET", f"/admin/products/{pid}")["product"]["stock"] == 1, "rejected checkout leaves stock intact")
    customer.call("POST", "/cart", {"product_id": pid, "quantity": 1})
    cancellation_quote = customer.call("POST", "/checkout/quote", {"address_id": aid, "shipping_method": "swiss_post_priority"})
    order2 = customer.call("POST", "/checkout", {
        **order_body, "quote_token": cancellation_quote["quote_token"],
        "idempotency_key": "cancel-" + unique,
    })["order"]
    staff.call("PATCH", f"/admin/invoices/{order2['id']}", {
        "version": 0, "verified": True, "due_date": None, "paid_cents": 10, "note": "QA receipt before cancellation"
    })
    staff.call("PATCH", f"/admin/orders/{order2['id']}", {"status": "cancelled", "note": "QA cancellation"})
    staff.call("PATCH", f"/admin/orders/{order2['id']}", {"status": "cancelled", "note": "QA retry"})
    check(staff.call("GET", f"/admin/products/{pid}")["product"]["stock"] == 1, "cancellation restocks exactly once")
    cancelled = customer.call("GET", f"/orders/{order2['id']}")
    cancelled_invoice = staff.call("GET", f"/admin/invoices?q={order2['number']}")["invoices"][0]
    check(cancelled_invoice["payment_status"] == "cancelled" and cancelled_invoice["outstanding_cents"] == 0
          and cancelled_invoice["paid_cents"] == 10, "cancelled invoice is non-collectable without erasing receipts")
    customer.call("POST", "/returns", {**return_body, "order_id": order2["id"], "items": [{"order_item_id": cancelled["items"][0]["id"], "quantity": 1}]}, expected=(409, 422))
    check(True, "cancelled orders cannot produce credit")
    fixture_image = next((ROOT / "../../../attached_assets/generated_images/products").glob("*.jpg"))
    uploaded = staff.upload(f"/admin/products/{pid}/images", "file", "fixture.jpg", fixture_image.read_bytes(), "image/jpeg")
    image = staff.call("GET", f"/admin/products/{pid}")["images"][0]
    check(image["url"].endswith(".webp"), "uploaded image converted to WebP")
    staff.call("DELETE", f"/admin/images/{image['id']}")
    check(not staff.call("GET", f"/admin/products/{pid}")["images"], "gallery deletion persists")

    csv = f"sku,name,category,brand,quality,stock,price\nCSV-{unique},CSV Fixture,{catalog['categories'][0]['name']},{catalog['brands'][0]['name']},Test,4,12.50\n".encode()
    preview = staff.upload("/admin/import", "file", "fixture.csv", csv, "text/csv", {"preview": "1"})
    check(preview["created"] == 1 and not customer.call("GET", f"/products?q=CSV-{unique}")["products"], "CSV dry-run writes nothing")
    committed = staff.upload("/admin/import", "file", "fixture.csv", csv, "text/csv", {
        "preview": "0", "pricing_versions": json.dumps(preview["pricing_versions"]),
    })
    check(committed["created"] == 1 and len(customer.call("GET", f"/products?q=CSV-{unique}")["products"]) == 1, "CSV commit persists validated rows")
    item = customer.call("GET", "/buyback")["items"][0]
    request = customer.call("POST", "/buyback/requests", {"items": [{"item_id": item["id"], "quantity": 2}], "notes": "QA screens"})["request"]
    check(request["total_cents"] == item["price_cents"] * 2, "buyback snapshots price and quantity")
    staff.call("PATCH", f"/admin/buyback/requests/{request['id']}", {"status": "received", "note": "QA locally received"})
    for path in ["/admin/dashboard", "/admin/customers", "/admin/settings", "/admin/messages", "/admin/audit", "/admin/returns", "/admin/buyback", "/admin/integrations"]:
        check(bool(staff.call("GET", path)), path + " responds for staff")
    staff.call("POST", "/admin/integrations/simulate", {"event": "shipment"})
    check(len(staff.call("GET", "/admin/messages")["messages"]) > 0, "events captured locally without delivery")
    print(json.dumps({"passed": len(checks), "checks": checks}, indent=2))
finally:
    fixture("block")