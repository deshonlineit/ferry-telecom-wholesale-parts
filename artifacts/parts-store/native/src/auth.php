<?php
declare(strict_types=1);

function handleAuth(string $method, string $path): bool
{
    if ($path === '/currency' && $method === 'GET') {
        respond(currencyContext());
    }
    if ($path === '/currency' && $method === 'POST') {
        $country = strtoupper(text(body()['country'] ?? '', 2));
        currencyCountry($country);
        startSession();
        $_SESSION['currency_country'] = $country;
        respond(currencyContext($country));
    }
    if ($path === '/session' && $method === 'GET') {
        $context = currencyContext();
        respond([
            'user' => currentUser(), 'csrf' => csrf(), 'test_mode' => true,
            'currency' => $context['currency'], 'currency_context' => $context,
            'capabilities' => ['live_stock' => false, 'payments' => false, 'email' => false],
        ]);
    }
    if (!str_starts_with($path, '/auth/') || $method !== 'POST') {
        return false;
    }
    $data = body();
    if ($path === '/auth/demo') {
        assertIsolated();
        if (($data['persona'] ?? '') === 'staff') {
            throw new HttpError(403, 'Medewerkers moeten met hun eigen account inloggen.');
        }
        $accounts = ['customer' => 'customer@test.invalid', 'partner' => 'partner@test.invalid'];
        $email = $accounts[$data['persona'] ?? ''] ?? null;
        if (!$email) {
            throw new HttpError(422, 'Kies een geldig testaccount.');
        }
        $query = db()->prepare("SELECT * FROM users WHERE email=? AND status='active'");
        $query->execute([$email]);
        $user = $query->fetch();
        if (!$user) {
            throw new HttpError(503, 'Testaccounts zijn nog niet beschikbaar.');
        }
        signIn($user);
        audit('demo_login', 'user', (int) $user['id']);
        respond(['user' => publicUser($user), 'csrf' => csrf()]);
    }
    if ($path === '/auth/logout') {
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['user' => null, 'csrf' => csrf()]);
    }
    if ($path === '/auth/login') {
        $email = mb_strtolower(text($data['email'] ?? '', 190));
        $fingerprint = hash('sha256', $email . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
        $query = db()->prepare('SELECT attempts,last_attempt FROM login_attempts WHERE fingerprint=?');
        $query->execute([$fingerprint]);
        $attempt = $query->fetch();
        if ($attempt && (int) $attempt['attempts'] >= 8
            && strtotime($attempt['last_attempt'] . ' UTC') > time() - 900) {
            throw new HttpError(429, 'Te veel pogingen. Probeer het over 15 minuten opnieuw.');
        }
        db()->prepare('INSERT INTO login_attempts(fingerprint,attempts,last_attempt) VALUES(?,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE attempts=IF(last_attempt < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),1,attempts+1),last_attempt=UTC_TIMESTAMP()')->execute([$fingerprint]);
        $query = db()->prepare('SELECT * FROM users WHERE email=?');
        $query->execute([$email]);
        $user = $query->fetch();
        $password = text($data['password'] ?? '', 1024);
        $valid = password_verify($password, $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        if (!$user || !$valid || $user['status'] !== 'active') {
            throw new HttpError(401, 'Inloggen mislukt. Controleer je gegevens en accountgoedkeuring.');
        }
        db()->prepare('DELETE FROM login_attempts WHERE fingerprint=?')->execute([$fingerprint]);
        signIn($user);
        audit('login', 'user', (int) $user['id']);
        respond(['user' => publicUser($user), 'csrf' => csrf()]);
    }
    if ($path === '/auth/register') {
        $name = text($data['name'] ?? '', 140);
        $company = text($data['company'] ?? '', 190);
        $email = mb_strtolower(text($data['email'] ?? '', 190));
        $password = text($data['password'] ?? '', 1024);
        if (!$name || !$company || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12) {
            throw new HttpError(422, 'Vul naam, bedrijf, e-mail en een wachtwoord van minstens 12 tekens in.');
        }
        $query = db()->prepare('SELECT id FROM users WHERE email=?');
        $query->execute([$email]);
        if (!$query->fetch()) {
            db()->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status) VALUES(?,?,?,?,'customer',1,'pending')")
                ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $company]);
            enqueue('registration_review', ['user_id' => (int) db()->lastInsertId()]);
        }
        respond(['message' => 'Als dit adres nog niet bestaat, staat je aanvraag klaar voor goedkeuring. Er wordt in deze testomgeving geen e-mail verstuurd.'], 202);
    }
    if ($path === '/auth/forgot') {
        $email = mb_strtolower(text($data['email'] ?? '', 190));
        $query = db()->prepare("SELECT id FROM users WHERE email=? AND status='active'");
        $query->execute([$email]);
        $id = $query->fetchColumn();
        if ($id) {
            $query = db()->prepare('SELECT COUNT(*) FROM reset_tokens WHERE user_id=? AND expires_at>UTC_TIMESTAMP()');
            $query->execute([$id]);
            if ((int) $query->fetchColumn() < 3) {
                $token = bin2hex(random_bytes(32));
                db()->prepare('INSERT INTO reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))')
                    ->execute([$id, hash('sha256', $token)]);
                enqueue('password_reset', ['user_id' => (int) $id, 'reset_path' => basePath() . 'reset?token=' . $token]);
            }
        }
        respond(['message' => 'Als het account bestaat, is een herstelbericht vastgelegd in de afgeschermde testmailbox. Er is geen echte e-mail verstuurd.']);
    }
    if ($path === '/auth/reset') {
        $token = text($data['token'] ?? '', 128);
        $password = text($data['password'] ?? '', 1024);
        if (strlen($password) < 12 || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new HttpError(422, 'Ongeldige herstelcode of te kort wachtwoord (minimaal 12 tekens).');
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $query = $pdo->prepare('SELECT id,user_id FROM reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE');
            $query->execute([hash('sha256', $token)]);
            $reset = $query->fetch();
            if (!$reset) {
                throw new HttpError(422, 'Deze herstelcode is verlopen of al gebruikt.');
            }
            $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT), $reset['user_id']]);
            $pdo->prepare('UPDATE reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL')->execute([$reset['user_id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        respond(['message' => 'Wachtwoord bijgewerkt. Je kunt opnieuw inloggen.']);
    }
    return false;
}