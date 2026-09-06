const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin-shell.js', 'utf8');

const routeNames = {
    'dashboard': 'Dashboard',
    'products': 'Producten',
    'orders': 'Bestellingen',
    'invoices': 'Facturen',
    'customers': 'Klanten',
    'returns': 'Retouren',
    'buyback': 'Buyback',
    'settings': 'Instellingen',
    'messages': 'Lokale Berichten',
    'integrations': 'Integraties',
    'audit': 'Audit Log'
};

js = js.replace(/<span>Menu Beheer<\/span>/, `<span>\${{
                        'dashboard': 'Dashboard', 'products': 'Producten', 'orders': 'Bestellingen', 'invoices': 'Facturen', 'customers': 'Klanten', 'returns': 'Retouren', 'buyback': 'Buyback', 'settings': 'Instellingen', 'messages': 'Lokale Berichten', 'integrations': 'Integraties', 'audit': 'Audit Log'
                    }[activeRoute] || 'Menu Beheer'}</span>`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin-shell.js', js);
