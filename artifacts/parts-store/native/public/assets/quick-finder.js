(function () {
    const esc = window.Core.escapeHtml;
    const compact = value => String(value || '').toLocaleLowerCase('nl').replace(/[^a-z0-9]/g, '');
    const recentKey = 'parts_recent_models';
    const F = window.FastFinder = {
        models(catalog, brand = '', query = '', order = 'count') {
            const term = compact(query);
            return catalog.models
                .filter(model => Number(model.count) > 0 && (!brand || String(model.brand_id) === String(brand)) && (!term || compact(model.name).includes(term)))
                .sort((a, b) => {
                    const exact = Number(compact(b.name) === term) - Number(compact(a.name) === term);
                    return exact || (order === 'name' ? 0 : Number(b.count) - Number(a.count)) || a.name.localeCompare(b.name, 'nl', {numeric: true});
                });
        },
        modelUrl(params, model) {
            return window.Discovery.buildUrl(params, {brand: model.brand_id, model: model.id, q: ''});
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
                <span><strong>${esc(model.name)}</strong><small>Bekijk onderdelen</small></span><span aria-hidden="true">↗</span></a>`).join('');
        },
        inline(params, model) {
            return `<div class="model-command" data-inline-model>
                <label class="model-command-label" for="inline-model-search">Toestel</label>
                <div class="model-command-input"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>
                <input id="inline-model-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="inline-model-results" autocomplete="off" placeholder="${esc(model ? 'Wissel ' + model.name + '…' : 'Typ uw model…')}" aria-label="Direct een toestel zoeken">
                <button type="button" class="model-browse" data-change-device aria-label="Alle modellen bekijken">Alle modellen <span aria-hidden="true">↗</span></button></div>
                <div class="model-command-popover" hidden><p class="model-command-status" role="status"></p><div id="inline-model-results" role="listbox" aria-label="Gevonden modellen"></div></div>
            </div>`;
        },
        bindInline(root, initialCatalog, params, loadChoices) {
            const input = root.querySelector('input');
            const popover = root.querySelector('.model-command-popover');
            const list = root.querySelector('[role="listbox"]');
            const status = root.querySelector('.model-command-status');
            let catalog = initialCatalog;
            let ready = false;
            let pending = false;
            let active = -1;
            const close = () => {
                popover.hidden = true;
                input.setAttribute('aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
                active = -1;
            };
            const render = () => {
                const models = F.models(catalog, '', input.value).slice(0, 8);
                status.textContent = models.length ? 'Kies een model · filters blijven behouden' : 'Geen passend model. Gebruik “Alle modellen” of de algemene zoekbalk.';
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
                if (pending) return;
                pending = true;
                status.textContent = 'Modellen ophalen…';
                try {
                    catalog = await loadChoices();
                    ready = true;
                    if (root.isConnected && !popover.hidden) render();
                } catch (_) {
                    if (root.isConnected && !popover.hidden) status.textContent = 'Modellen ophalen is niet gelukt. Klik opnieuw in het zoekveld om te proberen.';
                } finally { pending = false; }
            };
            input.addEventListener('focus', open);
            input.addEventListener('click', () => { if (popover.hidden || !ready) open(); });
            input.addEventListener('input', () => { if (popover.hidden) open(); else if (ready) render(); });
            input.addEventListener('keydown', async event => {
                if (event.key === 'Escape') { event.preventDefault(); close(); }
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
                if (event.key === 'Enter') { event.preventDefault(); (options[active] || options[0]).click(); }
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
                <div class="finder-heading"><div><span class="finder-eyebrow">Begin bij het toestel</span><h2>Kies uw model.</h2></div><span class="finder-caption">Direct naar de onderdelen</span></div>
                ${params.get('q') ? '<p class="finder-hint">Een modelkeuze vervangt uw zoekterm. Andere filters blijven behouden.</p>' : ''}
                <div class="finder-brands" role="group" aria-label="Merk kiezen">
                    <button type="button" data-finder-brand="" class="${brand ? '' : 'active'}" aria-pressed="${!brand}">Alle merken</button>
                    ${brands.map(item => `<button type="button" data-finder-brand="${item.id}" class="${String(item.id) === brand ? 'active' : ''}" aria-pressed="${String(item.id) === brand}">${esc(item.name)}</button>`).join('')}
                </div>
                <label class="finder-search-label" for="${esc(prefix)}-quick-model">Zoek uw model</label>
                <div class="finder-model-search"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input type="search" id="${esc(prefix)}-quick-model" placeholder="Bijvoorbeeld iPhone 13 of Galaxy S22" autocomplete="off"><kbd>Enter ↵</kbd></div>
                <div class="finder-recent" ${recent.length ? '' : 'hidden'}><span>Recent gekozen</span><div>${recent.map(model => `<a href="${esc(F.modelUrl(params, model))}" data-finder-model="${model.id}">${esc(model.name)}</a>`).join('')}</div><button type="button" data-clear-recent>Wissen</button></div>
                <div class="finder-list-tools"><p class="finder-status" role="status" aria-live="polite">${models.length} modellen met onderdelen</p><label>Volgorde <select class="finder-sort" aria-label="Modellen sorteren"><option value="count">Meeste onderdelen</option><option value="name">Model A–Z</option></select></label></div>
                <div class="finder-models">${F.modelLinks(models.slice(0, 8), params)}</div>
                <div class="finder-empty" ${models.length ? 'hidden' : ''}>Geen model in deze selectie. Kies een ander merk of zoek in de productnamen.<br><a data-model-fallback hidden>Zoeken in het assortiment →</a></div>
                <div class="finder-footer"><button type="button" data-more-models ${models.length > 8 ? '' : 'hidden'}>Alle ${models.length} modellen tonen <span aria-hidden="true">↓</span></button><a data-finder-all href="${esc(window.Discovery.buildUrl(params, {model: '', q: ''}))}">Alle onderdelen bekijken →</a></div>
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
                root.querySelector('.finder-status').textContent = `${models.length} ${models.length === 1 ? 'model' : 'modellen'} met onderdelen`;
                more.hidden = Boolean(showAll) || models.length <= 8;
                more.textContent = `Alle ${models.length} modellen tonen ↓`;
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
                if (event.key === 'Enter') { event.preventDefault(); list.querySelector('a')?.click(); }
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