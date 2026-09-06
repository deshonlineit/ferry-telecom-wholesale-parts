<?php
declare(strict_types=1);

const ECB_REFERENCE_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const ECB_REFERENCE_MAX_BYTES = 131072;

final class EcbReferenceError extends RuntimeException {}

function ecbParseReference(string $xml, ?DateTimeImmutable $now = null): array
{
    if ($xml === '' || strlen($xml) > ECB_REFERENCE_MAX_BYTES
        || preg_match('/<!\s*(DOCTYPE|ENTITY)\b/i', $xml)) {
        throw new EcbReferenceError('Ongeldige of te grote ECB-respons.');
    }
    $previous = libxml_use_internal_errors(true);
    try {
        $document = new DOMDocument();
        if (!$document->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS)) {
            throw new EcbReferenceError('De ECB-respons bevat geen geldige XML.');
        }
        $xpath = new DOMXPath($document);
        $days = $xpath->query('//*[local-name()="Cube" and @time]');
        if ($days->length !== 1) {
            throw new EcbReferenceError('De ECB-koersdatum ontbreekt of is dubbel.');
        }
        $date = $days->item(0)->getAttribute('time');
        $day = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('UTC'));
        $today = ($now ?? new DateTimeImmutable('now', new DateTimeZone('UTC')))->setTime(0, 0);
        if (!$day || $day->format('Y-m-d') !== $date || $day > $today || $day < $today->modify('-7 days')) {
            throw new EcbReferenceError('De ECB-koersdatum is ongeldig, toekomstig of te oud.');
        }
        $quotes = $xpath->query('./*[local-name()="Cube" and @currency="CHF"]', $days->item(0));
        if ($quotes->length !== 1) {
            throw new EcbReferenceError('De CHF-referentiekoers ontbreekt of is dubbel.');
        }
        $decimal = $quotes->item(0)->getAttribute('rate');
        if (!preg_match('/^(\d{1,3})(?:\.(\d{1,6}))?$/D', $decimal, $match)) {
            throw new EcbReferenceError('De CHF-referentiekoers is geen geldige decimale koers.');
        }
        $ppm = (int) $match[1] * 1000000 + (int) str_pad($match[2] ?? '', 6, '0');
        if ($ppm < 1 || $ppm > 100000000) {
            throw new EcbReferenceError('De CHF-referentiekoers valt buiten het toegestane bereik.');
        }
        return ['base_currency' => 'EUR', 'quote_currency' => 'CHF', 'rate_ppm' => $ppm,
            'rate_date' => $date, 'source_url' => ECB_REFERENCE_URL];
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
}

function ecbFetchReference(): array
{
    $body = '';
    $curl = curl_init(ECB_REFERENCE_URL);
    curl_setopt_array($curl, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/xml, text/xml'],
        CURLOPT_USERAGENT => 'FerryTelecom-ReferenceRates/1.0',
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > ECB_REFERENCE_MAX_BYTES) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    try {
        $ok = curl_exec($curl);
        if ($ok === false || curl_getinfo($curl, CURLINFO_HTTP_CODE) !== 200) {
            throw new EcbReferenceError('De ECB-referentiekoers kon niet veilig worden opgehaald.');
        }
    } finally {
        curl_close($curl);
    }
    return ecbParseReference($body);
}