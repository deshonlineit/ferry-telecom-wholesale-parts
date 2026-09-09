<?php

declare(strict_types=1);

require_once __DIR__ . '/SwissQrInvoice.php';
require_once __DIR__ . '/native-relay.php';

/**
 * Cart, checkout, customer account, and staff order routes.
 *
 * Authentication and CSRF validation are deliberately left to the central
 * router/bootstrap layer. Every query in this module still scopes customer
 * data by the authenticated user's id.
 */

function commerceActiveCustomer(): array
{
    $user = requireUser();
    if (($user['status'] ?? '') !== 'active' || ($user['role'] ?? '') !== 'customer') {
        throw new HttpError(403, 'An active customer account is required.');
    }
    return $user;
}

/**
 * Swiss VAT is determined exclusively from the validated delivery country.
 * Settings and client-provided tax values must never affect a quote or order.
 */
function commerceVatBps(string $country): int
{
    return currencyDeliveryCountry($country) === 'CH' ? 810 : 0;
}

function commerceSaturdayDeliveryAvailable(?DateTimeImmutable $now = null): bool
{
    $zurich = new DateTimeZone('Europe/Zurich');
    $localNow = ($now ?? new DateTimeImmutable('now', $zurich))->setTimezone($zurich);
    return $localNow->format('N') === '5' && $localNow->format('H:i:s') <= '17:00:00';
}

function commerceShippingMethods(string $country, ?DateTimeImmutable $now = null): array
{
    $country = currencyDeliveryCountry($country);
    if ($country === 'CH') {
        $methods = [
            ['code' => 'swiss_post_priority', 'carrier' => 'Swiss Post', 'label' => 'Swiss Post Priority', 'amount_cents' => 600, 'currency' => 'CHF'],
        ];
        if (commerceSaturdayDeliveryAvailable($now)) {
            $methods[] = ['code' => 'swiss_post_saturday', 'carrier' => 'Swiss Post', 'label' => 'Saturday Delivery', 'amount_cents' => 1500, 'currency' => 'CHF'];
        }
        $methods[] = ['code' => 'pickup', 'carrier' => 'Ferry Telecom', 'label' => 'Pick-up', 'amount_cents' => 0, 'currency' => 'CHF'];
        return $methods;
    }
    return [
        ['code' => 'ups_standard', 'carrier' => 'UPS', 'label' => 'UPS Standard', 'amount_cents' => 1500, 'currency' => 'EUR'],
        ['code' => 'ups_express', 'carrier' => 'UPS', 'label' => 'UPS Express', 'amount_cents' => 3000, 'currency' => 'EUR'],
    ];
}

function commerceShippingMethod(string $country, ?string $requestedCode = null, ?DateTimeImmutable $now = null): array
{
    $methods = commerceShippingMethods($country, $now);
    $code = trim((string) $requestedCode);
    if ($code === '') {
        return $methods[0];
    }
    foreach ($methods as $method) {
        if (hash_equals($method['code'], $code)) {
            return $method;
        }
    }
    throw new HttpError(422, 'Choose a shipping method available for the delivery country.');
}

function commercePaymentEligible(PDO $pdo, int $userId, string $paymentMethod): bool
{
    if (!in_array($paymentMethod, ['stripe', 'twint', 'pay_later', 'swiss_qr_invoice'], true)) {
        return false;
    }
    $methods = $paymentMethod === 'pay_later' ? ['pay_later', 'swiss_qr_invoice'] : [$paymentMethod];
    $placeholders = implode(',', array_fill(0, count($methods), '?'));
    $statement = $pdo->prepare(
        "SELECT MAX(enabled) FROM customer_payment_entitlements WHERE user_id=? AND payment_method IN ($placeholders)"
    );
    $statement->execute([$userId, ...$methods]);
    return (bool) $statement->fetchColumn();
}

function commercePaymentAvailableForCountry(string $paymentMethod, string $country): bool
{
    return !in_array($paymentMethod, ['swiss_qr_invoice', 'twint'], true) || strtoupper($country) === 'CH';
}

function commerceResolvePayLaterMethod(string $requestedMethod, string $country): string
{
    if ($requestedMethod !== 'pay_later') return $requestedMethod;
    return strtoupper($country) === 'CH' ? 'swiss_qr_invoice' : 'pay_later';
}

function commerceQrProfile(PDO $pdo, string $currency): ?array
{
    return strtoupper($currency) === 'CHF' ? swissQrEnvironmentProfile() : null;
}

function commercePaymentTerms(PDO $pdo, string $method, string $currency): ?array
{
    if (in_array($method, ['stripe', 'twint'], true)) return null;
    if ($method === 'swiss_qr_invoice') {
        $profile = commerceQrProfile($pdo, $currency);
        if ($profile === null) throw new HttpError(503, 'QR invoice payment is unavailable until a creditor profile is configured.');
        return ['kind' => 'qr_invoice', 'due_days' => 14] + $profile;
    }
    $days = 30;
    $statement = $pdo->prepare("SELECT value FROM settings WHERE name='pay_later_terms_days'");
    $statement->execute();
    $value = $statement->fetchColumn();
    if ($value !== false && ctype_digit((string) $value) && (int) $value > 0 && (int) $value <= 365) $days = (int) $value;
    return ['kind' => 'pay_later', 'due_days' => $days, 'due_date' => gmdate('Y-m-d', strtotime('+' . $days . ' days'))];
}

function commerceStripeBridge(int $orderId, bool $allowPayLaterInvoice = false): array
{
    $pdo = db();
    $statement = $pdo->prepare(
        'SELECT id,number,currency,subtotal_cents,shipping_cents,tax_cents,total_cents,payment_method
         FROM orders WHERE id=?'
    );
    $statement->execute([$orderId]);
    $order = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$order || ($order['payment_method'] !== 'stripe'
        && !($allowPayLaterInvoice && $order['payment_method'] === 'pay_later'))) {
        throw new HttpError(409, 'This order is not eligible for Stripe payment.');
    }
    $attemptStatement = $pdo->prepare(
        "SELECT id FROM payment_attempts
         WHERE order_id=? AND payment_method='stripe' AND state='pending'
         ORDER BY id DESC LIMIT 1"
    );
    $attemptStatement->execute([$orderId]);
    $attemptId = $attemptStatement->fetchColumn();
    if ($attemptId === false) throw new HttpError(409, 'No active Stripe payment attempt exists.');
    $statement = $pdo->prepare('SELECT name,sku,quantity,price_cents FROM order_items WHERE order_id=? ORDER BY id');
    $statement->execute([$orderId]);
    $lines = array_map(static fn(array $line): array => [
        'name' => (string) $line['name'],
        'sku' => (string) $line['sku'],
        'quantity' => (int) $line['quantity'],
        'unitAmountCents' => (int) $line['price_cents'],
    ], $statement->fetchAll(PDO::FETCH_ASSOC));
    if ((int) $order['shipping_cents'] > 0) {
        $lines[] = ['name' => 'Shipping', 'sku' => 'SHIPPING', 'quantity' => 1, 'unitAmountCents' => (int) $order['shipping_cents']];
    }
    if ((int) $order['tax_cents'] > 0) {
        $lines[] = ['name' => 'VAT', 'sku' => 'VAT', 'quantity' => 1, 'unitAmountCents' => (int) $order['tax_cents']];
    }
    $secret = getenv('NATIVE_S2S_SECRET');
    if (!is_string($secret) || $secret === '') throw new HttpError(503, 'Stripe bridge authentication is unavailable.');
    $payload = json_encode([
        'orderId' => (string) $order['id'],
        'attemptId' => (string) $attemptId,
        'orderNumber' => (string) $order['number'],
        'currency' => strtolower((string) $order['currency']),
        'totalCents' => (int) $order['total_cents'],
        'lines' => $lines,
    ], JSON_THROW_ON_ERROR);
    $curl = curl_init('http://localhost:80/api/stripe/native/checkout-session');
    if ($curl === false) throw new HttpError(503, 'Stripe bridge is unavailable.');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Native-Stripe-Bridge-Secret: ' . $secret],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    if (!is_string($raw) || $status < 200 || $status >= 300) {
        error_log('Stripe bridge request failed: HTTP ' . $status . ($error !== '' ? ' transport error' : ''));
        throw new HttpError(502, 'The secure payment page is temporarily unavailable. Retry this order without creating a duplicate.');
    }
    $response = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($response) || !isset($response['id'], $response['url'])) throw new HttpError(502, 'Stripe returned an invalid payment response.');
    $pdo->prepare(
        "UPDATE payment_attempts SET provider_id=?,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND provider_event_id IS NULL"
    )->execute([(string) $response['id'], (int) $attemptId]);
    return ['stripe_checkout_id' => (string) $response['id'], 'stripe_checkout_url' => (string) $response['url']];
}

