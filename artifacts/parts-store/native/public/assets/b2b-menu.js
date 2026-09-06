(function () {
    const esc = window.Core.escapeHtml;
    const MOBILE_WIDTH = 768;

    const currentParams = () => new URLSearchParams(window.location?.search || '');
    const compatibilityUrl = changes => {
        const params = currentParams();
        ['brand', 'q', 'page'].forEach(key => params.delete(key));
        Object.entries(changes || {}).forEach(([key, value]) => {
            if (value === '' || value === null || value === undefined) params.delete(key);
            else params.set(key, String(value));
        });
        return window.APP_BASE + 'catalog' + (params.size ? '?' + params.toString() : '');
    };
    const orderedModels = models => [...models].sort((a, b) =>
        Number(Boolean(b.order_known)) - Number(Boolean(a.order_known))
        || Number(b.sort_order || 0) - Number(a.sort_order || 0)
        || String(b.name).localeCompare(String(a.name), 'nl', {numeric: true})
    );
    const deviceData = catalog => {
        const familiesById = new Map((catalog.device_families || []).map(family => [String(family.id), family]));
        const brandsById = new Map((catalog.brands || []).map(brand => [String(brand.id), brand]));
        const groups = new Map();
        (catalog.models || []).forEach(model => {
            const family = familiesById.get(String(model.family || ''));
            const brand = brandsById.get(String(model.brand_id));
            if (!family || !brand) return;
            const key = String(brand.id);
            if (!groups.has(key)) groups.set(key, {brand, families: new Map(), modelCount: 0});
            const group = groups.get(key);
            if (!group.families.has(String(family.id))) group.families.set(String(family.id), {family, models: []});
            group.families.get(String(family.id)).models.push(model);
            group.modelCount++;
        });
        return [...groups.values()].map(group => ({
            brand: group.brand,
            modelCount: group.modelCount,
            families: [...group.families.values()].map(entry => ({
                family: entry.family,
                models: orderedModels(entry.models)
            }))
        })).sort((a, b) => b.modelCount - a.modelCount
            || String(a.brand.name).localeCompare(String(b.brand.name), 'nl'));
    };

    const setHidden = (element, hidden) => {
        if (!element) return;
        element.hidden = hidden;
        element.inert = hidden;
        if (hidden) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
    };

    const Menu = window.StoreMenu = {
        _nav: null,
        _container: null,
        _openItem: null,
        _mobileOpen: false,
        _listenersBound: false,
        _request: 0,

        compatibilityUrl,
        orderedModels,
        deviceData,

        init() {
            let nav = document.getElementById('store-menu');
            if (!nav) {
                nav = document.createElement('nav');
                nav.id = 'store-menu';
                const headerInner = document.querySelector('.app-header .header-inner');
                if (!headerInner) return;
                headerInner.parentNode.insertBefore(nav, headerInner.nextSibling);
            }
            if (nav.dataset.b2bInit === 'true') {
                Menu._nav = nav;
                return;
            }
            nav.dataset.b2bInit = 'true';
            nav.className = 'store-mega-menu';
            Menu._nav = nav;

            const container = document.createElement('div');
            container.className = 'container position-relative';
            container.style.padding = '0';
            Menu._container = container;
            nav.replaceChildren(container);
            Menu.renderLoading();
            Menu.bindGlobalListeners();
            Menu.load();
        },

        renderLoading() {
            Menu._container.innerHTML = '<div class="b2b-nav-skeleton" aria-label="Assortiment laden"><div class="b2b-skeleton-item"></div><div class="b2b-skeleton-item"></div><div class="b2b-skeleton-item"></div><div class="b2b-skeleton-item"></div></div>';
        },

        load() {
            const request = ++Menu._request;
            return window.Core.fetch('/catalog').then(catalog => {
                if (request === Menu._request) Menu.renderMegaMenu(Menu._container, catalog);
            }).catch(() => {
                if (request === Menu._request) Menu.renderError();
            });
        },

        renderError() {
            Menu._container.replaceChildren();
            const error = document.createElement('div');
            error.className = 'b2b-menu-error text-danger p-3';
            error.textContent = 'Kon menu niet laden. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'b2b-menu-retry';
            retry.textContent = 'Opnieuw proberen';
            retry.addEventListener('click', () => {
                Menu.renderLoading();
                Menu.load();
            });
            error.appendChild(retry);
            Menu._container.appendChild(error);
        },

        bindGlobalListeners() {
            if (Menu._listenersBound) return;
            Menu._listenersBound = true;
            document.addEventListener('click', event => {
                if (!Menu._nav?.contains(event.target)) Menu.closeAll();
            });
            document.addEventListener('focusin', event => {
                if ((Menu._openItem || Menu._mobileOpen) && !Menu._nav?.contains(event.target)) Menu.closeAll();
            });
            document.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || (!Menu._openItem && !Menu._mobileOpen)) return;
                event.preventDefault();
                const restore = Menu._mobileOpen && window.innerWidth <= MOBILE_WIDTH
                    ? Menu._mobileToggle : Menu._openItem?._b2bTrigger || Menu._mobileToggle;
                Menu.closeAll();
                restore?.focus();
            });
            let viewportWidth = window.innerWidth;
            window.addEventListener?.('resize', () => {
                if (window.innerWidth !== viewportWidth) Menu.closeAll();
                viewportWidth = window.innerWidth;
            });
            window.addEventListener?.('popstate', () => Menu.closeAll());
            window.addEventListener?.('hashchange', () => Menu.closeAll());
        },

        closeItem(item) {
            if (!item) return;
            item._openedByHover = false;
            item.classList.remove('is-open');
            item._b2bTrigger?.setAttribute('aria-expanded', 'false');
            setHidden(item._b2bOverlay, true);
            if (Menu._openItem === item) Menu._openItem = null;
        },

        openItem(item, fromHover = false) {
            if (!item?._b2bOverlay) return;
            if (Menu._openItem && Menu._openItem !== item) Menu.closeItem(Menu._openItem);
            Menu.refreshLinks(item._b2bOverlay);
            item._openedByHover = fromHover;
            item.classList.add('is-open');
            item._b2bTrigger.setAttribute('aria-expanded', 'true');
            setHidden(item._b2bOverlay, false);
            Menu._openItem = item;
            Menu.filterModels(item._b2bOverlay);
        },

        refreshLinks(overlay) {
            overlay.querySelectorAll('a').forEach(link => {
                const target = new URL(link.href, window.location.href);
                if (link.classList.contains('b2b-model-link')) {
                    const model = target.searchParams.get('model');
                    link.href = compatibilityUrl({family: target.searchParams.get('family'), model});
                    if (model === currentParams().get('model')) link.setAttribute('aria-current', 'page');
                    else link.removeAttribute('aria-current');
                } else if (link.classList.contains('b2b-family-all')) {
                    link.href = compatibilityUrl({family: target.searchParams.get('family'), model: ''});
                } else if (link.classList.contains('b2b-acc-link')) {
                    link.href = compatibilityUrl({category: target.searchParams.get('category'), part: '', family: '', model: ''});
                }
            });
        },

        toggleItem(item) {
            if (Menu._openItem === item && !item._openedByHover) Menu.closeItem(item);
            else Menu.openItem(item);
        },

        closeAll() {
            Menu.closeItem(Menu._openItem);
            Menu._mobileOpen = false;
            Menu._mobileToggle?.setAttribute('aria-expanded', 'false');
            Menu._list?.classList.remove('mobile-open');
        },

        createDropdownItem(label, id, content) {
            const item = document.createElement('li');
            item.className = 'b2b-nav-item has-dropdown';
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'b2b-nav-link';
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-controls', id);
            trigger.innerHTML = `<span>${esc(label)}</span><svg class="mobile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.className = 'b2b-dropdown-overlay';
            overlay.innerHTML = content;
            setHidden(overlay, true);
            item._b2bTrigger = trigger;
            item._b2bOverlay = overlay;
            trigger.addEventListener('click', event => {
                event.stopPropagation();
                Menu.toggleItem(item);
            });
            item.addEventListener('mouseenter', () => {
                if (window.innerWidth > MOBILE_WIDTH && Menu._openItem !== item) Menu.openItem(item, true);
            });
            item.addEventListener('mouseleave', () => {
                if (window.innerWidth > MOBILE_WIDTH && !item.contains(document.activeElement)) Menu.closeItem(item);
            });
            item.appendChild(trigger);
            item.appendChild(overlay);
            return item;
        },

        familyGrid(group, prefix, familyOffset = 0, groupActive = true) {
            const familyButtons = [];
            const grids = [];
            group.families.forEach((entry, index) => {
                const familyIndex = familyOffset + index;
                const panelId = `${prefix}-models-${familyIndex}`;
                const active = groupActive && index === 0;
                familyButtons.push(`<button type="button" class="b2b-family-btn${active ? ' active' : ''}" data-family-index="${familyIndex}" aria-expanded="${active}" aria-controls="${panelId}"><span>${esc(entry.family.label)}</span><span aria-hidden="true">›</span></button>`);
                const links = entry.models.map(model =>
                    `<a href="${esc(compatibilityUrl({family: model.family, model: model.id}))}" class="b2b-model-link" title="${esc(model.name)}">${esc(model.name)}</a>`
                ).join('');
                grids.push(`<div class="b2b-models-grid${active ? ' active' : ''}" id="${panelId}" data-family-grid="${familyIndex}"${active ? '' : ' hidden inert'}><a class="b2b-family-all" href="${esc(compatibilityUrl({family: entry.family.id, model: ''}))}">Alle onderdelen voor ${esc(entry.family.label)}</a>${links}</div>`);
            });
            return {familyButtons: familyButtons.join(''), grids: grids.join('')};
        },

        deviceContent(groups, prefix, showBrands) {
            let offset = 0;
            const familySections = [];
            const grids = [];
            groups.forEach((group, brandIndex) => {
                const sectionId = `${prefix}-brand-families-${brandIndex}`;
                const section = Menu.familyGrid(group, prefix, offset, brandIndex === 0);
                familySections.push(`<div class="b2b-brand-families${brandIndex === 0 ? ' active' : ''}" id="${sectionId}" data-brand-families="${brandIndex}"${brandIndex === 0 ? '' : ' hidden inert'}>${section.familyButtons}</div>`);
                grids.push(section.grids);
                offset += group.families.length;
            });
            const brands = showBrands ? `<div class="b2b-mega-brands">${groups.map((group, index) =>
                `<button type="button" class="b2b-brand-btn${index === 0 ? ' active' : ''}" data-brand-index="${index}" aria-expanded="${index === 0}" aria-controls="${prefix}-brand-families-${index}">${esc(group.brand.name)}</button>`
            ).join('')}</div>` : '';
            return `<div class="b2b-mega-layout"><div class="b2b-mega-families">${brands}${familySections.join('')}</div><div class="b2b-mega-models"><div class="b2b-mega-heading"><span>Kies een model <small>Nieuw naar oud</small></span><button type="button" class="b2b-menu-close">Menu sluiten</button></div><label class="b2b-model-search-wrap"><span>Model zoeken</span><input type="search" class="b2b-model-search" placeholder="Typ een modelnaam…" autocomplete="off"></label><p class="b2b-model-count" role="status" aria-live="polite"></p><p class="b2b-model-empty" hidden>Geen modellen gevonden. Wis de zoekopdracht of probeer een andere naam.</p>${grids.join('')}<button type="button" class="b2b-menu-back">Terug naar assortiment</button></div></div>`;
        },

        bindDropdown(item) {
            const overlay = item._b2bOverlay;
            const activateFamily = button => {
                overlay.querySelectorAll('.b2b-family-btn').forEach(candidate => {
                    const active = candidate === button;
                    candidate.classList.toggle('active', active);
                    candidate.setAttribute('aria-expanded', String(active));
                });
                overlay.querySelectorAll('[data-family-grid]').forEach(grid => {
                    const active = grid.dataset.familyGrid === button.dataset.familyIndex;
                    grid.classList.toggle('active', active);
                    setHidden(grid, !active);
                });
                const input = overlay.querySelector('.b2b-model-search');
                if (input) {
                    input.value = '';
                    Menu.filterModels(overlay);
                }
            };
            overlay.addEventListener('click', event => {
                const close = event.target.closest?.('.b2b-menu-close, .b2b-menu-back');
                if (close) {
                    Menu.closeItem(item);
                    item._b2bTrigger.focus();
                    return;
                }
                const brandButton = event.target.closest?.('.b2b-brand-btn');
                if (brandButton) {
                    overlay.querySelectorAll('.b2b-brand-btn').forEach(button => {
                        const active = button === brandButton;
                        button.classList.toggle('active', active);
                        button.setAttribute('aria-expanded', String(active));
                    });
                    overlay.querySelectorAll('[data-brand-families]').forEach(section => {
                        const active = section.dataset.brandFamilies === brandButton.dataset.brandIndex;
                        section.classList.toggle('active', active);
                        setHidden(section, !active);
                        if (active) activateFamily(section.querySelector('.b2b-family-btn'));
                    });
                    return;
                }
                const familyButton = event.target.closest?.('.b2b-family-btn');
                if (familyButton) activateFamily(familyButton);
                if (event.target.closest?.('a')) Menu.closeAll();
            });
            overlay.addEventListener('input', event => {
                if (event.target.classList.contains('b2b-model-search')) Menu.filterModels(overlay);
            });
            overlay.addEventListener('keydown', event => {
                if (event.target.classList.contains('b2b-model-search') && event.key === 'Escape' && event.target.value) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.target.value = '';
                    Menu.filterModels(overlay);
                }
            });
        },

        filterModels(overlay) {
            const input = overlay.querySelector('.b2b-model-search');
            const active = overlay.querySelector('.b2b-models-grid.active');
            if (!input || !active) return;
            const query = input.value.trim().toLocaleLowerCase('nl');
            let visible = 0;
            active.querySelectorAll('.b2b-model-link').forEach(link => {
                const match = !query || link.textContent.toLocaleLowerCase('nl').includes(query);
                link.hidden = !match;
                if (match) visible++;
            });
            const empty = overlay.querySelector('.b2b-model-empty');
            const count = overlay.querySelector('.b2b-model-count');
            if (empty) empty.hidden = visible > 0;
            if (count) count.textContent = `${visible} ${visible === 1 ? 'model' : 'modellen'}`;
        },

        categoryItem(label, categories, id) {
            const links = categories.map(category =>
                `<div class="b2b-acc-group"><a href="${esc(compatibilityUrl({category: category.id, part: '', family: '', model: ''}))}" class="b2b-acc-link fw-bold">${esc(category.name)}</a></div>`
            ).join('');
            return Menu.createDropdownItem(label, id, `<div class="b2b-mega-layout"><div class="b2b-mega-accessories">${links}</div><button type="button" class="b2b-menu-close">Menu sluiten</button></div>`);
        },

        renderMegaMenu(container, catalog) {
            Menu.closeAll();
            const groups = deviceData(catalog);
            const top = groups.slice(0, 5);
            const other = groups.slice(5);
            const mobileToggle = document.createElement('button');
            mobileToggle.type = 'button';
            mobileToggle.className = 'b2b-mobile-toggle';
            mobileToggle.setAttribute('aria-expanded', 'false');
            mobileToggle.setAttribute('aria-controls', 'b2b-top-navigation');
            mobileToggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg><span>Assortiment</span>';
            const list = document.createElement('ul');
            list.id = 'b2b-top-navigation';
            list.className = 'b2b-top-nav';
            Menu._mobileToggle = mobileToggle;
            Menu._list = list;
            mobileToggle.addEventListener('click', event => {
                event.stopPropagation();
                Menu._mobileOpen = !Menu._mobileOpen;
                mobileToggle.setAttribute('aria-expanded', String(Menu._mobileOpen));
                list.classList.toggle('mobile-open', Menu._mobileOpen);
                if (!Menu._mobileOpen) Menu.closeItem(Menu._openItem);
            });

            const allItem = document.createElement('li');
            allItem.className = 'b2b-nav-item';
            allItem.innerHTML = `<a class="b2b-nav-link" href="${window.APP_BASE}catalog">Alles</a>`;
            list.appendChild(allItem);
            top.forEach((group, index) => {
                const item = Menu.createDropdownItem(group.brand.name, `b2b-device-menu-${index}`, Menu.deviceContent([group], `top-${index}`, false));
                Menu.bindDropdown(item);
                list.appendChild(item);
            });
            if (other.length) {
                const item = Menu.createDropdownItem('Overige merken', 'b2b-device-menu-other', Menu.deviceContent(other, 'other', true));
                Menu.bindDropdown(item);
                list.appendChild(item);
            }

            const grouped = window.App.groupCategories ? window.App.groupCategories(catalog.categories || []) : {parts: catalog.categories || [], supplies: []};
            if (grouped.parts.length) {
                const item = Menu.categoryItem('Onderdelen', grouped.parts, 'b2b-parts-menu');
                Menu.bindDropdown(item);
                list.appendChild(item);
            }
            if (grouped.supplies.length) {
                const item = Menu.categoryItem('Accessoires & Tools', grouped.supplies, 'b2b-supplies-menu');
                Menu.bindDropdown(item);
                list.appendChild(item);
            }
            list.addEventListener('click', event => {
                if (event.target.closest?.('a')) Menu.closeAll();
            });
            container.replaceChildren(mobileToggle, list);
        }
    };
})();