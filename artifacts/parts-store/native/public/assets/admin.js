// Admin Dashboard: Products, Orders, Customers and Settings

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
            'draft': { label: 'Draft', badge: 'warning' },
            'visible': { label: 'Visible', badge: 'success' },
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
    stripe: 'Card payment',
    swiss_qr_invoice: 'Pay Later (Swiss QR Code)',
    pay_later: 'Pay Later',
    test_invoice: 'Legacy test invoice',
    test_card: 'Legacy test card'
}[method] || method);
const adminPaymentMethodDefinitions = [
    {code: 'stripe', label: 'Card payment', help: 'Secure online card checkout. The invoice becomes available after payment is confirmed.'},
    {code: 'pay_later', label: 'Pay later', help: 'Switzerland uses the Swiss QR code on the invoice. Other European countries receive a normal invoice without Swiss QR.'}
];
const adminPaymentStateLabel = state => ({
    pending: 'Pending', authorized: 'Authorized', paid: 'Paid', failed: 'Failed',
    cancelled: 'Cancelled', refunded: 'Refunded', open: 'Invoice open'
}[state] || state || 'Pending');

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
            <div class="card"><div class="data-label">Low Stock</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0; color:var(--wb-danger)"><a href="${window.APP_BASE}admin/products?status=visible&stock=low_stock">${s.low_stock}</a></div></div>
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
    const imageReview = searchParams.get('image_review') || '';
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';
    const esc = window.Core.escapeHtml;

    const [catalogData, data, pricingMeta] = await Promise.all([
        window.Core.fetch('/catalog'),
        window.Core.fetch(`/admin/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&brand=${encodeURIComponent(brand)}&quality=${encodeURIComponent(quality)}&stock=${encodeURIComponent(stock)}&sort=${encodeURIComponent(sort)}&status=${encodeURIComponent(status)}&image_review=${encodeURIComponent(imageReview)}&page=${page}&limit=${limit}`),
        window.Core.fetch('/admin/prices?page=1&limit=1')
    ]);
    const stockThreshold = Number(data.stock_threshold ?? 5);
    const pricingGroupRank = group => {
        const name = String(group?.name || '').toLowerCase();
        if (name.includes('partner')) return 1;
        if (name.includes('wholesale')) return 2;
        if (name.includes('repair')) return 3;
        return 10;
    };
    const pricingGroupLabel = group => {
        const name = String(group?.name || '');
        const normalized = name.toLowerCase();
        if (normalized.includes('partner')) return 'Partner Price';
        if (normalized.includes('wholesale')) return 'Wholesale Price';
        if (normalized.includes('repair')) return 'Big Repair Shop Price';
        return `${name} Price`;
    };
    const customerGroups = [...(pricingMeta.groups || [])]
        .sort((a, b) => pricingGroupRank(a) - pricingGroupRank(b) || a.id - b.id);
    
    const rows = data.products.map(p => `
        <tr class="${!p.active ? 'archived-row' : ''}">
            <td><span style="font-size:0.75rem; color:var(--wb-text-muted)">${esc(p.sku)}</span></td>
            <td><strong><a href="${window.APP_BASE}admin/products/${p.id}">${esc(p.name)}</a></strong>${p.featured ? ' <span class="wb-badge wb-badge-warning" style="font-size:0.65rem">Featured</span>' : ''}${p.image_review_required ? ' <span class="wb-badge wb-badge-warning" style="font-size:0.65rem">Photo review</span>' : ''}</td>
            <td><span class="wb-badge ${p.stock <= stockThreshold ? 'wb-badge-warning' : 'wb-badge-neutral'}" style="font-weight:700">${p.stock} units${p.stock === 0 ? ' · Out of stock' : (p.stock <= stockThreshold ? ' · Low stock' : '')}</span></td>
            <td>${window.Workbench.badge(!p.active ? 'archived' : (p.publication_status || 'draft'))}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline action-quick-edit" data-id="${p.id}" data-stock="${p.stock}" data-version="${p.pricing_version ?? 0}" data-featured="${p.featured}">Quick Edit</button>
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
        
        <form id="admin-filter-form" class="admin-toolbar" style="margin-bottom:1.5rem;">
                <div class="form-group"><input type="text" name="q" value="${esc(q)}" class="form-control" placeholder="Search by name/SKU..."></div>
                <div class="form-group"><select name="category" class="form-control"><option value="">All Categories</option>${catsHtml}</select></div>
                <div class="form-group"><select name="brand" class="form-control"><option value="">All Brands</option>${brandsHtml}</select></div>
                <div class="form-group"><select name="quality" class="form-control"><option value="">All Qualities</option>${qualitiesHtml}</select></div>
                <div class="form-group">
                <select name="stock" class="form-control">
                    <option value="">All Stock</option>
                    <option value="in_stock" ${stock === 'in_stock' ? 'selected' : ''}>In stock</option>
                    <option value="low_stock" ${stock === 'low_stock' ? 'selected' : ''}>Low stock</option>
                    <option value="out_of_stock" ${stock === 'out_of_stock' ? 'selected' : ''}>Out of stock</option>
                </select>
                </div>
                <div class="form-group">
                <select name="status" class="form-control">
                    <option value="all" ${status === 'all' ? 'selected' : ''}>All products</option>
                    <option value="visible" ${status === 'visible' ? 'selected' : ''}>Visible</option>
                    <option value="draft" ${status === 'draft' ? 'selected' : ''}>Draft</option>
                    <option value="archived" ${status === 'archived' ? 'selected' : ''}>Archived Only</option>
                </select>
                </div>
                <div class="form-group">
                <select name="image_review" class="form-control">
                    <option value="">All photo states</option>
                    <option value="required" ${imageReview === 'required' ? 'selected' : ''}>Photo review required</option>
                </select>
                </div>
                <div class="form-group"><select name="sort" class="form-control"><option value="">Relevance</option><option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price ascending</option><option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price descending</option></select></div>
                <button type="submit" class="btn btn-outline" style="flex:0 0 auto;">Apply</button>
                <button type="button" class="btn btn-outline action-clear-filters" style="flex:0 0 auto;">Clear</button>
            </form>
        
        ${renderTable(['SKU', 'Name', 'Stock', 'Status', 'Actions'], rows, 'No products found.')}
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

    root.querySelectorAll('.action-quick-edit').forEach(btn => btn.addEventListener('click', async (e) => {
        const b = e.currentTarget;
        const id = parseInt(b.dataset.id, 10);
        const buttonText = b.textContent;
        b.disabled = true;
        b.textContent = 'Loading...';
        let detail;
        try {
            detail = await window.Core.fetch(`/admin/products/${id}`);
        } catch (err) {
            window.Workbench.toast(err.message, 'error');
            b.disabled = false;
            b.textContent = buttonText;
            return;
        }
        b.disabled = false;
        b.textContent = buttonText;
        const product = detail.product;
        const groupPrices = detail.group_prices || [];
        const groupPriceFields = customerGroups.map(group => {
            const existing = groupPrices.find(price => price.group_id === group.id);
            const value = existing?.price_eur_cents == null ? '' : (existing.price_eur_cents / 100).toFixed(2);
            return `
                <label class="quick-edit-group-price">
                    <span>${esc(pricingGroupLabel(group))}</span>
                    <div class="quick-edit-money-input">
                        <span>€</span>
                        <input type="text" inputmode="decimal" name="gp_eur_${group.id}" value="${value}" class="form-control" placeholder="Required to publish">
                    </div>
                </label>`;
        }).join('');
        const html = `
            <form id="quick-edit-form" class="admin-quick-edit">
                <input type="hidden" name="pricing_version" value="${product.pricing_version}">
                <div class="admin-quick-edit-main">
                    <div class="form-group">
                        <label>Current stock</label>
                        <input type="number" name="stock" value="${product.stock}" class="form-control" min="0" step="1" required>
                    </div>
                </div>
                <section class="quick-edit-group-prices">
                    <div class="quick-edit-section-head">
                        <div>
                            <h3>Customer group prices</h3>
                            <p>Set the explicit selling price for each customer group. Every group needs a price before the product can be published.</p>
                        </div>
                        <a href="${window.APP_BASE}admin/prices" class="text-sm">Open full price manager</a>
                    </div>
                    <div class="quick-edit-group-grid">${groupPriceFields || '<p class="text-muted">No customer groups configured.</p>'}</div>
                </section>
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
                const groupPricesPayload = customerGroups.map(group => {
                    const price = window.Workbench.parseCentsStrict(fd.get(`gp_eur_${group.id}`));
                    if (Number.isNaN(price)) throw new Error(`Invalid amount for ${group.name}`);
                    return {group_id: group.id, price_eur_cents: price};
                });

                await window.Core.fetch(`/admin/products/${id}`, { 
                    method: 'PATCH', 
                    body: { 
                        stock: parseInt(fd.get('stock'), 10),
                        group_prices: groupPricesPayload,
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
            window.Workbench.toast('Product restored as draft', 'success');
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
            <td><button type="button" class="admin-order-number action-order-view" data-id="${o.id}">${esc(o.number)}</button></td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td><strong>${esc(o.customer_name)}</strong><br><span class="text-muted text-sm">${esc(o.customer_email || '')}</span></td>
            <td>${window.Workbench.badge(o.status)}</td>
            <td>${esc(adminPaymentMethodLabel(o.payment_method))}<br><span class="wb-badge wb-badge-neutral">${esc(adminPaymentStateLabel(o.payment_state))}</span></td>
            <td>${esc(o.shipping_method_name || '-')}</td>
            <td>${window.Core.formatMoney(o.total_cents, o.currency || 'CHF')}</td>
            <td><div class="admin-order-actions"><button type="button" class="btn btn-sm btn-outline action-order-view" data-id="${o.id}">Quick view</button><button type="button" class="btn btn-sm btn-outline action-start-return" data-id="${o.id}">Start return</button><button type="button" class="btn btn-sm action-order-manage" data-id="${o.id}">Manage</button></div></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <div><h1>Order Management</h1><p class="text-muted">Open an order for products, address, payment and history. Use Manage to change fulfillment or tracking.</p></div>
        </div>
        ${renderTable(['Order #', 'Date', 'Customer', 'Fulfillment', 'Payment', 'Shipping method', 'Total', 'Action'], rows, 'No orders found.')}
    `;
    root.innerHTML = adminLayout(content, 'orders');

    const statusLabel = status => window.Workbench.statusMap[status]?.label || status;
    const allowedStatuses = {
        on_hold: ['on_hold', 'processing', 'cancelled'],
        processing: ['processing', 'shipped', 'cancelled'],
        shipped: ['shipped', 'completed'],
        completed: ['completed'],
        cancelled: ['cancelled', 'on_hold']
    };
    const openManage = order => {
        const options = (allowedStatuses[order.status] || [order.status]).map(status =>
            `<option value="${status}" ${status === order.status ? 'selected' : ''}>${esc(statusLabel(status))}</option>`
        ).join('');
        const html = `
            <form id="order-manage-form" class="admin-order-manage-form">
                <div class="admin-order-manage-summary"><span>${esc(order.number)}</span><strong>${window.Core.formatMoney(order.total_cents, order.currency || 'CHF')}</strong></div>
                <label class="form-group"><span>Fulfillment status</span><select name="status" class="form-control">${options}</select></label>
                <label class="form-group"><span>Tracking URL</span><input type="url" name="tracking" value="${esc(order.tracking || '')}" class="form-control" placeholder="https://..."></label>
                <label class="form-group"><span>Reason or customer note</span><textarea name="note" class="form-control" rows="3" placeholder="Required when cancelling; otherwise optional"></textarea></label>
                <div id="order-manage-warning" class="alert warning" style="display:none"></div>
                <div class="admin-order-modal-actions"><button type="button" class="btn btn-outline action-start-return">Start return</button><button type="button" class="btn btn-outline action-modal-close">Keep unchanged</button><button type="submit" class="btn">Save order</button></div>
            </form>`;
        const overlay = window.UI.showModal('Manage order', html);
        const form = document.getElementById('order-manage-form');
        const warning = document.getElementById('order-manage-warning');
        form.status.addEventListener('change', () => {
            const cancelling = form.status.value === 'cancelled' && order.status !== 'cancelled';
            const reopening = order.status === 'cancelled' && form.status.value === 'on_hold';
            warning.textContent = cancelling
                ? 'Cancelling restores the reserved stock. Add a reason before saving.'
                : (reopening ? 'Reopening reserves the products again and only succeeds when enough stock is available.' : '');
            warning.style.display = cancelling || reopening ? 'block' : 'none';
        });
        form.querySelector('.action-modal-close').onclick = () => window.UI.closeModal(overlay);
        form.querySelector('.action-start-return').onclick = async () => {
            const control = form.querySelector('.action-start-return');
            control.disabled = true;
            try {
                window.UI.closeModal(overlay);
                openRmaWorkspace(await window.Core.fetch(`/admin/orders/${order.id}`));
            } catch (error) {
                window.Workbench.toast(error.message, 'error');
                control.disabled = false;
            }
        };
        form.onsubmit = async event => {
            event.preventDefault();
            const cancelling = form.status.value === 'cancelled' && order.status !== 'cancelled';
            if (cancelling && !form.note.value.trim()) {
                warning.textContent = 'Enter a cancellation reason before saving.';
                warning.style.display = 'block';
                form.note.focus();
                return;
            }
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                await window.Core.fetch(`/admin/orders/${order.id}`, {method:'PATCH', body:{status:form.status.value, tracking:form.tracking.value, note:form.note.value}});
                window.UI.closeModal(overlay);
                window.Workbench.toast('Order updated', 'success');
                window.Router.route();
            } catch (error) {
                window.Workbench.toast(error.message, 'error');
                submit.disabled = false;
            }
        };
    };
    const loadOrder = id => window.Core.fetch(`/admin/orders/${id}`);
    root.querySelectorAll('.action-order-view').forEach(button => button.addEventListener('click', async () => {
        const buttonText = button.textContent;
        button.disabled = true;
        try {
            const detail = await loadOrder(parseInt(button.dataset.id, 10));
            const o = detail.order;
            const a = detail.address || {};
            const itemRows = detail.items.map(item => `<tr><td><strong>${esc(item.name)}</strong><br><span class="text-muted text-sm">${esc(item.sku)}</span></td><td>${item.quantity}</td><td>${window.Core.formatMoney(item.price_cents, o.currency)}</td><td>${window.Core.formatMoney(item.total_cents, o.currency)}</td></tr>`).join('');
            const history = detail.events.map(event => `<li><strong>${esc(statusLabel(event.status))}</strong><span>${new Date(event.created_at).toLocaleString()}</span>${event.note ? `<p>${esc(event.note)}</p>` : ''}</li>`).join('');
            const address = [a.company, a.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).map(esc).join('<br>');
            const html = `
                <div class="admin-order-quick">
                    <div class="admin-order-quick-head"><div><span class="text-muted text-sm">Order</span><h3>${esc(o.number)}</h3><p>${esc(o.customer_name)} · ${esc(o.customer_email)}</p></div><div class="admin-order-quick-total">${window.Core.formatMoney(o.total_cents, o.currency)}</div></div>
                    <div class="admin-order-facts"><div><span>Fulfillment</span>${window.Workbench.badge(o.status)}</div><div><span>Payment</span><strong>${esc(adminPaymentMethodLabel(o.payment_method))}</strong><small>${esc(adminPaymentStateLabel(o.payment_state))}</small></div><div><span>Shipping</span><strong>${esc(o.shipping_method_name || '-')}</strong><small>${o.tracking ? `<a href="${esc(o.tracking)}" target="_blank" rel="noopener">Track parcel</a>` : 'No tracking yet'}</small></div></div>
                    <h4>Products</h4><div class="table-responsive"><table class="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table></div>
                    <div class="admin-order-quick-grid"><section><h4>Billing / delivery address</h4><p>${address || 'No address recorded'}</p></section><section><h4>Totals</h4><dl><div><dt>Subtotal</dt><dd>${window.Core.formatMoney(o.subtotal_cents, o.currency)}</dd></div><div><dt>VAT</dt><dd>${window.Core.formatMoney(o.tax_cents, o.currency)}</dd></div><div><dt>Shipping</dt><dd>${window.Core.formatMoney(o.shipping_cents, o.currency)}</dd></div><div><dt>Total</dt><dd><strong>${window.Core.formatMoney(o.total_cents, o.currency)}</strong></dd></div></dl></section></div>
                    ${o.notes ? `<section><h4>Customer note</h4><p>${esc(o.notes)}</p></section>` : ''}
                    <section><h4>History</h4><ol class="admin-order-history">${history || '<li>No history recorded</li>'}</ol></section>
                    <div class="admin-order-modal-actions"><button type="button" class="btn btn-outline action-modal-close">Close</button><button type="button" class="btn btn-outline action-quick-return">Start return</button><button type="button" class="btn action-quick-manage">Manage order</button></div>
                </div>`;
            const overlay = window.UI.showModal('Order details', html, {wide:true});
            document.querySelector('.admin-order-quick .action-modal-close').onclick = () => window.UI.closeModal(overlay);
            document.querySelector('.admin-order-quick .action-quick-manage').onclick = () => {
                window.UI.closeModal(overlay);
                openManage(o);
            };
            document.querySelector('.admin-order-quick .action-quick-return').onclick = () => {
                window.UI.closeModal(overlay);
                openRmaWorkspace(detail);
            };
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = buttonText;
        }
    }));
    root.querySelectorAll('.action-order-manage').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            const detail = await loadOrder(parseInt(button.dataset.id, 10));
            openManage(detail.order);
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }));
    root.querySelectorAll('.action-start-return').forEach(button => button.addEventListener('click', async () => {
        const label = button.textContent;
        button.disabled = true;
        button.textContent = 'Loading…';
        try {
            openRmaWorkspace(await loadOrder(parseInt(button.dataset.id, 10)));
        } catch (error) {
            window.Workbench.toast(error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    }));
});

/* RMA workspace is kept here with order management so a return always begins
   with the original order lines, rather than a blanket "return everything". */
function rmaIdempotencyKey() {
    return window.crypto?.randomUUID?.() || `rma-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openRmaWorkspace(orderDetail, returnDetail) {
    const esc = window.Core.escapeHtml;
    const order = orderDetail.order || returnDetail?.order || {};
    const rma = returnDetail?.return;
    const settlement = returnDetail?.settlement || null;
    const creditNote = returnDetail?.credit_note || null;
    const creditApplications = returnDetail?.credit_applications || [];
    const currency = rma?.currency || order.currency || 'CHF';
    const sourceItems = returnDetail?.items || orderDetail.items || [];
    const itemId = item => item.return_item_id || item.id;
    const orderItemId = item => item.order_item_id || item.id;
    const itemName = item => item.name || item.product_name || item.sku || `Item #${itemId(item)}`;
    const available = item => Math.max(0, Number(item.available_quantity ?? item.returnable_quantity ?? ((item.ordered_quantity ?? item.quantity ?? 0) - (item.previously_returned_quantity ?? item.previously_returned ?? 0))));
    const paidWithStripe = String(order.payment_method || '').toLowerCase() === 'stripe' && ['paid', 'authorized'].includes(String(order.payment_state || '').toLowerCase());
    const creditFor = (item, qty) => Number(item.credit_cents ?? item.line_credit_cents ?? item.price_cents ?? 0) * qty;
    const lineRows = sourceItems.map(item => {
        const qty = rma ? Number(item.quantity ?? item.return_quantity ?? 0) : available(item);
        const max = rma ? qty : available(item);
        return `<tr data-rma-line data-credit="${Number(item.credit_cents ?? item.line_credit_cents ?? item.price_cents ?? 0)}">
            <td><strong>${esc(itemName(item))}</strong><small>${esc(item.sku || '')}</small></td>
            <td>${rma ? `${item.ordered_quantity ?? item.ordered ?? '—'} ordered<br><span class="text-muted">${item.previously_returned_quantity ?? item.previously_returned ?? 0} previously returned</span>` : `${max} available to return`}</td>
            <td>${rma
                ? `<input type="number" class="form-control rma-received" min="0" max="${qty}" value="${item.received_quantity ?? qty}"><span class="rma-of">of ${qty} requested</span>`
                : `<label class="rma-select"><input type="checkbox" class="rma-selected"> <input type="number" class="form-control rma-quantity" min="1" max="${max}" value="${max}" ${max ? '' : 'disabled'}></label>`}</td>
            ${rma ? `<td><input type="number" class="form-control rma-restock" min="0" max="${qty}" value="${item.restock_quantity ?? item.received_quantity ?? qty}"></td>
                <td><select class="form-control rma-disposition"><option value="restock" ${(item.disposition || 'restock') === 'restock' ? 'selected' : ''}>Restock</option><option value="quarantine" ${item.disposition === 'quarantine' ? 'selected' : ''}>Quarantine</option><option value="writeoff" ${item.disposition === 'writeoff' ? 'selected' : ''}>Write off</option></select></td>` : ''}
        </tr>`;
    }).join('');
    const timeline = (returnDetail?.events || rma?.events || []).map(event =>
        `<li><strong>${esc(window.Workbench.statusMap[event.status]?.label || event.status || 'Update')}</strong><span>${event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span>${event.note ? `<p>${esc(event.note)}</p>` : ''}</li>`
    ).join('') || '<li><span>Return created; awaiting the next action.</span></li>';
    const title = rma ? `Manage RMA ${esc(rma.number || `#${rma.id}`)}` : `Start return · ${esc(order.number || `Order #${order.id}`)}`;
    const html = `<form class="rma-workspace" id="rma-workspace-form">
        <header class="rma-summary">
            <div><p class="rma-eyebrow">${rma ? 'Return merchandise authorization' : 'New return from order'}</p><h3>${esc(order.number || `Order #${order.id}`)}</h3><p>${esc(order.customer_name || returnDetail?.customer?.name || '')} · ${esc(order.customer_email || returnDetail?.customer?.email || '')}</p></div>
            <div class="rma-summary-status">${rma ? window.Workbench.badge(rma.status) : '<span class="wb-badge wb-badge-warning">Draft selection</span>'}<strong>${window.Core.formatMoney(order.total_cents || 0, currency)}</strong><small>${esc(adminPaymentMethodLabel(order.payment_method))} · ${esc(adminPaymentStateLabel(order.payment_state))}</small></div>
        </header>
        <section class="rma-section"><div class="rma-section-head"><div><h4>${rma ? 'Inspection and disposition' : 'Select products and quantities'}</h4><p>${rma ? 'Received quantity is what arrived. Only Restock returns saleable units to stock.' : 'Choose only the lines and units being returned. Nothing is preselected.'}</p></div></div>
        <div class="table-responsive"><table class="data-table rma-lines"><thead><tr><th>Product</th><th>${rma ? 'Order history' : 'Returnable'}</th><th>${rma ? 'Received' : 'Return quantity'}</th>${rma ? '<th>Restock</th><th>Disposition</th>' : ''}</tr></thead><tbody>${lineRows || '<tr><td colspan="5">No returnable items found.</td></tr>'}</tbody></table></div></section>
        ${!rma ? `<section class="rma-section rma-create-fields"><label>Reason<select class="form-control" name="reason" required><option value="">Choose a reason…</option><option>Wrong item</option><option>Defective or damaged</option><option>Not needed</option><option>Other</option></select></label><label>Internal note <span>optional</span><textarea class="form-control" name="note" rows="2" placeholder="Context for the receiving team"></textarea></label><p class="rma-create-preview">Estimated line credit: <strong>${window.Core.formatMoney(0, currency)}</strong><br><span>Final credit is determined from the backend after inspection.</span></p></section>` : `
        <section class="rma-section rma-finance"><div><h4>Credit / refund status</h4><p class="rma-credit-preview">${settlement ? 'Settled amount' : 'Credit preview'}: <strong>${window.Core.formatMoney(Number(settlement?.amount_cents ?? rma.credit_cents ?? 0), currency)}</strong></p><p>${paidWithStripe ? 'This paid card order is refunded through Stripe only after provider confirmation.' : 'This invoice / Pay Later order is settled as an invoice credit; it is not a Stripe refund.'}</p>${creditNote ? `<div class="rma-credit-note"><strong>Credit note ${esc(creditNote.number)}</strong><span>${window.Core.formatMoney(Number(creditNote.issued_cents || 0), currency)} issued</span><span>${window.Core.formatMoney(Number(creditApplications.reduce((sum, application) => sum + Number(application.amount_cents || 0), 0)), currency)} applied to invoice</span><span>${window.Core.formatMoney(Number(creditNote.remaining_cents || 0), currency)} available account credit</span></div>` : ''}${settlement?.provider_reference ? `<p><strong>Provider refund:</strong> ${esc(settlement.provider_reference)}</p>` : ''}${settlement?.error_message ? `<p class="rma-settlement-error">${esc(settlement.error_message)}</p>` : ''}</div><div>${window.Workbench.badge(settlement?.status, settlement ? settlement.status : 'Not settled')}</div></section>
        <section class="rma-section"><label>Staff note<textarea class="form-control" name="note" rows="2" placeholder="Inspection findings or decision"></textarea></label></section>
        <section class="rma-section"><h4>Timeline</h4><ol class="rma-timeline">${timeline}</ol></section>`}
        <div class="rma-error" role="alert" hidden></div>
        <div class="admin-order-modal-actions"><button type="button" class="btn btn-outline rma-close">${rma && ['credited', 'rejected'].includes(rma.status) ? 'Close' : 'Cancel'}</button>${rma ? `${['submitted', 'approved'].includes(rma.status) ? '<button type="button" class="btn btn-outline rma-reject">Reject RMA</button>' : ''}${rma.status === 'submitted' ? '<button type="button" class="btn rma-approve">Approve</button>' : ''}${rma.status === 'approved' && (!settlement || settlement.status === 'failed') ? `<button type="submit" class="btn rma-settle">${settlement?.status === 'failed' ? 'Retry refund' : 'Settle credit'}</button>` : ''}` : '<button type="submit" class="btn rma-create">Create RMA</button>'}</div>
    </form>`;
    const overlay = window.UI.showModal(title, html, {wide:true});
    const form = overlay.querySelector('#rma-workspace-form');
    const errorBox = form.querySelector('.rma-error');
    const showError = error => { errorBox.textContent = error.message || error; errorBox.hidden = false; };
    form.querySelector('.rma-close').onclick = () => window.UI.closeModal(overlay);
    const setBusy = (button, busy, label) => { button.disabled = busy; if (busy) button.dataset.label = button.textContent; button.textContent = busy ? label : (button.dataset.label || button.textContent); };
    if (!rma) {
        const updatePreview = () => {
            const cents = [...form.querySelectorAll('[data-rma-line]')].reduce((total, row) => {
                if (!row.querySelector('.rma-selected')?.checked) return total;
                return total + Number(row.dataset.credit || 0) * Number(row.querySelector('.rma-quantity').value || 0);
            }, 0);
            form.querySelector('.rma-create-preview strong').textContent = window.Core.formatMoney(cents, currency);
        };
        form.querySelectorAll('.rma-selected, .rma-quantity').forEach(control => control.addEventListener('input', () => {
            const row = control.closest('tr'); const selected = row.querySelector('.rma-selected');
            if (control.classList.contains('rma-quantity')) selected.checked = true;
            updatePreview();
        }));
        form.onsubmit = async event => {
            event.preventDefault();
            const submit = form.querySelector('.rma-create');
            const items = [...form.querySelectorAll('[data-rma-line]')].filter(row => row.querySelector('.rma-selected')?.checked).map(row => ({order_item_id: orderItemId(sourceItems[[...form.querySelectorAll('[data-rma-line]')].indexOf(row)]), quantity: Number(row.querySelector('.rma-quantity').value)})).filter(item => item.quantity > 0);
            if (!items.length) return showError('Select at least one product and a quantity to create an RMA.');
            setBusy(submit, true, 'Creating…'); errorBox.hidden = true;
            try {
                const result = await window.Core.fetch(`/admin/orders/${order.id}/returns`, {method:'POST', body:{items, reason:form.reason.value, note:form.note.value, idempotency_key:rmaIdempotencyKey()}});
                window.UI.closeModal(overlay);
                window.Workbench.toast(`RMA ${result.return?.number || 'created'}`, 'success');
                if (result.return?.id) openRmaWorkspace({}, await window.Core.fetch(`/admin/returns/${result.return.id}`));
            } catch (error) { showError(error); setBusy(submit, false); }
        };
        return;
    }
    const action = async (status, button) => {
        if (!window.confirm(`${status === 'rejected' ? 'Reject' : 'Approve'} this RMA?`)) return;
        setBusy(button, true, 'Saving…'); errorBox.hidden = true;
        try { await window.Core.fetch(`/admin/returns/${rma.id}`, {method:'PATCH', body:{status, note:form.note.value}}); window.Workbench.toast('RMA updated', 'success'); window.UI.closeModal(overlay); window.Router.route(); } catch (error) { showError(error); setBusy(button, false); }
    };
    const approveButton = form.querySelector('.rma-approve');
    const rejectButton = form.querySelector('.rma-reject');
    if (approveButton) approveButton.onclick = () => action('approved', approveButton);
    if (rejectButton) rejectButton.onclick = () => action('rejected', rejectButton);
    form.querySelectorAll('.rma-disposition').forEach(select => {
        const restock = select.closest('tr')?.querySelector('.rma-restock');
        const syncRestock = () => {
            if (!restock) return;
            const canRestock = select.value === 'restock';
            restock.disabled = !canRestock;
            if (!canRestock) restock.value = '0';
        };
        select.addEventListener('change', syncRestock);
        syncRestock();
    });
    form.onsubmit = async event => {
        event.preventDefault();
        const submit = form.querySelector('.rma-settle');
        if (!submit) return;
        if (!window.confirm(`Confirm financial settlement of this RMA. ${paidWithStripe ? 'A Stripe refund is only marked successful if the server confirms it.' : 'An invoice credit will be recorded.'}`)) return;
        const items = [...form.querySelectorAll('[data-rma-line]')].map((row, index) => ({return_item_id:itemId(sourceItems[index]), received_quantity:Number(row.querySelector('.rma-received').value), restock_quantity:Number(row.querySelector('.rma-restock').value), disposition:row.querySelector('.rma-disposition').value}));
        setBusy(submit, true, 'Settling…'); errorBox.hidden = true;
        try {
            const result = await window.Core.fetch(`/admin/returns/${rma.id}/settle`, {method:'POST', body:{lines:items, note:form.note.value, idempotency_key:settlement?.idempotency_key || rmaIdempotencyKey()}});
            const outcome = result.settlement?.status || result.return?.settlement?.status;
            window.Workbench.toast(outcome === 'succeeded' ? 'Settlement completed; Stripe refund succeeded.' : 'Settlement submitted. Review the returned credit/refund status.', outcome === 'succeeded' ? 'success' : 'info');
            window.UI.closeModal(overlay); window.Router.route();
        } catch (error) { showError(error); setBusy(submit, false); }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    /* admin-operations ships legacy routes; replace only those route entries,
       leaving customer self-service returns entirely untouched. */
    window.Router.routes = window.Router.routes.filter(route => !['^admin\\/returns$', '^admin\\/returns\\/(\\d+)$'].includes(route.pattern.source));
    window.Router.add(/^admin\/returns$/, async (match, root, params) => {
        if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
        const data = await window.Core.fetch('/admin/returns');
        const esc = window.Core.escapeHtml;
        const status = params.get('status') || 'all';
        const returns = (data.returns || []).filter(r => status === 'all' || r.status === status);
        const counts = (data.returns || []).reduce((all, r) => { all[r.status] = (all[r.status] || 0) + 1; return all; }, {});
        const filters = ['all', 'submitted', 'received', 'assessed', 'approved', 'credited', 'rejected'];
        root.innerHTML = adminLayout(`<div class="page-header"><div><h1>Returns Management</h1><p class="text-muted">Review incoming RMAs, inspect inventory and settle credits with an auditable workflow.</p></div></div>
            <div class="rma-status-summary">${filters.map(value => `<a href="${window.APP_BASE}admin/returns${value === 'all' ? '' : `?status=${value}`}" class="${status === value ? 'active' : ''}"><span>${esc(value === 'all' ? 'All RMAs' : (window.Workbench.statusMap[value]?.label || value))}</span><strong>${value === 'all' ? (data.returns || []).length : (counts[value] || 0)}</strong></a>`).join('')}</div>
            ${renderTable(['RMA', 'Created', 'Customer / order', 'Status', 'Credit', 'Action'], returns.map(r => `<tr><td><strong>${esc(r.number)}</strong></td><td>${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td><td><strong>${esc(r.customer_name || '')}</strong><br><span class="text-muted text-sm">${esc(r.order_number || '')}</span></td><td>${window.Workbench.badge(r.status)}</td><td>${window.Core.formatMoney(r.credit_cents || 0, r.currency || 'CHF')}</td><td><button class="btn btn-sm action-rma-manage" data-id="${r.id}">Manage RMA</button></td></tr>`).join(''), 'No RMAs match this view.')}`, 'returns');
        root.querySelectorAll('.action-rma-manage').forEach(button => button.onclick = async () => { button.disabled = true; try { openRmaWorkspace({}, await window.Core.fetch(`/admin/returns/${button.dataset.id}`)); } catch (error) { window.Workbench.toast(error.message, 'error'); button.disabled = false; } });
    });
    window.Router.add(/^admin\/returns\/(\d+)$/, async (match) => {
        openRmaWorkspace({}, await window.Core.fetch(`/admin/returns/${match[1]}`));
    });
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
            <td class="customer-payment-controls">
                <div class="customer-payment-summary">
                    ${adminPaymentMethodDefinitions.map(method => c.payment_entitlements?.[method.code]
                        ? `<span class="wb-badge wb-badge-success">${esc(method.label)}</span>` : '').join('') || '<span class="text-muted">No payment options enabled</span>'}
                </div>
                <button type="button" class="btn btn-outline btn-sm action-payment-options" data-id="${c.id}">Manage payment options</button>
            </td>
            <td><button type="button" class="btn btn-outline btn-sm action-customer-application" data-id="${c.id}">Manage customer</button></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Customer Management</h1>
        </div>
        ${renderTable(['Customer', 'Company', 'Access Status', 'Price Group', 'Payment entitlements', 'Customer'], rows, 'No customers found.')}
    `;
    root.innerHTML = adminLayout(content, 'customers');

    root.querySelectorAll('.action-customer-application').forEach(button => {
        button.addEventListener('click', async () => {
            const id = parseInt(button.dataset.id, 10);
            const overlay = window.UI.showModal('Customer workspace', '<div class="customer-workspace-state">Loading customer details…</div>', {wide: true});
            const body = overlay.querySelector('.modal-body');
            const activityLabels = {repair_shop:'Repair shop',reseller:'Reseller / retailer',refurbisher:'Refurbisher',wholesaler:'Wholesaler',education:'Education / training',other:'Other'};
            const value = candidate => candidate ? esc(String(candidate)) : '<span class="text-muted">Not provided</span>';
            const addressLines = address => [
                address?.name,
                address?.company,
                address?.line1,
                address?.line2,
                [address?.postal_code, address?.city].filter(Boolean).join(' '),
                address?.country
            ].filter(Boolean).map(line => esc(String(line))).join('<br>');
            const addressForm = (address = {}, shipping = false) => `
                <form class="customer-address-form" data-address-form>
                    <p class="customer-form-help"><strong>* Required</strong> fields are needed to save this ${shipping ? 'shipping location' : 'billing address'}.</p>
                    <div class="customer-address-grid">
                        <label>Label <span aria-hidden="true">*</span><input class="form-control" name="label" value="${esc(address.label || (shipping ? '' : 'Billing address'))}" required placeholder="e.g. Head office"></label>
                        <label>Contact name <span aria-hidden="true">*</span><input class="form-control" name="name" value="${esc(address.name || '')}" required autocomplete="name"></label>
                        <label>Company <small>Optional</small><input class="form-control" name="company" value="${esc(address.company || '')}" autocomplete="organization"></label>
                        <label>Address line 1 <span aria-hidden="true">*</span><input class="form-control" name="line1" value="${esc(address.line1 || '')}" required autocomplete="address-line1"></label>
                        <label class="customer-address-wide">Address line 2 <small>Optional</small><input class="form-control" name="line2" value="${esc(address.line2 || '')}" autocomplete="address-line2"></label>
                        <label>Postal code <span aria-hidden="true">*</span><input class="form-control" name="postal_code" value="${esc(address.postal_code || '')}" required autocomplete="postal-code"></label>
                        <label>City <span aria-hidden="true">*</span><input class="form-control" name="city" value="${esc(address.city || '')}" required autocomplete="address-level2"></label>
                        <label>Country <span aria-hidden="true">*</span><input class="form-control" name="country" value="${esc(address.country || '')}" required minlength="2" maxlength="2" pattern="[A-Za-z]{2}" placeholder="CH" autocomplete="country"></label>
                    </div>
                    ${shipping ? `<label class="customer-default-choice"><input type="checkbox" name="is_default" ${address.is_default ? 'checked' : ''}> Set as primary shipping location</label>` : ''}
                    <div class="modal-actions"><button type="button" class="btn btn-outline" data-form-cancel>Cancel</button><button type="submit" class="btn">Save ${shipping ? 'location' : 'billing address'}</button></div>
                </form>`;
            const formPayload = form => {
                const fd = new FormData(form);
                const payload = Object.fromEntries(fd.entries());
                payload.country = payload.country.trim().toUpperCase();
                if (form.elements.is_default) payload.is_default = fd.get('is_default') ? 1 : 0;
                return payload;
            };
            const showAddressEditor = (address, shipping) => {
                body.innerHTML = addressForm(address, shipping);
                const form = body.querySelector('[data-address-form]');
                form.querySelector('[data-form-cancel]').onclick = render;
                form.onsubmit = async event => {
                    event.preventDefault();
                    const submit = form.querySelector('[type="submit"]');
                    submit.disabled = true;
                    try {
                        const endpoint = shipping
                            ? `/admin/customers/${id}/addresses${address?.id ? `/${address.id}` : ''}`
                            : `/admin/customers/${id}/billing`;
                        await window.Core.fetch(endpoint, {
                            method: shipping ? (address?.id ? 'PATCH' : 'POST') : 'PUT',
                            body: formPayload(form)
                        });
                        window.Workbench.toast('Address saved', 'success');
                        await render();
                    } catch (error) {
                        window.Workbench.toast(error.message, 'error');
                        submit.disabled = false;
                    }
                };
            };
            const render = async () => {
                body.innerHTML = '<div class="customer-workspace-state">Refreshing customer details…</div>';
                try {
                    const detail = await window.Core.fetch(`/admin/customers/${id}/detail`);
                    const customer = detail.customer || {};
                    const shipping = detail.shipping_addresses || [];
                    const billing = detail.billing_address || {};
                    const recentOrders = detail.recent_orders || [];
                    body.innerHTML = `
                        <div class="customer-workspace">
                            <header class="customer-workspace-summary">
                                <div><p class="customer-workspace-eyebrow">Customer record</p><h3>${value(customer.company || customer.name)}</h3><p>${value(customer.name)} · ${value(customer.email)}</p></div>
                                <div class="customer-workspace-status"><span class="wb-badge ${customer.status === 'active' ? 'wb-badge-success' : ''}">${value(customer.status)}</span><span>${value(customer.phone)}</span></div>
                            </header>
                            <section class="customer-workspace-section">
                                <h4>Business verification</h4>
                                <dl class="customer-workspace-facts">
                                    <div><dt>Company</dt><dd>${value(customer.company)}</dd></div><div><dt>Business type</dt><dd>${value((customer.business_type || '').replaceAll('_', ' '))}</dd></div>
                                    <div><dt>Main activity</dt><dd>${value(activityLabels[customer.business_activity] || customer.business_activity)}</dd></div><div><dt>Username</dt><dd>${value(customer.username)}</dd></div>
                                    <div><dt>${customer.tax_registration_type === 'ch_uid' ? 'Swiss UID' : 'VAT / registration number'}</dt><dd>${value(customer.tax_registration_number)}</dd></div><div><dt>EORI number</dt><dd>${value(customer.eori_number)}</dd></div>
                                    <div><dt>State / province</dt><dd>${value(customer.billing_state)}</dd></div><div><dt>Terms accepted</dt><dd>${value(customer.terms_accepted_at)}</dd></div>
                                </dl>
                            </section>
                            <section class="customer-workspace-section">
                                <div class="customer-section-heading"><div><h4>Billing address</h4><p>Used for invoices and account records.</p></div><button type="button" class="btn btn-outline btn-sm action-edit-billing">Edit billing</button></div>
                                <div class="customer-address-card">${addressLines(billing) || '<span class="text-muted">No billing address on file.</span>'}</div>
                            </section>
                            <section class="customer-workspace-section">
                                <div class="customer-section-heading"><div><h4>Shipping locations</h4><p>Choose the primary delivery location for this customer.</p></div><button type="button" class="btn btn-sm action-add-shipping">Add shipping location</button></div>
                                <div class="customer-shipping-list">${shipping.length ? shipping.map(address => `<article class="customer-shipping-card"><div><div class="customer-shipping-title">${esc(address.label || 'Shipping location')} ${address.is_default ? '<span class="wb-badge wb-badge-success">Primary</span>' : ''}</div><p>${addressLines(address)}</p></div><div class="customer-shipping-actions"><button type="button" class="btn btn-outline btn-sm action-edit-shipping" data-id="${address.id}">Edit</button>${address.is_default ? '' : `<button type="button" class="btn btn-outline btn-sm action-primary-shipping" data-id="${address.id}">Set primary</button>`}<button type="button" class="btn btn-outline btn-sm action-delete-shipping" data-id="${address.id}">Delete</button></div></article>`).join('') : '<div class="customer-address-card text-muted">No shipping locations on file.</div>'}</div>
                            </section>
                            ${recentOrders.length ? `<section class="customer-workspace-section"><h4>Recent orders</h4><div class="customer-recent-orders">${recentOrders.slice(0, 5).map(order => `<div><strong>${esc(order.order_number || order.number || `#${order.id}`)}</strong><span>${esc(order.status || '')}</span></div>`).join('')}</div></section>` : ''}
                        </div>`;
                    body.querySelector('.action-edit-billing').onclick = () => showAddressEditor(billing, false);
                    body.querySelector('.action-add-shipping').onclick = () => showAddressEditor({}, true);
                    body.querySelectorAll('.action-edit-shipping').forEach(control => control.onclick = () => showAddressEditor(shipping.find(address => address.id === parseInt(control.dataset.id, 10)), true));
                    body.querySelectorAll('.action-primary-shipping').forEach(control => control.onclick = async () => {
                        control.disabled = true;
                        try { await window.Core.fetch(`/admin/customers/${id}/addresses/${control.dataset.id}`, {method: 'PATCH', body: {is_default: 1}}); await render(); window.Workbench.toast('Primary shipping location updated', 'success'); } catch (error) { window.Workbench.toast(error.message, 'error'); control.disabled = false; }
                    });
                    body.querySelectorAll('.action-delete-shipping').forEach(control => control.onclick = async () => {
                        if (!window.confirm('Delete this shipping location? This cannot be undone.')) return;
                        control.disabled = true;
                        try { await window.Core.fetch(`/admin/customers/${id}/addresses/${control.dataset.id}`, {method: 'DELETE'}); await render(); window.Workbench.toast('Shipping location deleted', 'success'); } catch (error) { window.Workbench.toast(error.message || 'This shipping location cannot be deleted.', 'error'); control.disabled = false; }
                    });
                } catch (error) {
                    body.innerHTML = `<div class="customer-workspace-state customer-workspace-error">Could not load customer details. ${esc(error.message)} <button type="button" class="btn btn-outline btn-sm action-retry-customer">Try again</button></div>`;
                    body.querySelector('.action-retry-customer').onclick = render;
                }
            };
            await render();
        });
    });

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
    root.querySelectorAll('.action-payment-options').forEach(button => {
        button.addEventListener('click', () => {
            const customer = data.customers.find(item => item.id === parseInt(button.dataset.id, 10));
            if (!customer) return;
            const html = `
                <form id="customer-payment-options-form" class="customer-payment-options-form">
                    <p class="customer-payment-options-intro">Choose which payment methods <strong>${esc(customer.company || customer.name)}</strong> may use at checkout.</p>
                    <div class="customer-payment-option-list">
                        ${adminPaymentMethodDefinitions.map(method => `
                            <label class="customer-payment-option">
                                <span class="customer-payment-option-copy">
                                    <strong>${esc(method.label)}</strong>
                                    <small>${esc(method.help)}</small>
                                </span>
                                <input type="checkbox" name="${method.code}" ${customer.payment_entitlements?.[method.code] ? 'checked' : ''}>
                                <span class="customer-payment-switch" aria-hidden="true"></span>
                            </label>`).join('')}
                    </div>
                    <div class="customer-payment-options-note">Checkout always rechecks these permissions on the server. Swiss QR invoice also requires a Swiss delivery address.</div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-outline" data-modal-close>Cancel</button>
                        <button type="submit" class="btn">Save payment options</button>
                    </div>
                </form>`;
            const overlay = window.UI.showModal('Payment options', html);
            const form = document.getElementById('customer-payment-options-form');
            form.querySelector('[data-modal-close]').addEventListener('click', () => window.UI.closeModal(overlay));
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const submit = form.querySelector('[type="submit"]');
                submit.disabled = true;
                try {
                    const payment_entitlements = Object.fromEntries(
                        adminPaymentMethodDefinitions.map(method => [method.code, form.elements[method.code].checked])
                    );
                    const response = await window.Core.fetch(`/admin/customers/${customer.id}`, {
                        method: 'PATCH',
                        body: {payment_entitlements}
                    });
                    customer.payment_entitlements = response.customer.payment_entitlements;
                    window.UI.closeModal(overlay);
                    window.Workbench.toast('Payment options updated', 'success');
                    window.Router.route();
                } catch (err) {
                    window.Workbench.toast(err.message, 'error');
                    submit.disabled = false;
                }
            });
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
        <div class="card" style="max-width:800px; padding: 1.5rem;">
            <form id="settings-form">
                <div class="form-section">
                    <h3 class="form-section-title">Inventory</h3>
                    <div class="form-group">
                        <label>Low Stock Threshold (Quantity)</label>
                        <input type="number" name="low_stock_threshold" value="${s.low_stock_threshold ?? ''}" class="form-control" required>
                    </div>
                </div>
                <button type="submit" class="btn">Save Settings</button>
            </form>
        </div>
    `;
    root.innerHTML = adminLayout(content, 'settings');
    
    document.getElementById('settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
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
            <div class="card" style="padding: 1.5rem;">
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
        
        <p class="text-muted">Simulation results are returned directly by the simulation API and are not retained in a generic mailbox.</p>
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
