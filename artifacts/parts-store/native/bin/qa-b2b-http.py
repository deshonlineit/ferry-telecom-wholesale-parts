#!/usr/bin/env python3
"""Isolated HTTP regressions for native B2B search and additive cart writes."""

import concurrent.futures
import http.cookiejar
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
checks = []


def check(value, name):
    if not value:
        raise AssertionError(name)
    checks.append(name)


def php(code, value=None):
    result = subprocess.run(
        ["php", "-r", code], cwd=ROOT,
        input="" if value is None else json.dumps(value),
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = self.call("GET", "/session")["csrf"]

    def call(self, method, path, data=None, expected=(200, 201)):
        headers = {}
        payload = None
        if method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        if data is not None:
            payload = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        if response.status not in expected:
            detail = body[:300].decode(errors="replace")
            try:
                detail = json.loads(body).get("error", detail)
            except Exception:
                pass
            raise AssertionError(f"{method} {path}: HTTP {response.status}: {detail}")
        parsed = json.loads(body)
        if isinstance(parsed, dict) and parsed.get("csrf"):
            self.csrf = parsed["csrf"]
        return parsed

    def login(self, email, password):
        return self.call("POST", "/auth/login", {"email": email, "password": password})


def create_fixture(token, email, password):
    code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db(); $pdo->beginTransaction();
try {
  $category=$pdo->query("SELECT id FROM categories ORDER BY id LIMIT 1")->fetchColumn();
  $brand=$pdo->query("SELECT id FROM brands ORDER BY id LIMIT 1")->fetchColumn();
  if(!$category || !$brand) throw new RuntimeException("Catalogue fixture prerequisites are absent");
  $group=$pdo->query("SELECT id FROM customer_groups ORDER BY id LIMIT 1")->fetchColumn();
  $hash=password_hash($x["password"],PASSWORD_DEFAULT);
  $q=$pdo->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status) VALUES(?,?,?,?,?,?,?)");
  $q->execute(["B2B QA",$x["email"],$hash,"QA","customer",$group,"active"]);
  $uid=(int)$pdo->lastInsertId();
  $modelName="B2BModel ".$x["token"];
  $q=$pdo->prepare("INSERT INTO device_models(brand_id,name) VALUES(?,?)");
  $q->execute([$brand,$modelName]); $mid=(int)$pdo->lastInsertId();
  $sku="B2B-".$x["token"];
  $name="Café B2B part ".$x["token"];
  $q=$pdo->prepare("INSERT INTO products
    (sku,name,description,category_id,brand_id,quality,stock,list_price_cents,
     list_price_eur_cents,minimum_quantity,image_url,featured,active)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)");
  $q->execute([$sku,$name,"Dedicated native B2B QA fixture",$category,$brand,
    "Premium QA",20,999,900,2,"",0]);
  $pid=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO product_models(product_id,model_id) VALUES(?,?)")->execute([$pid,$mid]);
  $pdo->prepare("INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,?,?)")
    ->execute([$pid,$group,888,800]);
  $rate=$pdo->query("SELECT rate_ppm,rate_date,fetched_at,source_url FROM exchange_rates
    WHERE base_currency='EUR' AND quote_currency='CHF'")->fetch(PDO::FETCH_ASSOC);
  $pdo->commit();
  echo json_encode(["user_id"=>$uid,"product_id"=>$pid,"model_id"=>$mid,
    "category_id"=>(int)$category,"brand_id"=>(int)$brand,"group_id"=>(int)$group,
    "sku"=>$sku,"name"=>$name,"model_name"=>$modelName,"rate"=>$rate]);
} catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
'''
    return php(code, {"token": token, "email": email, "password": password})


def database_state(fixture):
    code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$q=db()->prepare("SELECT stock FROM products WHERE id=?");$q->execute([$x["product_id"]]);
$stock=(int)$q->fetchColumn();
$q=db()->prepare("SELECT quantity FROM cart_items WHERE user_id=? AND product_id=?");
$q->execute([$x["user_id"],$x["product_id"]]);$qty=$q->fetchColumn();
$q=db()->prepare("SELECT COUNT(*) FROM orders WHERE user_id=?");$q->execute([$x["user_id"]]);
echo json_encode(["stock"=>$stock,"quantity"=>$qty===false?null:(int)$qty,"orders"=>(int)$q->fetchColumn()]);
'''
    return php(code, fixture)


def original_commerce_state(fixture=None):
    code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,8,JSON_THROW_ON_ERROR);
