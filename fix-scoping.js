const fs = require('fs');
let css = fs.readFileSync('artifacts/parts-store/native/public/assets/backoffice.css', 'utf8');

css = css.replace(/\[hidden\] {/g, 'body[data-area="admin"] [hidden], .admin-invoice-dialog [hidden] {');
css = css.replace(/\.finance-amount {/g, 'body[data-area="admin"] .finance-amount, .admin-invoice-dialog .finance-amount {');
css = css.replace(/\.invoice-row-subtitle, \.invoice-row-block {/g, 'body[data-area="admin"] .invoice-row-subtitle, body[data-area="admin"] .invoice-row-block, .admin-invoice-dialog .invoice-row-subtitle, .admin-invoice-dialog .invoice-row-block {');
css = css.replace(/\.invoice-number-link {/g, 'body[data-area="admin"] .invoice-number-link {');
css = css.replace(/\.invoice-number-link:hover {/g, 'body[data-area="admin"] .invoice-number-link:hover {');
css = css.replace(/\.status-badge {/g, 'body[data-area="admin"] .status-badge, .admin-invoice-dialog .status-badge {');

// The .admin-invoice-dialog is appended to body, so it is outside body[data-area="admin"] if the dialog is in the body root. Wait, in admin-invoices.js, dialog is appended to `root` (which is inside #app-root, so inside body[data-area="admin"]).
// Ah! `root.appendChild(dialog)`. And `root` is `#app-root` replacement. So dialog IS inside `body[data-area="admin"]`. I only need to prefix `[hidden]` with `body[data-area="admin"]`.

fs.writeFileSync('artifacts/parts-store/native/public/assets/backoffice.css', css);
