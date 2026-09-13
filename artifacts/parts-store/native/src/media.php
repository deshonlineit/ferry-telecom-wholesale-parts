<?php
declare(strict_types=1);

require_once __DIR__ . '/PdfWriter.php';
require_once __DIR__ . '/SwissQrInvoice.php';
require_once __DIR__ . '/InvoicePdf.php';

const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_MAX_PIXELS = 20_000_000;

function handleMedia(string $method, string $path): bool
{
    if ($method === 'POST' && preg_match('#^/admin/products/(\d+)/images/?$#', $path, $match)) {
        if (appProduction()) {
            mediaUploadProduction((int) $match[1]);
        }
        mediaUpload((int) $match[1]);
    }
    if ($method === 'DELETE' && preg_match('#^/admin/images/(\d+)/?$#', $path, $match)) {
        if (appProduction()) {
            mediaDeleteProduction((int) $match[1]);
        }
        mediaDelete((int) $match[1]);
    }
    if ($method === 'POST' && preg_match('#^/admin/products/(\d+)/images/hide/?$#', $path, $match)) {
        mediaHideIncorrect((int) $match[1]);
    }
    if ($method === 'GET' && preg_match('#^/documents/(\d+)/(invoice|packing-slip)\.pdf$#', $path, $match)) {
        mediaOrderDocument((int) $match[1], $match[2]);
    }
    if ($method === 'GET' && preg_match('#^/documents/returns/(\d+)/credit-note\.pdf$#', $path, $match)) {
        mediaCreditDocument((int) $match[1]);
    }
    return false;
}

function mediaBridge(string $method, string $path, string $body, string $contentType = 'application/json'): array
{
    $url = getenv('NATIVE_MEDIA_BRIDGE_URL') ?: 'http://127.0.0.1:80';
    $secret = getenv('NATIVE_MEDIA_BRIDGE_SECRET');
    if (!is_string($secret) || $secret === '') {
        throw new HttpError(503, 'Native media storage is not configured.');
    }
    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    $secureExternal = $scheme === 'https'
        && ($host !== '')
        && (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false
            || preg_match('/\./', $host));
    $internalLoopback = $scheme === 'http' && in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
    if (!is_array($parts) || (!$secureExternal && !$internalLoopback)) {
        throw new HttpError(503, 'Native media bridge URL is invalid.');
    }
    $timestamp = (string) time();
    $eventId = bin2hex(random_bytes(16));
    $signature = hash_hmac('sha256', 'v1.' . $timestamp . '.' . $eventId . '.' . strtoupper($method) . ' ' . $path . '.' . $body, $secret);
    $curl = curl_init(rtrim($url, '/') . $path);
    if ($curl === false) throw new HttpError(503, 'Native media bridge is unavailable.');
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Content-Type: ' . $contentType, 'X-Ferry-Media-Timestamp: ' . $timestamp,
            'X-Ferry-Media-Event-Id: ' . $eventId, 'X-Ferry-Media-Signature: ' . $signature],
        CURLOPT_POSTFIELDS => $body,
    ]);
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if (!is_string($raw) || $status < 200 || $status >= 300) {
        throw new HttpError($status >= 400 ? $status : 503, 'Native media storage rejected the request.');
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) throw new HttpError(503, 'Native media storage returned an invalid response.');
    return $decoded;
}

