<?php
declare(strict_types=1);

/*
 * Local invoice control for the isolated test shop. This is an accounting
 * annotation only: it never invokes a payment provider or changes an order.
 */

function financeLoadInvoices(?string $currency = null): array
{
    $sql =
        "SELECT o.id,o.number,o.status order_status,o.total_cents,o.currency,o.created_at,
                u.name customer_name,u.company,u.email,
                f.verified,f.due_date,f.paid_cents,f.version,
                COALESCE((
                    SELECT SUM(ca.amount_cents) FROM credit_applications ca
                    WHERE ca.target_order_id=o.id
                ),0) credited_cents
         FROM orders o
         JOIN users u ON u.id=o.user_id
         LEFT JOIN invoice_accounting f ON f.order_id=o.id";
    $parameters = [];
    if ($currency !== null) {
        $sql .= ' WHERE o.currency=?';
        $parameters[] = $currency;
    }
    $statement = db()->prepare($sql);
    $statement->execute($parameters);
    $rows = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rows[] = financeInvoiceRow($row);
    }
    return $rows;
}

function financeInvoiceRow(array $row): array
{
    $total = (int)$row['total_cents'];
    $credited = (int)$row['credited_cents'];
    $paid = $row['paid_cents'] === null ? 0 : (int)$row['paid_cents'];
    $verified = $row['verified'] !== null && (bool)$row['verified'];
    $cancelled = (string)$row['order_status'] === 'cancelled';
    $remaining = max(0, $total - $credited - $paid);
    $outstanding = $cancelled ? 0 : ($verified ? $remaining : null);
    if ($cancelled) {
        $paymentStatus = 'cancelled';
    } elseif (!$verified) {
        $paymentStatus = 'unverified';
    } elseif ($remaining === 0) {
        $paymentStatus = 'paid';
    } elseif ($row['due_date'] !== null && (string)$row['due_date'] < gmdate('Y-m-d')) {
        $paymentStatus = 'overdue';
    } elseif ($paid > 0) {
        $paymentStatus = 'partial';
    } else {
        $paymentStatus = 'open';
    }
    return [
        'id' => (int)$row['id'],
        'order_number' => (string)$row['number'],
        'customer_name' => (string)$row['customer_name'],
        'company' => (string)$row['company'],
        'email' => (string)$row['email'],
        'issued_at' => (string)$row['created_at'],
        'due_date' => $row['due_date'] === null ? null : (string)$row['due_date'],
        'total_cents' => $total,
        'credited_cents' => $credited,
        'paid_cents' => $paid,
        'outstanding_cents' => $outstanding,
        'credit_balance_cents' => max(0, $credited + $paid - $total),
        'payment_status' => $paymentStatus,
        'verified' => $verified,
        'version' => $row['version'] === null ? 0 : (int)$row['version'],
        'order_status' => (string)$row['order_status'],
        'currency' => (string)$row['currency'],
    ];
}

function financeSummaryForCurrency(array $invoices, string $currency): array
{
    $summary = [
        'currency' => $currency,
        'unpaid_count' => 0,
        'outstanding_cents' => 0,
        'overdue_count' => 0,
        'overdue_cents' => 0,
        'unverified_count' => 0,
        'paid_count' => 0,
    ];
    foreach ($invoices as $invoice) {
        if ($invoice['payment_status'] === 'unverified') $summary['unverified_count']++;
        if ($invoice['payment_status'] === 'paid') $summary['paid_count']++;
        if (in_array($invoice['payment_status'], ['open', 'partial', 'overdue'], true)
            && $invoice['outstanding_cents'] !== null) {
            $summary['unpaid_count']++;
            $summary['outstanding_cents'] += $invoice['outstanding_cents'];
        }
        if ($invoice['payment_status'] === 'overdue') {
            $summary['overdue_count']++;
            $summary['overdue_cents'] += $invoice['outstanding_cents'];
        }
    }
    return $summary;
}

function financeSummary(array $invoices): array
{
    $grouped = [];
    foreach ($invoices as $invoice) {
        $currency = (string) ($invoice['currency'] ?? 'CHF');
        $grouped[$currency][] = $invoice;
    }
    ksort($grouped);
    return array_map(
        static fn(array $rows, string $currency): array => financeSummaryForCurrency($rows, $currency),
        array_values($grouped),
        array_keys($grouped)
    );
}

function financeInvoiceAttention(array $invoices, int $limit): array
{
    $attention = array_values(array_filter(
        $invoices,
        static fn(array $row): bool => in_array($row['payment_status'], ['unverified', 'overdue', 'open'], true)
    ));
    $priority = ['unverified' => 0, 'overdue' => 1, 'open' => 2];
    usort($attention, static function (array $left, array $right) use ($priority): int {
        $difference = $priority[$left['payment_status']] <=> $priority[$right['payment_status']];
        return $difference !== 0 ? $difference : strcmp($left['issued_at'], $right['issued_at']);
    });
    return array_slice($attention, 0, $limit);
}

function financeValidDate(mixed $value): ?string
{
    if ($value === null) return null;
    if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $match)
        || !checkdate((int)$match[2], (int)$match[3], (int)$match[1])) {
        throw new HttpError(422, 'Due date must be a real date in YYYY-MM-DD format.');
    }
    return $value;
}

function financeFindInvoice(int $id): array
{
    foreach (financeLoadInvoices() as $invoice) {
        if ($invoice['id'] === $id) return $invoice;
    }
    throw new HttpError(404, 'Invoice order not found.');
}

