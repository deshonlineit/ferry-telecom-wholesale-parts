const fs = require('fs');
let js = fs.readFileSync('artifacts/parts-store/native/public/assets/admin.js', 'utf8');

js = js.replace(/const f = data\.finance \|\| \{[^}]+\};/, "const f = data.finance || { unpaid_count:0, outstanding_cents:0, overdue_count:0, overdue_cents:0, unverified_count:0, paid_count:0 };");

js = js.replace(/<div class="admin-finance-summary" style="margin-bottom:2rem">[\s\S]*?<div class="grid-cols-4"/, `<div class="admin-finance-summary" style="margin-bottom:2rem">
            <a href="\${window.APP_BASE}admin/invoices?status=unpaid" class="finance-summary-tile tile-warning">
                <span>Onbetaald</span>
                <strong>\${f.unpaid_count}</strong>
                <small>\${window.Core.formatMoney(f.outstanding_cents)}</small>
            </a>
            <a href="\${window.APP_BASE}admin/invoices?status=overdue" class="finance-summary-tile tile-danger">
                <span>Achterstallig</span>
                <strong>\${f.overdue_count}</strong>
                <small>\${window.Core.formatMoney(f.overdue_cents)}</small>
            </a>
            <a href="\${window.APP_BASE}admin/invoices?status=unverified" class="finance-summary-tile tile-info">
                <span>Te controleren</span>
                <strong>\${f.unverified_count}</strong>
                <small>Check transacties</small>
            </a>
            <a href="\${window.APP_BASE}admin/invoices?status=paid" class="finance-summary-tile tile-success">
                <span>Betaald</span>
                <strong>\${f.paid_count}</strong>
                <small>Alle betaalde facturen</small>
            </a>
        </div>

        <div class="grid-cols-4"`);

js = js.replace(/<td><span class="status-badge status-\${i\.payment_status}">\${esc\(\{unverified: 'Te controleren', unpaid: 'Onbetaald', open: 'Openstaand', partial: 'Deels betaald', overdue: 'Achterstallig', paid: 'Betaald', cancelled: 'Geannuleerd'\}\[i\.payment_status\] \|\| i\.payment_status\)}<\/span><\/td>/,
`<td><span class="status-badge status-\${i.payment_status}">\${esc({unverified: 'Te controleren', unpaid: 'Alle onbetaalde', open: 'Openstaand', partial: 'Deels betaald', overdue: 'Achterstallig', paid: 'Betaald', cancelled: 'Geannuleerd'}[i.payment_status] || i.payment_status)}</span></td>`);

js = js.replace(/<span style="font-size:0\.75rem; color:var\(--wb-text-muted\)">Vervaldatum: \${i\.due_date \? new Date\(i\.due_date\)\.toLocaleDateString\(\) : 'Geen vervaldatum'}<\/span>/,
`<span style="font-size:0.75rem; color:var(--wb-text-muted)">Vervaldatum: \${i.due_date ? new Date(i.due_date).toLocaleDateString() : 'Geen vervaldatum'}</span>`);


js = js.replace(/<label>Basisprijs \(in centen\)<\/label>[\s\S]*?<input type="number" name="list_price_cents" value="\${b\.dataset\.price}" class="form-control" required>/,
`<label>Basisprijs (CHF)</label>
                    <input type="number" name="list_price" value="\${(parseInt(b.dataset.price,10)/100).toFixed(2)}" step="0.01" min="0" class="form-control" required>`);

js = js.replace(/list_price_cents: parseInt\(fd\.get\('list_price_cents'\), 10\),/,
`list_price_cents: Math.round(parseFloat(fd.get('list_price')) * 100),`);


fs.writeFileSync('artifacts/parts-store/native/public/assets/admin.js', js);