function mediaUploadProduction(int $productId): never
{
    requireStaff();
    if (!isset($_FILES['file']) || !is_array($_FILES['file']) || (int)($_FILES['file']['error'] ?? 4) !== UPLOAD_ERR_OK) {
        throw new HttpError(400, 'Choose a JPEG, PNG or WebP image.');
    }
    $temporary = (string)($_FILES['file']['tmp_name'] ?? '');
    $size = (int)($_FILES['file']['size'] ?? 0);
    if ($size < 1 || $size > MEDIA_MAX_BYTES || !is_uploaded_file($temporary)) throw new HttpError(400, 'The uploaded image is invalid.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporary);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) throw new HttpError(415, 'Only actual JPEG, PNG and WebP images are accepted.');
    $body = file_get_contents($temporary);
    if (!is_string($body)) throw new HttpError(400, 'The uploaded image is invalid.');
    $result = mediaBridge('POST', '/api/native/media/products/' . $productId . '/images', $body, $mime);
    respond($result, 201);
}

function mediaHideIncorrect(int $productId): never
{
    $staff = requireStaff();
    $input = body();
    $imageId = isset($input['image_id']) && $input['image_id'] !== null
        ? integer($input['image_id'], 1, 2147483647)
        : null;
    $oldUrl = text($input['url'] ?? '', 500);
    $reason = text($input['reason'] ?? '', 500);
    if ($oldUrl === '' || $reason === '') {
        throw new HttpError(422, 'Image URL and reason are required.');
    }
    if (appProduction()) {
        $payload = json_encode([
            'image_id' => $imageId,
            'url' => $oldUrl,
            'reason' => $reason,
            'staff_id' => (int)$staff['id'],
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $result = mediaBridge('POST', '/api/native/media/products/' . $productId . '/images/hide', $payload);
        mediaRespondImages((int)($result['product_id'] ?? $productId));
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $productStatement = $pdo->prepare('SELECT id,sku,image_url FROM products WHERE id=? FOR UPDATE');
        $productStatement->execute([$productId]);
        $product = $productStatement->fetch(PDO::FETCH_ASSOC);
        if (!$product) throw new HttpError(404, 'Product not found.');
        if ($imageId !== null) {
            $imageStatement = $pdo->prepare('SELECT id,url FROM images WHERE id=? AND product_id=? FOR UPDATE');
            $imageStatement->execute([$imageId, $productId]);
            $image = $imageStatement->fetch(PDO::FETCH_ASSOC);
            if (!$image || (string)$image['url'] !== $oldUrl) {
                throw new HttpError(409, 'This image is no longer linked to the product. Reload and try again.');
            }
        } elseif ((string)$product['image_url'] !== $oldUrl) {
            throw new HttpError(409, 'This image is no longer the product cover. Reload and try again.');
        }
        $imageReferences = $pdo->prepare('SELECT COUNT(*) FROM images WHERE url=? AND (? IS NULL OR id<>?)');
        $imageReferences->execute([$oldUrl, $imageId, $imageId]);
        $productReferences = $pdo->prepare('SELECT COUNT(*) FROM products WHERE image_url=? AND id<>?');
        $productReferences->execute([$oldUrl, $productId]);
        if ($imageId !== null) {
            $pdo->prepare('DELETE FROM images WHERE id=? AND product_id=?')->execute([$imageId, $productId]);
        }
        $pdo->prepare('UPDATE products SET image_url=CASE WHEN image_url=? THEN ? ELSE image_url END,image_review_required=TRUE WHERE id=?')
            ->execute([$oldUrl, '', $productId]);
        audit('image.incorrect_unlinked', 'product', $productId, [
            'product_id' => $productId,
            'sku' => (string)$product['sku'],
            'old_url' => $oldUrl,
            'reason' => $reason,
            'by' => (int)$staff['id'],
            'shared_references' => [
                'images' => (int)$imageReferences->fetchColumn(),
                'products' => (int)$productReferences->fetchColumn(),
            ],
        ]);
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $exception;
    }
    mediaRespondImages($productId);
}

function mediaDeleteProduction(int $imageId): never
{
    requireStaff();
    $result = mediaBridge('DELETE', '/api/native/media/images/' . $imageId, '{}');
    mediaRespondImages((int)($result['product_id'] ?? 0));
}

function mediaUpload(int $productId): never
{
    requireStaff();
    if (!extension_loaded('gd') || !extension_loaded('fileinfo') || !function_exists('imagewebp')) {
        throw new HttpError(503, 'Image processing is unavailable on this test server.');
    }
    $product = mediaFetchOne('SELECT id FROM products WHERE id = ? AND active = TRUE', [$productId]);
    if ($product === null) {
        throw new HttpError(404, 'Product not found.');
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        throw new HttpError(400, 'Choose a JPEG, PNG or WebP image.');
    }
    $file = $_FILES['file'];
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $message = $error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE
            ? 'The image exceeds the 8 MB limit.'
            : 'The image upload did not complete.';
        throw new HttpError(400, $message);
    }
    $temporary = (string) ($file['tmp_name'] ?? '');
    $size = (int) ($file['size'] ?? 0);
    if ($size < 1 || $size > MEDIA_MAX_BYTES || !is_uploaded_file($temporary)) {
        throw new HttpError(400, $size > MEDIA_MAX_BYTES ? 'The image exceeds the 8 MB limit.' : 'The uploaded image is invalid.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($temporary);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_string($mime) || !isset($allowed[$mime])) {
        throw new HttpError(415, 'Only actual JPEG, PNG and WebP images are accepted.');
    }
    $decoderAvailable = match ($mime) {
        'image/jpeg' => function_exists('imagecreatefromjpeg'),
        'image/png' => function_exists('imagecreatefrompng'),
        'image/webp' => function_exists('imagecreatefromwebp'),
    };
    if (!$decoderAvailable) {
        throw new HttpError(503, 'This image format is not supported by the local GD build.');
    }
    $dimensions = @getimagesize($temporary);
    $width = (int) ($dimensions[0] ?? 0);
    $height = (int) ($dimensions[1] ?? 0);
    if ($width < 1 || $height < 1 || $width > intdiv(MEDIA_MAX_PIXELS, $height)) {
        throw new HttpError(422, 'The image exceeds the 20 million pixel limit.');
    }

    $image = mediaDecode($temporary, $mime);
    if (!$image instanceof GdImage) {
        throw new HttpError(422, 'The image data could not be decoded safely.');
    }
    if ($mime === 'image/jpeg') {
        $image = mediaOrientJpeg($image, $temporary);
    }
    $width = imagesx($image);
    $height = imagesy($image);

    $token = bin2hex(random_bytes(16));
    $nativeRoot = dirname(__DIR__);
    $privateDirectory = $nativeRoot . '/storage/private/images/' . $productId;
    $publicDirectory = $nativeRoot . '/public/media/products/' . $productId;
    mediaMakeDirectory($privateDirectory);
    mediaMakeDirectory($publicDirectory);
    $originalRelative = 'storage/private/images/' . $productId . '/' . $token . '.' . $allowed[$mime];
    $originalAbsolute = $nativeRoot . '/' . $originalRelative;
    $written = [];

    try {
        mediaSaveSanitizedOriginal($image, $mime, $originalAbsolute);
        $written[] = $originalAbsolute;
        $variants = [];
        foreach ([320, 640, 1280] as $targetWidth) {
            $variantWidth = min($targetWidth, $width);
            $variantHeight = max(1, (int) round($height * ($variantWidth / $width)));
            $variantName = $token . '-' . $targetWidth . 'w.webp';
            $variantAbsolute = $publicDirectory . '/' . $variantName;
            mediaWriteWebpVariant($image, $variantWidth, $variantHeight, $variantAbsolute);
            $written[] = $variantAbsolute;
            $variants[(string) $targetWidth] = mediaPublicUrl('/media/products/' . $productId . '/' . $variantName);
        }
        imagedestroy($image);
        $mainUrl = $variants['1280'];

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $imageId = insertReturning($pdo, 'INSERT INTO images(product_id,url,variants,original_path) VALUES(?,?,?,?)', [
                $productId,
                $mainUrl,
                json_encode($variants, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                $originalRelative,
            ]);
            $pdo->prepare("UPDATE products SET image_url = ?,image_review_required=FALSE WHERE id = ? AND image_url = ''")->execute([$mainUrl, $productId]);
            audit('image.upload', 'image', $imageId, ['product_id' => $productId, 'width' => $width, 'height' => $height]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    } catch (Throwable $exception) {
        if (isset($image) && $image instanceof GdImage) {
            @imagedestroy($image);
        }
        foreach ($written as $pathToRemove) {
            @unlink($pathToRemove);
        }
        throw $exception;
    }
    mediaRespondImages($productId, 201);
}

function mediaDelete(int $imageId): never
{
    requireStaff();
    $pdo = db();
    $pdo->beginTransaction();
    $quarantined = [];
    try {
        $statement = $pdo->prepare('SELECT id,product_id,url,variants,original_path FROM images WHERE id = ? FOR UPDATE');
        $statement->execute([$imageId]);
        $image = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$image) {
            throw new HttpError(404, 'Image not found.');
        }
        foreach (mediaOwnedImagePaths($image) as $path) {
            if (is_file($path)) {
                $quarantine = $path . '.deleting-' . bin2hex(random_bytes(6));
                if (!@rename($path, $quarantine)) {
                    throw new HttpError(500, 'The image files could not be secured for deletion.');
                }
                $quarantined[$path] = $quarantine;
            }
        }
        $pdo->prepare('DELETE FROM images WHERE id = ?')->execute([$imageId]);
        $next = mediaFetchOne('SELECT url FROM images WHERE product_id = ? ORDER BY id LIMIT 1', [(int) $image['product_id']]);
        $nextUrl = $next === null ? '' : (string) $next['url'];
        $pdo->prepare('UPDATE products SET image_url = ? WHERE id = ? AND image_url = ?')
            ->execute([$nextUrl, (int) $image['product_id'], (string) $image['url']]);
        audit('image.delete', 'image', $imageId, ['product_id' => (int) $image['product_id']]);
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        foreach ($quarantined as $original => $quarantine) {
            @rename($quarantine, $original);
        }
        throw $exception;
    }
    foreach ($quarantined as $quarantine) {
        @unlink($quarantine);
    }
    mediaRespondImages((int) $image['product_id']);
}

function mediaOrderDocument(int $orderId, string $kind): never
{
    $user = requireUser();
    $sql = 'SELECT o.*,u.name AS account_name,u.company AS account_company,u.email AS customer_email,'
        . 'u.tax_registration_type,u.tax_registration_number FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id = ?';
    $parameters = [$orderId];
    if (($user['role'] ?? '') !== 'staff') {
        $sql .= ' AND o.user_id = ?';
        $parameters[] = (int) $user['id'];
    }
    $order = mediaFetchOne($sql, $parameters);
    if ($order === null) {
        throw new HttpError(404, 'Order document not found.');
    }
    if (($user['role'] ?? '') !== 'staff' && $kind === 'packing-slip') {
        throw new HttpError(403, 'Packing slips are available to staff only.');
    }
    $invoiceAvailable = $kind !== 'invoice'
        || (string) $order['payment_method'] === 'swiss_qr_invoice'
        || (string) $order['payment_method'] === 'pay_later'
        || ((string) $order['payment_method'] === 'stripe' && (string) $order['payment_state'] === 'paid')
        || (string) $order['status'] === 'completed';
    if (!$invoiceAvailable) {
        throw new HttpError(409, 'The invoice is available after card payment is confirmed.');
    }
    $statement = db()->prepare('SELECT name,sku,quantity,price_cents,total_cents FROM order_items WHERE order_id = ? ORDER BY id');
    $statement->execute([$orderId]);
    $items = $statement->fetchAll(PDO::FETCH_ASSOC);
    $address = json_decode((string) $order['address_json'], true);
    if (!is_array($address)) {
        $address = [];
    }

    $isInvoice = $kind === 'invoice';
    $prefix = shopPreviewMode()
        ? ($isInvoice ? 'TEST-INV-' : 'TEST-PACK-')
        : ($isInvoice ? 'INV-' : 'PACK-');
    $number = $prefix . (string) $order['number'];
    if ($isInvoice) {
        mediaProfessionalInvoiceDocument($order, $items, $address, $number);
    }
    $pdf = new PdfWriter($number, $isInvoice ? 'INVOICE' : 'PACKING SLIP');
    if (!$isInvoice) {
        mediaDocumentIntro($pdf, $order, $address, $number);
        $pdf->heading('Items to pack', 13);
        if (!empty($order['shipping_method_name'])) {
            $pdf->line('Shipping method: ' . (string) $order['shipping_method_name']);
        }
        foreach ($items as $item) {
            $pdf->line(sprintf('[  ] %d x %s | %s', (int) $item['quantity'], (string) $item['sku'], (string) $item['name']));
        }
        $pdf->spacer();
        $pdf->line('Test fulfillment only. This slip does not authorize a real shipment.');
    } else {
        $taxBps = (int) $order['tax_bps'];
        $taxLabel = $taxBps === 0
            ? 'Swiss export VAT 0%'
            : sprintf('Swiss VAT (snapshot %.2f%%)', $taxBps / 100);
        $taxNote = $taxBps === 0
            ? 'Art. 23(2)(1) Swiss VAT Act. Destination import VAT and duties may be charged separately.'
            : sprintf('Swiss VAT (snapshot %.2f%%)', $taxBps / 100);
        $paymentLabels = [
            'stripe' => 'Card payment',
            'twint' => 'TWINT',
            'swiss_qr_invoice' => 'Pay Later (Swiss QR Code)',
            'pay_later' => 'Pay Later (payment due)',
            'test_invoice' => 'Legacy test invoice',
            'test_card' => 'Legacy test card',
        ];
        $terms = json_decode((string) ($order['payment_terms_json'] ?? ''), true);
        $dueDays = is_array($terms) ? (int) ($terms['due_days'] ?? 0) : 0;
        $customerLines = array_values(array_filter([
            (string) ($address['company'] ?? ''),
            (string) ($address['name'] ?? ''),
            trim((string) ($address['line1'] ?? '') . ' ' . (string) ($address['line2'] ?? '')),
            trim((string) ($address['postal_code'] ?? '') . ' ' . (string) ($address['city'] ?? '')),
            (string) ($address['country'] ?? ''),
        ], static fn(string $line): bool => trim($line) !== ''));
        $pdf->invoiceLayout([
            'document_number' => $number,
            'order_number' => (string) $order['number'],
            'order_date' => date('d-M-Y', strtotime((string) $order['created_at'])),
            'currency' => (string) $order['currency'],
            'customer' => $customerLines,
            'items' => array_map(static fn(array $item): array => [
                'sku' => (string) $item['sku'],
                'name' => (string) $item['name'],
                'quantity' => (int) $item['quantity'],
                'unit' => mediaMoney((int) $item['price_cents'], (string) $order['currency']),
                'tax' => number_format($taxBps / 100, 1) . '%',
                'total' => mediaMoney((int) $item['total_cents'], (string) $order['currency']),
            ], $items),
            'subtotal' => mediaMoney((int) $order['subtotal_cents'], (string) $order['currency']),
            'shipping' => mediaMoney((int) $order['shipping_cents'], (string) $order['currency']),
            'tax_label' => $taxLabel,
            'tax_note' => $taxNote,
            'tax' => mediaMoney((int) $order['tax_cents'], (string) $order['currency']),
            'total' => mediaMoney((int) $order['total_cents'], (string) $order['currency']),
            'payment_method' => $paymentLabels[(string) $order['payment_method']] ?? (string) $order['payment_method'],
            'payment_terms' => $dueDays > 0 ? $dueDays . ' days' : '',
            'customer_note' => (string) ($order['notes'] ?? ''),
        ]);
        if ((string) $order['payment_method'] === 'swiss_qr_invoice') {
            if (!is_array($terms)) {
                throw new HttpError(503, 'The QR invoice creditor snapshot is unavailable.');
            }
            try {
                $qrBill = swissQrCreate($terms, $order, $address);
                $debtorLines = array_values(array_filter([
                    (string) ($address['name'] ?? ''),
                    (string) ($address['line1'] ?? ''),
                    trim((string) ($address['postal_code'] ?? '') . ' ' . (string) ($address['city'] ?? '')),
                    (string) ($address['country'] ?? ''),
                ], static fn(string $line): bool => trim($line) !== ''));
                $pdf->swissQrPaymentPart($qrBill->getQrCode()->getAsString('svg'), [
                    'account' => (string) $terms['iban'],
                    'creditor' => [
                        (string) $terms['name'],
                        trim((string) $terms['street'] . ' ' . (string) $terms['house_number']),
                        trim((string) $terms['postal_code'] . ' ' . (string) $terms['city']),
                        (string) $terms['country'],
                    ],
                    'debtor' => $debtorLines,
                    'currency' => 'CHF',
                    'amount' => number_format(((int) $order['total_cents']) / 100, 2, '.', ''),
                    'reference' => ($terms['reference_type'] ?? 'NON') === 'NON'
                        ? '' : (string) ($terms['reference'] ?? ''),
                    'information' => 'Order #' . (string) $order['number'],
                ]);
            } catch (Throwable $exception) {
                throw new HttpError(503, 'The Swiss QR payment section could not be generated safely.');
            }
        } else {
            $pdf->line('No bank account, payment link, or live payment instructions are included in this isolated test document.');
        }
    }
    mediaSendPdf($pdf->output(), strtolower($number) . '.pdf');
}

/** @param list<array<string,mixed>> $items */
function mediaProfessionalInvoiceDocument(array $order, array $items, array $address, string $number): never
{
    mediaSendPdf(mediaRenderInvoicePdf($order, $items, $address, $number), strtolower($number) . '.pdf');
}

/**
 * Build the professional invoice PDF and return its bytes.  Kept separate from
 * the HTTP response so the customer document archive can bundle the exact same
 * document into a ZIP without a second rendering path.
 *
 * @param list<array<string,mixed>> $items
 */
function mediaRenderInvoicePdf(array $order, array $items, array $address, string $number): string
{
    $currency = (string) $order['currency'];
    $taxBps = (int) $order['tax_bps'];
    $terms = json_decode((string) ($order['payment_terms_json'] ?? ''), true);
    $dueDays = is_array($terms) ? max(0, (int) ($terms['due_days'] ?? 0)) : 0;
    $createdAt = new DateTimeImmutable((string) $order['created_at']);
    $dueDate = is_array($terms) && !empty($terms['due_date'])
        ? new DateTimeImmutable((string) $terms['due_date'])
        : $createdAt->modify('+' . $dueDays . ' days');
    $paymentLabels = [
        'stripe' => 'Card payment',
        'twint' => 'TWINT',
        'swiss_qr_invoice' => 'Pay Later - Invoice (Swiss QR Code)',
        'pay_later' => 'Pay Later - Invoice',
        'test_invoice' => 'Legacy test invoice',
        'test_card' => 'Legacy test card',
    ];
    $buyer = array_values(array_filter([
        (string) ($address['company'] ?? ''),
        (string) ($address['name'] ?? ''),
        trim((string) ($address['line1'] ?? '') . ' ' . (string) ($address['line2'] ?? '')),
        trim((string) ($address['postal_code'] ?? '') . ' ' . (string) ($address['city'] ?? '')),
        (string) ($address['country'] ?? ''),
    ], static fn(string $line): bool => trim($line) !== ''));
    // A buyer reference is printed under the label that customer chose.
    $customerReference = trim((string) ($order['customer_reference'] ?? ''));
    $referenceLabel = '';
    if ($customerReference !== '') {
        $preference = mediaFetchOne(
            'SELECT reference_label FROM billing_preferences WHERE user_id=?',
            [(int) $order['user_id']]
        );
        $referenceLabel = (string) ($preference['reference_label'] ?? '');
    }
    $invoice = [
        'invoice_number' => $number,
        'order_number' => (string) $order['number'],
        'invoice_date' => $createdAt->format('d-M-Y'),
        'due_date' => $dueDate->format('d-M-Y'),
        'currency' => $currency,
        'buyer' => $buyer,
        'buyer_email' => (string) ($order['customer_email'] ?? ''),
        'buyer_registration_label' => match ((string) ($order['tax_registration_type'] ?? '')) {
            'ch_uid' => 'Customer UID',
            'vat_or_company_registration' => 'Customer VAT / registration',
            default => '',
        },
        'buyer_registration_number' => (string) ($order['tax_registration_number'] ?? ''),
        'items' => array_map(static fn(array $item): array => [
            'sku' => (string) $item['sku'],
            'name' => (string) $item['name'],
            'quantity' => (int) $item['quantity'],
            'unit' => mediaMoney((int) $item['price_cents'], $currency),
            'tax' => number_format($taxBps / 100, 1) . '%',
            'total' => mediaMoney((int) $item['total_cents'], $currency),
        ], $items),
        'subtotal' => mediaMoney((int) $order['subtotal_cents'], $currency),
        'shipping' => mediaMoney((int) $order['shipping_cents'], $currency),
        'tax_label' => $taxBps === 0
            ? 'Swiss export VAT 0%'
            : sprintf('Swiss VAT (snapshot %.2f%%)', $taxBps / 100),
        'tax_note' => $taxBps === 0
            ? 'Art. 23(2)(1) Swiss VAT Act. Destination import VAT and duties may be charged separately.'
            : sprintf('Swiss VAT (snapshot %.2f%%)', $taxBps / 100),
        'tax' => mediaMoney((int) $order['tax_cents'], $currency),
        'total' => mediaMoney((int) $order['total_cents'], $currency),
        'payment_method' => $paymentLabels[(string) $order['payment_method']] ?? (string) $order['payment_method'],
        'payment_terms' => $dueDays > 0 ? $dueDays . ' days' : 'Due immediately',
        'customer_note' => (string) ($order['notes'] ?? ''),
        'customer_reference' => $customerReference,
        'reference_label' => $referenceLabel,
        'test_mode' => shopPreviewMode(),
    ];
    $qrData = null;
    if ((string) $order['payment_method'] === 'swiss_qr_invoice') {
        if (!is_array($terms)) {
            throw new HttpError(503, 'The QR invoice creditor snapshot is unavailable.');
        }
        try {
            $qrBill = swissQrCreate($terms, $order, $address);
            $qrData = [
                'svg' => $qrBill->getQrCode()->getAsString('svg'),
                'account' => (string) $terms['iban'],
                'creditor' => [
                    (string) $terms['name'],
                    trim((string) $terms['street'] . ' ' . (string) $terms['house_number']),
                    trim((string) $terms['postal_code'] . ' ' . (string) $terms['city']),
                    (string) $terms['country'],
                ],
                'debtor' => array_values(array_filter([
                    (string) ($address['company'] ?? ''),
                    (string) ($address['name'] ?? ''),
                    trim((string) ($address['line1'] ?? '') . ' ' . (string) ($address['line2'] ?? '')),
                    trim((string) ($address['postal_code'] ?? '') . ' ' . (string) ($address['city'] ?? '')),
                    (string) ($address['country'] ?? ''),
                ], static fn(string $line): bool => trim($line) !== '')),
                'currency' => 'CHF',
                'amount' => number_format(((int) $order['total_cents']) / 100, 2, '.', ''),
                'reference' => ($terms['reference_type'] ?? 'NON') === 'NON' ? '' : (string) ($terms['reference'] ?? ''),
                'information' => 'Order #' . (string) $order['number'],
            ];
        } catch (Throwable $exception) {
            throw new HttpError(503, 'The Swiss QR payment section could not be generated safely.');
        }
    }
    return renderProfessionalInvoicePdf($invoice, $qrData);
}

function mediaCreditDocument(int $returnId): never
{
    $document = mediaRenderCreditNotePdf($returnId);
    mediaSendPdf($document['bytes'], $document['name']);
}

/**
 * Renders a credit note and returns its bytes, so the HTTP route and the bulk
 * document archive share one renderer and one ownership check.
 *
 * @return array{name:string,bytes:string}
 */
function mediaRenderCreditNotePdf(int $returnId): array
{
    $user = requireUser();
    $sql = 'SELECT r.*,o.number AS order_number,o.currency,o.tax_bps,o.address_json '
        . 'FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id = ?';
    $parameters = [$returnId];
    if (($user['role'] ?? '') !== 'staff') {
        $sql .= ' AND r.user_id = ?';
        $parameters[] = (int) $user['id'];
    }
    $return = mediaFetchOne($sql, $parameters);
    if ($return === null) {
        throw new HttpError(404, 'Return not found.');
    }
    $settlement = mediaFetchOne('SELECT * FROM return_settlements WHERE return_id=?', [$returnId]);
    if ($settlement === null || (string)$settlement['status'] !== 'succeeded') {
        throw new HttpError(409, 'Credit note is unavailable until the return settlement succeeds.');
    }
    $creditNote = mediaFetchOne('SELECT * FROM customer_credit_notes WHERE settlement_id=?', [(int)$settlement['id']]);
    $snapshot = json_decode((string)$settlement['snapshot'], true);
    if (!is_array($snapshot) || !isset($snapshot['lines'])) throw new HttpError(409, 'The immutable settlement snapshot is unavailable.');
    $names = [];
    $statement = db()->prepare('SELECT ri.id,oi.name,oi.sku FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=?');
    $statement->execute([$returnId]);
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) $names[(int)$row['id']] = $row;
    $items = [];
    foreach ($snapshot['lines'] as $line) {
        $source = $names[(int)($line['return_item_id'] ?? 0)] ?? null;
        if ($source === null) continue;
        $items[] = ['name'=>$source['name'],'sku'=>$source['sku'],'quantity'=>(int)$line['received_quantity'],
            'price_cents'=>(int)$line['unit_net_cents'],'line_cents'=>(int)$line['net_cents']];
    }
    $number = shopPreviewMode()
        ? 'TEST-' . ($creditNote === null ? 'REF-' . (string)$return['number'] : (string)$creditNote['number'])
        : ($creditNote === null ? 'REF-' . (string)$return['number'] : (string)$creditNote['number']);
    $pdf = new PdfWriter($number, 'CREDIT NOTE');
    $pdf->heading('Credited return', 18);
    $pdf->line('Credit note: ' . $number);
    $pdf->line('Return: ' . (string) $return['number']);
    $pdf->line('Original order: ' . (string) $return['order_number']);
    $pdf->line('Original order tax snapshot: ' . number_format(((int) $return['tax_bps']) / 100, 2) . '%');
    $pdf->line('Created: ' . (string) $return['created_at']);
    $pdf->line('Reason: ' . (string) $return['reason']);
    $address = json_decode((string) $return['address_json'], true);
    if (is_array($address)) {
        $pdf->spacer();
        $pdf->heading('Original shipping address snapshot', 13);
        foreach (['name', 'company', 'line1', 'line2'] as $field) {
            if (isset($address[$field]) && trim((string) $address[$field]) !== '') {
                $pdf->line((string) $address[$field]);
            }
        }
        $locality = trim(((string) ($address['postal_code'] ?? '')) . ' ' . ((string) ($address['city'] ?? '')));
        if ($locality !== '') {
            $pdf->line($locality);
        }
        if (!empty($address['country'])) {
            $pdf->line((string) $address['country']);
        }
    }
    $pdf->spacer();
    $pdf->heading('Returned items at original prices', 13);
    $returnedSubtotal = 0;
    foreach ($items as $item) {
        $returnedSubtotal += (int) $item['line_cents'];
        $pdf->line(sprintf(
            '%s | %s | %d x %s = %s',
            (string) $item['sku'],
            (string) $item['name'],
            (int) $item['quantity'],
            mediaMoney((int) $item['price_cents'], (string) $return['currency']),
            mediaMoney((int) $item['line_cents'], (string) $return['currency'])
        ));
    }
    $pdf->rule();
    $creditedTax = (int)($snapshot['tax_cents'] ?? 0);
    $pdf->line('Returned item subtotal: ' . mediaMoney($returnedSubtotal, (string) $return['currency']));
    $pdf->line('Credited tax (original order allocation): ' . mediaMoney($creditedTax, (string) $return['currency']));
    $pdf->heading('Settlement amount: ' . mediaMoney((int) $settlement['amount_cents'], (string) $return['currency']), 13);
    $pdf->line('Settlement: ' . (string)$settlement['kind'] . ' / ' . (string)$settlement['status']);
    if ($creditNote !== null) {
        // A credit is regularly settled against a different invoice than the
        // one that was returned, so the two allocations are reported apart
        // instead of being summed under the original invoice.
        $originalOrderId = (int) $return['order_id'];
        $allocation = mediaFetchOne(
            'SELECT COALESCE(SUM(CASE WHEN target_order_id=? THEN amount_cents ELSE 0 END),0) own,
                    COALESCE(SUM(CASE WHEN target_order_id<>? THEN amount_cents ELSE 0 END),0) other
               FROM credit_applications WHERE credit_note_id=?',
            [$originalOrderId, $originalOrderId, (int)$creditNote['id']]
        ) ?? [];
        $ownApplied = (int)($allocation['own'] ?? 0);
        $otherApplied = (int)($allocation['other'] ?? 0);
        $pdf->line('Applied to invoice ' . (string)$return['order_number'] . ': '
            . mediaMoney($ownApplied, (string)$return['currency']));
        if ($otherApplied > 0) {
            $pdf->line('Applied to other open invoices: ' . mediaMoney($otherApplied, (string)$return['currency']));
        }
        $pdf->line('Remaining customer account credit: ' . mediaMoney((int)$creditNote['remaining_cents'], (string)$return['currency']));
    }
    return ['name' => strtolower($number) . '.pdf', 'bytes' => $pdf->output()];
}

/**
 * Imports one already-downloaded catalog image. This deliberately accepts
 * files only from storage/catalog-downloads and performs no network access.
 */
function mediaImportCatalogImage(int $productId, string $sourcePath, bool $replace = false): bool
{
    $nativeRoot = dirname(__DIR__);
    $downloadRoot = realpath($nativeRoot . '/storage/catalog-downloads');
    $realSource = realpath($sourcePath);
    if ($downloadRoot === false || $realSource === false
        || dirname($realSource) !== $downloadRoot
        || basename($realSource) !== $productId . '.img'
        || !is_file($realSource)) {
        throw new HttpError(400, 'Catalog image source path is invalid.');
    }
    if (!extension_loaded('gd') || !extension_loaded('fileinfo') || !function_exists('imagewebp')) {
        throw new HttpError(503, 'Image processing is unavailable on this test server.');
    }
    if (mediaFetchOne('SELECT id FROM products WHERE id = ? AND active = TRUE', [$productId]) === null) {
        throw new HttpError(404, 'Product not found.');
    }
    if (!$replace && mediaFetchOne('SELECT id FROM images WHERE product_id = ? LIMIT 1', [$productId]) !== null) {
        return false;
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($realSource);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_string($mime) || !isset($allowed[$mime])) {
        throw new HttpError(415, 'Unsupported catalog image MIME type.');
    }
    $decoderAvailable = match ($mime) {
        'image/jpeg' => function_exists('imagecreatefromjpeg'),
        'image/png' => function_exists('imagecreatefrompng'),
        'image/webp' => function_exists('imagecreatefromwebp'),
    };
    if (!$decoderAvailable) {
        throw new HttpError(503, 'The local GD build cannot decode this catalog image.');
    }
    $dimensions = @getimagesize($realSource);
    $width = (int) ($dimensions[0] ?? 0);
    $height = (int) ($dimensions[1] ?? 0);
    if ($width < 1 || $height < 1 || $width > intdiv(MEDIA_MAX_PIXELS, $height)) {
        throw new HttpError(422, 'Catalog image exceeds the 20 million pixel limit.');
    }
    $image = mediaDecode($realSource, $mime);
    if (!$image instanceof GdImage) {
        throw new HttpError(422, 'Catalog image could not be decoded safely.');
    }
    if ($mime === 'image/jpeg') {
        $image = mediaOrientJpeg($image, $realSource);
    }
    $width = imagesx($image);
    $height = imagesy($image);
    $token = bin2hex(random_bytes(16));
    $privateDirectory = $nativeRoot . '/storage/private/images/' . $productId;
    $publicDirectory = $nativeRoot . '/public/media/products/' . $productId;
    mediaMakeDirectory($privateDirectory);
    mediaMakeDirectory($publicDirectory);
    $originalRelative = 'storage/private/images/' . $productId . '/' . $token . '.' . $allowed[$mime];
    $written = [];

    try {
        $originalAbsolute = $nativeRoot . '/' . $originalRelative;
        mediaSaveSanitizedOriginal($image, $mime, $originalAbsolute);
        $written[] = $originalAbsolute;
        $variants = [];
        foreach ([320, 640, 1280] as $targetWidth) {
            $variantWidth = min($targetWidth, $width);
            $variantHeight = max(1, (int) round($height * ($variantWidth / $width)));
            $variantName = $token . '-' . $targetWidth . 'w.webp';
            $variantAbsolute = $publicDirectory . '/' . $variantName;
            mediaWriteWebpVariant($image, $variantWidth, $variantHeight, $variantAbsolute);
            $written[] = $variantAbsolute;
            $variants[(string) $targetWidth] = mediaPublicUrl('/media/products/' . $productId . '/' . $variantName);
        }
        imagedestroy($image);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT id FROM products WHERE id = ? AND active = TRUE FOR UPDATE');
            $lock->execute([$productId]);
            if ($lock->fetchColumn() === false) {
                throw new HttpError(404, 'Product not found.');
            }
            $existing = $pdo->prepare('SELECT id FROM images WHERE product_id = ? ORDER BY id LIMIT 1 FOR UPDATE');
            $existing->execute([$productId]);
            $existingId = $existing->fetchColumn();
            if ($existingId !== false && !$replace) {
                $pdo->rollBack();
                foreach ($written as $pathToRemove) {
                    @unlink($pathToRemove);
                }
                return false;
            }
            $url = $variants['1280'];
            $variantJson = json_encode($variants, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            if ($existingId !== false) {
                $statement = $pdo->prepare('UPDATE images SET url=?,variants=?,original_path=? WHERE id=?');
                $statement->execute([$url, $variantJson, $originalRelative, (int) $existingId]);
                $imageId = (int) $existingId;
            } else {
                $imageId = insertReturning($pdo, 'INSERT INTO images(product_id,url,variants,original_path) VALUES(?,?,?,?)',
                    [$productId, $url, $variantJson, $originalRelative]);
            }
            $pdo->prepare('UPDATE products SET image_url = ?,image_review_required=FALSE WHERE id = ?')->execute([$url, $productId]);
            audit($existingId !== false ? 'image.catalog_refreshed' : 'image.catalog_import', 'image', $imageId, [
                'product_id' => $productId, 'width' => $width, 'height' => $height,
            ]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    } catch (Throwable $exception) {
        if (isset($image) && $image instanceof GdImage) {
            @imagedestroy($image);
        }
        foreach ($written as $pathToRemove) {
            @unlink($pathToRemove);
        }
        throw $exception;
    }
    return true;
}

/** @param array<string,mixed> $order @param array<string,mixed> $address */
function mediaDocumentIntro(PdfWriter $pdf, array $order, array $address, string $number): void
{
    $pdf->heading('Ferry Telecom Wholesale Parts', 18);
    $pdf->line('Isolated PHP test shop - no live fulfillment or payment connection');
    $pdf->spacer();
    $pdf->line('Document: ' . $number);
    $pdf->line('Order: ' . (string) $order['number']);
    $pdf->line('Order date: ' . (string) $order['created_at']);
    $pdf->line('Currency: ' . (string) $order['currency']);
    $pdf->spacer();
    $pdf->heading('Shipping address snapshot', 13);
    foreach (['name', 'company', 'line1', 'line2'] as $field) {
        if (isset($address[$field]) && trim((string) $address[$field]) !== '') {
            $pdf->line((string) $address[$field]);
        }
    }
    $locality = trim(((string) ($address['postal_code'] ?? '')) . ' ' . ((string) ($address['city'] ?? '')));
    if ($locality !== '') {
        $pdf->line($locality);
    }
    if (!empty($address['country'])) {
        $pdf->line((string) $address['country']);
    }
    $pdf->spacer();
}

function mediaDecode(string $path, string $mime): GdImage|false
{
    return match ($mime) {
        'image/jpeg' => @imagecreatefromjpeg($path),
        'image/png' => @imagecreatefrompng($path),
        'image/webp' => @imagecreatefromwebp($path),
        default => false,
    };
}

function mediaOrientJpeg(GdImage $image, string $path): GdImage
{
    if (!function_exists('exif_read_data')) {
        return $image;
    }
    $exif = @exif_read_data($path, 'IFD0', true, false);
    $orientation = (int) ($exif['IFD0']['Orientation'] ?? $exif['Orientation'] ?? 1);
    if ($orientation === 2 && function_exists('imageflip')) {
        imageflip($image, IMG_FLIP_HORIZONTAL);
    } elseif ($orientation === 4 && function_exists('imageflip')) {
        imageflip($image, IMG_FLIP_VERTICAL);
    } elseif (in_array($orientation, [3, 5, 6, 7, 8], true)) {
        $degrees = match ($orientation) {
            3 => 180,
            5, 6 => -90,
            7, 8 => 90,
        };
        $rotated = imagerotate($image, $degrees, 0);
        if ($rotated instanceof GdImage) {
            imagedestroy($image);
            $image = $rotated;
        }
        if (in_array($orientation, [5, 7], true) && function_exists('imageflip')) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }
    }
    return $image;
}

function mediaSaveSanitizedOriginal(GdImage $image, string $mime, string $path): void
{
    $success = match ($mime) {
        'image/jpeg' => imagejpeg($image, $path, 92),
        'image/png' => imagepng($image, $path, 6),
        'image/webp' => imagewebp($image, $path, 92),
        default => false,
    };
    if (!$success) {
        throw new HttpError(500, 'The private image copy could not be written.');
    }
    @chmod($path, 0600);
}

function mediaWriteWebpVariant(GdImage $source, int $width, int $height, string $path): void
{
    $variant = imagecreatetruecolor($width, $height);
    if (!$variant instanceof GdImage) {
        throw new HttpError(500, 'Image memory could not be allocated.');
    }
    imagealphablending($variant, false);
    imagesavealpha($variant, true);
    $transparent = imagecolorallocatealpha($variant, 0, 0, 0, 127);
    imagefilledrectangle($variant, 0, 0, $width, $height, $transparent);
    if (!imagecopyresampled($variant, $source, 0, 0, 0, 0, $width, $height, imagesx($source), imagesy($source))
        || !imagewebp($variant, $path, 85)) {
        imagedestroy($variant);
        throw new HttpError(500, 'A responsive image could not be generated.');
    }
    imagedestroy($variant);
    @chmod($path, 0644);
}

function mediaMakeDirectory(string $directory): void
{
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new HttpError(500, 'Image storage is unavailable.');
    }
}

function mediaPublicUrl(string $suffix): string
{
    return rtrim(basePath(), '/') . '/' . ltrim($suffix, '/');
}

/** @param array<string,mixed> $image @return list<string> */
function mediaOwnedImagePaths(array $image): array
{
    $nativeRoot = dirname(__DIR__);
    $paths = [];
    $original = (string) ($image['original_path'] ?? '');
    if (preg_match('#^storage/private/images/\d+/[a-f0-9]{32}\.(?:jpg|png|webp)$#', $original)) {
        $paths[] = $nativeRoot . '/' . $original;
    }
    $variants = json_decode((string) ($image['variants'] ?? '{}'), true);
    if (is_array($variants)) {
        foreach ($variants as $url) {
            $urlPath = parse_url((string) $url, PHP_URL_PATH);
            if (is_string($urlPath) && preg_match('#/media/products/\d+/([a-f0-9]{32}-(?:320|640|1280)w\.webp)$#', $urlPath, $match)) {
                $paths[] = $nativeRoot . '/public/media/products/' . (int) $image['product_id'] . '/' . $match[1];
            }
        }
    }
    return array_values(array_unique($paths));
}

function mediaRespondImages(int $productId, int $status = 200): never
{
    $statement = db()->prepare('SELECT id,url,variants FROM images WHERE product_id = ? ORDER BY id');
    $statement->execute([$productId]);
    $images = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $image) {
        $images[] = [
            'id' => (int) $image['id'],
            'url' => (string) $image['url'],
            'variants' => json_decode((string) $image['variants'], true, 512, JSON_THROW_ON_ERROR),
        ];
    }
    respond(['images' => $images], $status);
}

/** @param list<mixed> $parameters @return array<string,mixed>|null */
function mediaFetchOne(string $sql, array $parameters): ?array
{
    $statement = db()->prepare($sql);
    $statement->execute($parameters);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function mediaMoney(int $cents, string $currency): string
{
    $currency = in_array($currency, ['EUR', 'CHF'], true) ? $currency : 'CHF';
    return $currency . ' ' . number_format($cents / 100, 2, '.', "'");
}

function mediaSendPdf(string $pdf, string $filename): never
{
    if (headers_sent()) {
        throw new HttpError(500, 'The PDF response could not be started.');
    }
    $safeName = preg_replace('/[^a-z0-9._-]+/i', '-', $filename) ?: 'test-document.pdf';
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $safeName . '"');
    header('Content-Length: ' . strlen($pdf));
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    echo $pdf;
    exit;
}