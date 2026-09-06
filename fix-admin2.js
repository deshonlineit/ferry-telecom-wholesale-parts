const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin.js', 'utf8');

js = js.replace(/<td>\$\{window\.Workbench\.badge\(i\.payment_status[^}]+\}<\/td>/,
`<td><span class="status-badge status-\${i.payment_status}">\${esc({unverified: 'Te controleren', unpaid: 'Alle onbetaalde', open: 'Openstaand', partial: 'Deels betaald', overdue: 'Achterstallig', paid: 'Betaald', cancelled: 'Geannuleerd'}[i.payment_status] || i.payment_status)}</span></td>`);

js = js.replace(/<td style="text-align:right">\$\{window\.Core\.formatMoney\(i\.outstanding_cents\)\}<br><span style="font-size:0\.75rem; color:var\(--wb-danger\)">Vervallen: \$\{new Date\(i\.due_date\)\.toLocaleDateString\(\)\}<\/span><\/td>/,
`<td style="text-align:right"><strong>\${i.outstanding_cents === null ? 'Te controleren' : window.Core.formatMoney(i.outstanding_cents)}</strong><br><span style="font-size:0.75rem; color:var(--wb-text-muted)">\${i.due_date ? 'Vervaldatum: ' + new Date(i.due_date).toLocaleDateString() : 'Geen vervaldatum'}</span></td>`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/admin.js', js);
