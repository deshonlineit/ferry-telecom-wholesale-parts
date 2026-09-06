// admin-operations.js - Returns, Buyback, Messages, Audit

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
                    <option value="submitted" ${r.status==='submitted'?'selected':''}>Ingediend</option>
                    <option value="approved" ${r.status==='approved'?'selected':''}>Goedgekeurd</option>
                    <option value="rejected" ${r.status==='rejected'?'selected':''}>Afgewezen</option>
                    <option value="credited" ${r.status==='credited'?'selected':''}>Gecrediteerd</option>
                </select>
            </td>
            <td>${window.Core.formatMoney(r.credit_cents, r.currency || 'CHF')}</td>
            <td><a href="${window.APP_BASE}admin/returns/${r.id}" class="btn btn-sm btn-outline">Details</a></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Retouren Beheer (RMA)</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>RMA #</th><th>Datum</th><th>Klant</th><th>Status</th><th>Credit</th><th>Actie</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center; padding:2rem;">Geen retouren gevonden.</td></tr>'}</tbody>
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
                    <p style="margin-bottom:1rem; font-size:0.875rem;">Status wijzigen naar <strong>${window.Workbench.statusMap[newStatus]?.label || newStatus}</strong>?</p>
                    <div class="form-group">
                        <label>Optionele Interne Notitie</label>
                        <textarea name="note" class="form-control" rows="2" placeholder="Reden voor goed- of afkeuring..."></textarea>
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
                        <button type="submit" class="btn">Bevestigen</button>
                        <button type="button" class="btn btn-outline" id="cancel-status">Annuleren</button>
                    </div>
                </form>
            `;
            const overlay = window.UI.showModal('Retour Status Wijzigen', html);
            
            document.getElementById('cancel-status').onclick = () => {
                el.value = oldStatus;
                window.UI.closeModal(overlay);
            };
            
            document.getElementById('status-form').onsubmit = async (ev) => {
                ev.preventDefault();
                try {
                    await window.Core.fetch(`/admin/returns/${id}`, { method: 'PATCH', body: { status: newStatus, note: ev.target.note.value } });
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
        <div style="margin-bottom:1.5rem"><a href="${window.APP_BASE}admin/returns" class="btn btn-outline btn-sm">&larr; Terug naar overzicht</a></div>
        <div class="page-header">
            <h1>Retour RMA: ${esc(r.number)}</h1>
        </div>
        
        <div class="card" style="margin-bottom:2rem">
            <div class="grid-cols-2" style="margin-bottom:1rem;">
                <div><div class="data-label">Huidige Status</div><div class="data-value">${window.Workbench.badge(r.status)}</div></div>
                <div><div class="data-label">Aanvraagdatum</div><div class="data-value">${new Date(r.created_at).toLocaleDateString()}</div></div>
            </div>
            <div style="border-top:1px solid var(--wb-border-light); padding-top:1rem;">
                <div class="data-label">Reden Klant</div>
                <div class="data-value">${esc(r.reason)}</div>
                ${r.note ? `<div class="data-label" style="margin-top:1rem;">Notitie Staff</div><div class="data-value">${esc(r.note)}</div>` : ''}
            </div>
        </div>
        
        <h3 class="form-section-title">Geretourneerde Artikelen</h3>
        <div class="table-responsive">
            <table class="data-table"><thead><tr><th>Product</th><th>Prijs (per stuk)</th><th>Aantal</th></tr></thead><tbody>${itemsHtml}</tbody></table>
        </div>
        
        <div class="card" style="margin-top:2rem">
            <h3 class="form-section-title">Logboek & Geschiedenis</h3>
            <ul style="padding-left:1.5rem; font-size:0.875rem; margin-bottom:0;">
                ${data.events.map(e => `<li style="margin-bottom:0.5rem"><strong>${new Date(e.created_at).toLocaleString()}</strong> - Status gewijzigd naar: <strong>${window.Workbench.statusMap[e.status]?.label || e.status}</strong>. ${e.note ? `<br><span style="color:var(--wb-text-muted)">${esc(e.note)}</span>` : ''}</li>`).join('')}
            </ul>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'returns');
});

window.Router.add(/^admin\/buyback$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/buyback');
    const esc = window.Core.escapeHtml;
    
    const itemsRows = data.items.map(i => `
        <tr>
            <td style="font-weight:500">${esc(i.model)}</td>
            <td>${esc(i.grade)}</td>
            <td>${window.Core.formatMoney(i.price_cents, 'CHF')}</td>
            <td>${window.Workbench.badge(i.active ? 'active' : 'blocked', i.active ? 'Actief' : 'Inactief')}</td>
            <td><button type="button" class="btn btn-sm btn-outline action-edit-bb" data-id="${i.id}" data-model="${esc(i.model)}" data-grade="${esc(i.grade)}" data-price="${i.price_cents}" data-active="${i.active}">Bewerken</button></td>
        </tr>
    `).join('');

    const reqRows = data.requests.map(r => `
        <tr>
            <td><strong style="font-size:0.9375rem">${esc(r.number)}</strong></td>
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
            <td>
                <select class="form-control action-status-select" data-id="${r.id}" data-current="${r.status}" style="padding:0.25rem 0.5rem; font-size:0.8125rem; height:auto;">
                    <option value="submitted" ${r.status==='submitted'?'selected':''}>Ingediend</option>
                    <option value="received" ${r.status==='received'?'selected':''}>Ontvangen</option>
                    <option value="assessed" ${r.status==='assessed'?'selected':''}>Beoordeeld</option>
                    <option value="completed" ${r.status==='completed'?'selected':''}>Voltooid</option>
                    <option value="rejected" ${r.status==='rejected'?'selected':''}>Afgewezen</option>
                </select>
            </td>
            <td>${window.Core.formatMoney(r.total_cents, r.currency || 'CHF')}</td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Buyback Beheer</h1>
        </div>
        
        <div class="page-header" style="margin-top:2rem;">
            <h3 class="form-section-title" style="margin:0;">Geconfigureerde Inruilprijzen</h3>
            <button type="button" class="btn btn-sm action-edit-bb">Nieuw Model Toevoegen</button>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Model</th><th>Kwaliteit (Grade)</th><th>Prijs</th><th>Status</th><th>Actie</th></tr></thead>
                <tbody>${itemsRows || '<tr><td colspan="5" style="text-align:center; padding:2rem;">Geen items geconfigureerd.</td></tr>'}</tbody>
            </table>
        </div>

        <h3 class="form-section-title" style="margin-top:3rem;">Klant Inruilaanvragen</h3>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Aanvraag #</th><th>Datum</th><th>Status</th><th>Geschatte Waarde</th></tr></thead>
                <tbody>${reqRows || '<tr><td colspan="4" style="text-align:center; padding:2rem;">Geen aanvragen gevonden.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'buyback');

    const editBuybackItem = (id=null, m='', g='', p=0, a=1) => {
        const html = `
            <form id="bb-item-form">
                <div class="form-section" style="border:none; padding:0;">
                    <div class="form-group"><label>Toestel Model</label><input type="text" name="model" value="${m}" class="form-control" required placeholder="Bijv. iPhone 13"></div>
                    <div class="form-group"><label>Kwaliteit (Grade)</label><input type="text" name="grade" value="${g}" class="form-control" required placeholder="Bijv. OEM, Grade A"></div>
                    <div class="form-group"><label>Prijs (CHF)</label><input type="number" name="price_chf" value="${(p/100).toFixed(2)}" step="0.01" min="0" class="form-control" required placeholder="15.00"></div>
                    <div class="form-group" style="margin-top:1.5rem">
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                            <input type="checkbox" name="active" value="1" ${a?'checked':''}> Zichtbaar en actief voor klanten
                        </label>
                    </div>
                </div>
                <button type="submit" class="btn" style="width:100%; margin-top:1rem;">Opslaan</button>
            </form>
        `;
        const overlay = window.UI.showModal(id ? 'Model Bewerken' : 'Nieuw Inruilmodel', html);
        document.getElementById('bb-item-form').onsubmit = async(e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = { model: fd.get('model'), grade: fd.get('grade'), price_cents: Math.round(parseFloat(fd.get('price_chf')) * 100), active: fd.get('active')?1:0 };
            try {
                await window.Core.fetch(id ? `/admin/buyback/${id}` : '/admin/buyback', { method: id ? 'PATCH':'POST', body: payload });
                window.UI.closeModal(overlay);
                window.Workbench.toast('Inruilmodel opgeslagen', 'success');
                window.Router.route();
            } catch(err) { window.Workbench.toast(err.message, 'error'); }
        };
    };

    root.querySelectorAll('.action-edit-bb').forEach(btn => btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        if(b.dataset.id) {
            editBuybackItem(parseInt(b.dataset.id, 10), b.dataset.model, b.dataset.grade, parseInt(b.dataset.price, 10), parseInt(b.dataset.active, 10));
        } else {
            editBuybackItem();
        }
    }));

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
                        <label>Notitie voor klant of archief</label>
                        <textarea name="note" class="form-control" rows="2" placeholder="Bevindingen na test..."></textarea>
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
                        <button type="submit" class="btn">Bevestigen</button>
                        <button type="button" class="btn btn-outline" id="cancel-status">Annuleren</button>
                    </div>
                </form>
            `;
            const overlay = window.UI.showModal('Aanvraag Status Wijzigen', html);
            
            document.getElementById('cancel-status').onclick = () => {
                el.value = oldStatus;
                window.UI.closeModal(overlay);
            };
            
            document.getElementById('status-form').onsubmit = async (ev) => {
                ev.preventDefault();
                try {
                    await window.Core.fetch(`/admin/buyback/requests/${id}`, { method: 'PATCH', body: { status: newStatus, note: ev.target.note.value } });
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
});

window.Router.add(/^admin\/messages$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/messages');
    const esc = window.Core.escapeHtml;
    
    const rows = data.messages.map(m => `
        <tr>
            <td>${new Date(m.created_at).toLocaleString()}</td>
            <td><strong style="font-size:0.875rem">${esc(m.kind)}</strong></td>
            <td>${window.Workbench.badge(m.status)}</td>
            <td><pre style="margin:0; font-size:0.75rem; max-width:400px; overflow:hidden; text-overflow:ellipsis; background:var(--wb-bg); padding:0.25rem 0.5rem; border-radius:var(--wb-radius);">${esc(JSON.stringify(m.payload))}</pre></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Lokale Berichten (E-mails)</h1>
        </div>
        <div class="alert warning" style="margin-bottom:2rem;">E-mails worden op deze ontwikkelomgeving niet daadwerkelijk verstuurd. Ze worden hier lokaal vastgelegd ter controle en debugdoeleinden.</div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Verzonden Op</th><th>Type Bericht</th><th>Status</th><th>Payload Data</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center; padding:2rem;">Geen gelogde berichten.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'messages');
});

