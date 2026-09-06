const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin-operations.js', 'utf8');

js = js.replace(/<div class="form-group"><label>Prijs in centen<\/label><input type="number" name="price_cents" value="\$\{p\}" class="form-control" required placeholder="1500 voor 15.00"><\/div>/,
`<div class="form-group"><label>Prijs (CHF)</label><input type="number" name="price_chf" value="\${(p/100).toFixed(2)}" step="0.01" min="0" class="form-control" required placeholder="15.00"></div>`);

js = js.replace(/price_cents: parseInt\(fd\.get\('price_cents'\),10\)/,
`price_cents: Math.round(parseFloat(fd.get('price_chf')) * 100)`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin-operations.js', js);
