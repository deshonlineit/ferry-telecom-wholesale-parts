// Account area: Profile, Addresses, Orders, Returns

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
            ,'authorized': { label: 'paymentAuthorized', badge: 'info' }, 'paid': { label: 'paymentPaid', badge: 'success' },
            'failed': { label: 'paymentFailed', badge: 'danger' }, 'refunded': { label: 'paymentRefunded', badge: 'neutral' },
            'open': { label: 'invoiceOpen', badge: 'warning' }
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
const accountPaymentState = state => window.Workbench.badge(state, accountT('paymentPending'));
const accountFulfillmentState = order => order.status === 'on_hold' && order.payment_method === 'stripe'
    ? window.Workbench.badge(null, accountT('orderReceived'))
    : window.Workbench.badge(order.status);

const accountLayout = (content, activeRoute) => `
    <div class="b2b-account-wrapper container">
        <aside class="b2b-account-sidebar">
            <h2 class="b2b-account-title">${accountT('myAccount')}</h2>
            <nav class="b2b-account-nav">
                <a href="${window.APP_BASE}account" class="b2b-account-nav-link ${activeRoute === 'profile' ? 'active' : ''}">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span>${accountT('profile')}</span>
                </a>
                <a href="${window.APP_BASE}account/addresses" class="b2b-account-nav-link ${activeRoute === 'addresses' ? 'active' : ''}">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span>${accountT('addresses')}</span>
                </a>
                <a href="${window.APP_BASE}account/orders" class="b2b-account-nav-link ${activeRoute === 'orders' ? 'active' : ''}">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <span>${accountT('orders')}</span>
                </a>
                <a href="${window.APP_BASE}account/returns" class="b2b-account-nav-link ${activeRoute === 'returns' ? 'active' : ''}">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                    <span>${accountT('returns')}</span>
                </a>
            </nav>
        </aside>
        <main class="b2b-account-main">
            ${content}
        </main>
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
        <header class="b2b-account-header">
            <div class="b2b-account-header-text">
                <h1>${accountT('profile')}</h1>
                <p>${accountT('personalDetails')}</p>
            </div>
        </header>
        <div class="b2b-card">
            <form id="profile-form" class="b2b-form">
                <div class="b2b-form-section">
                    <div class="b2b-form-row readonly-field">
                        <div class="b2b-form-label-col">
                            <label>${accountT('signInEmail')}</label>
                        </div>
                        <div class="b2b-form-input-col">
                            <div class="b2b-locked-input">
                                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                <span>${esc(u.email)}</span>
                            </div>
                            <p class="b2b-form-help">${accountT('emailChangeSupport')}</p>
                        </div>
                    </div>

                    <div class="b2b-form-row">
                        <div class="b2b-form-label-col">
                            <label for="profile-name">${accountT('fullName')}</label>
                        </div>
                        <div class="b2b-form-input-col">
                            <input type="text" id="profile-name" name="name" class="b2b-input" value="${esc(u.name)}" required>
                        </div>
                    </div>

                    <div class="b2b-form-row">
                        <div class="b2b-form-label-col">
                            <label for="profile-company">${accountT('companyName')}</label>
                        </div>
                        <div class="b2b-form-input-col">
                            <input type="text" id="profile-company" name="company" class="b2b-input" value="${esc(u.company)}" required>
                        </div>
                    </div>
                </div>

                <div class="b2b-form-actions">
                    <button type="submit" class="b2b-btn b2b-btn-primary">${accountT('saveChanges')}</button>
                </div>
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

// End customer account routes.
window.Router.add(/^account\/addresses$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    const data = await window.Core.fetch('/addresses');
    const esc = window.Core.escapeHtml;
    
    const addrHtml = data.addresses.map(a => `
        <div class="b2b-address-card">
            <div class="b2b-address-card-content">
                <div class="b2b-address-header">
                    <h3 class="b2b-address-label">${esc(a.label)}</h3>
                    ${a.is_default ? '<span class="b2b-badge b2b-badge-success">' + accountT('default') + '</span>' : ''}
                </div>
                <address class="b2b-address-body">
                    ${a.company ? '<strong class="b2b-address-company">' + esc(a.company) + '</strong><br>' : ''}
                    <span class="b2b-address-name">${accountT('attentionOf')} ${esc(a.name)}</span><br>
                    ${esc(a.line1)} ${a.line2 ? esc(a.line2) : ''}<br>
                    ${esc(a.postal_code)} ${esc(a.city)}<br>
                    ${esc(a.country)}
                </address>
            </div>
            <div class="b2b-address-actions">
                <button type="button" class="b2b-btn b2b-btn-outline action-edit-addr" data-id="${a.id}" aria-label="${accountT('editAddress')}">${accountT('edit')}</button>
                <button type="button" class="b2b-btn b2b-btn-danger action-del-addr" data-id="${a.id}" aria-label="${accountT('removeAddress')}">${accountT('remove')}</button>
            </div>
        </div>
    `).join('');

    const content = `
        <header class="b2b-account-header">
            <div class="b2b-account-header-text">
                <h1>${accountT('addresses')}</h1>
                <p>${accountT('manageDeliveryAddresses') || 'Manage your delivery locations'}</p>
            </div>
            <div class="b2b-account-header-actions">
                <button type="button" class="b2b-btn b2b-btn-primary action-new-addr">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    ${accountT('addNewAddress')}
                </button>
            </div>
        </header>
        <div class="b2b-address-grid">
            ${data.addresses.length ? addrHtml : '<div class="b2b-empty-state">' + accountT('noAddresses') + '</div>'}
        </div>
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
            <form id="addr-form" class="b2b-form">
                <div class="b2b-form-section" style="border:none; padding:0; margin-bottom: 0;">
                    <div class="b2b-form-group">
                        <label>${accountT('addressLabel')}</label>
                        <input type="text" name="label" value="${esc(addr.label)}" class="b2b-input" placeholder="${accountT('addressLabelPlaceholder')}" required>
                    </div>
                    <div class="b2b-form-group">
                        <label>${accountT('attentionContact')}</label>
                        <input type="text" name="name" value="${esc(addr.name)}" class="b2b-input" required>
                    </div>
                    <div class="b2b-form-group">
                        <label>${accountT('streetBuilding')}</label>
                        <input type="text" name="line1" value="${esc(addr.line1)}" class="b2b-input" required>
                    </div>
                    <div class="b2b-form-grid-2">
                        <div class="b2b-form-group">
                            <label>${accountT('postcode')}</label>
                            <input type="text" name="postal_code" value="${esc(addr.postal_code)}" class="b2b-input" required>
                        </div>
                        <div class="b2b-form-group">
                            <label>${accountT('townCity')}</label>
                            <input type="text" name="city" value="${esc(addr.city)}" class="b2b-input" required>
                        </div>
                    </div>
                    <div class="b2b-form-group">
                        <label>${accountT('deliveryCountry')}</label>
                        <div class="b2b-select-wrapper">
                            <select name="country" class="b2b-select" required>${window.BuyerCurrency.options(addr.country)}</select>
                            <svg class="b2b-select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                        <p class="b2b-form-help">${accountT('currencyCountryNote')}</p>
                    </div>
                    
                    <details class="b2b-details" ${addr.company || addr.line2 ? 'open' : ''}>
                        <summary>${accountT('optionalAddressFields')}</summary>
                        <div class="b2b-details-content">
                            <div class="b2b-form-group"><label>${accountT('companyName')}</label><input type="text" name="company" value="${esc(addr.company)}" class="b2b-input"></div>
                            <div class="b2b-form-group" style="margin-bottom:0"><label>${accountT('addressLine2')}</label><input type="text" name="line2" value="${esc(addr.line2)}" class="b2b-input"></div>
                        </div>
                    </details>
                    
                    <div class="b2b-form-group" style="margin-top:1.5rem">
                        <label class="b2b-checkbox-label">
                            <input type="checkbox" name="is_default" value="1" class="b2b-checkbox" ${addr.is_default ? 'checked' : ''}>
                            <span>${accountT('setDefaultAddress')}</span>
                        </label>
                    </div>
                </div>
                <div class="b2b-modal-actions">
                    <button type="button" class="b2b-btn b2b-btn-outline" onclick="window.UI.closeModal()">${accountT('cancel')}</button>
                    <button type="submit" class="b2b-btn b2b-btn-primary">${accountT(id ? 'updateAddress' : 'addAddress')}</button>
                </div>
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
    
    const cards = data.orders.map(o => `
        <article class="b2b-order-card">
            <div class="b2b-order-card-id">
                <a href="${window.APP_BASE}account/orders/${o.id}" class="b2b-order-number">${esc(o.number)}</a>
                <time class="b2b-order-date">${accountDate(o.created_at)}</time>
            </div>
            <dl class="b2b-order-states">
                <div class="b2b-order-state-item">
                    <dt>${accountT('fulfillment')}</dt>
                    <dd>${accountFulfillmentState(o)}</dd>
                </div>
                <div class="b2b-order-state-item">
                    <dt>${accountT('payment')}</dt>
                    <dd>${accountPaymentState(o.payment_state)}</dd>
                </div>
                <div class="b2b-order-state-item">
                    <dt>${accountT('paymentMethod')}</dt>
                    <dd>${esc(accountPaymentMethod(o.payment_method))}</dd>
                </div>
            </dl>
            <div class="b2b-order-card-total">${accountMoney(o.total_cents, o.currency || 'CHF')}</div>
            <a href="${window.APP_BASE}account/orders/${o.id}" class="b2b-order-open">
                <span>${accountT('details')}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            </a>
        </article>`).join('');

    const content = `
        <header class="b2b-account-header">
            <div class="b2b-account-header-text">
                <h1>${accountT('orders')}</h1>
                <p>${accountT('viewOrderHistory') || 'View and track your previous orders'}</p>
            </div>
        </header>
        <div class="b2b-order-list">
            ${cards || '<div class="b2b-empty-state">' + accountT('noOrders') + '</div>'}
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
            <tr class="b2b-table-row">
                <td class="b2b-table-cell">
                    <div class="b2b-item-meta">${esc(i.sku)}</div>
                    <div class="b2b-item-name">${esc(i.name)}</div>
                </td>
                <td class="b2b-table-cell b2b-text-right">${accountMoney(i.price_cents, orderCurrency)}</td>
                <td class="b2b-table-cell b2b-text-center">${i.quantity}</td>
                <td class="b2b-table-cell b2b-text-right b2b-font-medium">${accountMoney(i.total_cents, orderCurrency)}</td>
                <td class="b2b-table-cell b2b-text-right">
                    ${(o.status === 'shipped' || o.status === 'completed') ? `<button type="button" class="b2b-btn b2b-btn-sm b2b-btn-outline action-return" data-itemid="${i.id}" data-max="${i.quantity}" data-name="${esc(i.name)}">${accountT('return')}</button>` : ''}
                </td>
            </tr>
        `).join('');

        const addr = o.address_json ? JSON.parse(o.address_json) : {};

        const content = `
            <div class="b2b-account-breadcrumb">
                <a href="${window.APP_BASE}account/orders" class="b2b-back-link" aria-label="${accountT('backToOrders')}">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    ${accountT('backToOverview')}
                </a>
            </div>

            <header class="b2b-account-header">
                <div class="b2b-account-header-text">
                    <h1>${accountT('order', {number: esc(o.number)})}</h1>
                    <p>${accountDate(o.created_at)}</p>
                </div>
                <div class="b2b-account-header-actions">
                    ${(o.status === 'completed' || (o.payment_method === 'swiss_qr_invoice' && o.status === 'on_hold')) ? `<button class="b2b-btn b2b-btn-outline" aria-label="${accountT('downloadInvoice')}" onclick="downloadPdf('/documents/${o.id}/invoice.pdf')">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        ${accountT('invoicePdf')}
                    </button>` : ''}
                </div>
            </header>
            
            <div class="b2b-order-meta-grid">
                <div class="b2b-card">
                    <div class="b2b-card-header">
                        <h3 class="b2b-card-title">${accountT('deliveryAddress')}</h3>
                    </div>
                    <div class="b2b-card-body b2b-address-body">
                        ${addr.company ? '<strong class="b2b-address-company">'+esc(addr.company)+'</strong><br>' : ''}
                        <span class="b2b-address-name">${esc(addr.name)}</span><br>
                        ${esc(addr.line1)} ${addr.line2 ? esc(addr.line2) : ''}<br>
                        ${esc(addr.postal_code)} ${esc(addr.city)}<br>
                        ${esc(addr.country)}
                    </div>
                </div>
                <div class="b2b-card">
                    <div class="b2b-card-header">
                        <h3 class="b2b-card-title">${accountT('orderInformation')}</h3>
                    </div>
                    <div class="b2b-card-body b2b-dl-grid">
                        <dt>${accountT('fulfillment')}</dt><dd>${accountFulfillmentState(o)}</dd>
                        <dt>${accountT('payment')}</dt><dd>${accountPaymentState(o.payment_state)}</dd>
                        <dt>${accountT('tracking')}</dt><dd>${o.tracking ? `<a href="${esc(o.tracking)}" target="_blank" class="b2b-link">${accountT('trackParcel')}</a>` : '-'}</dd>
                        <dt>${accountT('paymentMethod')}</dt><dd>${esc(accountPaymentMethod(o.payment_method))}</dd>
                        <dt>${accountT('shippingMethod')}</dt><dd>${esc(accountShippingMethod(o))}</dd>
                    </div>
                </div>
        </div>

            ${o.payment_method === 'pay_later' && o.status === 'completed' ? `
            <section class="b2b-card b2b-invoice-overview">
                <div class="b2b-card-body b2b-flex-between">
                    <div>
                        <h3 class="b2b-card-title">${accountT('invoiceOverview')}</h3>
                        <p class="b2b-text-muted mt-1">${accountT('invoiceReady')}</p>
                    </div>
                    ${o.pay_invoice_eligible ? `<button class="b2b-btn b2b-btn-primary" type="button" data-pay-invoice="${o.id}">${accountT('payInvoiceNow')}</button>` : ''}
                </div>
            </section>` : ''}
            
            <div class="b2b-card b2b-table-card">
                <div class="b2b-table-responsive">
                    <table class="b2b-table">
                        <thead>
                            <tr>
                                <th>${accountT('product')}</th>
                                <th class="b2b-text-right">${accountT('price')}</th>
                                <th class="b2b-text-center">${accountT('quantity')}</th>
                                <th class="b2b-text-right">${accountT('total')}</th>
                                <th class="b2b-text-right">${accountT('action')}</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
                <div class="b2b-order-totals">
                    <div class="b2b-order-total-row">
                        <span>${accountT('subtotalExVat')}</span>
                        <span class="b2b-total-val">${accountMoney(o.subtotal_cents, orderCurrency)}</span>
                    </div>
                    <div class="b2b-order-total-row">
                        <span>${accountT('shippingExVat')}</span>
                        <span class="b2b-total-val">${accountMoney(o.shipping_cents, orderCurrency)}</span>
                    </div>
                    <div class="b2b-order-total-row">
                        <span>${accountT('vat')}</span>
                        <span class="b2b-total-val">${accountMoney(o.tax_cents, orderCurrency)}</span>
                    </div>
                    <div class="b2b-order-total-row b2b-total-grand">
                        <span>${accountT('totalInclVat')} (${esc(orderCurrency)})</span>
                        <span class="b2b-total-val">${accountMoney(o.total_cents, orderCurrency)}</span>
                    </div>
                </div>
            </div>
            
            <div class="b2b-card" style="margin-top:2rem">
                <div class="b2b-card-header">
                    <h3 class="b2b-card-title">${accountT('orderHistory')}</h3>
                </div>
                <div class="b2b-card-body">
                    <ul class="b2b-timeline">
                        ${data.events.map(e => `
                        <li class="b2b-timeline-item">
                            <div class="b2b-timeline-point"></div>
                            <div class="b2b-timeline-content">
                                <time>${accountDateTime(e.created_at)}</time>
                                <div class="b2b-timeline-desc">
                                    ${accountT('statusChangedTo')} <strong>${accountStatus(e.status)}</strong>
                                </div>
                                ${e.note ? `<div class="b2b-timeline-note">${esc(e.note)}</div>` : ''}
                            </div>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        root.innerHTML = accountLayout(content, 'orders');

        root.querySelector('[data-pay-invoice]')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                const result = await window.Core.fetch(`/orders/${button.dataset.payInvoice}/pay-invoice`, {method: 'POST', body: {}});
                const target = new URL(result.stripe_checkout_url, window.location.origin);
                if (!(target.protocol === 'https:' && target.hostname === 'checkout.stripe.com')) {
                    throw new Error(accountT('unsafePaymentRedirect'));
                }
                window.location.assign(target.href);
            } catch (error) {
                window.Workbench?.toast(error.message, 'error');
                button.disabled = false;
            }
        });
        
        const startReturn = (orderId, itemId, maxQty, itemName) => {
            const html = `
                <form id="return-form" class="b2b-form">
                    <div class="b2b-form-section" style="border:0; padding:0;">
                        <div class="b2b-return-item-info">
                            <span class="b2b-return-item-label">${accountT('returnFor')}</span>
                            <strong class="b2b-return-item-name">${itemName}</strong>
                        </div>
                        <div class="b2b-form-group">
                            <label>${accountT('quantityToReturn', {count: maxQty})}</label>
                            <input type="number" name="quantity" min="1" max="${maxQty}" value="${maxQty}" class="b2b-input" required>
                        </div>
                        <div class="b2b-form-group">
                            <label>${accountT('returnReason')}</label>
                            <textarea name="reason" class="b2b-input" rows="3" placeholder="${accountT('returnReasonPlaceholder')}" required></textarea>
                        </div>
                    </div>
                    <div class="b2b-modal-actions">
                        <button type="button" class="b2b-btn b2b-btn-outline" onclick="window.UI.closeModal()">${accountT('cancel')}</button>
                        <button type="submit" class="b2b-btn b2b-btn-primary">${accountT('submitReturn')}</button>
                    </div>
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
        <tr class="b2b-table-row">
            <td class="b2b-table-cell"><a href="${window.APP_BASE}account/returns/${r.id}" class="b2b-link b2b-font-medium">${esc(r.number)}</a></td>
            <td class="b2b-table-cell">${accountDate(r.created_at)}</td>
            <td class="b2b-table-cell"><a href="${window.APP_BASE}account/orders/${r.order_id}" class="b2b-link">${accountT('order', {number: r.order_id})}</a></td>
            <td class="b2b-table-cell">${window.Workbench.badge(r.status)}</td>
            <td class="b2b-table-cell b2b-text-right">
                <div class="b2b-return-credit-val">${accountMoney(r.credit_cents, r.currency || r.order_currency || 'CHF')}</div>
                <div class="b2b-return-credit-cur">${esc(r.currency || r.order_currency || 'CHF')}</div>
            </td>
            <td class="b2b-table-cell b2b-text-right"><a href="${window.APP_BASE}account/returns/${r.id}" class="b2b-btn b2b-btn-sm b2b-btn-outline">${accountT('details')}</a></td>
        </tr>
    `).join('');

    const content = `
        <header class="b2b-account-header">
            <div class="b2b-account-header-text">
                <h1>${accountT('returns')} (RMA)</h1>
                <p>${accountT('manageReturns') || 'Manage your product returns and credits'}</p>
            </div>
        </header>

        <div class="b2b-card b2b-table-card">
            <div class="b2b-table-responsive">
                <table class="b2b-table">
                    <thead>
                        <tr>
                            <th>${accountT('rmaNumber')}</th>
                            <th>${accountT('date')}</th>
                            <th>${accountT('order')}</th>
                            <th>${accountT('status')}</th>
                            <th class="b2b-text-right">${accountT('credited')}</th>
                            <th class="b2b-text-right">${accountT('action')}</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6" class="b2b-table-cell b2b-empty-state-cell"><div class="b2b-empty-state">' + accountT('noReturns') + '</div></td></tr>'}</tbody>
                </table>
            </div>
        </div>
        <div class="b2b-account-footer-note">
            <p>${accountT('returnInstructions')}</p>
        </div>
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
            <tr class="b2b-table-row">
                <td class="b2b-table-cell b2b-font-medium">${esc(i.name)}</td>
                <td class="b2b-table-cell b2b-text-right">${accountMoney(i.price_cents, returnCurrency)}</td>
                <td class="b2b-table-cell b2b-text-center">${i.quantity}</td>
            </tr>
        `).join('');

        const content = `
            <div class="b2b-account-breadcrumb">
                <a href="${window.APP_BASE}account/returns" class="b2b-back-link" aria-label="${accountT('backToOverview')}">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    ${accountT('backToOverview')}
                </a>
            </div>
            
            <header class="b2b-account-header">
                <div class="b2b-account-header-text">
                    <h1>${accountT('returnNumber', {number: esc(r.number)})}</h1>
                </div>
                ${r.status === 'credited' ? `
                    <div class="b2b-account-header-actions">
                        <button class="b2b-btn b2b-btn-outline" aria-label="${accountT('downloadCreditNote')}" onclick="downloadPdf('/documents/returns/${r.id}/credit-note.pdf')">
                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            ${accountT('creditNotePdf')}
                        </button>
                    </div>
                ` : ''}
            </header>
            
            <div class="b2b-card" style="margin-bottom:1.5rem">
                <div class="b2b-card-body b2b-dl-grid b2b-dl-grid-2">
                    <dt>${accountT('status')}</dt><dd>${window.Workbench.badge(r.status)}</dd>
                    <dt>${accountT('applicationDate')}</dt><dd>${accountDate(r.created_at)}</dd>
                </div>
                <div class="b2b-card-footer">
                    <dt>${accountT('reasonProvided')}</dt>
                    <dd>${esc(r.reason)}</dd>
                </div>
                ${r.note ? `
                <div class="b2b-card-footer b2b-card-footer-alt">
                    <dt>${accountT('supportNote')}</dt>
                    <dd>${esc(r.note)}</dd>
                </div>
                ` : ''}
            </div>
            
            <div class="b2b-card b2b-table-card">
                <div class="b2b-table-responsive">
                    <table class="b2b-table">
                        <thead>
                            <tr>
                                <th>${accountT('product')}</th>
                                <th class="b2b-text-right">${accountT('price')}</th>
                                <th class="b2b-text-center">${accountT('quantity')}</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
                <div class="b2b-order-totals">
                    <div class="b2b-order-total-row b2b-total-grand b2b-success-text">
                        <span>${accountT('totalCredited', {currency: esc(returnCurrency)})}</span>
                        <span class="b2b-total-val">${accountMoney(r.credit_cents, returnCurrency)}</span>
                    </div>
                </div>
            </div>
            
            <div class="b2b-card" style="margin-top:2rem">
                <div class="b2b-card-header">
                    <h3 class="b2b-card-title">${accountT('history')}</h3>
                </div>
                <div class="b2b-card-body">
                    <ul class="b2b-timeline">
                        ${data.events.map(e => `
                        <li class="b2b-timeline-item">
                            <div class="b2b-timeline-point"></div>
                            <div class="b2b-timeline-content">
                                <time>${accountDateTime(e.created_at)}</time>
                                <div class="b2b-timeline-desc">
                                    ${accountT('status')}: <strong>${accountStatus(e.status)}</strong>
                                </div>
                                ${e.note ? `<div class="b2b-timeline-note">${esc(e.note)}</div>` : ''}
                            </div>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        root.innerHTML = accountLayout(content, 'returns');
    } catch(err) {
        root.innerHTML = accountLayout(`<div class="alert error">${esc(err.message)}</div>`, 'returns');
    }
}); // End customer account routes.
