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
    if (appProduction()) {
        return;
    }
    $marker = WORKSPACE_ROOT . '/.local/native-mysql/isolated.marker';
    if (!is_file($marker) || trim((string) file_get_contents($marker)) !== 'FERRY_LOCAL_TEST_ONLY') {
        throw new RuntimeException('The isolated test database has not been initialized.');
    }
}

function appProduction(): bool
{
    return strtolower((string) (getenv('APP_ENV') ?: getenv('NODE_ENV') ?: '')) === 'production';
}

/**
 * SHOP_MODE is an explicit commercial-safety boundary.  Infrastructure
 * production remains production for database, sessions and storage, but is
 * deliberately a preview unless the value is exactly "live".
 */
function shopLiveMode(): bool
{
    return (string) getenv('SHOP_MODE') === 'live';
}

function shopPreviewMode(): bool
{
    return !shopLiveMode();
}

function dbDriver(): string
{
    return appProduction() ? 'pgsql' : 'mysql';
}

function insertReturning(PDO $pdo, string $sql, array $params = []): int
{
    if (dbDriver() === 'pgsql') {
        $statement = $pdo->prepare($sql . ' RETURNING id');
        $statement->execute($params);
        return (int) $statement->fetchColumn();
    }
    $mysqlParams = array_map(static fn(mixed $value): mixed => is_bool($value) ? (int) $value : $value, $params);
    $pdo->prepare($sql)->execute($mysqlParams);
    return (int) $pdo->lastInsertId();
}

function internalApiBase(): string
{
    $base = trim((string) (getenv('INTERNAL_API_BASE_URL') ?: 'http://127.0.0.1:80'));
    if (!filter_var($base, FILTER_VALIDATE_URL)
        || !preg_match('#^https?://[^/?#]+(?::\d+)?$#i', $base)) {
        throw new RuntimeException('INTERNAL_API_BASE_URL must be a valid http(s) origin.');
    }
    return rtrim($base, '/');
}

function postgresDsn(string $url): array
{
    $parts = parse_url($url);
    if (!is_array($parts) || !isset($parts['host'])) {
        throw new RuntimeException('DATABASE_URL must be a valid PostgreSQL URL.');
    }
    $dsn = 'pgsql:host=' . $parts['host'];
    if (isset($parts['port'])) $dsn .= ';port=' . (int) $parts['port'];
    if (isset($parts['path']) && $parts['path'] !== '') {
        $dsn .= ';dbname=' . rawurldecode(ltrim($parts['path'], '/'));
    }
    $query = [];
    parse_str((string) ($parts['query'] ?? ''), $query);
    if (isset($query['sslmode']) && preg_match('/^(disable|allow|prefer|required|verify-ca|verify-full)$/', (string) $query['sslmode'])) {
        $dsn .= ';sslmode=' . $query['sslmode'];
    }
    if (isset($query['options']) && preg_match('/^[A-Za-z0-9_ .+\/=-]+$/', (string) $query['options'])) {
        $dsn .= ';options=' . $query['options'];
    }
    return [$dsn, isset($parts['user']) ? rawurldecode($parts['user']) : null,
        isset($parts['pass']) ? rawurldecode($parts['pass']) : null];
}

function db(): PDO
{
    static $connection = null;
    if (!$connection) {
        if (appProduction()) {
            $url = getenv('DATABASE_URL');
            if (!is_string($url) || $url === '') {
                throw new RuntimeException('DATABASE_URL is required in production.');
            }
            if (!extension_loaded('pdo_pgsql')) {
                throw new RuntimeException('The pdo_pgsql extension is required in production.');
            }
            [$dsn, $dbUser, $dbPassword] = postgresDsn($url);
            $connection = new PDO($dsn, $dbUser, $dbPassword, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            $connection->exec('SET TIME ZONE \'UTC\'');
            $connection->exec('SET search_path TO parts_store, public');
        } else {
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
    }
    return $connection;
}

function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    if (appProduction()) {
        session_set_save_handler(new PostgreSqlSessionHandler(db()), true);
    }
    $directory = NATIVE_ROOT . '/storage/sessions';
    if (!is_dir($directory)) {
        mkdir($directory, 0700, true);
    }
    session_save_path($directory);
    session_name(appProduction() ? 'ferry_session' : 'ferry_test_session');
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

final class PostgreSqlSessionHandler implements SessionHandlerInterface
{
    public function __construct(private PDO $pdo) {}
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }
    public function read(string $id): string|false
    {
        $q = $this->pdo->prepare('SELECT data FROM sessions WHERE id=? AND last_accessed_at > CURRENT_TIMESTAMP - INTERVAL \'1 day\'');
        $q->execute([$id]);
        $value = $q->fetchColumn();
        return $value === false ? '' : (string) $value;
    }
    public function write(string $id, string $data): bool
    {
        $q = $this->pdo->prepare('INSERT INTO sessions(id,data,last_accessed_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,last_accessed_at=CURRENT_TIMESTAMP');
        return $q->execute([$id, $data]);
    }
    public function destroy(string $id): bool
    {
        $q = $this->pdo->prepare('DELETE FROM sessions WHERE id=?');
        return $q->execute([$id]);
    }
    public function gc(int $max_lifetime): int|false
    {
        $q = $this->pdo->prepare('DELETE FROM sessions WHERE last_accessed_at < CURRENT_TIMESTAMP - (? * INTERVAL \'1 second\')');
        $q->execute([$max_lifetime]);
        return $q->rowCount();
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
        throw new HttpError(403, 'Your session has expired. Refresh the page and try again.');
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
        throw new HttpError(401, 'Sign in to continue.');
    }
    return $user;
}

function requireStaff(): array
{
    $user = requireUser();
    if ($user['role'] !== 'staff') {
        throw new HttpError(403, 'This section is for staff only.');
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
        throw new HttpError(413, 'The request is too large.');
    }
    try {
        $raw = file_get_contents('php://input', false, null, 0, 2097153);
        if (strlen($raw) > 2097152) {
            throw new HttpError(413, 'The request is too large.');
        }
        $data = $raw === '' ? [] : json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new HttpError(400, 'Invalid data.');
        }
        return $body = $data;
    } catch (JsonException) {
        throw new HttpError(400, 'Invalid JSON request.');
    }
}

