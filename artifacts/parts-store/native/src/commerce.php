<?php

declare(strict_types=1);

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

function commerceSettings(PDO $pdo, string $currency = 'EUR'): array
{
    $defaults = [
        'tax_bps' => 810,
        'shipping_cents' => null,
        'free_shipping_cents' => null,
    ];
    $shippingName = $currency === 'EUR' ? 'shipping_eur_cents' : 'shipping_cents';
    $freeName = $currency === 'EUR' ? 'free_shipping_eur_cents' : 'free_shipping_cents';
    $statement = $pdo->prepare(
        'SELECT name, value FROM settings WHERE name IN (?,?,?)'
    );
    $statement->execute(['tax_bps', $shippingName, $freeName]);
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $target = $row['name'] === $shippingName ? 'shipping_cents'
            : ($row['name'] === $freeName ? 'free_shipping_cents' : 'tax_bps');
        if (ctype_digit((string) $row['value'])) {
            $defaults[$target] = (int) $row['value'];
        }
    }
    if ($defaults['shipping_cents'] === null || $defaults['free_shipping_cents'] === null) {
        throw new HttpError(503, 'Shipping prices are not configured for the selected currency.');
    }
    return $defaults;
}

function commerceTotals(int $subtotal, array $settings): array
{
    $shipping = $subtotal >= $settings['free_shipping_cents']
        ? 0
        : $settings['shipping_cents'];
    $tax = intdiv((($subtotal + $shipping) * $settings['tax_bps']) + 5000, 10000);
    return [
        'subtotal_cents' => $subtotal,
        'shipping_cents' => $shipping,
        'tax_cents' => $tax,
        'total_cents' => $subtotal + $shipping + $tax,
    ];
}

function commerceCart(int $userId, int $groupId, ?string $country = null): array
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
    $result = ['items' => $items] + commerceTotals($subtotal, commerceSettings($pdo, $context['currency']));
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
        'total_cents' => (int) $row['total_cents'],
        'created_at' => $row['created_at'],
        'payment_method' => $row['payment_method'],
        'currency' => $row['currency'],
    ];
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
    $cart = commerceCart((int) $user['id'], (int) $user['group_id'], (string) $address['country']);
    if (!$cart['items']) {
        throw new HttpError(422, 'Your cart is empty.');
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
        'expires' => time() + 600,
    ];
    $cart['quote_token'] = $token;
    $cart['address'] = $address;
    $_SESSION['currency_country'] = (string) $cart['country'];
    respond($cart);
}

function commerceCheckout(): never
{
    $sessionUser = commerceActiveCustomer();
    $input = body();
    $quoteToken = text($input['quote_token'] ?? '', 128);
    $paymentMethod = text($input['payment_method'] ?? '', 30);
    if (!in_array($paymentMethod, ['test_invoice', 'test_card'], true)) {
        throw new HttpError(422, 'Choose a supported test payment method.');
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
        respond(['order' => [
            'id' => (int) $existingReplay['id'], 'number' => $existingReplay['number'],
            'total_cents' => (int) $existingReplay['total_cents'], 'status' => $existingReplay['status'],
            'currency' => $existingReplay['currency'],
        ]]);
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
            respond(['order' => [
                'id' => (int) $existing['id'],
                'number' => $existing['number'],
                'total_cents' => (int) $existing['total_cents'],
                'status' => $existing['status'],
                'currency' => $existing['currency'],
            ]]);
        }

        $address = commerceCheckoutAddress($input, (int) $user['id'], true);
        if ($address != $acceptedQuote['address']) {
            throw new HttpError(409, 'The delivery address changed. Request a new quote.');
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

        $settings = commerceSettings($pdo, $context['currency']);
        $totals = commerceTotals($subtotal, $settings);
        $recalculated = [
            'items' => $items, 'country' => $context['country'], 'currency' => $context['currency'],
            'exchange_rate' => $context['exchange_rate'],
        ] + $totals;
        if (!hash_equals((string) $acceptedQuote['fingerprint'], commerceQuoteFingerprint($recalculated))) {
            throw new HttpError(409, 'Prices, quantities, country, or exchange rate changed. Request a new quote.');
        }
        $number = 'TS-' . gmdate('Ymd') . '-' . strtoupper(bin2hex(random_bytes(5)));
        $addressSnapshot = commerceAddressRow($address);
        $statement = $pdo->prepare(
            'INSERT INTO orders
             (number, user_id, status, subtotal_cents, tax_cents, shipping_cents,
               total_cents, tax_bps, currency, exchange_rate_ppm, exchange_rate_date,
               base_currency, address_json, payment_method, notes,
              tracking, idempotency_key, stock_restored)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
        );
        $statement->execute([
            $number, (int) $user['id'], 'processing',
            $totals['subtotal_cents'], $totals['tax_cents'], $totals['shipping_cents'],
            $totals['total_cents'], $settings['tax_bps'], $context['currency'],
            $context['currency'] === 'CHF' ? $context['exchange_rate']['rate_ppm'] : null,
            $context['currency'] === 'CHF' ? $context['exchange_rate']['rate_date'] : null,
            'EUR',
            json_encode($addressSnapshot, JSON_THROW_ON_ERROR),
            $paymentMethod, $notes, '', $idempotencyKey,
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
        $statement->execute([$orderId, 'processing', 'Test order placed.']);
        $statement = $pdo->prepare('DELETE FROM cart_items WHERE user_id = ?');
        $statement->execute([(int) $user['id']]);
        enqueue('order.created', ['order_id' => $orderId, 'number' => $number, 'test_mode' => true]);
        audit('checkout', 'order', $orderId, ['number' => $number, 'test_mode' => true]);
        $pdo->commit();
        unset($_SESSION['checkout_quotes'][$quoteToken]);
        $_SESSION['currency_country'] = (string) $context['country'];

        respond(['order' => [
            'id' => $orderId,
            'number' => $number,
            'total_cents' => $totals['total_cents'],
            'status' => 'processing',
            'currency' => $context['currency'],
        ]]);
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
                total_cents, tax_bps, currency, address_json, payment_method,
                notes, tracking, created_at
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
                o.shipping_cents, o.total_cents, o.created_at, o.payment_method,
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

function commerceAdminUpdateOrder(int $orderId): never
{
    requireStaff();
    $input = body();
    $newStatus = text($input['status'] ?? '', 30);
    $note = text($input['note'] ?? '', 4000);
    if (!in_array($newStatus, ['processing', 'shipped', 'completed', 'cancelled'], true)) {
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
            'processing' => ['processing', 'shipped', 'cancelled'],
            'shipped' => ['shipped', 'completed'],
            'completed' => ['completed'],
            'cancelled' => ['cancelled'],
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

function handleCommerce(string $method, string $path): bool
{
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
    if ($method === 'PATCH' && preg_match('#^/admin/orders/([1-9][0-9]*)$#', $path, $matches)) {
        commerceAdminUpdateOrder((int) $matches[1]);
    }
    return false;
}