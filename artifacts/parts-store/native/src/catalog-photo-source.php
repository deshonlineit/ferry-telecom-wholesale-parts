<?php
declare(strict_types=1);

function catalogPhotoSourceUrl(string $value): ?string
{
    $url = trim(explode('!', $value, 2)[0]);
    $url = preg_replace('#^http://#i', 'https://', $url) ?? $url;
    $parts = parse_url($url);
    if (!is_array($parts)
        || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
        || !in_array(strtolower((string) ($parts['host'] ?? '')), ['ferrytelecom.com', 'www.ferrytelecom.com'], true)
        || (isset($parts['port']) && $parts['port'] !== 443)
        || !str_starts_with((string) ($parts['path'] ?? ''), '/wp-content/uploads/')
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
        || preg_match('#(?:^|/)\.{1,2}(?:/|$)#', rawurldecode((string) ($parts['path'] ?? '')))) {
        return null;
    }
    return $url;
}