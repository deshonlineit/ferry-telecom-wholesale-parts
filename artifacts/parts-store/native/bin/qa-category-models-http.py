"""Read-only checks for category -> model selection; no customer or stock writes."""
import json
import os
import urllib.parse
import urllib.request

BASE = "https://" + os.environ["REPLIT_DEV_DOMAIN"] + "/test-shop/api"
checks = []


def read(route, params):
    with urllib.request.urlopen(BASE + route + "?" + urllib.parse.urlencode(params), timeout=30) as response:
        return json.load(response)


baseline = read("/catalog", {})
screen = next(c for c in baseline["categories"] if c["slug"] == "screens")
apple = next(b for b in baseline["brands"] if b["name"] == "Apple")
models = [m for m in baseline["models"] if m["name"] in ["iPhone 13", "iPhone 13 Mini", "iPhone 13 Pro"]]
assert len(models) == 3
for filters in [
    {"category": screen["id"]},
    {"category": screen["id"], "brand": apple["id"], "stock": "in_stock"},
    {"category": screen["id"], "q": "iphone lcd"},
]:
    facets = read("/catalog", filters)
    for model in models:
        count = next(m["count"] for m in facets["models"] if m["id"] == model["id"])
        result = read("/products", {**filters, "model": model["id"], "limit": 5})
        assert count == result["total"], (filters, model["name"], count, result["total"])
        assert all(p["category_id"] == screen["id"] for p in result["products"])
        assert all(p["price_cents"] is None for p in result["products"])
        checks.append({"filters": filters, "model": model["name"], "matching_products": count})
assert any(c["matching_products"] > 0 for c in checks)
empty = read("/catalog", {"category": screen["id"], "q": "qa-no-such-model-4928374"})
assert not any(m["count"] for m in empty["models"])
print(json.dumps({"passed": len(checks) + 1, "checks": checks, "empty_context": "no invented models"}, indent=2))