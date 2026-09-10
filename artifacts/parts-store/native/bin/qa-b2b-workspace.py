#!/usr/bin/env python3
"""End-to-end HTTP checks for the B2B ordering workspace.

Covers quick order, saved order lists, reordering, back-in-stock alerts,
invoice delivery preferences and the customer document centre.  Every
fixture this script creates is removed again, and the catalogue and order
tables owned by other data are left untouched.
"""

import csv
import io
import json
import os
import pathlib
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import http.cookiejar
import zipfile

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
    if result.stderr.strip():
        print(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else None


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = self.call("GET", "/session")["csrf"]

    def request(self, method, path, data=None, expected=(200, 201)):
        headers = {}
        payload = None
        if method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        if data is not None:
            payload = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        if response.status not in expected:
            detail = body[:400].decode(errors="replace")
            try:
                detail = json.loads(body).get("error", detail)
            except Exception:
                pass
            raise AssertionError(f"{method} {path}: HTTP {response.status}: {detail}")
        return response, body

    def call(self, method, path, data=None, expected=(200, 201)):
        response, body = self.request(method, path, data, expected)
        parsed = json.loads(body)
        if isinstance(parsed, dict) and parsed.get("csrf"):
            self.csrf = parsed["csrf"]
        return parsed

    def raw(self, method, path, expected=(200,)):
        return self.request(method, path, None, expected)

    def login(self, email, password):
        return self.call("POST", "/auth/login", {"email": email, "password": password})


FIXTURE_SQL = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db(); $pdo->beginTransaction();
try {
  $category=$pdo->query("SELECT id FROM categories ORDER BY id LIMIT 1")->fetchColumn();
  $brand=$pdo->query("SELECT id FROM brands ORDER BY id LIMIT 1")->fetchColumn();
  $group=$pdo->query("SELECT id FROM customer_groups ORDER BY id LIMIT 1")->fetchColumn();
  if(!$category||!$brand||!$group) throw new RuntimeException("Fixture prerequisites are absent");
  $hash=password_hash($x["password"],PASSWORD_DEFAULT);
  $q=$pdo->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status)
    VALUES(?,?,?,?,'customer',?,'active')");
  $q->execute(["Workspace QA",$x["email"],$hash,"Workspace QA BV",$group]);
  $uid=(int)$pdo->lastInsertId();
  // A real second customer, so isolation is proven against an account that
  // exists rather than against an id nobody owns.
  $q->execute(["Workspace QA Other",$x["other_email"],$hash,"Other QA BV",$group]);
  $other=(int)$pdo->lastInsertId();

  $insertProduct=$pdo->prepare("INSERT INTO products
    (sku,name,description,category_id,brand_id,quality,stock,list_price_cents,list_price_eur_cents,
     minimum_quantity,image_url,featured,active) VALUES(?,?,?,?,?,?,?,?,?,?,'',0,1)");
  $price=$pdo->prepare("INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents)
    VALUES(?,?,?,?)");

  $skuStocked="WSP-STOCK-".$x["token"];
  $insertProduct->execute([$skuStocked,"Workspace stocked part ".$x["token"],"Workspace QA fixture",
    $category,$brand,"Premium QA",20,1200,1100,2]);
  $stocked=(int)$pdo->lastInsertId();
  $price->execute([$stocked,$group,1000,900]);

  $skuEmpty="WSP-EMPTY-".$x["token"];
  $insertProduct->execute([$skuEmpty,"Workspace depleted part ".$x["token"],"Workspace QA fixture",
    $category,$brand,"Premium QA",0,1500,1400,1]);
  $depleted=(int)$pdo->lastInsertId();
  $price->execute([$depleted,$group,1400,1300,]);

  // Deferred payment is granted so the reference rule can be proven on a real
  // checkout instead of on the form alone.
  $pdo->prepare("INSERT INTO customer_payment_entitlements(user_id,payment_method,enabled,granted_by,granted_at)
    VALUES(?,'pay_later',1,?,NOW())")->execute([$uid,$uid]);

  $address=json_encode(["name"=>"Workspace QA","company"=>"Workspace QA BV","street"=>"Teststrasse 1",
    "postal_code"=>"8000","city"=>"Zürich","country"=>"CH"],JSON_THROW_ON_ERROR);
  $number="WSPQA-".$x["token"];
  $q=$pdo->prepare("INSERT INTO orders(number,user_id,status,subtotal_cents,tax_cents,shipping_cents,
    total_cents,tax_bps,currency,address_json,payment_method,payment_state,notes,idempotency_key,created_at)
    VALUES(?,?,'on_hold',2000,162,0,2162,810,'CHF',?,'pay_later','pending','',?,?)");
  $q->execute([$number,$uid,$address,"wspqa-".$x["token"],$x["order_date"]]);
  $oid=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO order_items(order_id,product_id,name,sku,quantity,price_cents,total_cents,price_eur_cents)
    VALUES(?,?,?,?,?,?,?,?)")->execute([$oid,$stocked,"Workspace stocked part ".$x["token"],$skuStocked,2,1000,2000,900]);

  $pdo->commit();
  echo json_encode(["user_id"=>$uid,"other_user_id"=>$other,"group_id"=>(int)$group,"stocked_id"=>$stocked,
    "depleted_id"=>$depleted,"sku_stocked"=>$skuStocked,"sku_empty"=>$skuEmpty,
    "order_id"=>$oid,"order_number"=>$number]);
} catch(Throwable $e){ if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
'''

CLEANUP_SQL = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db(); $uid=(int)$x["user_id"]; $other=(int)($x["other_user_id"] ?? 0);
// Only rows this fixture owns are removed, and always child-before-parent.
foreach ([$uid,$other] as $owner) {
  if ($owner === 0) continue;
  $pdo->prepare("DELETE FROM invoice_deliveries WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM billing_preferences WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM stock_alerts WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE i FROM order_list_items i JOIN order_lists l ON l.id=i.list_id WHERE l.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM order_lists WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM cart_items WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE ca FROM credit_applications ca
    JOIN customer_credit_notes cn ON cn.id=ca.credit_note_id WHERE cn.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM customer_credit_notes WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE s FROM return_settlements s JOIN returns r ON r.id=s.return_id WHERE r.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE i FROM return_items i JOIN returns r ON r.id=i.return_id WHERE r.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM returns WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE a FROM invoice_accounting a JOIN orders o ON o.id=a.order_id WHERE o.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE e FROM order_events e JOIN orders o ON o.id=e.order_id WHERE o.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE i FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE p FROM payment_attempts p JOIN orders o ON o.id=p.order_id WHERE o.user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM orders WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM customer_payment_entitlements WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM addresses WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM audit_events WHERE user_id=?")->execute([$owner]);
  $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$owner]);
}
$pdo->prepare("DELETE FROM group_prices WHERE product_id IN (?,?)")->execute([(int)$x["stocked_id"],(int)$x["depleted_id"]]);
$pdo->prepare("DELETE FROM products WHERE id IN (?,?)")->execute([(int)$x["stocked_id"],(int)$x["depleted_id"]]);
echo json_encode(["removed"=>true]);
'''


CREDIT_SQL = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db(); $pdo->beginTransaction();
try {
  $uid=(int)$x["user_id"]; $orderA=(int)$x["order_id"];
  $address=json_encode(["name"=>"Workspace QA","company"=>"Workspace QA BV","street"=>"Teststrasse 1",
    "postal_code"=>"8000","city"=>"Zürich","country"=>"CH"],JSON_THROW_ON_ERROR);
  $numberB="WSPQB-".$x["token"];
  $pdo->prepare("INSERT INTO orders(number,user_id,status,subtotal_cents,tax_cents,shipping_cents,
    total_cents,tax_bps,currency,address_json,payment_method,payment_state,notes,idempotency_key,created_at)
    VALUES(?,?,'on_hold',3000,243,0,3243,810,'CHF',?,'pay_later','pending','',?,?)")
    ->execute([$numberB,$uid,$address,"wspqb-".$x["token"],$x["order_date"]]);
  $orderB=(int)$pdo->lastInsertId();
  // Both invoices are verified, so the workspace reports a real balance
  // instead of an unknown one.
  $acc=$pdo->prepare("INSERT INTO invoice_accounting(order_id,verified,due_date,paid_cents,note,updated_by)
    VALUES(?,1,?,0,'',?)");
  $acc->execute([$orderA,$x["due_date"],$uid]);
  $acc->execute([$orderB,$x["due_date"],$uid]);
  $pdo->prepare("INSERT INTO returns(number,user_id,order_id,status,reason,credit_cents,note)
    VALUES(?,?,?,'settled','Workspace QA credit',500,'')")->execute(["WSPR-".$x["token"],$uid,$orderA]);
  $returnId=(int)$pdo->lastInsertId();
  $snapshot=json_encode(["lines"=>[]],JSON_THROW_ON_ERROR);
  $pdo->prepare("INSERT INTO return_settlements(return_id,idempotency_key,kind,status,amount_cents,
    currency,snapshot,created_by,settled_at) VALUES(?,?,'invoice_credit','succeeded',500,'CHF',?,?,?)")
    ->execute([$returnId,"wspr-".$x["token"],$snapshot,$uid,$x["order_date"]]);
  $settlementId=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO customer_credit_notes(number,user_id,order_id,return_id,settlement_id,
    issued_cents,remaining_cents,currency,status,snapshot,created_by,created_at)
    VALUES(?,?,?,?,?,500,0,'CHF','issued',?,?,?)")
    ->execute(["WSPCN-".$x["token"],$uid,$orderA,$returnId,$settlementId,$snapshot,$uid,$x["order_date"]]);
  $creditNoteId=(int)$pdo->lastInsertId();
  // The credit belongs to order A but is settled against order B, which is
  // exactly the case a naive join on the credit note reports wrongly.
  $pdo->prepare("INSERT INTO credit_applications(credit_note_id,target_order_id,amount_cents)
    VALUES(?,?,500)")->execute([$creditNoteId,$orderB]);

  // A return refunded through the payment provider issues no account credit
  // note, yet its credit document is downloadable: it must be listed too.
  $pdo->prepare("INSERT INTO returns(number,user_id,order_id,status,reason,credit_cents,note)
    VALUES(?,?,?,'settled','Workspace QA refund',700,'')")->execute(["WSPRF-".$x["token"],$uid,$orderB]);
  $refundReturn=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO return_settlements(return_id,idempotency_key,kind,status,amount_cents,
    currency,snapshot,created_by,settled_at) VALUES(?,?,'stripe_refund','succeeded',700,'CHF',?,?,?)")
    ->execute([$refundReturn,"wsprf-".$x["token"],$snapshot,$uid,$x["order_date"]]);
  // A refund still in flight is not a document yet.
  $pdo->prepare("INSERT INTO returns(number,user_id,order_id,status,reason,credit_cents,note)
    VALUES(?,?,?,'received','Workspace QA pending refund',300,'')")->execute(["WSPRP-".$x["token"],$uid,$orderB]);
  $pendingReturn=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO return_settlements(return_id,idempotency_key,kind,status,amount_cents,
    currency,snapshot,created_by) VALUES(?,?,'stripe_refund','pending',300,'CHF',?,?)")
    ->execute([$pendingReturn,"wsprp-".$x["token"],$snapshot,$uid]);
  // A refund in a year that holds no other document: the year selector has to
  // keep offering that year, or the document becomes unreachable.
  $pdo->prepare("INSERT INTO returns(number,user_id,order_id,status,reason,credit_cents,note)
    VALUES(?,?,?,'settled','Workspace QA older refund',400,'')")->execute(["WSPRO-".$x["token"],$uid,$orderB]);
  $olderReturn=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO return_settlements(return_id,idempotency_key,kind,status,amount_cents,
    currency,snapshot,created_by,settled_at) VALUES(?,?,'twint_refund','succeeded',400,'CHF',?,?,?)")
    ->execute([$olderReturn,"wspro-".$x["token"],$snapshot,$uid,"2025-11-04 10:00:00"]);

  $pdo->commit();
  echo json_encode(["order_b"=>$orderB,"order_b_number"=>$numberB,"return_id"=>$returnId,
    "credit_note_id"=>$creditNoteId,"credit_number"=>"WSPCN-".$x["token"],
    "refund_return_id"=>$refundReturn,"refund_number"=>"WSPRF-".$x["token"],
    "pending_return_id"=>$pendingReturn,"pending_number"=>"WSPRP-".$x["token"],
    "older_refund_return_id"=>$olderReturn,"older_refund_number"=>"WSPRO-".$x["token"]]);
} catch(Throwable $e){ if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
'''


REFERENCE_SQL = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,8,JSON_THROW_ON_ERROR);
$pdo=db();
$q=$pdo->prepare("SELECT customer_reference FROM orders WHERE id=? AND user_id=?");
$q->execute([(int)$x["order_id"],(int)$x["user_id"]]);
$order=$q->fetch(PDO::FETCH_ASSOC) ?: [];
$q=$pdo->prepare("SELECT recipient,copy_recipient,status,document_kind
  FROM invoice_deliveries WHERE order_id=? AND user_id=?");
$q->execute([(int)$x["order_id"],(int)$x["user_id"]]);
$delivery=$q->fetch(PDO::FETCH_ASSOC) ?: [];
echo json_encode([
  "customer_reference"=>(string)($order["customer_reference"] ?? ""),
  "recipient"=>(string)($delivery["recipient"] ?? ""),
  "copy_recipient"=>(string)($delivery["copy_recipient"] ?? ""),
  "delivery_status"=>(string)($delivery["status"] ?? ""),
]);
'''


def catalogue_snapshot(fixture):
    code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$q=db()->prepare("SELECT COUNT(*) AS count,COALESCE(SUM(stock),0) AS stock FROM products WHERE id NOT IN (?,?)");
$q->execute([(int)$x["stocked_id"],(int)$x["depleted_id"]]);
$products=$q->fetch(PDO::FETCH_ASSOC);
$q=db()->prepare("SELECT COUNT(*) AS count FROM orders WHERE user_id NOT IN (?,?)");
$q->execute([(int)$x["user_id"],(int)$x["other_user_id"]]);
echo json_encode(["products"=>$products,"orders"=>$q->fetch(PDO::FETCH_ASSOC)]);
'''
    return php(code, fixture)


def set_stock(product_id, stock):
    code = r'''
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,8,JSON_THROW_ON_ERROR);
db()->prepare("UPDATE products SET stock=? WHERE id=?")->execute([(int)$x["stock"],(int)$x["id"]]);
echo json_encode(["ok"=>true]);
'''
    return php(code, {"id": product_id, "stock": stock})


def statuses(lines):
    return {line["code"]: line["status"] for line in lines}


def main():
    token = secrets.token_hex(4)
    email = f"workspace.qa.{token}@ferry.test"
    other_email = f"workspace.qa.other.{token}@ferry.test"
    password = "Workspace!" + token
    order_date = "2026-05-14 09:30:00"
    fixture = php(FIXTURE_SQL, {
        "token": token, "email": email, "other_email": other_email,
        "password": password, "order_date": order_date,
    })
    before = catalogue_snapshot(fixture)
    try:
        client = Client()
        client.login(email, password)

        # ---------------------------------------------------------------- #
        # Dispatch promise                                                  #
        # ---------------------------------------------------------------- #
        promise = client.call("GET", "/workspace/dispatch-promise")["dispatch"]
        check(isinstance(promise.get("cutoff_time"), str) and ":" in promise["cutoff_time"],
              "Dispatch promise reports a cut-off time")
        check(isinstance(promise.get("ships_today"), bool),
              "Dispatch promise says whether today still ships")
        check(len(str(promise.get("dispatch_date", ""))) == 10,
              "Dispatch promise names the next dispatch day")
        check(promise["timezone"], "Dispatch promise states the timezone it counts in")

        # ---------------------------------------------------------------- #
        # Quick order                                                       #
        # ---------------------------------------------------------------- #
        resolved = client.call("POST", "/workspace/quick-order/resolve", {"lines": [
            {"code": fixture["sku_stocked"], "quantity": 1},
            {"code": fixture["sku_empty"], "quantity": 3},
            {"code": "WSP-NOTHING-" + token, "quantity": 2},
            {"code": "", "quantity": 1},
        ]})
        state = statuses(resolved["lines"])
        check(state[fixture["sku_stocked"]] == "raised_to_minimum",
              "A quantity below the minimum is raised, not silently accepted")
        check(state[fixture["sku_empty"]] == "out_of_stock",
              "A depleted part is reported as out of stock")
        check(state["WSP-NOTHING-" + token] == "not_found",
              "An unknown code is reported as not found")
        check(state[""] == "empty", "An empty line is reported rather than dropped")
        stocked_line = next(l for l in resolved["lines"] if l["code"] == fixture["sku_stocked"])
        check(stocked_line["quantity"] == 2, "The raised line carries the minimum quantity")
        check(stocked_line["product"]["price_cents"] is not None,
              "A resolved line carries the customer's own price")
        check(resolved["orderable_count"] == 1, "Only the orderable line counts towards the total")

        over = client.call("POST", "/workspace/quick-order/resolve", {"lines": [
            {"code": fixture["sku_stocked"], "quantity": 500},
        ]})
        check(over["lines"][0]["status"] == "reduced_to_stock", "A quantity above stock is reduced")
        check(over["lines"][0]["quantity"] == 20, "The reduced line lands on the available stock")

        # Stock below the minimum order quantity must not be sold as a smaller
        # batch: the line is refused instead of clamped down to what is left.
        set_stock(fixture["stocked_id"], 1)
        scarce = client.call("POST", "/workspace/quick-order/resolve", {"lines": [
            {"code": fixture["sku_stocked"], "quantity": 2},
        ]})
        check(scarce["lines"][0]["status"] == "below_minimum",
              "Stock under the minimum order quantity is refused, not clamped")
        check(scarce["lines"][0]["quantity"] == 0,
              "A below-minimum line carries no orderable quantity")
        check(scarce["orderable_count"] == 0, "A below-minimum line does not count as orderable")
        refused = client.request("POST", "/workspace/quick-order/add", {"lines": [
            {"code": fixture["sku_stocked"], "quantity": 2},
        ]}, expected=(422,))
        check(refused[0].status == 422, "A below-minimum line never reaches the cart")
        set_stock(fixture["stocked_id"], 20)

        added = client.call("POST", "/workspace/quick-order/add", {"lines": [
            {"code": fixture["sku_stocked"], "quantity": 4},
            {"code": fixture["sku_empty"], "quantity": 3},
        ]})
        check(added["added"] == 1, "Only the orderable line reaches the cart")
        cart = client.call("GET", "/cart")
        quantities = {item["sku"]: item["quantity"] for item in cart["items"]}
        check(quantities.get(fixture["sku_stocked"]) == 4, "Quick order writes the requested quantity")
        check(fixture["sku_empty"] not in quantities, "A depleted part never enters the cart")

        # ---------------------------------------------------------------- #
        # Saved order lists                                                 #
        # ---------------------------------------------------------------- #
        created = client.call("POST", "/workspace/order-lists", {"name": "Weekly screens " + token})
        list_id = created["list"]["id"]
        duplicate = client.request("POST", "/workspace/order-lists",
                                   {"name": "Weekly screens " + token}, expected=(409,))
        check(duplicate[0].status == 409, "A duplicate list name is refused")

        client.call("POST", f"/workspace/order-lists/{list_id}/items",
                    {"product_id": fixture["stocked_id"], "quantity": 3})
        client.call("POST", f"/workspace/order-lists/{list_id}/items",
                    {"product_id": fixture["depleted_id"], "quantity": 1})
        detail = client.call("GET", f"/workspace/order-lists/{list_id}")
        check(len(detail["items"]) == 2, "Both saved products are on the list")
        check(any(i["product_id"] == fixture["stocked_id"] and i["quantity"] == 3
                  for i in detail["items"]), "A saved list keeps the quantity it was given")

        client.call("POST", f"/workspace/order-lists/{list_id}/items",
                    {"product_id": fixture["stocked_id"], "quantity": 5})
        detail = client.call("GET", f"/workspace/order-lists/{list_id}")
        check(len(detail["items"]) == 2, "Saving the same product again updates instead of duplicating")
        check(next(i for i in detail["items"]
                   if i["product_id"] == fixture["stocked_id"])["quantity"] == 5,
              "Saving the same product again replaces the quantity")

        to_cart = client.call("POST", f"/workspace/order-lists/{list_id}/add-to-cart")
        check(to_cart["added"] == 1, "Only the orderable list line reaches the cart")
        cart = client.call("GET", "/cart")
        quantities = {item["sku"]: item["quantity"] for item in cart["items"]}
        check(quantities.get(fixture["sku_stocked"]) == 9,
              "Adding a list adds to the existing cart line instead of replacing it")

        renamed = client.call("PATCH", f"/workspace/order-lists/{list_id}",
                              {"name": "Renamed " + token})
        check(any(l["id"] == list_id and l["name"] == "Renamed " + token
                  for l in renamed["lists"]), "A list can be renamed")
        client.call("DELETE", f"/workspace/order-lists/{list_id}/items/{fixture['depleted_id']}")
        detail = client.call("GET", f"/workspace/order-lists/{list_id}")
        check(len(detail["items"]) == 1, "A single product can be taken off a list")

        # ---------------------------------------------------------------- #
        # Reordering                                                        #
        # ---------------------------------------------------------------- #
        client.call("DELETE", "/cart")
        reorder = client.call("POST", f"/workspace/orders/{fixture['order_id']}/reorder")
        check(reorder["added"] == 1, "Reordering puts the original line back in the cart")
        cart = client.call("GET", "/cart")
        quantities = {item["sku"]: item["quantity"] for item in cart["items"]}
        check(quantities.get(fixture["sku_stocked"]) == 2,
              "Reordering restores the quantity that was ordered")
        foreign = client.request("POST", "/workspace/orders/999999/reorder", expected=(404,))
        check(foreign[0].status == 404, "Reordering somebody else's order is refused")

        # The minimum rule has to hold on every bulk path, not only on quick
        # order: a line that cannot be ordered may not be dropped in silence.
        client.call("DELETE", "/cart")
        set_stock(fixture["stocked_id"], 1)
        set_stock(fixture["depleted_id"], 10)
        client.call("POST", f"/workspace/order-lists/{list_id}/items",
                    {"product_id": fixture["depleted_id"], "quantity": 1})
        mixed = client.call("POST", f"/workspace/order-lists/{list_id}/add-to-cart")
        scarce_line = next(l for l in mixed["lines"] if l["code"] == fixture["sku_stocked"])
        check(scarce_line["status"] == "below_minimum",
              "A saved list refuses a line whose stock is under the minimum")
        check(scarce_line["quantity"] == 0, "The refused list line carries no quantity")
        check(mixed["added"] == 1, "A mixed list adds only the line that can be ordered")
        cart = client.call("GET", "/cart")
        check(all(item["sku"] != fixture["sku_stocked"] for item in cart["items"]),
              "Nothing below the minimum slipped into the cart along the way")

        # And when nothing on the list can be ordered the customer is told so,
        # instead of being handed a silently empty result.
        client.call("DELETE", "/cart")
        client.call("DELETE", f"/workspace/order-lists/{list_id}/items/{fixture['depleted_id']}")
        refused_list = client.request("POST", f"/workspace/order-lists/{list_id}/add-to-cart",
                                      expected=(422,))
        check(refused_list[0].status == 422, "A list where nothing is orderable is refused with a message")
        blocked_reorder = client.request("POST", f"/workspace/orders/{fixture['order_id']}/reorder",
                                         expected=(422,))
        check(blocked_reorder[0].status == 422,
              "Reordering refuses a below-minimum line instead of clamping it into the cart")
        set_stock(fixture["stocked_id"], 20)
        set_stock(fixture["depleted_id"], 0)

        # ---------------------------------------------------------------- #
        # Back-in-stock alerts                                              #
        # ---------------------------------------------------------------- #
        client.call("POST", "/workspace/stock-alerts", {"product_id": fixture["depleted_id"]})
        alerts = client.call("GET", "/workspace/stock-alerts")["alerts"]
        watched = next(a for a in alerts if a["product_id"] == fixture["depleted_id"])
        check(watched["alert_status"] == "waiting", "A depleted part is reported as waiting")
        product = client.call("GET", f"/products/{fixture['depleted_id']}")
        check(product["watching"] is True, "The product page knows the customer is watching")

        set_stock(fixture["depleted_id"], 7)
        alerts = client.call("GET", "/workspace/stock-alerts")["alerts"]
        watched = next(a for a in alerts if a["product_id"] == fixture["depleted_id"])
        check(watched["alert_status"] == "available", "Returning stock flips the alert to available")
        check(watched["stock"] == 7, "The alert reports the live stock")
        set_stock(fixture["depleted_id"], 0)

        client.call("DELETE", f"/workspace/stock-alerts/{fixture['depleted_id']}")
        alerts = client.call("GET", "/workspace/stock-alerts")["alerts"]
        check(all(a["product_id"] != fixture["depleted_id"] for a in alerts),
              "An alert can be dropped again")
        product = client.call("GET", f"/products/{fixture['depleted_id']}")
        check(product["watching"] is False, "The product page reflects a dropped alert")

        # ---------------------------------------------------------------- #
        # Invoice delivery preferences                                      #
        # ---------------------------------------------------------------- #
        prefs = client.call("GET", "/workspace/billing-preferences")
        check(prefs["preferences"]["invoice_email"] == "",
              "No billing address is invented before the customer sets one")
        check(prefs["preferences"]["effective_email"] == email,
              "Without a billing address the account address is used")
        rejected = client.request("PUT", "/workspace/billing-preferences",
                                  {"invoice_email": "not-an-address"}, expected=(422,))
        check(rejected[0].status == 422, "An invalid billing address is refused")
        saved = client.call("PUT", "/workspace/billing-preferences", {
            "invoice_email": f"facturen.{token}@ferry.test",
            "copy_email": f"boekhouding.{token}@ferry.test",
            "reference_label": "Inkoopnummer",
            "auto_send": True,
            "reference_required": True,
        })
        check(saved["preferences"]["effective_email"] == f"facturen.{token}@ferry.test",
              "A saved billing address becomes the effective address")
        prefs = client.call("GET", "/workspace/billing-preferences")
        check(prefs["preferences"]["reference_label"] == "Inkoopnummer",
              "The reference label survives a reload")
        check(prefs["preferences"]["reference_required"] is True,
              "The reference requirement survives a reload")

        # ---------------------------------------------------------------- #
        # Document centre                                                   #
        # ---------------------------------------------------------------- #
        documents = client.call("GET", "/workspace/documents?year=2026&period=q2")
        found = [d for d in documents["documents"] if d["order_id"] == fixture["order_id"]]
        check(len(found) == 1, "The invoice appears in the quarter it belongs to")
        check(found[0]["outstanding_cents"] is None,
              "An unverified balance stays unknown instead of becoming a debt")
        total = next(t for t in documents["totals"] if t["currency"] == found[0]["currency"])
        check(total["outstanding_known"] is False,
              "The totals admit that part of the balance is unknown")
        check(total["document_count"] >= 1, "The totals count the documents in the period")
        check(2026 in documents["years"], "The year filter offers the year with documents")

        empty = client.call("GET", "/workspace/documents?year=2026&period=q4")
        check(all(d["order_id"] != fixture["order_id"] for d in empty["documents"]),
              "A different quarter does not contain the invoice")

        response, body = client.raw("GET", "/workspace/documents/export.csv?year=2026&period=q2")
        check("text/csv" in response.headers.get("Content-Type", ""),
              "The export is delivered as CSV")
        rows = list(csv.reader(io.StringIO(body.decode("utf-8-sig"))))
        check(any(fixture["order_number"] in ",".join(row) for row in rows),
              "The CSV export contains the order")

        response, body = client.raw("GET", "/workspace/documents/archive.zip?year=2026&period=q2")
        archive_type = response.headers.get("Content-Type", "")
        check("zip" in archive_type,
              f"The bulk download is delivered as a ZIP archive (got {archive_type!r})")
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            names = archive.namelist()
            check(any(name.endswith(".pdf") for name in names),
                  "The archive contains at least one invoice PDF")
            check(any(name.endswith(".csv") for name in names),
                  "The archive contains an index for the bookkeeper")
            pdf = next(name for name in names if name.endswith(".pdf"))
            check(archive.read(pdf).startswith(b"%PDF"), "The archived invoice is a real PDF")

        missing = client.request("GET", "/workspace/documents/archive.zip?year=2026&period=q4",
                                 expected=(404,))
        check(missing[0].status == 404, "An empty period does not produce an empty archive")

        # ---------------------------------------------------------------- #
        # Credits settled against another invoice                           #
        # ---------------------------------------------------------------- #
        credit = php(CREDIT_SQL, {**fixture, "token": token, "order_date": order_date,
                                  "due_date": "2026-06-14"})
        documents = client.call("GET", "/workspace/documents?year=2026&period=q2")
        invoices = {d["order_id"]: d for d in documents["documents"] if d["type"] == "invoice"}
        check(invoices[credit["order_b"]]["outstanding_cents"] == 3243 - 500,
              "A credit lowers the invoice it was actually settled against")
        check(invoices[fixture["order_id"]]["outstanding_cents"] == 2162,
              "A credit never lowers the order it happened to be issued from")
        notes = [d for d in documents["documents"] if d["type"] == "credit_note"]
        check(len(notes) == 2, "Both credit documents are listed in the document centre")

        # A provider refund issues no account credit note, so enumerating only
        # credit notes silently loses a document the customer can download.
        refunds = [d for d in documents["documents"] if d["document_number"] == credit["refund_number"]]
        check(len(refunds) == 1, "A refund settled by the payment provider is listed once")
        check(refunds[0]["amount_cents"] == -700, "The refund is shown as a credit, not as a charge")
        check(all(d["document_number"] != credit["pending_number"] for d in documents["documents"]),
              "A refund still in flight is not offered as a document")
        check(all(d["document_number"] != credit["older_refund_number"] for d in documents["documents"]),
              "A refund from another year stays out of this quarter")
        check(2025 in documents["years"],
              "A year that holds nothing but a refund stays selectable")
        older = client.call("GET", "/workspace/documents?year=2025&period=q4")
        check(any(d["document_number"] == credit["older_refund_number"] for d in older["documents"]),
              "The refund is found in the quarter it was settled in")

        def archive_index(query):
            _, payload = client.raw("GET", "/workspace/documents/archive.zip?" + query)
            with zipfile.ZipFile(io.BytesIO(payload)) as bundle:
                rows = list(csv.DictReader(io.StringIO(bundle.read("index.csv").decode("utf-8-sig")), delimiter=";"))
                pdfs = [n for n in bundle.namelist() if n.endswith(".pdf")]
                first = bundle.read(pdfs[0]) if pdfs else b""
            return rows, pdfs, first

        rows, pdfs, first = archive_index("year=2026&period=q2&type=credit_note")
        kinds = {row["document_type"] for row in rows}
        check(kinds == {"credit_note"}, "A credit-note download leaves the invoices out")
        check(len(pdfs) == 2, "The credit-note download holds both credit documents")
        check(first.startswith(b"%PDF"), "The archived credit note is a real PDF")

        rows, pdfs, _ = archive_index("year=2026&period=q2&type=all")
        kinds = {row["document_type"] for row in rows}
        check(kinds == {"invoice", "credit_note"},
              "A full download mixes invoices and credit notes")
        check(len(pdfs) == 4, "Every listed document is present as a PDF")
        rejected = client.request("GET", "/workspace/documents/archive.zip?year=2026&period=q2&type=nonsense",
                                  expected=(422,))
        check(rejected[0].status == 422, "An unknown document filter is refused")

        # ---------------------------------------------------------------- #
        # A second, real customer sees none of it                           #
        # ---------------------------------------------------------------- #
        other = Client()
        other.login(other_email, password)
        mine = {fixture["order_id"], credit["order_b"]}
        theirs = other.call("GET", "/workspace/documents?year=2026&period=q2")
        check(all(d["order_id"] not in mine for d in theirs["documents"]),
              "Another customer's documents stay out of this account")
        denied = other.request("GET", f"/documents/{fixture['order_id']}/invoice.pdf", expected=(404,))
        check(denied[0].status == 404, "Another customer cannot download this invoice")
        denied = other.request("GET", f"/documents/returns/{credit['return_id']}/credit-note.pdf",
                               expected=(404,))
        check(denied[0].status == 404, "Another customer cannot download this credit note")
        denied = other.request("GET", "/workspace/documents/archive.zip?year=2026&period=q2",
                               expected=(404,))
        check(denied[0].status == 404, "Another customer's archive stays empty")

        # ---------------------------------------------------------------- #
        # The billing preferences actually govern a real checkout           #
        # ---------------------------------------------------------------- #
        created = client.call("POST", "/addresses", {
            "label": "Werkplaats", "name": "Workspace QA", "company": "Workspace QA BV",
            "line1": "Teststrasse 1", "postal_code": "8000", "city": "Zürich", "country": "CH",
        })
        address_id = (created.get("address") or created).get("id")
        client.call("POST", "/cart", {"product_id": fixture["stocked_id"], "quantity": 2})
        quote = client.call("POST", "/checkout/quote",
                            {"address_id": address_id, "shipping_method": "swiss_post_priority"})
        codes = [method["code"] for method in quote.get("payment_methods", [])]
        check("pay_later" in codes, "An entitled customer is offered payment on invoice")
        order_payload = {
            "address_id": address_id, "quote_token": quote["quote_token"],
            "payment_method": "pay_later", "shipping_method": "swiss_post_priority",
            "notes": "", "idempotency_key": "wspqa-noref-" + token,
        }
        blocked = client.request("POST", "/checkout", order_payload, expected=(422,))
        check(blocked[0].status == 422,
              "Checkout stops when the reference the customer made mandatory is missing")

        # Same order, same address, only the reference added: it goes through.
        quote = client.call("POST", "/checkout/quote",
                            {"address_id": address_id, "shipping_method": "swiss_post_priority"})
        placed = client.call("POST", "/checkout", {
            **order_payload, "quote_token": quote["quote_token"],
            "idempotency_key": "wspqa-ref-" + token, "customer_reference": "PO-" + token,
        })["order"]
        stored = php(REFERENCE_SQL, {"order_id": placed["id"], "user_id": fixture["user_id"]})
        check(stored["customer_reference"] == "PO-" + token,
              "The order carries the reference the customer typed")
        check(stored["recipient"] == f"facturen.{token}@ferry.test",
              "The invoice is booked for the billing address the customer chose")
        check(stored["copy_recipient"] == f"boekhouding.{token}@ferry.test",
              "The copy address the customer added is kept with it")
        check(stored["delivery_status"] != "", "The invoice delivery is recorded, not assumed")

        # ---------------------------------------------------------------- #
        # Isolation                                                         #
        # ---------------------------------------------------------------- #
        client.call("DELETE", "/cart")
        after = catalogue_snapshot(fixture)
        check(after == before, "No catalogue or order row outside the fixture changed")
    finally:
        php(CLEANUP_SQL, fixture)

    for name in checks:
        print("  ok  " + name)
    print(f"\n{len(checks)} workspace checks passed.")


if __name__ == "__main__":
    main()
