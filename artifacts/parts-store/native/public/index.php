<?php
declare(strict_types=1);

$brandLogo = dirname(__DIR__, 2) . '/src/assets/ferry-logo.png';
$catalogStylesheets = [
    'styles.css', 'workspace.css', 'workbench.css', 'storefront-redesign.css',
    'category-models.css', 'buyer-currency.css', 'b2b-catalog.css',
    'b2b-navigation.css', 'category-rail.css', 'commerce-redesign.css',
];
if (($_GET['asset'] ?? '') === 'brand-logo') {
    if (!is_file($brandLogo)) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/png');
    header('Content-Length: ' . (string) filesize($brandLogo));
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($brandLogo);
    exit;
}
if (($_GET['asset'] ?? '') === 'catalog-css') {
    header('Content-Type: text/css; charset=utf-8');
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        foreach ($catalogStylesheets as $stylesheet) {
            readfile(__DIR__ . '/assets/' . $stylesheet);
            echo "\n";
        }
    }
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';

// This is a session-aware application shell, not a static marketing page.
// Never let a browser revive an older shell with stale script URLs: model
// navigation and account controls must always match the currently deployed JS.
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');
header('Expires: 0');
header('Vary: Cookie');

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$basePath = '/test-shop/';
$relPath = str_starts_with($path, $basePath) ? substr($path, strlen($basePath)) : ltrim($path, '/');
if ($relPath === '') $relPath = '/';

$title = "Ferry Telecom | Wholesale Repair Parts";
$description = "Precision and reliability for professional repairers. Order your parts straight from stock.";
$ssrHtml = '';
$legalPages = [
    'returns-service' => ['Return & Service Policy', 'B2B returns, delivery issues and approved RMA service from Ferry Telecom AG.'],
    'return-service-policy' => ['Return & Service Policy', 'B2B returns, delivery issues and approved RMA service from Ferry Telecom AG.'],
    'terms-conditions' => ['Terms & Conditions', 'Business terms for purchasing repair parts and supplies from Ferry Telecom AG.'],
    'privacy-policy' => ['Privacy Policy', 'How Ferry Telecom AG handles personal data under Swiss data protection law.'],
    'quality-warranty' => ['Quality and warranty', 'Quality, testing and warranty conditions for professional repair parts.'],
    'quality-and-warranty-of-parts-for-iphone-ipad' => ['Quality and warranty', 'Quality, testing and warranty conditions for professional repair parts.'],
    'quality-options' => ['Quality options', 'A practical guide to original, refurbished, OLED, Incell and compatible part qualities.'],
    'quality-options-for-parts' => ['Quality options', 'A practical guide to original, refurbished, OLED, Incell and compatible part qualities.'],
];

