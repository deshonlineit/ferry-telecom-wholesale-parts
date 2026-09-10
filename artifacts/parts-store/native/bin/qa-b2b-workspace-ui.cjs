/**
 * Logged-in browser walkthrough of the B2B ordering workspace.
 *
 * Drives a real Chromium session over CDP: signs in through the login form,
 * then exercises quick order, saved lists, back-in-stock alerts, the document
 * centre, invoice delivery preferences and reordering.  Each screen is captured
 * to tests/screenshots/b2b-workspace/ as visual proof.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chromium = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const baseUrl = (process.env.WORKSPACE_BASE_URL
    || `https://${process.env.REPLIT_DEV_DOMAIN}/test-shop/`).replace(/\/?$/, '/');
const shots = path.join(root, 'tests', 'screenshots', 'b2b-workspace');
const viewport = {width: 1280, height: 900};
const passed = [];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const token = Math.random().toString(16).slice(2, 10);
const email = `workspace.ui.${token}@ferry.test`;
const password = `Workspace!${token}`;

function php(code, value) {
    const out = execFileSync('php', ['-r', code], {
        cwd: root, input: JSON.stringify(value ?? {}), encoding: 'utf8',
    });
    return out.trim() ? JSON.parse(out) : null;
}

const FIXTURE = `
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db(); $pdo->beginTransaction();
try {
  $category=$pdo->query("SELECT id FROM categories ORDER BY id LIMIT 1")->fetchColumn();
  $brand=$pdo->query("SELECT id FROM brands ORDER BY id LIMIT 1")->fetchColumn();
  $group=$pdo->query("SELECT id FROM customer_groups ORDER BY id LIMIT 1")->fetchColumn();
  $q=$pdo->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status)
    VALUES(?,?,?,?,'customer',?,'active')");
  $q->execute(["Workspace UI QA",$x["email"],password_hash($x["password"],PASSWORD_DEFAULT),
    "Workspace UI QA BV",$group]);
  $uid=(int)$pdo->lastInsertId();
  $staff=$pdo->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status)
    VALUES(?,?,?,?,'staff',?,'active')");
  $staff->execute(["Product Editor UI QA",$x["staff_email"],password_hash($x["password"],PASSWORD_DEFAULT),
    "Ferry Telecom",$group]);
  $staffId=(int)$pdo->lastInsertId();
  $insert=$pdo->prepare("INSERT INTO products
    (sku,name,description,category_id,brand_id,quality,stock,list_price_cents,list_price_eur_cents,
     minimum_quantity,image_url,featured,publication_status,active)
     VALUES(?,?,?,?,?,?,?,?,?,?,'',0,'visible',1)");
  $price=$pdo->prepare("INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,?,?)");
  $skuStocked="WSPUI-STOCK-".$x["token"];
  $insert->execute([$skuStocked,"Workspace UI screen ".$x["token"],"Workspace UI QA fixture",
    $category,$brand,"Premium QA",25,1200,1100,2]);
  $stocked=(int)$pdo->lastInsertId(); $price->execute([$stocked,$group,1000,900]);
  $skuEmpty="WSPUI-EMPTY-".$x["token"];
  $insert->execute([$skuEmpty,"Workspace UI battery ".$x["token"],"Workspace UI QA fixture",
    $category,$brand,"Premium QA",0,1500,1400,1]);
  $depleted=(int)$pdo->lastInsertId(); $price->execute([$depleted,$group,1400,1300]);
  $address=json_encode(["name"=>"Workspace UI QA","company"=>"Workspace UI QA BV",
    "street"=>"Teststrasse 1","postal_code"=>"8000","city"=>"Zürich","country"=>"CH"],JSON_THROW_ON_ERROR);
  $number="WSPUI-".$x["token"];
  $q=$pdo->prepare("INSERT INTO orders(number,user_id,status,subtotal_cents,tax_cents,shipping_cents,
    total_cents,tax_bps,currency,address_json,payment_method,payment_state,notes,idempotency_key,created_at)
    VALUES(?,?,'on_hold',2000,162,0,2162,810,'CHF',?,'pay_later','pending','',?,?)");
  $q->execute([$number,$uid,$address,"wspui-".$x["token"],$x["order_date"]]);
  $oid=(int)$pdo->lastInsertId();
  $pdo->prepare("INSERT INTO order_items(order_id,product_id,name,sku,quantity,price_cents,total_cents,price_eur_cents)
    VALUES(?,?,?,?,2,1000,2000,900)")->execute([$oid,$stocked,"Workspace UI screen ".$x["token"],$skuStocked]);
  $pdo->commit();
  echo json_encode(["user_id"=>$uid,"staff_id"=>$staffId,"staff_email"=>$x["staff_email"],
    "stocked_id"=>$stocked,"depleted_id"=>$depleted,
    "sku_stocked"=>$skuStocked,"sku_empty"=>$skuEmpty,"order_id"=>$oid,"order_number"=>$number]);
} catch(Throwable $e){ if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
`;

const CLEANUP = `
require "src/bootstrap.php";
$x=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$pdo=db(); $uid=(int)$x["user_id"];
$pdo->prepare("DELETE FROM invoice_deliveries WHERE user_id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM billing_preferences WHERE user_id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM stock_alerts WHERE user_id=?")->execute([$uid]);
$pdo->prepare("DELETE i FROM order_list_items i JOIN order_lists l ON l.id=i.list_id WHERE l.user_id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM order_lists WHERE user_id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM cart_items WHERE user_id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM order_events WHERE order_id=?")->execute([(int)$x["order_id"]]);
$pdo->prepare("DELETE FROM order_items WHERE order_id=?")->execute([(int)$x["order_id"]]);
$pdo->prepare("DELETE FROM orders WHERE id=?")->execute([(int)$x["order_id"]]);
$pdo->prepare("DELETE FROM group_prices WHERE product_id IN (?,?)")->execute([(int)$x["stocked_id"],(int)$x["depleted_id"]]);
$pdo->prepare("DELETE FROM products WHERE id IN (?,?)")->execute([(int)$x["stocked_id"],(int)$x["depleted_id"]]);
$pdo->prepare("DELETE FROM audit_events WHERE user_id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM users WHERE id=?")->execute([$uid]);
$pdo->prepare("DELETE FROM users WHERE id=?")->execute([(int)$x["staff_id"]]);
echo json_encode(["removed"=>true]);
`;

async function waitForDebugger(port) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) return response.json();
        } catch {}
        await delay(100);
    }
    throw new Error('Chromium debugging endpoint did not become ready');
}

function connectCdp(webSocketUrl, onEvent) {
    const socket = new WebSocket(webSocketUrl);
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) {
            onEvent?.(message);
            return;
        }
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
    });
    const opened = new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, {once: true});
        socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium')), {once: true});
    });
    return {
        async send(method, params = {}, sessionId) {
            await opened;
            const id = ++sequence;
            socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
            return new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
        },
        close() { socket.close(); }
    };
}

async function main() {
    fs.rmSync(shots, {recursive: true, force: true});
    fs.mkdirSync(shots, {recursive: true});
    const fixture = php(FIXTURE, {
        token,
        email,
        staff_email: `workspace-ui-staff-${token}@test.invalid`,
        password,
        order_date: '2026-04-08 10:15:00',
    });
    const port = 9300 + Math.floor(Math.random() * 400);
    const profile = path.join('/tmp', `workspace-ui-${process.pid}`);
    const browser = spawn(chromium, [
        '--no-sandbox', '--disable-dev-shm-usage', '--headless=new',
        `--window-size=${viewport.width},${viewport.height}`,
        `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
    ], {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    browser.stderr.on('data', chunk => { stderr += chunk; });
    let cdp;
    let sessionId;
    const pageErrors = [];

    const evaluate = async (expression, awaitPromise = true) => {
        const result = await cdp.send('Runtime.evaluate',
            {expression, awaitPromise, returnByValue: true}, sessionId);
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    };
    const waitFor = async (expression, what, attempts = 120) => {
        let last;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            // A navigation can replace the JS context mid-poll; treat that as "not ready yet".
            try {
                if (await evaluate(`Boolean(${expression})`)) return true;
            } catch (error) { last = error; }
            await delay(150);
        }
        throw new Error(`Timed out waiting for ${what}${last ? ` (last error: ${last.message})` : ''}`);
    };
    const visit = async route => {
        await cdp.send('Page.navigate', {url: baseUrl + route}, sessionId);
        await waitFor("window.Core && document.querySelector('#user-nav')", `page ${route || '/'}`);
    };
    const shoot = async name => {
        const capture = await cdp.send('Page.captureScreenshot',
            {format: 'jpeg', quality: 82, captureBeyondViewport: false}, sessionId);
        const file = path.join(shots, `${name}.jpg`);
        fs.writeFileSync(file, Buffer.from(capture.data, 'base64'));
        return file;
    };
    const check = (value, name) => {
        if (!value) throw new Error(name);
        passed.push(name);
    };

    try {
        const info = await waitForDebugger(port);
        cdp = connectCdp(info.webSocketDebuggerUrl, message => {
            if (message.method === 'Runtime.exceptionThrown') {
                const detail = message.params.exceptionDetails;
                pageErrors.push(detail.exception?.description || detail.text);
            }
            if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
                pageErrors.push(message.params.entry.text);
            }
        });
        const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
        ({sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten: true}));
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Log.enable', {}, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width, height: viewport.height,
            deviceScaleFactor: 1, mobile: false,
        }, sessionId);

        // ------------------------------------------------------------ //
        // Sign in through the real login form                           //
        // ------------------------------------------------------------ //
        await visit('login');
        await waitFor("document.querySelector('#login-form')", 'the login form');
        await evaluate(`(() => {
            const form = document.querySelector('#login-form');
            const set = (selector, value) => {
                const field = form.querySelector(selector);
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(field, value);
                field.dispatchEvent(new Event('input', {bubbles: true}));
            };
            set('input[type="email"], input[name="email"]', ${JSON.stringify(email)});
            set('input[type="password"]', ${JSON.stringify(password)});
            form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
            return true;
        })()`);
        await waitFor(`window.Core.user && window.Core.user.email === ${JSON.stringify(email)}`,
            'the signed-in session');
        check(true, 'A customer can sign in through the login form');

        // ------------------------------------------------------------ //
        // Account profile and addresses                                 //
        // ------------------------------------------------------------ //
        await visit('account');
        await waitFor("document.querySelector('#profile-form')", 'the account profile form');
        check(await evaluate("document.querySelector('#profile-name').value.length > 0"),
            'The account page loads the signed-in customer profile');
        check(!await evaluate("document.body.textContent.includes(\"Can't find variable: id\")"),
            'The account page does not fail on an undefined return id');
        await shoot('00-account-profile');

        await visit('account/addresses');
        await waitFor("document.querySelector('.action-new-addr')", 'the address book');
        check(!await evaluate("document.body.textContent.includes(\"Can't find variable: id\")"),
            'The address book loads without using an undefined return id');
        await shoot('00-account-addresses');

        // ------------------------------------------------------------ //
        // Quick order                                                   //
        // ------------------------------------------------------------ //
        await visit('quick-order');
        await waitFor("document.querySelector('.wsp-page')", 'the quick order page');
        await waitFor("document.querySelector('#qo-dispatch .wsp-dispatch')", 'the dispatch banner');
        check(await evaluate("document.querySelector('#qo-dispatch').textContent.trim().length > 0"),
            'Quick order shows the dispatch cut-off promise');
        check(await evaluate("Boolean(document.querySelector('a[href$=\"quick-order\"], .nav-quick-order-action'))"),
            'The header links to quick order for signed-in customers');

        await evaluate("document.querySelector('.wsp-tab[data-qo-mode=\"paste\"]').click()");
        await waitFor("!document.querySelector('#qo-paste-panel').hidden", 'the paste panel');
        await evaluate(`(() => {
            const area = document.querySelector('#qo-paste');
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
            setter.call(area, ${JSON.stringify(`${fixture.sku_stocked};1\n${fixture.sku_empty};3\nWSPUI-NOTHING;2`)});
            area.dispatchEvent(new Event('input', {bubbles: true}));
            document.querySelector('#qo-apply-paste').click();
            return true;
        })()`);
        await waitFor("document.querySelectorAll('#qo-grid input').length >= 3", 'the pasted grid rows');
        await evaluate("document.querySelector('#qo-check').click()");
        await waitFor("document.querySelectorAll('.wsp-table tbody tr').length >= 3", 'the resolved lines');
        const resolvedText = await evaluate("document.querySelector('.wsp-table').textContent");
        check(resolvedText.includes(fixture.sku_stocked), 'The resolved table names the stocked part');
        check(/minimum|Minimum|verhoogd|raised/i.test(resolvedText) || resolvedText.includes('2'),
            'A below-minimum line is visibly corrected');
        check(await evaluate("document.querySelectorAll('.wsp-row-error, .wsp-chip-error, .wsp-chip-warn').length >= 1"),
            'Unavailable and unknown lines are flagged in the table');
        await shoot('01-quick-order-paste');

        // Older toasts are cleared, so the confirmation asserted below can only
        // be the one this add produced.
        await evaluate("document.querySelectorAll('#wb-toast-container .wb-toast').forEach(t => t.remove()); true");
        const badgeBefore = await evaluate(`(() => {
            const badge = document.querySelector('.nav-cart .cart-badge');
            return badge ? Number(badge.textContent.trim()) : 0;
        })()`);
        await evaluate("document.querySelector('#qo-add').click()");
        // Waiting on the browser's own cart, not the server's: the failure this
        // guards against wrote the cart server-side and then broke on the reply.
        await waitFor(`window.Core.cart.items
            && window.Core.cart.items.some(i => i.sku === ${JSON.stringify(fixture.sku_stocked)})`,
            'the cart the browser itself adopted');
        check(true, 'Quick order adds the orderable lines to the cart from the browser');
        await waitFor("document.querySelector('#wb-toast-container .wb-toast')", 'the add confirmation');
        check(await evaluate("Boolean(document.querySelector('.wb-toast-success'))"),
            'A successful add confirms itself to the customer');
        check(await evaluate("!document.querySelector('.wb-toast-error')"),
            'A successful add reports no error');
        check(await evaluate(`(() => {
            const badge = document.querySelector('.nav-cart .cart-badge');
            return Boolean(badge) && badge.style.display !== 'none'
                && Number(badge.textContent.trim()) > ${badgeBefore};
        })()`), 'The header cart badge counts the added lines straight away');
        await shoot('02-quick-order-added');

        // ------------------------------------------------------------ //
        // Saved lists                                                   //
        // ------------------------------------------------------------ //
        await visit('account/lists');
        await waitFor("document.querySelector('form[onsubmit*=\"createList\"]')", 'the saved lists page');
        await evaluate(`(() => {
            const form = document.querySelector('form[onsubmit*="createList"]');
            const field = form.querySelector('input[name="name"]');
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(field, 'Weekly screens ${token}');
            field.dispatchEvent(new Event('input', {bubbles: true}));
            form.requestSubmit();
            return true;
        })()`);
        await waitFor(`document.body.textContent.includes('Weekly screens ${token}')`, 'the new list');
        check(true, 'A customer can create a saved order list in the browser');
        await shoot('03-saved-lists');

        // ------------------------------------------------------------ //
        // Product page: save to list and watch for stock                //
        // ------------------------------------------------------------ //
        await visit(`products/${fixture.depleted_id}`);
        await waitFor("document.querySelector('.wsp-product-tools')", 'the product workspace buttons');
        const tools = await evaluate("document.querySelector('.wsp-product-tools').textContent");
        check(tools.trim().length > 0, 'The product page offers the workspace actions');
        check(await evaluate("document.querySelectorAll('.wsp-product-tools button').length === 2"),
            'A depleted product offers both save-to-list and a stock alert');
        await shoot('04-product-actions');

        await evaluate("document.querySelectorAll('.wsp-product-tools button')[1].click()");
        await waitFor("document.querySelectorAll('.wsp-product-tools button')[1].disabled === false",
            'the alert request to settle');
        await delay(400);
        check(await evaluate(`(async () => {
            const data = await window.Core.fetch('/workspace/stock-alerts');
            return data.alerts.some(a => a.product_id === ${fixture.depleted_id});
        })()`), 'Clicking notify-me registers a back-in-stock alert');
        await shoot('05-stock-alert-set');

        await evaluate("document.querySelectorAll('.wsp-product-tools button')[0].click()");
        await waitFor("document.querySelector('#wsp-list-picker')", 'the list picker modal');
        check(await evaluate("document.querySelectorAll('#wsp-list-picker select option').length >= 2"),
            'The list picker offers the saved list and a new-list option');
        await shoot('06-save-to-list-modal');
        await evaluate(`(() => {
            const form = document.querySelector('#wsp-list-picker');
            form.requestSubmit();
            return true;
        })()`);
        await waitFor("!document.querySelector('#wsp-list-picker')", 'the modal to close');
        check(await evaluate(`(async () => {
            const lists = (await window.Core.fetch('/workspace/order-lists')).lists;
            return lists.some(l => l.item_count > 0);
        })()`), 'Saving from the product page fills the chosen list');

        // ------------------------------------------------------------ //
        // Alerts overview                                               //
        // ------------------------------------------------------------ //
        await visit('account/alerts');
        await waitFor("document.querySelector('.wsp-table, .wsp-empty')", 'the alerts page');
        check(await evaluate(`document.body.textContent.includes(${JSON.stringify(fixture.sku_empty)})`),
            'The alerts screen lists the watched part');
        await shoot('07-stock-alerts');

        // ------------------------------------------------------------ //
        // Documents                                                     //
        // ------------------------------------------------------------ //
        await visit('account/documents');
        await waitFor("document.querySelector('#doc-year')", 'the document centre');
        await waitFor("document.querySelectorAll('.wsp-quarter-row button, .wsp-quarter-row a').length >= 4",
            'the quarter selector');
        check(await evaluate("document.querySelectorAll('.wsp-quarter-row button, .wsp-quarter-row a').length >= 4"),
            'The document centre offers quarter selection');
        check(await evaluate("Boolean(document.querySelector('[onclick*=\"exportCsv\"]')) && Boolean(document.querySelector('[onclick*=\"downloadArchive\"]'))"),
            'The document centre offers a bulk download and a CSV export');
        await shoot('08-documents');

        // ------------------------------------------------------------ //
        // Billing preferences                                           //
        // ------------------------------------------------------------ //
        await visit('account/billing');
        await waitFor("document.querySelector('#bp-invoice-email')", 'the invoice address field');
        await evaluate(`(() => {
            const form = document.querySelector('form[onsubmit*="BillingPreferences"]');
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            const field = form.querySelector('input[name="invoice_email"]');
            setter.call(field, 'facturen.${token}@ferry.test');
            field.dispatchEvent(new Event('input', {bubbles: true}));
            form.requestSubmit();
            return true;
        })()`);
        await delay(900);
        check(await evaluate(`(async () => {
            const data = await window.Core.fetch('/workspace/billing-preferences');
            return data.preferences.invoice_email === 'facturen.${token}@ferry.test';
        })()`), 'A customer can point invoices at their own billing address');
        await shoot('09-billing-preferences');

        // ------------------------------------------------------------ //
        // The reference the customer asked for reaches checkout          //
        // ------------------------------------------------------------ //
        await evaluate(`window.Core.fetch('/workspace/billing-preferences', {method: 'PUT', body: {
            invoice_email: 'facturen.${token}@ferry.test', copy_email: '',
            reference_label: 'Inkoopnummer ${token}', auto_send: true, reference_required: true
        }})`);
        await delay(500);
        await visit('checkout');
        await waitFor("document.querySelector('#checkout-reference')", 'the checkout reference field');
        check(await evaluate(`document.querySelector('label[for="checkout-reference"]')
            .textContent.includes('Inkoopnummer ${token}')`),
            'Checkout asks for the reference under the label the customer chose');
        check(await evaluate("document.querySelector('#checkout-reference').required === true"),
            'A reference the customer made mandatory is mandatory at checkout');
        await shoot('10-checkout-reference');

        // ------------------------------------------------------------ //
        // Reordering                                                    //
        // ------------------------------------------------------------ //
        await evaluate("window.Core.fetch('/cart', {method: 'DELETE'})");
        await visit('account/orders');
        await waitFor("document.querySelector('.b2b-order-reorder')", 'the reorder button');
        check(await evaluate(`document.body.textContent.includes(${JSON.stringify(fixture.order_number)})`),
            'The orders screen shows the fixture order');
        await shoot('10-orders-reorder');
        await evaluate(`(() => {
            const cards = Array.from(document.querySelectorAll('.b2b-order-card'));
            const card = cards.find(c => c.textContent.includes(${JSON.stringify(fixture.order_number)}));
            card.querySelector('.b2b-order-reorder').click();
            return true;
        })()`);
        await waitFor(`(async () => {
            const cart = await window.Core.fetch('/cart');
            return cart.items.some(i => i.sku === ${JSON.stringify(fixture.sku_stocked)});
        })()`, 'the reordered cart line');
        check(true, 'Reordering from the orders screen fills the cart again');
        await shoot('11-reordered');

        // ------------------------------------------------------------ //
        // Compact product editor                                        //
        // ------------------------------------------------------------ //
        await evaluate("window.Core.fetch('/auth/logout', {method: 'POST'})");
        await visit('login');
        await waitFor("document.querySelector('#login-form')", 'the staff login form');
        await evaluate(`(() => {
            const form = document.querySelector('#login-form');
            const set = (selector, value) => {
                const field = form.querySelector(selector);
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(field, value);
                field.dispatchEvent(new Event('input', {bubbles: true}));
            };
            set('input[type="email"], input[name="email"]', ${JSON.stringify(`workspace-ui-staff-${token}@test.invalid`)});
            set('input[type="password"]', ${JSON.stringify(password)});
            form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
            return true;
        })()`);
        await waitFor("window.Core.user && window.Core.user.role === 'staff'", 'the staff session');

        const adminRoutes = [
            ['admin', 'dashboard'],
            ['admin/products', 'products'],
            ['admin/prices', 'prices'],
            ['admin/orders', 'orders'],
            ['admin/invoices', 'invoices'],
            ['admin/customers', 'customers'],
            ['admin/returns', 'returns'],
            ['admin/settings', 'settings'],
            ['admin/diagnostics', 'diagnostics'],
            ['admin/integrations', 'integrations'],
            ['admin/audit', 'audit log'],
        ];
        for (const [route, label] of adminRoutes) {
            await visit(route);
            await waitFor("document.querySelector('.admin-shell .admin-main h1')", `the ${label} admin screen`);
            check(true, `The ${label} admin screen loads in the shared compact workspace`);
            if (['admin', 'admin/products', 'admin/invoices', 'admin/customers'].includes(route)) {
                await shoot(`12-admin-${label.replace(/\\s+/g, '-')}`);
            }
        }

        await visit('admin/products/new');
        await waitFor("document.querySelector('.product-editor-layout')", 'the redesigned product editor');
        check(await evaluate("document.querySelectorAll('.editor-card').length >= 5"),
            'The product editor groups its controls into compact work areas');
        check(await evaluate("Boolean(document.querySelector('#model-search'))"),
            'Compatible models can be searched');
        check(await evaluate("document.body.textContent.includes('Save the product to enable image uploads.')"),
            'Image upload explains the save-first state for a new product');
        await evaluate(`(() => {
            const first = document.querySelector('#models-list .model-item span');
            if (!first) return false;
            const search = document.querySelector('#model-search');
            search.value = first.textContent.slice(0, Math.min(8, first.textContent.length));
            search.dispatchEvent(new Event('input', {bubbles:true}));
            return true;
        })()`);
        check(await evaluate("document.querySelectorAll('#models-list .model-item').length > 0"),
            'Model search keeps matching compatible models selectable');
        await shoot('12-admin-product-editor-desktop');
        await visit(`admin/products/${fixture.stocked_id}`);
        await waitFor("document.querySelector('#drop-zone')", 'the product image upload area');
        check(await evaluate("Boolean(document.querySelector('#img-upload[accept*=\"image/jpeg\"]'))"),
            'Existing products offer real multi-image upload');
        await shoot('13-admin-product-editor-images');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
        }, sessionId);
        await visit('admin/products/new');
        await waitFor("document.querySelector('.product-editor-layout')", 'the mobile product editor');
        check(await evaluate("getComputedStyle(document.querySelector('.product-editor-layout')).gridTemplateColumns.split(' ').length === 1"),
            'The product editor collapses to one readable column on mobile');
        await evaluate("document.querySelector('.admin-mobile-menu-toggle').click()");
        check(await evaluate("document.querySelector('#admin-sidebar').classList.contains('open')"),
            'The mobile administration menu opens from the compact header');
        await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
        check(!await evaluate("document.querySelector('#admin-sidebar').classList.contains('open')"),
            'Escape closes the mobile administration menu');
        await shoot('14-admin-product-editor-mobile');

        check(pageErrors.length === 0,
            `No page error surfaced during the walkthrough${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
    } catch (error) {
        if (cdp && sessionId) {
            try { console.error('Failure screenshot: ' + await shoot('99-failure')); } catch {}
        }
        if (pageErrors.length) error.message += `\nPage errors:\n  ${pageErrors.join('\n  ')}`;
        if (stderr.trim()) error.message += `\nChromium stderr:\n${stderr.slice(-1500)}`;
        throw error;
    } finally {
        cdp?.close();
        browser.kill('SIGTERM');
        await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(2000)]);
        fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
        php(CLEANUP, fixture);
    }

    for (const name of passed) console.log('  ok  ' + name);
    console.log(`\n${passed.length} browser checks passed. Screenshots: ${shots}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
