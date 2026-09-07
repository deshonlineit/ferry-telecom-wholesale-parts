// Account area: Profile, Addresses, Orders, Returns, Buyback

(function initWorkbench() {
    window.Workbench = window.Workbench || {};
    if (!window.Workbench.toast) {
        window.Workbench.toast = (msg, type = 'info') => {
            let container = document.getElementById('wb-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'wb-toast-container';
                document.body.appendChild(container);
            }
            const t = document.createElement('div');
            t.className = `wb-toast wb-toast-${type}`;
            t.textContent = msg;
            container.appendChild(t);
            setTimeout(() => {
                t.style.opacity = '0';
                t.style.transition = 'opacity 0.2s';
                setTimeout(() => t.remove(), 200);
            }, 3000);
        };
        
        window.Workbench.statusMap = {
            'on_hold': { label: 'onHold', badge: 'warning' },
            'processing': { label: 'processing', badge: 'warning' }, 'shipped': { label: 'shipped', badge: 'info' },
            'completed': { label: 'completed', badge: 'success' }, 'cancelled': { label: 'cancelled', badge: 'danger' },
            'submitted': { label: 'submitted', badge: 'warning' }, 'received': { label: 'received', badge: 'info' },
            'assessed': { label: 'assessed', badge: 'info' }, 'approved': { label: 'approved', badge: 'success' },
            'rejected': { label: 'rejected', badge: 'danger' }, 'credited': { label: 'credited', badge: 'success' },
            'active': { label: 'active', badge: 'success' }, 'pending': { label: 'pending', badge: 'warning' },
            'blocked': { label: 'blocked', badge: 'danger' }, 'isolated': { label: 'isolated', badge: 'success' }
        };
        
        window.Workbench.badge = (status, defaultLabel) => {
            if (!status && defaultLabel) return `<span class="wb-badge wb-badge-neutral">${window.Core.escapeHtml(defaultLabel)}</span>`;
            const s = window.Workbench.statusMap[status];
            if (s) return `<span class="wb-badge wb-badge-${s.badge}">${window.Core.escapeHtml(window.I18n.t(s.label))}</span>`;
            return `<span class="wb-badge wb-badge-neutral">${window.Core.escapeHtml(status || '')}</span>`;
        };
    }
})();

const accountT = (key, values) => window.I18n.t(key, values);
const accountDate = value => window.I18n.date(value);
const accountDateTime = value => window.I18n.date(value, {dateStyle: 'medium', timeStyle: 'short'});
const accountMoney = (cents, currency) => window.I18n.formatMoney(cents, currency);
const accountStatus = status => window.I18n.t(window.Workbench.statusMap[status]?.label || status);
const accountPaymentMethod = method => window.I18n.t({
    swiss_qr_invoice: 'swissQrInvoice',
    pay_later: 'payLater',
    test_invoice: 'legacyTestInvoice',
    test_card: 'legacyTestCard'
}[method] || method);
const accountShippingMethod = order => window.I18n.t({
    swiss_post_priority: 'swissPostPriority',
    swiss_post_saturday: 'swissPostSaturday',
    pickup: 'pickup',
    ups_standard: 'upsStandard',
    ups_express: 'upsExpress'
}[order.shipping_method_code] || order.shipping_method_name || 'shipping');

const accountLayout = (content, activeRoute) => `
    <div class="layout-sidebar">
        <aside>
            <div class="card">
                <h3 class="form-section-title" style="margin-top:0.5rem; margin-bottom:1rem;">${accountT('myAccount')}</h3>
                <div class="sidebar-nav">
                    <a href="${window.APP_BASE}account" class="${activeRoute === 'profile' ? 'active' : ''}">${accountT('profile')}</a>
                    <a href="${window.APP_BASE}account/addresses" class="${activeRoute === 'addresses' ? 'active' : ''}">${accountT('addresses')}</a>
                    <a href="${window.APP_BASE}account/orders" class="${activeRoute === 'orders' ? 'active' : ''}">${accountT('orders')}</a>
                    <a href="${window.APP_BASE}account/returns" class="${activeRoute === 'returns' ? 'active' : ''}">${accountT('returns')}</a>
                    <a href="${window.APP_BASE}account/buyback" class="${activeRoute === 'buyback' ? 'active' : ''}">${accountT('screenBuyback')}</a>
                </div>
            </div>
        </aside>
        <div>${content}</div>
    </div>
`;

