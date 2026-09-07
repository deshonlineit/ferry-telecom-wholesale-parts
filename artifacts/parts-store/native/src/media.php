<?php
declare(strict_types=1);

require_once __DIR__ . '/PdfWriter.php';

const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_MAX_PIXELS = 20_000_000;

function handleMedia(string $method, string $path): bool
{
    if ($method === 'POST' && preg_match('#^/admin/products/(\d+)/images/?$#', $path, $match)) {
        mediaUpload((int) $match[1]);
    }
    if ($method === 'DELETE' && preg_match('#^/admin/images/(\d+)/?$#', $path, $match)) {
        mediaDelete((int) $match[1]);
    }
    if ($method === 'GET' && preg_match('#^/documents/(\d+)/(invoice|packing-slip)\.pdf$#', $path, $match)) {
        mediaOrderDocument((int) $match[1], $match[2]);
    }
    if ($method === 'GET' && preg_match('#^/documents/returns/(\d+)/credit-note\.pdf$#', $path, $match)) {
        mediaCreditDocument((int) $match[1]);
    }
    return false;
}

function mediaUpload(int $productId): never
{
    requireStaff();
    if (!extension_loaded('gd') || !extension_loaded('fileinfo') || !function_exists('imagewebp')) {
        throw new HttpError(503, 'Image processing is unavailable on this test server.');
    }
    $product = mediaFetchOne('SELECT id FROM products WHERE id = ? AND active = 1', [$productId]);
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
            $statement = $pdo->prepare('INSERT INTO images(product_id,url,variants,original_path) VALUES(?,?,?,?)');
            $statement->execute([
                $productId,
                $mainUrl,
                json_encode($variants, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                $originalRelative,
            ]);
            $imageId = (int) $pdo->lastInsertId();
            $pdo->prepare("UPDATE products SET image_url = ? WHERE id = ? AND image_url = ''")->execute([$mainUrl, $productId]);
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
    $sql = 'SELECT * FROM orders WHERE id = ?';
    $parameters = [$orderId];
    if (($user['role'] ?? '') !== 'staff') {
        $sql .= ' AND user_id = ?';
        $parameters[] = (int) $user['id'];
    }
    $order = mediaFetchOne($sql, $parameters);
    if ($order === null) {
        throw new HttpError(404, 'Order document not found.');
    }
    $statement = db()->prepare('SELECT name,sku,quantity,price_cents,total_cents FROM order_items WHERE order_id = ? ORDER BY id');
    $statement->execute([$orderId]);
    $items = $statement->fetchAll(PDO::FETCH_ASSOC);
    $address = json_decode((string) $order['address_json'], true);
    if (!is_array($address)) {
        $address = [];
    }

    $isInvoice = $kind === 'invoice';
    $prefix = $isInvoice ? 'TEST-INV-' : 'TEST-PACK-';
    $number = $prefix . (string) $order['number'];
    $pdf = new PdfWriter($number, $isInvoice ? 'INVOICE' : 'PACKING SLIP');
    mediaDocumentIntro($pdf, $order, $address, $number);
    $pdf->heading($isInvoice ? 'Items and original prices' : 'Items to pack', 13);
    if (!empty($order['shipping_method_name'])) {
        $pdf->line('Shipping method: ' . (string) $order['shipping_method_name']);
    }
    foreach ($items as $item) {
        if ($isInvoice) {
            $pdf->line(sprintf(
                '%s | %s | %d x %s = %s',
                (string) $item['sku'],
                (string) $item['name'],
                (int) $item['quantity'],
                mediaMoney((int) $item['price_cents'], (string) $order['currency']),
                mediaMoney((int) $item['total_cents'], (string) $order['currency'])
            ));
        } else {
            $pdf->line(sprintf('[  ] %d x %s | %s', (int) $item['quantity'], (string) $item['sku'], (string) $item['name']));
        }
    }
    if ($isInvoice) {
        $pdf->rule();
        $pdf->line('Subtotal excl. VAT: ' . mediaMoney((int) $order['subtotal_cents'], (string) $order['currency']));
        $pdf->line(sprintf('Tax (snapshot %.2f%%): %s', ((int) $order['tax_bps']) / 100, mediaMoney((int) $order['tax_cents'], (string) $order['currency'])));
        $pdf->line('Shipping excl. VAT: ' . mediaMoney((int) $order['shipping_cents'], (string) $order['currency']));
        $pdf->heading('Total incl. VAT: ' . mediaMoney((int) $order['total_cents'], (string) $order['currency']), 13);
        $paymentLabels = [
            'swiss_qr_invoice' => 'Swiss QR Invoice (payment due)',
            'pay_later' => 'Pay Later (payment due)',
            'test_invoice' => 'Legacy test invoice',
            'test_card' => 'Legacy test card',
        ];
        $pdf->line('Order status: ' . ((string) $order['status'] === 'on_hold' ? 'On hold - awaiting payment' : (string) $order['status']));
        $pdf->line('Payment method: ' . ($paymentLabels[(string) $order['payment_method']] ?? (string) $order['payment_method']));
        $pdf->line('No bank account, payment link, or live payment instructions are included in this isolated test document.');
        if ((string) $order['payment_method'] === 'swiss_qr_invoice') {
            $pdf->line('Swiss QR payment details are not yet included; no non-compliant QR code has been generated.');
        }
    } else {
        $pdf->spacer();
        $pdf->line('Test fulfillment only. This slip does not authorize a real shipment.');
    }
    mediaSendPdf($pdf->output(), strtolower($number) . '.pdf');
}

function mediaCreditDocument(int $returnId): never
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
    if (!in_array((string) $return['status'], ['approved', 'credited'], true) || (int) $return['credit_cents'] <= 0) {
        throw new HttpError(409, 'Credit note is unavailable until the return has an approved credit amount.');
    }
    $statement = db()->prepare(
        'SELECT oi.name,oi.sku,ri.quantity,oi.price_cents,(ri.quantity * oi.price_cents) AS line_cents '
        . 'FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id '
        . 'WHERE ri.return_id = ? ORDER BY ri.id'
    );
    $statement->execute([$returnId]);
    $items = $statement->fetchAll(PDO::FETCH_ASSOC);
    $number = 'TEST-CN-' . (string) $return['number'];
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
    $creditedTax = (int) $return['credit_cents'] - $returnedSubtotal;
    $pdf->line('Returned item subtotal: ' . mediaMoney($returnedSubtotal, (string) $return['currency']));
    $pdf->line('Credited tax (original order allocation): ' . mediaMoney($creditedTax, (string) $return['currency']));
    $pdf->heading('Credited amount: ' . mediaMoney((int) $return['credit_cents'], (string) $return['currency']), 13);
    $pdf->line('This is an isolated test credit record. It does not initiate a bank transfer or card refund.');
    mediaSendPdf($pdf->output(), strtolower($number) . '.pdf');
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
    if (mediaFetchOne('SELECT id FROM products WHERE id = ? AND active = 1', [$productId]) === null) {
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
            $lock = $pdo->prepare('SELECT id FROM products WHERE id = ? AND active = 1 FOR UPDATE');
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
                $statement = $pdo->prepare('INSERT INTO images(product_id,url,variants,original_path) VALUES(?,?,?,?)');
                $statement->execute([$productId, $url, $variantJson, $originalRelative]);
                $imageId = (int) $pdo->lastInsertId();
            }
            $pdo->prepare('UPDATE products SET image_url = ? WHERE id = ?')->execute([$url, $productId]);
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