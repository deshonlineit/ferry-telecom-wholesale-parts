<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

function photoTestRequest(string $method, string $url, array $body, string $cookieFile, ?string $csrf = null): array
{
    $curl = curl_init($url);
    if ($curl === false) throw new RuntimeException('Could not create HTTP client.');
    $headers = ['Content-Type: application/json'];
    if ($csrf !== null) $headers[] = 'X-CSRF-Token: ' . $csrf;
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_THROW_ON_ERROR),
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
    ]);
    $raw = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    if (!is_string($raw)) throw new RuntimeException('HTTP request failed: ' . $error);
    return [$status, json_decode($raw, true, 64, JSON_THROW_ON_ERROR)];
}

function photoTestAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

if (appProduction()) throw new RuntimeException('This integration test is forbidden in production.');
assertIsolated();
$password = getenv('NATIVE_STAFF_PASSWORD');
if (!is_string($password) || $password === '') throw new RuntimeException('NATIVE_STAFF_PASSWORD is required.');
$base = rtrim((string)(getenv('NATIVE_TEST_BASE_URL') ?: 'http://localhost:80/test-shop/api'), '/');
$baseHost = strtolower((string)parse_url($base, PHP_URL_HOST));
$allowedHosts = ['localhost', '127.0.0.1', '::1'];
$developmentHost = strtolower((string)(getenv('REPLIT_DEV_DOMAIN') ?: ''));
if ($developmentHost !== '') $allowedHosts[] = $developmentHost;
if (!in_array($baseHost, $allowedHosts, true)) {
    throw new RuntimeException('The test URL is not an approved local development origin.');
}
$pdo = db();
$cookieFile = tempnam(sys_get_temp_dir(), 'ferry-photo-test-');
$productIds = [];
$ownedPaths = [];