function commerceWalleeBridge(int $orderId): array
{
    $pdo = db();
    $order = $pdo->prepare('SELECT id,number,currency,total_cents,payment_method FROM orders WHERE id=?');
    $order->execute([$orderId]); $row = $order->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['payment_method'] !== 'twint' || $row['currency'] !== 'CHF') throw new HttpError(409, 'This order is not eligible for TWINT payment.');
    $attempt = $pdo->prepare("SELECT id,provider_id FROM payment_attempts WHERE order_id=? AND payment_method='twint' AND state='pending' ORDER BY id DESC LIMIT 1");
    $attempt->execute([$orderId]); $attemptRow = $attempt->fetch(PDO::FETCH_ASSOC);
    if (!$attemptRow) throw new HttpError(409, 'No active TWINT payment attempt exists.');
    $attemptId = (int)$attemptRow['id'];
    $lines = $pdo->prepare('SELECT name,sku,quantity,price_cents AS unitAmountCents FROM order_items WHERE order_id=? ORDER BY id');
    $lines->execute([$orderId]);
    $secret = getenv('NATIVE_S2S_SECRET');
    if (!is_string($secret) || $secret === '') throw new HttpError(503, 'Wallee bridge authentication is unavailable.');
    $payload = json_encode([
        'orderId'=>(string)$row['id'],
        'attemptId'=>(string)$attemptId,
        'orderNumber'=>(string)$row['number'],
        'currency'=>'chf',
        'totalCents'=>(int)$row['total_cents'],
        'lines'=>$lines->fetchAll(PDO::FETCH_ASSOC),
    ] + ((string)($attemptRow['provider_id'] ?? '') !== '' ? ['transactionId'=>(int)$attemptRow['provider_id']] : []), JSON_THROW_ON_ERROR);
    $curl = curl_init('http://localhost:80/api/wallee/native/checkout');
    if ($curl === false) throw new HttpError(503, 'Wallee bridge is unavailable.');
    curl_setopt_array($curl, [CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-Native-Stripe-Bridge-Secret: '.$secret],CURLOPT_POSTFIELDS=>$payload]);
    $raw=curl_exec($curl); $status=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE); curl_close($curl);
    if (!is_string($raw) || $status<200 || $status>=300) throw new HttpError(502, 'The TWINT payment page is temporarily unavailable. Retry without creating a duplicate.');
    $response=json_decode($raw,true,16,JSON_THROW_ON_ERROR);
    if (!is_array($response) || !isset($response['id'],$response['url'])) throw new HttpError(502, 'Wallee returned an invalid payment response.');
    $pdo->prepare('UPDATE payment_attempts SET provider_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND provider_event_id IS NULL')->execute([(string)$response['id'],(int)$attemptId]);
    return ['wallee_transaction_id'=>(string)$response['id'],'wallee_payment_url'=>(string)$response['url']];
}

function commerceTotals(int $subtotal, string $country, array $shippingMethod): array
{
    $taxBps = commerceVatBps($country);
    $shipping = (int) $shippingMethod['amount_cents'];
    $tax = intdiv((($subtotal + $shipping) * $taxBps) + 5000, 10000);
    return [
        'subtotal_cents' => $subtotal,
        'shipping_cents' => $shipping,
        'tax_cents' => $tax,
        'total_cents' => $subtotal + $shipping + $tax,
        'tax_bps' => $taxBps,
        'shipping_method' => $shippingMethod,
    ];
}

function commerceCart(int $userId, int $groupId, ?string $country = null, ?string $shippingMethodCode = null): array
{
    $pdo = db();
    $context = currencyContext($country);
    if (!$context['pricing_ready']) {
        throw new HttpError(503, 'EUR pricing is not initialized.');
    }
    $statement = $pdo->prepare(
        'SELECT p.id AS product_id, p.name, p.sku, p.image_url, ci.quantity,
                p.stock, p.minimum_quantity,
                COALESCE(gp.price_eur_cents, p.list_price_eur_cents) AS price_eur_cents
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id AND p.active = 1
         LEFT JOIN group_prices gp ON gp.product_id = p.id AND gp.group_id = ?
         WHERE ci.user_id = ?
         ORDER BY p.id'
    );
    $statement->execute([$groupId, $userId]);
    $items = [];
    $subtotal = 0;
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if ($row['price_eur_cents'] === null) {
            throw new HttpError(503, 'EUR pricing is not initialized for a cart product.');
        }
        $eurPrice = (int) $row['price_eur_cents'];
        $price = $context['currency'] === 'CHF'
            ? currencyConvert($eurPrice, 'EUR', 'CHF', $context['exchange_rate']) : $eurPrice;
        $quantity = (int) $row['quantity'];
        $total = $price * $quantity;
        $items[] = [
            'product_id' => (int) $row['product_id'],
            'name' => $row['name'],
            'sku' => $row['sku'],
            'image_url' => $row['image_url'],
            'quantity' => $quantity,
            'stock' => (int) $row['stock'],
            'minimum_quantity' => (int) $row['minimum_quantity'],
            'price_cents' => $price,
            'total_cents' => $total,
        ];
        $subtotal += $total;
    }
    $shippingMethods = commerceShippingMethods($context['country']);
    $shippingMethod = commerceShippingMethod($context['country'], $shippingMethodCode);
    $result = ['items' => $items] + commerceTotals($subtotal, $context['country'], $shippingMethod);
    $result['shipping_methods'] = $shippingMethods;
    $result['country'] = $context['country'];
    $result['currency'] = $context['currency'];
    $result['base_currency'] = 'EUR';
    $result['exchange_rate'] = $context['exchange_rate'];
    return $result;
}

function commerceProfileUser(int $userId): array
{
    $statement = db()->prepare(
        'SELECT id, name, email, company, role, group_id, status
         FROM users WHERE id = ?'
    );
    $statement->execute([$userId]);
    $user = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        throw new HttpError(401, 'Authentication required.');
    }
    $user['id'] = (int) $user['id'];
    $user['group_id'] = (int) $user['group_id'];
    return $user;
}

function commerceAddressInput(array $input, ?array $existing = null): array
{
    $required = ['label', 'name', 'line1', 'postal_code', 'city', 'country'];
    $values = [];
    foreach (['label', 'name', 'company', 'line1', 'line2', 'postal_code', 'city', 'country'] as $field) {
        if (array_key_exists($field, $input)) {
            $limit = match ($field) {
                'label', 'city' => 100,
                'name' => 140,
                'country' => 2,
                default => 190,
            };
            $values[$field] = text($input[$field], $limit);
        } elseif ($existing !== null) {
            $values[$field] = (string) $existing[$field];
        } else {
            $values[$field] = '';
        }
    }
    foreach ($required as $field) {
        if ($values[$field] === '') {
            throw new HttpError(422, 'Please complete all required address fields.');
        }
    }
    $values['country'] = strtoupper($values['country']);
    if (!preg_match('/^[A-Z]{2}$/', $values['country'])) {
        throw new HttpError(422, 'Country must be a two-letter code.');
    }
    // Een bestaand adres buiten Europa blijft bewerkbaar zolang het land niet
    // verandert; een nieuwe bestemming buiten Europa leveren wij niet.
    $keptCountry = strtoupper((string) ($existing['country'] ?? ''));
    if ($values['country'] !== $keptCountry && !in_array($values['country'], currencyDeliveryCountries(), true)) {
        throw new HttpError(422, 'We only deliver within Europe.');
    }
    if (array_key_exists('is_default', $input)) {
        $rawDefault = $input['is_default'];
        if (is_bool($rawDefault)) {
            $values['is_default'] = $rawDefault;
        } elseif ($rawDefault === 0 || $rawDefault === 1 || $rawDefault === '0' || $rawDefault === '1') {
            $values['is_default'] = ((int) $rawDefault === 1);
        } else {
            throw new HttpError(422, 'Default address must be true or false.');
        }
    } else {
        $values['is_default'] = (bool) ($existing['is_default'] ?? false);
    }
    return $values;
}

