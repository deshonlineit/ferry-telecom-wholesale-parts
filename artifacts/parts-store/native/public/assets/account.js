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
            'processing': { label: 'Processing', badge: 'warning' },
            'shipped': { label: 'Shipped', badge: 'info' },
            'completed': { label: 'Completed', badge: 'success' },
            'cancelled': { label: 'Cancelled', badge: 'danger' },
            'submitted': { label: 'Submitted', badge: 'warning' },
            'received': { label: 'Received', badge: 'info' },
            'assessed': { label: 'Assessed', badge: 'info' },
            'approved': { label: 'Approved', badge: 'success' },
            'rejected': { label: 'Rejected', badge: 'danger' },
            'credited': { label: 'Credited', badge: 'success' },
            'active': { label: 'Active', badge: 'success' },
            'pending': { label: 'Pending', badge: 'warning' },
            'blocked': { label: 'Blocked', badge: 'danger' },
            'isolated': { label: 'Isolated', badge: 'success' }
        };
        
        window.Workbench.badge = (status, defaultLabel) => {
            if (!status && defaultLabel) return `<span class="wb-badge wb-badge-neutral">${window.Core.escapeHtml(defaultLabel)}</span>`;
            const s = window.Workbench.statusMap[status];
            if (s) return `<span class="wb-badge wb-badge-${s.badge}">${window.Core.escapeHtml(s.label)}</span>`;
            return `<span class="wb-badge wb-badge-neutral">${window.Core.escapeHtml(status || '')}</span>`;
        };
    }
})();

