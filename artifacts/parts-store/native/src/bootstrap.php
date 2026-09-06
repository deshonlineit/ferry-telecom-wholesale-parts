<?php
declare(strict_types=1);

const NATIVE_ROOT = __DIR__ . '/..';
const WORKSPACE_ROOT = NATIVE_ROOT . '/../../..';
const NATIVE_DB = 'ferry_isolated_test';

final class HttpError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

function basePath(): string
{
    return '/test-shop/';
}

function assertIsolated(): void
{
    $marker = WORKSPACE_ROOT . '/.local/native-mysql/isolated.marker';
    if (!is_file($marker) || trim((string) file_get_contents($marker)) !== 'FERRY_LOCAL_TEST_ONLY') {
        throw new RuntimeException('The isolated test database has not been initialized.');
    }
}

function db(): PDO
{
    static $connection = null;
    if (!$connection) {
        assertIsolated();
        $socket = realpath(WORKSPACE_ROOT . '/.local/native-mysql') . '/mysql.sock';
        $connection = new PDO(
            'mysql:unix_socket=' . $socket . ';dbname=' . NATIVE_DB . ';charset=utf8mb4',
            'ferry_test_app',
            '',
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
                PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
            ]
        );
        $connection->exec("SET time_zone = '+00:00'");
    }
    return $connection;
}

function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $directory = NATIVE_ROOT . '/storage/sessions';
    if (!is_dir($directory)) {
        mkdir($directory, 0700, true);
    }
    session_save_path($directory);
    session_name('ferry_test_session');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => basePath(),
        'secure' => ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
            || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function csrf(): string
{
    startSession();
    return $_SESSION['csrf'];
}

function verifyCsrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || !hash_equals(csrf(), $token)) {
        throw new HttpError(403, 'Je sessie is verlopen. Vernieuw de pagina en probeer opnieuw.');
    }
}

function publicUser(array $user): array
{
    return array_intersect_key($user, array_flip([
        'id', 'name', 'email', 'company', 'role', 'group_id', 'status',
    ]));
}

function currentUser(): ?array
{
    startSession();
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $query = db()->prepare('SELECT id,name,email,company,role,group_id,status,password_hash FROM users WHERE id=?');
    $query->execute([$_SESSION['user_id']]);
    $user = $query->fetch();
    if (!$user || $user['status'] !== 'active'
        || !hash_equals($_SESSION['auth_fingerprint'] ?? '', hash('sha256', $user['password_hash']))) {
        unset($_SESSION['user_id'], $_SESSION['auth_fingerprint']);
        return null;
    }
    return publicUser($user);
}

function requireUser(): array
{
    $user = currentUser();
    if (!$user) {
        throw new HttpError(401, 'Log in om verder te gaan.');
    }
    return $user;
}

function requireStaff(): array
{
    $user = requireUser();
    if ($user['role'] !== 'staff') {
        throw new HttpError(403, 'Dit onderdeel is alleen voor medewerkers.');
    }
    return $user;
}

function signIn(array $user): void
{
    startSession();
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['auth_fingerprint'] = hash('sha256', $user['password_hash']);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function body(): array
{
    static $body = null;
    if ($body !== null) {
        return $body;
    }
    if (str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) {
        return $body = $_POST;
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2097152) {
        throw new HttpError(413, 'Het verzoek is te groot.');
    }
    try {
        $raw = file_get_contents('php://input', false, null, 0, 2097153);
        if (strlen($raw) > 2097152) {
            throw new HttpError(413, 'Het verzoek is te groot.');
        }
        $data = $raw === '' ? [] : json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new HttpError(400, 'Ongeldige gegevens.');
        }
        return $body = $data;
    } catch (JsonException) {
        throw new HttpError(400, 'Ongeldig JSON-verzoek.');
    }
}

function integer(mixed $value, int $min = 0, int $max = 1000000): int
{
    if ((!is_int($value) && !is_string($value))
        || filter_var($value, FILTER_VALIDATE_INT) === false
        || (int) $value < $min || (int) $value > $max) {
        throw new HttpError(422, "Vul een heel getal tussen {$min} en {$max} in.");
    }
    return (int) $value;
}

function text(mixed $value, int $max = 255): string
{
    if (!is_string($value) && !is_numeric($value)) {
        throw new HttpError(422, 'Ongeldige tekst.');
    }
    $value = trim((string) $value);
    if (mb_strlen($value) > $max || str_contains($value, "\0")) {
        throw new HttpError(422, "Tekst mag maximaal {$max} tekens bevatten.");
    }
    return $value;
}

function money(int $cents): float
{
    return $cents / 100;
}

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('Vary: Cookie');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function audit(string $action, string $entity, int $entityId, array $details = []): void
{
    foreach (['password', 'password_hash', 'token', 'csrf', 'secret'] as $key) {
        unset($details[$key]);
    }
    $statement = db()->prepare('INSERT INTO audit_events(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)');
    $statement->execute([
        $_SESSION['user_id'] ?? null, $action, $entity, $entityId,
        json_encode($details, JSON_THROW_ON_ERROR),
    ]);
}

function enqueue(string $kind, array $payload): void
{
    $payload['test_only'] = true;
    $payload['delivery'] = 'blocked';
    db()->prepare('INSERT INTO messages(kind,payload,status) VALUES(?,?,?)')
        ->execute([$kind, json_encode($payload, JSON_THROW_ON_ERROR), 'captured']);
}

function settings(): array
{
    return db()->query('SELECT name,value FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR);
}

require_once __DIR__ . '/currency.php';

function priceFor(array $product, ?array $user): ?int
{
    if (!$user) {
        return null;
    }
    $query = db()->prepare('SELECT price_eur_cents FROM group_prices WHERE product_id=? AND group_id=?');
    $query->execute([$product['id'], $user['group_id']]);
    $price = $query->fetchColumn();
    $eur = $price === false || $price === null
        ? ($product['list_price_eur_cents'] === null ? null : (int) $product['list_price_eur_cents'])
        : (int) $price;
    if ($eur === null) {
        throw new HttpError(503, 'EUR pricing is not initialized for this product.');
    }
    $context = currencyContext();
    return $context['currency'] === 'CHF' ? currencyConvert($eur, 'EUR', 'CHF', $context['exchange_rate']) : $eur;
}

function productForUser(array $product, ?array $user): array
{
    $product['price_cents'] = priceFor($product, $user);
    $context = currencyContext();
    $product['currency'] = $context['currency'];
    if (!$user || $user['role'] !== 'staff') {
        foreach (array_keys($product) as $key) {
            $plain = str_contains($key, '.') ? substr($key, (int) strrpos($key, '.') + 1) : $key;
            if ($plain === 'list_price_cents' || $plain === 'list_price_eur_cents'
                || $plain === 'purchase_price_eur_cents' || $plain === 'price_eur_cents'
                || $plain === 'pricing_version' || str_contains($plain, 'group_price')
                || str_contains($plain, 'purchase_price') || str_contains($plain, 'base_price')) {
                unset($product[$key]);
            }
        }
    }
    return $product;
}