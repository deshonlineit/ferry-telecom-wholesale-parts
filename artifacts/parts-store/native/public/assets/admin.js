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
            'processing': { label: 'Verwerken', badge: 'warning' },
            'shipped': { label: 'Verzonden', badge: 'info' },
            'completed': { label: 'Voltooid', badge: 'success' },
            'cancelled': { label: 'Geannuleerd', badge: 'danger' },
            'archived': { label: 'Gearchiveerd', badge: 'neutral' },
            'submitted': { label: 'Ingediend', badge: 'warning' },
            'received': { label: 'Ontvangen', badge: 'info' },
            'assessed': { label: 'Beoordeeld', badge: 'info' },
            'approved': { label: 'Goedgekeurd', badge: 'success' },
            'rejected': { label: 'Afgewezen', badge: 'danger' },
            'credited': { label: 'Gecrediteerd', badge: 'success' },
            'active': { label: 'Actief', badge: 'success' },
            'pending': { label: 'In afwachting', badge: 'warning' },
            'blocked': { label: 'Geblokkeerd', badge: 'danger' },
            'isolated': { label: 'Geïsoleerd', badge: 'success' }
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
        ${data.safety && data.safety.test_mode ? '<div class="alert warning" style="margin-bottom:1.5rem"><strong>TESTMODUS ACTIEF:</strong> Live API connecties geblokkeerd. Geen echte betalingen of e-mails.</div>' : ''}
        
        ${financeData.map(f => `
        <div style="margin-bottom:1rem; font-weight:600; color:var(--wb-text-muted);">Valuta: ${f.currency || 'CHF'}</div>
        <div class="admin-finance-summary" style="margin-bottom:2rem">
            <a href="${window.APP_BASE}admin/invoices?status=unpaid" class="finance-summary-tile tile-warning">
                <span>Onbetaald</span>
                <strong>${f.unpaid_count}</strong>
                <small>${window.Core.formatMoney(f.outstanding_cents, f.currency || 'CHF')}</small>
            </a>
            <a href="${window.APP_BASE}admin/invoices?status=overdue" class="finance-summary-tile tile-danger">
                <span>Achterstallig</span>
                <strong>${f.overdue_count}</strong>
                <small>${window.Core.formatMoney(f.overdue_cents, f.currency || 'CHF')}</small>
            </a>
            <a href="${window.APP_BASE}admin/invoices?status=unverified" class="finance-summary-tile tile-info">
                <span>Te controleren</span>
                <strong>${f.unverified_count}</strong>
                <small>Check transacties</small>
            </a>
            <a href="${window.APP_BASE}admin/invoices?status=paid" class="finance-summary-tile tile-success">
                <span>Betaald</span>
                <strong>${f.paid_count}</strong>
                <small>Alle betaalde facturen</small>
            </a>
        </div>
        `).join('')}

        <div class="admin-dashboard-stats" style="margin-bottom:2rem">
            <div class="card"><div class="data-label">Actieve producten</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0;">${s.products}</div></div>
            <div class="card"><div class="data-label">Klanten</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0;">${s.customers}</div></div>
            <div class="card"><div class="data-label">Bestellingen totaal</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0;">${s.orders}</div></div>
            <div class="card"><div class="data-label">Lage voorraad</div><div class="data-value" style="font-size:1.5rem; margin-bottom:0; color:var(--wb-danger)"><a href="${window.APP_BASE}admin/products?status=active&stock=low_stock">${s.low_stock}</a></div></div>
        </div>

        <div class="admin-dashboard-panels" style="margin-bottom:2rem">
            <div>
                <h3 class="form-section-title">Facturen Actie Vereist</h3>
                <div class="table-responsive">
                    <table class="data-table finance-table">
                        ${invAtt.length ? invAtt.map(i => `<tr>
                            <td><a href="${window.APP_BASE}admin/invoices?q=${esc(i.order_number)}" style="font-weight:600">${esc(i.order_number)}</a><br><span style="font-size:0.75rem; color:var(--wb-text-muted)">${esc(i.company || i.customer_name)}</span></td>
                            <td><span class="status-badge status-${i.payment_status}">${esc({unverified: 'Te controleren', unpaid: 'Alle onbetaalde', open: 'Openstaand', partial: 'Deels betaald', overdue: 'Achterstallig', paid: 'Betaald', cancelled: 'Geannuleerd'}[i.payment_status] || i.payment_status)}</span></td>
                            <td style="text-align:right"><strong>${i.outstanding_cents === null ? 'Te controleren' : window.Core.formatMoney(i.outstanding_cents, i.currency || 'CHF')}</strong><br><span style="font-size:0.75rem; color:var(--wb-text-muted)">${i.due_date ? 'Vervaldatum: ' + new Date(i.due_date).toLocaleDateString() : 'Geen vervaldatum'}</span></td>
                        </tr>`).join('') : '<tr><td colspan="3">Geen urgente facturen.</td></tr>'}
                    </table>
                </div>
            </div>
            <div>
                <h3 class="form-section-title">Lage Voorraad</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        ${data.low_stock && data.low_stock.length ? data.low_stock.map(p => `<tr><td><a href="${window.APP_BASE}admin/products/${p.id}" style="font-weight:600">${esc(p.sku)}</a></td><td><div style="max-width:150px; overflow:hidden; text-overflow:ellipsis;" title="${esc(p.name)}">${esc(p.name)}</div></td><td style="text-align:right;"><span style="color:var(--wb-danger);font-weight:700">${p.stock} stuks · ${p.stock === 0 ? 'Uitverkocht' : 'Lage voorraad'}</span></td></tr>`).join('') : '<tr><td colspan="3">Voorraad is op peil.</td></tr>'}
                    </table>
                </div>
            </div>
        </div>
        <div>
            <h3 class="form-section-title">Recente Bestellingen</h3>
            <div class="table-responsive">
                <table class="data-table">
                    ${data.recent_orders && data.recent_orders.length ? data.recent_orders.map(o => `<tr><td><a href="${window.APP_BASE}admin/orders" style="font-weight:600">${esc(o.number)}</a></td><td>${window.Workbench.badge(o.status)}</td><td style="text-align:right">${window.Core.formatMoney(o.total_cents, o.currency || 'CHF')}</td></tr>`).join('') : '<tr><td colspan="3">Geen recente orders.</td></tr>'}
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
            <td><strong><a href="${window.APP_BASE}admin/products/${p.id}">${esc(p.name)}</a></strong>${p.featured ? ' <span class="wb-badge wb-badge-warning" style="font-size:0.65rem">Uitgelicht</span>' : ''}</td>
            <td>${p.list_price_eur_cents != null ? window.Core.formatMoney(p.list_price_eur_cents, 'EUR') : '<span style="color:var(--wb-text-muted)">Onbekend</span>'}</td>
            <td><span class="wb-badge ${p.stock <= stockThreshold ? 'wb-badge-warning' : 'wb-badge-neutral'}" style="font-weight:700">${p.stock} stuks${p.stock === 0 ? ' · Uitverkocht' : (p.stock <= stockThreshold ? ' · Lage voorraad' : '')}</span></td>
            <td>${window.Workbench.badge(p.active ? 'active' : 'archived')}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline action-quick-edit" data-id="${p.id}" data-stock="${p.stock}" data-price-eur="${p.list_price_eur_cents ?? ''}" data-version="${p.pricing_version ?? 0}" data-featured="${p.featured}">Snel Wijzigen</button>
                ${!p.active 
                    ? `<button type="button" class="btn btn-sm btn-outline action-restore" data-id="${p.id}">Herstellen</button>` 
                    : `<button type="button" class="btn btn-sm btn-danger action-archive" data-id="${p.id}">Archiveren</button>`}
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
                <h1>Producten</h1>
                <span class="wb-badge wb-badge-warning" aria-live="polite" data-testid="admin-featured-total">Uitgelicht totaal: ${data.featured_total}</span>
            </div>
            <div class="page-actions">
                <button type="button" class="btn btn-outline action-import">CSV Import</button>
                <a href="${window.APP_BASE}admin/products/new" class="btn">Nieuw Product</a>
            </div>
        </div>
        
        <div class="card" style="padding:1rem; margin-bottom:1.5rem; background:var(--wb-bg)">
            <form style="display:flex; flex-wrap:wrap; gap:0.75rem;" id="admin-filter-form">
                <input type="text" name="q" value="${esc(q)}" class="form-control" style="flex:1 1 150px;" placeholder="Zoek op naam/sku...">
                <select name="category" class="form-control" style="flex:1 1 150px;"><option value="">Alle Categorieën</option>${catsHtml}</select>
                <select name="brand" class="form-control" style="flex:1 1 150px;"><option value="">Alle Merken</option>${brandsHtml}</select>
                <select name="quality" class="form-control" style="flex:1 1 150px;"><option value="">Alle Kwaliteiten</option>${qualitiesHtml}</select>
                <select name="stock" class="form-control" style="flex:1 1 150px;">
                    <option value="">Alle Voorraad</option>
                    <option value="in_stock" ${stock === 'in_stock' ? 'selected' : ''}>Op voorraad</option>
                    <option value="low_stock" ${stock === 'low_stock' ? 'selected' : ''}>Lage voorraad</option>
                    <option value="out_of_stock" ${stock === 'out_of_stock' ? 'selected' : ''}>Uitverkocht</option>
                </select>
                <span style="align-self:center; color:var(--wb-text-muted); font-size:0.8125rem; white-space:nowrap;">Lage voorraad: ≤ ${stockThreshold} stuks</span>
                <select name="status" class="form-control" style="flex:1 1 150px;">
                    <option value="all" ${status === 'all' ? 'selected' : ''}>Alle (Actief + Archief)</option>
                    <option value="active" ${status === 'active' ? 'selected' : ''}>Alleen Actief</option>
                    <option value="archived" ${status === 'archived' ? 'selected' : ''}>Alleen Gearchiveerd</option>
                </select>
                <select name="sort" class="form-control" style="flex:1 1 150px;"><option value="">Relevantie</option><option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Prijs oplopend</option><option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Prijs aflopend</option></select>
                <button type="submit" class="btn btn-outline" style="flex:0 0 auto;">Toepassen</button>
                <button type="button" class="btn btn-outline action-clear-filters" style="flex:0 0 auto;">Wissen</button>
            </form>
        </div>
        
        ${renderTable(['SKU', 'Naam', 'Basisverkoopprijs (EUR)', 'Voorraad', 'Status', 'Acties'], rows, 'Geen producten gevonden.')}
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
                    <label>Actuele Voorraad</label>
                    <input type="number" name="stock" value="${b.dataset.stock}" class="form-control" min="0" step="1" required>
                </div>
                <div class="form-group">
                    <label>Basisprijs (EUR)</label>
                    <input type="text" inputmode="decimal" name="list_price_eur" value="${b.dataset.priceEur ? (parseInt(b.dataset.priceEur,10)/100).toFixed(2) : ''}" class="form-control" required>
                </div>
                <div class="form-group" style="margin-bottom:1.5rem">
                    <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" name="featured" value="1" ${b.dataset.featured == '1' ? 'checked' : ''}> Uitgelicht (Featured op homepage)
                    </label>
                </div>
                <button type="submit" class="btn quick-edit-submit" style="width:100%">Wijzigingen Opslaan</button>
            </form>
        `;
        const overlay = window.UI.showModal('Snel Product Wijzigen', html);
        document.getElementById('quick-edit-form').onsubmit = async (ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.target);
            const btn = ev.target.querySelector('.quick-edit-submit');
            btn.disabled = true;
            btn.textContent = 'Opslaan...';
            try {
                const listPriceEurCents = window.Workbench.parseCentsStrict(fd.get('list_price_eur'));
                if (Number.isNaN(listPriceEurCents) || listPriceEurCents === null) throw new Error("Ongeldig bedrag voor basisprijs");

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
                window.Workbench.toast('Product succesvol bijgewerkt', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }
        };
    }));

    root.querySelectorAll('.action-archive').forEach(btn => btn.addEventListener('click', async (e) => {
        if (!confirm('Weet u zeker dat u dit product wilt archiveren?')) return;
        const id = e.currentTarget.dataset.id;
        try {
            await window.Core.fetch(`/admin/products/${id}`, { method: 'DELETE' });
            window.Workbench.toast('Product gearchiveerd', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }
    }));

    root.querySelectorAll('.action-restore').forEach(btn => btn.addEventListener('click', async (e) => {
        if (!confirm('Product herstellen en weer actief maken?')) return;
        const id = e.currentTarget.dataset.id;
        try {
            await window.Core.fetch(`/admin/products/${id}/restore`, { method: 'POST' });
            window.Workbench.toast('Product hersteld', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }
    }));

    root.querySelector('.action-import').addEventListener('click', () => {
        const html = `
            <form id="import-form">
                <div class="alert" style="font-size:0.875rem;">Verwachte CSV kolommen: sku, name, category, brand, quality, stock, price (EUR)</div>
                <div class="form-group" style="margin-bottom:1.5rem;">
                    <label>CSV Bestand Selecteren</label>
                    <input type="file" name="file" accept=".csv" required class="form-control">
                </div>
                <div class="form-group" style="margin-bottom:1.5rem">
                    <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" name="preview" value="1" checked> Alleen preview (controle)
                    </label>
                </div>
                <button type="submit" class="btn" style="width:100%">Bestand Verwerken</button>
                <div id="import-result" style="margin-top:1rem; white-space:pre-wrap; font-family:monospace; font-size:0.75rem; background:var(--wb-bg); padding:0.5rem; border-radius:var(--wb-radius); display:none;"></div>
            </form>
        `;
        const overlay = window.UI.showModal('Producten Importeren', html);
        
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
                r.innerHTML = `<strong>Resultaat:</strong> Rijen: ${res.rows}, Gemaakt: ${res.created}, Bijgewerkt: ${res.updated}\n`;
                if (res.errors && res.errors.length) {
                    r.innerHTML += `\n<strong style="color:var(--wb-danger)">Fouten:</strong>\n${esc(res.errors.join('\n'))}`;
                } else if (fd.get('preview')) {
                    if (res.pricing_versions) {
                        lastPreviewVersions = res.pricing_versions;
                    }
                    r.innerHTML += `\n<em>Controle geslaagd. Vink 'Alleen preview' uit en klik nogmaals om door te voeren.</em>`;
                } else if (!fd.get('preview')) {
                    window.Workbench.toast('Import voltooid', 'success');
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
                    <option value="processing" ${o.status==='processing'?'selected':''}>Verwerken</option>
                    <option value="shipped" ${o.status==='shipped'?'selected':''}>Verzonden</option>
                    <option value="completed" ${o.status==='completed'?'selected':''}>Voltooid</option>
                    <option value="cancelled" ${o.status==='cancelled'?'selected':''}>Geannuleerd</option>
                </select>
            </td>
            <td>${window.Core.formatMoney(o.total_cents, o.currency || 'CHF')}</td>
            <td><button type="button" class="btn btn-sm btn-outline action-track" data-id="${o.id}" data-tracking="${esc(o.tracking||'')}" data-status="${o.status}">T&T</button></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Bestellingen Beheer</h1>
        </div>
        ${renderTable(['Order #', 'Datum', 'Klant', 'Status', 'Totaal', 'Actie'], rows, 'Geen bestellingen gevonden.')}
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
                    <p style="margin-bottom:1rem; font-size:0.875rem;">Status wijzigen naar <strong>${window.Workbench.statusMap[newStatus]?.label || newStatus}</strong>?</p>
                    <div class="form-group">
                        <label>Optionele Notitie</label>
                        <textarea name="note" class="form-control" rows="2" placeholder="Reden of notitie voor de klant..."></textarea>
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
                        <button type="submit" class="btn">Bevestigen</button>
                        <button type="button" class="btn btn-outline" id="cancel-status">Annuleren</button>
                    </div>
                </form>
            `;
            const overlay = window.UI.showModal('Order Status Wijzigen', html);
            
            document.getElementById('cancel-status').onclick = () => {
                el.value = oldStatus;
                window.UI.closeModal(overlay);
            };
            
            document.getElementById('status-form').onsubmit = async (ev) => {
                ev.preventDefault();
                try {
                    await window.Core.fetch(`/admin/orders/${id}`, { method: 'PATCH', body: { status: newStatus, note: ev.target.note.value } });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast('Status succesvol bijgewerkt', 'success');
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
                <button type="submit" class="btn" style="width:100%; margin-top:1rem;">Opslaan</button>
            </form>
        `;
        const overlay = window.UI.showModal('Tracking Bijwerken', html);
        document.getElementById('tracking-form').onsubmit = async (ev) => {
            ev.preventDefault();
            try {
                await window.Core.fetch(`/admin/orders/${id}`, { method: 'PATCH', body: { tracking: ev.target.tracking.value, status: currentStatus } });
                window.UI.closeModal(overlay);
                window.Workbench.toast('Tracking bijgewerkt', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }
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
                    <option value="pending" ${c.status==='pending'?'selected':''}>In afwachting</option>
                    <option value="active" ${c.status==='active'?'selected':''}>Actief</option>
                    <option value="blocked" ${c.status==='blocked'?'selected':''}>Geblokkeerd</option>
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
            <h1>Klanten Beheer</h1>
        </div>
        ${renderTable(['Klant', 'Bedrijf', 'Status Toegang', 'Prijsgroep'], rows, 'Geen klanten gevonden.')}
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
                window.Workbench.toast('Klantinstellingen bijgewerkt', 'success');
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
            <h1>Instellingen</h1>
        </div>
        <div class="card" style="max-width:800px">
            <form id="settings-form">
                <div class="form-section">
                    <h3 class="form-section-title">Financieel & Logistiek</h3>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Standaard Verzendkosten (EUR)</label>
                            <input type="text" inputmode="decimal" name="shipping_eur" value="${s.shipping_eur_cents != null ? (s.shipping_eur_cents/100).toFixed(2) : ''}" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Gratis Verzending Vanaf (EUR)</label>
                            <input type="text" inputmode="decimal" name="free_shipping_eur" value="${s.free_shipping_eur_cents != null ? (s.free_shipping_eur_cents/100).toFixed(2) : ''}" class="form-control" required>
                        </div>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Standaard BTW Tarief (Basispoints, bijv. 2100 = 21%)</label>
                            <input type="number" name="tax_bps" value="${s.tax_bps||''}" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Lage Voorraad Drempel (Aantal)</label>
                            <input type="number" name="low_stock_threshold" value="${s.low_stock_threshold ?? ''}" class="form-control" required>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn">Instellingen Opslaan</button>
            </form>
        </div>
    `;
    root.innerHTML = adminLayout(content, 'settings');
    
    document.getElementById('settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        const shippingEurCents = window.Workbench.parseCentsStrict(fd.get('shipping_eur'));
        if (Number.isNaN(shippingEurCents) || shippingEurCents === null) return window.Workbench.toast('Ongeldig bedrag voor verzendkosten', 'error');
        const freeShippingEurCents = window.Workbench.parseCentsStrict(fd.get('free_shipping_eur'));
        if (Number.isNaN(freeShippingEurCents) || freeShippingEurCents === null) return window.Workbench.toast('Ongeldig bedrag voor gratis verzending', 'error');

        const payload = Object.fromEntries(fd.entries());
        payload.shipping_eur_cents = shippingEurCents;
        payload.free_shipping_eur_cents = freeShippingEurCents;
        delete payload.shipping_eur;
        delete payload.free_shipping_eur;
        for (let k in payload) payload[k] = parseInt(payload[k], 10);
        try {
            await window.Core.fetch('/admin/settings', { method: 'PATCH', body: payload });
            window.Workbench.toast('Instellingen opgeslagen', 'success');
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }
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
            <h1>Systeemintegraties (Simulatie)</h1>
        </div>
        <div class="alert warning" style="margin-bottom:2rem">De API en webhook verbindingen zijn veilig geïsoleerd op deze server. Hier kunt u webhook payloads lokaal testen zonder dat er daadwerkelijk extern verkeer plaatsvindt.</div>
        
        <div class="grid-cols-2" style="margin-bottom:2rem; align-items:start;">
            <div>
                <h3 class="form-section-title">Huidige Verbindingen</h3>
                ${renderTable(['Systeem', 'Modus', 'Status'], rows, 'Geen verbindingen geregistreerd.')}
            </div>
            <div class="card">
                <h3 class="form-section-title">Webhook Simuleren</h3>
                <form id="sim-form">
                    <div class="form-group">
                        <label>Simulatie Event Type</label>
                        <select name="event" class="form-control">
                            <option value="stock">Voorraad Update (ERP Sync)</option>
                            <option value="shipment">Verzendstatus Gewijzigd (WMS)</option>
                            <option value="payment">Betaling Bevestigd (PSP)</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-outline" style="width:100%">Trigger Event</button>
                </form>
            </div>
        </div>
        
        <h3 class="form-section-title">Onderschepte Events Log</h3>
        ${renderTable(['Datum', 'Event Type', 'JSON Payload'], evRows, 'Geen gelogde events.')}
    `;
    root.innerHTML = adminLayout(content, 'integrations');
    
    document.getElementById('sim-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
            await window.Core.fetch('/admin/integrations/simulate', { method: 'POST', body: { event: e.target.event.value } });
            window.Workbench.toast('Simulatie uitgevoerd', 'success');
            window.Router.route();
        } catch(err) { window.Workbench.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Wijzigingen Opslaan'; }
    };
});