window.downloadPdf = async (url) => {
    try {
        const blob = await window.Core.fetch(url, { method: 'GET' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = url.split('/').pop();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch(e) { window.Workbench.toast(accountT('pdfDownloadFailed', {message: e.message}), 'error'); }
};

window.Router.add(/^account$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    if (window.Core.user.role === 'staff') return window.Router.navigate(window.APP_BASE + 'admin');
    const data = await window.Core.fetch('/profile');
    const u = data.user;
    const esc = window.Core.escapeHtml;

    const content = `
        <div class="page-header">
            <h1>${accountT('profile')}</h1>
        </div>
        <div class="card">
            <form id="profile-form">
                <div class="form-section">
                    <h3 class="form-section-title">${accountT('personalDetails')}</h3>
                    <div class="form-group">
                        <label>${accountT('signInEmail')}</label>
                        <input type="email" class="form-control" value="${esc(u.email)}" disabled style="background: var(--wb-bg); color: var(--wb-text-muted);">
                        <small class="text-muted" style="display:block; margin-top:0.25rem;">${accountT('emailChangeSupport')}</small>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>${accountT('fullName')}</label>
                            <input type="text" name="name" class="form-control" value="${esc(u.name)}" required>
                        </div>
                        <div class="form-group">
                            <label>${accountT('companyName')}</label>
                            <input type="text" name="company" class="form-control" value="${esc(u.company)}" required>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn">${accountT('saveChanges')}</button>
            </form>
        </div>
    `;
    
    root.innerHTML = accountLayout(content, 'profile');

    document.getElementById('profile-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/profile', {
                method: 'PATCH',
                body: { name: e.target.name.value, company: e.target.company.value }
            });
            window.Workbench.toast(accountT('profileSaved'), 'success');
        } catch(err) { window.Workbench.toast(err.message, 'error'); }
    };
});