$pid=(int)($x["product_id"]??0);
$products=$pid
  ? db()->prepare("SELECT COUNT(*) AS count,COALESCE(SUM(stock),0) AS stock,
      COALESCE(SUM(id*stock),0) AS weighted_stock FROM products WHERE id<>?")
  : db()->prepare("SELECT COUNT(*) AS count,COALESCE(SUM(stock),0) AS stock,
      COALESCE(SUM(id*stock),0) AS weighted_stock FROM products");
$products->execute($pid?[$pid]:[]);
$orders=db()->query("SELECT COUNT(*) AS count,COALESCE(SUM(id),0) AS ids,
  COALESCE(SUM(total_cents),0) AS totals FROM orders")->fetch(PDO::FETCH_ASSOC);
echo json_encode(["products"=>$products->fetch(PDO::FETCH_ASSOC),"orders"=>$orders]);
'''
    return php(code, fixture or {})


def set_rate_date(date):
    php(r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,8,JSON_THROW_ON_ERROR);
$q=db()->prepare("UPDATE exchange_rates SET rate_date=? WHERE base_currency='EUR' AND quote_currency='CHF'");
$q->execute([$x["date"]]); echo json_encode(["updated"=>true]);
''', {"date": date})


def cleanup(fixture):
    code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db();$pdo->beginTransaction();
try {
  $pdo->prepare("DELETE FROM cart_items WHERE user_id=?")->execute([$x["user_id"]]);
  $pdo->prepare("DELETE FROM group_prices WHERE product_id=?")->execute([$x["product_id"]]);
  $pdo->prepare("DELETE FROM product_models WHERE product_id=?")->execute([$x["product_id"]]);
  $pdo->prepare("DELETE FROM products WHERE id=?")->execute([$x["product_id"]]);
  $pdo->prepare("DELETE FROM device_models WHERE id=?")->execute([$x["model_id"]]);
  $pdo->prepare("DELETE FROM audit_events WHERE user_id=?")->execute([$x["user_id"]]);
  $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$x["user_id"]]);
  if(!empty($x["rate"])) {
    $q=$pdo->prepare("UPDATE exchange_rates SET rate_ppm=?,rate_date=?,fetched_at=?,source_url=?
      WHERE base_currency='EUR' AND quote_currency='CHF'");
    $q->execute([$x["rate"]["rate_ppm"],$x["rate"]["rate_date"],
      $x["rate"]["fetched_at"],$x["rate"]["source_url"]]);
  }
  $pdo->commit();echo json_encode(["clean"=>true]);
} catch(Throwable $e) {if($pdo->inTransaction())$pdo->rollBack();throw $e;}
'''
    php(code, fixture)


def assert_public_product(product, fixture):
    check(product["id"] == fixture["product_id"], "fixture product identity is preserved")
    check(product["brand_name"] is not None, "brand metadata is present")
    check(product["category_name"] is not None, "category metadata is present")
    check(product["models"] == [{"id": fixture["model_id"], "name": fixture["model_name"]}],
          "model metadata is present")
    check("review_summary" not in product, "the catalogue carries no review field")
    forbidden = {
        "list_price_cents", "list_price_eur_cents", "purchase_price_eur_cents",
        "price_eur_cents", "pricing_version", "group_prices", "base_price",
    }
    check(not forbidden.intersection(product), "private pricing and cost fields are absent")


fixture = None
token = secrets.token_hex(8)
email = f"qa-b2b-{token}@test.invalid"
password = secrets.token_urlsafe(30)
started = time.monotonic()
try:
    original_state = original_commerce_state()
    fixture = create_fixture(token, email, password)
    guest = Client()
    customer = Client()
    customer.login(email, password)

    guest.call("GET", "/search/products?" + urllib.parse.urlencode({"q": "   "}), expected=(422,))
    guest.call("GET", "/search/products?" + urllib.parse.urlencode({"q": "--"}), expected=(422,))
    check(True, "search rejects an empty box and a term without letters or digits")
    single = guest.call("GET", "/search/products?" + urllib.parse.urlencode({"q": " é "}))
    check(isinstance(single.get("products"), list), "a single trimmed Unicode character is a valid search")
    two = guest.call("GET", "/search/products?" + urllib.parse.urlencode({"q": "ab"}))
    check(isinstance(two.get("products"), list), "two characters no longer hit a minimum length")

    search_start = time.monotonic()
    result = guest.call("GET", "/search/products?" + urllib.parse.urlencode({
        "q": token, "limit": 8,
    }))
    search_ms = round((time.monotonic() - search_start) * 1000, 1)
    check(result["has_more"] is False, "bounded search reports has_more without COUNT")
    check(result["currency"] == result["currency_context"]["currency"], "search currency context is canonical")
    assert_public_product(result["products"][0], fixture)
    check(result["products"][0]["price_cents"] is None, "guest search prices are masked")

    by_model = guest.call("GET", "/search/products?" + urllib.parse.urlencode({
        "q": fixture["model_name"], "limit": 8,
    }))
    check(any(row["id"] == fixture["product_id"] for row in by_model["products"]),
          "autocomplete searches model names")
    by_quality = guest.call("GET", "/search/products?q=Premium%20QA&limit=8")
    check(any(row["id"] == fixture["product_id"] for row in by_quality["products"]),
          "autocomplete searches quality")

    listing = guest.call("GET", "/products?" + urllib.parse.urlencode({"q": token, "limit": 5}))
    assert_public_product(listing["products"][0], fixture)
    detail = guest.call("GET", f"/products/{fixture['product_id']}")
    assert_public_product(detail["product"], fixture)
    check(True, "ordinary listing and detail carry batched metadata")

    guest.call("POST", "/cart/quick-add", {
        "product_id": fixture["product_id"], "quantity": 2,
    }, expected=(401,))
    check(True, "quick-add requires an active customer")
    customer.call("POST", "/cart/quick-add", {
        "product_id": fixture["product_id"], "quantity": 1,
    }, expected=(422,))
    customer.call("POST", "/cart/quick-add", {
        "product_id": fixture["product_id"], "quantity": 2,
    })
    repeated = customer.call("POST", "/cart/quick-add", {
        "product_id": fixture["product_id"], "quantity": 3,
    })
    check(repeated["items"][0]["quantity"] == 5, "quick-add quantities are additive")
    customer.call("POST", "/cart", {"product_id": fixture["product_id"], "quantity": 4})
    check(customer.call("GET", "/cart")["items"][0]["quantity"] == 4,
          "legacy cart endpoint retains SET semantics")
    customer.call("DELETE", "/cart")

    def concurrent_add(_):
        client = Client()
        client.login(email, password)
        return client.call("POST", "/cart/quick-add", {
            "product_id": fixture["product_id"], "quantity": 2,
        })

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        concurrent = list(executor.map(concurrent_add, range(2)))
    check(all(response["items"][0]["quantity"] in (2, 4) for response in concurrent),
          "concurrent quick-add responses are canonical")
    check(customer.call("GET", "/cart")["items"][0]["quantity"] == 4,
          "concurrent additive writes are serialized")
    customer.call("POST", "/cart", {"product_id": fixture["product_id"], "quantity": 20})
    customer.call("POST", "/cart/quick-add", {
        "product_id": fixture["product_id"], "quantity": 1,
    }, expected=(409,))
    check(customer.call("GET", "/cart")["items"][0]["quantity"] == 20,
          "stock rejection does not mutate the cart")

    customer.call("DELETE", "/cart")
    customer.call("POST", "/currency", {"country": "CH"})
    before_stale = database_state(fixture)
    set_rate_date("2000-01-01")
    customer.call("POST", "/cart/quick-add", {
        "product_id": fixture["product_id"], "quantity": 2,
    }, expected=(503,))
    after_stale = database_state(fixture)
    check(after_stale == before_stale, "stale currency failure leaves cart unchanged")
    set_rate_date(fixture["rate"]["rate_date"])

    final = database_state(fixture)
    check(final["stock"] == 20 and final["orders"] == 0,
          "B2B search and quick-add do not change stock or create orders")
    check(original_commerce_state(fixture) == original_state,
          "all pre-existing product stock and orders remain unchanged")
    elapsed_ms = round((time.monotonic() - started) * 1000, 1)
    print(json.dumps({
        "ok": True, "checks": len(checks), "search_ms": search_ms,
        "elapsed_ms": elapsed_ms, "details": checks,
    }, ensure_ascii=False))
finally:
    if fixture:
        cleanup(fixture)