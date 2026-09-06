<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/catalog-photo-source.php';

$valid = 'https://ferrytelecom.com/wp-content/uploads/2024/01/part.jpg';
$cases = [
    [$valid, $valid],
    ['http://ferrytelecom.com/wp-content/uploads/2024/01/part.jpg', $valid],
    [$valid . '!alt text', $valid],
    ['https://www.ferrytelecom.com/wp-content/uploads/part.webp', 'https://www.ferrytelecom.com/wp-content/uploads/part.webp'],
    ['https://ferrytelecom.com:443/wp-content/uploads/part.png', 'https://ferrytelecom.com:443/wp-content/uploads/part.png'],
    ['https://other.invalid/wp-content/uploads/part.jpg', null],
    ['https://ferrytelecom.com.other.invalid/wp-content/uploads/part.jpg', null],
    ['https://ferrytelecom.com@127.0.0.1/wp-content/uploads/part.jpg', null],
    ['https://ferrytelecom.com:8443/wp-content/uploads/part.jpg', null],
    ['https://ferrytelecom.com/private/part.jpg', null],
    ['https://ferrytelecom.com/wp-content/uploads/../private.jpg', null],
    ['https://ferrytelecom.com/wp-content/uploads/%2e%2e/private.jpg', null],
    [$valid . '#fragment', null],
    ['file:///etc/passwd', null],
    ['', null],
];
foreach ($cases as [$input, $expected]) {
    if (catalogPhotoSourceUrl($input) !== $expected) {
        throw new RuntimeException('Photo-source policy assertion failed.');
    }
}
$downloader = (string) file_get_contents(__DIR__ . '/download-catalog-photos.php');
if (!str_contains($downloader, 'CURLOPT_FOLLOWLOCATION => false')
    || !str_contains($downloader, 'CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,')
    || !str_contains($downloader, 'catalogPhotoSourceUrl($url) !== $url')) {
    throw new RuntimeException('Downloader must reject redirects and revalidate every manifest URL.');
}
echo "PASS: 15 source-policy cases; HTTPS-only, no redirects, and manifest revalidation.\n";