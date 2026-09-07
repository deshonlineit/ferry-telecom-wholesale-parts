"""Read-only discovery regression checks for the isolated catalog."""
import http.cookiejar
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


def read(path, client=None, data=None, csrf=""):
    request = urllib.request.Request(
        BASE + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={"Content-Type": "application/json", "X-CSRF-Token": csrf},
    )
    with (client or urllib.request.build_opener()).open(request, timeout=20) as response:
        return json.load(response)


def query(params, client=None):
    return read("/products?" + urllib.parse.urlencode(params), client)


catalog = read("/catalog")
screens = next(c for c in catalog["categories"] if c["slug"] == "screens")
batteries = next(c for c in catalog["categories"] if c["slug"] == "batteries")
check(all("image_url" in c and isinstance(c["count"], int) for c in catalog["categories"]), "real category counts and image fields")
check(all("count" in m and "brand_id" in m for m in catalog["models"]), "brand-scoped model counts")
check(any(0 < m["count"] < 5 for m in catalog["models"]), "small compatible-model groups are retained")
result = query({"q": "iphone13 scherm", "limit": 100})
check(result["total"] > 0 and all(p["category_id"] == screens["id"] for p in result["products"]), "Dutch screen search does not confuse bescherming with scherm")
check(all(p["price_cents"] is None and "list_price_cents" not in p for p in result["products"]), "guest search price privacy")
result = query({"q": "Samsung S22 batterij"})
check(result["total"] > 0 and all(p["category_id"] == batteries["id"] for p in result["products"]), "combined brand, compact model and Dutch battery query")
compact = query({"q": "iphone13"})["total"]
spaced = query({"q": "iPhone 13"})["total"]
check(compact > 0 and spaced == compact, "spaced and compact model phrases produce equivalent results")
sku = query({"q": "priph01"})
check(sku["products"][0]["sku"].upper() == "PRIPH01", "case-insensitive exact SKU ranked first")
smart_model = read("/search/products?" + urllib.parse.urlencode({"q": "14 oled", "limit": 12}))
check(smart_model["products"][0]["sku"].upper() == "PRIPH16", "smart search ranks the exact model and part type first")
check(
    all("a33" not in p["name"].lower() for p in smart_model["products"]),
    "standalone model numbers never match digits buried in unrelated supplier codes",
)
check(smart_model["intent"]["kind"] == "model" and "14" in smart_model["intent"]["label"], "smart search explains the recognized model")
plain_screen = read("/search/products?" + urllib.parse.urlencode({"q": "14 screen", "limit": 12}))
check(
    plain_screen["products"]
    and plain_screen["intent"]["kind"] == "model_part"
    and plain_screen["intent"]["label"].lower().startswith("iphone 14"),
    "omitted device brand still resolves an unambiguous common model and part",
)
for typo in ["14 scren", "iphone 14 screeen", "iphnoe 14 screen"]:
    corrected = read("/search/products?" + urllib.parse.urlencode({"q": typo, "limit": 12}))
    check(
        corrected["products"]
        and corrected["intent"]["kind"] == "model_part"
        and corrected["intent"]["label"].lower().startswith("iphone 14"),
        "clear spelling errors still resolve model and part intent: " + typo,
    )
