#!/usr/bin/env python3
"""Read-only HTTP assertions for housing subtype API behavior."""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010/test-shop/api").rstrip("/")


def get(path, params=None, expected=200):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            status, payload = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, payload = error.code, json.load(error)
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert status == expected, (url, status, payload)
    return payload, elapsed_ms


catalog, catalog_ms = get("/catalog")
types = {item["id"]: item for item in catalog["part_types"]}
assert set(types) == {
    "frame-chassis", "rear-glass", "rear-cover", "housing-with-parts",
    "complete-housing", "other-housing"
}
assert types["housing-with-parts"]["count"] > 0

alias_groups = {
    "rear-glass": ["back cover glass", "back glass", "rear glass", "achter glas", "achterglas"],
    "frame-chassis": ["frame", "mid frame", "middle frame", "chassis"],
    "rear-cover": ["back cover", "rear cover", "battery cover", "achtercover", "batterijcover"],
    "housing-with-parts": [
        "behuizing met onderdelen", "housing with small components",
        "housing with parts", "voorgemonteerd", "pre installed",
    ],
    "complete-housing": ["complete housing", "housing complete", "complete behuizing", "full housing"],
}
for part, aliases in alias_groups.items():
    for alias in aliases:
        result, _ = get("/products", {"q": alias, "limit": 100})
        assert result["total"] == types[part]["count"], (part, alias, result["total"])
        assert all(p["part_type"]["id"] == part for p in result["products"])

glass, glass_ms = get("/products", {"q": "iphone13 achterglas", "limit": 100})
assert glass["total"] > 0
assert all(p["part_type"]["id"] == "rear-glass" for p in glass["products"])
assert all(p["price_cents"] is None and "list_price_cents" not in p for p in glass["products"])

frames, frame_ms = get("/products", {"q": "frame", "limit": 100})
assert frames["total"] > 0
assert all(p["part_type"]["id"] == "frame-chassis" for p in frames["products"])

with_parts, _ = get("/products", {"q": "behuizing met onderdelen", "limit": 100})
assert with_parts["total"] > 0
assert all(p["part_type"]["id"] == "housing-with-parts" for p in with_parts["products"])

complete, _ = get("/products", {"q": "complete behuizing"})
assert complete["total"] == types["complete-housing"]["count"]
invalid, _ = get("/products", {"part": "invalid"}, expected=400)
assert "error" in invalid

housing_id = types["rear-glass"]["category_id"]
unrelated = next(c["id"] for c in catalog["categories"] if c["id"] != housing_id)
empty, _ = get("/products", {"category": unrelated, "part": "rear-glass"})
assert empty["total"] == 0

filtered_catalog, _ = get("/catalog", {"part": "rear-glass"})
assert filtered_catalog["total"] == types["rear-glass"]["count"]
assert {p["id"]: p["count"] for p in filtered_catalog["part_types"]} == {
    p["id"]: p["count"] for p in catalog["part_types"]
}
assert any(c["id"] != housing_id and c["count"] > 0 for c in filtered_catalog["categories"])

print(json.dumps({
    "counts": {key: value["count"] for key, value in types.items()},
    "search_totals": {"iphone13_achterglas": glass["total"], "frame": frames["total"]},
    "request_ms": {"catalog": round(catalog_ms, 2), "glass": round(glass_ms, 2), "frame": round(frame_ms, 2)},
}, ensure_ascii=False, indent=2))