const accountLayout = (content, activeRoute) => `
    <div class="layout-sidebar">
        <aside>
            <div class="card">
                <h3 class="form-section-title" style="margin-top:0.5rem; margin-bottom:1rem;">My account</h3>
                <div class="sidebar-nav">
                    <a href="${window.APP_BASE}account" class="${activeRoute === 'profile' ? 'active' : ''}">Profile</a>
                    <a href="${window.APP_BASE}account/addresses" class="${activeRoute === 'addresses' ? 'active' : ''}">Addresses</a>
                    <a href="${window.APP_BASE}account/orders" class="${activeRoute === 'orders' ? 'active' : ''}">Orders</a>
                    <a href="${window.APP_BASE}account/returns" class="${activeRoute === 'returns' ? 'active' : ''}">Returns</a>
                    <a href="${window.APP_BASE}account/buyback" class="${activeRoute === 'buyback' ? 'active' : ''}">Screen buyback</a>
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
    } catch(e) { window.Workbench.toast("Unable to download PDF: " + e.message, 'error'); }
};

window.Router.add(/^account$/, async (match, root) => {
    if (!window.Core.user) return window.Router.navigate(window.APP_BASE + 'login');
    if (window.Core.user.role === 'staff') return window.Router.navigate(window.APP_BASE + 'admin');
    const data = await window.Core.fetch('/profile');
    const u = data.user;
    const esc = window.Core.escapeHtml;

    const content = `
        <div class="page-header">
            <h1>Profile</h1>
        </div>
        <div class="card">
            <form id="profile-form">
                <div class="form-section">
                    <h3 class="form-section-title">Personal details</h3>
                    <div class="form-group">
                        <label>Email address (sign-in)</label>
                        <input type="email" class="form-control" value="${esc(u.email)}" disabled style="background: var(--wb-bg); color: var(--wb-text-muted);">
                        <small class="text-muted" style="display:block; margin-top:0.25rem;">Contact support to change your email address.</small>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Full name</label>
                            <input type="text" name="name" class="form-control" value="${esc(u.name)}" required>
                        </div>
                        <div class="form-group">
                            <label>Company name</label>
                            <input type="text" name="company" class="form-control" value="${esc(u.company)}" required>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn">Save changes</button>
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
            window.Workbench.toast('Profile saved successfully!', 'success');
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
                        ${esc(a.label)} ${a.is_default ? '<span class="wb-badge wb-badge-success">Default</span>' : ''}
                    </div>
                    <div style="color:var(--wb-text-muted); font-size:0.875rem; line-height:1.5">
                        ${a.company ? '<strong>' + esc(a.company) + '</strong><br>' : ''}
                        For the attention of ${esc(a.name)}<br>
                        ${esc(a.line1)} ${a.line2 ? esc(a.line2) : ''}<br>
                        ${esc(a.postal_code)} ${esc(a.city)}<br>
                        ${esc(a.country)}
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem">
                    <button type="button" class="btn btn-outline btn-sm action-edit-addr" data-id="${a.id}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm action-del-addr" data-id="${a.id}">Remove</button>
                </div>
            </div>
        </div>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Addresses</h1>
            <button type="button" class="btn action-new-addr">Add new address</button>
        </div>
        ${data.addresses.length ? addrHtml : '<div class="alert">You have not added any addresses yet.</div>'}
    `;
    
    root.innerHTML = accountLayout(content, 'addresses');
    
    const delBtns = root.querySelectorAll('.action-del-addr');
    delBtns.forEach(btn => btn.addEventListener('click', async (e) => {
        if(!confirm('Are you sure you want to remove this address?')) return;
        try {
            await window.Core.fetch(`/addresses/${e.currentTarget.dataset.id}`, { method: 'DELETE' });
            window.Workbench.toast('Address removed', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); }
    }));

    const editAddress = (id = null) => {
        let addr = { label:'', name:'', company:'', line1:'', line2:'', postal_code:'', city:'', country: window.Core.country || 'CH', is_default:0 };
        if (id) addr = data.addresses.find(a => a.id === id);
        
        const html = `
            <form id="addr-form">
                <div class="form-section" style="border:none; padding:0;">
                    <div class="form-group"><label>Label (e.g. Head office)</label><input type="text" name="label" value="${esc(addr.label)}" class="form-control" required></div>
                    <div class="form-group"><label>For the attention of (contact person)</label><input type="text" name="name" value="${esc(addr.name)}" class="form-control" required></div>
                    <div class="form-group"><label>Street and building number</label><input type="text" name="line1" value="${esc(addr.line1)}" class="form-control" required></div>
                    <div class="grid-cols-2">
                        <div class="form-group"><label>Postcode</label><input type="text" name="postal_code" value="${esc(addr.postal_code)}" class="form-control" required></div>
                        <div class="form-group"><label>Town/city</label><input type="text" name="city" value="${esc(addr.city)}" class="form-control" required></div>
                    </div>
                    <div class="form-group">
                        <label>Delivery country</label>
                        <select name="country" class="form-control" required>${window.BuyerCurrency.options(addr.country)}</select>
                        <small class="text-muted">Orders for Switzerland are charged in CHF; all other countries are charged in EUR.</small>
                    </div>
                    
                    <details class="wb-details" ${addr.company || addr.line2 ? 'open' : ''}>
                        <summary>Optional fields (company, additional address line)</summary>
                        <div class="wb-details-content">
                            <div class="form-group"><label>Company name</label><input type="text" name="company" value="${esc(addr.company)}" class="form-control"></div>
                            <div class="form-group" style="margin-bottom:0"><label>Address line 2</label><input type="text" name="line2" value="${esc(addr.line2)}" class="form-control"></div>
                        </div>
                    </details>
                    
                    <div class="form-group" style="margin-top:1.5rem">
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                            <input type="checkbox" name="is_default" value="1" ${addr.is_default ? 'checked' : ''}>
                            Set as default address
                        </label>
                    </div>
                </div>
                <button type="submit" class="btn" style="width:100%; margin-top:1rem;">${id ? 'Update address' : 'Add address'}</button>
            </form>
        `;
        const overlay = window.UI.showModal(id ? 'Edit address' : 'New address', html);
        
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
                window.Workbench.toast('Address saved', 'success');
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
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td>${window.Workbench.badge(o.status)}</td>
            <td>${window.Core.formatMoney(o.total_cents, o.currency || 'CHF')}<br><small class="text-muted">${esc(o.currency || 'CHF')}</small></td>
            <td>
                <a href="${window.APP_BASE}account/orders/${o.id}" class="btn btn-sm btn-outline">Details</a>
            </td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Orders</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Order #</th><th>Date</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No orders found.</td></tr>'}</tbody>
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
                <td>${window.Core.formatMoney(i.price_cents, orderCurrency)}</td>
                <td>${i.quantity}</td>
                <td style="text-align:right">${window.Core.formatMoney(i.total_cents, orderCurrency)}</td>
                <td style="text-align:right">
                    ${(o.status === 'shipped' || o.status === 'completed') ? `<button type="button" class="btn btn-sm btn-outline action-return" data-itemid="${i.id}" data-max="${i.quantity}" data-name="${esc(i.name)}">Return</button>` : ''}
                </td>
            </tr>
        `).join('');

        const addr = o.address_json ? JSON.parse(o.address_json) : {};

        const content = `
            <div style="margin-bottom:1.5rem"><a href="${window.APP_BASE}account/orders" class="btn btn-outline btn-sm">&larr; Back to overview</a></div>
            
            <div class="page-header">
                <h1>Order ${esc(o.number)}</h1>
                <div class="page-actions">
                    <button class="btn btn-outline" onclick="downloadPdf('/documents/${o.id}/invoice.pdf')">Invoice (PDF)</button>
                    <button class="btn btn-outline" onclick="downloadPdf('/documents/${o.id}/packing-slip.pdf')">Packing slip (PDF)</button>
                </div>
            </div>
            
            <div class="grid-cols-2" style="margin-bottom:1.5rem">
                <div class="card">
                    <h3 class="form-section-title">Delivery address</h3>
                    <div style="font-size:0.875rem; line-height:1.6; color:var(--wb-text);">
                        ${addr.company ? '<strong>'+esc(addr.company)+'</strong><br>' : ''}
                        ${esc(addr.name)}<br>
                        ${esc(addr.line1)} ${addr.line2 ? esc(addr.line2) : ''}<br>
                        ${esc(addr.postal_code)} ${esc(addr.city)}<br>
                        ${esc(addr.country)}
                    </div>
                </div>
                <div class="card">
                    <h3 class="form-section-title">Order information</h3>
                    <table style="width:100%; font-size:0.875rem; line-height:2;">
                        <tr><td style="color:var(--wb-text-muted); width:120px;">Date:</td><td><strong>${new Date(o.created_at).toLocaleDateString()}</strong></td></tr>
                        <tr><td style="color:var(--wb-text-muted)">Status:</td><td>${window.Workbench.badge(o.status)}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">Tracking:</td><td>${o.tracking ? `<a href="${esc(o.tracking)}" target="_blank" style="font-weight:500;">Track parcel</a>` : '-'}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">Payment method:</td><td>${esc(o.payment_method)}</td></tr>
                        <tr><td style="color:var(--wb-text-muted)">Currency:</td><td><strong>${esc(orderCurrency)}</strong></td></tr>
                    </table>
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th style="text-align:right">Total</th><th style="text-align:right">Action</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div style="padding:1.5rem; background:var(--wb-bg); text-align:right; border-top:1px solid var(--wb-border-light)">
                    <div style="margin-bottom:0.25rem; font-size:0.875rem; color:var(--wb-text-muted)">Subtotal: <span style="display:inline-block; width:100px; color:var(--wb-text)">${window.Core.formatMoney(o.subtotal_cents, orderCurrency)}</span></div>
                    <div style="margin-bottom:0.25rem; font-size:0.875rem; color:var(--wb-text-muted)">Shipping: <span style="display:inline-block; width:100px; color:var(--wb-text)">${window.Core.formatMoney(o.shipping_cents, orderCurrency)}</span></div>
                    <div style="margin-bottom:0.25rem; font-size:0.875rem; color:var(--wb-text-muted)">VAT: <span style="display:inline-block; width:100px; color:var(--wb-text)">${window.Core.formatMoney(o.tax_cents, orderCurrency)}</span></div>
                    <div style="font-size:1.125rem; font-weight:700; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--wb-border);">Total (${esc(orderCurrency)}): <span style="display:inline-block; width:100px;">${window.Core.formatMoney(o.total_cents, orderCurrency)}</span></div>
                </div>
            </div>
            
            <div class="card" style="margin-top:2rem">
                <h3 class="form-section-title">Order history</h3>
                <ul style="padding-left:1.5rem; font-size:0.875rem; margin-bottom:0;">
                    ${data.events.map(e => `<li style="margin-bottom:0.5rem"><strong>${new Date(e.created_at).toLocaleString()}</strong> - Status changed to: <strong>${window.Workbench.statusMap[e.status]?.label || e.status}</strong>. ${e.note ? `<br><span style="color:var(--wb-text-muted)">${esc(e.note)}</span>` : ''}</li>`).join('')}
                </ul>
            </div>
        `;
        root.innerHTML = accountLayout(content, 'orders');
        
        const startReturn = (orderId, itemId, maxQty, itemName) => {
            const html = `
                <form id="return-form">
                    <p style="margin-bottom:1.5rem; padding:1rem; background:var(--wb-bg); border-radius:var(--wb-radius); font-size:0.875rem;">
                        Return for:<br><strong style="font-size:1rem">${itemName}</strong>
                    </p>
                    <div class="form-group">
                        <label>Quantity to return (max. ${maxQty})</label>
                        <input type="number" name="quantity" min="1" max="${maxQty}" value="${maxQty}" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>Reason for return</label>
                        <textarea name="reason" class="form-control" rows="3" required></textarea>
                    </div>
                    <button type="submit" class="btn" style="width:100%; margin-top:1rem;">Submit return</button>
                </form>
            `;
            const overlay = window.UI.showModal('Return item', html);
            
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
                    window.Workbench.toast('Return submitted successfully', 'success');
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
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
            <td><a href="${window.APP_BASE}account/orders/${r.order_id}">Order #${r.order_id}</a></td>
            <td>${window.Workbench.badge(r.status)}</td>
            <td>${window.Core.formatMoney(r.credit_cents, r.currency || r.order_currency || 'CHF')}<br><small class="text-muted">${esc(r.currency || r.order_currency || 'CHF')}</small></td>
            <td><a href="${window.APP_BASE}account/returns/${r.id}" class="btn btn-sm btn-outline">Details</a></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Returns (RMA)</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>RMA #</th><th>Date</th><th>Order</th><th>Status</th><th>Credited</th><th>Action</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center; padding:2rem;">No returns found.</td></tr>'}</tbody>
            </table>
        </div>
        <p class="text-muted" style="margin-top:1rem; font-size:0.875rem;">To submit a return, open the details of the relevant order.</p>
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
                <td>${window.Core.formatMoney(i.price_cents, returnCurrency)}</td>
                <td>${i.quantity}</td>
            </tr>
        `).join('');

        const content = `
            <div style="margin-bottom:1.5rem"><a href="${window.APP_BASE}account/returns" class="btn btn-outline btn-sm">&larr; Back to overview</a></div>
            
            <div class="page-header">
                <h1>Return ${esc(r.number)}</h1>
                ${r.status === 'credited' ? `
                    <div class="page-actions">
                        <button class="btn btn-outline" onclick="downloadPdf('/documents/returns/${r.id}/credit-note.pdf')">Credit note (PDF)</button>
                    </div>
                ` : ''}
            </div>
            
            <div class="card" style="margin-bottom:1.5rem">
                <div class="grid-cols-2" style="margin-bottom:1rem;">
                    <div><div class="data-label">Status</div><div class="data-value">${window.Workbench.badge(r.status)}</div></div>
                    <div><div class="data-label">Application date</div><div class="data-value">${new Date(r.created_at).toLocaleDateString()}</div></div>
                </div>
                <div style="border-top:1px solid var(--wb-border-light); padding-top:1rem;">
                    <div class="data-label">Reason provided</div>
                    <div class="data-value" style="margin-bottom:0;">${esc(r.reason)}</div>
                    ${r.note ? `<div class="data-label" style="margin-top:1rem;">Support note</div><div class="data-value" style="margin-bottom:0;">${esc(r.note)}</div>` : ''}
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="data-table">
                    <thead><tr><th>Product</th><th>Price</th><th>Quantity</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div style="padding:1.5rem; background:var(--wb-bg); text-align:right; border-top:1px solid var(--wb-border-light);">
                    <div style="font-size:1.125rem; font-weight:700; color:var(--wb-success)">Total credited (${esc(returnCurrency)}): ${window.Core.formatMoney(r.credit_cents, returnCurrency)}</div>
                </div>
            </div>
            
            <div class="card" style="margin-top:2rem">
                <h3 class="form-section-title">History</h3>
                <ul style="padding-left:1.5rem; font-size:0.875rem; margin-bottom:0;">
                    ${data.events.map(e => `<li style="margin-bottom:0.5rem"><strong>${new Date(e.created_at).toLocaleString()}</strong> - Status: <strong>${window.Workbench.statusMap[e.status]?.label || e.status}</strong>. ${e.note ? `<br><span style="color:var(--wb-text-muted)">${esc(e.note)}</span>` : ''}</li>`).join('')}
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
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
            <td>${window.Workbench.badge(r.status)}</td>
            <td>${window.Core.formatMoney(r.total_cents, r.currency || data.currency || 'CHF')}</td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Screen buyback</h1>
            <button type="button" class="btn action-new-bb">Submit new buyback</button>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Application #</th><th>Date</th><th>Status</th><th>Estimated value</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center; padding:2rem;">No buyback applications found.</td></tr>'}</tbody>
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
                    <td>${window.Core.formatMoney(i.price_cents, i.currency || bbData.currency || 'CHF')}</td>
                    <td style="width:100px; padding:0.25rem 0.5rem;"><input type="number" class="form-control" name="qty_${i.id}" value="0" min="0" style="padding:0.25rem; font-size:0.875rem;"></td>
                </tr>
            `).join('');
            
            const html = `
                <form id="bb-form">
                    <p style="margin-bottom:1rem; font-size:0.875rem;">Enter the number of screens you wish to send for each model and quality.</p>
                    <div style="max-height:350px; overflow-y:auto; border:1px solid var(--wb-border-light); border-radius:var(--wb-radius); margin-bottom:1.5rem;">
                        <table class="data-table" style="margin:0; border:none;">
                            <thead style="position:sticky; top:0; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);"><tr><th>Model</th><th>Grade</th><th>Unit price</th><th>Quantity</th></tr></thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                    <details class="wb-details">
                        <summary>Add optional note</summary>
                        <div class="wb-details-content">
                            <textarea name="notes" class="form-control" rows="2" placeholder="Details about this buyback..."></textarea>
                        </div>
                    </details>
                    <button type="submit" class="btn" style="width:100%; margin-top:1rem;">Submit application</button>
                </form>
            `;
            const overlay = window.UI.showModal('New buyback application', html);
            
            document.getElementById('bb-form').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const payloadItems = [];
                items.forEach(i => {
                    const qty = parseInt(fd.get(`qty_${i.id}`), 10);
                    if (qty > 0) payloadItems.push({ item_id: i.id, quantity: qty });
                });
                if (payloadItems.length === 0) return window.Workbench.toast('Enter a quantity for at least one item.', 'warning');
                
                try {
                    await window.Core.fetch('/buyback/requests', {
                        method: 'POST',
                        body: { items: payloadItems, notes: fd.get('notes') }
                    });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast('Buyback application submitted', 'success');
                    window.Router.route();
                } catch(err) { window.Workbench.toast(err.message, 'error'); }
            };

        } catch(e) { window.Workbench.toast(e.message, 'error'); }
    };
    
    root.querySelector('.action-new-bb').addEventListener('click', startBuyback);
});
