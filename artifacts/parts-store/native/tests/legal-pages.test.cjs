const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.php'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'public/assets/legal-pages.js'), 'utf8');

for (const route of ['returns-service', 'terms-conditions', 'privacy-policy', 'quality-warranty', 'quality-options']) {
    assert(index.includes(`/test-shop/${route}`), `Footer must link to ${route}`);
    assert(pages.includes(`'${route}'`), `Legal router must define ${route}`);
}
assert(/does not provide a general cooling-off or change-of-mind right/i.test(pages), 'Returns page must state the Swiss B2B return position');
assert(/3-month warranty from delivery/i.test(pages), 'Warranty period must be explicit');
assert(/Ferry Telecom AG/.test(pages) && /CHE-254\.271\.185 MWST/.test(pages), 'Privacy page must identify the controller');
assert(/Stripe or Wallee/.test(pages) && /Picqer/.test(pages), 'Privacy page must disclose relevant processor categories');
assert(/legal-pages\.css/.test(index) && /legal-pages\.js/.test(index), 'Legal route assets must be registered');

console.log('legal pages regression passed');