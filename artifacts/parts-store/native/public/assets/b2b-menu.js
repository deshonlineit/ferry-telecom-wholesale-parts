(function() {
    const esc = window.Core.escapeHtml;

    window.StoreMenu = {
        init: function() {
            let nav = document.getElementById('store-menu');
            if (nav && nav.dataset.b2bInit) return;
            
            if (!nav) {
                nav = document.createElement('nav');
                nav.id = 'store-menu';
                nav.className = 'store-menu';
                const headerInner = document.querySelector('.app-header .header-inner');
                if (headerInner) {
                    headerInner.parentNode.insertBefore(nav, headerInner.nextSibling);
                } else {
                    return;
                }
            }
            nav.dataset.b2bInit = "true";
            nav.innerHTML = '';
            
            const menuContainer = document.createElement('div');
            menuContainer.className = 'container store-menu-container';
            
            const menuWrap = document.createElement('div');
            menuWrap.className = 'b2b-menu-wrapper';
            
            const menuBtn = document.createElement('button');
            menuBtn.className = 'b2b-menu-btn';
            menuBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg> MENU <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            menuBtn.setAttribute('aria-expanded', 'false');
            menuBtn.setAttribute('aria-controls', 'b2b-menu-dropdown');
            
            const menuDropdown = document.createElement('div');
            menuDropdown.id = 'b2b-menu-dropdown';
            menuDropdown.className = 'b2b-menu-dropdown';
            menuDropdown.hidden = true;
            
            menuWrap.appendChild(menuBtn);
            menuWrap.appendChild(menuDropdown);
            menuContainer.appendChild(menuWrap);
            nav.appendChild(menuContainer);

            let catalogData = null;
            let isLoading = false;

            const loadCatalog = async () => {
                if (catalogData || isLoading) return;
                isLoading = true;
                try {
                    menuDropdown.innerHTML = '<div class="b2b-menu-loader"><div class="spinner" style="width:24px;height:24px;border-width:2px;"></div></div>';
                    catalogData = await window.Core.fetch('/catalog');
                    renderMenu();
                } catch (err) {
                    menuDropdown.innerHTML = `<div class="b2b-menu-error text-danger p-3">Kon menu niet laden. <button type="button" class="btn btn-outline btn-sm b2b-menu-retry mt-2">Opnieuw proberen</button></div>`;
                    const retry = menuDropdown.querySelector('.b2b-menu-retry');
                    if (retry) retry.addEventListener('click', (e) => {
                        e.stopPropagation();
                        isLoading = false;
                        loadCatalog();
                    });
                } finally {
                    isLoading = false;
                }
            };

            const renderMenu = () => {
                if (!catalogData) return;
                
                const brandFamilies = {};
                const familyModels = {};
                (catalogData.models || []).forEach(m => {
                    if (!brandFamilies[m.brand_id]) brandFamilies[m.brand_id] = new Set();
                    if (m.family) brandFamilies[m.brand_id].add(m.family);
                    
                    if (!familyModels[m.family]) familyModels[m.family] = [];
                    familyModels[m.family].push(m);
                });
                
                const rootHtml = [];
                
                // Group brands and families
                (catalogData.brands || []).filter(b => b.count > 0).forEach(brand => {
                    const fSet = brandFamilies[brand.id];
                    if (!fSet || fSet.size === 0) {
                        rootHtml.push(`<a href="${window.APP_BASE}catalog?brand=${brand.id}" class="b2b-menu-item"><strong>${esc(brand.name.toUpperCase())} PARTS</strong></a>`);
                        return;
                    }
                    
                    rootHtml.push(`<div class="b2b-menu-group">`);
                    rootHtml.push(`<div class="b2b-menu-heading">${esc(brand.name.toUpperCase())} PARTS</div>`);
                    
                    const families = (catalogData.device_families || []).filter(f => fSet.has(f.id) && f.count > 0);
                    families.forEach(f => {
                        rootHtml.push(`<button type="button" class="b2b-menu-item b2b-has-children" data-panel="family-${f.id}" aria-expanded="false">
                            <span>${esc(f.label)}</span>
                            <svg class="chevron-right" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>`);
                    });
                    rootHtml.push(`</div>`);
                });
                
                // Group non-part categories
                const supplies = window.App.groupCategories ? window.App.groupCategories(catalogData.categories).supplies : [];
                if (supplies.length > 0) {
                    rootHtml.push(`<div class="b2b-menu-group"><div class="b2b-menu-heading">ACCESSORIES & TOOLS</div>`);
                    supplies.filter(c => c.count > 0).forEach(c => {
                        rootHtml.push(`<a href="${window.APP_BASE}catalog?category=${c.id}" class="b2b-menu-item"><strong>${esc(c.name.toUpperCase())}</strong></a>`);
                    });
                    rootHtml.push(`</div>`);
                }

                let panelsHtml = `<div class="b2b-menu-panel b2b-panel-active" id="panel-root">${rootHtml.join('')}</div>`;
                
                (catalogData.device_families || []).forEach(f => {
                    const models = familyModels[f.id] || [];
                    if (models.length === 0) return;
                    
                    models.sort((a, b) => {
                        return Number(Boolean(b.order_known)) - Number(Boolean(a.order_known))
                            || Number(b.sort_order || 0) - Number(a.sort_order || 0)
                            || b.name.localeCompare(a.name, 'nl', {numeric: true});
                    });
                    
                    panelsHtml += `
                        <div class="b2b-menu-panel b2b-panel-hidden" id="panel-family-${f.id}">
                            <button type="button" class="b2b-menu-back" data-target="panel-root">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                Terug naar menu
                            </button>
                            <div class="b2b-menu-heading">${esc(f.label)}</div>
                            <a href="${window.APP_BASE}catalog?family=${f.id}" class="b2b-menu-item b2b-menu-all">Alle ${esc(f.label)} onderdelen →</a>
                            <div class="b2b-menu-list">
                                ${models.map(m => `
                                    <a href="${window.APP_BASE}catalog?model=${m.id}" class="b2b-menu-item">
                                        <span>${esc(m.name)}</span>
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    `;
                });

                menuDropdown.innerHTML = `<div class="b2b-menu-slider">${panelsHtml}</div>`;
                menuDropdown.querySelectorAll('.b2b-menu-panel').forEach(panel => {
                    panel.inert = panel.id !== 'panel-root';
                    panel.setAttribute('aria-hidden', String(panel.inert));
                });
            };

            const toggleMenu = (force) => {
                const isHidden = force !== undefined ? !force : !menuDropdown.hidden;
                menuDropdown.hidden = isHidden;
                menuBtn.classList.toggle('active', !isHidden);
                menuBtn.setAttribute('aria-expanded', !isHidden);
                
                if (!isHidden) {
                    loadCatalog();
                    const panels = menuDropdown.querySelectorAll('.b2b-menu-panel');
                    panels.forEach(p => {
                        p.classList.remove('b2b-panel-active');
                        p.classList.add('b2b-panel-hidden');
                        p.inert = true;
                        p.setAttribute('aria-hidden', 'true');
                    });
                    const root = menuDropdown.querySelector('#panel-root');
                    if (root) {
                        root.classList.remove('b2b-panel-hidden');
                        root.classList.remove('b2b-panel-hidden-left', 'b2b-panel-hidden-right');
                        root.classList.add('b2b-panel-active');
                        root.inert = false;
                        root.setAttribute('aria-hidden', 'false');
                    }
                }
            };

            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMenu();
            });

            document.addEventListener('click', (e) => {
                if (!menuWrap.contains(e.target) && !menuDropdown.hidden) {
                    toggleMenu(false);
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !menuDropdown.hidden) {
                    toggleMenu(false);
                    menuBtn.focus();
                }
            });

            menuDropdown.addEventListener('click', (e) => {
                const fwdBtn = e.target.closest('.b2b-has-children');
                const backBtn = e.target.closest('.b2b-menu-back');
                const link = e.target.closest('a');
                
                if (link) {
                    toggleMenu(false);
                    return;
                }
                
                if (fwdBtn) {
                    e.stopPropagation();
                    const targetId = `panel-${fwdBtn.dataset.panel}`;
                    const targetPanel = menuDropdown.querySelector(`#${targetId}`);
                    const currentPanel = fwdBtn.closest('.b2b-menu-panel');
                    
                    if (targetPanel && currentPanel) {
                        currentPanel.classList.remove('b2b-panel-active');
                        currentPanel.classList.add('b2b-panel-hidden-left');
                        currentPanel.inert = true;
                        currentPanel.setAttribute('aria-hidden', 'true');
                        
                        targetPanel.classList.remove('b2b-panel-hidden', 'b2b-panel-hidden-right', 'b2b-panel-hidden-left');
                        targetPanel.classList.add('b2b-panel-active');
                        targetPanel.inert = false;
                        targetPanel.setAttribute('aria-hidden', 'false');
                        targetPanel.scrollTop = 0;
                        targetPanel.querySelector('button, a')?.focus({preventScroll: true});
                    }
                } else if (backBtn) {
                    e.stopPropagation();
                    const targetId = backBtn.dataset.target;
                    const targetPanel = menuDropdown.querySelector(`#${targetId}`);
                    const currentPanel = backBtn.closest('.b2b-menu-panel');
                    
                    if (targetPanel && currentPanel) {
                        currentPanel.classList.remove('b2b-panel-active');
                        currentPanel.classList.add('b2b-panel-hidden', 'b2b-panel-hidden-right');
                        currentPanel.inert = true;
                        currentPanel.setAttribute('aria-hidden', 'true');
                        
                        targetPanel.classList.remove('b2b-panel-hidden-left');
                        targetPanel.classList.add('b2b-panel-active');
                        targetPanel.inert = false;
                        targetPanel.setAttribute('aria-hidden', 'false');
                        targetPanel.querySelector('button, a')?.focus({preventScroll: true});
                    }
                }
            });
        }
    };
})();