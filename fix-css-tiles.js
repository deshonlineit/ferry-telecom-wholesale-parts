const fs = require('fs');
let css = fs.readFileSync('artifacts/parts-store/native/public/assets/backoffice.css', 'utf8');

css = css.replace(/\.finance-summary-tile \.data-label/g, '.finance-summary-tile span');
css = css.replace(/\.finance-summary-tile \.data-value/g, '.finance-summary-tile strong');
css = css.replace(/\.finance-summary-tile \.data-sub/g, '.finance-summary-tile small');
css = css.replace(/\.finance-summary-tile strong \{[^}]+\}/, `
.finance-summary-tile strong {
    font-size: 2rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.2;
    margin-bottom: 0.25rem;
    display: block;
}`);
css = css.replace(/\.finance-summary-tile span \{[^}]+\}/, `
.finance-summary-tile span {
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
    display: block;
}`);
css = css.replace(/\.finance-summary-tile small \{[^}]+\}/, `
.finance-summary-tile small {
    font-size: 0.875rem;
    color: #475569;
    font-weight: 500;
    display: block;
}`);

fs.writeFileSync('artifacts/parts-store/native/public/assets/backoffice.css', css);
