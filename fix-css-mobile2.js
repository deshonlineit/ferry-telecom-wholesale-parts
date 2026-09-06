const fs = require('fs');
let css = fs.readFileSync('artifacts/parts-store/native/public/assets/backoffice.css', 'utf8');

// Replace old block with new one
css = css.replace(/\.admin-invoice-dialog {[^}]+}/, '');
css = css.replace(/\.invoice-dialog-heading {[^}]+}/, '');
css = css.replace(/\.invoice-form-grid {[^}]+}/, `
.invoice-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
}
`);
css = css.replace(/\.invoice-metrics {[^}]+}/, `
.invoice-metrics {
    display: flex;
    gap: 1.5rem;
    background: #f8fafc;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
}
`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/backoffice.css', css);
