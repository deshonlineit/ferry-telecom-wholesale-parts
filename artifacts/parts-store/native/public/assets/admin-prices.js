(function initAdminPrices() {
    let priceDrafts = new Map();
    let currentGroups = [];
    let currentProducts = [];

    if (window.Router) {
        const origNav = window.Router.navigate;
        window.Router.navigate = function(url) {
            const isSamePage = url.replace(/^https?:\/\/[^\/]+/, '').startsWith(window.APP_BASE + 'admin/prices');
            if (priceDrafts.size > 0 && !isSamePage) {
                if (!confirm('You have unsaved price changes. Are you sure you want to leave this page?')) return;
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

    function pricingGroupRank(group) {
        const name = String(group?.name || '').toLowerCase();
        if (name.includes('partner')) return 1;
        if (name.includes('wholesale')) return 2;
        if (name.includes('repair')) return 3;
        return 10;
    }

    function pricingGroupLabel(group) {
        const name = String(group?.name || '');
        const normalized = name.toLowerCase();
        if (normalized.includes('partner')) return 'Partner Price';
        if (normalized.includes('wholesale')) return 'Wholesale Price';
        if (normalized.includes('repair')) return 'Big Repair Shop Price';
        return `${name} Price`;
    }

    function orderedPricingGroups(groups) {
        return [...groups].sort((a, b) => pricingGroupRank(a) - pricingGroupRank(b) || a.id - b.id);
    }

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
        else if (field.startsWith('group_')) {
            const gid = parseInt(field.split('_')[1], 10);
            const idx = draft.group_prices.findIndex(x => x.group_id === gid);
            if (idx >= 0) draft.group_prices[idx].price_eur_cents = val;
            else draft.group_prices.push({ group_id: gid, price_eur_cents: val });
        }

        // Clean up draft if unchanged
        const gpOrigStr = JSON.stringify([...(p.group_prices||[])].sort((a,b)=>a.group_id-b.group_id));
        const gpDraftStr = JSON.stringify([...draft.group_prices].sort((a,b)=>a.group_id-b.group_id));
        
        if (draft.purchase_price_eur_cents === p.purchase_price_eur_cents && gpOrigStr === gpDraftStr) {
            priceDrafts.delete(id);
            e.target.classList.remove('is-dirty');
            e.target.closest('tr').classList.remove('is-dirty');
        } else {
            e.target.classList.add('is-dirty');
            e.target.closest('tr').classList.add('is-dirty');
        }

        updateUnsavedBanner();
    }

    async function saveDrafts() {
        if (priceDrafts.size === 0) return;
        const btn = document.getElementById('btn-save-drafts');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        const rows = Array.from(priceDrafts.values());
        try {
            await window.Core.fetch('/admin/prices/bulk', { method: 'POST', body: { rows } });
            window.Workbench.toast(`${rows.length} products updated`, 'success');
            priceDrafts.clear();
            window.Router.route(); // Refresh to get new versions
        } catch(err) {
            window.Workbench.toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Save';
        }
    }

    function renderGrid(products, groups) {
        return products.map(p => {
            const draft = priceDrafts.get(p.id);
            const cost = draft && draft.purchase_price_eur_cents !== undefined ? draft.purchase_price_eur_cents : p.purchase_price_eur_cents;
            const costDirty = draft && cost !== p.purchase_price_eur_cents;

            const groupCells = groups.map(g => {
                const orig = p.group_prices?.find(gp => gp.group_id === g.id)?.price_eur_cents;
                const d = draft?.group_prices?.find(gp => gp.group_id === g.id)?.price_eur_cents;
                const val = d !== undefined ? d : orig;
                const isDirty = draft && val !== orig;
                return `<td><input type="text" inputmode="decimal" class="prices-input ${isDirty?'is-dirty':''}" data-id="${p.id}" data-field="group_${g.id}" value="${formatCents(val)}" placeholder="Required"></td>`;
            }).join('');

            return `
            <tr class="prices-row ${draft ? 'is-dirty' : ''}" data-id="${p.id}">
                <td style="text-align:center"><input type="checkbox" class="row-select" value="${p.id}"></td>
                <td class="sku-cell" title="${esc(p.sku)}"><a href="${window.APP_BASE}admin/products/${p.id}" target="_blank">${esc(p.sku)}</a></td>
                <td class="name-cell" title="${esc(p.name)}">${esc(p.name)}</td>
                <td><input type="text" inputmode="decimal" class="prices-input ${costDirty?'is-dirty':''} unknown-placeholder" data-id="${p.id}" data-field="purchase_price_eur_cents" value="${formatCents(cost)}" placeholder="Unknown"></td>
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
        currentGroups = orderedPricingGroups(data.groups || []);
        
        const rate = data.exchange_rate;
        const rateBannerHtml = rate ? `
            <div class="prices-rate-banner ${rate.status}">
                <div>
                    <strong>ECB Rate:</strong> 1 EUR = ${(rate.rate_ppm / 1000000).toFixed(4)} ${rate.quote_currency} 
                    <span style="color:var(--wb-text-muted); font-size:0.75rem; margin-left:0.5rem;">(Reference date: ${esc(rate.rate_date)})</span>
                </div>
                ${rate.status === 'stale' ? '<span class="wb-badge wb-badge-warning">Rate is out of date (>7 days)</span>' : ''}
                ${rate.status === 'unavailable' ? '<span class="wb-badge wb-badge-danger">Rate unavailable</span>' : ''}
                ${rate.status === 'fresh' ? '<span class="wb-badge wb-badge-success">Current</span>' : ''}
            </div>
        ` : '';

        const catsHtml = catalogData.categories.map(c => `<option value="${c.id}" ${c.id == cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
        const groupHeaders = currentGroups.map(g => `<th title="${esc(g.name)}">${esc(pricingGroupLabel(g))}</th>`).join('');

        const content = `
            <div class="page-header">
                <h1>B2B Prices (EUR)</h1>
                <div class="prices-header-actions">
                    <button type="button" class="btn btn-outline" id="btn-import-woocommerce">Import WooCommerce prices</button>
                    <button type="button" class="btn btn-outline" id="btn-import-excel">Paste from Excel</button>
                    <button type="button" class="btn btn-outline" id="btn-adjust-selected">Adjust Selected</button>
                    <button type="button" class="btn btn-outline" id="btn-bulk-adjust">Bulk Adjust Filtered</button>
                </div>
            </div>
            
            ${rateBannerHtml}
            
            <form id="prices-filter-form" class="prices-toolbar" style="margin: 1.5rem 0;">
                <div class="form-group" style="flex: 2; min-width: 200px;"><input type="text" name="q" class="form-control" value="${esc(q)}" placeholder="Search by SKU or name..."></div>
                <div class="form-group"><select name="category" class="form-control"><option value="">All Categories</option>${catsHtml}</select></div>
                <button type="submit" class="btn btn-outline">Filter</button>
                <a href="${window.APP_BASE}admin/prices" class="btn btn-outline">Clear</a>
            </form>

            <div class="prices-grid-container">
                <table class="prices-grid" id="prices-table">
                    <thead>
                        <tr>
                            <th style="width:40px; text-align:center"><input type="checkbox" id="select-all"></th>
                            <th>SKU</th>
                            <th>Name</th>
                            <th>Purchase Cost (EUR)</th>
                            ${groupHeaders}
                        </tr>
                    </thead>
                    <tbody>
                        ${currentProducts.length ? renderGrid(currentProducts, currentGroups) : '<tr><td colspan="10" style="text-align:center; padding:2rem;">No products found.</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top:1rem;">
                ${window.Core.renderPagination(data.page, data.pages, searchParams, window.APP_BASE + 'admin/prices')}
            </div>

            <div id="prices-unsaved-banner" class="prices-unsaved-banner" hidden>
                <span><strong class="draft-count">0</strong> unsaved changes</span>
                <button type="button" class="btn btn-discard" id="btn-discard-drafts">Cancel</button>
                <button type="button" class="btn" id="btn-save-drafts">Save</button>
            </div>
        `;

        root.innerHTML = window.Admin.layout(content, 'prices');

        // Events
        root.querySelector('#prices-table').addEventListener('input', handleInput);

        document.getElementById('btn-import-woocommerce').addEventListener('click', () => {
            const overlay = window.UI.modal('Import WooCommerce prices', `
                <p>Upload the complete WooCommerce product export. Published products remain visible when prices are incomplete, but customers cannot order them until their group has a valid price.</p>
                <form id="woo-price-import-form">
                    <div class="form-group"><input class="form-control" type="file" name="file" accept=".csv,text/csv" required></div>
                    <button type="submit" class="btn" id="woo-price-preview">Check export</button>
                </form>
                <div id="woo-price-result" style="display:none;margin-top:1rem">
                    <pre id="woo-price-summary" style="white-space:pre-wrap"></pre>
                    <button type="button" class="btn" id="woo-price-apply">Apply checked prices</button>
                </div>
            `);
            let token = null;
            overlay.querySelector('#woo-price-import-form').onsubmit = async event => {
                event.preventDefault();
                const button = overlay.querySelector('#woo-price-preview');
                button.disabled = true;
                try {
                    const result = await window.Core.fetch('/admin/prices/import/preview', {
                        method: 'POST', body: new FormData(event.target)
                    });
                    token = result.token;
                    overlay.querySelector('#woo-price-summary').textContent =
                        `${result.published_source_skus} published SKUs\n` +
                        `${result.complete_price_sets} complete price sets\n` +
                        `${result.visible_without_complete_price_set} incomplete sets remain visible but not orderable\n` +
                        `${result.source_skus_missing_from_catalog} SKUs missing from this catalogue`;
                    overlay.querySelector('#woo-price-result').style.display = 'block';
                } catch (error) {
                    window.Workbench.toast(error.message, 'error');
                } finally {
                    button.disabled = false;
                }
            };
            overlay.querySelector('#woo-price-apply').onclick = async event => {
                if (!token) return;
                event.target.disabled = true;
                try {
                    const result = await window.Core.fetch('/admin/prices/import/apply', {
                        method: 'POST', body: {token}
                    });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast(`${result.complete_price_sets} complete price sets imported`, 'success');
                    priceDrafts.clear();
                    window.Router.route();
                } catch (error) {
                    window.Workbench.toast(error.message, 'error');
                    event.target.disabled = false;
                }
            };
        });
        
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
            if (confirm('Discard all unsaved changes?')) {
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
                    <label>Paste rows from Excel (Copy SKU, Purchase Cost EUR, Customer Prices...)</label>
                    <textarea id="excel-paste-area" class="form-control" rows="8" placeholder="SKU123\\t5,50\\t12,00\\t..."></textarea>
                    <small>Expected order per row (tab-separated): SKU, purchase cost EUR${groups.length ? ', ' + groups.map(pricingGroupLabel).join(', ') : ''}. Blank cells are ignored. A - (dash) clears the value.</small>
                </div>
                <div class="alert error" id="paste-error" hidden></div>
                <button type="button" class="btn" id="btn-process-paste" style="width:100%">Analyse</button>
            `;
            const overlay = window.UI.showModal('Paste Excel Prices', html);
            
            document.getElementById('btn-process-paste').addEventListener('click', async () => {
                const text = document.getElementById('excel-paste-area').value;
                const rows = text.split('\n').map(r => r.trim().split('\t')).filter(r => r.length > 0 && r[0]);
                if (!rows.length) return;
                
                const btn = document.getElementById('btn-process-paste');
                btn.disabled = true;
                btn.textContent = 'Searching...';
                
                const skus = rows.map(r => r[0]);
                try {
                    for (const row of rows) {
                        if (row.length < 2) throw new Error(`Paste ${row[0]} with at least one price column, separated by tabs.`);
                        for (let column = 1; column < Math.min(row.length, 2 + groups.length); column++) {
                            const cell = row[column].trim();
                            if (!cell) continue;
                            if (Number.isNaN(window.Workbench.parseCentsStrict(cell))) {
                                throw new Error(`Invalid EUR amount for ${row[0]}, column ${column + 1}: ${cell}`);
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
                            if (Number.isNaN(cents)) throw new Error(`Invalid EUR amount for ${sku}: ${val}`);
                            return cents;
                        };
                        
                        const cost = parsePasteVal(r[1]);
                        if (cost !== undefined) draft.purchase_price_eur_cents = cost;
                        
                        groups.forEach((g, i) => {
                            const gpVal = parsePasteVal(r[2 + i]);
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
                        err.textContent = `Unknown SKUs ignored: ${res.unknown_skus.join(', ')}`;
                        err.hidden = false;
                        if (applied > 0) {
                            window.Workbench.toast(`${applied} products added to the draft. Save to confirm.`, 'success');
                            window.Router.route(); // Re-render to show dirtiness
                        }
                    } else {
                        window.UI.closeModal(overlay);
                        window.Workbench.toast(`${applied} products added to the draft. Save to confirm.`, 'success');
                        window.Router.route(); // Re-render to show dirtiness
                    }
                } catch(err) {
                    const errEl = document.getElementById('paste-error');
                    errEl.textContent = err.message;
                    errEl.hidden = false;
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Analyse';
                }
            });
        });

        function getDraftForPaste(prod) {
            if (priceDrafts.has(prod.id)) return priceDrafts.get(prod.id);
            return {
                id: prod.id,
                version: prod.pricing_version,
                purchase_price_eur_cents: prod.purchase_price_eur_cents,
                group_prices: JSON.parse(JSON.stringify(prod.group_prices || []))
            };
        }

        // Adjust Selected
        document.getElementById('btn-adjust-selected').addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.row-select:checked')).map(cb => parseInt(cb.value, 10));
            if (!selectedIds.length) {
                return window.Workbench.toast('Select products in the table first', 'warning');
            }
            
            const html = `
                <div class="alert info">The adjustment will be applied as a draft to ${selectedIds.length} selected rows.</div>
                <form id="adjust-selected-form">
                    <div class="form-group">
                        <label>Field</label>
                        <select name="field" class="form-control">
                            <option value="purchase_price_eur_cents">Purchase Cost (EUR)</option>
                            ${groups.map(g => `<option value="group_${g.id}">${esc(pricingGroupLabel(g))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Operation</label>
                            <select name="operation" class="form-control">
                                <option value="percent">Percentage (+ of - %)</option>
                                <option value="add">Add fixed amount (+ or - EUR)</option>
                                <option value="set">Set exact amount (EUR)</option>
                                <option value="clear">Clear (Unknown/Inherit)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Value</label>
                            <input type="text" inputmode="decimal" name="value" class="form-control">
                        </div>
                    </div>
                    <button type="submit" class="btn" style="width:100%">Apply to Drafts</button>
                </form>
            `;
            const overlay = window.UI.showModal('Adjust Selected', html);
            
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
                        if (!match) return window.Workbench.toast('Invalid amount', 'error');
                        val = Number(match[1]) * 100 + (valStr.trim().startsWith('-') ? -1 : 1) * Number((match[3] || '').padEnd(2, '0'));
                        if (op === 'set' && val < 0) return window.Workbench.toast('Amount cannot be negative', 'error');
                        val = val / 100; // Keep as float matching original logic before applying logic
                    }
                }
                
                selectedIds.forEach(id => {
                    const prod = currentProducts.find(p => p.id === id);
                    if (!prod) return;
                    
                    const draft = getDraftForPaste(prod);
                    let currentVal = null;
                    
                    if (field === 'purchase_price_eur_cents') currentVal = draft.purchase_price_eur_cents;
                    else if (field.startsWith('group_')) {
                        const gid = parseInt(field.split('_')[1], 10);
                        currentVal = draft.group_prices.find(x => x.group_id === gid)?.price_eur_cents;
                    }
                    
                    let newVal = currentVal;
                    if (op === 'clear') {
                        newVal = null;
                    } else if (op === 'set') {
                        newVal = Math.round(val * 100);
                    } else if (op === 'add') {
                        if (currentVal !== null && currentVal !== undefined) newVal = currentVal + Math.round(val * 100);
                    } else if (op === 'percent') {
                        if (currentVal !== null && currentVal !== undefined) newVal = Math.round(currentVal * (1 + val / 100));
                    }
                    
                    if (newVal !== null) newVal = Math.max(0, newVal); // No negative prices
                    
                    if (field === 'purchase_price_eur_cents') draft.purchase_price_eur_cents = newVal;
                    else if (field.startsWith('group_')) {
                        const gid = parseInt(field.split('_')[1], 10);
                        const idx = draft.group_prices.findIndex(x => x.group_id === gid);
                        if (idx >= 0) draft.group_prices[idx].price_eur_cents = newVal;
                        else draft.group_prices.push({ group_id: gid, price_eur_cents: newVal });
                    }
                    
                    priceDrafts.set(id, draft);
                });
                
                window.UI.closeModal(overlay);
                window.Workbench.toast(`Drafts adjusted for ${selectedIds.length} products`, 'success');
                window.Router.route(); // Re-render to show changes
            };
        });

        // Bulk Adjust Modal
        document.getElementById('btn-bulk-adjust').addEventListener('click', () => {
            const html = `
                <div class="alert info">This filtered adjustment directly updates all matching products on the server (max. 10,000). Draft changes are not included in this calculation.</div>
                <form id="bulk-adjust-form">
                    <div class="form-group">
                        <label>Field</label>
                        <select name="field" class="form-control">
                            <option value="purchase_price_eur_cents">Purchase Cost (EUR)</option>
                            ${groups.map(g => `<option value="group:${g.id}">${esc(pricingGroupLabel(g))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="grid-cols-2">
                        <div class="form-group">
                            <label>Operation</label>
                            <select name="operation" class="form-control">
                                <option value="percent">Percentage (+ of - %)</option>
                                <option value="add">Add fixed amount (+ or - EUR)</option>
                                <option value="set">Set exact amount (EUR)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Value</label>
                            <input type="text" inputmode="decimal" name="value" class="form-control" required>
                        </div>
                    </div>
                    <button type="submit" class="btn" style="width:100%" id="btn-preview-bulk">Calculate Preview</button>
                </form>
                <div id="bulk-preview-result" style="margin-top:1.5rem; display:none;">
                    <hr style="border:0; border-top:1px solid var(--wb-border-light); margin-bottom:1rem;">
                    <p><strong><span id="bp-count"></span> products</strong> will be adjusted.</p>
                    <div id="bp-samples" style="background:var(--wb-surface); padding:0.5rem; border-radius:4px; font-family:monospace; font-size:0.75rem; max-height:150px; overflow-y:auto; margin-bottom:1rem;"></div>
                    <button type="button" class="btn btn-primary" id="btn-apply-bulk" style="width:100%">Apply Changes Permanently</button>
                </div>
            `;
            const overlay = window.UI.showModal('Change Prices in Bulk', html);
            
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
                    if (isNaN(parsed)) return window.Workbench.toast('Invalid percentage', 'error');
                    val = Math.round(parsed * 100); // basis points
                } else if (op === 'set') {
                    val = window.Workbench.parseCentsStrict(valStr);
                    if (Number.isNaN(val)) return window.Workbench.toast('Invalid amount', 'error');
                } else if (op === 'add') {
                    const match = valStr.trim().replace(',', '.').match(/^(-?\d+)(\.(\d{0,2}))?$/);
                    if (!match) return window.Workbench.toast('Invalid amount', 'error');
                    val = Number(match[1]) * 100 + (valStr.trim().startsWith('-') ? -1 : 1) * Number((match[3] || '').padEnd(2, '0'));
                }
                
                const btn = document.getElementById('btn-preview-bulk');
                btn.disabled = true;
                btn.textContent = 'Calculating...';
                
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
                        const beforeStr = s.before != null ? (s.before / 100).toFixed(2) : 'Unknown';
                        const afterStr = s.after != null ? (s.after / 100).toFixed(2) : 'Unknown';
                        return `${s.sku}: ${beforeStr} -> ${afterStr}`;
                    }).join('\n');
                    applyToken = res.token;
                    document.getElementById('bulk-preview-result').style.display = 'block';
                } catch (err) {
                    window.Workbench.toast(err.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Calculate Preview';
                }
            };
            
            document.getElementById('btn-apply-bulk').addEventListener('click', async (e) => {
                if (!applyToken) return;
                const btn = e.target;
                btn.disabled = true;
                btn.textContent = 'Applying...';
                try {
                    await window.Core.fetch('/admin/prices/adjust/apply', { method: 'POST', body: { token: applyToken } });
                    window.UI.closeModal(overlay);
                    window.Workbench.toast('Bulk update completed', 'success');
                    priceDrafts.clear(); // invalidate drafts since server changed
                    window.Router.route();
                } catch(err) {
                    window.Workbench.toast(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'Apply Changes Permanently';
                }
            });
        });
    }
})();