import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [wallee, commerce, operations, store, routes] = await Promise.all([
  readFile(new URL("../src/routes/wallee.ts", import.meta.url), "utf8"),
  readFile(new URL("../../parts-store/native/src/commerce.php", import.meta.url), "utf8"),
  readFile(new URL("../../parts-store/native/src/operations.php", import.meta.url), "utf8"),
  readFile(new URL("../../parts-store/native/public/assets/store.js", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8"),
]);

assert.match(wallee, /from "wallee"/, "official Wallee SDK must be used");
assert.doesNotMatch(wallee, /Authorization:\s*`Basic/, "Basic auth is not valid for Wallee API");
assert.match(wallee, /Environment\.Preview/, "TWINT must default to Wallee preview mode");
assert.match(wallee, /allowedPaymentMethodConfigurations/, "Wallee checkout must be restricted to TWINT");
assert.match(wallee, /line\.quantity \* line\.unitAmountCents/, "Wallee line amount must include quantity");
assert.match(wallee, /if \(!secret \|\|/, "webhook must fail closed without its secret");
assert.match(wallee, /state === TransactionState\.Completed \? "paid" : "failed"/);
assert.match(commerce, /\$method === 'twint' && \$currency !== 'CHF'/);
assert.match(commerce, /foreach \(\['twint', 'pay_later'\] as \$method\)/, "new checkout quotes must not offer Stripe");
assert.doesNotMatch(routes, /stripeRouter|["']\.\/stripe["']/, "Stripe routes must remain disabled");
assert.match(commerce, /'transactionId'=>\(int\)\$attemptRow\['provider_id'\]/, "checkout retries must reuse Wallee transaction");
assert.match(operations, /\$providerRefund \? null : gmdate/, "pending provider refunds cannot be marked settled");
assert.match(operations, /if \(!\$providerRefund\)/, "TWINT refunds cannot create an invoice credit");
assert.match(store, /app-wallee\\\.com/, "Wallee payment-page host must be allowlisted");

console.log("Wallee/TWINT payment regression checks passed");