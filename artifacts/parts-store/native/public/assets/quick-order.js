// Quick order: paste or type SKUs with quantities and push the whole batch
// into the cart in one pass.

(function initWorkspaceShared() {
    const Wsp = window.Wsp = window.Wsp || {};
    if (Wsp.ready) return;
    Wsp.ready = true;

    Wsp.t = (key, values) => window.I18n.t(key, values);
    Wsp.esc = value => window.Core.escapeHtml(String(value ?? ''));
    Wsp.money = (cents, currency) => window.I18n.formatMoney(cents, currency || window.Core.currency);

    /**
     * Adopt a cart returned by a workspace write, following the same order the
     * rest of the shop uses: store it, refresh the currency context, redraw the
     * badge.
     */
    Wsp.applyCart = cart => {
        if (!cart || typeof cart !== 'object') {
            window.Core.refreshCart();
            return;
        }
        window.Core.cart = cart;
        window.Core.updateCurrencyContext(cart);
        window.Core.updateCartCount();
    };

    /** Chip appearance per resolution status. */
    Wsp.lineStatus = {
        ok: { tone: 'ok', key: 'qoStatusOk' },
        raised_to_minimum: { tone: 'warn', key: 'qoStatusRaisedToMinimum' },
        reduced_to_stock: { tone: 'warn', key: 'qoStatusReducedToStock' },
        out_of_stock: { tone: 'error', key: 'qoStatusOutOfStock' },
        below_minimum: { tone: 'error', key: 'qoStatusBelowMinimum' },
        no_price: { tone: 'error', key: 'qoStatusNoPrice' },
        not_found: { tone: 'error', key: 'qoStatusNotFound' },
        ambiguous: { tone: 'warn', key: 'qoStatusAmbiguous' },
        inactive: { tone: 'error', key: 'qoStatusInactive' },
        empty: { tone: 'neutral', key: 'qoStatusEmpty' }
    };

    Wsp.chip = (status, values) => {
        const spec = Wsp.lineStatus[status] || { tone: 'neutral', key: null };
        const label = spec.key ? Wsp.t(spec.key, values) : status;
        return `<span class="wsp-chip wsp-chip-${spec.tone}">${Wsp.esc(label)}</span>`;
    };

    Wsp.orderable = line => ['ok', 'raised_to_minimum', 'reduced_to_stock'].includes(line.status)
        && Number(line.quantity) > 0;

    /** Download a generated file through the authenticated API. */
    Wsp.download = async (url, filename, button) => {
        const original = button ? button.textContent : null;
        if (button) { button.disabled = true; button.textContent = Wsp.t('preparing'); }
        try {
            const blob = await window.Core.fetch(url);
            if (!(blob instanceof Blob)) throw new Error(Wsp.t('downloadFailedGeneric'));
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            if (button) { button.disabled = false; button.textContent = original; }
        }
    };

    Wsp.productCell = product => {
        if (!product) return '';
        const image = product.image_url
            ? `<img src="${Wsp.esc(product.image_url)}" alt="" loading="lazy">`
            : '';
        return `<div class="wsp-cell-product">${image}
            <div class="wsp-cell-product-text">
                <strong><a href="${window.APP_BASE}products/${Number(product.product_id)}">${Wsp.esc(product.name)}</a></strong>
                <span>${Wsp.esc(product.sku)}</span>
            </div>
        </div>`;
    };

    Wsp.emptyState = (title, body, action = '') => `
        <div class="wsp-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <h3>${Wsp.esc(title)}</h3>
            <p>${Wsp.esc(body)}</p>
            ${action ? `<div class="wsp-actions" style="justify-content:center;margin-top:1rem">${action}</div>` : ''}
        </div>`;

    /** Shared dispatch cut-off banner; safe to call on any page. */
    Wsp.dispatchBanner = async (target) => {
        if (!target) return;
        try {
            const data = await window.Core.fetch('/workspace/dispatch-promise');
            const dispatch = data.dispatch;
            if (!dispatch) return;
            if (dispatch.ships_today) {
                const seconds = Number(dispatch.seconds_until_cutoff) || 0;
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const remaining = hours > 0
                    ? Wsp.t('cutoffRemainingHours', { hours, minutes })
                    : Wsp.t('cutoffRemainingMinutes', { minutes });
                target.innerHTML = `<span class="wsp-dispatch wsp-dispatch-today">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>
                    ${Wsp.esc(Wsp.t('cutoffShipsToday'))} <span class="wsp-dispatch-clock">${Wsp.esc(remaining)}</span>
                </span>`;
            } else {
                const date = window.I18n.date(dispatch.dispatch_date);
                target.innerHTML = `<span class="wsp-dispatch wsp-dispatch-next">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${Wsp.esc(Wsp.t('cutoffNextDispatch', { date }))}
                </span>`;
            }
        } catch (_) {
            target.innerHTML = '';
        }
    };
})();

