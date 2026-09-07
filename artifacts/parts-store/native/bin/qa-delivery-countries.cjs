const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({window: {}, document: undefined, console});
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../public/assets/buyer-currency.js'), 'utf8'),
    context,
    {filename: 'buyer-currency.js'}
);

const currency = context.window.BuyerCurrency;
// Array.from lifts the list out of the vm context into this realm; without it
// deepEqual trips over two different Array prototypes.
const codes = Array.from(currency.countries, country => country.code);

let count = 0;
async function check(label, run) {
    await run();
    count += 1;
    console.log('PASS:', label);
}

// ------------------------------------------------------------ delivery list

async function dataChecks() {
    await check('the delivery list stays inside Europe', () => {
        const outside = ['US', 'CA', 'CN', 'JP', 'AU', 'ZA', 'BR', 'IN', 'AE', 'VN', 'WF', 'EH', 'ZM', 'ZW', 'KR', 'SS'];
        for (const code of outside) assert.ok(!codes.includes(code), `${code} lies outside Europe and must not be offered`);
        assert.ok(codes.length <= 60, `the list must stay short, got ${codes.length}`);
        assert.ok(codes.length >= 40, 'every European delivery country must remain reachable');
    });

    await check('every European Union member plus the neighbours we ship to is offered', () => {
        const union = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
            'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
        for (const code of union.concat(['CH', 'LI', 'NO', 'IS', 'GB'])) {
            assert.ok(codes.includes(code), `${code} must be selectable`);
        }
    });

    await check('the browser and the server agree on where we deliver', () => {
        const php = fs.readFileSync(path.join(__dirname, '../src/currency.php'), 'utf8');
        const block = php.match(/function currencyDeliveryCountries\(\): array\s*\{[\s\S]*?return \[([\s\S]*?)\];/);
        assert.ok(block, 'the server must publish its own delivery list');
        const server = [...block[1].matchAll(/'([A-Z]{2})'/g)].map(match => match[1]).sort();
        assert.deepEqual(server, codes.slice().sort(), 'address list and server list must not drift apart');
    });

    await check('the country names read in English', () => {
        const names = Object.fromEntries(Array.from(currency.countries, c => [c.code, c.name]));
        assert.equal(names.CH, 'Switzerland');
        assert.equal(names.DE, 'Germany');
        assert.equal(names.BE, 'Belgium');
        assert.equal(names.AT, 'Austria');
        assert.equal(names.GB, 'United Kingdom');
    });

    await check('only Switzerland is charged in Swiss francs', () => {
        for (const country of currency.countries) {
            assert.equal(country.currency, country.code === 'CH' ? 'CHF' : 'EUR', country.code);
        }
        assert.equal(currency.currencyForCountry('ch'), 'CHF');
        assert.equal(currency.currencyForCountry('de'), 'EUR');
    });

    await check('the address list is sorted by name and offers no duplicates', () => {
        const names = Array.from(currency.countries, country => country.name);
        assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b, 'en')));
        assert.equal(new Set(codes).size, codes.length);
    });

    await check('address forms keep a stored country that is no longer on the list', () => {
        const european = currency.options('NL');
        assert.equal((european.match(/<option/g) || []).length, codes.length);
        assert.match(european, /value="NL" selected/);
        assert.ok(!european.includes('value="US"'), 'we no longer offer deliveries outside Europe');

        const legacy = currency.options('US');
        assert.match(legacy, /value="US" selected/, 'saving an old address must not silently move it to another country');
        assert.equal((legacy.match(/<option/g) || []).length, codes.length + 1);
    });

    await check('the shop bar carries no country or currency control', () => {
        const core = fs.readFileSync(path.join(__dirname, '../public/assets/core.js'), 'utf8');
        const index = fs.readFileSync(path.join(__dirname, '../public/index.php'), 'utf8');
        assert.ok(!/country-trigger|CountryPicker/.test(core), 'the delivery country belongs on the address, not in the header');
        assert.ok(!/country-picker\.js/.test(index), 'the removed picker must not be loaded');
        assert.ok(!fs.existsSync(path.join(__dirname, '../public/assets/country-picker.js')));
    });
}

// ------------------------------------------------------------------- server

async function httpChecks() {
    const host = process.env.REPLIT_DEV_DOMAIN;
    if (!host) return;
    const base = `https://${host}/test-shop/api`;
    const session = await fetch(`${base}/session`);
    const cookies = (session.headers.getSetCookie ? session.headers.getSetCookie() : [])
        .map(value => value.split(';')[0]).join('; ');
    const csrf = (await session.json()).csrf;
    const post = country => fetch(`${base}/currency`, {
        method: 'POST',
        headers: {'content-type': 'application/json', 'X-CSRF-Token': csrf, cookie: cookies},
        body: JSON.stringify({country})
    });

    await check('the server refuses a delivery country outside Europe', async () => {
        const response = await post('US');
        assert.equal(response.status, 422, 'the Europe-only rule may not live in the browser alone');
        assert.match((await response.json()).error, /Europe/);
    });

    await check('the server accepts a European country and prices it in euro', async () => {
        const response = await post('DE');
        assert.equal(response.status, 200);
        assert.equal((await response.json()).currency, 'EUR');
    });

    await check('switching back to Switzerland returns Swiss francs', async () => {
        const response = await post('CH');
        assert.equal(response.status, 200);
        assert.equal((await response.json()).currency, 'CHF');
    });
}

(async () => {
    await dataChecks();
    await httpChecks();
    console.log(`${count} delivery country checks passed.`);
})().catch(error => { console.error(error); process.exit(1); });
