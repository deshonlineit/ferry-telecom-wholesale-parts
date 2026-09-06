"""Read-only contextual facet checks for the isolated native catalog."""
import json
import os
import urllib.parse
import urllib.request

BASE = "https://" + os.environ["REPLIT_DEV_DOMAIN"] + "/test-shop/api"
checks = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def read(path, params=None):
    if params is not None:
        path += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(BASE + path, timeout=20) as response:
        return json.load(response)


def products(params):
    return read("/products", {**params, "limit": 1})


baseline = read("/catalog")
ignored = read("/catalog", {"page": 9, "sort": "name"})
check(baseline == ignored, "page and sort do not alter the unfiltered catalog")
check(
    all(set(c) == {"id", "name", "slug", "count", "image_url"} for c in baseline["categories"]),
    "category response shape is unchanged",
)
check(
    all(set(b) == {"id", "name", "count"} for b in baseline["brands"])
    and all(set(m) == {"id", "brand_id", "name", "count"} for m in baseline["models"]),
    "brand and model response shapes are unchanged",
)

screens = next(c for c in baseline["categories"] if c["slug"] == "screens")
apple = next(b for b in baseline["brands"] if b["name"].lower() == "apple")
context = read("/catalog", {"category": screens["id"], "brand": apple["id"]})
check(len(context["categories"]) == len(baseline["categories"]), "all categories remain in context")
check(len(context["brands"]) == len(baseline["brands"]), "all brands remain in context")
check(len(context["models"]) == len(baseline["models"]), "all models remain in context")
for model in context["models"]:
    actual = products(
        {"category": screens["id"], "brand": apple["id"], "model": model["id"]}
    )["total"]
    check(model["count"] == actual, "screen and Apple model count " + model["name"])

filters = {
    "category": screens["id"],
    "brand": apple["id"],
    "stock": "in_stock",
    "featured": 1,
}
facets = read("/catalog", filters)
for category in facets["categories"]:
    actual = products({**filters, "category": category["id"]})["total"]
    check(category["count"] == actual, "category selfless count " + category["name"])

model = next(m for m in baseline["models"] if m["brand_id"] == apple["id"] and m["count"])
brand_context = read(
    "/catalog", {"category": screens["id"], "brand": apple["id"], "model": model["id"]}
)
for brand in brand_context["brands"]:
    actual = products({"category": screens["id"], "brand": brand["id"]})["total"]
    check(brand["count"] == actual, "brand count ignores brand and model " + brand["name"])

quality_base = {
    "q": "scherm",
    "stock": "in_stock",
    "category": screens["id"],
}
quality_options = read("/catalog", quality_base)["qualities"]
check(bool(quality_options), "combined query has real quality options")
quality = quality_options[0]
combined = {
    **quality_base,
    "quality": quality,
}
combined_facets = read("/catalog", combined)
check(combined_facets["total"] == products(combined)["total"], "combined query stock and quality total")
check(combined_facets["total"] > 0, "combined query stock and quality is non-vacuous")
quality_context = read("/catalog", {**combined, "quality": "definitely-impossible-quality"})
expected_qualities = read("/catalog", {k: v for k, v in combined.items() if k != "quality"})[
    "qualities"
]
check(quality_context["qualities"] == expected_qualities, "quality options ignore selected quality")

impossible = read(
    "/catalog",
    {"category": screens["id"], "brand": apple["id"], "q": "qazzz-938277"},
)
check(impossible["total"] == 0, "impossible combination has zero total")
check(
    len(impossible["categories"]) == len(baseline["categories"])
    and len(impossible["brands"]) == len(baseline["brands"])
    and len(impossible["models"]) == len(baseline["models"]),
    "impossible combination retains all metadata",
)
check(
    all(item["count"] == 0 for kind in ("categories", "brands", "models") for item in impossible[kind]),
    "impossible combination exposes zero counts",
)
check(any(0 < m["count"] < 5 for m in baseline["models"]), "small model groups remain present")
check(
    "price_cents" not in json.dumps(combined_facets)
    and "list_price_cents" not in json.dumps(combined_facets),
    "catalog metadata discloses no customer prices",
)

print(json.dumps({"passed": len(checks), "checks": checks}, indent=2))