function financeList(): never
{
    requireStaff();
    $q = mb_strtolower(trim((string)($_GET['q'] ?? '')));
    $status = (string)($_GET['status'] ?? 'all');
    $sort = (string)($_GET['sort'] ?? 'newest');
    $currencyInput = trim((string)($_GET['currency'] ?? ''));
    $currency = $currencyInput === '' ? null : strtoupper($currencyInput);
    $page = integer($_GET['page'] ?? 1, 1, 1000000);
    $limit = integer($_GET['limit'] ?? 50, 1, 100);
    if (!in_array($status, ['all', 'unverified', 'unpaid', 'open', 'partial', 'overdue', 'paid', 'cancelled'], true)) {
        throw new HttpError(422, 'Invalid invoice status.');
    }
    if (!in_array($sort, ['newest', 'oldest', 'due', 'amount_desc'], true)) {
        throw new HttpError(422, 'Invalid invoice sort.');
    }
    if ($currency !== null && !in_array($currency, ['EUR', 'CHF'], true)) {
        throw new HttpError(422, 'Invalid invoice currency.');
    }
    $all = financeLoadInvoices($currency);
    $invoices = array_values(array_filter($all, static function (array $invoice) use ($q, $status): bool {
        if ($q !== '') {
            $haystack = mb_strtolower(implode(' ', [
                $invoice['order_number'], $invoice['customer_name'], $invoice['company'], $invoice['email'],
            ]));
            if (!str_contains($haystack, $q)) return false;
        }
        if ($status === 'all') return true;
        if ($status === 'unpaid') {
            return in_array($invoice['payment_status'], ['open', 'partial', 'overdue'], true);
        }
        return $invoice['payment_status'] === $status;
    }));
    usort($invoices, static function (array $left, array $right) use ($sort): int {
        $fallback = $right['id'] <=> $left['id'];
        return match ($sort) {
            'oldest' => strcmp($left['issued_at'], $right['issued_at']) ?: ($left['id'] <=> $right['id']),
            'due' => ($left['due_date'] === null ? 1 : 0) <=> ($right['due_date'] === null ? 1 : 0)
                ?: strcmp((string)$left['due_date'], (string)$right['due_date']) ?: $fallback,
            'amount_desc' => $right['total_cents'] <=> $left['total_cents'] ?: $fallback,
            default => strcmp($right['issued_at'], $left['issued_at']) ?: $fallback,
        };
    });
    $total = count($invoices);
    $pages = max(1, (int)ceil($total / $limit));
    $page = min($page, $pages);
    respond([
        'invoices' => array_slice($invoices, ($page - 1) * $limit, $limit),
        'total' => $total,
        'page' => $page,
        'pages' => $pages,
        'summary' => financeSummary($all),
        'currency' => $currency,
        'filters' => [
            'q' => $q, 'status' => $status, 'sort' => $sort,
            'currency' => $currency, 'limit' => $limit,
        ],
    ]);
}

function financeUpdate(int $id): never
{
    $staff = requireStaff();
    $input = body();
    $version = integer($input['version'] ?? null, 0, 2147483647);
    if (!array_key_exists('verified', $input)) throw new HttpError(422, 'Verified is required.');
    $verified = opBool($input['verified']);
    $dueDate = financeValidDate($input['due_date'] ?? null);
    $paid = integer($input['paid_cents'] ?? null, 0, 2147483647);
    $note = text($input['note'] ?? '', 5000);
    if ($verified === 0 && $paid > 0) {
        throw new HttpError(422, 'An unverified invoice cannot record a positive paid amount.');
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $order = opRow('SELECT id FROM orders WHERE id=? FOR UPDATE', [$id]);
        if ($order === null) throw new HttpError(404, 'Invoice order not found.');
        $current = opRow(
            'SELECT verified,due_date,paid_cents,note,version FROM invoice_accounting WHERE order_id=? FOR UPDATE',
            [$id]
        );
        $currentVersion = $current === null ? 0 : (int)$current['version'];
        if ($version !== $currentVersion) {
            throw new HttpError(409, 'Invoice accounting changed. Reload the latest version.');
        }
        $before = $current === null ? [
            'verified' => false, 'due_date' => null, 'paid_cents' => 0, 'note' => '', 'version' => 0,
        ] : [
            'verified' => (bool)$current['verified'], 'due_date' => $current['due_date'],
            'paid_cents' => (int)$current['paid_cents'], 'note' => (string)$current['note'],
            'version' => $currentVersion,
        ];
        $newVersion = $currentVersion + 1;
        if ($current === null) {
            $pdo->prepare(
                'INSERT INTO invoice_accounting(order_id,verified,due_date,paid_cents,note,version,updated_by)
                 VALUES(?,?,?,?,?,?,?)'
            )->execute([$id, $verified, $dueDate, $paid, $note, $newVersion, (int)$staff['id']]);
        } else {
            $pdo->prepare(
                'UPDATE invoice_accounting
                 SET verified=?,due_date=?,paid_cents=?,note=?,version=?,updated_by=? WHERE order_id=?'
            )->execute([$verified, $dueDate, $paid, $note, $newVersion, (int)$staff['id'], $id]);
        }
        $after = [
            'verified' => (bool)$verified, 'due_date' => $dueDate, 'paid_cents' => $paid,
            'note' => $note, 'version' => $newVersion,
        ];
        audit('invoice.accounting_updated', 'order', $id, [
            'before' => $before, 'after' => $after, 'by' => (int)$staff['id'],
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    respond(['invoice' => financeFindInvoice($id)]);
}

function handleAdminFinance(string $method, string $path): bool
{
    if ($path === '/admin/invoices' && $method === 'GET') {
        financeList();
    }
    if (preg_match('#^/admin/invoices/(\d+)$#', $path, $match) && $method === 'PATCH') {
        financeUpdate(integer($match[1], 1, 2147483647));
    }
    return false;
}