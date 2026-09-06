const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin.js', 'utf8');

js = js.replace(/<button type="submit" class="btn" style="width:100%">Wijzigingen Opslaan<\/button>/,
`<button type="submit" class="btn quick-edit-submit" style="width:100%">Wijzigingen Opslaan</button>`);

js = js.replace(/const fd = new FormData\(ev\.target\);\n            try {/,
`const fd = new FormData(ev.target);
            const btn = ev.target.querySelector('.quick-edit-submit');
            btn.disabled = true;
            btn.textContent = 'Opslaan...';
            try {`);

js = js.replace(/window\.Workbench\.toast\(err\.message, 'error'\); }/g,
`window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin.js', js);
