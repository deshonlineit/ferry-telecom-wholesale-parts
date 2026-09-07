// Admin Dashboard: Products, Orders, Customers, Settings, Buyback

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
            'on_hold': { label: 'On hold — awaiting payment', badge: 'warning' },
            'processing': { label: 'Processing', badge: 'warning' },
            'shipped': { label: 'Shipped', badge: 'info' },
            'completed': { label: 'Completed', badge: 'success' },
            'cancelled': { label: 'Cancelled', badge: 'danger' },
            'archived': { label: 'Archived', badge: 'neutral' },
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
    window.Workbench.parseCentsStrict = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const str = String(val).trim();
        if (str === '-' || str === '') return null;
        const match = str.match(/^(\d+)([.,](\d{0,2}))?$/);
        if (!match) return NaN;
        const cents = Number(match[1]) * 100 + Number((match[3] || '').padEnd(2, '0'));
        return Number.isSafeInteger(cents) && cents <= 100000000 ? cents : NaN;
    };
})();

const adminLayout = (content, activeRoute) => window.Admin.layout(content, activeRoute);
const adminPaymentMethodLabel = method => ({
    swiss_qr_invoice: 'Swiss QR Invoice',
    pay_later: 'Pay Later',
    test_invoice: 'Legacy test invoice',
    test_card: 'Legacy test card'
}[method] || method);

function renderTable(headers, rowsHtml, emptyMsg) {
    return `
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>${rowsHtml || `<tr><td colspan="${headers.length}" style="text-align:center; padding:2rem;">${emptyMsg}</td></tr>`}</tbody>
            </table>
        </div>
    `;
}