if (preg_match('#^products/(\d+)$#', $relPath, $matches)) {
    $db = db();
    $id = (int)$matches[1];
    $stmt = $db->prepare("SELECT name, description FROM products WHERE id = ? AND active=TRUE AND publication_status='visible'");
    $stmt->execute([$id]);
    $prod = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($prod) {
        $title = htmlspecialchars((string)$prod['name'], ENT_QUOTES) . " | Ferry Telecom";
        $description = htmlspecialchars(substr((string)$prod['description'], 0, 160), ENT_QUOTES);
        $ssrHtml = "<h1>" . htmlspecialchars((string)$prod['name'], ENT_QUOTES) . "</h1><p>" . nl2br(htmlspecialchars((string)$prod['description'], ENT_QUOTES)) . "</p>";
    }
}
if (isset($legalPages[trim($relPath, '/')])) {
    [$legalTitle, $legalDescription] = $legalPages[trim($relPath, '/')];
    $title = $legalTitle . ' | Ferry Telecom';
    $description = $legalDescription;
    $ssrHtml = '<h1>' . htmlspecialchars($legalTitle, ENT_QUOTES) . '</h1><p>' . htmlspecialchars($legalDescription, ENT_QUOTES) . '</p>';
}
    $entryRoute = trim($relPath, '/');
    $isHomeRoute = $entryRoute === '';
    $isCatalogRoute = $entryRoute === 'catalog';
    $isAdminRoute = $entryRoute === 'admin' || str_starts_with($entryRoute, 'admin/');
    $isAccountRoute = $entryRoute === 'account' || str_starts_with($entryRoute, 'account/') || $entryRoute === 'quick-order';
    $isProductRoute = str_starts_with($entryRoute, 'products/');
    $isLegalRoute = isset($legalPages[$entryRoute]);
    $v_css = @filemtime(__DIR__ . '/assets/styles.css') ?: 1;
    $v_ws = @filemtime(__DIR__ . '/assets/workspace.css') ?: 1;
    $v_wb = @filemtime(__DIR__ . '/assets/workbench.css') ?: 1;
    $v_core = @filemtime(__DIR__ . '/assets/core.js') ?: 1;
    $v_i18n = @filemtime(__DIR__ . '/assets/i18n.js') ?: 1;
    $v_disc = @filemtime(__DIR__ . '/assets/discovery-controls.js') ?: 1;
    $v_qf = @filemtime(__DIR__ . '/assets/quick-finder.js') ?: 1;
    $v_store = @filemtime(__DIR__ . '/assets/store.js') ?: 1;
    $v_home = @filemtime(__DIR__ . '/assets/home.js') ?: 1;
    $v_acc = @filemtime(__DIR__ . '/assets/account.js') ?: 1;
    $v_admin = @filemtime(__DIR__ . '/assets/admin.js') ?: 1;
    $v_aprod = @filemtime(__DIR__ . '/assets/admin-products.js') ?: 1;
    $v_aops = @filemtime(__DIR__ . '/assets/admin-operations.js') ?: 1;
    $v_logo = @filemtime($brandLogo) ?: 1;
    $v_mark = @filemtime(__DIR__ . '/assets/mark.svg') ?: 1;
    $v_icon = @filemtime(__DIR__ . '/assets/apple-touch-icon.png') ?: 1;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $title ?></title>
    <meta name="description" content="<?= $description ?>">
    <link rel="icon" type="image/svg+xml" href="/test-shop/assets/mark.svg?v=<?= $v_mark ?>">
    <link rel="apple-touch-icon" sizes="180x180" href="/test-shop/assets/apple-touch-icon.png?v=<?= $v_icon ?>">
    <?php
        $stylesheets = $catalogStylesheets;
        if ($isHomeRoute) $stylesheets[] = 'home-landing.css';
        if ($isLegalRoute) $stylesheets[] = 'legal-pages.css';
        if ($isAccountRoute || $isProductRoute) {
            $stylesheets[] = 'b2b-account.css';
            $stylesheets[] = 'b2b-workspace.css';
        }
        if ($isAdminRoute) {
            $stylesheets[] = 'backoffice.css';
            $stylesheets[] = 'admin-prices.css';
            $stylesheets[] = 'b2b-workspace.css';
        }
        $stylesheets = array_unique($stylesheets);
        if ($isCatalogRoute):
            $catalogStyleVersion = max(array_map(
                static fn(string $stylesheet): int => (int) (@filemtime(__DIR__ . '/assets/' . $stylesheet) ?: 1),
                $catalogStylesheets
            ));
    ?>
    <link rel="stylesheet" href="/test-shop/?asset=catalog-css&amp;v=<?= $catalogStyleVersion ?>">
    <?php else: foreach ($stylesheets as $stylesheet):
        $version = @filemtime(__DIR__ . '/assets/' . $stylesheet) ?: 1;
    ?>
    <link rel="stylesheet" href="/test-shop/assets/<?= htmlspecialchars($stylesheet, ENT_QUOTES) ?>?v=<?= $version ?>">
    <?php endforeach; endif; ?>
    <script>window.APP_BASE = '/test-shop/'; window.LOGO_V = '<?= $v_logo ?>';</script>
