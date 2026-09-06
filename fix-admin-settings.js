const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin.js', 'utf8');

js = js.replace(/<label>Standaard Verzendkosten \(in centen\)<\/label>\s*<input type="number" name="shipping_cents" value="\$\{s\.shipping_cents\|\|''\}" class="form-control" required>/,
`<label>Standaard Verzendkosten (CHF)</label>
                            <input type="number" name="shipping_chf" value="\${s.shipping_cents ? (s.shipping_cents/100).toFixed(2) : ''}" step="0.01" min="0" class="form-control" required>`);

js = js.replace(/<label>Gratis Verzending Vanaf \(in centen\)<\/label>\s*<input type="number" name="free_shipping_cents" value="\$\{s\.free_shipping_cents\|\|''\}" class="form-control" required>/,
`<label>Gratis Verzending Vanaf (CHF)</label>
                            <input type="number" name="free_shipping_chf" value="\${s.free_shipping_cents ? (s.free_shipping_cents/100).toFixed(2) : ''}" step="0.01" min="0" class="form-control" required>`);

js = js.replace(/const payload = Object\.fromEntries\(fd\.entries\(\)\);\n        for \(let k in payload\) payload\[k\] = parseInt\(payload\[k\], 10\);/g,
`const payload = Object.fromEntries(fd.entries());
        payload.shipping_cents = Math.round(parseFloat(payload.shipping_chf) * 100);
        payload.free_shipping_cents = Math.round(parseFloat(payload.free_shipping_chf) * 100);
        delete payload.shipping_chf;
        delete payload.free_shipping_chf;
        for (let k in payload) payload[k] = parseInt(payload[k], 10);`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin.js', js);
