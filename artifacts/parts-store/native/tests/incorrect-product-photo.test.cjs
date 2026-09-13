const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('product management exposes the incorrect-photo action and review filter', () => {
    const editor = read('public/assets/admin-products.js');
    const list = read('public/assets/admin.js');
    const operations = read('src/operations.php');

    assert.match(editor, />Foto klopt niet</);
    assert.match(editor, /\/images\/hide/);
    assert.match(editor, /Waarom klopt deze foto niet/);
    assert.match(list, /name="image_review"/);
    assert.match(list, /Photo review required/);
    assert.match(editor, /Laatste fotomelding/);
    assert.match(editor, /latest_image_report/);
    assert.match(operations, /ae\.action='image\.incorrect_unlinked'/);
    assert.match(operations, /LEFT JOIN users u ON u\.id=ae\.user_id/);
    assert.match(operations, /'latest_image_report' => \$latestImageReport/);
});

test('incorrect-photo handling unlinks without deleting stored media', () => {
    const media = read('src/media.php');
    const start = media.indexOf('function mediaHideIncorrect');
    const end = media.indexOf('function mediaDeleteProduction', start);
    const handler = media.slice(start, end);

    assert.match(handler, /DELETE FROM images/);
    assert.match(handler, /image_review_required=TRUE/);
    assert.match(handler, /image\.incorrect_unlinked/);
    assert.match(handler, /shared_references/);
    assert.doesNotMatch(handler, /unlink\s*\(/);
    assert.doesNotMatch(handler, /mediaOwnedImagePaths/);
});