window.Router.add(/^account\/addresses$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const data = await window.Core.fetch('/addresses');
    const esc = window.Core.escapeHtml;
    
    const addrHtml = data.addresses.map(a => `
        <div class="card" style="margin-bottom:1rem">
            <div style="display:flex; justify-content:space-between; align-items:flex-start">
                <div>
                    <div class="data-value" style="font-weight:600; font-size:1rem; margin-bottom:0.25rem; display:flex; align-items:center; gap:0.5rem;">
                        ${esc(a.label)} ${a.is_default ? '<span class="wb-badge wb-badge-success">' + accountT('default') + '</span>' : ''}
                    </div>
                    <div style="color:var(--wb-text-muted); font-size:0.875rem; line-height:1.5">
                        ${a.company ? '<strong>' + esc(a.company) + '</strong><br>' : ''}
                        ${accountT('attentionOf')} ${esc(a.name)}<br>
                        ${esc(a.line1)} ${a.line2 ? esc(a.line2) : ''}<br>
                        ${esc(a.postal_code)} ${esc(a.city)}<br>
                        ${esc(a.country)}
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem">
                    <button type="button" class="btn btn-outline btn-sm action-edit-addr" data-id="${a.id}" aria-label="${accountT('editAddress')}">${accountT('edit')}</button>
                    <button type="button" class="btn btn-danger btn-sm action-del-addr" data-id="${a.id}" aria-label="${accountT('removeAddress')}">${accountT('remove')}</button>
                </div>
            </div>
        </div>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>${accountT('addresses')}</h1>
            <button type="button" class="btn action-new-addr">${accountT('addNewAddress')}</button>
        </div>
        ${data.addresses.length ? addrHtml : '<div class="alert">' + accountT('noAddresses') + '</div>'}
    `;
    
    root.innerHTML = accountLayout(content, 'addresses');
    
    const delBtns = root.querySelectorAll('.action-del-addr');
    delBtns.forEach(btn => btn.addEventListener('click', async (e) => {
        if(!confirm(accountT('removeAddressConfirm'))) return;
        try {
            await window.Core.fetch(`/addresses/${e.currentTarget.dataset.id}`, { method: 'DELETE' });
            window.Workbench.toast(accountT('addressRemoved'), 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); }
    }));

    const editAddress = (id = null) => {
        let addr = { label:'', name:'', company:'', line1:'', line2:'', postal_code:'', city:'', country: window.Core.country || 'CH', is_default:0 };
        if (id) addr = data.addresses.find(a => a.id === id);
        
        const html = `
            <form id="addr-form">
                <div class="form-section" style="border:none; padding:0;">
                    <div class="form-group"><label>${accountT('addressLabel')}</label><input type="text" name="label" value="${esc(addr.label)}" class="form-control" placeholder="${accountT('addressLabelPlaceholder')}" required></div>
                    <div class="form-group"><label>${accountT('attentionContact')}</label><input type="text" name="name" value="${esc(addr.name)}" class="form-control" required></div>
                    <div class="form-group"><label>${accountT('streetBuilding')}</label><input type="text" name="line1" value="${esc(addr.line1)}" class="form-control" required></div>
                    <div class="grid-cols-2">
                        <div class="form-group"><label>${accountT('postcode')}</label><input type="text" name="postal_code" value="${esc(addr.postal_code)}" class="form-control" required></div>
                        <div class="form-group"><label>${accountT('townCity')}</label><input type="text" name="city" value="${esc(addr.city)}" class="form-control" required></div>
                    </div>
                    <div class="form-group">
                        <label>${accountT('deliveryCountry')}</label>
                        <select name="country" class="form-control" required>${window.BuyerCurrency.options(addr.country)}</select>
                        <small class="text-muted">${accountT('currencyCountryNote')}</small>
                    </div>
                    
                    <details class="wb-details" ${addr.company || addr.line2 ? 'open' : ''}>
                        <summary>${accountT('optionalAddressFields')}</summary>
                        <div class="wb-details-content">
                            <div class="form-group"><label>${accountT('companyName')}</label><input type="text" name="company" value="${esc(addr.company)}" class="form-control"></div>
                            <div class="form-group" style="margin-bottom:0"><label>${accountT('addressLine2')}</label><input type="text" name="line2" value="${esc(addr.line2)}" class="form-control"></div>
                        </div>
                    </details>
                    
                    <div class="form-group" style="margin-top:1.5rem">
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                            <input type="checkbox" name="is_default" value="1" ${addr.is_default ? 'checked' : ''}>
                            ${accountT('setDefaultAddress')}
                        </label>
                    </div>
                </div>
                <button type="submit" class="btn" style="width:100%; margin-top:1rem;">${accountT(id ? 'updateAddress' : 'addAddress')}</button>
            </form>
        `;
        const overlay = window.UI.showModal(accountT(id ? 'editAddress' : 'newAddress'), html);
        
        document.getElementById('addr-form').onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = Object.fromEntries(fd.entries());
            payload.is_default = fd.get('is_default') ? 1 : 0;
            
            try {
                await window.Core.fetch(id ? `/addresses/${id}` : '/addresses', {
                    method: id ? 'PATCH' : 'POST',
                    body: payload
                });
                window.UI.closeModal(overlay);
                window.Workbench.toast(accountT('addressSaved'), 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); }
        };
    };

    root.querySelectorAll('.action-edit-addr').forEach(b => b.addEventListener('click', (e) => editAddress(parseInt(e.currentTarget.dataset.id, 10))));
    root.querySelector('.action-new-addr').addEventListener('click', () => editAddress());
});