</head>
<body data-entry-route="<?= htmlspecialchars($entryRoute === '' ? 'home' : $entryRoute, ENT_QUOTES) ?>">
    <div id="test-banner" class="test-banner">
        <span data-i18n="testBanner">TEST ENVIRONMENT &mdash; NO REAL ORDERS, STOCK OR PAYMENTS</span>
        <div class="language-control">
            <label class="sr-only" for="language-selector" data-i18n="language">Language</label>
            <svg class="language-control__icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M3 12h18M12 3a14.7 14.7 0 0 1 0 18M12 3a14.7 14.7 0 0 0 0 18"></path>
            </svg>
            <select id="language-selector" aria-label="Select language" data-i18n-aria-label="selectLanguage">
                <option value="en">EN</option><option value="nl">NL</option><option value="de">DE</option><option value="fr">FR</option><option value="it">IT</option>
            </select>
            <svg class="language-control__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m7 10 5 5 5-5"></path>
            </svg>
        </div>
    </div>
    
    <header class="app-header">
        <div class="container header-inner">
            <a href="/test-shop/" class="logo" aria-label="Home" data-i18n-aria-label="home">
                <img src="/test-shop/?asset=brand-logo&amp;v=<?= $v_logo ?>" alt="Ferry Telecom" width="1736" height="475">
            </a>

            <button type="button" class="page-search-jump" aria-label="Open Smart Search" data-i18n-aria-label="openSmartSearch" onclick="const panel=document.querySelector('[data-catalog-smart-search]'); if(panel){panel.hidden=false;} const input=document.querySelector('#home-search, #catalog-smart-search'); if(input){input.focus({preventScroll:true}); input.scrollIntoView({behavior:'smooth',block:'center'});}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line></svg>
                <span data-i18n="searchAllProducts">Search all products</span>
            </button>
            
            <div class="search-bar">
                <form id="global-search" onsubmit="event.preventDefault(); window.Router.navigate(window.Discovery.buildUrl(new URLSearchParams(), {q: this.q.value})); window.UI.closeSuggestions();" data-search-root>
                    <div class="search-input-wrapper">
                        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line></svg>
                        <input type="search" name="q" id="search-input" placeholder="Search the entire catalogue…" data-i18n-placeholder="wholeCatalogueSearchPlaceholder" aria-label="Search all products in the catalogue" data-i18n-aria-label="searchAllProducts" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-controls="search-suggestions" aria-expanded="false" autocomplete="off" oninput="window.App.handleSearchInput(this.value, 'search-input')" onfocus="window.App.handleSearchFocus('search-input')" onkeydown="window.App.handleSearchKeydown(event)">
                        <button type="submit" class="search-submit" data-i18n="searchAll">Search all</button>
                    </div>
                    <div id="search-suggestions" class="search-suggestions b2b-search-results" role="dialog" aria-label="Order products directly" data-i18n-aria-label="orderDirectly" style="display:none;"></div>
                </form>
            </div>
            
            <nav class="user-nav" id="user-nav">
                <!-- Nav populated by JS -->
            </nav>
        </div>
        <nav id="store-menu" class="store-menu" aria-label="Catalogue menu" data-i18n-aria-label="catalogueMenu"></nav>
    </header>

    <main id="app-root" class="main-content container">
        <noscript>
            <div class="alert error" data-i18n="jsRequired">JavaScript is required for the full wholesale experience.</div>
            <div class="ssr-content">
                <?= $ssrHtml ?>
            </div>
        </noscript>
        <div class="page-loader">
            <div class="spinner"></div>
        </div>
    </main>

    <footer class="app-footer" id="site-footer">
        <div class="footer-service-strip">
            <div class="container footer-service-grid">
                <div class="footer-service-item">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v9"/></svg>
                    <span><strong data-i18n="footerLiveStock">Current stock</strong><small data-i18n="footerLiveStockText">See availability before ordering</small></span>
                </div>
                <div class="footer-service-item">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/></svg>
                    <span><strong data-i18n="footerBusinessPricing">Business pricing</strong><small data-i18n="footerBusinessPricingText">Pricing for approved customers</small></span>
                </div>
                <div class="footer-service-item">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    <span><strong data-i18n="footerSecureAccount">Secure account</strong><small data-i18n="footerSecureAccountText">Orders and addresses in one place</small></span>
                </div>
            </div>
        </div>
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <img src="/test-shop/?asset=brand-logo&amp;v=<?= $v_logo ?>" alt="Ferry Telecom" class="footer-logo" width="1736" height="475" loading="lazy" decoding="async">
                    <p data-i18n="footerText">The standard for professional repairers. Precision, reliability and stock ready to ship.</p>
                    <p class="footer-business-note" data-i18n="footerBusinessOnly">Wholesale parts for professional repair and resale businesses.</p>
                </div>
                <div class="footer-links">
                    <h4 data-i18n="footerShop">Shop</h4>
                    <a href="/test-shop/catalog" data-i18n="catalogue">Catalogue</a>
                    <a href="/test-shop/catalog?department=parts" data-i18n="partsMenu">Parts</a>
                    <a href="/test-shop/catalog?department=supplies" data-i18n="supplies">Supplies</a>
                    <a href="/test-shop/catalog?featured=1" data-i18n="footerFeatured">Featured products</a>
                </div>
                <div class="footer-links" id="footer-account-links">
                    <h4 data-i18n="footerAccount">Account</h4>
                    <a href="/test-shop/login" data-i18n="signIn">Sign in</a>
                    <a href="/test-shop/register" data-i18n="requestAccount">Request an account</a>
                    <a href="/test-shop/cart" data-i18n="cart">Cart</a>
                </div>
                <div class="footer-links">
                    <h4 data-i18n="footerOrdersService">Orders & service</h4>
                    <a href="/test-shop/account/orders" data-i18n="footerOrderHistory">Order history</a>
                    <a href="/test-shop/account/returns" data-i18n="footerReturns">Returns</a>
                    <a href="/test-shop/account/addresses" data-i18n="footerAddresses">Delivery addresses</a>
                    <a href="/test-shop/register" data-i18n="becomeCustomer">Become a customer</a>
                </div>
                <div class="footer-links">
                    <h4>Customer service</h4>
                    <a href="/test-shop/returns-service">Return &amp; Service Policy</a>
                    <a href="/test-shop/terms-conditions">Terms &amp; Conditions</a>
                    <a href="/test-shop/privacy-policy">Privacy Policy</a>
                    <a href="/test-shop/quality-warranty">Quality and warranty</a>
                    <a href="/test-shop/quality-options">Quality options</a>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <div class="container footer-bottom-inner">
                <span>&copy; <?= date('Y') ?> Ferry Telecom. <span data-i18n="rightsReserved">All rights reserved.</span></span>
                <span data-i18n="footerB2b">B2B wholesale for professional repairers</span>
            </div>
        </div>
    </footer>

    <?php
        $scripts = [
            'i18n.js', 'core.js', 'b2b-ordering.js', 'buyer-currency.js',
            'model-search.js', 'discovery-controls.js', 'quick-finder.js',
            'category-models.js', 'store.js', 'b2b-catalog.js', 'b2b-menu.js',
        ];
        if ($isHomeRoute) array_push($scripts, 'home-landing.js', 'home.js');
        if ($isAccountRoute) array_push($scripts, 'account.js', 'quick-order.js', 'account-workspace.js');
        if ($isProductRoute) $scripts[] = 'account-workspace.js';
        if ($isLegalRoute) $scripts[] = 'legal-pages.js';
        if ($isAdminRoute) {
            array_push(
                $scripts, 'admin-shell.js', 'admin.js', 'admin-products.js',
                'admin-prices.js', 'admin-operations.js', 'admin-invoices.js'
            );
        }
        foreach (array_unique($scripts) as $script):
            $version = @filemtime(__DIR__ . '/assets/' . $script) ?: 1;
    ?>
    <script src="/test-shop/assets/<?= htmlspecialchars($script, ENT_QUOTES) ?>?v=<?= $version ?>"></script>
    <?php endforeach; ?>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            window.App.init();
        });
    </script>
</body>
</html>
