// admin-operations.js - Returns, Messages, Audit

(function initWorkbenchOps() {
    window.Workbench = window.Workbench || {};
})();

const adminOpsLayout = (content, activeRoute) => window.Admin.layout(content, activeRoute);

window.Router.add(/^admin\/returns$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/returns');
    const esc = window.Core.escapeHtml;
    
    const rows = data.returns.map(r => `
        <tr>
            <td><strong style="font-size:0.9375rem"><a href="${window.APP_BASE}admin/returns/${r.id}">${esc(r.number)}</a></strong></td>
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
            <td>${esc(r.customer_name)}</td>
            <td>
                <select class="form-control action-status-select" data-id="${r.id}" data-current="${r.status}" style="padding:0.25rem 0.5rem; font-size:0.8125rem; height:auto;">
                    <option value="submitted" ${r.status==='submitted'?'selected':''}>Submitted</option>
                    <option value="approved" ${r.status==='approved'?'selected':''}>Approved</option>
                    <option value="rejected" ${r.status==='rejected'?'selected':''}>Rejected</option>
                    <option value="credited" ${r.status==='credited'?'selected':''}>Credited</option>
                </select>
            </td>
            <td>${window.Core.formatMoney(r.credit_cents, r.currency || 'CHF')}</td>
            <td><a href="${window.APP_BASE}admin/returns/${r.id}" class="btn btn-sm btn-outline">Details</a></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Returns Management (RMA)</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>RMA #</th><th>Date</th><th>Customer</th><th>Status</th><th>Credit</th><th>Action</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center; padding:2rem;">No returns found.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'returns');

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
                        <label>Optional Internal Note</label>
                        <textarea name="note" class="form-control" rows="2" placeholder="Reason for approval or rejection..."></textarea>
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
                        <button type="submit" class="btn">Confirm</button>
                        <button type="button" class="btn btn-outline" id="cancel-status">Cancel</button>
                    </div>
                </form>
            `;
            const overlay = window.UI.showModal('Change Return Status', html);
            
            document.getElementById('cancel-status').onclick = () => {
                el.value = oldStatus;
                window.UI.closeModal(overlay);
            };
            
            document.getElementById('status-form').onsubmit = async (ev) => {
                ev.preventDefault();
                try {
                    await window.Core.fetch(`/admin/returns/${id}`, { method: 'PATCH', body: { status: newStatus, note: ev.target.note.value } });
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
});

window.Router.add(/^admin\/returns\/(\d+)$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const id = match[1];
    const esc = window.Core.escapeHtml;
    const data = await window.Core.fetch(`/admin/returns/${id}`);
    
    const r = data.return;
    const itemsHtml = data.items.map(i => `
        <tr><td><strong style="font-weight:500">${esc(i.name)}</strong></td><td>${window.Core.formatMoney(i.price_cents, r.currency || 'CHF')}</td><td>${i.quantity}</td></tr>
    `).join('');

    const content = `
        <div style="margin-bottom:1.5rem"><a href="${window.APP_BASE}admin/returns" class="btn btn-outline btn-sm">&larr; Back to overview</a></div>
        <div class="page-header">
            <h1>Return RMA: ${esc(r.number)}</h1>
        </div>
        
        <div class="card" style="margin-bottom:2rem; padding: 1.5rem;">
            <div class="grid-cols-2" style="margin-bottom:1rem;">
                <div><div class="data-label">Current Status</div><div class="data-value">${window.Workbench.badge(r.status)}</div></div>
                <div><div class="data-label">Request Date</div><div class="data-value">${new Date(r.created_at).toLocaleDateString()}</div></div>
            </div>
            <div style="border-top:1px solid var(--wb-border-light); padding-top:1rem;">
                <div class="data-label">Customer's Reason</div>
                <div class="data-value">${esc(r.reason)}</div>
                ${r.note ? `<div class="data-label" style="margin-top:1rem;">Staff Note</div><div class="data-value">${esc(r.note)}</div>` : ''}
            </div>
        </div>
        
        <h3 class="form-section-title">Returned Parts</h3>
        <div class="table-responsive">
            <table class="data-table"><thead><tr><th>Product</th><th>Price (per part)</th><th>Quantity</th></tr></thead><tbody>${itemsHtml}</tbody></table>
        </div>
        
        <div class="card" style="margin-top:2rem; padding: 1.5rem;">
            <h3 class="form-section-title">Log & History</h3>
            <ul style="padding-left:1.5rem; font-size:0.875rem; margin-bottom:0;">
                ${data.events.map(e => `<li style="margin-bottom:0.5rem"><strong>${new Date(e.created_at).toLocaleString()}</strong> - Status changed to: <strong>${window.Workbench.statusMap[e.status]?.label || e.status}</strong>. ${e.note ? `<br><span style="color:var(--wb-text-muted)">${esc(e.note)}</span>` : ''}</li>`).join('')}
            </ul>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'returns');
});

window.Router.add(/^admin\/diagnostics$/, async (match, root, query) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const params = new URLSearchParams();
    ['page', 'limit', 'severity', 'status', 'search'].forEach(k => { if (query.get(k)) params.set(k, query.get(k)); });
    let data;
    try { data = await window.Core.fetch('/admin/diagnostics?' + params.toString()); }
    catch (error) {
        root.innerHTML = adminOpsLayout(`<div class="page-header"><h1>Diagnostics</h1></div><div class="alert error">Could not load diagnostics. Please try again.</div>`, 'diagnostics');
        return;
    }
    const esc = window.Core.escapeHtml;
    const selected = key => esc(params.get(key) || '');
    const rows = data.diagnostics.map(d => `
        <tr>
            <td><a href="${window.APP_BASE}admin/diagnostics?detail=${d.id}">${esc(d.reference)}</a></td>
            <td>${new Date(d.occurred_at).toLocaleString()}</td>
            <td>${window.Workbench.badge(d.severity)}</td>
            <td>${esc(d.category)}</td><td>${esc(d.summary)}</td>
            <td>${d.resolved_at ? window.Workbench.badge('resolved') : window.Workbench.badge('open')}</td>
        </tr>
    `).join('');
    const countText = (data.counts || []).map(c => `${esc(c.severity)}: ${c.total} (${c.open_total} open)`).join(' · ') || 'No diagnostics recorded';
    const detailId = query.get('detail');
    const content = `
        <div class="page-header">
            <h1>Diagnostics</h1>
        </div>
        <p class="text-muted" style="margin-bottom:1rem">${countText}</p>
        <form class="admin-toolbar" style="margin-bottom:1.5rem;" method="get">
          <div class="form-group"><select class="form-control" name="severity"><option value="">All severities</option>${['debug','info','warning','error','critical'].map(x => `<option ${selected('severity') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="form-group"><select class="form-control" name="status"><option value="">All statuses</option><option value="open" ${selected('status') === 'open' ? 'selected' : ''}>Open</option><option value="resolved" ${selected('status') === 'resolved' ? 'selected' : ''}>Resolved</option></select></div>
          <div class="form-group"><input class="form-control" name="search" value="${selected('search')}" placeholder="Reference, category or summary"></div>
          <button class="btn btn-primary" style="flex:0 0 auto">Filter</button>
        </form>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Reference</th><th>Time</th><th>Severity</th><th>Category</th><th>Summary</th><th>Status</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center; padding:2rem;">No diagnostics match these filters.</td></tr>'}</tbody>
            </table>
        </div>
        <div style="margin-top:1rem; display:flex; gap:1rem"><span>Page ${data.page} of ${data.pages}</span>
          ${data.page > 1 ? `<a class="btn btn-outline btn-sm" href="${window.APP_BASE}admin/diagnostics?${new URLSearchParams({...Object.fromEntries(params), page:String(data.page - 1)}).toString()}">Previous</a>` : ''}
          ${data.page < data.pages ? `<a class="btn btn-outline btn-sm" href="${window.APP_BASE}admin/diagnostics?${new URLSearchParams({...Object.fromEntries(params), page:String(data.page + 1)}).toString()}">Next</a>` : ''}
        </div>
        <div id="diagnostic-detail" data-id="${detailId || ''}"></div>
    `;
    root.innerHTML = adminOpsLayout(content, 'diagnostics');
    if (detailId && /^\d+$/.test(detailId)) {
        const panel = root.querySelector('#diagnostic-detail');
        panel.innerHTML = '<p style="margin-top:1rem">Loading diagnostic…</p>';
        try {
            const result = await window.Core.fetch('/admin/diagnostics/' + detailId);
            const d = result.diagnostic;
            panel.innerHTML = `<div class="card" style="margin-top:1rem; padding: 1.5rem;"><h3>${esc(d.reference)}</h3><p>${esc(d.summary)}</p><dl><dt>Request</dt><dd>${esc(d.request_method || '')} ${esc(d.request_path || '')}</dd><dt>Occurred</dt><dd>${esc(d.occurred_at)}</dd><dt>Category</dt><dd>${esc(d.category)}</dd></dl><pre style="white-space:pre-wrap;word-break:break-word;background:var(--wb-surface-hover);padding:1rem;border-radius:var(--wb-radius);border:1px solid var(--wb-border);">${esc(JSON.stringify(d.context_json, null, 2))}</pre><button class="btn btn-outline" id="diagnostic-toggle" style="margin-top:1rem;">${d.resolved_at ? 'Reopen' : 'Resolve'}</button></div>`;
            panel.querySelector('#diagnostic-toggle').onclick = async () => {
                await window.Core.fetch('/admin/diagnostics/' + d.id, {method:'PATCH', body:{status:d.resolved_at ? 'open' : 'resolved'}});
                window.Router.navigate(window.APP_BASE + 'admin/diagnostics?detail=' + d.id);
            };
        } catch (_) { panel.innerHTML = '<div class="alert error">Could not load this diagnostic.</div>'; }
    }
});

window.Router.add(/^admin\/audit$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/audit');
    const esc = window.Core.escapeHtml;
    
    const rows = data.events.map(e => `
        <tr>
            <td>${new Date(e.created_at).toLocaleString()}</td>
            <td><span class="wb-badge wb-badge-neutral">${e.user_id || 'System'}</span></td>
            <td><strong style="font-size:0.875rem">${esc(e.action)}</strong></td>
            <td><span style="color:var(--wb-text-muted); font-size:0.75rem; text-transform:uppercase">${esc(e.entity)}</span> <span style="font-weight:600">#${e.entity_id}</span></td>
            <td><pre style="margin:0; font-size:0.75rem; max-width:300px; white-space:pre-wrap; word-break:break-all; background:var(--wb-bg); padding:0.25rem 0.5rem; border-radius:var(--wb-radius);">${esc(JSON.stringify(e.details))}</pre></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>System Audit Log</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Date & Time</th><th>User ID</th><th>Action</th><th>Changed Entity</th><th>Data Snapshot (Details)</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding:2rem;">No audit logs recorded.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'audit');
});
