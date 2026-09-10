<?php
declare(strict_types=1);

$brandLogo = dirname(__DIR__, 2) . '/src/assets/ferry-logo.png';
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

$db = db();
if (preg_match('#^products/(\d+)$#', $relPath, $matches)) {
    $id = (int)$matches[1];
    $stmt = $db->prepare("SELECT name, description FROM products WHERE id = ? AND active=1 AND publication_status='visible'");
    $stmt->execute([$id]);
    $prod = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($prod) {
        $title = htmlspecialchars((string)$prod['name'], ENT_QUOTES) . " | Ferry Telecom";
        $description = htmlspecialchars(substr((string)$prod['description'], 0, 160), ENT_QUOTES);
        $ssrHtml = "<h1>" . htmlspecialchars((string)$prod['name'], ENT_QUOTES) . "</h1><p>" . nl2br(htmlspecialchars((string)$prod['description'], ENT_QUOTES)) . "</p>";
    }
} else {
    $stmt = $db->query("SELECT id, name FROM categories ORDER BY name ASC LIMIT 20");
    $cats = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if ($cats) {
        $ssrHtml .= "<h2>Catalogue</h2><ul class='ssr-categories'>";
        foreach ($cats as $cat) {
            $ssrHtml .= "<li><a href=\"/test-shop/catalog?category=" . $cat['id'] . "\">" . htmlspecialchars((string)$cat['name'], ENT_QUOTES) . "</a></li>";
        }
        $ssrHtml .= "</ul>";
    }
}
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
    <link rel="stylesheet" href="/test-shop/assets/styles.css?v=<?= $v_css ?>">
    <link rel="stylesheet" href="/test-shop/assets/workspace.css?v=<?= $v_ws ?>">
    <link rel="stylesheet" href="/test-shop/assets/workbench.css?v=<?= $v_wb ?>">
    <link rel="stylesheet" href="/test-shop/assets/backoffice.css?v=<?= @filemtime(__DIR__ . '/assets/backoffice.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/storefront-redesign.css?v=<?= @filemtime(__DIR__ . '/assets/storefront-redesign.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/category-models.css?v=<?= @filemtime(__DIR__ . '/assets/category-models.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/home-landing.css?v=<?= @filemtime(__DIR__ . '/assets/home-landing.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/buyer-currency.css?v=<?= @filemtime(__DIR__ . '/assets/buyer-currency.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/admin-prices.css?v=<?= @filemtime(__DIR__ . '/assets/admin-prices.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/b2b-catalog.css?v=<?= @filemtime(__DIR__ . '/assets/b2b-catalog.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/b2b-navigation.css?v=<?= @filemtime(__DIR__ . '/assets/b2b-navigation.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/category-rail.css?v=<?= @filemtime(__DIR__ . '/assets/category-rail.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/commerce-redesign.css?v=<?= @filemtime(__DIR__ . '/assets/commerce-redesign.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/b2b-account.css?v=<?= @filemtime(__DIR__ . '/assets/b2b-account.css') ?: 1 ?>">
    <link rel="stylesheet" href="/test-shop/assets/b2b-workspace.css?v=<?= @filemtime(__DIR__ . '/assets/b2b-workspace.css') ?: 1 ?>">
    <script>window.APP_BASE = '/test-shop/'; window.LOGO_V = '<?= $v_logo ?>';</script>
