const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin-products.js', 'utf8');

js = js.replace(/const val = existing \? existing\.price_cents : '';/g,
`const val = existing ? (existing.price_cents / 100).toFixed(2) : '';`);

js = js.replace(/<label style="font-size:0\.75rem;">Prijs voor \$\{esc\(g\.name\)\} \(centen\)<\/label>\s*<input type="number" name="gp_\$\{g\.id\}" value="\$\{val\}" class="form-control" placeholder="Standaardprijs als leeg">/g,
`<label style="font-size:0.75rem;">Prijs voor \${esc(g.name)} (CHF)</label>
                <input type="number" name="gp_\${g.id}" value="\${val}" class="form-control" step="0.01" min="0" placeholder="Standaardprijs als leeg">`);

js = js.replace(/<label>Inkoopprijs \/ Standaardprijs \(in centen\)<\/label>\s*<input type="number" name="list_price_cents" value="\$\{p\.list_price_cents\}" class="form-control" required>/g,
`<label>Inkoopprijs / Standaardprijs (CHF)</label>
                            <input type="number" name="list_price" value="\${(p.list_price_cents / 100).toFixed(2)}" class="form-control" step="0.01" min="0" required>`);

js = js.replace(/list_price_cents: parseInt\(fd\.get\('list_price_cents'\), 10\),/g,
`list_price_cents: Math.round(parseFloat(fd.get('list_price')) * 100),`);

js = js.replace(/if \(val\) gps\.push\(\{ group_id: g\.id, price_cents: parseInt\(val, 10\) \}\);/g,
`if (val !== '') gps.push({ group_id: g.id, price_cents: Math.round(parseFloat(val) * 100) });`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin-products.js', js);
