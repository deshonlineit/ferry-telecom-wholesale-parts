// Account area: saved order lists, back-in-stock alerts, the document
// archive and billing delivery preferences.

const wspLayout = (content, activeRoute) =>
    (typeof accountLayout === 'function' ? accountLayout(content, activeRoute) : content);
const wspT = (key, values) => window.I18n.t(key, values);
const wspEsc = value => window.Core.escapeHtml(String(value ?? ''));
const wspMoney = (cents, currency) => window.I18n.formatMoney(cents, currency || window.Core.currency);

const wspRequireCustomer = () => {
    if (!window.Core.user) { window.Router.navigate(window.APP_BASE + 'login'); return false; }
    if (window.Core.user.role === 'staff') { window.Router.navigate(window.APP_BASE + 'catalog'); return false; }
    return true;
};

const wspHeader = (title, description, actions = '') => `
    <div class="b2b-account-header">
        <div class="b2b-account-header-text">
            <h1 class="b2b-account-title">${wspEsc(title)}</h1>
            <p class="b2b-text-muted">${wspEsc(description)}</p>
        </div>
        ${actions ? `<div class="b2b-account-header-actions wsp-actions">${actions}</div>` : ''}
    </div>`;

/* ------------------------------------------------------------------ */
/* Saved order lists                                                   */
/* ------------------------------------------------------------------ */

