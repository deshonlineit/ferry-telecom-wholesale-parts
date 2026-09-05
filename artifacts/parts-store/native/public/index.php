<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$basePath = '/test-shop/';
$relPath = str_starts_with($path, $basePath) ? substr($path, strlen($basePath)) : ltrim($path, '/');
if ($relPath === '') $relPath = '/';

$title = "Ferry Telecom | Groothandel in Onderdelen";
$description = "Precisie en betrouwbaarheid voor professionele reparateurs. Bestel uw onderdelen direct uit voorraad.";
$ssrHtml = '';

$db = db();
if (preg_match('#^products/(\d+)$#', $relPath, $matches)) {
    $id = (int)$matches[1];
    $stmt = $db->prepare("SELECT name, description FROM products WHERE id = ?");
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
        $ssrHtml .= "<h2>Assortiment</h2><ul class='ssr-categories'>";
        foreach ($cats as $cat) {
            $ssrHtml .= "<li><a href=\"/test-shop/catalog?category=" . $cat['id'] . "\">" . htmlspecialchars((string)$cat['name'], ENT_QUOTES) . "</a></li>";
        }
        $ssrHtml .= "</ul>";
    }
}
    $v_css = @filemtime(__DIR__ . '/assets/styles.css') ?: 1;
    $v_ws = @filemtime(__DIR__ . '/assets/workspace.css') ?: 1;
    $v_core = @filemtime(__DIR__ . '/assets/core.js') ?: 1;
    $v_store = @filemtime(__DIR__ . '/assets/store.js') ?: 1;
    $v_acc = @filemtime(__DIR__ . '/assets/account.js') ?: 1;
    $v_admin = @filemtime(__DIR__ . '/assets/admin.js') ?: 1;
    $v_aprod = @filemtime(__DIR__ . '/assets/admin-products.js') ?: 1;
    $v_aops = @filemtime(__DIR__ . '/assets/admin-operations.js') ?: 1;
?>
<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $title ?></title>
    <meta name="description" content="<?= $description ?>">
    <link rel="icon" type="image/svg+xml" href="/test-shop/assets/logo.svg">
    <link rel="stylesheet" href="/test-shop/assets/styles.css?v=<?= $v_css ?>">
    <link rel="stylesheet" href="/test-shop/assets/workspace.css?v=<?= $v_ws ?>">
    <script>window.APP_BASE = '/test-shop/';</script>
</head>
<body>
    <div id="test-banner" class="test-banner">TESTOMGEVING &mdash; GEEN ECHTE BESTELLINGEN, VOORRAAD OF BETALINGEN</div>
    
    <header class="app-header">
        <div class="container header-inner">
            <a href="/test-shop/" class="logo" aria-label="Home">
                <img src="/test-shop/assets/logo.svg" alt="Ferry Telecom Wholesale">
            </a>
            
            <div class="search-bar">
                <form id="global-search" onsubmit="event.preventDefault(); window.Router.navigate('/test-shop/catalog?q=' + encodeURIComponent(this.q.value)); window.UI.closeSuggestions();">
                    <div class="search-input-wrapper">
                        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="search" name="q" id="search-input" placeholder="Zoek op naam, SKU, of model..." aria-label="Zoeken in assortiment" role="combobox" aria-autocomplete="list" aria-controls="search-suggestions" aria-expanded="false" autocomplete="off" oninput="window.App.handleSearchInput(this.value)" onfocus="window.App.handleSearchFocus()" onkeydown="window.App.handleSearchKeydown(event)">
                        <button type="submit" class="search-submit" aria-label="Zoeken">Zoeken</button>
                    </div>
                    <div id="search-suggestions" class="search-suggestions" role="listbox" aria-label="Zoeksuggesties" style="display:none;"></div>
                </form>
            </div>
            
            <nav class="user-nav" id="user-nav">
                <!-- Nav populated by JS -->
            </nav>
        </div>
    </header>

    <main id="app-root" class="main-content container">
        <noscript>
            <div class="alert error">JavaScript is vereist voor de volledige functionaliteit van de groothandel.</div>
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
                    <img src="/test-shop/assets/logo.svg" alt="Ferry Telecom" class="footer-logo">
                    <p>De standaard voor professionele reparateurs. Precisie, betrouwbaarheid en directe voorraad.</p>
                </div>
                <div class="footer-links">
                    <h4>Navigatie</h4>
                    <a href="/test-shop/catalog">Assortiment</a>
                    <a href="/test-shop/login">Inloggen</a>
                    <a href="/test-shop/register">Account Aanvragen</a>
                </div>
                <div class="footer-links">
                    <h4>Testomgeving</h4>
                    <p class="text-muted small">Deze applicatie is uitsluitend voor demonstratiedoeleinden. Er worden geen echte e-mails verzonden of betalingen verwerkt.</p>
                    <div class="demo-actions mt-2">
                        <button onclick="window.App.demoLogin('customer')" class="btn btn-outline btn-sm">Demo Klant Inloggen</button>
                        <button onclick="window.App.demoLogin('partner')" class="btn btn-outline btn-sm">Demo Partner</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <div class="container">
                &copy; <?= date('Y') ?> Ferry Telecom Testomgeving. Alle rechten voorbehouden.
            </div>
        </div>
    </footer>

    <script src="/test-shop/assets/core.js?v=<?= $v_core ?>"></script>
    <script src="/test-shop/assets/store.js?v=<?= $v_store ?>"></script>
    <script src="/test-shop/assets/account.js?v=<?= $v_acc ?>"></script>
    <script src="/test-shop/assets/admin.js?v=<?= $v_admin ?>"></script>
    <script src="/test-shop/assets/admin-products.js?v=<?= $v_aprod ?>"></script>
    <script src="/test-shop/assets/admin-operations.js?v=<?= $v_aops ?>"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            window.App.init();
        });
    </script>
</body>
</html>