function commerceAddressRow(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'label' => $row['label'],
        'name' => $row['name'],
        'company' => $row['company'],
        'line1' => $row['line1'],
        'line2' => $row['line2'],
        'postal_code' => $row['postal_code'],
        'city' => $row['city'],
        'country' => $row['country'],
        'is_default' => (bool) $row['is_default'],
    ];
}

function commerceOrderSummary(array $row, bool $includeCustomer = false): array
{
    $order = [
        'id' => (int) $row['id'],
        'number' => $row['number'],
        'status' => $row['status'],
        'subtotal_cents' => (int) $row['subtotal_cents'],
        'tax_cents' => (int) $row['tax_cents'],
        'shipping_cents' => (int) $row['shipping_cents'],
        'shipping_method_code' => $row['shipping_method_code'] ?? null,
        'shipping_method_name' => $row['shipping_method_name'] ?? null,
        'shipping_carrier' => $row['shipping_carrier'] ?? null,
        'total_cents' => (int) $row['total_cents'],
        'created_at' => $row['created_at'],
        'payment_method' => $row['payment_method'],
        'payment_state' => $row['payment_state'] ?? 'pending',
        'currency' => $row['currency'],
    ];
    if ($order['payment_method'] === 'stripe' && $order['status'] === 'on_hold') {
        $order['customer_status_label'] = 'Order Received';
    }
    if ($includeCustomer) {
        $order['customer_name'] = $row['customer_name'];
        $order['customer_email'] = $row['customer_email'];
        $order['tracking'] = $row['tracking'];
    }
    return $order;
}

function commerceGetCart(): never
{
    $user = commerceActiveCustomer();
    respond(commerceCart((int) $user['id'], (int) $user['group_id']));
}