window.Router.add(/^admin$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/dashboard');
    const s = data.stats;
    const financeData = Array.isArray(data.finance) ? data.finance : (data.finance ? [Object.assign({currency: 'CHF'}, data.finance)] : []);
    const invAtt = data.invoice_attention;
    const esc = window.Core.escapeHtml;
    
    const content = `
        <div class="page-header">
            <h1>Dashboard</h1>
        </div>
        ${data.safety && data.safety.test_mode ? '<div class="alert warning" style="margin-bottom:1.5rem"><strong>TEST ENVIRONMENT:</strong> Live API connections are blocked. No real payments or emails.</div>' : ''}
        
        ${financeData.map(f => `
        <div style="margin-bottom:1rem; font-weight:600; color:var(--wb-text-muted);">Currency: ${f.currency || 'CHF'}</div>
        <div class="admin-finance-summary" style="margin-bottom:2rem">
            <a href="${window.APP_BASE}admin/invoices?status=unpaid" class="finance-summary-tile tile-warning">
                <span>Unpaid</span>
                <strong>${f.unpaid_count}</strong>
                <small>${window.Core.formatMoney(f.outstanding_cents, f.currency || 'CHF')}</small>
            </a>
            <a href="${window.APP_BASE}admin/invoices?status=overdue" class="finance-summary-tile tile-danger">
                <span>Overdue</span>
                <strong>${f.overdue_count}</strong>
                <small>${window.Core.formatMoney(f.overdue_cents, f.currency || 'CHF')}</small>
            </a>
            <a href="${window.APP_BASE}admin/invoices?status=unverified" class="finance-summary-tile tile-info">
                <span>To be checked</span>
                <strong>${f.unverified_count}</strong>
                <small>Check transactions</small>
            </a>
            <a href="${window.APP_BASE}admin/invoices?status=paid" class="finance-summary-tile tile-success">
                <span>Paid</span>
                <strong>${f.paid_count}</strong>
                <small>All paid invoices</small>
            </a>
        </div>
        `).join('')}

        <div class="admin-dashboard-stats" style="margin-bottom:2rem">
            <div class="card"><div class="data-label">Active Products</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0;">${s.products}</div></div>
            <div class="card"><div class="data-label">Customers</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0;">${s.customers}</div></div>
            <div class="card"><div class="data-label">Total Orders</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0;">${s.orders}</div></div>
            <div class="card"><div class="data-label">Low Stock</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0; color:var(--wb-danger)"><a href="${window.APP_BASE}admin/products?status=active&stock=low_stock">${s.low_stock}</a></div></div>
        </div>

        <div class="admin-dashboard-panels" style="margin-bottom:2rem">
            <div>
                <h3 class="form-section-title">Invoices Requiring Action</h3>
                <div class="table-responsive">
                    <table class="data-table finance-table">
                        ${invAtt.length ? invAtt.map(i => `<tr>
                            <td><a href="${window.APP_BASE}admin/invoices?q=${esc(i.order_number)}" style="font-weight:600">${esc(i.order_number)}</a><br><span style="font-size:0.75rem; color:var(--wb-text-muted)">${esc(i.company || i.customer_name)}</span></td>
                            <td><span class="status-badge status-${i.payment_status}">${esc({unverified: 'To be checked', unpaid: 'All unpaid', open: 'Outstanding', partial: 'Partially paid', overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled'}[i.payment_status] || i.payment_status)}</span></td>
                            <td style="text-align:right"><strong>${i.outstanding_cents === null ? 'To be checked' : window.Core.formatMoney(i.outstanding_cents, i.currency || 'CHF')}</strong><br><span style="font-size:0.75rem; color:var(--wb-text-muted)">${i.due_date ? 'Due date: ' + new Date(i.due_date).toLocaleDateString() : 'No due date'}</span></td>
                        </tr>`).join('') : '<tr><td colspan="3">No urgent invoices.</td></tr>'}
                    </table>
                </div>
            </div>
            <div>
                <h3 class="form-section-title">Low Stock</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        ${data.low_stock && data.low_stock.length ? data.low_stock.map(p => `<tr><td><a href="${window.APP_BASE}admin/products/${p.id}" style="font-weight:600">${esc(p.sku)}</a></td><td><div style="max-width:150px; overflow:hidden; text-overflow:ellipsis;" title="${esc(p.name)}">${esc(p.name)}</div></td><td style="text-align:right;"><span style="color:var(--wb-danger);font-weight:700">${p.stock} units · ${p.stock === 0 ? 'Out of stock' : 'Low stock'}</span></td></tr>`).join('') : '<tr><td colspan="3">Stock levels are adequate.</td></tr>'}
                    </table>
                </div>
            </div>
        </div>
        <div>
            <h3 class="form-section-title">Recent Orders</h3>
            <div class="table-responsive">
                <table class="data-table">
                    ${data.recent_orders && data.recent_orders.length ? data.recent_orders.map(o => `<tr><td><a href="${window.APP_BASE}admin/orders" style="font-weight:600">${esc(o.number)}</a></td><td>${window.Workbench.badge(o.status)}</td><td style="text-align:right">${window.Core.formatMoney(o.total_cents, o.currency || 'CHF')}</td></tr>`).join('') : '<tr><td colspan="3">No recent orders.</td></tr>'}
                </table>
            </div>
        </div>
    `;
    root.innerHTML = adminLayout(content, 'dashboard');
});

window.Router.add(/^admin\/products$/, async (match, root, qs) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const searchParams = new URLSearchParams(qs);
    const q = searchParams.get('q') || '';
    const cat = searchParams.get('category') || '';
    const brand = searchParams.get('brand') || '';
    const quality = searchParams.get('quality') || '';
    const stock = searchParams.get('stock') || '';
    const sort = searchParams.get('sort') || '';
    const status = searchParams.get('status') || 'all';
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';
    const esc = window.Core.escapeHtml;

    const [catalogData, data] = await Promise.all([
        window.Core.fetch('/catalog'),
        window.Core.fetch(`/admin/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&brand=${encodeURIComponent(brand)}&quality=${encodeURIComponent(quality)}&stock=${encodeURIComponent(stock)}&sort=${encodeURIComponent(sort)}&status=${encodeURIComponent(status)}&page=${page}&limit=${limit}`)
    ]);
    const stockThreshold = Number(data.stock_threshold ?? 5);
    
    const rows = data.products.map(p => `
        <tr class="${!p.active ? 'archived-row' : ''}">
            <td><span style="font-size:0.75rem; color:var(--wb-text-muted)">${esc(p.sku)}</span></td>
            <td><strong><a href="${window.APP_BASE}admin/products/${p.id}">${esc(p.name)}</a></strong>${p.featured ? ' <span class="wb-badge wb-badge-warning" style="font-size:0.65rem">Featured</span>' : ''}</td>
            <td>${p.list_price_eur_cents != null ? window.Core.formatMoney(p.list_price_eur_cents, 'EUR') : '<span style="color:var(--wb-text-muted)">Unknown</span>'}</td>
            <td><span class="wb-badge ${p.stock <= stockThreshold ? 'wb-badge-warning' : 'wb-badge-neutral'}" style="font-weight:700">${p.stock} units${p.stock === 0 ? ' · Out of stock' : (p.stock <= stockThreshold ? ' · Low stock' : '')}</span></td>
            <td>${window.Workbench.badge(p.active ? 'active' : 'archived')}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline action-quick-edit" data-id="${p.id}" data-stock="${p.stock}" data-price-eur="${p.list_price_eur_cents ?? ''}" data-version="${p.pricing_version ?? 0}" data-featured="${p.featured}">Quick Edit</button>
                ${!p.active 
                    ? `<button type="button" class="btn btn-sm btn-outline action-restore" data-id="${p.id}">Restore</button>` 
                    : `<button type="button" class="btn btn-sm btn-danger action-archive" data-id="${p.id}">Archive</button>`}
            </td>
        </tr>
    `).join('');

    const paginationHtml = window.Core.renderPagination(data.page, data.pages, searchParams, window.APP_BASE + 'admin/products');
    const catsHtml = catalogData.categories.map(c => `<option value="${c.id}" ${c.id == cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const brandsHtml = catalogData.brands.map(b => `<option value="${b.id}" ${b.id == brand ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    const qualitiesHtml = catalogData.qualities.map(q_str => `<option value="${esc(q_str)}" ${q_str == quality ? 'selected' : ''}>${esc(q_str)}</option>`).join('');

    const content = `
        <div class="page-header">
            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <h1>Products</h1>
                <span class="wb-badge wb-badge-warning" aria-live="polite" data-testid="admin-featured-total">Total featured: ${data.featured_total}</span>
            </div>
            <div class="page-actions">
                <button type="button" class="btn btn-outline action-import">Import CSV</button>
                <a href="${window.APP_BASE}admin/products/new" class="btn">New Product</a>
            </div>
        </div>
        
        <div class="card" style="padding:1rem; margin-bottom:1.5rem; background:var(--wb-bg)">
            <form style="display:flex; flex-wrap:wrap; gap:0.75rem;" id="admin-filter-form">
                <input type="text" name="q" value="${esc(q)}" class="form-control" style="flex:1 1 150px;" placeholder="Search by name/SKU...">
                <select name="category" class="form-control" style="flex:1 1 150px;"><option value="">All Categories</option>${catsHtml}</select>
                <select name="brand" class="form-control" style="flex:1 1 150px;"><option value="">All Brands</option>${brandsHtml}</select>
                <select name="quality" class="form-control" style="flex:1 1 150px;"><option value="">All Qualities</option>${qualitiesHtml}</select>
                <select name="stock" class="form-control" style="flex:1 1 150px;">
                    <option value="">All Stock</option>
                    <option value="in_stock" ${stock === 'in_stock' ? 'selected' : ''}>In stock</option>
                    <option value="low_stock" ${stock === 'low_stock' ? 'selected' : ''}>Low stock</option>
                    <option value="out_of_stock" ${stock === 'out_of_stock' ? 'selected' : ''}>Out of stock</option>
                </select>
                <span style="align-self:center; color:var(--wb-text-muted); font-size:0.8125rem; white-space:nowrap;">Low stock: ≤ ${stockThreshold} units</span>
                <select name="status" class="form-control" style="flex:1 1 150px;">
                    <option value="all" ${status === 'all' ? 'selected' : ''}>All (Active + Archived)</option>
                    <option value="active" ${status === 'active' ? 'selected' : ''}>Active Only</option>
                    <option value="archived" ${status === 'archived' ? 'selected' : ''}>Archived Only</option>
                </select>
                <select name="sort" class="form-control" style="flex:1 1 150px;"><option value="">Relevance</option><option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price ascending</option><option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price descending</option></select>
                <button type="submit" class="btn btn-outline" style="flex:0 0 auto;">Apply</button>
                <button type="button" class="btn btn-outline action-clear-filters" style="flex:0 0 auto;">Clear</button>
            </form>
        </div>
        
        ${renderTable(['SKU', 'Name', 'Base Selling Price (EUR)', 'Stock', 'Status', 'Actions'], rows, 'No products found.')}
        ${paginationHtml}
    `;

    root.innerHTML = adminLayout(content, 'products');

    document.getElementById('admin-filter-form').onsubmit = (e) => {
        e.preventDefault();
        const p = new URLSearchParams();
        const fd = new FormData(e.target);
        for (let [k,v] of fd.entries()) {
            if (v && v !== 'all') p.set(k, v);
            if (k === 'status' && v === 'all') p.delete('status');
        }
        window.Router.navigate(window.APP_BASE + 'admin/products?' + p.toString());
    };
    
    root.querySelector('.action-clear-filters').addEventListener('click', () => {
        window.Router.navigate(window.APP_BASE + 'admin/products');
    });

    root.querySelectorAll('.action-quick-edit').forEach(btn => btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        const id = parseInt(b.dataset.id, 10);
        const html = `
            <form id="quick-edit-form" class="admin-quick-edit">
                <input type="hidden" name="pricing_version" value="${b.dataset.version}">
                <div class="form-group">
                    <label>Current Stock</label>
                    <input type="number" name="stock" value="${b.dataset.stock}" class="form-control" min="0" step="1" required>
                </div>
                <div class="form-group">
                    <label>Base Price (EUR)</label>
                    <input type="text" inputmode="decimal" name="list_price_eur" value="${b.dataset.priceEur ? (parseInt(b.dataset.priceEur,10)/100).toFixed(2) : ''}" class="form-control" required>
                </div>
                <div class="form-group" style="margin-bottom:1.5rem">
                    <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" name="featured" value="1" ${b.dataset.featured == '1' ? 'checked' : ''}> Featured (on homepage)
                    </label>
                </div>
                <button type="submit" class="btn quick-edit-submit" style="width:100%">Save Changes</button>
            </form>
        `;
        const overlay = window.UI.showModal('Quick Edit Product', html);
        document.getElementById('quick-edit-form').onsubmit = async (ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.target);
            const btn = ev.target.querySelector('.quick-edit-submit');
            btn.disabled = true;
            btn.textContent = 'Saving...';
            try {
                const listPriceEurCents = window.Workbench.parseCentsStrict(fd.get('list_price_eur'));
                if (Number.isNaN(listPriceEurCents) || listPriceEurCents === null) throw new Error("Invalid amount for base price");

                await window.Core.fetch(`/admin/products/${id}`, { 
                    method: 'PATCH', 
                    body: { 
                        stock: parseInt(fd.get('stock'), 10),
                        list_price_eur_cents: listPriceEurCents,
                        pricing_version: parseInt(fd.get('pricing_version'), 10),
                        featured: fd.get('featured') ? 1 : 0
                    } 
                });
                window.UI.closeModal(overlay);
                window.Workbench.toast('Product updated successfully', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; }
        };
    }));

    root.querySelectorAll('.action-archive').forEach(btn => btn.addEventListener('click', async (e) => {
        if (!confirm('Are you sure you want to archive this product?')) return;
        const id = e.currentTarget.dataset.id;
        try {
            await window.Core.fetch(`/admin/products/${id}`, { method: 'DELETE' });
            window.Workbench.toast('Product archived', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; }
    }));

    root.querySelectorAll('.action-restore').forEach(btn => btn.addEventListener('click', async (e) => {
        if (!confirm('Restore the product and make it active again?')) return;
        const id = e.currentTarget.dataset.id;
        try {
            await window.Core.fetch(`/admin/products/${id}/restore`, { method: 'POST' });
            window.Workbench.toast('Product restored', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; }
    }));

    root.querySelector('.action-import').addEventListener('click', () => {
        const html = `
            <form id="import-form">
                <div class="alert" style="font-size:0.875rem;">Expected CSV columns: sku, name, category, brand, quality, stock, price (EUR)</div>
                <div class="form-group" style="margin-bottom:1.5rem;">
                    <label>Select CSV File</label>
                    <input type="file" name="file" accept=".csv" required class="form-control">
                </div>
                <div class="form-group" style="margin-bottom:1.5rem">
                    <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" name="preview" value="1" checked> Preview only (check)
                    </label>
                </div>
                <button type="submit" class="btn" style="width:100%">Process File</button>
                <div id="import-result" style="margin-top:1rem; white-space:pre-wrap; font-family:monospace; font-size:0.75rem; background:var(--wb-bg); padding:0.5rem; border-radius:var(--wb-radius); display:none;"></div>
            </form>
        `;
        const overlay = window.UI.showModal('Import Products', html);
        
        let lastPreviewVersions = null;

        document.getElementById('import-form').onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            if (lastPreviewVersions && !fd.get('preview')) {
                fd.append('pricing_versions', JSON.stringify(lastPreviewVersions));
            }
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const res = await window.Core.fetch('/admin/import', { method: 'POST', body: fd });
                const r = document.getElementById('import-result');
                r.style.display = 'block';
                r.innerHTML = `<strong>Result:</strong> Rows: ${res.rows}, Created: ${res.created}, Updated: ${res.updated}\n`;
                if (res.errors && res.errors.length) {
                    r.innerHTML += `\n<strong style="color:var(--wb-danger)">Errors:</strong>\n${esc(res.errors.join('\n'))}`;
                } else if (fd.get('preview')) {
                    if (res.pricing_versions) {
                        lastPreviewVersions = res.pricing_versions;
                    }
                    r.innerHTML += `\n<em>Check passed. Untick 'Preview only' and click again to apply.</em>`;
                } else if (!fd.get('preview')) {
                    window.Workbench.toast('Import completed', 'success');
                    setTimeout(() => { window.UI.closeModal(overlay); window.Router.route(); }, 1500);
                }
            } catch(err) { window.Workbench.toast(err.message, 'error'); }
            finally {
                btn.disabled = false;
            }
        };
    });
});

window.Router.add(/^admin\/orders$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/orders');
    const esc = window.Core.escapeHtml;
    
    const rows = data.orders.map(o => `
        <tr>
            <td><strong style="font-size:0.9375rem">${esc(o.number)}</strong></td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td>${esc(o.customer_name)}</td>
            <td>
                <select class="form-control action-status-select" data-id="${o.id}" data-current="${o.status}" style="padding:0.25rem 0.5rem; font-size:0.8125rem; height:auto;">
                    <option value="on_hold" ${o.status==='on_hold'?'selected':''}>On hold — awaiting payment</option>
                    <option value="processing" ${o.status==='processing'?'selected':''}>Processing</option>
                    <option value="shipped" ${o.status==='shipped'?'selected':''}>Shipped</option>
                    <option value="completed" ${o.status==='completed'?'selected':''}>Completed</option>
                    <option value="cancelled" ${o.status==='cancelled'?'selected':''}>Cancelled</option>
                </select>
            </td>
            <td>${esc(adminPaymentMethodLabel(o.payment_method))}</td>
            <td>${esc(o.shipping_method_name || '-')}</td>
            <td>${window.Core.formatMoney(o.total_cents, o.currency || 'CHF')}</td>
            <td><button type="button" class="btn btn-sm btn-outline action-track" data-id="${o.id}" data-tracking="${esc(o.tracking||'')}" data-status="${o.status}">T&T</button></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Order Management</h1>
        </div>
        ${renderTable(['Order #', 'Date', 'Customer', 'Status', 'Payment method', 'Shipping method', 'Total', 'Action'], rows, 'No orders found.')}
    `;
    root.innerHTML = adminLayout(content, 'orders');

    root.querySelectorAll('.action-status-select').forEach(s => {
        s.addEventListener('change', (e) => {
            const el = e.currentTarget;
            const id = parseInt(el.dataset.id, 10);
            const newStatus = el.value;
            const oldStatus = el.dataset.current;
            
            const html = `
                <form id="status-form">
                    <p style="margin-bottom:1rem; font-size:0.875rem;">Change status to <strong>${window.Workbench.statusMap[newStatus]?.label || newStatus}</strong>?</p>
                    <div class="form-group">
                        <label>Optional Note</label>
                        <textarea name="note" class="form-control" rows="2" placeholder="Reason or note for the customer..."></textarea>
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
                        <button type="submit" class="btn">Confirm</button>
                        <button type="button" class="btn btn-outline" id="cancel-status">Cancel</button>
                    </div>
                </form>
            `;
            const overlay = window.UI.showModal('Change Order Status', html);
            
            document.getElementById('cancel-status').onclick = () => {
                el.value = oldStatus;
                window.UI.closeModal(overlay);
            };
            
            document.getElementById('status-form').onsubmit = async (ev) => {
                ev.preventDefault();
                try {
                    await window.Core.fetch(`/admin/orders/${id}`, { method: 'PATCH', body: { status: newStatus, note: ev.target.note.value } });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast('Status updated successfully', 'success');
                    window.Router.route();
                } catch(err) { 
                    window.Workbench.toast(err.message, 'error'); 
                    el.value = oldStatus;
                }
            };
        });
    });
    
    root.querySelectorAll('.action-track').forEach(btn => btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        const id = parseInt(b.dataset.id, 10);
        const row = b.closest('tr');
        const statusSelect = row ? row.querySelector('.action-status-select') : null;
        const currentStatus = statusSelect ? statusSelect.value : b.dataset.status;
        
        const html = `
            <form id="tracking-form">
                <div class="form-group">
                    <label>Tracking URL</label>
                    <input type="url" name="tracking" value="${b.dataset.tracking}" class="form-control" placeholder="https://...">
                </div>
                <button type="submit" class="btn" style="width:100%; margin-top:1rem;">Save</button>
            </form>
        `;
        const overlay = window.UI.showModal('Update Tracking', html);
        document.getElementById('tracking-form').onsubmit = async (ev) => {
            ev.preventDefault();
            try {
                await window.Core.fetch(`/admin/orders/${id}`, { method: 'PATCH', body: { tracking: ev.target.tracking.value, status: currentStatus } });
                window.UI.closeModal(overlay);
                window.Workbench.toast('Tracking updated', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; }
        };
    }));
});