</head>
<body>
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
                <img src="/test-shop/?asset=brand-logo&amp;v=<?= $v_logo ?>" alt="Ferry Telecom">
            </a>

            <button type="button" class="page-search-jump" aria-label="Open Smart Search" data-i18n-aria-label="openSmartSearch" onclick="const panel=document.querySelector('[data-catalog-smart-search]'); if(panel){panel.hidden=false;} const input=document.querySelector('#home-search, #catalog-smart-search'); if(input){input.focus({preventScroll:true}); input.scrollIntoView({behavior:'smooth',block:'center'});}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line></svg>
                <span data-i18n="search">Search</span>
            </button>
            
            <div class="search-bar">
                <form id="global-search" onsubmit="event.preventDefault(); window.Router.navigate(window.Discovery.buildUrl(new URLSearchParams(), {q: this.q.value})); window.UI.closeSuggestions();" data-search-root>
                    <div class="search-input-wrapper">
                        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line></svg>
                        <input type="search" name="q" id="search-input" placeholder="Describe what you need…" data-i18n-placeholder="smartSearchPrompt" aria-label="Smart Search: describe the part you need" data-i18n-aria-label="smartSearchPrompt" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-controls="search-suggestions" aria-expanded="false" autocomplete="off" oninput="window.App.handleSearchInput(this.value, 'search-input')" onfocus="window.App.handleSearchFocus('search-input')" onkeydown="window.App.handleSearchKeydown(event)">
                        <button type="submit" class="search-submit" data-i18n="smartSearch">Smart search</button>
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

    <footer class="app-footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <img src="/test-shop/?asset=brand-logo&amp;v=<?= $v_logo ?>" alt="Ferry Telecom" class="footer-logo">
                    <p data-i18n="footerText">The standard for professional repairers. Precision, reliability and stock ready to ship.</p>
                </div>
                <div class="footer-links" id="footer-account-links">
                    <h4 data-i18n="navigation">Navigation</h4>
                    <a href="/test-shop/catalog" data-i18n="catalogue">Catalogue</a>
                    <a href="/test-shop/login" data-i18n="signIn">Sign in</a>
                    <a href="/test-shop/register" data-i18n="requestAccount">Request an account</a>
                </div>
                <div class="footer-links">
                    <h4 data-i18n="testEnvironment">Test environment</h4>
                    <p class="text-muted small" data-i18n="demoNotice">This application is for demonstration purposes only. No real e-mails are sent and no payments are processed.</p>
                    <div class="demo-actions mt-2">
                        <button onclick="window.App.demoLogin('customer')" class="btn btn-outline btn-sm" data-i18n="demoCustomer">Demo customer login</button>
                        <button onclick="window.App.demoLogin('partner')" class="btn btn-outline btn-sm" data-i18n="demoPartner">Demo Partner</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <div class="container">
                &copy; <?= date('Y') ?> Ferry Telecom <span data-i18n="testEnvironment">test environment</span>. <span data-i18n="rightsReserved">All rights reserved.</span>
            </div>
        </div>
    </footer>

    <script src="/test-shop/assets/i18n.js?v=<?= $v_i18n ?>"></script>
    <script src="/test-shop/assets/core.js?v=<?= $v_core ?>"></script>
    <script src="/test-shop/assets/b2b-ordering.js?v=<?= @filemtime(__DIR__ . '/assets/b2b-ordering.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/buyer-currency.js?v=<?= @filemtime(__DIR__ . '/assets/buyer-currency.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/model-search.js?v=<?= @filemtime(__DIR__ . '/assets/model-search.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/discovery-controls.js?v=<?= $v_disc ?>"></script>
    <script src="/test-shop/assets/quick-finder.js?v=<?= $v_qf ?>"></script>
    <script src="/test-shop/assets/category-models.js?v=<?= @filemtime(__DIR__ . '/assets/category-models.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/store.js?v=<?= $v_store ?>"></script>
    <script src="/test-shop/assets/b2b-catalog.js?v=<?= @filemtime(__DIR__ . '/assets/b2b-catalog.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/b2b-menu.js?v=<?= @filemtime(__DIR__ . '/assets/b2b-menu.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/home-landing.js?v=<?= @filemtime(__DIR__ . '/assets/home-landing.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/home.js?v=<?= $v_home ?>"></script>
    <script src="/test-shop/assets/account.js?v=<?= $v_acc ?>"></script>
    <script src="/test-shop/assets/quick-order.js?v=<?= @filemtime(__DIR__ . '/assets/quick-order.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/account-workspace.js?v=<?= @filemtime(__DIR__ . '/assets/account-workspace.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/admin-shell.js?v=<?= @filemtime(__DIR__ . '/assets/admin-shell.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/admin.js?v=<?= $v_admin ?>"></script>
    <script src="/test-shop/assets/admin-products.js?v=<?= $v_aprod ?>"></script>
    <script src="/test-shop/assets/admin-prices.js?v=<?= @filemtime(__DIR__ . '/assets/admin-prices.js') ?: 1 ?>"></script>
    <script src="/test-shop/assets/admin-operations.js?v=<?= $v_aops ?>"></script>
    <script src="/test-shop/assets/admin-invoices.js?v=<?= @filemtime(__DIR__ . '/assets/admin-invoices.js') ?: 1 ?>"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            window.App.init();
        });
    </script>
</body>
</html>