window.OrderLists = {
    async createList(form) {
        const input = form.querySelector('[name="name"]');
        const name = input.value.trim();
        if (!name) { window.Workbench.toast(wspT('listNameRequired'), 'error'); return; }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await window.Core.fetch('/workspace/order-lists', { method: 'POST', body: { name } });
            window.Workbench.toast(wspT('listCreated', { name }), 'success');
            input.value = '';
            window.Router.route();
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
            button.disabled = false;
        }
    },

    async rename(id, currentName) {
        const name = window.prompt(wspT('listRenamePrompt'), currentName);
        if (name === null || name.trim() === '' || name.trim() === currentName) return;
        try {
            await window.Core.fetch(`/workspace/order-lists/${id}`, { method: 'PATCH', body: { name: name.trim() } });
            window.Workbench.toast(wspT('listRenamed'), 'success');
            window.Router.route();
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        }
    },

    async remove(id, name) {
        if (!window.confirm(wspT('listDeleteConfirm', { name }))) return;
        try {
            await window.Core.fetch(`/workspace/order-lists/${id}`, { method: 'DELETE' });
            window.Workbench.toast(wspT('listDeleted'), 'success');
            window.Router.navigate(window.APP_BASE + 'account/lists');
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        }
    },

    async addToCart(id, button) {
        button.disabled = true;
        try {
            const data = await window.Core.fetch(`/workspace/order-lists/${id}/add-to-cart`, { method: 'POST' });
            window.Wsp.applyCart(data.cart);
            const skipped = (data.lines || []).filter(line => !window.Wsp.orderable(line)).length;
            window.Workbench.toast(
                skipped
                    ? wspT('listAddedPartial', { count: window.I18n.number(data.added), skipped: window.I18n.number(skipped) })
                    : wspT('listAdded', { count: window.I18n.number(data.added) }),
                skipped ? 'info' : 'success'
            );
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    async removeItem(listId, productId, button) {
        button.disabled = true;
        try {
            await window.Core.fetch(`/workspace/order-lists/${listId}/items/${productId}`, { method: 'DELETE' });
            window.Router.route();
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
            button.disabled = false;
        }
    },

    async saveQuantity(listId, productId, quantity) {
        try {
            await window.Core.fetch(`/workspace/order-lists/${listId}/items`, {
                method: 'POST',
                body: { product_id: productId, quantity: Math.max(1, Number(quantity) || 1) }
            });
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        }
    }
};

window.Router.add(/^account\/lists$/, async (match, root) => {
    if (!wspRequireCustomer()) return;
    const data = await window.Core.fetch('/workspace/order-lists');
    const lists = data.lists || [];

    const cards = lists.map(list => `
        <article class="wsp-list-card">
            <h3><a href="${window.APP_BASE}account/lists/${list.id}">${wspEsc(list.name)}</a></h3>
            <p class="wsp-list-card-meta">${wspEsc(wspT('listItemCount', { count: window.I18n.number(list.item_count) }))}
                &middot; ${wspEsc(wspT('listUpdated', { date: window.I18n.date(list.updated_at) }))}</p>
            <div class="wsp-list-card-actions">
                <button type="button" class="wsp-btn wsp-btn-sm wsp-btn-primary"
                    onclick="window.OrderLists.addToCart(${list.id}, this)" ${list.item_count ? '' : 'disabled'}>
                    ${wspEsc(wspT('listAddAllToCart'))}
                </button>
                <a class="wsp-btn wsp-btn-sm" href="${window.APP_BASE}account/lists/${list.id}">${wspEsc(wspT('open'))}</a>
                <button type="button" class="wsp-btn wsp-btn-sm wsp-btn-danger-quiet"
                    onclick="window.OrderLists.remove(${list.id}, ${JSON.stringify(list.name).replace(/"/g, '&quot;')})">
                    ${wspEsc(wspT('delete'))}
                </button>
            </div>
        </article>`).join('');

    const content = `
        ${wspHeader(wspT('orderLists'), wspT('orderListsIntro'))}
        <div class="wsp-panel">
            <div class="wsp-panel-head">
                <div><h2>${wspEsc(wspT('listCreateTitle'))}</h2></div>
            </div>
            <div class="wsp-panel-body">
                <form class="wsp-actions" onsubmit="event.preventDefault(); window.OrderLists.createList(this);">
                    <input type="text" name="name" class="wsp-input" style="max-width:320px"
                        placeholder="${wspEsc(wspT('listNamePlaceholder'))}" maxlength="120" required>
                    <button type="submit" class="wsp-btn wsp-btn-primary">${wspEsc(wspT('listCreate'))}</button>
                </form>
            </div>
        </div>
        <div class="wsp-panel">
            <div class="wsp-panel-head"><div><h2>${wspEsc(wspT('listYourLists'))}</h2></div></div>
            <div class="wsp-panel-body">
                ${lists.length
                    ? `<div class="wsp-list-grid">${cards}</div>`
                    : window.Wsp.emptyState(wspT('listEmptyTitle'), wspT('listEmptyBody'))}
            </div>
        </div>`;

    root.innerHTML = wspLayout(content, 'lists');
});

window.Router.add(/^account\/lists\/(\d+)$/, async (match, root) => {
    if (!wspRequireCustomer()) return;
    const listId = Number(match[1]);
    const data = await window.Core.fetch(`/workspace/order-lists/${listId}`);
    const items = data.items || [];
    const orderable = items.filter(item => item.orderable).length;

    const rows = items.map(item => `
        <tr class="${item.orderable ? '' : 'wsp-row-error'}">
            <td>${window.Wsp.productCell(item)}</td>
            <td class="wsp-num">
                <input type="number" class="wsp-input" style="width:88px;text-align:center" min="1" step="1"
                    value="${Number(item.quantity)}"
                    onchange="window.OrderLists.saveQuantity(${listId}, ${item.product_id}, this.value)">
            </td>
            <td class="wsp-num">${item.price_cents !== null ? wspMoney(item.price_cents, item.currency) : '—'}</td>
            <td>${item.orderable
                ? `<span class="wsp-chip wsp-chip-ok">${wspEsc(wspT('inStockCount', { count: window.I18n.number(item.stock) }))}</span>`
                : (!item.active
                    ? `<span class="wsp-chip wsp-chip-neutral">${wspEsc(wspT('qoStatusInactive'))}</span>`
                    : (item.price_cents === null
                        ? `<span class="wsp-chip wsp-chip-error">${wspEsc(wspT('qoStatusNoPrice'))}</span>`
                        : `<span class="wsp-chip wsp-chip-error">${wspEsc(wspT('outOfStock'))}</span>`))}</td>
            <td class="wsp-num">
                <button type="button" class="wsp-btn wsp-btn-sm wsp-btn-danger-quiet"
                    onclick="window.OrderLists.removeItem(${listId}, ${item.product_id}, this)"
                    aria-label="${wspEsc(wspT('listRemoveItem', { name: item.name }))}">${wspEsc(wspT('remove'))}</button>
            </td>
        </tr>`).join('');

    const content = `
        <a href="${window.APP_BASE}account/lists" class="b2b-back-link">&larr; ${wspEsc(wspT('orderLists'))}</a>
        ${wspHeader(data.list.name, wspT('listDetailIntro'), `
            <button type="button" class="wsp-btn wsp-btn-sm"
                onclick="window.OrderLists.rename(${listId}, ${JSON.stringify(data.list.name).replace(/"/g, '&quot;')})">
                ${wspEsc(wspT('rename'))}
            </button>
            <button type="button" class="wsp-btn wsp-btn-primary"
                onclick="window.OrderLists.addToCart(${listId}, this)" ${orderable ? '' : 'disabled'}>
                ${wspEsc(wspT('listAddAllToCart'))}
            </button>`)}
        <div class="wsp-panel">
            ${items.length ? `
                <div class="wsp-table-wrap">
                    <table class="wsp-table">
                        <thead><tr>
                            <th>${wspEsc(wspT('product'))}</th>
                            <th class="wsp-num">${wspEsc(wspT('quantity'))}</th>
                            <th class="wsp-num">${wspEsc(wspT('unitPrice'))}</th>
                            <th>${wspEsc(wspT('availability'))}</th>
                            <th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="wsp-summary">
                    <div>
                        <div class="wsp-summary-total">${wspMoney(data.total_cents, data.currency)}</div>
                        <div class="wsp-summary-note">${wspEsc(wspT('listTotalNote', {
                            count: window.I18n.number(orderable)
                        }))}</div>
                    </div>
                </div>`
                : window.Wsp.emptyState(wspT('listDetailEmptyTitle'), wspT('listDetailEmptyBody'),
                    `<a class="wsp-btn wsp-btn-primary" href="${window.APP_BASE}catalog">${wspEsc(wspT('catalogue'))}</a>`)}
        </div>`;

    root.innerHTML = wspLayout(content, 'lists');
});

