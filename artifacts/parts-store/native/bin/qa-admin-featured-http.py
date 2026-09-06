"""Focused featured-product count checks against the isolated native test shop."""
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
        self.csrf = self.call("GET", "/session")["csrf"]

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
        result = json.loads(response.read())
        if response.status not in expected:
            raise AssertionError(f"{method} {path}: {response.status}: {result.get('error', 'Unexpected response')}")
        if "csrf" in result:
            self.csrf = result["csrf"]
        return result


unique = secrets.token_hex(6)
email = f"qa-featured-{unique}@test.invalid"
password = secrets.token_urlsafe(32)
user_fixture = {"email": email, "password": password, "role": "staff", "group_id": 1}
subprocess.run(
    ["php", str(ROOT / "bin/qa-user.php")],
    input=json.dumps(user_fixture),
    text=True,
    capture_output=True,
    check=True,
)

staff = Client()
product_ids = []
try:
    staff.call("POST", "/auth/login", {"email": email, "password": password})
    baseline = staff.call("GET", "/admin/products?limit=1")["featured_total"]
    base_payload = {
        "name": "QA featured-count fixture",
        "description": "Synthetic isolated regression fixture",
        "quality": "Test",
        "stock": 0,
        "list_price_cents": 1,
        "minimum_quantity": 1,
        "featured": False,
    }
    active = staff.call("POST", "/admin/products", {
        **base_payload, "sku": f"QA-FEATURED-A-{unique}",
    })["product"]
    product_ids.append(active["id"])
    archived = staff.call("POST", "/admin/products", {
        **base_payload, "sku": f"QA-FEATURED-B-{unique}", "featured": True,
    })["product"]
    product_ids.append(archived["id"])
    staff.call("DELETE", f"/admin/products/{archived['id']}")

    filtered = staff.call(
        "GET",
        f"/admin/products?q=definitely-no-match-{unique}&status=active&page=999&limit=1",
    )
    assert filtered["total"] == 0
    assert filtered["featured_total"] == baseline + 1

    staff.call("PATCH", f"/admin/products/{active['id']}", {"featured": True})
    assert staff.call("GET", "/admin/products?status=archived&limit=1")["featured_total"] == baseline + 2

    staff.call("PATCH", f"/admin/products/{active['id']}", {"featured": False})
    assert staff.call("GET", "/admin/products?page=999&limit=1")["featured_total"] == baseline + 1

    staff.call("PATCH", f"/admin/products/{archived['id']}", {"featured": False})
    assert staff.call("GET", "/admin/products?limit=1")["featured_total"] == baseline
    print("PASS: global featured_total includes archived products, ignores filters/pages, and follows toggles on and off.")
finally:
    for product_id in product_ids:
        staff.call("PATCH", f"/admin/products/{product_id}", {"featured": False})
        staff.call("DELETE", f"/admin/products/{product_id}")
    subprocess.run(
        ["php", str(ROOT / "bin/qa-user.php")],
        input=json.dumps({**user_fixture, "action": "block"}),
        text=True,
        capture_output=True,
        check=True,
    )