function integer(mixed $value, int $min = 0, int $max = 1000000): int
{
    if ((!is_int($value) && !is_string($value))
        || filter_var($value, FILTER_VALIDATE_INT) === false
        || (int) $value < $min || (int) $value > $max) {
        throw new HttpError(422, "Enter a whole number between {$min} and {$max}.");
    }
    return (int) $value;
}

function text(mixed $value, int $max = 255): string
{
    if (!is_string($value) && !is_numeric($value)) {
        throw new HttpError(422, 'Invalid text.');
    }
    $value = trim((string) $value);
    if (mb_strlen($value) > $max || str_contains($value, "\0")) {
        throw new HttpError(422, "Text may contain no more than {$max} characters.");
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
    $payload['test_only'] = shopPreviewMode();
    $payload['delivery'] = shopLiveMode() ? 'queued' : 'blocked';
    db()->prepare('INSERT INTO messages(kind,payload,status) VALUES(?,?,?)')
        ->execute([$kind, json_encode($payload, JSON_THROW_ON_ERROR), 'captured']);
}

/**
 * Remove credentials and practical personal data before diagnostics are stored.
 * This helper has no queue/mail dependency and accepts only already-selected
 * metadata (never a request body or SQL text).
 */
function redactDiagnostic(mixed $value, string $key = '', int $depth = 0): mixed
{
    if ($depth > 8) return '[truncated]';
    $sensitive = '/pass(word)?|hash|token|secret|api[_-]?key|authorization|cookie|payment|card|'
        . 'session|csrf|email|e-mail|ip|phone|address|name|iban|cvv/i';
    if ($key !== '' && preg_match($sensitive, $key)) return '[redacted]';
    if (is_array($value)) {
        $out = [];
        $count = 0;
        foreach ($value as $childKey => $childValue) {
            if (++$count > 60) { $out['_truncated'] = true; break; }
            $out[(string)$childKey] = redactDiagnostic($childValue, (string)$childKey, $depth + 1);
        }
        return $out;
    }
    if (is_object($value)) return '[object]';
    if (is_string($value)) {
        $value = preg_replace('/\b[\w.%+\-]+@[\w.\-]+\.[A-Za-z]{2,}\b/', '[redacted-email]', $value) ?? '';
        $value = preg_replace('/\b(?:\d{1,3}\.){3}\d{1,3}\b/', '[redacted-ip]', $value) ?? '';
        $value = preg_replace('/\b(password|pass|token|secret|api[_-]?key|csrf|session|hash|authorization|cookie)\s*'
            . '([:=])\s*[^\s,&;]+/i', '$1$2[redacted]', $value) ?? '';
        $value = preg_replace('/\b(?:Bearer\s+|Basic\s+)[A-Za-z0-9._~+\/=-]+/i', '[redacted-auth]', $value) ?? '';
        $value = preg_replace('/\b(?:\d[ -]*?){13,19}\b/', '[redacted-card]', $value) ?? '';
        return mb_substr($value, 0, 1000);
    }
    return is_scalar($value) || $value === null ? $value : '[unavailable]';
}

/** Best-effort only: a diagnostic failure must never alter the original request. */
function recordDiagnostic(string $severity, string $category, string $summary, array $context = [], ?string $reference = null): ?string
{
    static $recording = false;
    if ($recording) return null;
    $recording = true;
    try {
        $severity = strtolower($severity);
        if (!in_array($severity, ['debug', 'info', 'warning', 'error', 'critical'], true)) $severity = 'error';
        $reference = $reference !== null && preg_match('/^[A-Za-z0-9_-]{8,32}$/', $reference)
            ? $reference : bin2hex(random_bytes(8));
        $safeContext = redactDiagnostic($context);
        if (!is_array($safeContext)) $safeContext = ['context' => $safeContext];
        db()->prepare('INSERT INTO diagnostics(reference,severity,category,summary,context_json,request_method,request_path)
            VALUES(?,?,?,?,?,?,?)')->execute([
            $reference, $severity, mb_substr($category, 0, 100), mb_substr(redactDiagnostic($summary), 0, 1000),
            json_encode($safeContext, JSON_THROW_ON_ERROR),
            mb_substr((string)($_SERVER['REQUEST_METHOD'] ?? ''), 0, 12),
            mb_substr((string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'), 0, 500),
        ]);
        return $reference;
    } catch (Throwable) {
        return null;
    } finally {
        $recording = false;
    }
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