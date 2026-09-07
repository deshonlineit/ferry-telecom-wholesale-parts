(function () {
    const esc = window.Core.escapeHtml;
    const t = (key, values) => window.I18n.t(key, values);
    const compact = value => String(value || '').toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
    const recentKey = 'parts_recent_models';
    const F = window.FastFinder = {
        modelQuery(query) {
            return String(query || '').replace(/\b(?:lcd|oled|incell|oem|scherm(?:en)?|display(?:s)?|screen(?:s)?|touchscreen|touch|batterij(?:en)?|batter(?:y|ies)|accu|laadpoort(?:en)?|charging|port|camera(?:s)?|flex(?:kabel)?|kabel(?:s)?|behuizing|housing|frame|glas|glass|backcover|speaker(?:s)?|audio|adhesive|connector|dock|onderdeel|onderdelen|parts?|voor|for)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        },
        models(catalog, brand = '', query = '', order = 'count') {
            const term = compact(query);
            const tokens = String(query || '').toLocaleLowerCase('en').match(/[a-z]+|\d+/g) || [];
            const rank = model => {
                if (!term) return 0;
                const name = compact(model.name);
                const brandName = (catalog.brands || []).find(item => String(item.id) === String(model.brand_id))?.name || '';
                const full = compact(brandName + ' ' + model.name);
                const words = (brandName + ' ' + model.name).toLocaleLowerCase('en').match(/[a-z]+|\d+/g) || [];
                const brandTokens = brandName.toLocaleLowerCase('en').match(/[a-z]+|\d+/g) || [];
                const deviceTerm = compact(tokens.filter(token => !brandTokens.includes(token)).join(' ')) || term;
                // Match ordered name segments, never "s23" across "Series 2 - 38mm".
                let cursor = 0;
                for (let index = 0; index < tokens.length; index++) {
                    const token = tokens[index];
                    let found = false;
                    for (let start = cursor; start < words.length; start++) {
                        let end = start, candidate = words[start];
                        while (/^[a-z]+$/.test(token) && candidate.length < token.length && /^[a-z]+$/.test(words[end + 1] || '')) {
                            candidate += words[++end];
                        }
                        if (candidate === token || (index === tokens.length - 1 && candidate.startsWith(token))) {
                            cursor = end + 1;
                            found = true;
                            break;
                        }
                    }
                    if (!found) return -1;
                }
                if (name === deviceTerm || full === term) return 4;
                if (name.endsWith(deviceTerm)) return 3;
                return name.includes(deviceTerm) ? 2 : 1;
            };
            return catalog.models
                .filter(model => Number(model.count) > 0 && (!brand || String(model.brand_id) === String(brand)) && rank(model) >= 0)
                .sort((a, b) => {
                    const exact = rank(b) - rank(a);
                    return exact || (order === 'name' ? 0 : Number(b.count) - Number(a.count)) || a.name.localeCompare(b.name, 'en', {numeric: true});
                });
        },
        modelUrl(params, model) {
            const currentFamily = params.get('family') || '';
            // The finder reaches models outside the current family, so a family that the
            // chosen model does not belong to must go: keeping both intersects into nothing.
            const family = currentFamily && model.family && currentFamily !== model.family ? '' : currentFamily;
            return window.Discovery.buildUrl(params, {brand: model.brand_id, model: model.id, device_brand: '', family, q: ''});
        },
        // A keyboard choice navigates itself. Dispatching a synthetic click instead makes the
        // jump depend on the document router seeing that event, which is one bubble too many.
        go(link) {
            const href = link?.getAttribute?.('href');
            if (!href) return false;
            link.closest?.('dialog')?.close();
            if (typeof window.Router?.navigate === 'function') window.Router.navigate(href);
            else window.location.assign(href);
            return true;
        },
        recent(catalog) {
            try {
                const ids = JSON.parse(localStorage.getItem(recentKey) || '[]');
                if (!Array.isArray(ids)) return [];
                return ids.slice(0, 4).map(id => catalog.models.find(model => String(model.id) === String(id) && Number(model.count) > 0)).filter(Boolean);
            } catch (_) { return []; }
        },
        remember(model) {
            try {
                const stored = JSON.parse(localStorage.getItem(recentKey) || '[]');
                const ids = Array.isArray(stored) ? stored.filter(id => String(id) !== String(model.id)) : [];
                localStorage.setItem(recentKey, JSON.stringify([String(model.id), ...ids].slice(0, 4)));
            } catch (_) {}
        },
        modelLinks(models, params) {
            return models.map(model => `<a class="finder-model" href="${esc(F.modelUrl(params, model))}" data-finder-model="${model.id}">
                <span><strong>${esc(model.name)}</strong><small>${t('viewParts')}</small></span><span aria-hidden="true">↗</span></a>`).join('');
        },
        inline(params, model) {
            return `<div class="model-command" data-inline-model>
                <label class="model-command-label" for="inline-model-search">${t('device')}</label>
                <div class="model-command-input"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>
                <input id="inline-model-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="inline-model-results" autocomplete="off" placeholder="${esc(model ? t('changeDevice', {name: model.name}) : t('enterModel'))}" aria-label="${t('findDevice')}">
                <button type="button" class="model-browse" data-change-device aria-label="${t('viewAllModels')}">${t('allModels')} <span aria-hidden="true">↗</span></button></div>
                <div class="model-command-popover" hidden><p class="model-command-status" role="status"></p><div id="inline-model-results" role="listbox" aria-label="${t('modelsFound')}"></div></div>
            </div>`;
        },
        bindInline(root, initialCatalog, params, loadChoices) {
            const input = root.querySelector('input');
            const popover = root.querySelector('.model-command-popover');
            const list = root.querySelector('[role="listbox"]');
            const status = root.querySelector('.model-command-status');
            let catalog = initialCatalog;
            let ready = false;
            let loading = null;
            let active = -1;
            let committing = false;
            const close = () => {
                popover.hidden = true;
                input.setAttribute('aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
                active = -1;
            };
            const render = () => {
                const models = F.models(catalog, '', input.value).slice(0, 8);
                status.textContent = models.length ? t('chooseModelRetain') : t('noMatchingModelHint');
                list.innerHTML = F.modelLinks(models, params);
                list.querySelectorAll('a').forEach((link, index) => {
                    link.id = 'inline-model-option-' + index;
                    link.setAttribute('role', 'option');
                    link.setAttribute('aria-selected', 'false');
                });
                active = -1;
                input.removeAttribute('aria-activedescendant');
            };
            const open = async () => {
                popover.hidden = false;
                input.setAttribute('aria-expanded', 'true');
                if (ready) { render(); return; }
                status.textContent = t('loadingModels');
                // One shared load, awaited by every caller: pressing Enter while the list is
                // still on its way must wait for it, not fall through to nothing.
                if (!loading) loading = Promise.resolve(loadChoices()).then(result => { catalog = result; ready = true; }).finally(() => { loading = null; });
                try {
                    await loading;
                    if (root.isConnected && !popover.hidden) render();
                } catch (_) {
                    if (root.isConnected && !popover.hidden) status.textContent = t('modelsLoadFailed');
                }
            };
            input.addEventListener('focus', open);
            input.addEventListener('click', () => { if (popover.hidden || !ready) open(); });
            input.addEventListener('input', () => { if (popover.hidden) open(); else if (ready) render(); });
            const commit = link => {
                if (!link) return false;
                const model = catalog.models.find(item => String(item.id) === link.dataset.finderModel);
                if (model) F.remember(model);
                close();
                return F.go(link);
            };
            input.addEventListener('keydown', async event => {
                if (event.key === 'Escape') { event.preventDefault(); close(); return; }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (committing) return;
                    committing = true;
                    try {
                        // Reopen after a blur and finish a pending load before deciding there is nothing to open.
                        if (popover.hidden || !ready) await open();
                        // Read the highlight after the wait; an arrow key may have moved it meanwhile.
                        const results = [...list.querySelectorAll('a')];
                        if (!commit(results[active] || results[0])) committing = false;
                    } catch (_) { committing = false; }
                    return;
                }
                if (['ArrowDown', 'ArrowUp'].includes(event.key) && popover.hidden) { event.preventDefault(); await open(); }
                const options = [...list.querySelectorAll('a')];
                if (popover.hidden || !options.length) return;
                if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                    event.preventDefault();
                    active = active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
                    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
                    input.setAttribute('aria-activedescendant', options[active].id);
                    options[active].scrollIntoView({block: 'nearest'});
                }
            });
            root.addEventListener('focusout', () => setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 0));
            root.addEventListener('click', event => {
                const link = event.target.closest('[data-finder-model]');
                if (link) {
                    const model = catalog.models.find(item => String(item.id) === link.dataset.finderModel);
                    if (model) F.remember(model);
                    close();
                }
                if (event.target.closest('[data-change-device]')) close();
            });
        },
        render(catalog, params, prefix = 'device') {
            const brand = params.get('brand') || '';
            const models = F.models(catalog, brand);
            const brands = catalog.brands.filter(item => Number(item.count) > 0 && catalog.models.some(model => Number(model.count) > 0 && String(model.brand_id) === String(item.id)));
            const recent = F.recent(catalog);
            return `<section class="fast-finder" data-fast-finder data-prefix="${esc(prefix)}">
                <div class="finder-heading"><div><span class="finder-eyebrow">${t('startDevice')}</span><h2>${t('chooseYourModel')}</h2></div><span class="finder-caption">${t('goStraightParts')}</span></div>
                ${params.get('q') ? '<p class="finder-hint">Choosing a model replaces your search term. Other filters will be retained.</p>' : ''}
                <div class="finder-brands" role="group" aria-label="Choose a brand">
                    <button type="button" data-finder-brand="" class="${brand ? '' : 'active'}" aria-pressed="${!brand}">${t('allBrands')}</button>
                    ${brands.map(item => `<button type="button" data-finder-brand="${item.id}" class="${String(item.id) === brand ? 'active' : ''}" aria-pressed="${String(item.id) === brand}">${esc(item.name)}</button>`).join('')}
                </div>
                <label class="finder-search-label" for="${esc(prefix)}-quick-model">${t('modelSearch')}</label>
                <div class="finder-model-search"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input type="search" id="${esc(prefix)}-quick-model" placeholder="${t('modelExample')}" autocomplete="off"><kbd>Enter ↵</kbd></div>
                <div class="finder-recent" ${recent.length ? '' : 'hidden'}><span>${t('recentlySelected')}</span><div>${recent.map(model => `<a href="${esc(F.modelUrl(params, model))}" data-finder-model="${model.id}">${esc(model.name)}</a>`).join('')}</div><button type="button" data-clear-recent>${t('clearRecent')}</button></div>
                <div class="finder-list-tools"><p class="finder-status" role="status" aria-live="polite">${t('modelsWithParts', {count: window.I18n.number(models.length), models: t(models.length === 1 ? 'model' : 'models')})}</p><label>${t('order')} <select class="finder-sort" aria-label="${t('sortModels')}"><option value="count">${t('mostParts')}</option><option value="name">${t('modelAZ')}</option></select></label></div>
                <div class="finder-models">${F.modelLinks(models.slice(0, 8), params)}</div>
                <div class="finder-empty" ${models.length ? 'hidden' : ''}>${t('noModelSelection')}<br><a data-model-fallback hidden>${t('searchCatalogue')} →</a></div>
                <div class="finder-footer"><button type="button" data-more-models ${models.length > 8 ? '' : 'hidden'}>${t('showAllModels', {count: window.I18n.number(models.length)})} <span aria-hidden="true">↓</span></button><a data-finder-all href="${esc(window.Discovery.buildUrl(params, {model: '', q: ''}))}">${t('viewAllParts')} →</a></div>
            </section>`;
        },
        bind(root, catalog, params) {
            if (!root) return;
            let brand = params.get('brand') || '';
            let expanded = false;
            const search = root.querySelector('.finder-model-search input');
            const more = root.querySelector('[data-more-models]');
            const list = root.querySelector('.finder-models');
            const refresh = () => {
                const models = F.models(catalog, brand, search.value, root.querySelector('.finder-sort').value);
                const showAll = expanded || compact(search.value);
                list.innerHTML = F.modelLinks(showAll ? models : models.slice(0, 8), params);
                root.querySelector('.finder-empty').hidden = models.length > 0;
                const fallback = root.querySelector('[data-model-fallback]');
                fallback.hidden = !search.value.trim();
                fallback.href = window.Discovery.buildUrl(params, {q: search.value.trim(), model: '', brand: ''});
                root.querySelector('.finder-status').textContent = t('modelsWithParts', {count: window.I18n.number(models.length), models: t(models.length === 1 ? 'model' : 'models')});
                more.hidden = Boolean(showAll) || models.length <= 8;
                more.innerHTML = `${t('showAllModels', {count: window.I18n.number(models.length)})} <span aria-hidden="true">↓</span>`;
                root.querySelector('[data-finder-all]').href = window.Discovery.buildUrl(params, {brand, model: '', q: ''});
            };
            root.addEventListener('click', event => {
                const brandButton = event.target.closest('[data-finder-brand]');
                if (brandButton) {
                    if (brand !== brandButton.dataset.finderBrand) search.value = '';
                    brand = brandButton.dataset.finderBrand;
                    expanded = false;
                    root.querySelectorAll('[data-finder-brand]').forEach(button => {
                        const selected = button === brandButton;
                        button.classList.toggle('active', selected);
                        button.setAttribute('aria-pressed', String(selected));
                    });
                    refresh();
                }
                const modelLink = event.target.closest('[data-finder-model]');
                if (modelLink) {
                    const model = catalog.models.find(item => String(item.id) === modelLink.dataset.finderModel);
                    if (model) F.remember(model);
                }
                if (event.target.closest('[data-more-models]')) { expanded = true; refresh(); }
                if (event.target.closest('[data-clear-recent]')) {
                    try { localStorage.removeItem(recentKey); } catch (_) {}
                    root.querySelector('.finder-recent').hidden = true;
                }
            });
            search.addEventListener('input', refresh);
            root.querySelector('.finder-sort').addEventListener('change', refresh);
            search.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const link = list.querySelector('a');
                    const model = link && catalog.models.find(item => String(item.id) === link.dataset.finderModel);
                    if (model) F.remember(model);
                    F.go(link);
                }
                if (event.key === 'ArrowDown') { event.preventDefault(); list.querySelector('a')?.focus(); }
            });
        }
    };

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.isComposing || document.querySelector('dialog[open]')) return;
        const target = event.target;
        if (target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
        if ((event.key === '/' && !event.ctrlKey && !event.metaKey) || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) {
            const input = document.getElementById('home-search') || document.getElementById('search-input');
            if (input) { event.preventDefault(); input.focus(); }
        }
    });
})();