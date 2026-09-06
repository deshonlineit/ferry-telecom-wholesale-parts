const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin-products.js', 'utf8');

js = js.replace(/<button type="submit" class="btn" style="padding:0\.75rem 2rem; font-size:1rem;">\$\{isNew \? 'Product Aanmaken' : 'Wijzigingen Opslaan'\}<\/button>/,
`<button type="submit" class="btn product-submit" style="padding:0.75rem 2rem; font-size:1rem;">\${isNew ? 'Product Aanmaken' : 'Wijzigingen Opslaan'}</button>`);

js = js.replace(/payload\.model_ids = fd\.getAll\('models\[\]'\)\.map\(m => parseInt\(m, 10\)\);\n\n        try {/,
`payload.model_ids = fd.getAll('models[]').map(m => parseInt(m, 10));
        const btn = e.target.querySelector('.product-submit');
        btn.disabled = true;
        btn.textContent = 'Opslaan...';
        try {`);

js = js.replace(/window\.Workbench\.toast\(err\.message, 'error'\); }/g,
`window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = isNew ? 'Product Aanmaken' : 'Wijzigingen Opslaan'; }`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin-products.js', js);