samsung_typo = read("/search/products?" + urllib.parse.urlencode({"q": "samsng s22 batery", "limit": 12}))
check(
    samsung_typo["products"]
    and all("s22" in p["name"].lower() and "battery" in p["name"].lower() for p in samsung_typo["products"]),
    "multiple clear spelling errors resolve without losing the explicit device brand",
)
mixed_parts = read("/search/products?" + urllib.parse.urlencode({"q": "pulled 15 pro", "limit": 12}))
check(len(mixed_parts["part_options"]) > 1, "smart search offers real part-type routes for mixed device results")
check(
    all(option["count"] > 0 and option["image_url"].startswith("/test-shop/media/products/") for option in mixed_parts["part_options"]),
    "part-type routes carry real result counts and local product imagery",
)
black_housing = read("/search/products?" + urllib.parse.urlencode({"q": "housing 14 zwart", "limit": 20}))
check(black_housing["products"], "Dutch colour terms find products named in another supported language")
check(
    black_housing["products"][0]["sku"].upper().startswith("IPH14")
    and black_housing["intent"]["label"].lower().startswith("iphone 14"),
    "an ambiguous bare model number gives the common iPhone model priority unless another brand is named",
)
check(
    all(any(colour in p["name"].lower() for colour in ["black", "schwarz", "zwart"]) for p in black_housing["products"]),
    "multilingual colour aliases keep every smart-search result on the requested colour",
)
catalogue_black = query({"q": "housing iphone 14 zwart", "limit": 100})
check(
    catalogue_black["total"] > 0
    and all("iphone 14" in p["name"].lower() and any(c in p["name"].lower() for c in ["black", "schwarz", "zwart"]) for p in catalogue_black["products"]),
    "the full catalogue shares smart search colour aliases and strict model-number semantics",
)
natural_screen = read("/search/products?" + urllib.parse.urlencode({"q": "ik wil een iPhone 13 scherm", "limit": 20}))
check(
    natural_screen["products"]
    and natural_screen["intent"]["kind"] == "model_part"
    and natural_screen["intent"]["label"].lower().startswith("iphone 13")
    and "display" in natural_screen["intent"]["label"].lower()
    and all("iphone 13" in p["name"].lower() for p in natural_screen["products"]),
    "natural Dutch requests are reduced to their model and part intent",
)
natural_battery = read("/search/products?" + urllib.parse.urlencode({"q": "hebben jullie een batterij nodig voor Samsung S22", "limit": 20}))
check(
    natural_battery["products"]
    and all("s22" in p["name"].lower() and "battery" in p["name"].lower() for p in natural_battery["products"]),
    "conversational Dutch battery requests ignore filler words",
)
english_screen = read("/search/products?" + urllib.parse.urlencode({"q": "please show me an iPhone 13 screen", "limit": 20}))
german_screen = read("/search/products?" + urllib.parse.urlencode({"q": "ich brauche ein iPhone 13 Display", "limit": 20}))
check(
    {p["sku"] for p in english_screen["products"]} == {p["sku"] for p in natural_screen["products"]}
    == {p["sku"] for p in german_screen["products"]},
    "Dutch, English and German conversational requests resolve to the same products",
)
check(query({"q": "qazzz-not-a-real-part-938277"})["total"] == 0, "honest empty results")
check(query({"stock": "out_of_stock", "limit": 100})["products"][0]["stock"] == 0, "optional out-of-stock filter")
check(all(p["featured"] for p in query({"featured": 1, "limit": 100})["products"]), "featured results actually featured")
last = query({"page": 99999})
check(last["page"] == last["pages"] and len(last["products"]) > 0, "out-of-range page clamped")
model = next(m for m in catalog["models"] if m["name"].lower() == "iphone 13" and m["count"])
filtered = query({"brand": model["brand_id"], "model": model["id"], "category": screens["id"]})
check(filtered["total"] > 0, "combined category, brand and exact model")
for product in filtered["products"][:3]:
    detail = read("/products/" + str(product["id"]))
    check(any(m["id"] == model["id"] for m in detail["models"]), "filter follows actual many-to-many compatibility")
suggestions = read("/search/suggestions?" + urllib.parse.urlencode({"q": "iPhone 13 scherm"}))
check(0 < len(suggestions["products"]) <= 6, "bounded actual product suggestions")
check(suggestions["models"] and all("13" in m["name"] for m in suggestions["models"]), "model suggestions respect all meaningful query tokens")
check(suggestions["categories"] and suggestions["categories"][0]["slug"] == "screens", "category synonym suggestions")
check(all(p["price_cents"] is None and "list_price_cents" not in p for p in suggestions["products"]), "suggestions preserve guest price privacy")
check(len(read("/search/suggestions?q=a")["products"]) > 0, "a single character already returns suggestions")
check(read("/search/suggestions?" + urllib.parse.urlencode({"q": "  "}))["products"] == [], "an empty search box returns no suggestions")
check("products" in query({"q": "' OR 1=1 -- %_"}), "SQL-like input safely treated as search text")

prices = []
for persona in ["customer", "partner"]:
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    session = read("/session", client)
    read("/auth/demo", client, {"persona": persona}, session["csrf"])
    suggestions = read("/search/suggestions?q=PRIPH01", client)
    price = suggestions["products"][0]["price_cents"]
    check(isinstance(price, int) and "list_price_cents" not in suggestions["products"][0], persona + " suggestions only show assigned prices")
    prices.append(price)
    for sort, reverse in [("price_asc", False), ("price_desc", True)]:
        products = query({"q": "iphone13", "sort": sort, "limit": 30}, client)["products"]
        values = [p["price_cents"] for p in products]
        check(values == sorted(values, reverse=reverse), persona + " " + sort + " uses own group")
check(prices[0] != prices[1], "customer and partner suggestions have distinct assigned prices")
print(json.dumps({"passed": len(checks), "checks": checks}, indent=2))