window.Router.add(/^admin\/audit$/, async (match, root) => {
    if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
    const data = await window.Core.fetch('/admin/audit');
    const esc = window.Core.escapeHtml;
    
    const rows = data.events.map(e => `
        <tr>
            <td>${new Date(e.created_at).toLocaleString()}</td>
            <td><span class="wb-badge wb-badge-neutral">${e.user_id || 'Systeem'}</span></td>
            <td><strong style="font-size:0.875rem">${esc(e.action)}</strong></td>
            <td><span style="color:var(--wb-text-muted); font-size:0.75rem; text-transform:uppercase">${esc(e.entity)}</span> <span style="font-weight:600">#${e.entity_id}</span></td>
            <td><pre style="margin:0; font-size:0.75rem; max-width:300px; white-space:pre-wrap; word-break:break-all; background:var(--wb-bg); padding:0.25rem 0.5rem; border-radius:var(--wb-radius);">${esc(JSON.stringify(e.details))}</pre></td>
        </tr>
    `).join('');

    const content = `
        <div class="page-header">
            <h1>Systeem Audit Log</h1>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr><th>Datum & Tijd</th><th>Gebruiker ID</th><th>Actie</th><th>Gewijzigde Entiteit</th><th>Data Snapshot (Details)</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding:2rem;">Geen audit logs geregistreerd.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    root.innerHTML = adminOpsLayout(content, 'audit');
});
