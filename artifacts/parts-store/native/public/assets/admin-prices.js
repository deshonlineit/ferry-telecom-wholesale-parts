(function initAdminPrices() {
    let priceDrafts = new Map();
    let currentGroups = [];
    let currentProducts = [];

    if (window.Router) {
        const origNav = window.Router.navigate;
        window.Router.navigate = function(url) {
            const isSamePage = url.replace(/^https?:\/\/[^\/]+/, '').startsWith(window.APP_BASE + 'admin/prices');
            if (priceDrafts.size > 0 && !isSamePage) {
                if (!confirm('U heeft onopgeslagen prijswijzigingen. Weet u zeker dat u deze pagina wilt verlaten?')) return;
                priceDrafts.clear();
            }
            return origNav.apply(this, arguments);
        };
    }
    window.addEventListener('beforeunload', (e) => {
        if (priceDrafts.size > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    const esc = window.Core.escapeHtml;

    function parseCents(val) {
        return window.Workbench.parseCentsStrict(val);
    }

    function formatCents(cents) {
        if (cents == null) return '';
        return (cents / 100).toFixed(2);
    }

    function updateUnsavedBanner() {
        const banner = document.getElementById('prices-unsaved-banner');
        if (!banner) return;
        if (priceDrafts.size > 0) {
            banner.hidden = false;
            banner.querySelector('.draft-count').textContent = priceDrafts.size;
        } else {
            banner.hidden = true;
        }
    }

    function getDraft(id) {
        if (!priceDrafts.has(id)) {
            const p = currentProducts.find(x => x.id === id);
            if (!p) return null;
            priceDrafts.set(id, {
                id,
                version: p.pricing_version,
                purchase_price_eur_cents: p.purchase_price_eur_cents,
                list_price_eur_cents: p.list_price_eur_cents,
                group_prices: JSON.parse(JSON.stringify(p.group_prices || []))
            });
        }
        return priceDrafts.get(id);
    }

    function handleInput(e) {
        if (!e.target.classList.contains('prices-input')) return;
        const id = parseInt(e.target.dataset.id, 10);
        const field = e.target.dataset.field;
        const val = parseCents(e.target.value);
        if (Number.isNaN(val)) return;
        
        const p = currentProducts.find(x => x.id === id);
        if (!p) return;

        const draft = getDraft(id);
        if (field === 'purchase_price_eur_cents') draft.purchase_price_eur_cents = val;
        else if (field === 'list_price_eur_cents') draft.list_price_eur_cents = val;
        else if (field.startsWith('group_')) {
            const gid = parseInt(field.split('_')[1], 10);
            const idx = draft.group_prices.findIndex(x => x.group_id === gid);
            if (idx >= 0) draft.group_prices[idx].price_eur_cents = val;
            else draft.group_prices.push({ group_id: gid, price_eur_cents: val });
        }

        // Clean up draft if unchanged
        const gpOrigStr = JSON.stringify([...(p.group_prices||[])].sort((a,b)=>a.group_id-b.group_id));
        const gpDraftStr = JSON.stringify([...draft.group_prices].sort((a,b)=>a.group_id-b.group_id));
        
        if (draft.purchase_price_eur_cents === p.purchase_price_eur_cents &&
            draft.list_price_eur_cents === p.list_price_eur_cents &&
            gpOrigStr === gpDraftStr) {
            priceDrafts.delete(id);
            e.target.classList.remove('is-dirty');
            e.target.closest('tr').classList.remove('is-dirty');
        } else {
            e.target.classList.add('is-dirty');
            e.target.closest('tr').classList.add('is-dirty');
        }

        // If base price changed, update placeholders for groups
        if (field === 'list_price_eur_cents') {
            const tr = e.target.closest('tr');
            tr.querySelectorAll('.inherit-placeholder').forEach(inp => {
                inp.placeholder = formatCents(draft.list_price_eur_cents || 0);
            });
        }
        
        updateUnsavedBanner();
    }

    async function saveDrafts() {
        if (priceDrafts.size === 0) return;
        const btn = document.getElementById('btn-save-drafts');
        btn.disabled = true;
        btn.textContent = 'Opslaan...';
        
        const rows = Array.from(priceDrafts.values());
        try {
            await window.Core.fetch('/admin/prices/bulk', { method: 'POST', body: { rows } });
            window.Workbench.toast(`${rows.length} producten bijgewerkt`, 'success');
            priceDrafts.clear();
            window.Router.route(); // Refresh to get new versions
        } catch(err) {
            window.Workbench.toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Opslaan';
        }
    }

    function renderGrid(products, groups) {
        return products.map(p => {
            const draft = priceDrafts.get(p.id);
            const cost = draft && draft.purchase_price_eur_cents !== undefined ? draft.purchase_price_eur_cents : p.purchase_price_eur_cents;
            const base = draft && draft.list_price_eur_cents !== undefined ? draft.list_price_eur_cents : p.list_price_eur_cents;
            
            const costDirty = draft && cost !== p.purchase_price_eur_cents;
            const baseDirty = draft && base !== p.list_price_eur_cents;

            const groupCells = groups.map(g => {
                const orig = p.group_prices?.find(gp => gp.group_id === g.id)?.price_eur_cents;
                const d = draft?.group_prices?.find(gp => gp.group_id === g.id)?.price_eur_cents;
                const val = d !== undefined ? d : orig;
                const isDirty = draft && val !== orig;
                return `<td><input type="text" inputmode="decimal" class="prices-input ${isDirty?'is-dirty':''} inherit-placeholder" data-id="${p.id}" data-field="group_${g.id}" value="${formatCents(val)}" placeholder="${formatCents(base||0)}"></td>`;
            }).join('');

            return `
            <tr class="prices-row ${draft ? 'is-dirty' : ''}" data-id="${p.id}">
                <td style="text-align:center"><input type="checkbox" class="row-select" value="${p.id}"></td>
                <td class="sku-cell" title="${esc(p.sku)}"><a href="${window.APP_BASE}admin/products/${p.id}" target="_blank">${esc(p.sku)}</a></td>
                <td class="name-cell" title="${esc(p.name)}">${esc(p.name)}</td>
                <td><input type="text" inputmode="decimal" class="prices-input ${costDirty?'is-dirty':''} unknown-placeholder" data-id="${p.id}" data-field="purchase_price_eur_cents" value="${formatCents(cost)}" placeholder="Onbekend"></td>
                <td><input type="text" inputmode="decimal" class="prices-input ${baseDirty?'is-dirty':''}" data-id="${p.id}" data-field="list_price_eur_cents" value="${formatCents(base)}" required></td>
                ${groupCells}
            </tr>
            `;
        }).join('');
    }

    window.Router.add(/^admin\/prices$/, async (match, root, qs) => {
        if (!window.Core.user || window.Core.user.role !== 'staff') return window.Router.navigate(window.APP_BASE);
        
        const searchParams = new URLSearchParams(qs);
        const q = searchParams.get('q') || '';
        const cat = searchParams.get('category') || '';
        const page = searchParams.get('page') || '1';

        const [data, catalogData] = await Promise.all([
            window.Core.fetch('/admin/prices?' + searchParams.toString()),
            window.Core.fetch('/catalog')
        ]);
        
        currentProducts = data.products;
        currentGroups = data.groups || [];
        
        const rate = data.exchange_rate;
        const rateBannerHtml = rate ? `
            <div class="prices-rate-banner ${rate.status}">
                <div>
                    <strong>ECB Koers:</strong> 1 EUR = ${(rate.rate_ppm / 1000000).toFixed(4)} ${rate.quote_currency} 
                    <span style="color:var(--wb-text-muted); font-size:0.75rem; margin-left:0.5rem;">(Peildatum: ${esc(rate.rate_date)})</span>
                </div>
                ${rate.status === 'stale' ? '<span class="wb-badge wb-badge-warning">Koers is verouderd (>7 dagen)</span>' : ''}
                ${rate.status === 'unavailable' ? '<span class="wb-badge wb-badge-danger">Koers niet beschikbaar</span>' : ''}
                ${rate.status === 'fresh' ? '<span class="wb-badge wb-badge-success">Actueel</span>' : ''}
            </div>
        ` : '';

        const catsHtml = catalogData.categories.map(c => `<option value="${c.id}" ${c.id == cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
        const groupHeaders = currentGroups.map(g => `<th title="${esc(g.name)}">${esc(g.name)}</th>`).join('');

        const content = `
            <div class="page-header">
                <h1>B2B Prijzen (EUR)</h1>
                <div class="prices-header-actions">
                    <button type="button" class="btn btn-outline" id="btn-import-excel">Plakken uit Excel</button>
                    <button type="button" class="btn btn-outline" id="btn-adjust-selected">Geselecteerde Aanpassen</button>
                    <button type="button" class="btn btn-outline" id="btn-bulk-adjust">Filter Bulk Aanpassen</button>
                </div>
            </div>
            
            ${rateBannerHtml}
            
            <form id="prices-filter-form" class="prices-toolbar" style="margin: 1.5rem 0;">
                <input type="text" name="q" value="${esc(q)}" placeholder="Zoek SKU of naam..." style="flex:1; min-width:200px;">
                <select name="category"><option value="">Alle Categorieën</option>${catsHtml}</select>
                <button type="submit" class="btn btn-outline">Filteren</button>
                <a href="${window.APP_BASE}admin/prices" class="btn btn-outline" style="border:none">Wissen</a>
            </form>

            <div class="prices-grid-container">
                <table class="prices-grid" id="prices-table">
                    <thead>
                        <tr>
                            <th style="width:40px; text-align:center"><input type="checkbox" id="select-all"></th>
                            <th>SKU</th>
                            <th>Naam</th>
                            <th>Inkoop (Cost)</th>
                            <th>Basis (Base)</th>
                            ${groupHeaders}
                        </tr>
                    </thead>
                    <tbody>
                        ${currentProducts.length ? renderGrid(currentProducts, currentGroups) : '<tr><td colspan="10" style="text-align:center; padding:2rem;">Geen producten gevonden.</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top:1rem;">
                ${window.Core.renderPagination(data.page, data.pages, searchParams, window.APP_BASE + 'admin/prices')}
            </div>

            <div id="prices-unsaved-banner" class="prices-unsaved-banner" hidden>
                <span><strong class="draft-count">0</strong> wijzigingen onopgeslagen</span>
                <button type="button" class="btn btn-discard" id="btn-discard-drafts">Annuleren</button>
                <button type="button" class="btn" id="btn-save-drafts">Opslaan</button>
            </div>
        `;

        root.innerHTML = window.Admin.layout(content, 'prices');

        // Events
        root.querySelector('#prices-table').addEventListener('input', handleInput);
        
        document.getElementById('prices-filter-form').onsubmit = (e) => {
            e.preventDefault();
            const p = new URLSearchParams();
            const fd = new FormData(e.target);
            for (let [k,v] of fd.entries()) {
                if (v) p.set(k, v);
            }
            window.Router.navigate(window.APP_BASE + 'admin/prices?' + p.toString());
        };

        const selectAll = document.getElementById('select-all');
        if (selectAll) {
            selectAll.addEventListener('change', e => {
                document.querySelectorAll('.row-select').forEach(cb => cb.checked = e.target.checked);
            });
        }

        document.getElementById('btn-discard-drafts')?.addEventListener('click', () => {
            if (confirm('Alle niet-opgeslagen wijzigingen weggooien?')) {
                priceDrafts.clear();
                window.Router.route();
            }
        });

        document.getElementById('btn-save-drafts')?.addEventListener('click', saveDrafts);
        
        updateUnsavedBanner();
        initModals(root, currentGroups, searchParams);
    });

    function initModals(root, groups, searchParams) {
        // Excel paste modal
        document.getElementById('btn-import-excel').addEventListener('click', () => {
            const html = `
                <div class="form-group">
                    <label>Plak rijen uit Excel (Kopieer SKU, Cost, Base, Groups...)</label>
                    <textarea id="excel-paste-area" class="form-control" rows="8" placeholder="SKU123\\t5,50\\t12,00\\t..."></textarea>
                    <small>Verwachte volgorde per rij (tab-gescheiden): SKU, Inkoopprijs, Basisprijs${groups.length ? ', ' + groups.map(g=>g.name).join(', ') : ''}. Lege cellen worden genegeerd. Een - (streepje) wist de waarde.</small>
                </div>
                <div class="alert error" id="paste-error" hidden></div>
                <button type="button" class="btn" id="btn-process-paste" style="width:100%">Analyseren</button>
            `;
            const overlay = window.UI.showModal('Excel Prijzen Plakken', html);
            
            document.getElementById('btn-process-paste').addEventListener('click', async () => {
                const text = document.getElementById('excel-paste-area').value;
                const rows = text.split('\n').map(r => r.trim().split('\t')).filter(r => r.length > 0 && r[0]);
                if (!rows.length) return;
                
                const btn = document.getElementById('btn-process-paste');
                btn.disabled = true;
                btn.textContent = 'Zoeken...';
                
                const skus = rows.map(r => r[0]);
                try {
                    for (const row of rows) {
                        if (row.length < 2) throw new Error(`Plak ${row[0]} met minstens één prijskolom, gescheiden door tabs.`);
                        for (let column = 1; column < Math.min(row.length, 3 + groups.length); column++) {
                            const cell = row[column].trim();
                            if (!cell) continue;
                            if (column === 2 && cell === '-') throw new Error(`De basisprijs van ${row[0]} kan niet worden gewist.`);
                            if (Number.isNaN(window.Workbench.parseCentsStrict(cell))) {
                                throw new Error(`Ongeldig EUR-bedrag bij ${row[0]}, kolom ${column + 1}: ${cell}`);
                            }
                        }
                    }
                    const res = await window.Core.fetch('/admin/prices/resolve', { method: 'POST', body: { skus } });
                    
                    let applied = 0;
                    rows.forEach(r => {
                        const sku = r[0];
                        const prod = res.products.find(p => p.sku === sku);
                        if (!prod) return;
                        
                        const draft = getDraftForPaste(prod);
                        
                        const parsePasteVal = (val) => {
                            if (!val || val === '') return undefined;
                            if (val === '-') return null;
                            const cents = window.Workbench.parseCentsStrict(val);
                            if (Number.isNaN(cents)) throw new Error(`Ongeldig EUR-bedrag bij ${sku}: ${val}`);
                            return cents;
                        };
                        
                        const cost = parsePasteVal(r[1]);
                        if (cost !== undefined) draft.purchase_price_eur_cents = cost;
                        
                        const base = parsePasteVal(r[2]);
                        if (base !== undefined && base !== null) draft.list_price_eur_cents = base; // cannot be null
                        
                        groups.forEach((g, i) => {
                            const gpVal = parsePasteVal(r[3 + i]);
                            if (gpVal !== undefined) {
                                const idx = draft.group_prices.findIndex(x => x.group_id === g.id);
                                if (idx >= 0) draft.group_prices[idx].price_eur_cents = gpVal;
                                else draft.group_prices.push({ group_id: g.id, price_eur_cents: gpVal });
                            }
                        });
                        
                        priceDrafts.set(prod.id, draft);
                        applied++;
                    });
                    
                    if (res.unknown_skus && res.unknown_skus.length > 0) {
                        const err = document.getElementById('paste-error');
                        err.textContent = `Onbekende SKUs genegeerd: ${res.unknown_skus.join(', ')}`;
                        err.hidden = false;
                        if (applied > 0) {
                            window.Workbench.toast(`${applied} producten in draft gezet. Sla op om te bevestigen.`, 'success');
                            window.Router.route(); // Re-render to show dirtiness
                        }
                    } else {
                        window.UI.closeModal(overlay);
                        window.Workbench.toast(`${applied} producten in draft gezet. Sla op om te bevestigen.`, 'success');
                        window.Router.route(); // Re-render to show dirtiness
                    }
                } catch(err) {
                    const errEl = document.getElementById('paste-error');
                    errEl.textContent = err.message;
                    errEl.hidden = false;
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Analyseren';
                }
            });
        });

        function getDraftForPaste(prod) {
            if (priceDrafts.has(prod.id)) return priceDrafts.get(prod.id);
            return {
                id: prod.id,
                version: prod.pricing_version,
                purchase_price_eur_cents: prod.purchase_price_eur_cents,
                list_price_eur_cents: prod.list_price_eur_cents,
                group_prices: JSON.parse(JSON.stringify(prod.group_prices || []))
            };
        }

        // Adjust Selected
        document.getElementById('btn-adjust-selected').addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.row-select:checked')).map(cb => parseInt(cb.value, 10));
            if (!selectedIds.length) {
                return window.Workbench.toast('Selecteer eerst producten in de tabel', 'warning');
            }
            
            const html = `
                <div class="alert info">Aanpassing wordt als concept (draft) toegepast op ${selectedIds.length} geselecteerde rijen.</div>
                <form id="adjust-selected-form">
                    <div class="form-group">
                        <label>Veld</label>
                        <select name="field" class="form-control">
                            <option value="list_price_eur_cents">Basisverkoopprijs</option>
                            <option value="purchase_price_eur_cents">Inkoopprijs</option>
                            ${groups.map(g => `<option value="group_${g.id}">Groepsprijs: ${esc(g.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Operatie</label>
                            <select name="operation" class="form-control">
                                <option value="percent">Percentage (+ of - %)</option>
                                <option value="add">Vast bedrag optellen (+ of - EUR)</option>
                                <option value="set">Instellen op exact bedrag (EUR)</option>
                                <option value="clear">Leegmaken (Onbekend/Erven)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Waarde</label>
                            <input type="text" inputmode="decimal" name="value" class="form-control">
                        </div>
                    </div>
                    <button type="submit" class="btn" style="width:100%">Toepassen op concepten</button>
                </form>
            `;
            const overlay = window.UI.showModal('Geselecteerde Aanpassen', html);
            
            const form = document.getElementById('adjust-selected-form');
            form.elements.operation.addEventListener('change', e => {
                form.elements.value.disabled = e.target.value === 'clear';
            });

            form.onsubmit = (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const field = fd.get('field');
                const op = fd.get('operation');
                let valStr = fd.get('value');
                let val = 0;
                
                if (valStr) {
                    if (op === 'percent') {
                        val = parseFloat(valStr.replace(',', '.'));
                    } else if (op === 'set' || op === 'add') {
                        const match = valStr.trim().replace(',', '.').match(/^(-?\d+)(\.(\d{0,2}))?$/);
                        if (!match) return window.Workbench.toast('Ongeldig bedrag', 'error');
                        val = Number(match[1]) * 100 + (valStr.trim().startsWith('-') ? -1 : 1) * Number((match[3] || '').padEnd(2, '0'));
                        if (op === 'set' && val < 0) return window.Workbench.toast('Bedrag kan niet negatief zijn', 'error');
                        val = val / 100; // Keep as float matching original logic before applying logic
                    }
                }
                
                selectedIds.forEach(id => {
                    const prod = currentProducts.find(p => p.id === id);
                    if (!prod) return;
                    
                    const draft = getDraftForPaste(prod);
                    let currentVal = null;
                    
                    if (field === 'purchase_price_eur_cents') currentVal = draft.purchase_price_eur_cents;
                    else if (field === 'list_price_eur_cents') currentVal = draft.list_price_eur_cents;
                    else if (field.startsWith('group_')) {
                        const gid = parseInt(field.split('_')[1], 10);
                        currentVal = draft.group_prices.find(x => x.group_id === gid)?.price_eur_cents;
                        if (currentVal === undefined) currentVal = draft.list_price_eur_cents; // inheritance base for calculation
                    }
                    
                    let newVal = currentVal;
                    if (op === 'clear') {
                        newVal = field === 'list_price_eur_cents' ? 0 : null;
                    } else if (op === 'set') {
                        newVal = Math.round(val * 100);
                    } else if (op === 'add') {
                        if (currentVal !== null && currentVal !== undefined) newVal = currentVal + Math.round(val * 100);
                    } else if (op === 'percent') {
                        if (currentVal !== null && currentVal !== undefined) newVal = Math.round(currentVal * (1 + val / 100));
                    }
                    
                    if (newVal !== null) newVal = Math.max(0, newVal); // No negative prices
                    
                    if (field === 'purchase_price_eur_cents') draft.purchase_price_eur_cents = newVal;
                    else if (field === 'list_price_eur_cents') draft.list_price_eur_cents = newVal;
                    else if (field.startsWith('group_')) {
                        const gid = parseInt(field.split('_')[1], 10);
                        const idx = draft.group_prices.findIndex(x => x.group_id === gid);
                        if (idx >= 0) draft.group_prices[idx].price_eur_cents = newVal;
                        else draft.group_prices.push({ group_id: gid, price_eur_cents: newVal });
                    }
                    
                    priceDrafts.set(id, draft);
                });
                
                window.UI.closeModal(overlay);
                window.Workbench.toast(`Concepten aangepast voor ${selectedIds.length} producten`, 'success');
                window.Router.route(); // Re-render to show changes
            };
        });

        // Bulk Adjust Modal
        document.getElementById('btn-bulk-adjust').addEventListener('click', () => {
            const html = `
                <div class="alert info">Filterwijziging past direct alle matchende producten op de server aan (max 10.000). Conceptwijzigingen worden niet meegenomen in deze berekening.</div>
                <form id="bulk-adjust-form">
                    <div class="form-group">
                        <label>Veld</label>
                        <select name="field" class="form-control">
                            <option value="list_price_eur_cents">Basisverkoopprijs</option>
                            <option value="purchase_price_eur_cents">Inkoopprijs</option>
                            ${groups.map(g => `<option value="group:${g.id}">Groepsprijs: ${esc(g.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Operatie</label>
                            <select name="operation" class="form-control">
                                <option value="percent">Percentage (+ of - %)</option>
                                <option value="add">Vast bedrag optellen (+ of - EUR)</option>
                                <option value="set">Instellen op exact bedrag (EUR)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Waarde</label>
                            <input type="text" inputmode="decimal" name="value" class="form-control" required>
                        </div>
                    </div>
                    <button type="submit" class="btn" style="width:100%" id="btn-preview-bulk">Preview Berekenen</button>
                </form>
                <div id="bulk-preview-result" style="margin-top:1.5rem; display:none;">
                    <hr style="border:0; border-top:1px solid var(--wb-border-light); margin-bottom:1rem;">
                    <p><strong><span id="bp-count"></span> producten</strong> worden aangepast.</p>
                    <div id="bp-samples" style="background:var(--wb-surface); padding:0.5rem; border-radius:4px; font-family:monospace; font-size:0.75rem; max-height:150px; overflow-y:auto; margin-bottom:1rem;"></div>
                    <button type="button" class="btn btn-primary" id="btn-apply-bulk" style="width:100%">Wijzigingen Definitief Doorvoeren</button>
                </div>
            `;
            const overlay = window.UI.showModal('Bulk Prijzen Wijzigen', html);
            
            let applyToken = null;

            document.getElementById('bulk-adjust-form').onsubmit = async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const field = fd.get('field');
                const op = fd.get('operation');
                let valStr = fd.get('value');
                let val = 0;
                
                if (op === 'percent') {
                    const parsed = parseFloat(valStr.replace(',', '.'));
                    if (isNaN(parsed)) return window.Workbench.toast('Ongeldig percentage', 'error');
                    val = Math.round(parsed * 100); // basis points
                } else if (op === 'set') {
                    val = window.Workbench.parseCentsStrict(valStr);
                    if (Number.isNaN(val)) return window.Workbench.toast('Ongeldig bedrag', 'error');
                } else if (op === 'add') {
                    const match = valStr.trim().replace(',', '.').match(/^(-?\d+)(\.(\d{0,2}))?$/);
                    if (!match) return window.Workbench.toast('Ongeldig bedrag', 'error');
                    val = Number(match[1]) * 100 + (valStr.trim().startsWith('-') ? -1 : 1) * Number((match[3] || '').padEnd(2, '0'));
                }
                
                const btn = document.getElementById('btn-preview-bulk');
                btn.disabled = true;
                btn.textContent = 'Berekenen...';
                
                const filters = {};
                for (const [k, v] of searchParams.entries()) {
                    if (['q', 'category', 'brand'].includes(k)) filters[k] = v;
                }

                try {
                    const res = await window.Core.fetch('/admin/prices/adjust/preview', {
                        method: 'POST',
                        body: { filters, field, operation: op, value: val }
                    });
                    
                    document.getElementById('bp-count').textContent = res.count;
                    document.getElementById('bp-samples').textContent = res.samples.map(s => {
                        const beforeStr = s.before != null ? (s.before / 100).toFixed(2) : 'Onbekend';
                        const afterStr = s.after != null ? (s.after / 100).toFixed(2) : 'Onbekend';
                        return `${s.sku}: ${beforeStr} -> ${afterStr}`;
                    }).join('\n');
                    applyToken = res.token;
                    document.getElementById('bulk-preview-result').style.display = 'block';
                } catch (err) {
                    window.Workbench.toast(err.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Preview Berekenen';
                }
            };
            
            document.getElementById('btn-apply-bulk').addEventListener('click', async (e) => {
                if (!applyToken) return;
                const btn = e.target;
                btn.disabled = true;
                btn.textContent = 'Toepassen...';
                try {
                    await window.Core.fetch('/admin/prices/adjust/apply', { method: 'POST', body: { token: applyToken } });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast('Bulk update uitgevoerd', 'success');
                    priceDrafts.clear(); // invalidate drafts since server changed
                    window.Router.route();
                } catch(err) {
                    window.Workbench.toast(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Wijzigingen Definitief Doorvoeren';
                }
            });
        });
    }
})();