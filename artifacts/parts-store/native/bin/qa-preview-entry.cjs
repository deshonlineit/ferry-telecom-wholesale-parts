const assert = require('node:assert/strict');

const host = process.env.REPLIT_DEV_DOMAIN;
if (!host) throw new Error('The development hostname is required for preview checks.');
const origin = `https://${host}`;

async function check(path, options = {}) {
    return fetch(new URL(path, origin), {redirect: 'manual', ...options});
}

async function main() {
    for (const method of ['GET', 'HEAD']) {
        const response = await check('/', {method});
        assert.equal(response.status, 302, `${method} root should open the PHP shop`);
        assert.equal(response.headers.get('location'), '/test-shop/');
        assert.equal(response.headers.get('cache-control'), 'no-store');
    }

    const filtered = await check('/?category=1&family=iphone');
    assert.equal(filtered.status, 302);
    assert.equal(filtered.headers.get('location'), '/test-shop/?category=1&family=iphone');

    for (const path of ['/?prototype=1', '/catalog']) {
        const response = await check(path);
        assert.equal(response.status, 200, `The existing prototype remains accessible at ${path}`);
        assert.match(await response.text(), /\/src\/main\.tsx/);
    }

    const native = await check('/test-shop/');
    assert.equal(native.status, 200);
    assert.match(await native.text(), /\/test-shop\/assets\/home-landing\.js/);

    const products = await check('/test-shop/api/products?limit=1');
    assert.equal(products.status, 200);
    assert.ok((await products.json()).products.length > 0);

    console.log('PASS: root GET/HEAD and filters open the isolated PHP shop; prototype, native page and products stay accessible.');
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});