function commerceSetCart(): never
{
    $user = commerceActiveCustomer();
    $input = body();
    $productId = integer($input['product_id'] ?? null, 1);
    $quantity = integer($input['quantity'] ?? null, 0, 1000000);
    $pdo = db();

    try {
        $pdo->beginTransaction();
        $statement = $pdo->prepare(
            "SELECT id,group_id FROM users
             WHERE id=? AND role='customer' AND status='active' FOR UPDATE"
        );
        $statement->execute([(int) $user['id']]);
        $lockedUser = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$lockedUser) {
            throw new HttpError(403, 'An active customer account is required.');
        }
        if ($quantity === 0) {
            $statement = $pdo->prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?');
            $statement->execute([(int) $lockedUser['id'], $productId]);
        } else {
            $statement = $pdo->prepare(
                'SELECT stock,minimum_quantity FROM products WHERE id=? AND active=1 FOR UPDATE'
            );
            $statement->execute([$productId]);
            $product = $statement->fetch(PDO::FETCH_ASSOC);
            if (!$product) {
                throw new HttpError(404, 'Product not found.');
            }
            if ($quantity < (int) $product['minimum_quantity']) {
                throw new HttpError(422, 'Quantity is below the minimum for this product.');
            }
            if ($quantity > (int) $product['stock']) {
                throw new HttpError(409, 'The requested quantity is no longer in stock.');
            }
            $statement = $pdo->prepare(
                'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)'
            );
            $statement->execute([(int) $lockedUser['id'], $productId, $quantity]);
        }
        $cart = commerceCart((int) $lockedUser['id'], (int) $lockedUser['group_id']);
        $pdo->commit();
        respond($cart);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceQuickAddCart(): never
{
    $sessionUser = commerceActiveCustomer();
    $input = body();
    $productId = integer($input['product_id'] ?? null, 1);
    $addedQuantity = integer($input['quantity'] ?? null, 1, 1000000);
    $pdo = db();
    try {
        $pdo->beginTransaction();
        // The user row is the common first lock for every cart writer and checkout.
        $statement = $pdo->prepare(
            "SELECT id,group_id FROM users
             WHERE id=? AND role='customer' AND status='active' FOR UPDATE"
        );
        $statement->execute([(int) $sessionUser['id']]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            throw new HttpError(403, 'An active customer account is required.');
        }

        $statement = $pdo->prepare(
            'SELECT stock,minimum_quantity,list_price_eur_cents AS price_eur_cents
             FROM products WHERE id=? AND active=1 FOR UPDATE'
        );
        $statement->execute([$productId]);
        $product = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$product) {
            throw new HttpError(404, 'Product not found.');
        }
        $statement = $pdo->prepare(
            'SELECT price_eur_cents FROM group_prices WHERE product_id=? AND group_id=?'
        );
        $statement->execute([$productId, (int) $user['group_id']]);
        $groupPrice = $statement->fetchColumn();
        if ($groupPrice !== false && $groupPrice !== null) {
            $product['price_eur_cents'] = $groupPrice;
        }
        if ($product['price_eur_cents'] === null) {
            throw new HttpError(409, 'A product price is unavailable.');
        }

        $statement = $pdo->prepare(
            'SELECT quantity FROM cart_items WHERE user_id=? AND product_id=? FOR UPDATE'
        );
        $statement->execute([(int) $user['id'], $productId]);
        $existing = $statement->fetchColumn();
        $quantity = ($existing === false ? 0 : (int) $existing) + $addedQuantity;
        if ($quantity > 1000000) {
            throw new HttpError(422, 'The resulting quantity is too large.');
        }
        if ($quantity < (int) $product['minimum_quantity']) {
            throw new HttpError(422, 'Quantity is below the minimum for this product.');
        }
        if ($quantity > (int) $product['stock']) {
            throw new HttpError(409, 'The requested quantity is no longer in stock.');
        }

        // Resolve currency and canonical pricing before changing the cart.
        $context = currencyContext();
        if ($context['currency'] === 'CHF') {
            currencyConvert((int) $product['price_eur_cents'], 'EUR', 'CHF', $context['exchange_rate']);
        }
        $statement = $pdo->prepare(
            'INSERT INTO cart_items (user_id,product_id,quantity) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)'
        );
        $statement->execute([(int) $user['id'], $productId, $quantity]);
        $cart = commerceCart((int) $user['id'], (int) $user['group_id']);
        $pdo->commit();
        respond($cart);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceClearCart(): never
{
    $user = commerceActiveCustomer();
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $statement = $pdo->prepare(
            "SELECT id,group_id FROM users
             WHERE id=? AND role='customer' AND status='active' FOR UPDATE"
        );
        $statement->execute([(int) $user['id']]);
        $lockedUser = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$lockedUser) {
            throw new HttpError(403, 'An active customer account is required.');
        }
        $statement = $pdo->prepare('DELETE FROM cart_items WHERE user_id = ?');
        $statement->execute([(int) $lockedUser['id']]);
        $cart = commerceCart((int) $lockedUser['id'], (int) $lockedUser['group_id']);
        $pdo->commit();
        respond($cart);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceCheckoutAddress(array $input, int $userId, bool $lock = false): array
{
    if (array_key_exists('address_id', $input)) {
        $id = integer($input['address_id'], 1);
        $statement = db()->prepare(
            'SELECT id,label,name,company,line1,line2,postal_code,city,country,is_default
             FROM addresses WHERE id=? AND user_id=?' . ($lock ? ' FOR UPDATE' : '')
        );
        $statement->execute([$id, $userId]);
        $address = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$address) {
            throw new HttpError(404, 'Address not found.');
        }
        // An address saved before the Europe-only rule stays editable, but it may
        // not be used to quote or ship an order.
        currencyDeliveryCountry((string) $address['country']);
        return commerceAddressRow($address);
    }
    if (!isset($input['address']) || !is_array($input['address'])) {
        throw new HttpError(422, 'Choose an owned address or provide a delivery address.');
    }
    $raw = $input['address'];
    $raw['label'] ??= 'Delivery';
    $address = commerceAddressInput($raw);
    $address['id'] = 0;
    $address['is_default'] = false;
    return $address;
}

function commerceQuoteFingerprint(array $cart): string
{
    $data = [
        'country' => $cart['country'],
        'currency' => $cart['currency'],
        'rate_ppm' => $cart['exchange_rate']['rate_ppm'] ?? null,
        'rate_date' => $cart['exchange_rate']['rate_date'] ?? null,
        'items' => array_map(static fn(array $item): array => [
            'product_id' => $item['product_id'], 'quantity' => $item['quantity'],
            'price_cents' => $item['price_cents'], 'total_cents' => $item['total_cents'],
        ], $cart['items']),
        'subtotal_cents' => $cart['subtotal_cents'],
        'shipping_cents' => $cart['shipping_cents'],
        'shipping_method' => $cart['shipping_method'],
        'shipping_methods' => $cart['shipping_methods'] ?? [],
        'saturday_delivery_available' => in_array('swiss_post_saturday', array_column($cart['shipping_methods'] ?? [], 'code'), true),
        'tax_cents' => $cart['tax_cents'],
        'total_cents' => $cart['total_cents'],
    ];
    return hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
}

function commerceCheckoutQuote(): never
{
    $user = commerceActiveCustomer();
    $input = body();
    $address = commerceCheckoutAddress($input, (int) $user['id']);
    $shippingMethodCode = text($input['shipping_method'] ?? '', 40);
    $cart = commerceCart(
        (int) $user['id'],
        (int) $user['group_id'],
        (string) $address['country'],
        $shippingMethodCode !== '' ? $shippingMethodCode : null
    );
    if (!$cart['items']) {
        throw new HttpError(422, 'Your cart is empty.');
    }
    $methods = [];
    foreach (['stripe', 'twint', 'pay_later'] as $method) {
        if (commercePaymentEligible(db(), (int) $user['id'], $method)) {
            try {
                if (!commercePaymentAvailableForCountry($method, (string) $address['country'])) continue;
                $resolvedMethod = commerceResolvePayLaterMethod($method, (string) $address['country']);
                $terms = commercePaymentTerms(db(), $resolvedMethod, (string) $cart['currency']);
                $methods[] = [
                    'code' => $method,
                    'variant' => $resolvedMethod === 'swiss_qr_invoice' ? 'swiss_qr' : $method,
                    'terms' => $terms,
                ];
            } catch (HttpError) {
                // Swiss Pay Later never bypasses the required configured creditor profile.
            }
        }
    }
    $token = bin2hex(random_bytes(32));
    startSession();
    $_SESSION['checkout_quotes'] ??= [];
    foreach ($_SESSION['checkout_quotes'] as $oldToken => $quote) {
        if ((int) ($quote['expires'] ?? 0) < time()) {
            unset($_SESSION['checkout_quotes'][$oldToken]);
        }
    }
    $_SESSION['checkout_quotes'][$token] = [
        'user_id' => (int) $user['id'],
        'fingerprint' => commerceQuoteFingerprint($cart),
        'address' => $address,
        'shipping_method' => $cart['shipping_method'],
        'expires' => time() + 600,
    ];
    $cart['quote_token'] = $token;
    $cart['address'] = $address;
    $cart['payment_methods'] = $methods;
    $_SESSION['currency_country'] = (string) $cart['country'];
    respond($cart);
}

function commerceCheckout(): never
{
    $sessionUser = commerceActiveCustomer();
    $input = body();
    $quoteToken = text($input['quote_token'] ?? '', 128);
    $paymentMethod = text($input['payment_method'] ?? '', 30);
    $shippingMethodCode = text($input['shipping_method'] ?? '', 40);
    if (!in_array($paymentMethod, ['stripe', 'twint', 'pay_later'], true)) {
        throw new HttpError(422, 'Choose a supported payment method.');
    }
    $notes = text($input['notes'] ?? '', 4000);
    $idempotencyKey = text($input['idempotency_key'] ?? '', 100);
    if ($idempotencyKey === '') {
        throw new HttpError(422, 'An idempotency key is required.');
    }

    $pdo = db();
    $replay = $pdo->prepare(
        'SELECT id,number,total_cents,status,currency FROM orders WHERE user_id=? AND idempotency_key=?'
    );
    $replay->execute([(int) $sessionUser['id'], $idempotencyKey]);
    $existingReplay = $replay->fetch(PDO::FETCH_ASSOC);
    if ($existingReplay) {
        $response = ['order' => [
            'id' => (int) $existingReplay['id'], 'number' => $existingReplay['number'],
            'total_cents' => (int) $existingReplay['total_cents'], 'status' => $existingReplay['status'],
            'currency' => $existingReplay['currency'],
        ]];
        $method = db()->prepare('SELECT payment_method FROM orders WHERE id=?');
        $method->execute([(int) $existingReplay['id']]);
        $methodName = $method->fetchColumn();
        if ($methodName === 'stripe') $response += commerceStripeBridge((int) $existingReplay['id']);
        if ($methodName === 'twint') $response += commerceWalleeBridge((int) $existingReplay['id']);
        respond($response);
    }
    startSession();
    $acceptedQuote = $_SESSION['checkout_quotes'][$quoteToken] ?? null;
    if (!is_array($acceptedQuote) || !hash_equals((string) ($acceptedQuote['user_id'] ?? ''), (string) $sessionUser['id'])
        || (int) ($acceptedQuote['expires'] ?? 0) < time()) {
        throw new HttpError(409, 'The checkout quote is missing or expired. Request a new quote.');
    }
    try {
        $pdo->beginTransaction();

        // The user row serializes checkouts for this customer, including
        // concurrent requests carrying the same idempotency key.
        $statement = $pdo->prepare(
            "SELECT id, group_id, role, status FROM users WHERE id = ? FOR UPDATE"
        );
        $statement->execute([(int) $sessionUser['id']]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$user || $user['role'] !== 'customer' || $user['status'] !== 'active') {
            throw new HttpError(403, 'An active customer account is required.');
        }

        $statement = $pdo->prepare(
            'SELECT id, number, total_cents, status, currency FROM orders
             WHERE user_id = ? AND idempotency_key = ?'
        );
        $statement->execute([(int) $user['id'], $idempotencyKey]);
        $existing = $statement->fetch(PDO::FETCH_ASSOC);
        if ($existing) {
            $pdo->commit();
            $response = ['order' => [
                'id' => (int) $existing['id'],
                'number' => $existing['number'],
                'total_cents' => (int) $existing['total_cents'],
                'status' => $existing['status'],
                'currency' => $existing['currency'],
            ]];
            $method = $pdo->prepare('SELECT payment_method FROM orders WHERE id=?');
            $method->execute([(int) $existing['id']]);
            $methodName = $method->fetchColumn();
            if ($methodName === 'stripe') $response += commerceStripeBridge((int) $existing['id']);
            if ($methodName === 'twint') $response += commerceWalleeBridge((int) $existing['id']);
            respond($response);
        }

        $address = commerceCheckoutAddress($input, (int) $user['id'], true);
        if ($address != $acceptedQuote['address']) {
            throw new HttpError(409, 'The delivery address changed. Request a new quote.');
        }
        if (!commercePaymentEligible($pdo, (int) $user['id'], $paymentMethod)) {
            throw new HttpError(403, 'This payment method is not enabled for your account.');
        }
        $paymentMethod = commerceResolvePayLaterMethod($paymentMethod, (string) $address['country']);
        if (!commercePaymentAvailableForCountry($paymentMethod, (string) $address['country'])) {
            throw new HttpError(422, 'This payment method is unavailable for the delivery country.');
        }
        $paymentTerms = commercePaymentTerms($pdo, $paymentMethod, (string) currencyContext((string) $address['country'])['currency']);
        $acceptedShippingMethod = $acceptedQuote['shipping_method'] ?? null;
        if (!is_array($acceptedShippingMethod)
            || $shippingMethodCode === ''
            || !hash_equals((string) ($acceptedShippingMethod['code'] ?? ''), $shippingMethodCode)) {
            throw new HttpError(422, 'The shipping method does not match the accepted quote.');
        }
        $context = currencyContext((string) $address['country']);

        $statement = $pdo->prepare(
            'SELECT product_id, quantity FROM cart_items
             WHERE user_id = ? ORDER BY product_id FOR UPDATE'
        );
        $statement->execute([(int) $user['id']]);
        $cartRows = $statement->fetchAll(PDO::FETCH_ASSOC);
        if (!$cartRows) {
            throw new HttpError(422, 'Your cart is empty.');
        }

        // Lock one product at a time in sorted primary-key order. This makes
        // lock acquisition deterministic across simultaneous checkouts.
        $productStatement = $pdo->prepare(
            'SELECT p.id, p.sku, p.name, p.stock, p.minimum_quantity, p.active,
                    COALESCE(gp.price_eur_cents, p.list_price_eur_cents) AS price_eur_cents
             FROM products p
             LEFT JOIN group_prices gp ON gp.product_id = p.id AND gp.group_id = ?
             WHERE p.id = ? FOR UPDATE'
        );
        $items = [];
        $subtotal = 0;
        foreach ($cartRows as $cartRow) {
            $productStatement->execute([(int) $user['group_id'], (int) $cartRow['product_id']]);
            $product = $productStatement->fetch(PDO::FETCH_ASSOC);
            $quantity = (int) $cartRow['quantity'];
            if (!$product || !(bool) $product['active']) {
                throw new HttpError(409, 'A product in your cart is no longer available.');
            }
            if ($quantity < (int) $product['minimum_quantity']) {
                throw new HttpError(409, 'A product quantity no longer meets its minimum.');
            }
            if ($quantity > (int) $product['stock']) {
                throw new HttpError(409, 'Stock changed. Please review your cart before checking out.');
            }
            if ($product['price_eur_cents'] === null) {
                throw new HttpError(409, 'A product price is unavailable. Request a new quote later.');
            }
            $eurPrice = (int) $product['price_eur_cents'];
            $price = $context['currency'] === 'CHF'
                ? currencyConvert($eurPrice, 'EUR', 'CHF', $context['exchange_rate']) : $eurPrice;
            $lineTotal = $price * $quantity;
            $items[] = [
                'product_id' => (int) $product['id'],
                'sku' => $product['sku'],
                'name' => $product['name'],
                'quantity' => $quantity,
                'price_cents' => $price,
                'price_eur_cents' => $eurPrice,
                'total_cents' => $lineTotal,
            ];
            $subtotal += $lineTotal;
        }

        $shippingMethod = commerceShippingMethod((string) $address['country'], $shippingMethodCode);
        $totals = commerceTotals($subtotal, $context['country'], $shippingMethod);
        $recalculated = [
            'items' => $items, 'country' => $context['country'], 'currency' => $context['currency'],
            'exchange_rate' => $context['exchange_rate'],
            'shipping_methods' => commerceShippingMethods((string) $address['country']),
        ] + $totals;
        if (!hash_equals((string) $acceptedQuote['fingerprint'], commerceQuoteFingerprint($recalculated))) {
            throw new HttpError(409, 'Prices, quantities, country, or exchange rate changed. Request a new quote.');
        }
        $number = 'TS-' . gmdate('Ymd') . '-' . strtoupper(bin2hex(random_bytes(5)));
        if ($paymentMethod === 'swiss_qr_invoice' && $paymentTerms !== null) {
            $paymentTerms = swissQrTermsForOrder($paymentTerms, $number);
        }
        $addressSnapshot = commerceAddressRow($address);
        $statement = $pdo->prepare(
            'INSERT INTO orders
             (number, user_id, status, subtotal_cents, tax_cents, shipping_cents,
               total_cents, tax_bps, currency, exchange_rate_ppm, exchange_rate_date,
               base_currency, address_json, shipping_method_code, shipping_method_name,
               shipping_carrier, payment_method, payment_state, payment_reference_type, payment_reference,
               payment_terms_json, checkout_snapshot, notes,
              tracking, idempotency_key, stock_restored)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
        );
        $statement->execute([
            $number, (int) $user['id'], 'on_hold',
            $totals['subtotal_cents'], $totals['tax_cents'], $totals['shipping_cents'],
            $totals['total_cents'], $totals['tax_bps'], $context['currency'],
            $context['currency'] === 'CHF' ? $context['exchange_rate']['rate_ppm'] : null,
            $context['currency'] === 'CHF' ? $context['exchange_rate']['rate_date'] : null,
            'EUR',
            json_encode($addressSnapshot, JSON_THROW_ON_ERROR),
             $shippingMethod['code'], $shippingMethod['label'], $shippingMethod['carrier'],
              $paymentMethod, in_array($paymentMethod, ['stripe', 'twint'], true) ? 'pending' : 'open',
              $paymentTerms['reference_type'] ?? null, $paymentTerms['reference'] ?? null,
              $paymentTerms === null ? null : json_encode($paymentTerms, JSON_THROW_ON_ERROR),
              json_encode([
                  'quote_fingerprint' => $acceptedQuote['fingerprint'],
                  'accepted_at' => gmdate('c'), 'shipping_methods' => $recalculated['shipping_methods'] ?? [],
                  'shipping_method' => $shippingMethod, 'payment_terms' => $paymentTerms,
              ], JSON_THROW_ON_ERROR),
              $notes, '', $idempotencyKey,
        ]);
        $orderId = (int) $pdo->lastInsertId();

        $itemInsert = $pdo->prepare(
            'INSERT INTO order_items
             (order_id, product_id, name, sku, quantity, price_cents, total_cents, price_eur_cents)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stockUpdate = $pdo->prepare(
            'UPDATE products SET stock = stock - ?
             WHERE id = ? AND stock >= ?'
        );
        foreach ($items as $item) {
            $stockUpdate->execute([$item['quantity'], $item['product_id'], $item['quantity']]);
            if ($stockUpdate->rowCount() !== 1) {
                throw new HttpError(409, 'Stock changed. Please review your cart before checking out.');
            }
            $itemInsert->execute([
                $orderId, $item['product_id'], $item['name'], $item['sku'],
                $item['quantity'], $item['price_cents'], $item['total_cents'], $item['price_eur_cents'],
            ]);
        }
        $statement = $pdo->prepare(
            'INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)'
        );
        $initialStatus = 'on_hold';
        $label = $paymentMethod === 'stripe'
            ? 'Order received; awaiting card payment confirmation.'
            : 'Order received; awaiting payment.';
        $statement->execute([$orderId, $initialStatus, $label]);
        $pdo->prepare(
            'INSERT INTO payment_attempts(order_id,payment_method,state,payload) VALUES(?,?,?,?)'
        )->execute([$orderId, $paymentMethod, in_array($paymentMethod, ['stripe', 'twint'], true) ? 'pending' : 'open',
            json_encode(['created_by' => 'checkout'], JSON_THROW_ON_ERROR)]);
        $statement = $pdo->prepare('DELETE FROM cart_items WHERE user_id = ?');
        $statement->execute([(int) $user['id']]);
        enqueue('order.created', ['order_id' => $orderId, 'number' => $number, 'test_mode' => true]);
        audit('checkout', 'order', $orderId, ['number' => $number, 'test_mode' => true]);
        $pdo->commit();
        unset($_SESSION['checkout_quotes'][$quoteToken]);
        $_SESSION['currency_country'] = (string) $context['country'];

        $responseOrder = [
            'id' => $orderId,
            'number' => $number,
            'total_cents' => $totals['total_cents'],
            'status' => $initialStatus,
            'currency' => $context['currency'],
        ];
        if (in_array($paymentMethod, ['stripe', 'twint'], true)) $responseOrder['customer_status_label'] = 'Order Received';
        $response = ['order' => $responseOrder];
        if ($paymentMethod === 'stripe') $response += commerceStripeBridge($orderId);
        if ($paymentMethod === 'twint') $response += commerceWalleeBridge($orderId);
        respond($response);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceListOrders(): never
{
    $user = commerceActiveCustomer();
    $statement = db()->prepare(
        'SELECT id, number, status, subtotal_cents, tax_cents, shipping_cents,
                 shipping_method_code, shipping_method_name, shipping_carrier,
                 total_cents, created_at, payment_method, currency
         FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC'
    );
    $statement->execute([(int) $user['id']]);
    $orders = array_map(
        static fn(array $row): array => commerceOrderSummary($row),
        $statement->fetchAll(PDO::FETCH_ASSOC)
    );
    respond(['orders' => $orders]);
}

function commerceOrderDetail(int $orderId): never
{
    $user = commerceActiveCustomer();
    $pdo = db();
    $statement = $pdo->prepare(
        'SELECT id, number, status, subtotal_cents, tax_cents, shipping_cents,
                shipping_method_code, shipping_method_name, shipping_carrier,
                total_cents, tax_bps, currency, address_json, payment_method,
                 notes, tracking, created_at, payment_state, payment_terms_json
         FROM orders WHERE id = ? AND user_id = ?'
    );
    $statement->execute([$orderId, (int) $user['id']]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new HttpError(404, 'Order not found.');
    }
    $order = commerceOrderSummary($row);
    $order['tax_bps'] = (int) $row['tax_bps'];
    $order['currency'] = $row['currency'];
    $order['notes'] = $row['notes'];
    $order['tracking'] = $row['tracking'];
    $order['payment_state'] = $row['payment_state'];
    $order['payment_terms'] = $row['payment_terms_json'] === null ? null
        : json_decode((string) $row['payment_terms_json'], true, 32, JSON_THROW_ON_ERROR);
    $order['pay_invoice_eligible'] = $row['payment_method'] === 'pay_later'
        && $row['status'] === 'completed'
        && in_array($row['payment_state'], ['open', 'failed', 'expired'], true)
        && commercePaymentEligible($pdo, (int) $user['id'], 'stripe');

    $statement = $pdo->prepare(
        'SELECT id, product_id, name, sku, quantity, price_cents, total_cents
         FROM order_items WHERE order_id = ? ORDER BY id'
    );
    $statement->execute([$orderId]);
    $items = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $item) {
        foreach (['id', 'product_id', 'quantity', 'price_cents', 'total_cents'] as $field) {
            $item[$field] = (int) $item[$field];
        }
        $items[] = $item;
    }
    $statement = $pdo->prepare(
        'SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id'
    );
    $statement->execute([$orderId]);
    respond([
        'order' => $order,
        'items' => $items,
        'address' => json_decode((string) $row['address_json'], true, 16, JSON_THROW_ON_ERROR),
        'events' => $statement->fetchAll(PDO::FETCH_ASSOC),
    ]);
}

function commercePayInvoice(int $orderId): never
{
    $user = commerceActiveCustomer();
    $statement = db()->prepare(
        "SELECT id FROM orders
         WHERE id=? AND user_id=? AND payment_method='pay_later' AND status='completed'
           AND payment_state IN ('open','failed','expired')"
    );
    $statement->execute([$orderId, (int) $user['id']]);
    if (!$statement->fetchColumn()) throw new HttpError(409, 'This invoice is not eligible for online payment.');
    if (!commercePaymentEligible(db(), (int) $user['id'], 'stripe')) {
        throw new HttpError(403, 'Stripe payment is not enabled for your account.');
    }
    $pending = db()->prepare(
        "SELECT id FROM payment_attempts WHERE order_id=? AND payment_method='stripe' AND state='pending'
         ORDER BY id DESC LIMIT 1"
    );
    $pending->execute([$orderId]);
    if ($pending->fetchColumn() === false) {
        db()->prepare(
            "INSERT INTO payment_attempts(order_id,payment_method,state,payload)
             VALUES(?,'stripe','pending',?)"
        )->execute([$orderId, json_encode(['created_by' => 'pay_invoice'], JSON_THROW_ON_ERROR)]);
    }
    respond(commerceStripeBridge($orderId, true));
}

function commerceGetProfile(): never
{
    $user = requireUser();
    respond(['user' => commerceProfileUser((int) $user['id'])]);
}

function commerceUpdateProfile(): never
{
    $user = requireUser();
    $input = body();
    $name = text($input['name'] ?? '', 140);
    $company = text($input['company'] ?? '', 190);
    if ($name === '') {
        throw new HttpError(422, 'Name is required.');
    }
    $statement = db()->prepare('UPDATE users SET name = ?, company = ? WHERE id = ?');
    $statement->execute([$name, $company, (int) $user['id']]);
    audit('profile.updated', 'user', (int) $user['id']);
    respond(['user' => commerceProfileUser((int) $user['id'])]);
}

function commerceListAddresses(): never
{
    $user = requireUser();
    $statement = db()->prepare(
        'SELECT id, label, name, company, line1, line2, postal_code, city, country, is_default
         FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id'
    );
    $statement->execute([(int) $user['id']]);
    respond(['addresses' => array_map(
        static fn(array $row): array => commerceAddressRow($row),
        $statement->fetchAll(PDO::FETCH_ASSOC)
    )]);
}

function commerceCreateAddress(): never
{
    $user = requireUser();
    $values = commerceAddressInput(body());
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $lock = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
        $lock->execute([(int) $user['id']]);
        $count = $pdo->prepare('SELECT COUNT(*) FROM addresses WHERE user_id = ?');
        $count->execute([(int) $user['id']]);
        $values['is_default'] = $values['is_default'] || ((int) $count->fetchColumn() === 0);
        if ($values['is_default']) {
            $clear = $pdo->prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?');
            $clear->execute([(int) $user['id']]);
        }
        $statement = $pdo->prepare(
            'INSERT INTO addresses
             (user_id, label, name, company, line1, line2, postal_code, city, country, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            (int) $user['id'], $values['label'], $values['name'], $values['company'],
            $values['line1'], $values['line2'], $values['postal_code'], $values['city'],
            $values['country'], $values['is_default'] ? 1 : 0,
        ]);
        $id = (int) $pdo->lastInsertId();
        audit('address.created', 'address', $id);
        $pdo->commit();
        $values['id'] = $id;
        respond(['address' => commerceAddressRow($values)], 201);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceUpdateAddress(int $addressId): never
{
    $user = requireUser();
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $lock = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
        $lock->execute([(int) $user['id']]);
        $statement = $pdo->prepare(
            'SELECT id, label, name, company, line1, line2, postal_code, city, country, is_default
             FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE'
        );
        $statement->execute([$addressId, (int) $user['id']]);
        $existing = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            throw new HttpError(404, 'Address not found.');
        }
        $values = commerceAddressInput(body(), $existing);
        if ((bool) $existing['is_default'] && !$values['is_default']) {
            // There must always be a default while any address exists.
            $values['is_default'] = true;
        }
        if ($values['is_default']) {
            $clear = $pdo->prepare(
                'UPDATE addresses SET is_default = 0 WHERE user_id = ? AND id <> ?'
            );
            $clear->execute([(int) $user['id'], $addressId]);
        }
        $statement = $pdo->prepare(
            'UPDATE addresses SET label = ?, name = ?, company = ?, line1 = ?,
             line2 = ?, postal_code = ?, city = ?, country = ?, is_default = ?
             WHERE id = ? AND user_id = ?'
        );
        $statement->execute([
            $values['label'], $values['name'], $values['company'], $values['line1'],
            $values['line2'], $values['postal_code'], $values['city'], $values['country'],
            $values['is_default'] ? 1 : 0, $addressId, (int) $user['id'],
        ]);
        audit('address.updated', 'address', $addressId);
        $pdo->commit();
        $values['id'] = $addressId;
        respond(['address' => commerceAddressRow($values)]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceDeleteAddress(int $addressId): never
{
    $user = requireUser();
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $lock = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
        $lock->execute([(int) $user['id']]);
        $statement = $pdo->prepare(
            'SELECT is_default FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE'
        );
        $statement->execute([$addressId, (int) $user['id']]);
        $wasDefault = $statement->fetchColumn();
        if ($wasDefault === false) {
            throw new HttpError(404, 'Address not found.');
        }
        $statement = $pdo->prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?');
        $statement->execute([$addressId, (int) $user['id']]);
        if ((bool) $wasDefault) {
            $statement = $pdo->prepare(
                'UPDATE addresses SET is_default = 1
                 WHERE user_id = ? ORDER BY id LIMIT 1'
            );
            $statement->execute([(int) $user['id']]);
        }
        audit('address.deleted', 'address', $addressId);
        $pdo->commit();
        respond(['success' => true]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceAdminOrders(): never
{
    requireStaff();
    $statement = db()->prepare(
        'SELECT o.id, o.number, o.status, o.subtotal_cents, o.tax_cents,
                o.shipping_cents, o.shipping_method_code, o.shipping_method_name,
                o.shipping_carrier, o.total_cents, o.created_at, o.payment_method, o.payment_state,
                 o.tracking, o.currency, u.name AS customer_name, u.email AS customer_email
         FROM orders o JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC, o.id DESC'
    );
    $statement->execute();
    $orders = array_map(
        static fn(array $row): array => commerceOrderSummary($row, true),
        $statement->fetchAll(PDO::FETCH_ASSOC)
    );
    respond(['orders' => $orders]);
}

function commerceAdminOrderDetail(int $orderId): never
{
    requireStaff();
    $pdo = db();
    $statement = $pdo->prepare(
        'SELECT o.id,o.number,o.status,o.subtotal_cents,o.tax_cents,o.shipping_cents,
                o.shipping_method_code,o.shipping_method_name,o.shipping_carrier,o.total_cents,
                o.tax_bps,o.currency,o.address_json,o.payment_method,o.payment_state,o.notes,
                o.tracking,o.created_at,u.name customer_name,u.email customer_email,u.company customer_company
         FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?'
    );
    $statement->execute([$orderId]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new HttpError(404, 'Order not found.');
    $order = commerceOrderSummary($row, true);
    foreach (['tax_bps'] as $field) $order[$field] = (int)$row[$field];
    foreach (['currency','notes','tracking','customer_name','customer_email','customer_company'] as $field) {
        $order[$field] = $row[$field];
    }
    $statement = $pdo->prepare(
        "SELECT oi.id,oi.product_id,oi.name,oi.sku,oi.quantity,oi.price_cents,oi.total_cents,
                COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id
                          WHERE ri.order_item_id=oi.id AND r.status<>'rejected'),0) previously_returned_quantity
         FROM order_items oi WHERE oi.order_id=? ORDER BY oi.id"
    );
    $statement->execute([$orderId]);
    $items = $statement->fetchAll(PDO::FETCH_ASSOC);
    foreach ($items as &$item) {
        foreach (['id','product_id','quantity','price_cents','total_cents','previously_returned_quantity'] as $field) $item[$field] = (int)$item[$field];
        $item['available_quantity'] = max(0, $item['quantity'] - $item['previously_returned_quantity']);
    }
    unset($item);
    $statement = $pdo->prepare('SELECT status,note,created_at FROM order_events WHERE order_id=? ORDER BY id DESC');
    $statement->execute([$orderId]);
    respond([
        'order' => $order,
        'items' => $items,
        'address' => json_decode((string)$row['address_json'], true, 16, JSON_THROW_ON_ERROR),
        'events' => $statement->fetchAll(PDO::FETCH_ASSOC),
    ]);
}

function commerceAdminUpdateOrder(int $orderId): never
{
    requireStaff();
    $input = body();
    $newStatus = text($input['status'] ?? '', 30);
    $note = text($input['note'] ?? '', 4000);
    if (!in_array($newStatus, ['on_hold', 'processing', 'shipped', 'completed', 'cancelled'], true)) {
        throw new HttpError(422, 'Unsupported order status.');
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $statement = $pdo->prepare(
            'SELECT id, number, status, tracking, stock_restored
             FROM orders WHERE id = ? FOR UPDATE'
        );
        $statement->execute([$orderId]);
        $order = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$order) {
            throw new HttpError(404, 'Order not found.');
        }
        $oldStatus = $order['status'];
        $allowed = [
            'on_hold' => ['on_hold', 'processing', 'cancelled'],
            'processing' => ['processing', 'shipped', 'cancelled'],
            'shipped' => ['shipped', 'completed'],
            'completed' => ['completed'],
            'cancelled' => ['cancelled', 'on_hold'],
        ];
        if (!in_array($newStatus, $allowed[$oldStatus] ?? [], true)) {
            throw new HttpError(409, 'That order status transition is not allowed.');
        }
        $tracking = array_key_exists('tracking', $input)
            ? text($input['tracking'], 190)
            : (string) $order['tracking'];

        if ($newStatus === 'cancelled' && !(bool) $order['stock_restored']) {
            $statement = $pdo->prepare(
                'SELECT product_id, quantity FROM order_items
                 WHERE order_id = ? ORDER BY product_id'
            );
            $statement->execute([$orderId]);
            $items = $statement->fetchAll(PDO::FETCH_ASSOC);
            $productLock = $pdo->prepare('SELECT id FROM products WHERE id = ? FOR UPDATE');
            $restore = $pdo->prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
            foreach ($items as $item) {
                $productLock->execute([(int) $item['product_id']]);
                if (!$productLock->fetchColumn()) {
                    throw new HttpError(409, 'An order product can no longer be restored.');
                }
                $restore->execute([(int) $item['quantity'], (int) $item['product_id']]);
            }
            $statement = $pdo->prepare('UPDATE orders SET stock_restored = 1 WHERE id = ?');
            $statement->execute([$orderId]);
        }
        if ($oldStatus === 'cancelled' && $newStatus === 'on_hold' && (bool) $order['stock_restored']) {
            $statement = $pdo->prepare(
                'SELECT product_id, quantity FROM order_items
                 WHERE order_id = ? ORDER BY product_id'
            );
            $statement->execute([$orderId]);
            $items = $statement->fetchAll(PDO::FETCH_ASSOC);
            $productLock = $pdo->prepare('SELECT stock FROM products WHERE id = ? FOR UPDATE');
            $reserve = $pdo->prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
            foreach ($items as $item) {
                $productLock->execute([(int)$item['product_id']]);
                $stock = $productLock->fetchColumn();
                if ($stock === false || (int)$stock < (int)$item['quantity']) {
                    throw new HttpError(409, 'This cancelled order cannot be reopened because a product no longer has enough stock.');
                }
                $reserve->execute([(int)$item['quantity'], (int)$item['product_id']]);
            }
            $pdo->prepare('UPDATE orders SET stock_restored = 0 WHERE id = ?')->execute([$orderId]);
        }

        $statement = $pdo->prepare(
            'UPDATE orders SET status = ?, tracking = ? WHERE id = ?'
        );
        $statement->execute([$newStatus, $tracking, $orderId]);
        if ($newStatus !== $oldStatus || $note !== '') {
            $statement = $pdo->prepare(
                'INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)'
            );
            $statement->execute([$orderId, $newStatus, $note]);
        }
        enqueue('order.status_changed', [
            'order_id' => $orderId,
            'number' => $order['number'],
            'status' => $newStatus,
            'test_mode' => true,
        ]);
        audit('order.status_updated', 'order', $orderId, [
            'from' => $oldStatus,
            'to' => $newStatus,
        ]);
        $pdo->commit();
        respond(['order' => [
            'id' => $orderId,
            'number' => $order['number'],
            'status' => $newStatus,
            'tracking' => $tracking,
        ]]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function commerceRequireInternalSecret(): void
{
    $secret = getenv('NATIVE_S2S_SECRET');
    $provided = $_SERVER['HTTP_X_NATIVE_INTERNAL_SECRET'] ?? '';
    if ((!is_string($provided) || $provided === '') && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authorization = (string) $_SERVER['HTTP_AUTHORIZATION'];
        if (str_starts_with($authorization, 'Bearer ')) $provided = substr($authorization, 7);
    }
    if (!is_string($secret) || $secret === '' || !is_string($provided) || !hash_equals($secret, $provided)) {
        throw new HttpError(403, 'Internal authentication failed.');
    }
}

function commerceInternalQuoteValidation(): never
{
    commerceRequireInternalSecret();
    $input = body();
    $userId = integer($input['user_id'] ?? null, 1, 2147483647);
    $method = text($input['payment_method'] ?? '', 30);
    $currency = strtoupper(text($input['currency'] ?? '', 3));
    if (!in_array($currency, ['CHF', 'EUR'], true)) throw new HttpError(422, 'A supported currency is required.');
    $user = db()->prepare("SELECT id FROM users WHERE id=? AND role='customer' AND status='active'");
    $user->execute([$userId]);
    if (!$user->fetchColumn() || !commercePaymentEligible(db(), $userId, $method)) {
        throw new HttpError(403, 'Payment method is not eligible for this customer.');
    }
    if ($method === 'twint' && $currency !== 'CHF') {
        throw new HttpError(422, 'TWINT requires CHF.');
    }
    $terms = commercePaymentTerms(db(), $method, $currency);
    respond(['valid' => true, 'payment_method' => $method, 'terms' => $terms]);
}

function commerceInternalPaymentCallback(): never
{
    commerceRequireInternalSecret();
    $input = body();
    $orderId = integer($input['order_id'] ?? null, 1, 2147483647);
    $orderNumber = text($input['order_number'] ?? '', 40);
    $state = text($input['state'] ?? '', 30);
    $providerId = text($input['checkout_session_id'] ?? '', 190);
    $providerMethod = text($input['provider'] ?? 'stripe', 20);
    $paymentIntentId = text($input['payment_intent_id'] ?? '', 190);
    $eventId = text($input['event_id'] ?? '', 190);
    $eventCreatedAt = integer($input['event_created_at'] ?? null, 1);
    if (!in_array($state, ['paid', 'failed', 'expired'], true)
        || $providerId === '' || $eventId === '' || $orderNumber === '') {
        throw new HttpError(422, 'A provider ID, event ID and normalized payment state are required.');
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $orderStatement = $pdo->prepare('SELECT id,number,payment_method,payment_state,latest_payment_event_at,latest_payment_event_id FROM orders WHERE id=? FOR UPDATE');
        $orderStatement->execute([$orderId]);
        $order = $orderStatement->fetch(PDO::FETCH_ASSOC);
        if (!$order || !hash_equals((string) $order['number'], $orderNumber)) throw new HttpError(404, 'Order not found.');
        if (!in_array($providerMethod, ['stripe', 'wallee'], true)
            || ($providerMethod === 'wallee' && $order['payment_method'] !== 'twint')
            || ($providerMethod === 'stripe' && !in_array($order['payment_method'], ['stripe', 'pay_later'], true))) {
            throw new HttpError(409, 'Provider does not belong to this order.');
        }
        $methodName = $providerMethod === 'wallee' ? 'twint' : 'stripe';
        $provider = $pdo->prepare(
            "SELECT id FROM payment_attempts
             WHERE order_id=? AND payment_method=? AND provider_id=?
             ORDER BY id DESC LIMIT 1 FOR UPDATE"
        );
        $provider->execute([$orderId, $methodName, $providerId]);
        $providerAttemptId = $provider->fetchColumn();
        if ($providerAttemptId === false) throw new HttpError(409, 'Checkout Session does not belong to this order.');
        $existing = $pdo->prepare('SELECT id,order_id,state FROM payment_attempts WHERE provider_event_id=? FOR UPDATE');
        $existing->execute([$eventId]);
        $attempt = $existing->fetch(PDO::FETCH_ASSOC);
        if ($attempt && (int) $attempt['order_id'] !== $orderId) throw new HttpError(409, 'Provider event already belongs to another order.');
        if ($attempt) {
            $pdo->commit();
            respond(['accepted' => true, 'idempotent' => true, 'payment_state' => $attempt['state']]);
        }
        $isPaidTerminal = $order['payment_state'] === 'paid' && $state !== 'paid';
        $isOlder = $eventCreatedAt < (int) $order['latest_payment_event_at'];
        $isEqualButNotLater = $eventCreatedAt === (int) $order['latest_payment_event_at']
            && strcmp($eventId, (string) $order['latest_payment_event_id']) <= 0;
        if ($isPaidTerminal || $isOlder || $isEqualButNotLater) {
            $pdo->prepare(
                'INSERT INTO payment_attempts(order_id,payment_method,provider_id,provider_event_id,provider_event_created_at,state,payload)
                 VALUES(?,?,?,?,?,?,?)'
            )->execute([$orderId, $methodName, $providerId, $eventId, $eventCreatedAt, $state,
                 json_encode(['source' => 'internal_callback', 'payment_intent_id' => $paymentIntentId, 'ignored' => $isPaidTerminal ? 'paid_terminal' : 'stale'], JSON_THROW_ON_ERROR)]);
            $pdo->commit();
            respond(['accepted' => true, 'idempotent' => false, 'ignored' => $isPaidTerminal ? 'paid_terminal' : 'stale', 'payment_state' => $order['payment_state']]);
        }
        $pdo->prepare(
            'INSERT INTO payment_attempts(order_id,payment_method,provider_id,provider_event_id,provider_event_created_at,state,payload) VALUES(?,?,?,?,?,?,?)'
        )->execute([$orderId, $methodName, $providerId, $eventId, $eventCreatedAt, $state,
            json_encode(['source' => 'internal_callback', 'payment_intent_id' => $paymentIntentId], JSON_THROW_ON_ERROR)]);
        // Callbacks intentionally update payment facts only; fulfillment status is staff-owned.
        $pdo->prepare('UPDATE orders SET payment_state=?,latest_payment_event_at=?,latest_payment_event_id=? WHERE id=?')
            ->execute([$state, $eventCreatedAt, $eventId, $orderId]);
        $pdo->prepare('UPDATE payment_attempts SET state=? WHERE id=?')->execute([$state, (int) $providerAttemptId]);
         if ($state === 'paid') nativeRelayQueuePaidOrder($pdo, $orderId, $eventId);
        audit('payment.callback', 'order', $orderId, ['state' => $state, 'provider_id' => $providerId]);
        $pdo->commit();
        respond(['accepted' => true, 'idempotent' => false, 'payment_state' => $state]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function handleCommerce(string $method, string $path): bool
{
    if ($method === 'POST' && $path === '/internal/checkout/validate-quote') {
        commerceInternalQuoteValidation();
    }
    if ($method === 'POST' && $path === '/internal/payments/callback') {
        commerceInternalPaymentCallback();
    }
    if ($method === 'GET' && $path === '/cart') {
        commerceGetCart();
    }
    if ($method === 'POST' && $path === '/cart') {
        commerceSetCart();
    }
    if ($method === 'POST' && $path === '/cart/quick-add') {
        commerceQuickAddCart();
    }
    if ($method === 'DELETE' && $path === '/cart') {
        commerceClearCart();
    }
    if ($method === 'POST' && $path === '/checkout') {
        commerceCheckout();
    }
    if ($method === 'POST' && $path === '/checkout/quote') {
        commerceCheckoutQuote();
    }
    if ($method === 'GET' && $path === '/orders') {
        commerceListOrders();
    }
    if ($method === 'GET' && preg_match('#^/orders/([1-9][0-9]*)$#', $path, $matches)) {
        commerceOrderDetail((int) $matches[1]);
    }
    if ($method === 'POST' && preg_match('#^/orders/([1-9][0-9]*)/pay-invoice$#', $path, $matches)) {
        commercePayInvoice((int) $matches[1]);
    }
    if ($method === 'GET' && $path === '/profile') {
        commerceGetProfile();
    }
    if ($method === 'PATCH' && $path === '/profile') {
        commerceUpdateProfile();
    }
    if ($method === 'GET' && $path === '/addresses') {
        commerceListAddresses();
    }
    if ($method === 'POST' && $path === '/addresses') {
        commerceCreateAddress();
    }
    if ($method === 'PATCH' && preg_match('#^/addresses/([1-9][0-9]*)$#', $path, $matches)) {
        commerceUpdateAddress((int) $matches[1]);
    }
    if ($method === 'DELETE' && preg_match('#^/addresses/([1-9][0-9]*)$#', $path, $matches)) {
        commerceDeleteAddress((int) $matches[1]);
    }
    if ($method === 'GET' && $path === '/admin/orders') {
        commerceAdminOrders();
    }
    if ($method === 'GET' && preg_match('#^/admin/orders/([1-9][0-9]*)$#', $path, $matches)) {
        commerceAdminOrderDetail((int) $matches[1]);
    }
    if ($method === 'PATCH' && preg_match('#^/admin/orders/([1-9][0-9]*)$#', $path, $matches)) {
        commerceAdminUpdateOrder((int) $matches[1]);
    }
    return false;
}