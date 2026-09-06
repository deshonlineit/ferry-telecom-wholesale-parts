const fs = require('fs');
let css = fs.readFileSync('artifacts/parts-store/native/public/assets/backoffice.css', 'utf8');

css += `
.admin-invoice-dialog {
    padding: 1.5rem;
    max-height: calc(100dvh - 32px);
    overflow: auto;
    width: calc(100% - 32px);
    margin: 16px auto;
}

.invoice-dialog-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    font-size: inherit;
    font-weight: normal;
}

.invoice-dialog-heading h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0.25rem 0;
}

.invoice-dialog-heading p {
    margin: 0;
    color: #475569;
}

.finance-amount {
    white-space: nowrap;
}

.invoice-row-subtitle, .invoice-row-block {
    display: block;
    color: #64748b;
    font-size: 0.75rem;
    margin-top: 0.125rem;
}

.invoice-number-link {
    background: none;
    border: none;
    color: #0ea5e9;
    font-weight: 600;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
}

.invoice-number-link:hover {
    color: #0284c7;
}

.invoice-metrics > div {
    display: flex;
    flex-direction: column;
}

.invoice-metrics span {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #64748b;
}

.invoice-metrics strong {
    font-size: 1.125rem;
    color: #0f172a;
}

[hidden] {
    display: none !important;
}

@media (max-width: 640px) {
    .invoice-form-grid {
        grid-template-columns: 1fr;
    }
    .invoice-metrics {
        flex-direction: column;
        gap: 1rem;
    }
    .invoice-dialog-actions {
        flex-direction: column;
        gap: 0.5rem;
    }
    .invoice-dialog-actions .btn {
        width: 100%;
    }
}
`;

fs.writeFileSync('artifacts/parts-store/native/public/assets/backoffice.css', css);
