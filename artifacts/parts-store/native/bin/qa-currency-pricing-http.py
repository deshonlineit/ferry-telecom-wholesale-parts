#!/usr/bin/env python3
"""Destructive-but-isolated HTTP QA for native EUR pricing and checkout currency."""

import csv
import http.cookiejar
import io
import json
import os
import pathlib
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = "https://" + os.environ["REPLIT_DEV_DOMAIN"] + "/test-shop/api"
started = time.monotonic()
checks = []


def check(value, name):
    if not value:
        raise AssertionError(name)
    checks.append(name)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = self.call("GET", "/session")["csrf"]

    def call(self, method, path, data=None, expected=(200, 201), raw=False, content_type="application/json"):
        headers = {}
        payload = None
        if method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        if data is not None:
            payload = data if isinstance(data, bytes) else json.dumps(data).encode()
            headers["Content-Type"] = content_type
        request = urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        if response.status not in expected:
            try:
                detail = json.loads(body).get("error", "unexpected response")
            except Exception:
                detail = body[:200].decode(errors="replace")
            raise AssertionError(f"{method} {path}: HTTP {response.status}: {detail}")
        if raw:
            return body
        parsed = json.loads(body)
        if isinstance(parsed, dict) and parsed.get("csrf"):
            self.csrf = parsed["csrf"]
        return parsed

    def upload(self, path, filename, content, fields=None, expected=(200, 201)):
        boundary = "qa-" + secrets.token_hex(16)
        parts = []
        for key, value in (fields or {}).items():
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
            )
        parts += [
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            "Content-Type: text/csv\r\n\r\n".encode(),
            content,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        return self.call(
            "POST", path, b"".join(parts), expected=expected,
            content_type="multipart/form-data; boundary=" + boundary,
        )


def php(code, value=None):
    result = subprocess.run(
        ["php", "-r", code], cwd=ROOT,
        input="" if value is None else json.dumps(value),
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def wait_ready():
    schema_code = r'''
require "src/bootstrap.php";
$need=["purchase_price_eur_cents","list_price_eur_cents","pricing_version"];
$q=db()->prepare("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products'");
$q->execute(); $have=$q->fetchAll(PDO::FETCH_COLUMN);
$rate=db()->query("SELECT rate_ppm,rate_date FROM exchange_rates WHERE base_currency='EUR' AND quote_currency='CHF'")->fetch();
$settings=[];
foreach(db()->query("SELECT name,value FROM settings WHERE name IN ('tax_bps','shipping_cents','free_shipping_cents','shipping_eur_cents','free_shipping_eur_cents')") as $r) $settings[$r["name"]]=(int)$r["value"];
echo json_encode(["ready"=>!array_diff($need,$have) && (bool)$rate,"rate"=>$rate,"settings"=>$settings]);
'''
    deadline = time.monotonic() + 90
    last = None
    while time.monotonic() < deadline:
        try:
            last = php(schema_code)
            urllib.request.urlopen(BASE + "/session", timeout=10).read()
            if last["ready"]:
                required = {"tax_bps", "shipping_cents", "free_shipping_cents",
                            "shipping_eur_cents", "free_shipping_eur_cents"}
                if required.issubset(last["settings"]):
                    return last
        except Exception as error:
            last = str(error)
        time.sleep(2)
    raise RuntimeError(f"schema/API did not become ready: {last}")


def create_user(email, password, role):
    result = subprocess.run(
        ["php", str(ROOT / "bin/qa-user.php")],
        input=json.dumps({"email": email, "password": password, "role": role, "group_id": 1}),
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)["id"]


def cleanup(fixture):
    cleanup_code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);
$pdo=db(); $pdo->beginTransaction();
try {
  $uids=array_values(array_filter(array_map("intval",$x["user_ids"]??[])));
  $pids=array_values(array_filter(array_map("intval",$x["product_ids"]??[])));
  $oids=array_values(array_filter(array_map("intval",$x["order_ids"]??[])));
  $marks=fn($a)=>implode(",",array_fill(0,count($a),"?"));
  if($oids){
    $m=$marks($oids);
    $pdo->prepare("DELETE FROM messages WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.order_id')) IN ($m)")->execute(array_map("strval",$oids));
    $returnQuery=$pdo->prepare("SELECT id FROM returns WHERE order_id IN ($m)");
    $returnQuery->execute($oids);
    $returnIds=$returnQuery->fetchAll(PDO::FETCH_COLUMN);
    if($returnIds){
      $rm=$marks($returnIds);
      $pdo->prepare("DELETE FROM return_events WHERE return_id IN ($rm)")->execute($returnIds);
      $pdo->prepare("DELETE FROM return_items WHERE return_id IN ($rm)")->execute($returnIds);
      $pdo->prepare("DELETE FROM returns WHERE id IN ($rm)")->execute($returnIds);
      $pdo->prepare("DELETE FROM audit_events WHERE entity='return' AND entity_id IN ($rm)")->execute($returnIds);
    }
    $pdo->prepare("DELETE FROM invoice_accounting WHERE order_id IN ($m)")->execute($oids);
    $pdo->prepare("DELETE FROM order_events WHERE order_id IN ($m)")->execute($oids);
    $pdo->prepare("DELETE FROM order_items WHERE order_id IN ($m)")->execute($oids);
    $pdo->prepare("DELETE FROM orders WHERE id IN ($m)")->execute($oids);
  }
  if($uids){
    $m=$marks($uids);
    $pdo->prepare("DELETE FROM cart_items WHERE user_id IN ($m)")->execute($uids);
    $pdo->prepare("DELETE FROM addresses WHERE user_id IN ($m)")->execute($uids);
  }
  if($pids){
    $m=$marks($pids);
    $pdo->prepare("DELETE FROM group_prices WHERE product_id IN ($m)")->execute($pids);
    $pdo->prepare("DELETE FROM product_models WHERE product_id IN ($m)")->execute($pids);
    $pdo->prepare("DELETE FROM images WHERE product_id IN ($m)")->execute($pids);
    $pdo->prepare("DELETE FROM products WHERE id IN ($m)")->execute($pids);
  }
  if($uids){
    $m=$marks($uids);
    $pdo->prepare("DELETE FROM audit_events WHERE user_id IN ($m)")->execute($uids);
    $pdo->prepare("DELETE FROM users WHERE id IN ($m)")->execute($uids);
  }
  if($pids){
    $m=$marks($pids);
    $pdo->prepare("DELETE FROM audit_events WHERE entity='product' AND entity_id IN ($m)")->execute($pids);
  }
  if($oids){
    $m=$marks($oids);
    $pdo->prepare("DELETE FROM audit_events WHERE entity='order' AND entity_id IN ($m)")->execute($oids);
  }
  $pdo->commit(); echo json_encode(["clean"=>true]);
} catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
'''
    php(cleanup_code, fixture)


fixture = {"user_ids": [], "product_ids": [], "order_ids": []}
unique = secrets.token_hex(7)
staff_email = f"qa-price-staff-{unique}@test.invalid"
customer_email = f"qa-price-customer-{unique}@test.invalid"
staff_password = secrets.token_urlsafe(28)
customer_password = secrets.token_urlsafe(28)

try:
    local = wait_ready()
    check(int(local["rate"]["rate_ppm"]) > 0, "stored ECB EUR/CHF rate is present")
    fixture["user_ids"].append(create_user(staff_email, staff_password, "staff"))
    fixture["user_ids"].append(create_user(customer_email, customer_password, "customer"))

    guest = Client()
    staff = Client()
    customer = Client()
    staff.call("POST", "/auth/login", {"email": staff_email, "password": staff_password})
    customer.call("POST", "/auth/login", {"email": customer_email, "password": customer_password})
    customer.call("GET", "/admin/prices", expected=(403,))
    guest.call("GET", "/admin/prices", expected=(401,))
    check(True, "pricing API is staff-only")

    catalog = staff.call("GET", "/catalog")
    category = catalog["categories"][0]
    brand = catalog["brands"][0]
    skus = [f"QA-EUR-{unique}-A", f"QA-EUR-{unique}-B"]
    products = []
    for index, sku in enumerate(skus):
        payload = {
            "sku": sku, "name": f"QA native currency {unique} {index}",
            "description": "Dedicated synthetic currency/pricing HTTP fixture",
            "category_id": category["id"], "brand_id": brand["id"], "quality": "QA",
            "stock": 8, "purchase_price_eur_cents": 500 + index,
            "list_price_eur_cents": 1000 + index * 200, "minimum_quantity": 1,
            "featured": False,
            "group_prices": [{"group_id": 1, "price_eur_cents": 900 + index * 200}],
        }
        product = staff.call("POST", "/admin/products", payload)["product"]
        fixture["product_ids"].append(product["id"])
        products.append(product)

    listing = staff.call("GET", f"/admin/prices?q={urllib.parse.quote('QA native currency ' + unique)}&limit=500")
    check(listing["total"] == 2 and listing["currency"] == "EUR" and listing["exchange_rate"],
          "staff EUR list filters and exchange metadata")
    resolved = staff.call("POST", "/admin/prices/resolve", {"skus": skus + ["UNKNOWN-" + unique]})
    check([p["sku"] for p in resolved["products"]] == skus and resolved["unknown_skus"] == ["UNKNOWN-" + unique],
          "SKU resolve preserves requested order and unknowns")
    p0, p1 = resolved["products"]

    public = guest.call("GET", f"/products/{products[0]['id']}")["product"]
    check(public["price_cents"] is None and all(key not in public for key in (
        "purchase_price_eur_cents", "list_price_eur_cents", "group_prices", "list_price_cents"
    )), "guest response masks costs and tariffs")

    staff.call("POST", "/admin/prices/bulk", {"rows": [
        {"id": p0["id"], "version": p0["pricing_version"], "list_price_eur_cents": 1700},
        {"id": p1["id"], "version": p1["pricing_version"], "purchase_price_eur_cents": -1},
    ]}, expected=(422,))
    unchanged = staff.call("POST", "/admin/prices/resolve", {"skus": skus})["products"]
    check(unchanged[0]["list_price_eur_cents"] == 1000, "invalid bulk row rolls back every row")
    staff.call("POST", "/admin/prices/bulk", {"rows": [
        {"id": p0["id"], "version": p0["pricing_version"] + 99, "list_price_eur_cents": 1700}
    ]}, expected=(409,))
    check(True, "direct bulk rejects optimistic conflict")

    cleared = staff.call("POST", "/admin/prices/bulk", {"rows": [
        {"id": unchanged[0]["id"], "version": unchanged[0]["pricing_version"],
         "purchase_price_eur_cents": None,
         "group_prices": [{"group_id": 1, "price_eur_cents": None}]}
    ]})["products"][0]
    customer.call("POST", "/currency", {"country": "NL"})
    customer_product = customer.call("GET", f"/products/{cleared['id']}")["product"]
    check(cleared["purchase_price_eur_cents"] is None and not cleared["group_prices"]
          and customer_product["price_cents"] == cleared["list_price_eur_cents"],
          "cost clear and absent group override inherit base EUR")

    preview = staff.call("POST", "/admin/prices/adjust/preview", {
        "filters": {"q": "QA native currency " + unique, "status": "active"},
        "field": "list_price_eur_cents", "operation": "add", "value": 100,
    })
    check(preview["count"] == 2 and len(preview["samples"]) == 2 and preview["token"],
          "whole-filter adjustment preview selects exact fixtures")
    applied = staff.call("POST", "/admin/prices/adjust/apply", {"token": preview["token"]})
    check(applied["updated"] == 2, "whole-filter adjustment applies atomically")
    staff.call("POST", "/admin/prices/adjust/apply", {"token": preview["token"]}, expected=(409,))
    check(True, "adjustment token is single-use")

    current = staff.call("GET", f"/admin/products/{products[0]['id']}")["product"]
    edited = staff.call("PATCH", f"/admin/products/{current['id']}", {
        "pricing_version": current["pricing_version"],
        "list_price_eur_cents": current["list_price_eur_cents"] + 10,
    })["product"]
    staff.call("PATCH", f"/admin/products/{current['id']}", {
        "pricing_version": current["pricing_version"], "list_price_eur_cents": 9999,
    }, expected=(409,))
    check(edited["pricing_version"] == current["pricing_version"] + 1,
          "normal product edit increments version and rejects stale writer")

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["sku", "name", "category", "brand", "quality", "stock", "price"])
    writer.writerow([skus[0], products[0]["name"], category["name"], brand["name"], "QA", 8, "15.25"])
    csv_bytes = output.getvalue().encode()
    import_preview = staff.upload("/admin/import", "fixture.csv", csv_bytes, {"preview": "1"})
    check(import_preview["pricing_versions"][skus[0]] == edited["pricing_version"],
          "CSV preview snapshots existing pricing version")
    intervening = staff.call("PATCH", f"/admin/products/{edited['id']}", {
        "pricing_version": edited["pricing_version"],
        "list_price_eur_cents": edited["list_price_eur_cents"] + 1,
    })["product"]
    staff.upload("/admin/import", "fixture.csv", csv_bytes, {
        "preview": "0", "pricing_versions": json.dumps(import_preview["pricing_versions"])
    }, expected=(409,))
    after_stale_import = staff.call("GET", f"/admin/products/{products[0]['id']}")["product"]
    check(after_stale_import["list_price_eur_cents"] == intervening["list_price_eur_cents"],
          "stale CSV confirmation rejects atomically")
    fresh_import_preview = staff.upload("/admin/import", "fixture.csv", csv_bytes, {"preview": "1"})
    before_import = intervening["pricing_version"]
    imported = staff.upload("/admin/import", "fixture.csv", csv_bytes, {
        "preview": "0", "pricing_versions": json.dumps(fresh_import_preview["pricing_versions"])
    })
    after_import = staff.call("GET", f"/admin/products/{products[0]['id']}")["product"]
    check(imported["updated"] == 1 and after_import["list_price_eur_cents"] == 1525
          and after_import["pricing_version"] == before_import + 1,
          "CSV import writes canonical EUR and increments pricing version")

    # Make the second fixture inherit its base so base-price drift is observable at checkout.
    second = staff.call("GET", f"/admin/products/{products[1]['id']}")["product"]
    staff.call("POST", "/admin/prices/bulk", {"rows": [{
        "id": second["id"], "version": second["pricing_version"],
        "group_prices": [{"group_id": 1, "price_eur_cents": None}],
    }]})

    nl = customer.call("POST", "/addresses", {
        "label": "QA NL", "name": "QA fixture", "company": "", "line1": "Teststraat 1",
        "line2": "", "postal_code": "1011AA", "city": "Amsterdam", "country": "NL",
        "is_default": False,
    })["address"]
    ch = customer.call("GET", "/addresses")["addresses"][0]
    if ch["country"] != "CH":
        ch = next(address for address in customer.call("GET", "/addresses")["addresses"] if address["country"] == "CH")

    settings = local["settings"]
    tax_bps = settings["tax_bps"]
    customer.call("DELETE", "/cart")
    customer.call("POST", "/cart", {"product_id": products[0]["id"], "quantity": 1})
    eur_quote = customer.call("POST", "/checkout/quote", {"address_id": nl["id"]})
    eur_shipping = 0 if eur_quote["subtotal_cents"] >= settings["free_shipping_eur_cents"] else settings["shipping_eur_cents"]
    eur_tax = ((eur_quote["subtotal_cents"] + eur_shipping) * tax_bps + 5000) // 10000
    check(eur_quote["country"] == "NL" and eur_quote["currency"] == "EUR"
          and eur_quote["shipping_cents"] == eur_shipping and eur_quote["tax_cents"] == eur_tax,
          "NL quote uses canonical EUR and explicit EUR shipping")
    eur_order = customer.call("POST", "/checkout", {
        "address_id": nl["id"], "quote_token": eur_quote["quote_token"],
        "payment_method": "test_invoice", "notes": "synthetic EUR QA",
        "idempotency_key": "qa-eur-" + unique,
    })["order"]
    fixture["order_ids"].append(eur_order["id"])
    check(eur_order["currency"] == "EUR", "NL checkout stores EUR")

    customer.call("POST", "/cart", {"product_id": products[1]["id"], "quantity": 1})
    ch_quote = customer.call("POST", "/checkout/quote", {"address_id": ch["id"]})
    rate = int(local["rate"]["rate_ppm"])
    eur_unit = staff.call("GET", f"/admin/products/{products[1]['id']}")["product"]["list_price_eur_cents"]
    expected_chf_unit = (eur_unit * rate + 500000) // 1000000
    ch_shipping = 0 if ch_quote["subtotal_cents"] >= settings["free_shipping_cents"] else settings["shipping_cents"]
    ch_tax = ((ch_quote["subtotal_cents"] + ch_shipping) * tax_bps + 5000) // 10000
    check(ch_quote["country"] == "CH" and ch_quote["currency"] == "CHF"
          and ch_quote["items"][0]["price_cents"] == expected_chf_unit
          and ch_quote["exchange_rate"]["rate_ppm"] == rate
          and ch_quote["shipping_cents"] == ch_shipping and ch_quote["tax_cents"] == ch_tax,
          "CH quote converts at stored ECB rate with CHF shipping")

    drift_product = staff.call("GET", f"/admin/products/{products[1]['id']}")["product"]
    stock_before = drift_product["stock"]
    staff.call("POST", "/admin/prices/bulk", {"rows": [{
        "id": drift_product["id"], "version": drift_product["pricing_version"],
        "list_price_eur_cents": drift_product["list_price_eur_cents"] + 1,
    }]})
    customer.call("POST", "/checkout", {
        "address_id": ch["id"], "quote_token": ch_quote["quote_token"],
        "payment_method": "test_invoice", "notes": "must reject",
        "idempotency_key": "qa-drift-" + unique,
    }, expected=(409,))
    after_drift = staff.call("GET", f"/admin/products/{products[1]['id']}")["product"]
    own_orders = [o for o in staff.call("GET", "/admin/orders")["orders"] if o.get("customer_email") == customer_email]
    check(after_drift["stock"] == stock_before and len(own_orders) == 1,
          "quote drift rejection changes neither stock nor order count")

    fresh_ch = customer.call("POST", "/checkout/quote", {"address_id": ch["id"]})
    ch_order = customer.call("POST", "/checkout", {
        "address_id": ch["id"], "quote_token": fresh_ch["quote_token"],
        "payment_method": "test_invoice", "notes": "synthetic CHF QA",
        "idempotency_key": "qa-chf-" + unique,
    })["order"]
    fixture["order_ids"].append(ch_order["id"])
    detail_eur = customer.call("GET", f"/orders/{eur_order['id']}")
    detail_chf = customer.call("GET", f"/orders/{ch_order['id']}")
    pdf_eur = customer.call("GET", f"/documents/{eur_order['id']}/invoice.pdf", raw=True)
    pdf_chf = customer.call("GET", f"/documents/{ch_order['id']}/invoice.pdf", raw=True)
    check(detail_eur["order"]["currency"] == "EUR" and detail_chf["order"]["currency"] == "CHF"
          and pdf_eur.startswith(b"%PDF-") and pdf_chf.startswith(b"%PDF-"),
          "order detail and PDFs preserve stored order currency")

    staff.call("PATCH", f"/admin/orders/{ch_order['id']}", {
        "status": "shipped", "tracking": "QA-CURRENCY", "note": "synthetic return currency check",
    })
    return_created = customer.call("POST", "/returns", {
        "order_id": ch_order["id"], "reason": "synthetic currency display check",
        "items": [{"order_item_id": detail_chf["items"][0]["id"], "quantity": 1}],
    })["return"]
    customer_returns = customer.call("GET", "/returns")["returns"]
    customer_return = customer.call("GET", f"/returns/{return_created['id']}")["return"]
    admin_return = staff.call("GET", f"/admin/returns/{return_created['id']}")["return"]
    admin_returns = staff.call("GET", "/admin/returns")["returns"]
    check(next(r for r in customer_returns if r["id"] == return_created["id"])["currency"] == "CHF"
          and customer_return["currency"] == "CHF" and admin_return["currency"] == "CHF"
          and next(r for r in admin_returns if r["id"] == return_created["id"])["currency"] == "CHF",
          "customer and admin return list/detail inherit order currency")

    dashboard = staff.call("GET", "/admin/dashboard")
    check(isinstance(dashboard["stats"]["revenue_by_currency"], list)
          and "revenue_cents" not in dashboard["stats"],
          "dashboard never combines EUR and CHF revenue")

    print(json.dumps({
        "passed": len(checks), "runtime_seconds": round(time.monotonic() - started, 3),
        "checks": checks,
    }, indent=2))
finally:
    cleanup(fixture)