const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin.js', 'utf8');
js = js.replace(/<input type="number" name="stock" value="\$\{b\.dataset\.stock\}" class="form-control" required>/,
`<input type="number" name="stock" value="\${b.dataset.stock}" class="form-control" min="0" step="1" required>`);

let js2 = fs.readFileSync('artifacts/parts-store/native/public/assets/admin-products.js', 'utf8');
js2 = js2.replace(/<input type="number" name="stock" value="\$\{p\.stock\}" class="form-control" required>/,
`<input type="number" name="stock" value="\${p.stock}" class="form-control" min="0" step="1" required>`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin.js', js);
fs.writeFileSync('artifacts/parts-store/native/public/assets/admin-products.js', js2);