/* ------------------------------------------------------------------ */
/* Back-in-stock alerts                                                */
/* ------------------------------------------------------------------ */

window.StockAlerts = {
    async watch(productId, button) {
        button.disabled = true;
        try {
            await window.Core.fetch('/workspace/stock-alerts', { method: 'POST', body: { product_id: productId } });
            window.Workbench.toast(wspT('alertCreated'), 'success');
            button.dataset.watching = '1';
            button.textContent = wspT('alertStopWatching');
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    async unwatch(productId, button, reload = false) {
        button.disabled = true;
        try {
            await window.Core.fetch(`/workspace/stock-alerts/${productId}`, { method: 'DELETE' });
            window.Workbench.toast(wspT('alertRemoved'), 'success');
            if (reload) { window.Router.route(); return; }
            button.dataset.watching = '';
            button.textContent = wspT('alertNotifyMe');
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    toggle(productId, button) {
        if (button.dataset.watching === '1') return this.unwatch(productId, button);
        return this.watch(productId, button);
    }
};

window.Router.add(/^account\/alerts$/, async (match, root) => {
    if (!wspRequireCustomer()) return;
    const data = await window.Core.fetch('/workspace/stock-alerts');
    const alerts = data.alerts || [];

    const rows = alerts.map(alert => `
        <tr>
            <td>${window.Wsp.productCell(alert)}</td>
            <td class="wsp-num">${alert.price_cents !== null ? wspMoney(alert.price_cents, alert.currency) : '—'}</td>
            <td>${alert.alert_status === 'available'
                ? `<span class="wsp-chip wsp-chip-ok">${wspEsc(wspT('alertBackInStock', { count: window.I18n.number(alert.stock) }))}</span>`
                : `<span class="wsp-chip wsp-chip-neutral">${wspEsc(wspT('alertWaiting'))}</span>`}
                ${alert.expected_restock_date
                    ? `<div class="wsp-form-help">${wspEsc(wspT('alertExpected', { date: window.I18n.date(alert.expected_restock_date) }))}</div>`
                    : ''}</td>
            <td class="wsp-num">${wspEsc(window.I18n.date(alert.requested_at))}</td>
            <td class="wsp-num">
                <div class="wsp-actions" style="justify-content:flex-end">
                    ${alert.alert_status === 'available' && alert.price_cents !== null
                        ? `<button type="button" class="wsp-btn wsp-btn-sm wsp-btn-primary"
                            onclick="window.App.addToCartWithQty(${alert.product_id}, ${Math.max(1, alert.minimum_quantity)}, this)">
                            ${wspEsc(wspT('addToCart'))}</button>`
                        : ''}
                    <button type="button" class="wsp-btn wsp-btn-sm wsp-btn-danger-quiet"
                        onclick="window.StockAlerts.unwatch(${alert.product_id}, this, true)">${wspEsc(wspT('remove'))}</button>
                </div>
            </td>
        </tr>`).join('');

    const content = `
        ${wspHeader(wspT('stockAlerts'), wspT('stockAlertsIntro'))}
        <div class="wsp-note wsp-note-info" style="margin-bottom:1.25rem">${wspEsc(wspT('alertDeliveryNote'))}</div>
        <div class="wsp-panel">
            ${alerts.length ? `
                <div class="wsp-table-wrap">
                    <table class="wsp-table">
                        <thead><tr>
                            <th>${wspEsc(wspT('product'))}</th>
                            <th class="wsp-num">${wspEsc(wspT('unitPrice'))}</th>
                            <th>${wspEsc(wspT('status'))}</th>
                            <th class="wsp-num">${wspEsc(wspT('alertRequestedOn'))}</th>
                            <th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : window.Wsp.emptyState(wspT('alertEmptyTitle'), wspT('alertEmptyBody'),
                    `<a class="wsp-btn wsp-btn-primary" href="${window.APP_BASE}catalog">${wspEsc(wspT('catalogue'))}</a>`)}
        </div>`;

    root.innerHTML = wspLayout(content, 'alerts');
});

/* ------------------------------------------------------------------ */
/* Document archive                                                    */
/* ------------------------------------------------------------------ */

window.DocumentCentre = {
    filters: { period: 'year', year: new Date().getFullYear(), type: 'all', from: '', to: '' },

    query() {
        const parameters = new URLSearchParams();
        parameters.set('period', this.filters.period);
        parameters.set('year', String(this.filters.year));
        parameters.set('type', this.filters.type);
        if (this.filters.period === 'custom') {
            if (this.filters.from) parameters.set('from', this.filters.from);
            if (this.filters.to) parameters.set('to', this.filters.to);
        }
        return parameters.toString();
    },

    set(key, value) {
        this.filters[key] = value;
        window.Router.route();
    },

    slug() {
        const filters = this.filters;
        if (filters.period === 'all') return 'all';
        if (filters.period === 'year') return String(filters.year);
        if (filters.period === 'custom') return `${filters.from || 'start'}-${filters.to || 'today'}`;
        return `${filters.period.toUpperCase()}-${filters.year}`;
    },

    exportCsv(button) {
        return window.Wsp.download(`/workspace/documents/export.csv?${this.query()}`, `documents-${this.slug()}.csv`, button);
    },

    downloadArchive(button) {
        return window.Wsp.download(`/workspace/documents/archive.zip?${this.query()}`, `documents-${this.slug()}.zip`, button);
    }
};

const wspPaymentChip = document => {
    const map = {
        paid: ['ok', 'docStatusPaid'],
        open: ['info', 'docStatusOpen'],
        partial: ['warn', 'docStatusPartial'],
        overdue: ['error', 'docStatusOverdue'],
        cancelled: ['neutral', 'docStatusCancelled'],
        credited: ['neutral', 'docStatusCredited'],
        unknown: ['neutral', 'docStatusUnknown']
    };
    const [tone, key] = map[document.payment_status] || map.unknown;
    return `<span class="wsp-chip wsp-chip-${tone}">${wspEsc(wspT(key))}</span>`;
};

window.Router.add(/^account\/documents$/, async (match, root) => {
    if (!wspRequireCustomer()) return;
    const centre = window.DocumentCentre;
    const data = await window.Core.fetch(`/workspace/documents?${centre.query()}`);
    const documents = data.documents || [];
    const years = data.years || [centre.filters.year];

    const quarterButtons = ['q1', 'q2', 'q3', 'q4'].map(quarter => `
        <button type="button" class="wsp-btn wsp-btn-sm ${centre.filters.period === quarter ? 'wsp-btn-primary' : ''}"
            onclick="window.DocumentCentre.set('period', '${quarter}')">${quarter.toUpperCase()}</button>`).join('');

    const totals = (data.totals || []).map(total => `
        <div class="wsp-total-item">
            <dt>${wspEsc(wspT('docTotalInvoiced', { currency: total.currency }))}</dt>
            <dd>${wspMoney(total.amount_cents, total.currency)}</dd>
        </div>
        <div class="wsp-total-item">
            <dt>${wspEsc(wspT('docTotalOutstanding', { currency: total.currency }))}</dt>
            <dd>${total.outstanding_known ? wspMoney(total.outstanding_cents, total.currency) : wspEsc(wspT('docPartiallyUnknown'))}</dd>
        </div>
        <div class="wsp-total-item">
            <dt>${wspEsc(wspT('docTotalCount'))}</dt>
            <dd>${window.I18n.number(total.document_count)}</dd>
        </div>`).join('');

    const rows = documents.map(document => `
        <tr>
            <td>${wspEsc(window.I18n.date(document.issued_at))}</td>
            <td>
                <span class="wsp-code">${wspEsc(document.document_number)}</span>
                <div class="wsp-form-help">${wspEsc(document.type === 'credit_note'
                    ? wspT('docTypeCreditNote') : wspT('docTypeInvoice'))}${document.customer_reference
                        ? ` &middot; ${wspEsc(document.customer_reference)}` : ''}</div>
            </td>
            <td><a href="${window.APP_BASE}account/orders">${wspEsc(document.order_number)}</a></td>
            <td class="wsp-num">${wspMoney(document.amount_cents, document.currency)}</td>
            <td class="wsp-num">${document.outstanding_cents === null
                ? `<span class="b2b-text-muted">${wspEsc(wspT('docUnknown'))}</span>`
                : wspMoney(document.outstanding_cents, document.currency)}</td>
            <td>${wspPaymentChip(document)}${document.due_date
                ? `<div class="wsp-form-help">${wspEsc(wspT('docDue', { date: window.I18n.date(document.due_date) }))}</div>`
                : ''}</td>
            <td class="wsp-num">
                <button type="button" class="wsp-btn wsp-btn-sm"
                    onclick="window.Wsp.download('${document.download_path}', '${wspEsc(document.document_number.toLowerCase())}.pdf', this)">
                    ${wspEsc(wspT('download'))}
                </button>
            </td>
        </tr>`).join('');

    const tooManyForZip = documents.filter(item => item.type === 'invoice').length > Number(data.archive_limit || 120);

    const content = `
        ${wspHeader(wspT('documents'), wspT('documentsIntro'))}

        <div class="wsp-panel">
            <div class="wsp-panel-body">
                <div class="wsp-filters">
                    <div class="wsp-field">
                        <label for="doc-year">${wspEsc(wspT('docYear'))}</label>
                        <select id="doc-year" onchange="window.DocumentCentre.set('year', Number(this.value))">
                            ${years.map(year => `<option value="${year}" ${Number(year) === Number(centre.filters.year) ? 'selected' : ''}>${year}</option>`).join('')}
                        </select>
                    </div>
                    <div class="wsp-field">
                        <label for="doc-period">${wspEsc(wspT('docPeriod'))}</label>
                        <select id="doc-period" onchange="window.DocumentCentre.set('period', this.value)">
                            <option value="year" ${centre.filters.period === 'year' ? 'selected' : ''}>${wspEsc(wspT('docWholeYear'))}</option>
                            <option value="q1" ${centre.filters.period === 'q1' ? 'selected' : ''}>${wspEsc(wspT('docQuarter', { quarter: 1 }))}</option>
                            <option value="q2" ${centre.filters.period === 'q2' ? 'selected' : ''}>${wspEsc(wspT('docQuarter', { quarter: 2 }))}</option>
                            <option value="q3" ${centre.filters.period === 'q3' ? 'selected' : ''}>${wspEsc(wspT('docQuarter', { quarter: 3 }))}</option>
                            <option value="q4" ${centre.filters.period === 'q4' ? 'selected' : ''}>${wspEsc(wspT('docQuarter', { quarter: 4 }))}</option>
                            <option value="all" ${centre.filters.period === 'all' ? 'selected' : ''}>${wspEsc(wspT('docAllTime'))}</option>
                            <option value="custom" ${centre.filters.period === 'custom' ? 'selected' : ''}>${wspEsc(wspT('docCustomRange'))}</option>
                        </select>
                    </div>
                    <div class="wsp-field">
                        <label for="doc-type">${wspEsc(wspT('docType'))}</label>
                        <select id="doc-type" onchange="window.DocumentCentre.set('type', this.value)">
                            <option value="all" ${centre.filters.type === 'all' ? 'selected' : ''}>${wspEsc(wspT('docTypeAll'))}</option>
                            <option value="invoice" ${centre.filters.type === 'invoice' ? 'selected' : ''}>${wspEsc(wspT('docTypeInvoice'))}</option>
                            <option value="credit_note" ${centre.filters.type === 'credit_note' ? 'selected' : ''}>${wspEsc(wspT('docTypeCreditNote'))}</option>
                        </select>
                    </div>
                    ${centre.filters.period === 'custom' ? `
                        <div class="wsp-field">
                            <label for="doc-from">${wspEsc(wspT('docFrom'))}</label>
                            <input type="date" id="doc-from" value="${wspEsc(centre.filters.from)}"
                                onchange="window.DocumentCentre.set('from', this.value)">
                        </div>
                        <div class="wsp-field">
                            <label for="doc-to">${wspEsc(wspT('docTo'))}</label>
                            <input type="date" id="doc-to" value="${wspEsc(centre.filters.to)}"
                                onchange="window.DocumentCentre.set('to', this.value)">
                        </div>` : `
                        <div class="wsp-field" style="min-width:auto">
                            <label>${wspEsc(wspT('docQuickQuarter'))}</label>
                            <div class="wsp-quarter-row">${quarterButtons}</div>
                        </div>`}
                </div>
            </div>
        </div>

        <div class="wsp-panel">
            ${totals ? `<div class="wsp-totals">${totals}</div>` : ''}
            <div class="wsp-panel-head">
                <div>
                    <h2>${wspEsc(wspT('docResultsTitle', { period: data.period.label }))}</h2>
                    <p>${wspEsc(wspT('docResultsSubtitle', { count: window.I18n.number(documents.length) }))}</p>
                </div>
                <div class="wsp-actions">
                    <button type="button" class="wsp-btn wsp-btn-sm" ${documents.length ? '' : 'disabled'}
                        onclick="window.DocumentCentre.exportCsv(this)">${wspEsc(wspT('docExportCsv'))}</button>
                    <button type="button" class="wsp-btn wsp-btn-sm wsp-btn-primary"
                        ${documents.length && !tooManyForZip ? '' : 'disabled'}
                        onclick="window.DocumentCentre.downloadArchive(this)">${wspEsc(wspT('docDownloadAll'))}</button>
                </div>
            </div>
            ${tooManyForZip ? `<div class="wsp-panel-body" style="padding-bottom:0">
                <div class="wsp-note wsp-note-warn">${wspEsc(wspT('docTooManyForZip', { limit: window.I18n.number(data.archive_limit) }))}</div>
            </div>` : ''}
            ${documents.length ? `
                <div class="wsp-table-wrap">
                    <table class="wsp-table">
                        <thead><tr>
                            <th>${wspEsc(wspT('date'))}</th>
                            <th>${wspEsc(wspT('docDocument'))}</th>
                            <th>${wspEsc(wspT('docOrder'))}</th>
                            <th class="wsp-num">${wspEsc(wspT('amount'))}</th>
                            <th class="wsp-num">${wspEsc(wspT('docOutstanding'))}</th>
                            <th>${wspEsc(wspT('status'))}</th>
                            <th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`
                : window.Wsp.emptyState(wspT('docEmptyTitle'), wspT('docEmptyBody'))}
        </div>

        <p class="b2b-account-footer-note">${wspEsc(wspT('docDeliveryFooter', {
            email: data.preferences.effective_email
        }))} <a href="${window.APP_BASE}account/billing" class="b2b-link">${wspEsc(wspT('billingChange'))}</a></p>`;

    root.innerHTML = wspLayout(content, 'documents');
});

/* ------------------------------------------------------------------ */
/* Billing delivery preferences                                        */
/* ------------------------------------------------------------------ */

window.BillingPreferences = {
    async save(form) {
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const data = await window.Core.fetch('/workspace/billing-preferences', {
                method: 'PUT',
                body: {
                    invoice_email: form.invoice_email.value.trim(),
                    copy_email: form.copy_email.value.trim(),
                    auto_send: form.auto_send.checked,
                    reference_label: form.reference_label.value.trim(),
                    reference_required: form.reference_required.checked
                }
            });
            window.Workbench.toast(wspT('billingSaved', { email: data.preferences.effective_email }), 'success');
            window.Router.route();
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
            button.disabled = false;
        }
    }
};

window.Router.add(/^account\/billing$/, async (match, root) => {
    if (!wspRequireCustomer()) return;
    const data = await window.Core.fetch('/workspace/billing-preferences');
    const preferences = data.preferences;
    const deliveries = data.deliveries || [];

    const deliveryRows = deliveries.map(delivery => `
        <tr>
            <td>${wspEsc(window.I18n.date(delivery.created_at, { dateStyle: 'medium', timeStyle: 'short' }))}</td>
            <td><span class="wsp-code">${wspEsc(delivery.recipient)}</span>${delivery.copy_recipient
                ? `<div class="wsp-form-help">${wspEsc(wspT('billingCopyTo', { email: delivery.copy_recipient }))}</div>` : ''}</td>
            <td>${wspEsc(delivery.document_kind === 'credit_note' ? wspT('docTypeCreditNote') : wspT('docTypeInvoice'))}</td>
            <td><span class="wsp-chip wsp-chip-neutral">${wspEsc(wspT('billingQueued'))}</span></td>
        </tr>`).join('');

    const content = `
        ${wspHeader(wspT('billingDelivery'), wspT('billingIntro'))}

        <div class="wsp-panel">
            <div class="wsp-panel-head">
                <div>
                    <h2>${wspEsc(wspT('billingWhereTitle'))}</h2>
                    <p>${wspEsc(wspT('billingWhereSubtitle'))}</p>
                </div>
            </div>
            <div class="wsp-panel-body">
                <form onsubmit="event.preventDefault(); window.BillingPreferences.save(this);">
                    <div class="wsp-form-grid">
                        <div class="wsp-form-group">
                            <label for="bp-invoice-email">${wspEsc(wspT('billingInvoiceEmail'))}</label>
                            <input type="email" id="bp-invoice-email" name="invoice_email" class="wsp-input"
                                value="${wspEsc(preferences.invoice_email)}" maxlength="190"
                                placeholder="${wspEsc(preferences.account_email)}">
                            <span class="wsp-form-help">${wspEsc(wspT('billingInvoiceEmailHelp', {
                                email: preferences.account_email
                            }))}</span>
                        </div>
                        <div class="wsp-form-group">
                            <label for="bp-copy-email">${wspEsc(wspT('billingCopyEmail'))}</label>
                            <input type="email" id="bp-copy-email" name="copy_email" class="wsp-input"
                                value="${wspEsc(preferences.copy_email)}" maxlength="190">
                            <span class="wsp-form-help">${wspEsc(wspT('billingCopyEmailHelp'))}</span>
                        </div>
                        <div class="wsp-form-group">
                            <label for="bp-reference-label">${wspEsc(wspT('billingReferenceLabel'))}</label>
                            <input type="text" id="bp-reference-label" name="reference_label" class="wsp-input"
                                value="${wspEsc(preferences.reference_label)}" maxlength="80"
                                placeholder="${wspEsc(wspT('billingReferencePlaceholder'))}">
                            <span class="wsp-form-help">${wspEsc(wspT('billingReferenceHelp'))}</span>
                        </div>
                    </div>

                    <div style="margin-top:1.25rem">
                        <div class="wsp-switch-row">
                            <input type="checkbox" id="bp-auto-send" name="auto_send" ${preferences.auto_send ? 'checked' : ''}>
                            <label for="bp-auto-send" class="wsp-switch-text">
                                <strong>${wspEsc(wspT('billingAutoSend'))}</strong>
                                <span>${wspEsc(wspT('billingAutoSendHelp'))}</span>
                            </label>
                        </div>
                        <div class="wsp-switch-row">
                            <input type="checkbox" id="bp-reference-required" name="reference_required"
                                ${preferences.reference_required ? 'checked' : ''}>
                            <label for="bp-reference-required" class="wsp-switch-text">
                                <strong>${wspEsc(wspT('billingReferenceRequired'))}</strong>
                                <span>${wspEsc(wspT('billingReferenceRequiredHelp'))}</span>
                            </label>
                        </div>
                    </div>

                    <div class="wsp-actions" style="margin-top:1.25rem">
                        <button type="submit" class="wsp-btn wsp-btn-primary">${wspEsc(wspT('save'))}</button>
                        <a class="wsp-btn" href="${window.APP_BASE}account/documents">${wspEsc(wspT('documents'))}</a>
                    </div>
                </form>
            </div>
        </div>

        <div class="wsp-panel">
            <div class="wsp-panel-head">
                <div>
                    <h2>${wspEsc(wspT('billingLogTitle'))}</h2>
                    <p>${wspEsc(wspT('billingLogSubtitle'))}</p>
                </div>
            </div>
            <div class="wsp-note wsp-note-info" style="margin:0 1.25rem 1.25rem">${wspEsc(wspT('billingTestNote'))}</div>
            ${deliveries.length ? `
                <div class="wsp-table-wrap">
                    <table class="wsp-table">
                        <thead><tr>
                            <th>${wspEsc(wspT('date'))}</th>
                            <th>${wspEsc(wspT('billingRecipient'))}</th>
                            <th>${wspEsc(wspT('docDocument'))}</th>
                            <th>${wspEsc(wspT('status'))}</th>
                        </tr></thead>
                        <tbody>${deliveryRows}</tbody>
                    </table>
                </div>`
                : window.Wsp.emptyState(wspT('billingLogEmptyTitle'), wspT('billingLogEmptyBody'))}
        </div>`;

    root.innerHTML = wspLayout(content, 'billing');
});

/* ------------------------------------------------------------------ */
/* Reordering and product-page shortcuts                               */
/* ------------------------------------------------------------------ */

window.OrderWorkspace = {
    async reorder(orderId, button) {
        if (button) button.disabled = true;
        try {
            const data = await window.Core.fetch(`/workspace/orders/${orderId}/reorder`, { method: 'POST' });
            window.Wsp.applyCart(data.cart);
            window.Workbench.toast(wspT('listAdded', { count: window.I18n.number(data.added) }), 'success');
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }
};

window.ProductActions = {
    setWatchState(button, productId, watching) {
        button.textContent = wspT(watching ? 'alertStopWatching' : 'alertNotifyMe');
        button.setAttribute(
            'onclick',
            `window.ProductActions.${watching ? 'unwatch' : 'watch'}(${productId}, this)`
        );
    },

    async watch(productId, button) {
        button.disabled = true;
        try {
            await window.Core.fetch('/workspace/stock-alerts', {
                method: 'POST',
                body: { product_id: productId }
            });
            window.Workbench.toast(wspT('alertCreated'), 'success');
            this.setWatchState(button, productId, true);
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    async unwatch(productId, button) {
        button.disabled = true;
        try {
            await window.Core.fetch(`/workspace/stock-alerts/${productId}`, { method: 'DELETE' });
            window.Workbench.toast(wspT('alertRemoved'), 'success');
            this.setWatchState(button, productId, false);
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    async saveToList(productId, button) {
        const quantityField = document.getElementById('pd-qty');
        const quantity = Math.max(1, Number(quantityField?.value) || 1);
        button.disabled = true;
        try {
            const data = await window.Core.fetch('/workspace/order-lists');
            this.openListPicker(productId, quantity, Array.isArray(data.lists) ? data.lists : []);
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    openListPicker(productId, quantity, lists) {
        const options = lists
            .map(list => `<option value="${Number(list.id)}">${wspEsc(list.name)}</option>`)
            .join('');
        const body = `
            <form class="wsp-form" id="wsp-list-picker">
                ${lists.length ? `
                    <label class="wsp-field">
                        <span>${wspEsc(wspT('saveToListChoose'))}</span>
                        <select name="list_id">
                            ${options}
                            <option value="">${wspEsc(wspT('saveToListNew'))}</option>
                        </select>
                    </label>
                ` : `<p class="wsp-note">${wspEsc(wspT('saveToListNone'))}</p>`}
                <label class="wsp-field" data-new-list ${lists.length ? 'hidden' : ''}>
                    <span>${wspEsc(wspT('listCreateTitle'))}</span>
                    <input type="text" name="name" maxlength="120"
                        placeholder="${wspEsc(wspT('listNamePlaceholder'))}">
                </label>
                <label class="wsp-field">
                    <span>${wspEsc(wspT('quantity'))}</span>
                    <input type="number" name="quantity" min="1" value="${Number(quantity)}">
                </label>
                <div class="wsp-actions">
                    <button type="submit" class="btn btn-primary">${wspEsc(wspT('save'))}</button>
                </div>
            </form>`;

        const overlay = window.UI.showModal(wspT('saveToList'), body);
        const form = overlay.querySelector('#wsp-list-picker');
        const select = form.querySelector('select[name="list_id"]');
        const nameField = form.querySelector('input[name="name"]');
        const newListRow = form.querySelector('[data-new-list]');
        if (select) {
            select.onchange = () => { newListRow.hidden = select.value !== ''; };
        }

        form.onsubmit = async event => {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            const amount = Math.max(1, Number(form.querySelector('input[name="quantity"]').value) || 1);
            try {
                let listId = select ? select.value : '';
                let listName = select ? select.options[select.selectedIndex].textContent : '';
                if (!listId) {
                    const name = String(nameField.value || '').trim();
                    if (!name) {
                        window.Workbench.toast(wspT('listNameRequired'), 'error');
                        submit.disabled = false;
                        return;
                    }
                    const created = await window.Core.fetch('/workspace/order-lists', {
                        method: 'POST',
                        body: { name }
                    });
                    listId = created.list.id;
                    listName = created.list.name;
                }
                await window.Core.fetch(`/workspace/order-lists/${listId}/items`, {
                    method: 'POST',
                    body: { product_id: productId, quantity: amount }
                });
                window.UI.closeModal(overlay);
                window.Workbench.toast(wspT('saveToListCreated', { name: listName }), 'success');
            } catch (error) {
                window.Workbench.toast(error.message, 'error');
                submit.disabled = false;
            }
        };
    }
};