window.QuickOrder = {
    rows: [],
    resolved: null,

    blankRow() {
        return { code: '', quantity: 1 };
    },

    ensureRows(minimum = 5) {
        while (this.rows.length < minimum) this.rows.push(this.blankRow());
    },

    readInputs() {
        document.querySelectorAll('[data-qo-code]').forEach(input => {
            const index = Number(input.dataset.qoCode);
            if (this.rows[index]) this.rows[index].code = input.value;
        });
        document.querySelectorAll('[data-qo-qty]').forEach(input => {
            const index = Number(input.dataset.qoQty);
            if (this.rows[index]) this.rows[index].quantity = Math.max(1, Number(input.value) || 1);
        });
    },

    /** Accept "SKU 5", "SKU;5", "SKU,5" and tab separated pastes. */
    parsePaste(text) {
        const parsed = [];
        text.split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;
            const match = line.match(/^(.*?)[\s;,\t]+(\d+)$/);
            if (match) {
                parsed.push({ code: match[1].trim(), quantity: Math.max(1, Number(match[2]) || 1) });
            } else {
                parsed.push({ code: line, quantity: 1 });
            }
        });
        return parsed;
    },

    applyPaste() {
        const area = document.getElementById('qo-paste');
        if (!area) return;
        const parsed = this.parsePaste(area.value);
        if (!parsed.length) {
            window.Workbench.toast(window.I18n.t('qoPasteEmpty'), 'error');
            return;
        }
        this.rows = parsed.slice(0, 250);
        this.ensureRows(Math.min(250, parsed.length + 1));
        this.resolved = null;
        area.value = '';
        this.renderGrid();
        this.setMode('grid');
        window.Workbench.toast(window.I18n.t('qoPasteApplied', { count: parsed.length }), 'success');
    },

    setMode(mode) {
        document.querySelectorAll('[data-qo-mode]').forEach(button => {
            button.classList.toggle('active', button.dataset.qoMode === mode);
        });
        const grid = document.getElementById('qo-grid-panel');
        const paste = document.getElementById('qo-paste-panel');
        if (grid) grid.hidden = mode !== 'grid';
        if (paste) paste.hidden = mode !== 'paste';
    },

    addRow() {
        this.readInputs();
        if (this.rows.length >= 250) {
            window.Workbench.toast(window.I18n.t('qoTooManyLines'), 'error');
            return;
        }
        this.rows.push(this.blankRow());
        this.renderGrid();
        const inputs = document.querySelectorAll('[data-qo-code]');
        inputs[inputs.length - 1]?.focus();
    },

    removeRow(index) {
        this.readInputs();
        this.rows.splice(index, 1);
        this.ensureRows(1);
        this.renderGrid();
    },

    clearAll() {
        this.rows = [];
        this.ensureRows(5);
        this.resolved = null;
        this.renderGrid();
        const results = document.getElementById('qo-results');
        if (results) results.innerHTML = '';
    },

    renderGrid() {
        const container = document.getElementById('qo-grid');
        if (!container) return;
        const esc = window.Wsp.esc;
        const t = window.Wsp.t;
        container.innerHTML = `
            <div class="wsp-quick-grid">
                <div class="wsp-quick-grid-head">${esc(t('qoColumnCode'))}</div>
                <div class="wsp-quick-grid-head">${esc(t('qoColumnQuantity'))}</div>
                <div></div>
                ${this.rows.map((row, index) => `
                    <input type="text" class="wsp-input wsp-input-mono" data-qo-code="${index}"
                        value="${esc(row.code)}" placeholder="${esc(t('qoCodePlaceholder'))}"
                        autocomplete="off" spellcheck="false" enterkeyhint="next">
                    <input type="number" class="wsp-input" data-qo-qty="${index}" min="1" step="1"
                        value="${Number(row.quantity) || 1}" inputmode="numeric">
                    <button type="button" class="wsp-quick-row-remove" data-qo-remove="${index}"
                        aria-label="${esc(t('qoRemoveLine', { line: index + 1 }))}">&times;</button>
                `).join('')}
            </div>`;
    },

    async resolve() {
        this.readInputs();
        const lines = this.rows
            .map((row, index) => ({ ...row, index }))
            .filter(row => String(row.code).trim() !== '');
        if (!lines.length) {
            window.Workbench.toast(window.I18n.t('qoNothingToCheck'), 'error');
            return;
        }
        const button = document.getElementById('qo-check');
        button.disabled = true;
        try {
            const data = await window.Core.fetch('/workspace/quick-order/resolve', {
                method: 'POST',
                body: { lines: lines.map(row => ({ code: row.code, quantity: row.quantity })) }
            });
            this.resolved = data;
            this.renderResults(data);
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    },

    renderResults(data) {
        const container = document.getElementById('qo-results');
        if (!container) return;
        const esc = window.Wsp.esc;
        const t = window.Wsp.t;
        const lines = data.lines || [];
        if (!lines.length) {
            container.innerHTML = '';
            return;
        }
        const problems = lines.filter(line => !window.Wsp.orderable(line)).length;
        const rows = lines.map(line => {
            const product = line.product;
            const orderable = window.Wsp.orderable(line);
            const values = {
                minimum: product ? window.I18n.number(product.minimum_quantity) : '',
                stock: product ? window.I18n.number(product.stock) : ''
            };
            const suggestions = (line.matches || []).length
                ? `<div class="wsp-form-help">${esc(t('qoDidYouMean'))} ${line.matches
                    .map(match => `<a href="${window.APP_BASE}products/${Number(match.product_id)}" class="wsp-code">${esc(match.sku)}</a>`)
                    .join(', ')}</div>`
                : '';
            return `<tr class="${orderable ? '' : 'wsp-row-error'}">
                <td>${product ? window.Wsp.productCell(product) : `<span class="wsp-code">${esc(line.code)}</span>${suggestions}`}</td>
                <td class="wsp-num">${window.I18n.number(line.quantity)}${
                    Number(line.requested_quantity) !== Number(line.quantity)
                        ? `<div class="wsp-form-help">${esc(t('qoRequested', { count: window.I18n.number(line.requested_quantity) }))}</div>`
                        : ''}</td>
                <td class="wsp-num">${product && product.price_cents !== null ? window.Wsp.money(product.price_cents, product.currency) : '—'}</td>
                <td class="wsp-num">${orderable && product && product.price_cents !== null
                    ? window.Wsp.money(product.price_cents * line.quantity, product.currency) : '—'}</td>
                <td>${window.Wsp.chip(line.status, values)}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div class="wsp-panel" style="margin-top:1.25rem">
                <div class="wsp-panel-head">
                    <div>
                        <h2>${esc(t('qoResultsTitle'))}</h2>
                        <p>${esc(t('qoResultsSubtitle', {
                            ready: window.I18n.number(data.orderable_count),
                            total: window.I18n.number(lines.length)
                        }))}</p>
                    </div>
                    ${problems ? `<span class="wsp-chip wsp-chip-warn">${esc(t('qoProblemCount', { count: window.I18n.number(problems) }))}</span>` : ''}
                </div>
                <div class="wsp-table-wrap">
                    <table class="wsp-table">
                        <thead><tr>
                            <th>${esc(t('product'))}</th>
                            <th class="wsp-num">${esc(t('quantity'))}</th>
                            <th class="wsp-num">${esc(t('unitPrice'))}</th>
                            <th class="wsp-num">${esc(t('lineTotal'))}</th>
                            <th>${esc(t('status'))}</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="wsp-summary">
                    <div>
                        <div class="wsp-summary-total">${window.Wsp.money(data.total_cents, data.currency)}</div>
                        <div class="wsp-summary-note">${esc(t('qoTotalNote'))}</div>
                    </div>
                    <div class="wsp-actions">
                        <button type="button" class="wsp-btn wsp-btn-primary" id="qo-add"
                            ${data.orderable_count ? '' : 'disabled'}>
                            ${esc(t('qoAddToCart', { count: window.I18n.number(data.orderable_count) }))}
                        </button>
                    </div>
                </div>
            </div>`;
    },

    async addToCart(button) {
        this.readInputs();
        const lines = this.rows.filter(row => String(row.code).trim() !== '');
        if (!lines.length) return;
        button.disabled = true;
        try {
            const data = await window.Core.fetch('/workspace/quick-order/add', {
                method: 'POST',
                body: { lines: lines.map(row => ({ code: row.code, quantity: row.quantity })) }
            });
            window.Wsp.applyCart(data.cart);
            window.Workbench.toast(window.I18n.t('qoAdded', { count: window.I18n.number(data.added) }), 'success');
            this.resolved = { ...data, orderable_count: 0 };
            this.clearAll();
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
            button.disabled = false;
        }
    }
};

document.addEventListener('click', event => {
    const remove = event.target.closest('[data-qo-remove]');
    if (remove) { window.QuickOrder.removeRow(Number(remove.dataset.qoRemove)); return; }
    const mode = event.target.closest('[data-qo-mode]');
    if (mode) { window.QuickOrder.setMode(mode.dataset.qoMode); return; }
    if (event.target.closest('#qo-add-row')) { window.QuickOrder.addRow(); return; }
    if (event.target.closest('#qo-clear')) { window.QuickOrder.clearAll(); return; }
    if (event.target.closest('#qo-check')) { window.QuickOrder.resolve(); return; }
    if (event.target.closest('#qo-apply-paste')) { window.QuickOrder.applyPaste(); return; }
    const add = event.target.closest('#qo-add');
    if (add) { window.QuickOrder.addToCart(add); }
});

document.addEventListener('keydown', event => {
    const input = event.target.closest('[data-qo-code]');
    if (!input || event.key !== 'Enter') return;
    event.preventDefault();
    const index = Number(input.dataset.qoCode);
    const next = document.querySelector(`[data-qo-code="${index + 1}"]`);
    if (next) {
        next.focus();
    } else {
        window.QuickOrder.addRow();
    }
});

window.Router.add(/^quick-order$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    if (window.Core.user.role === 'staff') return window.Router.navigate(window.APP_BASE + 'catalog');

    const esc = window.Wsp.esc;
    const t = window.Wsp.t;
    window.QuickOrder.rows = [];
    window.QuickOrder.ensureRows(5);
    window.QuickOrder.resolved = null;

    root.innerHTML = `
        <div class="wsp-page">
            <div class="wsp-page-head">
                <h1>${esc(t('quickOrder'))}</h1>
                <p>${esc(t('quickOrderIntro'))}</p>
                <div id="qo-dispatch" style="margin-top:0.9rem"></div>
            </div>

            <div class="wsp-panel">
                <div class="wsp-panel-head">
                    <div class="wsp-tabs">
                        <button type="button" class="wsp-tab active" data-qo-mode="grid">${esc(t('qoModeGrid'))}</button>
                        <button type="button" class="wsp-tab" data-qo-mode="paste">${esc(t('qoModePaste'))}</button>
                    </div>
                    <div class="wsp-actions">
                        <button type="button" class="wsp-btn wsp-btn-sm wsp-btn-quiet" id="qo-clear">${esc(t('qoClear'))}</button>
                    </div>
                </div>

                <div class="wsp-panel-body" id="qo-grid-panel">
                    <div id="qo-grid"></div>
                    <div class="wsp-actions" style="margin-top:1rem">
                        <button type="button" class="wsp-btn wsp-btn-sm" id="qo-add-row">+ ${esc(t('qoAddRow'))}</button>
                        <button type="button" class="wsp-btn wsp-btn-primary" id="qo-check">${esc(t('qoCheck'))}</button>
                    </div>
                </div>

                <div class="wsp-panel-body" id="qo-paste-panel" hidden>
                    <label for="qo-paste" class="wsp-form-group" style="display:block;margin-bottom:0.5rem">
                        <span style="font-size:0.875rem;font-weight:560">${esc(t('qoPasteLabel'))}</span>
                    </label>
                    <textarea id="qo-paste" class="wsp-paste-area" spellcheck="false"
                        placeholder="${esc(t('qoPastePlaceholder'))}"></textarea>
                    <p class="wsp-form-help" style="margin-top:0.5rem">${esc(t('qoPasteHelp'))}</p>
                    <div class="wsp-actions" style="margin-top:0.85rem">
                        <button type="button" class="wsp-btn wsp-btn-primary" id="qo-apply-paste">${esc(t('qoPasteApply'))}</button>
                    </div>
                </div>
            </div>

            <div id="qo-results"></div>
        </div>`;

    window.QuickOrder.renderGrid();
    window.Wsp.dispatchBanner(document.getElementById('qo-dispatch'));
});
