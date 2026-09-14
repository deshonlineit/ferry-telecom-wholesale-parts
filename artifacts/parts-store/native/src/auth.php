<?php
declare(strict_types=1);

function handleAuth(string $method, string $path): bool
{
    if ($path === '/currency' && $method === 'GET') {
        respond(currencyContext());
    }
    if ($path === '/currency' && $method === 'POST') {
        $country = currencyDeliveryCountry(text(body()['country'] ?? '', 2));
        startSession();
        $_SESSION['currency_country'] = $country;
        respond(currencyContext($country));
    }
    if ($path === '/session' && $method === 'GET') {
        $context = currencyContext();
            respond([
            'user' => currentUser(), 'csrf' => csrf(), 'test_mode' => shopPreviewMode(),
            'currency' => $context['currency'], 'currency_context' => $context,
            'capabilities' => ['live_stock' => shopLiveMode(), 'payments' => shopLiveMode(), 'email' => shopLiveMode()],
        ]);
    }
    if (!str_starts_with($path, '/auth/') || $method !== 'POST') {
        return false;
    }
    $data = body();
    if ($path === '/auth/demo') {
        if (appProduction()) {
            throw new HttpError(403, 'Demo accounts are unavailable in infrastructure production.');
        }
        assertIsolated();
        if (($data['persona'] ?? '') === 'staff') {
            throw new HttpError(403, 'Staff must sign in with their own account.');
        }
        $accounts = ['customer' => 'customer@test.invalid', 'partner' => 'partner@test.invalid'];
        $email = $accounts[$data['persona'] ?? ''] ?? null;
        if (!$email) {
            throw new HttpError(422, 'Choose a valid test account.');
        }
        $query = db()->prepare("SELECT * FROM users WHERE email=? AND status='active'");
        $query->execute([$email]);
        $user = $query->fetch();
        if (!$user) {
            throw new HttpError(503, 'Test accounts are not yet available.');
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
            throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
        }
        $loginSql = dbDriver() === 'pgsql'
            ? "INSERT INTO login_attempts(fingerprint,attempts,last_attempt) VALUES(?,1,CURRENT_TIMESTAMP)
               ON CONFLICT (fingerprint) DO UPDATE SET attempts=CASE WHEN login_attempts.last_attempt < CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,last_attempt=CURRENT_TIMESTAMP"
            : 'INSERT INTO login_attempts(fingerprint,attempts,last_attempt) VALUES(?,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE attempts=IF(last_attempt < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),1,attempts+1),last_attempt=UTC_TIMESTAMP()';
        db()->prepare($loginSql)->execute([$fingerprint]);
        $query = db()->prepare('SELECT * FROM users WHERE email=?');
        $query->execute([$email]);
        $user = $query->fetch();
        $password = text($data['password'] ?? '', 1024);
        $valid = password_verify($password, $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        if ($user && !$valid && $user['status'] === 'active' && shopPreviewMode()) {
            $previewSecrets = [
                'staff@test.invalid' => 'NATIVE_STAFF_PASSWORD',
                'customer@test.invalid' => 'NATIVE_CUSTOMER_PASSWORD',
            ];
            $secretName = $previewSecrets[$email] ?? null;
            $configured = $secretName === null ? false : getenv($secretName);
            if (is_string($configured) && strlen($configured) >= 12 && hash_equals($configured, $password)) {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                db()->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([$hash, $user['id']]);
                $user['password_hash'] = $hash;
                $valid = true;
            }
            unset($configured);
        }
        if (!$user || !$valid || $user['status'] !== 'active') {
            throw new HttpError(401, 'Sign-in failed. Check your details and account approval status.');
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
        $phone = text($data['phone'] ?? '', 40);
        $website = text($data['website'] ?? '', 255);
        $activity = text($data['business_activity'] ?? '', 80);
        $country = currencyDeliveryCountry(text($data['country'] ?? '', 2));
        $street = text($data['street'] ?? '', 150);
        $houseNumber = text($data['house_number'] ?? '', 30);
        $addressAddition = text($data['address_addition'] ?? '', 80);
        $postalCode = text($data['postal_code'] ?? '', 30);
        $city = text($data['city'] ?? '', 100);
        $taxNumber = strtoupper(text($data['tax_registration_number'] ?? '', 80));
        $newsletter = filter_var($data['newsletter_opt_in'] ?? false, FILTER_VALIDATE_BOOL);
        $termsAccepted = filter_var($data['terms_accepted'] ?? false, FILTER_VALIDATE_BOOL);
        $activities = ['repair_shop', 'reseller', 'refurbisher', 'wholesaler', 'education', 'other'];
        if (!$name || !$company || !$phone || !$street || !$houseNumber || !$postalCode || !$city
            || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12
            || !in_array($activity, $activities, true) || !$termsAccepted) {
            throw new HttpError(422, 'Complete all required contact, company and billing details and accept the business terms.');
        }
        if ($website !== '' && !filter_var($website, FILTER_VALIDATE_URL)) {
            throw new HttpError(422, 'Enter a complete website address, including https://.');
        }
        if ($country === 'CH') {
            $taxType = 'ch_uid';
            if (!preg_match('/^CHE[- .]?\d{3}[- .]?\d{3}[- .]?\d{3}(?:\\s+(?:MWST|TVA|IVA))?$/i', $taxNumber)) {
                throw new HttpError(422, 'Enter a valid Swiss UID, for example CHE-123.456.789.');
            }
        } else {
            $taxType = 'vat_or_company_registration';
            if (!preg_match('/^[A-Z0-9][A-Z0-9 .\\/-]{2,31}$/i', $taxNumber)) {
                throw new HttpError(422, 'Enter a valid VAT or company registration number.');
            }
        }
        $query = db()->prepare('SELECT id FROM users WHERE email=?');
        $query->execute([$email]);
        if (!$query->fetch()) {
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $userId = insertReturning($pdo, dbDriver() === 'pgsql'
                    ? "INSERT INTO users(name,email,password_hash,company,phone,website,business_activity,tax_registration_type,tax_registration_number,newsletter_opt_in,terms_accepted_at,role,group_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'customer',1,'pending')"
                    : "INSERT INTO users(name,email,password_hash,company,phone,website,business_activity,tax_registration_type,tax_registration_number,newsletter_opt_in,terms_accepted_at,role,group_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),'customer',1,'pending')",
                    [$name, $email, password_hash($password, PASSWORD_DEFAULT), $company, $phone, $website, $activity, $taxType, $taxNumber, $newsletter ? true : false]);
                $pdo->prepare('INSERT INTO addresses(user_id,label,name,company,line1,line2,postal_code,city,country,is_default) VALUES(?,?,?,?,?,?,?,?,?,1)')
                    ->execute([$userId, 'Billing address', $name, $company, trim($street . ' ' . $houseNumber), $addressAddition, $postalCode, $city, $country]);
                $pdo->prepare('INSERT INTO billing_addresses(user_id,label,name,company,line1,line2,postal_code,city,country) VALUES(?,?,?,?,?,?,?,?,?)')
                    ->execute([$userId, 'Billing address', $name, $company, trim($street . ' ' . $houseNumber), $addressAddition, $postalCode, $city, $country]);
                $pdo->commit();
                enqueue('registration_review', ['user_id' => $userId]);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        }
        respond(['message' => 'If this address is not already registered, your application is awaiting approval. No email is sent from this test environment.'], 202);
    }
    if ($path === '/auth/forgot') {
        $email = mb_strtolower(text($data['email'] ?? '', 190));
        $query = db()->prepare("SELECT id FROM users WHERE email=? AND status='active'");
        $query->execute([$email]);
        $id = $query->fetchColumn();
        if ($id) {
            $query = db()->prepare(dbDriver() === 'pgsql'
                ? "SELECT COUNT(*) FROM reset_tokens WHERE user_id=? AND expires_at>CURRENT_TIMESTAMP"
                : 'SELECT COUNT(*) FROM reset_tokens WHERE user_id=? AND expires_at>UTC_TIMESTAMP()');
            $query->execute([$id]);
            if ((int) $query->fetchColumn() < 3) {
                $token = bin2hex(random_bytes(32));
                db()->prepare(dbDriver() === 'pgsql'
                    ? "INSERT INTO reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,CURRENT_TIMESTAMP + INTERVAL '30 minutes')"
                    : 'INSERT INTO reset_tokens(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))')
                    ->execute([$id, hash('sha256', $token)]);
                enqueue('password_reset', ['user_id' => (int) $id, 'reset_path' => basePath() . 'reset?token=' . $token]);
            }
        }
        respond(['message' => 'If the account exists, a recovery message has been recorded in the secure test mailbox. No real email has been sent.']);
    }
    if ($path === '/auth/reset') {
        $token = text($data['token'] ?? '', 128);
        $password = text($data['password'] ?? '', 1024);
        if (strlen($password) < 12 || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new HttpError(422, 'Invalid recovery code or password is too short (minimum 12 characters).');
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $query = $pdo->prepare(dbDriver() === 'pgsql'
                ? 'SELECT id,user_id FROM reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE'
                : 'SELECT id,user_id FROM reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE');
            $query->execute([hash('sha256', $token)]);
            $reset = $query->fetch();
            if (!$reset) {
                throw new HttpError(422, 'This recovery code has expired or has already been used.');
            }
            $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT), $reset['user_id']]);
            $pdo->prepare(dbDriver() === 'pgsql'
                ? 'UPDATE reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL'
                : 'UPDATE reset_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL')
                ->execute([$reset['user_id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        respond(['message' => 'Password updated. You can sign in again.']);
    }
    return false;
}