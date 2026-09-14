(function () {
    const esc = window.Core.escapeHtml;
    const t = (key, values) => window.I18n.t(key, values);
    const MOBILE_WIDTH = 768;

    const MODEL_LIMIT = 12;
    const MENU_CACHE_KEY = 'ft_store_menu_catalog_v1';

    const currentParams = () => new URLSearchParams(window.location?.search || '');
    // The top menu is a destination picker, not a refinement of the page you are on:
    // every pick starts a fresh scope, so a part type or facet chosen earlier can never
    // travel along and leave the visitor on an empty combination. Only how the results
    // are presented (sort, page size) survives.
    const SCOPE_RESET = ['department', 'brand', 'device_brand', 'q', 'page', 'category', 'part', 'quality', 'stock', 'featured'];
    const compatibilityUrl = changes => {
        const params = currentParams();
        SCOPE_RESET.forEach(key => params.delete(key));
        Object.entries(changes || {}).forEach(([key, value]) => {
            if (value === '' || value === null || value === undefined) params.delete(key);
            else params.set(key, String(value));
        });
        return window.APP_BASE + 'catalog' + (params.size ? '?' + params.toString() : '');
    };
    // Menu labels are destinations: a brand opens every part for that device brand, a family opens the whole family.
    const brandUrl = brandId => compatibilityUrl({device_brand: brandId, family: '', model: ''});
    const familyUrl = familyId => compatibilityUrl({family: familyId, model: ''});
    const orderedModels = models => [...models].sort((a, b) =>
        Number(Boolean(b.order_known)) - Number(Boolean(a.order_known))
        || Number(b.sort_order || 0) - Number(a.sort_order || 0)
        || String(b.name).localeCompare(String(a.name), 'en', {numeric: true})
    );
    const modelSeries = (entry, model) => {
        const family = String(entry?.family?.label || '').toLowerCase();
        const name = String(model?.name || '').toLowerCase();
        if (family.includes('samsung') || family === 'galaxy') {
            const seriesName = name.replace(/^(?:samsung\s+)?(?:galaxy\s+)?/i, '');
            if (/^s\s*\d/i.test(seriesName)) return {key: 'galaxy-s', label: 'Galaxy S', order: 1};
            if (/^a\s*\d/i.test(seriesName)) return {key: 'galaxy-a', label: 'Galaxy A', order: 2};
            if (/^(?:z\s+)?(?:fold|flip)\b/i.test(seriesName)) return {key: 'galaxy-z', label: 'Galaxy Z · Fold & Flip', order: 3};
            if (/^note(?:\s|\d)/i.test(seriesName)) return {key: 'galaxy-note', label: 'Galaxy Note', order: 4};
            if (/^m\s*\d/i.test(seriesName)) return {key: 'galaxy-m', label: 'Galaxy M', order: 5};
            if (/^j\s*\d/i.test(seriesName)) return {key: 'galaxy-j', label: 'Galaxy J', order: 6};
            if (/^xcover\b/i.test(seriesName)) return {key: 'galaxy-xcover', label: 'Galaxy XCover', order: 7};
            if (/^tab\b/i.test(seriesName)) return {key: 'galaxy-tab', label: 'Galaxy Tab', order: 8};
            return {key: 'galaxy-other', label: 'Andere Galaxy-modellen', order: 20};
        }
        if (family.includes('iphone')) {
            if (/\biphone\s+se\b/i.test(name)) return {key: 'iphone-se', label: 'iPhone SE Series', order: 80};
            if (/\biphone\s+(?:x|xr|xs)\b/i.test(name)) return {key: 'iphone-x', label: 'iPhone X · XR · XS Series', order: 40};
            // Numbered variants inherit their base generation. For example,
            // iPhone 16e belongs in the iPhone 16 Series, not classic models.
            const generation = name.match(/\biphone\s+(\d{1,2})(?:e)?\b/i)?.[1];
            if (generation) {
                const number = Number(generation);
                return {key: `iphone-${number}`, label: `iPhone ${number} Series`, order: 30 - number};
            }
            return {key: 'iphone-classic', label: 'Eerdere iPhone-modellen', order: 100};
        }
        if (family.includes('ipad')) {
            if (/\bipad\s+pro\b/.test(name)) return {key: 'ipad-pro', label: 'iPad Pro', order: 1};
            if (/\bipad\s+air\b/.test(name)) return {key: 'ipad-air', label: 'iPad Air', order: 2};
            if (/\bipad\s+mini\b/.test(name)) return {key: 'ipad-mini', label: 'iPad mini', order: 3};
            return {key: 'ipad', label: 'iPad', order: 4};
        }
        if (family.includes('macbook')) {
            if (/\bmacbook\s+pro\b/.test(name)) return {key: 'macbook-pro', label: 'MacBook Pro', order: 1};
            if (/\bmacbook\s+air\b/.test(name)) return {key: 'macbook-air', label: 'MacBook Air', order: 2};
            return {key: 'macbook', label: 'MacBook', order: 3};
        }
        if (family.includes('apple watch')) {
            if (/\bultra\b/.test(name)) return {key: 'watch-ultra', label: 'Apple Watch Ultra', order: 1};
            if (/\bse\b/.test(name)) return {key: 'watch-se', label: 'Apple Watch SE', order: 2};
            if (/\bseries\b/.test(name)) return {key: 'watch-series', label: 'Apple Watch Series', order: 3};
            return {key: 'watch', label: 'Apple Watch', order: 4};
        }
        return null;
    };
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
        const priority = name => {
            const normalized = String(name || '').toLowerCase();
            if (normalized === 'apple') return 1;
            if (normalized === 'samsung') return 2;
            return 100;
        };
        return [...groups.values()].map(group => ({
            brand: group.brand,
            modelCount: group.modelCount,
            // The panel opens on the family with the most parts, so the common case needs no clicks.
            families: [...group.families.values()].map(entry => ({
                family: entry.family,
                models: orderedModels(entry.models)
            })).sort((a, b) => Number(b.family.count || 0) - Number(a.family.count || 0)
                || b.models.length - a.models.length
                || String(a.family.label).localeCompare(String(b.family.label), 'en'))
        })).sort((a, b) => priority(a.brand.name) - priority(b.brand.name)
            || b.modelCount - a.modelCount
            || String(a.brand.name).localeCompare(String(b.brand.name), 'en'));
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
        modelSeries,
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
            Menu.bindGlobalListeners();
            Menu.renderImmediate();
            if (location.pathname.replace(/\/+$/, '').endsWith('/catalog')) {
                Menu.loadWhenUsed();
            } else {
                Menu.load();
            }
        },

        loadWhenUsed() {
            let started = false;
            const start = () => {
                if (started) return;
                started = true;
                Menu._nav?.removeEventListener('pointerenter', start);
                Menu._nav?.removeEventListener('focusin', start);
                Menu._nav?.removeEventListener('click', start);
                Menu.load();
            };
            Menu._nav?.addEventListener('pointerenter', start, {once: true});
            Menu._nav?.addEventListener('focusin', start, {once: true});
            Menu._nav?.addEventListener('click', start, {once: true});
        },

        renderImmediate() {
            try {
                const cached = JSON.parse(localStorage.getItem(MENU_CACHE_KEY) || 'null');
                if (cached?.catalog?.models?.length && cached?.catalog?.device_families?.length) {
                    Menu.renderMegaMenu(Menu._container, cached.catalog);
                    Menu._container.setAttribute('aria-busy', 'true');
                    return;
                }
            } catch (_) {}
            const destinations = [
                [t('all'), 'catalog', false],
                ['Apple', 'catalog', true],
                ['Samsung', 'catalog', true],
                [t('partsMenu'), 'catalog?department=parts', true],
                [t('supplies'), 'catalog?department=supplies', true],
                [t('otherBrands'), 'catalog', true]
            ];
            const mobile = document.createElement('button');
            mobile.type = 'button';
            mobile.className = 'b2b-mobile-toggle';
            mobile.setAttribute('aria-expanded', 'false');
            mobile.setAttribute('aria-controls', 'b2b-top-navigation');
            mobile.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg><span>${esc(t('catalogue'))}</span>`;
            const list = document.createElement('ul');
            list.id = 'b2b-top-navigation';
            list.className = 'b2b-top-nav b2b-top-nav-immediate';
            destinations.forEach(([label, path, opensMenu]) => {
                const item = document.createElement('li');
                item.className = 'b2b-nav-item';
                if (!opensMenu) {
                    item.innerHTML = `<a class="b2b-nav-link" href="${esc(window.APP_BASE + path)}">${esc(label)}</a>`;
                } else {
                    const trigger = document.createElement('button');
                    trigger.type = 'button';
                    trigger.className = 'b2b-nav-link';
                    trigger.dataset.menuLabel = String(label).toLowerCase();
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.innerHTML = `<span>${esc(label)}</span><svg class="mobile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                    trigger.addEventListener('click', async event => {
                        event.preventDefault();
                        event.stopPropagation();
                        await Menu.load();
                        const loadedTrigger = [...Menu._container.querySelectorAll('.b2b-nav-item.has-dropdown > .b2b-nav-link')]
                            .find(candidate => candidate.dataset.menuLabel === trigger.dataset.menuLabel);
                        loadedTrigger?.click();
                    });
                    item.appendChild(trigger);
                }
                list.appendChild(item);
            });
            mobile.addEventListener('click', event => {
                event.stopPropagation();
                const open = !list.classList.contains('mobile-open');
                list.classList.toggle('mobile-open', open);
                mobile.setAttribute('aria-expanded', String(open));
            });
            Menu._mobileToggle = mobile;
            Menu._list = list;
            Menu._container.replaceChildren(mobile, list);
            Menu._container.setAttribute('aria-busy', 'true');
        },

        renderLoading() {
            Menu._container.innerHTML = `<div class="b2b-nav-skeleton" aria-label="${esc(t('loading'))}"><div class="b2b-skeleton-item"></div><div class="b2b-skeleton-item"></div><div class="b2b-skeleton-item"></div><div class="b2b-skeleton-item"></div></div>`;
        },

        load() {
            const request = ++Menu._request;
            return window.Core.fetch('/catalog').then(catalog => {
                if (request === Menu._request) {
                    try { localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({at: Date.now(), catalog})); } catch (_) {}
                    Menu.renderMegaMenu(Menu._container, catalog);
                    Menu._container.removeAttribute('aria-busy');
                }
            }).catch(() => {
                if (request === Menu._request) Menu.renderError();
            });
        },

        renderError() {
            Menu._container.removeAttribute('aria-busy');
            Menu._container.querySelector('.b2b-menu-error')?.remove();
            const error = document.createElement('div');
            error.className = 'b2b-menu-error text-danger p-3';
            error.textContent = t('loadMenuFailed') + ' ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'b2b-menu-retry';
            retry.textContent = t('retry');
            retry.addEventListener('click', () => {
                error.remove?.();
                Menu._container.setAttribute('aria-busy', 'true');
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
            item.classList.remove('is-open');
            item._b2bTrigger?.setAttribute('aria-expanded', 'false');
            setHidden(item._b2bOverlay, true);
            if (Menu._openItem === item) Menu._openItem = null;
        },

        openItem(item) {
            if (!item?._b2bOverlay) return;
            if (Menu._openItem && Menu._openItem !== item) Menu.closeItem(Menu._openItem);
            Menu.refreshDestination(item._b2bLink);
            Menu.refreshLinks(item._b2bOverlay);
            item.classList.add('is-open');
            item._b2bTrigger.setAttribute('aria-expanded', 'true');
            setHidden(item._b2bOverlay, false);
            Menu._openItem = item;
            Menu.filterModels(item._b2bOverlay);
        },

        /** Client-side navigation changes the context, so a link is rebuilt right before it is used. */
        refreshDestination(link) {
            if (!link?.classList) return;
            if (link.dataset?.deviceBrand) link.href = brandUrl(link.dataset.deviceBrand);
            else if (link.dataset?.department) link.href = compatibilityUrl({department: link.dataset.department, family: '', model: ''});
            else if (link.classList.contains('b2b-family-link') || link.classList.contains('b2b-family-all')) link.href = familyUrl(link.dataset?.familyId);
            else if (link.classList.contains('b2b-model-link') && link.dataset?.modelId) {
                link.href = compatibilityUrl({family: new URL(link.href, window.location.href).searchParams.get('family'), model: link.dataset.modelId});
            }
        },

        refreshLinks(overlay) {
            overlay.querySelectorAll('a').forEach(link => {
                const target = new URL(link.href, window.location.href);
                if (link.classList.contains('b2b-model-link')) {
                    const model = target.searchParams.get('model');
                    link.href = compatibilityUrl({family: target.searchParams.get('family'), model});
                    if (model === currentParams().get('model')) link.setAttribute('aria-current', 'page');
                    else link.removeAttribute('aria-current');
                } else if (link.classList.contains('b2b-family-all') || link.classList.contains('b2b-family-link')) {
                    link.href = familyUrl(link.dataset?.familyId || target.searchParams.get('family'));
                } else if (link.classList.contains('b2b-acc-link')) {
                    link.href = compatibilityUrl({department: target.searchParams.get('department'), category: target.searchParams.get('category'), part: '', family: '', model: ''});
                }
            });
        },

        toggleItem(item) {
            if (Menu._openItem === item) Menu.closeItem(item);
            else Menu.openItem(item);
        },

        closeAll() {
            Menu.closeItem(Menu._openItem);
            Menu._mobileOpen = false;
            Menu._mobileToggle?.setAttribute('aria-expanded', 'false');
            Menu._list?.classList.remove('mobile-open');
        },

        createDropdownItem(label, id, content, destination = null) {
            const item = document.createElement('li');
            item.className = 'b2b-nav-item has-dropdown';
            const chevron = '<svg class="mobile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-controls', id);
            trigger.className = 'b2b-nav-link';
            trigger.dataset.menuLabel = String(label).toLowerCase();
            trigger.setAttribute('aria-label', t('showModels', {label}));
            trigger.innerHTML = `<span>${esc(label)}</span>${chevron}`;
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
            item.appendChild(trigger);
            item.appendChild(overlay);
            return item;
        },

        modelLink(model) {
            return `<a href="${esc(compatibilityUrl({family: model.family, model: model.id}))}" class="b2b-model-link" data-model-id="${esc(model.id)}" title="${esc(model.name)}">${esc(model.name)}</a>`;
        },

        groupedModelLinks(entry, models) {
            const groups = new Map();
            models.forEach(model => {
                const series = modelSeries(entry, model);
                if (!series) return;
                if (!groups.has(series.key)) groups.set(series.key, {...series, models: []});
                groups.get(series.key).models.push(model);
            });
            if (groups.size < 2 || [...groups.values()].reduce((count, group) => count + group.models.length, 0) !== models.length) {
                return `<div class="b2b-model-links">${models.map(Menu.modelLink).join('')}</div>`;
            }
            return `<div class="b2b-model-series">${[...groups.values()]
                .sort((a, b) => a.order - b.order)
                .map(group => `<section class="b2b-model-series-group" aria-labelledby="series-${esc(entry.family.id)}-${esc(group.key)}">
                    <h4 id="series-${esc(entry.family.id)}-${esc(group.key)}">${esc(group.label)}</h4>
                    <div class="b2b-model-links">${group.models.map(Menu.modelLink).join('')}</div>
                </section>`).join('')}</div>`;
        },

        /** Start concise, but let the visitor expand the complete newest-to-oldest overview in place. */
        modelsMarkup(entry, query = '', expanded = false) {
            const term = String(query || '').trim();
            const ranked = window.ModelSearch.rank(entry.models, term);
            const shown = term || expanded ? ranked : ranked.slice(0, MODEL_LIMIT);
            const total = entry.models.length;
            const label = entry.family.label;
            const parts = Number(entry.family.count || 0);
            let status;
            if (term) {
                status = ranked.length
                    ? t('modelsOfTotal', {shown: ranked.length, total})
                    : t('noModelInFamily', {label});
            } else if (expanded) {
                status = t('allModelsNewest', {count: total});
            } else {
                status = total > shown.length
                    ? t('newestOfModels', {shown: shown.length, total})
                    : `${window.I18n.number(total)} ${t(total === 1 ? 'model' : 'models')}`;
            }
            const toggle = !term && total > MODEL_LIMIT
                ? `<button type="button" class="b2b-model-expand" data-model-expand aria-expanded="${expanded}">${expanded ? t('showNewest', {count: MODEL_LIMIT}) : t('showAllModels', {count: total})}<span aria-hidden="true">${expanded ? '↑' : '↓'}</span></button>`
                : '';
            const modelLinks = !term
                ? Menu.groupedModelLinks(entry, shown)
                : `<div class="b2b-model-links">${shown.map(Menu.modelLink).join('')}</div>`;
            return `<p class="b2b-model-status" role="status" aria-live="polite">${esc(status)}</p>
                ${modelLinks}
                ${toggle}
                <a class="b2b-family-all" href="${esc(familyUrl(entry.family.id))}" data-family-id="${esc(entry.family.id)}">${esc(t('allPartsFor', {label}))}${parts ? ` <small>${window.I18n.number(parts)}</small>` : ''}</a>`;
        },

        familyGrid(group, prefix, familyOffset = 0, groupActive = true, registry = null) {
            const familyButtons = [];
            const grids = [];
            group.families.forEach((entry, index) => {
                const familyIndex = familyOffset + index;
                const panelId = `${prefix}-models-${familyIndex}`;
                const active = groupActive && index === 0;
                registry?.set(String(familyIndex), entry);
                const tabId = `${prefix}-family-${familyIndex}`;
                familyButtons.push(`<div class="b2b-family-row${active ? ' active' : ''}" data-family-row="${familyIndex}"><button type="button" id="${tabId}" role="tab" class="b2b-family-btn${active ? ' active' : ''}" data-family-index="${familyIndex}" aria-selected="${active}" aria-controls="${panelId}" tabindex="${active ? '0' : '-1'}">${esc(entry.family.label)}</button></div>`);
                grids.push(`<div class="b2b-models-grid${active ? ' active' : ''}" role="tabpanel" aria-labelledby="${tabId}" id="${panelId}" data-family-grid="${familyIndex}"${active ? '' : ' hidden inert'}>${Menu.modelsMarkup(entry)}</div>`);
            });
            return {familyButtons: familyButtons.join(''), grids: grids.join('')};
        },

        deviceContent(groups, prefix, showBrands, registry = null) {
            let offset = 0;
            const familySections = [];
            const grids = [];
            groups.forEach((group, brandIndex) => {
                const sectionId = `${prefix}-brand-families-${brandIndex}`;
                const section = Menu.familyGrid(group, prefix, offset, brandIndex === 0, registry);
                familySections.push(`<div class="b2b-brand-families${brandIndex === 0 ? ' active' : ''}" role="tablist" aria-label="${esc(group.brand.name)} device families" id="${sectionId}" data-brand-families="${brandIndex}"${brandIndex === 0 ? '' : ' hidden inert'}>${section.familyButtons}</div>`);
                grids.push(section.grids);
                offset += group.families.length;
            });
            const brands = showBrands ? `<div class="b2b-mega-brands">${groups.map((group, index) =>
                `<button type="button" class="b2b-brand-btn${index === 0 ? ' active' : ''}" data-brand-index="${index}" aria-expanded="${index === 0}" aria-controls="${prefix}-brand-families-${index}">${esc(group.brand.name)}</button>`
            ).join('')}</div>` : '';
            return `<div class="b2b-mega-layout"><div class="b2b-mega-families">${brands}${familySections.join('')}</div><div class="b2b-mega-models"><div class="b2b-mega-heading"><span>${t('chooseModel')} <small>${t('newestToOldest')}</small></span><button type="button" class="b2b-menu-close">${t('close')}</button></div><label class="b2b-model-search-wrap"><span>${t('searchModels')}</span><input type="search" class="b2b-model-search" placeholder="${esc(t('enterModelName'))}" autocomplete="off"></label>${grids.join('')}<button type="button" class="b2b-menu-back">${t('backToCatalogue')}</button></div></div>`;
        },

        bindDropdown(item) {
            const overlay = item._b2bOverlay;
            const expandActiveModels = focusToggle => {
                const active = overlay.querySelector('.b2b-models-grid.active');
                const entry = active && overlay._b2bFamilies?.get(String(active.dataset.familyGrid));
                const input = overlay.querySelector('.b2b-model-search');
                if (!active || !entry || input?.value || active.dataset.expanded === 'true') return false;
                active.dataset.expanded = 'true';
                active.innerHTML = Menu.modelsMarkup(entry, '', true);
                if (focusToggle) active.querySelector('[data-model-expand]')?.focus({preventScroll: true});
                return true;
            };
            const activateFamily = button => {
                if (!button) return;
                overlay.querySelectorAll('.b2b-family-btn').forEach(candidate => {
                    const active = candidate === button;
                    candidate.classList.toggle('active', active);
                    candidate.setAttribute('aria-selected', String(active));
                    candidate.tabIndex = active ? 0 : -1;
                    candidate.parentElement?.classList?.toggle('active', active);
                });
                overlay.querySelectorAll('[data-family-grid]').forEach(grid => {
                    const active = grid.dataset.familyGrid === button.dataset.familyIndex;
                    grid.classList.toggle('active', active);
                    setHidden(grid, !active);
                });
                const input = overlay.querySelector('.b2b-model-search');
                if (input) input.value = '';
                Menu.filterModels(overlay);
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
                const expandButton = event.target.closest?.('[data-model-expand]');
                if (expandButton) {
                    // The clicked button is replaced below. Stop this event before its
                    // detached target reaches the document outside-click handler.
                    event.stopPropagation?.();
                    const active = overlay.querySelector('.b2b-models-grid.active');
                    const entry = active && overlay._b2bFamilies?.get(String(active.dataset.familyGrid));
                    if (active && entry) {
                        const expanded = active.dataset.expanded !== 'true';
                        active.dataset.expanded = String(expanded);
                        const input = overlay.querySelector('.b2b-model-search');
                        active.innerHTML = Menu.modelsMarkup(entry, input?.value || '', expanded);
                        // Replacing the clicked button can fire mouseleave under a stationary
                        // pointer. Keep keyboard focus inside the menu so its desktop
                        // mouse-leave guard does not close the freshly expanded overview.
                        active.querySelector('[data-model-expand]')?.focus({preventScroll: true});
                    }
                    return;
                }
                if (event.target.closest?.('a')) Menu.closeAll();
            });
            // Scrolling is an implicit request to browse further. Reveal the
            // complete family immediately instead of making the visitor stop
            // and press the "show all models" control first.
            overlay.addEventListener('scroll', event => {
                const scroller = event.target;
                if (!scroller?.classList?.contains('b2b-mega-models') || scroller.scrollTop <= 2) return;
                expandActiveModels(false);
            }, true);
            const revealOnMobileBrowse = event => {
                if (window.innerWidth > MOBILE_WIDTH || Menu._openItem !== item) return;
                if (event.type === 'wheel' && Number(event.deltaY || 0) <= 0) return;
                expandActiveModels(false);
            };
            // On mobile the outer catalogue list is the actual scroll owner.
            // Listen for the browse gesture itself as it may already be at its
            // scroll limit, in which case no native `scroll` event is emitted.
            Menu._list?.addEventListener('wheel', revealOnMobileBrowse, {passive: true});
            Menu._list?.addEventListener('touchmove', revealOnMobileBrowse, {passive: true});
            overlay.addEventListener('keydown', event => {
                const current = event.target.closest?.('.b2b-family-btn');
                if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                const tabs = [...current.closest('[role="tablist"]').querySelectorAll('.b2b-family-btn')];
                if (!tabs.length) return;
                event.preventDefault();
                const currentIndex = tabs.indexOf(current);
                const nextIndex = event.key === 'Home' ? 0
                    : event.key === 'End' ? tabs.length - 1
                    : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                activateFamily(tabs[nextIndex]);
                tabs[nextIndex].focus();
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
            const entry = active && overlay._b2bFamilies?.get(String(active.dataset.familyGrid));
            if (!input || !entry) return;
            active.innerHTML = Menu.modelsMarkup(entry, input.value, active.dataset.expanded === 'true');
            const current = currentParams().get('model');
            active.querySelectorAll('.b2b-model-link').forEach(link => {
                if (current && link.dataset.modelId === current) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
        },

        categoryItem(label, categories, id, department) {
            const links = categories.map(category =>
                `<div class="b2b-acc-group"><a href="${esc(compatibilityUrl({department, category: category.id, part: '', family: '', model: ''}))}" class="b2b-acc-link fw-bold">${esc(category.name)}</a></div>`
            ).join('');
            return Menu.createDropdownItem(label, id, `<div class="b2b-mega-layout"><div class="b2b-mega-accessories">${links}</div></div>`, {
                href: compatibilityUrl({department, family: '', model: ''}),
                department,
            });
        },

        renderMegaMenu(container, catalog) {
            Menu.closeAll();
            const groups = deviceData(catalog);
            const top = groups.filter(group => ['apple', 'samsung'].includes(String(group.brand.name).toLowerCase()));
            const other = groups.filter(group => !top.includes(group));
            const mobileToggle = document.createElement('button');
            mobileToggle.type = 'button';
            mobileToggle.className = 'b2b-mobile-toggle';
            mobileToggle.setAttribute('aria-expanded', 'false');
            mobileToggle.setAttribute('aria-controls', 'b2b-top-navigation');
            mobileToggle.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg><span>${t('catalogue')}</span>`;
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
            allItem.innerHTML = `<a class="b2b-nav-link" href="${window.APP_BASE}catalog">${t('all')}</a>`;
            list.appendChild(allItem);
            const deviceItem = (label, id, groups, prefix, showBrands, destination) => {
                const registry = new Map();
                const item = Menu.createDropdownItem(label, id, Menu.deviceContent(groups, prefix, showBrands, registry), destination);
                item._b2bOverlay._b2bFamilies = registry;
                Menu.bindDropdown(item);
                list.appendChild(item);
            };
            top.forEach((group, index) => deviceItem(group.brand.name, `b2b-device-menu-${index}`, [group], `top-${index}`, false,
                {href: brandUrl(group.brand.id), brandId: group.brand.id}));
            const grouped = window.App.groupCategories ? window.App.groupCategories(catalog.categories || []) : {parts: catalog.categories || [], supplies: []};
            if (grouped.parts.length) {
                const item = Menu.categoryItem(t('partsMenu'), grouped.parts, 'b2b-parts-menu', 'parts');
                Menu.bindDropdown(item);
                list.appendChild(item);
            }
            if (grouped.supplies.length) {
                const item = Menu.categoryItem(t('supplies'), grouped.supplies, 'b2b-supplies-menu', 'supplies');
                Menu.bindDropdown(item);
                list.appendChild(item);
            }
            // Keep the primary navigation commercial and concise. Less-used
            // device brands (including Google) remain available under More /
            // Other brands after the parts departments.
            if (other.length) deviceItem(t('otherBrands'), 'b2b-device-menu-other', other, 'other', true, null);
            list.addEventListener('click', event => {
                Menu.refreshDestination(event.target.closest?.('a'));
            }, true);
            list.addEventListener('click', event => {
                if (event.target.closest?.('a')) Menu.closeAll();
            });
            container.replaceChildren(mobileToggle, list);
        }
    };
})();
