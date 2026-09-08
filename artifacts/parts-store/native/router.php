<?php
declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = rtrim(basePath(), '/');
if ($uriPath !== $base && !str_starts_with($uriPath, $base . '/')) {
    http_response_code(404);
    exit('Not found');
}
$path = substr($uriPath, strlen($base)) ?: '/';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");

if (str_starts_with($path, '/assets/') || str_starts_with($path, '/media/')) {
    $public = realpath(__DIR__ . '/public');
    $file = realpath($public . '/' . rawurldecode($path));
    $types = ['js' => 'text/javascript', 'css' => 'text/css', 'webp' => 'image/webp', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon'];
    $extension = strtolower(pathinfo($file ?: '', PATHINFO_EXTENSION));
    if (!$file || !str_starts_with($file, $public . '/') || !is_file($file) || !isset($types[$extension])) {
        http_response_code(404);
        exit('Not found');
    }
    header('Content-Type: ' . $types[$extension]);
    if (str_starts_with($path, '/media/products/') && preg_match('/-[a-f0-9]*(?:320|640|1280)w\.webp$/', $path)) {
        header('Cache-Control: public, max-age=31536000, immutable');
    } else {
        header('Cache-Control: public, max-age=300');
    }
    readfile($file);
    exit;
}

try {
    assertIsolated();
    if (str_starts_with($path, '/api/')) {
        $route = substr($path, 4);
        $method = $_SERVER['REQUEST_METHOD'];
        startSession();
        $internalRoute = in_array($route, ['/internal/checkout/validate-quote', '/internal/payments/callback'], true);
        if (!in_array($method, ['GET', 'HEAD'], true) && !$internalRoute) {
            verifyCsrf();
        }
        foreach (['auth', 'catalog', 'commerce', 'operations', 'media'] as $module) {
            require_once __DIR__ . '/src/' . $module . '.php';
            $handler = 'handle' . ucfirst($module);
            if ($handler($method, $route)) {
                exit;
            }
        }
        throw new HttpError(404, 'Dit onderdeel is niet gevonden.');
    }
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
        throw new HttpError(405, 'Deze methode is niet toegestaan.');
    }
    header('Cache-Control: no-store, private');
    require __DIR__ . '/public/index.php';
} catch (HttpError $error) {
    if (db()->inTransaction()) {
        db()->rollBack();
    }
    respond(['error' => $error->getMessage()], $error->status);
} catch (Throwable $error) {
    $reference = bin2hex(random_bytes(4));
    error_log('Native request failed [' . $reference . ']: ' . get_class($error));
    respond(['error' => 'Er ging iets mis. Probeer het opnieuw. Referentie: ' . $reference], 500);
}