window.Router.add(/^account\/orders$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const data = await window.Core.fetch('/orders');
    const esc = window.Core.escapeHtml;
    
    const rows = data.orders.map(o => `
        <tr>
            <td><a href="${window.APP_BASE}account/orders/${o.id}" style="font-weight:600">${esc(o.number)}</a></td>
            <td>${accountDate(o.created_at)}</td>
            <td>${window.Workbench.badge(o.status)}</td>
            <td>${accountMoney(o.total_cents, o.currency || 'CHF')}<br><small class="text-muted">${esc(o.currency || 'CHF')}</small></td>
            <td>
                <a href="${window.APP_BASE}account/orders/${o.id}" class="btn btn-sm btn-outline">${accountT('details')}</a>
            </td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>${accountT('orders')}</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>${accountT('orderNumber')}</th><th>${accountT('date')}</th><th>${accountT('status')}</th><th>${accountT('total')}</th><th>${accountT('action')}</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding: 2rem;">' + accountT('noOrders') + '</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = accountLayout(content, 'orders');
});

window.Router.add(/^account\/orders\/(\d+)$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const id = match[1];
    const esc = window.Core.escapeHtml;
    
    try {
        const data = await window.Core.fetch(`/orders/${id}`);
        const o = data.order;
        const orderCurrency = o.currency || 'CHF';
        
        const itemsHtml = data.items.map(i => `
            <tr>
                <td><div style="font-size:0.75rem; color:var(--wb-text-muted)">${esc(i.sku)}</div><div style="font-weight:500">${esc(i.name)}</div></td>
                <td>${accountMoney(i.price_cents, orderCurrency)}</td>
                <td>${i.quantity}</td>
                <td style="text-align:right">${accountMoney(i.total_cents, orderCurrency)}</td>
                <td style="text-align:right">
                    ${(o.status === 'shipped' || o.status === 'completed') ? `<button type="button" class="btn btn-sm btn-outline action-return" data-itemid="${i.id}" data-max="${i.quantity}" data-name="${esc(i.name)}">${accountT('return')}</button>` : ''}
                </td>
            </tr>
        `).join('');

        const addr = o.address_json ? JSON.parse(o.address_json) : {};

        const content = `
            <div style="margin-bottom:1.5rem"><a href="${window.APP_BASE}account/orders" class="btn btn-outline btn-sm" aria-label="${accountT('backToOrders')}">&larr; ${accountT('backToOverview')}</a></div>
            
            <div class="page-header">
                <h1>${accountT('order', {number: esc(o.number)})}</h1>
                <div class="page-actions">
                    <button class="btn btn-outline" aria-label="${accountT('downloadInvoice')}" onclick="downloadPdf('/documents/${o.id}/invoice.pdf')">${accountT('invoicePdf')}</button>
                    <button class="btn btn-outline" aria-label="${accountT('downloadPackingSlip')}" onclick="downloadPdf('/documents/${o.id}/packing-slip.pdf')">${accountT('packingSlipPdf')}</button>
                </div>
            </div>
            
            <div class="grid-cols-2" style="margin-bottom:1.5rem">
                <div class="card">
                    <h3 class="form-section-title">${accountT('deliveryAddress')}</h3>
                    <div style="font-size:0.875rem; line-height:1.6; color:var(--wb-text);">
                        ${addr.company ? '<strong>'+esc(addr.company)+'</strong><br>' : ''}
                        ${esc(addr.name)}<br>
                        ${esc(addr.line1)} ${addr.line2 ? esc(addr.line2) : ''}<br>
                        ${esc(addr.postal_code)} ${esc(addr.city)}<br>
                        ${esc(addr.country)}
                    </div>
                </div>
                <div class="card">
                    <h3 class="form-section-title">${accountT('orderInformation')}</h3>
                    <table style="width:100%; font-size:0.875rem; line-height:2;">
                        <tr><td style="color:var(--wb-text-muted); width:120px;">${accountT('date')}:</td><td><strong>${accountDate(o.created_at)}</strong></td></tr>
                        <tr><td style="color:var(--wb-text-muted)">${accountT('status')}:</td><td>${window.Workbench.badge(o.status)}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">${accountT('tracking')}:</td><td>${o.tracking ? `<a href="${esc(o.tracking)}" target="_blank" style="font-weight:500;">${accountT('trackParcel')}</a>` : '-'}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">${accountT('paymentMethod')}:</td><td>${esc(accountPaymentMethod(o.payment_method))}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">${accountT('shippingMethod')}:</td><td>${esc(accountShippingMethod(o))}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">${accountT('currency')}:</td><td><strong>${esc(orderCurrency)}</strong></td></tr>
                    </table>
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>${accountT('product')}</th><th>${accountT('price')}</th><th>${accountT('quantity')}</th><th style="text-align:right">${accountT('total')}</th><th style="text-align:right">${accountT('action')}</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div style="padding:1.5rem; background:var(--wb-bg); text-align:right; border-top:1px solid var(--wb-border-light)">
                    <div style="margin-bottom:0.25rem; font-size:0.875rem; color:var(--wb-text-muted)">${accountT('subtotalExVat')}: <span style="display:inline-block; width:100px; color:var(--wb-text)">${accountMoney(o.subtotal_cents, orderCurrency)}</span></div>
                    <div style="margin-bottom:0.25rem; font-size:0.875rem; color:var(--wb-text-muted)">${accountT('shippingExVat')}: <span style="display:inline-block; width:100px; color:var(--wb-text)">${accountMoney(o.shipping_cents, orderCurrency)}</span></div>
                    <div style="margin-bottom:0.25rem; font-size:0.875rem; color:var(--wb-text-muted)">${accountT('vat')}: <span style="display:inline-block; width:100px; color:var(--wb-text)">${accountMoney(o.tax_cents, orderCurrency)}</span></div>
                    <div style="font-size:1.125rem; font-weight:700; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--wb-border);">${accountT('totalInclVat')} (${esc(orderCurrency)}): <span style="display:inline-block; width:100px;">${accountMoney(o.total_cents, orderCurrency)}</span></div>
                </div>
            </div>
            
            <div class="card" style="margin-top:2rem">
                <h3 class="form-section-title">${accountT('orderHistory')}</h3>
                <ul style="padding-left:1.5rem; font-size:0.875rem; margin-bottom:0;">
                    ${data.events.map(e => `<li style="margin-bottom:0.5rem"><strong>${accountDateTime(e.created_at)}</strong> - ${accountT('statusChangedTo')}: <strong>${accountStatus(e.status)}</strong>. ${e.note ? `<br><span style="color:var(--wb-text-muted)">${esc(e.note)}</span>` : ''}</li>`).join('')}
                </ul>
            </div>
        `;
        root.innerHTML = accountLayout(content, 'orders');
        
        const startReturn = (orderId, itemId, maxQty, itemName) => {
            const html = `
                <form id="return-form">
                    <p style="margin-bottom:1.5rem; padding:1rem; background:var(--wb-bg); border-radius:var(--wb-radius); font-size:0.875rem;">
                        ${accountT('returnFor')}:<br><strong style="font-size:1rem">${itemName}</strong>
                    </p>
                    <div class="form-group">
                        <label>${accountT('quantityToReturn', {count: maxQty})}</label>
                        <input type="number" name="quantity" min="1" max="${maxQty}" value="${maxQty}" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>${accountT('returnReason')}</label>
                        <textarea name="reason" class="form-control" rows="3" placeholder="${accountT('returnReasonPlaceholder')}" required></textarea>
                    </div>
                    <button type="submit" class="btn" style="width:100%; margin-top:1rem;">${accountT('submitReturn')}</button>
                </form>
            `;
            const overlay = window.UI.showModal(accountT('returnItem'), html);
            
            document.getElementById('return-form').onsubmit = async (e) => {
                e.preventDefault();
                const qty = parseInt(e.target.quantity.value, 10);
                const reason = e.target.reason.value;
                try {
                    const res = await window.Core.fetch('/returns', {
                        method: 'POST',
                        body: { order_id: orderId, reason: reason, items: [{ order_item_id: itemId, quantity: qty }] }
                    });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast(accountT('returnSubmitted'), 'success');
                    window.Router.navigate(window.APP_BASE + 'account/returns/' + res.return.id);
                } catch(err) { window.Workbench.toast(err.message, 'error'); }
            };
        };

        const returnBtns = root.querySelectorAll('.action-return');
        returnBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.currentTarget;
                startReturn(o.id, parseInt(b.dataset.itemid,10), parseInt(b.dataset.max,10), b.dataset.name);
            });
        });

    } catch(err) {
        root.innerHTML = accountLayout(`<div class="alert error">${esc(err.message)}</div>`, 'orders');
    }
});

window.Router.add(/^account\/returns$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const data = await window.Core.fetch('/returns');
    const esc = window.Core.escapeHtml;
    
    const rows = data.returns.map(r => `
        <tr>
            <td><a href="${window.APP_BASE}account/returns/${r.id}" style="font-weight:600">${esc(r.number)}</a></td>
            <td>${accountDate(r.created_at)}</td>
            <td><a href="${window.APP_BASE}account/orders/${r.order_id}">${accountT('order', {number: r.order_id})}</a></td>
            <td>${window.Workbench.badge(r.status)}</td>
            <td>${accountMoney(r.credit_cents, r.currency || r.order_currency || 'CHF')}<br><small class="text-muted">${esc(r.currency || r.order_currency || 'CHF')}</small></td>
            <td><a href="${window.APP_BASE}account/returns/${r.id}" class="btn btn-sm btn-outline">${accountT('details')}</a></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>${accountT('returns')} (RMA)</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>${accountT('rmaNumber')}</th><th>${accountT('date')}</th><th>${accountT('order')}</th><th>${accountT('status')}</th><th>${accountT('credited')}</th><th>${accountT('action')}</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center; padding:2rem;">' + accountT('noReturns') + '</td></tr>'}</tbody>
            </table>
        </div>
        <p class="text-muted" style="margin-top:1rem; font-size:0.875rem;">${accountT('returnInstructions')}</p>
    `;
    root.innerHTML = accountLayout(content, 'returns');
});

window.Router.add(/^account\/returns\/(\d+)$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const id = match[1];
    const esc = window.Core.escapeHtml;
    try {
        const data = await window.Core.fetch(`/returns/${id}`);
        const r = data.return;
        const returnCurrency = r.currency || r.order_currency || data.order?.currency || 'CHF';
        const itemsHtml = data.items.map(i => `
            <tr>
                <td style="font-weight:500">${esc(i.name)}</td>
                <td>${accountMoney(i.price_cents, returnCurrency)}</td>
                <td>${i.quantity}</td>
            </tr>
        `).join('');

        const content = `
            <div style="margin-bottom:1.5rem"><a href="${window.APP_BASE}account/returns" class="btn btn-outline btn-sm">&larr; ${accountT('backToOverview')}</a></div>
            
            <div class="page-header">
                <h1>${accountT('returnNumber', {number: esc(r.number)})}</h1>
                ${r.status === 'credited' ? `
                    <div class="page-actions">
                        <button class="btn btn-outline" aria-label="${accountT('downloadCreditNote')}" onclick="downloadPdf('/documents/returns/${r.id}/credit-note.pdf')">${accountT('creditNotePdf')}</button>
                    </div>
                ` : ''}
            </div>
            
            <div class="card" style="margin-bottom:1.5rem">
                <div class="grid-cols-2" style="margin-bottom:1rem;">
                    <div><div class="data-label">${accountT('status')}</div><div class="data-value">${window.Workbench.badge(r.status)}</div></div>
                    <div><div class="data-label">${accountT('applicationDate')}</div><div class="data-value">${accountDate(r.created_at)}</div></div>
                </div>
                <div style="border-top:1px solid var(--wb-border-light); padding-top:1rem;">
                    <div class="data-label">${accountT('reasonProvided')}</div>
                    <div class="data-value" style="margin-bottom:0;">${esc(r.reason)}</div>
                    ${r.note ? `<div class="data-label" style="margin-top:1rem;">${accountT('supportNote')}</div><div class="data-value" style="margin-bottom:0;">${esc(r.note)}</div>` : ''}
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>${accountT('product')}</th><th>${accountT('price')}</th><th>${accountT('quantity')}</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div style="padding:1.5rem; background:var(--wb-bg); text-align:right; border-top:1px solid var(--wb-border-light);">
                    <div style="font-size:1.125rem; font-weight:700; color:var(--wb-success)">${accountT('totalCredited', {currency: esc(returnCurrency)})}: ${accountMoney(r.credit_cents, returnCurrency)}</div>
                </div>
            </div>
            
            <div class="card" style="margin-top:2rem">
                <h3 class="form-section-title">${accountT('history')}</h3>
                <ul style="padding-left:1.5rem; font-size:0.875rem; margin-bottom:0;">
                    ${data.events.map(e => `<li style="margin-bottom:0.5rem"><strong>${accountDateTime(e.created_at)}</strong> - ${accountT('status')}: <strong>${accountStatus(e.status)}</strong>. ${e.note ? `<br><span style="color:var(--wb-text-muted)">${esc(e.note)}</span>` : ''}</li>`).join('')}
                </ul>
            </div>
        `;
        root.innerHTML = accountLayout(content, 'returns');
    } catch(err) {
        root.innerHTML = accountLayout(`<div class="alert error">${esc(err.message)}</div>`, 'returns');
    }
});

window.Router.add(/^account\/buyback$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const data = await window.Core.fetch('/buyback/requests');
    const esc = window.Core.escapeHtml;
    
    const rows = data.requests.map(r => `
        <tr>
            <td style="font-weight:600">${esc(r.number)}</td>
            <td>${accountDate(r.created_at)}</td>
            <td>${window.Workbench.badge(r.status)}</td>
            <td>${accountMoney(r.total_cents, r.currency || data.currency || 'CHF')}</td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>${accountT('screenBuyback')}</h1>
            <button type="button" class="btn action-new-bb">${accountT('submitNewBuyback')}</button>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>${accountT('applicationNumber')}</th><th>${accountT('date')}</th><th>${accountT('status')}</th><th>${accountT('estimatedValue')}</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center; padding:2rem;">' + accountT('noBuybacks') + '</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = accountLayout(content, 'buyback');
    
    const startBuyback = async () => {
        try {
            const bbData = await window.Core.fetch('/buyback');
            const items = bbData.items;
            
            const tableRows = items.map(i => `
                <tr>
                    <td style="font-weight:500">${esc(i.model)}</td>
                    <td>${esc(i.grade)}</td>
                    <td>${accountMoney(i.price_cents, i.currency || bbData.currency || 'CHF')}</td>
                    <td style="width:100px; padding:0.25rem 0.5rem;"><input type="number" class="form-control" name="qty_${i.id}" value="0" min="0" style="padding:0.25rem; font-size:0.875rem;"></td>
                </tr>
            `).join('');
            
            const html = `
                <form id="bb-form">
                    <p style="margin-bottom:1rem; font-size:0.875rem;">${accountT('buybackIntro')}</p>
                    <div style="max-height:350px; overflow-y:auto; border:1px solid var(--wb-border-light); border-radius:var(--wb-radius); margin-bottom:1.5rem;">
                        <table class="data-table" style="margin:0; border:none;">
                            <thead style="position:sticky; top:0; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);"><tr><th>${accountT('model')}</th><th>${accountT('grade')}</th><th>${accountT('unitPrice')}</th><th>${accountT('quantity')}</th></tr></thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                    <details class="wb-details">
                        <summary>${accountT('addOptionalNote')}</summary>
                        <div class="wb-details-content">
                            <textarea name="notes" class="form-control" rows="2" placeholder="${accountT('buybackNotePlaceholder')}"></textarea>
                        </div>
                    </details>
                    <button type="submit" class="btn" style="width:100%; margin-top:1rem;">${accountT('submitApplication')}</button>
                </form>
            `;
            const overlay = window.UI.showModal(accountT('newBuybackApplication'), html);
            
            document.getElementById('bb-form').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const payloadItems = [];
                items.forEach(i => {
                    const qty = parseInt(fd.get(`qty_${i.id}`), 10);
                    if (qty > 0) payloadItems.push({ item_id: i.id, quantity: qty });
                });
                if (payloadItems.length === 0) return window.Workbench.toast(accountT('buybackQuantityRequired'), 'warning');
                
                try {
                    await window.Core.fetch('/buyback/requests', {
                        method: 'POST',
                        body: { items: payloadItems, notes: fd.get('notes') }
                    });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast(accountT('buybackSubmitted'), 'success');
                    window.Router.route();
                } catch(err) { window.Workbench.toast(err.message, 'error'); }
            };

        } catch(e) { window.Workbench.toast(e.message, 'error'); }
    };
    
    root.querySelector('.action-new-bb').addEventListener('click', startBuyback);
});
