const fs = require('fs');
let css = fs.readFileSync('artifacts/parts-store/native/public/assets/backoffice.css', 'utf8');

css = css.replace('.admin-shell {', `
.admin-shell {
    min-width: 0;
`).replace('grid-template-columns: 260px 1fr;', 'grid-template-columns: 260px minmax(0, 1fr);');

css = css.replace('.admin-main {', `
.admin-main {
    min-width: 0;
`);

css = css.replace('.admin-nav a.active {\n    background-color: #38bdf8;\n    color: #ffffff;', `
.admin-nav a.active {
    background-color: #0ea5e9;
    color: #ffffff;
`);

css = css.replace('.admin-nav-link.text-danger:hover {', `
.admin-nav-btn {
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
}
.admin-nav-link.text-danger:hover {
`);

css += `
.admin-mobile-menu-toggle {
    display: none;
    background: #0f172a;
    color: #fff;
    border: none;
    padding: 1rem;
    width: 100%;
    text-align: left;
    align-items: center;
    gap: 0.75rem;
    font-size: 1rem;
    cursor: pointer;
}

.admin-test-badge {
    background: #ef4444;
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    display: inline-block;
    margin-top: 0.5rem;
    letter-spacing: 0.05em;
}

@media (max-width: 768px) {
    .admin-mobile-menu-toggle {
        display: flex;
    }
    .admin-sidebar {
        display: none;
    }
    .admin-sidebar.open {
        display: flex;
        height: auto;
    }
}
`;

fs.writeFileSync('artifacts/parts-store/native/public/assets/backoffice.css', css);
