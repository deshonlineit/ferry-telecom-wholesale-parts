<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    exit(1);
}
require_once __DIR__ . '/../src/bootstrap.php';
assertIsolated();
$input = json_decode(stream_get_contents(STDIN), true, 16, JSON_THROW_ON_ERROR);
$email = (string) ($input['email'] ?? '');
if (!preg_match('/^qa-[a-z0-9-]+@test\.invalid$/', $email)) {
    throw new RuntimeException('Only synthetic QA account identifiers are permitted.');
}
if (($input['action'] ?? 'create') === 'block') {
    db()->prepare("UPDATE users SET status='blocked' WHERE email=?")->execute([$email]);
    echo "{\"blocked\":true}\n";
    exit;
}
$password = (string) ($input['password'] ?? '');
$role = $input['role'] ?? 'customer';
$group = (int) ($input['group_id'] ?? 1);
if (strlen($password) < 16 || !in_array($role, ['customer', 'staff'], true) || !in_array($group, [1, 3], true)) {
    throw new RuntimeException('Invalid QA account input.');
}
db()->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status) VALUES('QA fixture',?,?, 'QA isolated test',?,?,'active')")
    ->execute([$email, password_hash($password, PASSWORD_DEFAULT), $role, $group]);
$id = (int) db()->lastInsertId();
db()->prepare("INSERT INTO addresses(user_id,label,name,company,line1,line2,postal_code,city,country,is_default) VALUES(?,'QA adres','QA fixture','QA isolated test','Voorbeeldstraat 1','','8000','Zürich','CH',1)")
    ->execute([$id]);
echo json_encode(['id' => $id]) . "\n";