window.Router.add(/^admin\/customers$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/customers');
    const esc = window.Core.escapeHtml;
    
    const rows = data.customers.map(c => `
        <tr>
            <td><strong style="font-size:0.9375rem">${esc(c.name)}</strong><br><span style="font-size:0.75rem; color:var(--wb-text-muted)">${esc(c.email)}</span></td>
            <td>${esc(c.company)}</td>
            <td>
                <select class="form-control action-cust-select" data-id="${c.id}" data-field="status" style="padding:0.25rem 0.5rem; font-size:0.8125rem; height:auto;" ${c.id === window.Core.user.id ? 'disabled' : ''}>
                    <option value="pending" ${c.status==='pending'?'selected':''}>Pending</option>
                    <option value="active" ${c.status==='active'?'selected':''}>Active</option>
                    <option value="blocked" ${c.status==='blocked'?'selected':''}>Blocked</option>
                </select>
            </td>
            <td>
                <select class="form-control action-cust-select" data-id="${c.id}" data-field="group_id" style="padding:0.25rem 0.5rem; font-size:0.8125rem; height:auto;" ${c.id === window.Core.user.id ? 'disabled' : ''}>
                    ${data.groups.map(g => `<option value="${g.id}" ${c.group_id===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}
                </select>
            </td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Customer Management</h1>
        </div>
        ${renderTable(['Customer', 'Company', 'Access Status', 'Price Group'], rows, 'No customers found.')}
    `;
    root.innerHTML = adminLayout(content, 'customers');

    root.querySelectorAll('.action-cust-select').forEach(s => {
        s.addEventListener('change', async (e) => {
            const el = e.currentTarget;
            const id = parseInt(el.dataset.id, 10);
            const field = el.dataset.field;
            const payload = {};
            payload[field] = field === 'group_id' ? parseInt(el.value, 10) : el.value;
            try {
                await window.Core.fetch(`/admin/customers/${id}`, { method: 'PATCH', body: payload });
                window.Workbench.toast('Customer settings updated', 'success');
            } catch(err) { 
                window.Workbench.toast(err.message, 'error'); 
                window.Router.route(); 
            }
        });
    });
});

window.Router.add(/^admin\/settings$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/settings');
    const s = data.settings;
    
    const content = `
        <div class="page-header">
            <h1>Settings</h1>
        </div>
        <div class="card" style="max-width:800px">
            <form id="settings-form">
                <div class="form-section">
                    <h3 class="form-section-title">Finance & Logistics</h3>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Standard Shipping Cost (EUR)</label>
                            <input type="text" inputmode="decimal" name="shipping_eur" value="${s.shipping_eur_cents != null ? (s.shipping_eur_cents/100).toFixed(2) : ''}" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Free Shipping From (EUR)</label>
                            <input type="text" inputmode="decimal" name="free_shipping_eur" value="${s.free_shipping_eur_cents != null ? (s.free_shipping_eur_cents/100).toFixed(2) : ''}" class="form-control" required>
                        </div>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Standard VAT Rate (Basis Points, e.g. 2100 = 21%)</label>
                            <input type="number" name="tax_bps" value="${s.tax_bps||''}" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Low Stock Threshold (Quantity)</label>
                            <input type="number" name="low_stock_threshold" value="${s.low_stock_threshold ?? ''}" class="form-control" required>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn">Save Settings</button>
            </form>
        </div>
    `;
    root.innerHTML = adminLayout(content, 'settings');
    
    document.getElementById('settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        const shippingEurCents = window.Workbench.parseCentsStrict(fd.get('shipping_eur'));
        if (Number.isNaN(shippingEurCents) || shippingEurCents === null) return window.Workbench.toast('Invalid shipping amount', 'error');
        const freeShippingEurCents = window.Workbench.parseCentsStrict(fd.get('free_shipping_eur'));
        if (Number.isNaN(freeShippingEurCents) || freeShippingEurCents === null) return window.Workbench.toast('Invalid free shipping amount', 'error');

        const payload = Object.fromEntries(fd.entries());
        payload.shipping_eur_cents = shippingEurCents;
        payload.free_shipping_eur_cents = freeShippingEurCents;
        delete payload.shipping_eur;
        delete payload.free_shipping_eur;
        for (let k in payload) payload[k] = parseInt(payload[k], 10);
        try {
            await window.Core.fetch('/admin/settings', { method: 'PATCH', body: payload });
            window.Workbench.toast('Settings saved', 'success');
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; }
    };
});

window.Router.add(/^admin\/integrations$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/integrations');
    const esc = window.Core.escapeHtml;
    
    const rows = data.connections.map(c => `
        <tr><td><strong>${esc(c.name)}</strong></td><td>${window.Workbench.badge(c.mode)}</td><td>${window.Workbench.badge(c.status)}</td></tr>
    `).join('');
    
    const evRows = data.events.map(e => `
        <tr><td>${new Date(e.created_at).toLocaleString()}</td><td><span style="font-weight:600">${esc(e.type || 'simulated')}</span></td><td><pre style="margin:0; font-size:0.75rem; background:var(--wb-bg); padding:0.5rem; border-radius:var(--wb-radius);">${esc(JSON.stringify(e.payload))}</pre></td></tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>System Integrations (Simulation)</h1>
        </div>
        <div class="alert warning" style="margin-bottom:2rem">API and webhook connections are securely isolated on this server. You can test webhook payloads locally here without generating any external traffic.</div>
        
        <div class="grid-cols-2" style="margin-bottom:2rem; align-items:start;">
            <div>
                <h3 class="form-section-title">Current Connections</h3>
                ${renderTable(['System', 'Mode', 'Status'], rows, 'No connections recorded.')}
            </div>
            <div class="card">
                <h3 class="form-section-title">Simulate Webhook</h3>
                <form id="sim-form">
                    <div class="form-group">
                        <label>Simulation Event Type</label>
                        <select name="event" class="form-control">
                            <option value="stock">Stock Update (ERP Sync)</option>
                            <option value="shipment">Shipping Status Changed (WMS)</option>
                            <option value="payment">Payment Confirmed (PSP)</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-outline" style="width:100%">Trigger Event</button>
                </form>
            </div>
        </div>
        
        <h3 class="form-section-title">Intercepted Events Log</h3>
        ${renderTable(['Date', 'Event Type', 'JSON Payload'], evRows, 'No logged events.')}
    `;
    root.innerHTML = adminLayout(content, 'integrations');
    
    document.getElementById('sim-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/admin/integrations/simulate', { method: 'POST', body: { event: e.target.event.value } });
            window.Workbench.toast('Simulation completed', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; }
    };
});
