"""End-to-end checks for draft, visible and archived product states."""
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


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = self.call("GET", "/session")[1]["csrf"]

    def call(self, method, path, data=None, expected=(200, 201)):
        headers = {}
        if method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        payload = None if data is None else json.dumps(data).encode()
        if payload is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        result = json.loads(raw) if raw else {}
        if response.status not in expected:
            raise AssertionError(f"{method} {path}: {response.status}: {result}")
        if "csrf" in result:
            self.csrf = result["csrf"]
        return response.status, result


token = secrets.token_hex(6)
password = secrets.token_urlsafe(30)
staff_fixture = {
    "email": f"qa-publication-staff-{token}@test.invalid",
    "password": password,
    "role": "staff",
    "group_id": 1,
}
customer_fixture = {
    "email": f"qa-publication-customer-{token}@test.invalid",
    "password": password,
    "role": "customer",
    "group_id": 1,
}

for fixture in (staff_fixture, customer_fixture):
    subprocess.run(
        ["php", str(ROOT / "bin/qa-user.php")],
        input=json.dumps(fixture),
        text=True,
        capture_output=True,
        check=True,
    )

staff = Client()
customer = Client()
product_id = None
try:
    staff.call("POST", "/auth/login", {"email": staff_fixture["email"], "password": password})
    customer.call("POST", "/auth/login", {"email": customer_fixture["email"], "password": password})

    _, catalog = staff.call("GET", "/catalog")
    category_id = catalog["categories"][0]["id"]
    brand_id = catalog["brands"][0]["id"]
    _, customers = staff.call("GET", "/admin/customers")
    groups = customers["groups"]
    assert groups, "At least one customer group is required"

    partial_prices = [
        {"group_id": group["id"], "price_eur_cents": 1250}
        for group in groups[:-1]
    ]
    _, created = staff.call("POST", "/admin/products", {
        "sku": f"QA-PUBLICATION-{token}",
        "name": "QA publication fixture",
        "description": "Synthetic isolated status check",
        "category_id": category_id,
        "brand_id": brand_id,
        "quality": "Test",
        "stock": 10,
        "minimum_quantity": 1,
        "publication_status": "draft",
        "group_prices": partial_prices,
    })
    product_id = created["product"]["id"]
    assert created["product"]["publication_status"] == "draft"

    customer.call("GET", f"/products/{product_id}", expected=(404,))

    status, rejected = staff.call(
        "PATCH",
        f"/admin/products/{product_id}",
        {"publication_status": "visible"},
        expected=(422,),
    )
    assert status == 422 and "every customer group" in rejected.get("error", "")

    all_prices = [
        {"group_id": group["id"], "price_eur_cents": 1250 + index}
        for index, group in enumerate(groups)
    ]
    _, published = staff.call("PATCH", f"/admin/products/{product_id}", {
        "publication_status": "visible",
        "group_prices": all_prices,
        "pricing_version": created["product"]["pricing_version"],
    })
    assert published["product"]["publication_status"] == "visible"
    _, public_product = customer.call("GET", f"/products/{product_id}")
    assert public_product["product"]["id"] == product_id
    assert public_product["product"]["price_cents"] is not None

    staff.call("DELETE", f"/admin/products/{product_id}")
    _, archived = staff.call("GET", f"/admin/products?q=QA-PUBLICATION-{token}&status=archived")
    assert [product["id"] for product in archived["products"]] == [product_id]

    _, restored = staff.call("POST", f"/admin/products/{product_id}/restore")
    assert restored["product"]["publication_status"] == "draft"
    customer.call("GET", f"/products/{product_id}", expected=(404,))

    _, filtered = staff.call("GET", f"/admin/products?q=QA-PUBLICATION-{token}&status=draft")
    assert [product["id"] for product in filtered["products"]] == [product_id]

    staff.call("DELETE", f"/admin/products/{product_id}")
    print("PASS: draft is private, incomplete publishing is blocked, visible is public, and restore returns to draft.")
finally:
    if product_id is not None:
        try:
            staff.call("DELETE", f"/admin/products/{product_id}")
        except Exception:
            pass
    for fixture in (staff_fixture, customer_fixture):
        subprocess.run(
            ["php", str(ROOT / "bin/qa-user.php")],
            input=json.dumps({**fixture, "action": "block"}),
            text=True,
            capture_output=True,
            check=True,
        )