try {
    $suffix = bin2hex(random_bytes(6));
    $sku = 'PHOTO-HIDE-' . strtoupper($suffix);
    $reason = 'The pictured connector does not match this SKU.';

    $insertProduct = $pdo->prepare(
        "INSERT INTO products(sku,name,description,quality,stock,list_price_cents,image_url,featured,active)
         VALUES(?,?,'Integration fixture','test',1,1,?,0,1)"
    );
    $insertProduct->execute([$sku, 'Incorrect photo integration fixture', '']);
    $productId = (int)$pdo->lastInsertId();
    $productIds[] = $productId;

    $token = bin2hex(random_bytes(16));
    $relativeOriginal = 'storage/private/images/' . $productId . '/' . $token . '.png';
    $originalPath = NATIVE_ROOT . '/' . $relativeOriginal;
    $publicDirectory = NATIVE_ROOT . '/public/media/products/' . $productId;
    if (!is_dir(dirname($originalPath))) mkdir(dirname($originalPath), 0700, true);
    if (!is_dir($publicDirectory)) mkdir($publicDirectory, 0755, true);
    $originalBytes = random_bytes(96);
    file_put_contents($originalPath, $originalBytes);
    $ownedPaths[$originalPath] = $originalBytes;
    $variants = [];
    foreach ([320, 640, 1280] as $width) {
        $variantPath = $publicDirectory . '/' . $token . '-' . $width . 'w.webp';
        $variantBytes = random_bytes(64 + $width);
        file_put_contents($variantPath, $variantBytes);
        $ownedPaths[$variantPath] = $variantBytes;
        $variants[(string)$width] = '/test-shop/media/products/' . $productId . '/' . basename($variantPath);
    }
    $oldUrl = $variants['1280'];
    $pdo->prepare('UPDATE products SET image_url=? WHERE id=?')->execute([$oldUrl, $productId]);

    $insertImage = $pdo->prepare('INSERT INTO images(product_id,url,variants,original_path) VALUES(?,?,?,?)');
    $insertImage->execute([$productId, $oldUrl, json_encode($variants, JSON_THROW_ON_ERROR), $relativeOriginal]);
    $imageId = (int)$pdo->lastInsertId();

    [$sessionStatus, $session] = photoTestRequest('GET', $base . '/session', [], $cookieFile);
    photoTestAssert($sessionStatus === 200 && is_string($session['csrf'] ?? null), 'Could not establish a CSRF session.');
    [$loginStatus, $login] = photoTestRequest('POST', $base . '/auth/login', [
        'email' => 'staff@test.invalid',
        'password' => $password,
    ], $cookieFile, $session['csrf']);
    photoTestAssert($loginStatus === 200 && ($login['user']['role'] ?? '') === 'staff', 'Staff login failed.');
    $staffId = (int)$login['user']['id'];

    [$hideStatus, $hidden] = photoTestRequest('POST', $base . '/admin/products/' . $productId . '/images/hide', [
        'image_id' => $imageId,
        'url' => $oldUrl,
        'reason' => $reason,
    ], $cookieFile, (string)$login['csrf']);
    photoTestAssert($hideStatus === 200 && ($hidden['images'] ?? null) === [], 'The real admin route did not hide the image.');

    $product = $pdo->query('SELECT image_url,image_review_required FROM products WHERE id=' . $productId)->fetch(PDO::FETCH_ASSOC);
    photoTestAssert($product && $product['image_url'] === '' && (int)$product['image_review_required'] === 1,
        'The cover must be empty and marked for review.');
    $linked = $pdo->query('SELECT COUNT(*) FROM images WHERE id=' . $imageId)->fetchColumn();
    photoTestAssert((int)$linked === 0, 'The incorrect image link still exists.');
    foreach ($ownedPaths as $path => $expectedBytes) {
        photoTestAssert(is_file($path) && file_get_contents($path) === $expectedBytes,
            'A managed original or public variant was removed or changed: ' . basename($path));
    }

    $auditQuery = $pdo->prepare(
        "SELECT user_id,details FROM audit_events
         WHERE action='image.incorrect_unlinked' AND entity='product' AND entity_id=?
         ORDER BY id DESC LIMIT 1"
    );
    $auditQuery->execute([$productId]);
    $audit = $auditQuery->fetch(PDO::FETCH_ASSOC);
    $details = $audit ? json_decode((string)$audit['details'], true, 64, JSON_THROW_ON_ERROR) : [];
    photoTestAssert($audit && (int)$audit['user_id'] === $staffId, 'The acting staff member was not audited.');
    photoTestAssert((int)($details['product_id'] ?? 0) === $productId, 'The audited product is incorrect.');
    photoTestAssert(($details['sku'] ?? null) === $sku, 'The audited SKU is incorrect.');
    photoTestAssert(($details['old_url'] ?? null) === $oldUrl, 'The old URL was not audited.');
    photoTestAssert(($details['reason'] ?? null) === $reason, 'The reason was not audited.');
    photoTestAssert((int)($details['by'] ?? 0) === $staffId, 'The audit details omit the staff member.');
    photoTestAssert((int)($details['shared_references']['images'] ?? -1) === 0
        && (int)($details['shared_references']['products'] ?? -1) === 0,
        'The shared reference counts were not audited.');

    echo "PASS local admin hide keeps original product-photo bytes\n";
} finally {
    if ($productIds) {
        $marks = implode(',', array_fill(0, count($productIds), '?'));
        $pdo->prepare("DELETE FROM audit_events WHERE entity='product' AND entity_id IN ($marks)")->execute($productIds);
        $pdo->prepare("DELETE FROM images WHERE product_id IN ($marks)")->execute($productIds);
        $pdo->prepare("DELETE FROM products WHERE id IN ($marks)")->execute($productIds);
    }
    foreach (array_keys($ownedPaths) as $path) {
        if (is_file($path)) unlink($path);
    }
    if ($productIds) {
        @rmdir(NATIVE_ROOT . '/storage/private/images/' . $productIds[0]);
        @rmdir(NATIVE_ROOT . '/public/media/products/' . $productIds[0]);
    }
    if (is_string($cookieFile) && is_file($cookieFile)) unlink($cookieFile);
}