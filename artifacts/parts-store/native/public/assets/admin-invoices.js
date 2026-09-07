(function () {
    'use strict';
    const labels = {
        all: 'All invoices', unverified: 'To be checked', unpaid: 'All unpaid',
        open: 'Outstanding', partial: 'Partially paid', overdue: 'Overdue',
        paid: 'Paid', cancelled: 'Cancelled'
    };
    const esc = value => window.Core.escapeHtml(String(value ?? ''));
    const money = cents => window.Core.formatMoney(Number(cents));
    const date = value => value ? `${String(value).slice(8, 10)}-${String(value).slice(5, 7)}-${String(value).slice(0, 4)}` : 'Not set';
    let savedNotice = '';

    function buildUrl(current, changes = {}) {
        const params = new URLSearchParams();
        ['q', 'status', 'sort', 'page', 'limit'].forEach(key => {
            if (current.get(key)) params.set(key, current.get(key));
        });
        if (!Object.hasOwn(changes, 'page')) params.delete('page');
        Object.entries(changes).forEach(([key, value]) => {
            if (!['q', 'status', 'sort', 'page', 'limit'].includes(key)) return;
            if (value === null || value === '' || value === undefined) params.delete(key);
            else params.set(key, String(value));
        });
        return `${window.APP_BASE}admin/invoices${params.size ? '?' + params.toString() : ''}`;
    }

    function parseCents(value) {
        const text = String(value).trim().replace(',', '.');
        if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Enter a positive amount with no more than two decimal places, or 0.');
        const [whole, fraction = ''] = text.split('.');
        const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        if (!Number.isSafeInteger(cents) || cents > 100000000) throw new Error('This amount is too large.');
        return cents;
    }

    function badge(status) {
        const safeStatus = Object.hasOwn(labels, status) ? status : 'unverified';
        return `<span class="status-badge status-${safeStatus}">${esc(labels[safeStatus])}</span>`;
    }

    function renderRows(invoices) {
        return invoices.map(invoice => {
            const id = Number(invoice.id);
            const cur = invoice.currency || 'CHF';
            return `<tr data-invoice-id="${id}">
                <td><button type="button" class="invoice-number-link" data-invoice-edit="${id}">${esc(invoice.order_number)}</button><small class="invoice-row-subtitle">Invoice for order</small></td>
                <td><strong>${esc(invoice.company || invoice.customer_name)}</strong><small class="invoice-row-subtitle">${esc(invoice.company ? invoice.customer_name : invoice.email)}</small></td>
                <td>${date(invoice.issued_at)}</td>
                <td>${badge(invoice.payment_status)}</td>
                <td class="${invoice.payment_status === 'overdue' ? 'invoice-overdue-date' : ''}">${date(invoice.due_date)}</td>
                <td class="finance-amount">${window.Core.formatMoney(invoice.total_cents, cur)}${invoice.credited_cents > 0 ? `<small class="invoice-row-subtitle">Credit: ${window.Core.formatMoney(invoice.credited_cents, cur)}</small>` : ''}</td>
                <td class="finance-amount">${invoice.verified ? window.Core.formatMoney(invoice.paid_cents, cur) : '<span class="text-muted">Not confirmed</span>'}</td>
                <td class="finance-amount"><strong>${invoice.outstanding_cents === null ? 'To be checked' : window.Core.formatMoney(invoice.outstanding_cents, cur)}</strong>${invoice.credit_balance_cents > 0 ? `<small class="invoice-row-subtitle">Credit balance: ${window.Core.formatMoney(invoice.credit_balance_cents, cur)}</small>` : ''}</td>
                <td><div class="invoice-row-actions"><button type="button" class="btn btn-sm btn-outline" data-invoice-edit="${id}">Manage</button><a class="btn btn-sm btn-outline" href="${window.APP_BASE}api/documents/${id}/invoice.pdf" target="_blank" rel="noopener" aria-label="Open invoice ${esc(invoice.order_number)} as a PDF">PDF</a></div></td>
            </tr>`;
        }).join('');
    }

    function renderSummary(summaryList, params) {
        const summaries = Array.isArray(summaryList) ? summaryList : [Object.assign({currency: 'CHF'}, summaryList)];
        return summaries.map(summary => {
            const cur = summary.currency || 'CHF';
            const tiles = [
                { status: 'unpaid', name: 'Outstanding', value: window.Core.formatMoney(summary.outstanding_cents, cur), detail: `${summary.unpaid_count} confirmed unpaid invoices` },
                { status: 'overdue', name: 'Overdue', value: window.Core.formatMoney(summary.overdue_cents, cur), detail: `${summary.overdue_count} past the due date` },
                { status: 'unverified', name: 'To be checked', value: summary.unverified_count, detail: 'No confirmed payment record yet' },
                { status: 'paid', name: 'Paid', value: summary.paid_count, detail: 'No outstanding amount' }
            ];
            return `<div class="finance-currency-group">
                <h4 style="margin:0 0 0.5rem 0;font-size:0.875rem;color:var(--wb-text-muted)">Currency: ${cur}</h4>
                <div style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap">
                ${tiles.map(tile => `<a class="finance-summary-tile finance-${tile.status}" style="flex:1;min-width:180px;" href="${buildUrl(params, { status: tile.status, q: null, currency: cur })}"><span>${tile.name}</span><strong>${esc(tile.value)}</strong><small>${esc(tile.detail)}</small></a>`).join('')}
                </div></div>`;
        }).join('');
    }

    function openInvoice(invoice, root, opener) {
        const dialog = document.createElement('dialog');
        dialog.className = 'admin-invoice-dialog';
        dialog.setAttribute('aria-labelledby', 'invoice-dialog-title');
        const cancelled = invoice.order_status === 'cancelled';
        dialog.innerHTML = `
            <div class="invoice-dialog-heading"><div><span class="data-label">Payment Record</span><h2 id="invoice-dialog-title">${esc(invoice.order_number)}</h2><p>${esc(invoice.company || invoice.customer_name)}</p></div><button type="button" class="btn btn-outline" data-invoice-close aria-label="Close invoice window">Close</button></div>
            <form id="invoice-payment-form">
                <div class="invoice-metrics"><div><span>Invoice Amount</span><strong>${window.Core.formatMoney(invoice.total_cents, invoice.currency || 'CHF')}</strong></div><div><span>Credited</span><strong>${window.Core.formatMoney(invoice.credited_cents, invoice.currency || 'CHF')}</strong></div><div><span>Outstanding</span><strong>${invoice.outstanding_cents === null ? 'To be checked' : window.Core.formatMoney(invoice.outstanding_cents, invoice.currency || 'CHF')}</strong></div></div>
                <p class="invoice-current-status">Current status: ${badge(invoice.payment_status)}</p>
                ${cancelled ? '<div class="alert warning">This order has been cancelled and will not be collected as outstanding. Any funds received earlier remain recorded; refunds are not issued automatically.</div>' : ''}
                ${invoice.credit_balance_cents > 0 ? `<div class="alert warning">There is a credit balance of ${window.Core.formatMoney(invoice.credit_balance_cents, invoice.currency || 'CHF')}. This record does not issue a refund.</div>` : ''}
                <div class="invoice-form-grid">
                    <div class="form-group"><label for="invoice-paid-amount">Total amount received (${esc(invoice.currency || 'CHF')})</label><input id="invoice-paid-amount" name="paid_amount" type="number" inputmode="decimal" step="0.01" min="0" max="1000000" value="${(Number(invoice.paid_cents) / 100).toFixed(2)}" required aria-describedby="invoice-amount-help"><small id="invoice-amount-help">The total you are confirming, not an additional payment.</small><button type="button" class="btn btn-sm btn-outline" data-invoice-fill-paid>Enter full amount received</button></div>
                    <div class="form-group"><label for="invoice-due-date">Due Date</label><input id="invoice-due-date" name="due_date" type="date" value="${esc(invoice.due_date || '')}"><small>Leave blank if no due date has been set.</small></div>
                </div>
                <label class="invoice-verified-label"><input id="invoice-verified" name="verified" type="checkbox" ${invoice.verified ? 'checked' : ''}><span>I have checked the payment details.</span></label>
                <p class="invoice-help">Unchecked records remain “To be checked”. A confirmed record with 0 received becomes “Outstanding”; a part payment becomes “Partially paid”. A past due date with an outstanding balance becomes “Overdue”.</p>
                <div class="form-group"><label for="invoice-note">Reason for this Change</label><textarea id="invoice-note" name="note" rows="2" minlength="5" maxlength="1000" required placeholder="For example: bank receipt checked, reference …"></textarea><small>The change and explanation are recorded in the administration audit log.</small></div>
                <p class="invoice-local-notice">Local test administration only. Saving does not collect funds or send a message.</p>
                <div id="invoice-form-error" class="alert error" role="alert" hidden></div>
                <button type="button" class="btn btn-outline" data-invoice-reload hidden>Reload Current Data</button>
                <div class="invoice-dialog-actions"><a class="btn btn-outline" href="${window.APP_BASE}api/documents/${Number(invoice.id)}/invoice.pdf" target="_blank" rel="noopener">Invoice PDF</a><button type="button" class="btn btn-outline" data-invoice-close>Cancel</button><button id="invoice-save" class="btn btn-primary" type="submit">Save Record</button></div>
            </form>`;
        root.appendChild(dialog);
        const form = dialog.querySelector('form');
        let busy = false;
        let dirty = false;
        form.addEventListener('input', () => { dirty = true; });
        const close = () => {
            if (busy) return;
            if (dirty && !window.confirm('Your changes have not been saved. Close the window anyway?')) return;
            dialog.close();
        };
        dialog.querySelectorAll('[data-invoice-close]').forEach(button => button.addEventListener('click', close));
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        dialog.addEventListener('close', () => {
            dialog.remove();
            if (opener?.isConnected) opener.focus();
        }, { once: true });
        dialog.querySelector('[data-invoice-fill-paid]').addEventListener('click', () => {
            form.elements.paid_amount.value = (Math.max(Number(invoice.paid_cents), Number(invoice.total_cents) - Number(invoice.credited_cents), 0) / 100).toFixed(2);
            form.elements.verified.checked = true;
            dirty = true;
            form.elements.note.focus();
        });
        dialog.querySelector('[data-invoice-reload]').addEventListener('click', () => {
            if (busy) return;
            if (!window.confirm('Unsaved entries will be discarded. Reload the current payment details?')) return;
            dirty = false;
            dialog.close();
            if (root.isConnected) window.Router.route();
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (busy || !form.reportValidity()) return;
            const error = dialog.querySelector('#invoice-form-error');
            const save = dialog.querySelector('#invoice-save');
            error.hidden = true;
            try {
                const paid = parseCents(form.elements.paid_amount.value);
                if (paid > 0 && !form.elements.verified.checked) throw new Error('Confirm that you have checked the payment details first.');
                busy = true;
                save.textContent = 'Saving…';
                form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
                await window.Core.fetch(`/admin/invoices/${Number(invoice.id)}`, {
                    method: 'PATCH',
                    body: {
                        version: Number(invoice.version), verified: form.elements.verified.checked,
                        due_date: form.elements.due_date.value || null, paid_cents: paid,
                        note: form.elements.note.value.trim()
                    }
                });
                dirty = false;
                dialog.close();
                if (root.isConnected) {
                    savedNotice = `Payment record for ${invoice.order_number} saved. No real payment was made.`;
                    window.Router.route();
                }
            } catch (err) {
                error.textContent = `${err.message} Your changes have not been saved.`;
                error.hidden = false;
                dialog.querySelector('[data-invoice-reload]').hidden = false;
            } finally {
                busy = false;
                form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = false; });
                save.textContent = 'Save Record';
            }
        });
        dialog.showModal();
    }

    window.Router.add(/^admin\/invoices$/, async (match, root, params) => {
        if (!window.Core.user || window.Core.user.role !== 'staff') {
            window.Router.navigate(window.APP_BASE + (window.Core.user ? '' : 'login'));
            return;
        }
        const version = window.Router.renderVersion;
        const query = new URLSearchParams(buildUrl(params, { page: params.get('page') || 1 }).split('?')[1] || '');
        const data = await window.Core.fetch('/admin/invoices?' + query.toString());
        if (version !== window.Router.renderVersion || !root.isConnected) return;
        if (!Array.isArray(data.invoices) || !data.summary) throw new Error('The invoice overview could not be loaded in full.');
        const notice = savedNotice;
        savedNotice = '';
        const status = params.get('status') || 'all';
        const sort = params.get('sort') || 'newest';
        root.innerHTML = window.Admin.layout(`
            <section class="admin-finance">
                <div class="page-header"><div><span class="data-label">Financial Overview</span><h1>Invoices & Payments</h1><p>Review outstanding balances, check receipts and track due dates.</p></div><button type="button" class="btn btn-outline" data-invoices-refresh>Refresh</button></div>
                ${notice ? `<div class="alert success" role="status">${esc(notice)}</div>` : ''}
                <div class="admin-finance-summary">${renderSummary(data.summary, params)}</div>
                <p class="invoice-scope-note">Total across all invoices. Unchecked amounts are not included as confirmed outstanding debt.</p>
                <form id="invoice-filter-form" class="admin-toolbar">
                    <div class="form-group"><label for="invoice-search">Search for an Invoice or Customer</label><input id="invoice-search" name="q" type="search" maxlength="160" placeholder="Order number, company or email…" value="${esc(params.get('q') || '')}"></div>
                    <div class="form-group"><label for="invoice-status">Payment Status</label><select id="invoice-status" name="status">${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                    <div class="form-group"><label for="invoice-sort">Sort</label><select id="invoice-sort" name="sort">${[['newest', 'Newest first'], ['oldest', 'Oldest first'], ['due', 'Due date'], ['amount_desc', 'Highest invoice amount']].map(([value, label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                    <div class="form-group"><label for="invoice-limit">Per Page</label><select id="invoice-limit" name="limit">${[25, 50, 100].map(value => `<option value="${value}" ${Number(params.get('limit') || 50) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
                    <button class="btn btn-primary" type="submit">Apply</button><a class="btn btn-outline" href="${window.APP_BASE}admin/invoices">Clear</a>
                </form>
                <div class="invoice-list-heading"><h2>${esc(labels[status] || 'Invoices')}</h2><span>${Number(data.total)} invoices · page ${Number(data.page)} of ${Number(data.pages)}</span></div>
                <div class="table-responsive"><table class="data-table finance-table"><caption class="sr-only">Invoices with customer, payment status, due date and outstanding amount</caption><thead><tr>${['Order / invoice', 'Customer', 'Created', 'Payment status', 'Due date', 'Invoice amount', 'Received', 'Outstanding', 'Actions'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${data.invoices.length ? renderRows(data.invoices) : '<tr><td colspan="9"><div class="empty-state"><h3>No invoices found in this selection</h3><p>Adjust the search term or payment status. No payment details are assumed.</p></div></td></tr>'}</tbody></table></div>
                <div class="pagination-container">${window.Core.renderPagination(data.page, data.pages, new URLSearchParams(query), window.APP_BASE + 'admin/invoices')}</div>
            </section>`, 'invoices');
        const filterForm = root.querySelector('#invoice-filter-form');
        const applyFilters = () => {
            const values = new FormData(filterForm);
            window.Router.navigate(buildUrl(params, {
                q: String(values.get('q') || '').trim(), status: values.get('status'),
                sort: values.get('sort'), limit: values.get('limit')
            }));
        };
        filterForm.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
        filterForm.querySelectorAll('select').forEach(select => select.addEventListener('change', applyFilters));
        root.querySelector('[data-invoices-refresh]').addEventListener('click', () => window.Router.route());
        root.querySelectorAll('[data-invoice-edit]').forEach(button => button.addEventListener('click', () => {
            const invoice = data.invoices.find(row => Number(row.id) === Number(button.dataset.invoiceEdit));
            if (invoice) openInvoice(invoice, root, button);
        }));
    });
    window.AdminInvoices = { buildUrl, parseCents, renderRows, renderSummary };
})();