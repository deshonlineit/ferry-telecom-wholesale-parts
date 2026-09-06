(function () {
    const esc = window.Core.escapeHtml;
    const C = window.CategoryModels = {
        modelUrl(params, model) {
            const currentFamily = params.get('family') || '';
            return window.Discovery.buildUrl(params, {
                model: model.id,
                family: currentFamily && currentFamily !== model.family ? '' : currentFamily
            });
        },
        options(catalog, query = '') {
            return window.FastFinder.models(catalog, '', query);
        },
        shortlist(catalog, query = '', selectedId = '', limit = 6) {
            const models = C.options(catalog, query);
            const recent = query ? [] : window.FastFinder.recent(catalog);
            const priority = model => {
                if (String(model.id) === String(selectedId)) return 100;
                const index = recent.findIndex(item => String(item.id) === String(model.id));
                return index < 0 ? 0 : 10 - index;
            };
            models.sort((a, b) => priority(b) - priority(a));
            return {models: models.slice(0, limit), total: models.length};
        },
        words(value) {
            return String(value || '').toLocaleLowerCase('nl').match(/[a-z]+|\d+/g) || [];
        },
        cleanFamilyQuery(catalog, query) {
            const deviceWords = new Set();
            (catalog.models || []).forEach(model => C.words(model.name).forEach(word => deviceWords.add(word)));
            (catalog.device_families || []).forEach(family => C.words(family.label).forEach(word => deviceWords.add(word)));
            (catalog.brands || []).forEach(brand => C.words(brand.name).forEach(word => deviceWords.add(word)));
            return String(query || '').split(/\s+/).filter(word => {
                const token = C.words(word)[0];
                return !token || !deviceWords.has(token);
            }).join(' ').trim();
        },
        familyUrl(catalog, params, family) {
            return window.Discovery.buildUrl(params, {family, model: '', q: C.cleanFamilyQuery(catalog, params.get('q'))});
        },
        familyModels(catalog, family) {
            return (catalog.models || []).filter(model => model.family === family && Number(model.count) > 0)
                .sort((a, b) => Number(Boolean(b.order_known)) - Number(Boolean(a.order_known))
                    || Number(b.sort_order || 0) - Number(a.sort_order || 0)
                    || b.name.localeCompare(a.name, 'nl', {numeric: true}));
        },
        caption(shown, total, query) {
            if (total > shown) return query ? `${shown} van ${total} modellen · typ verder om te verfijnen` : 'Typ om uw model te vinden';
            return `${total} ${total === 1 ? 'model' : 'modellen'} met onderdelen in deze selectie`;
        },
        links(models, params) {
            return models.map(model => `<a class="category-model-choice ${String(model.id) === params.get('model') ? 'active' : ''}" href="${esc(C.modelUrl(params, model))}" data-category-model="${model.id}" ${String(model.id) === params.get('model') ? 'aria-current="page"' : ''}>
                <strong>${esc(model.name)}</strong><small aria-label="${Number(model.count)} onderdelen">${Number(model.count)}</small></a>`).join('');
        },
        familyLinks(catalog, params) {
            const selected = params.get('family') || '';
            return (catalog.device_families || []).filter(family => Number(family.count) > 0 || family.id === selected)
                .map(family => `<a class="device-family-choice ${family.id === selected ? 'active' : ''}" data-device-family="${esc(family.id)}" href="${esc(C.familyUrl(catalog, params, family.id))}" ${family.id === selected ? 'aria-current="step"' : ''}><strong>${esc(family.label)}</strong><small aria-label="${Number(family.count)} onderdelen" title="${Number(family.count)} onderdelen">${Number(family.count)}</small></a>`).join('');
        },
        orderedModels(catalog, params, family) {
            const models = C.familyModels(catalog, family);
            return `<nav class="category-model-options" aria-label="Beschikbare modellen">${C.links(models, params)}</nav>`;
        },
        render(catalog, params, subject) {
            const query = window.FastFinder.modelQuery(params.get('q'));
            const {models, total} = C.shortlist(catalog, query, params.get('model'));
            const selected = catalog.models.find(model => String(model.id) === params.get('model'));
            const family = params.get('family') || selected?.family || '';
            const familyName = (catalog.device_families || []).find(item => item.id === family)?.label;
            return `<section class="category-models" data-category-models aria-label="Model zoeken">
                <div class="category-model-heading"><strong>${selected ? esc(selected.name) : 'Voor welk toestel?'}</strong><small>${selected ? 'Een ander model? Kies een familie of zoek hieronder. Uw onderdeelkeuze blijft behouden.' : esc(subject) + ' · kies een toestelfamilie.'}</small></div>
                <div class="category-model-body">
                    <nav class="device-family-options" data-device-family-options aria-label="Kies een toestelfamilie">${C.familyLinks(catalog, params)}</nav>
                    <div class="category-model-tools"><label class="category-model-search"><span>Model zoeken</span><input type="search" class="form-control" data-category-model-search value="${esc(query)}" placeholder="Bijv. iPhone 13 Pro of S23" autocomplete="off" aria-controls="category-model-search-options"></label></div>
                    <div class="category-model-caption"><span data-category-model-count role="status" aria-live="polite">${family ? `${C.familyModels(catalog, family).length} modellen in ${esc(familyName || family)}` : C.caption(models.length, total, query)}</span>${selected ? `<a href="${esc(window.Discovery.buildUrl(params, {model: ''}))}">Modelkeuze wissen</a>` : ''}</div>
                    <nav class="category-model-options category-model-search-results" id="category-model-search-options" aria-label="Gevonden modellen" ${query ? '' : 'hidden'}>${query ? C.links(models, params) : ''}</nav>
                    <div class="device-family-models" data-device-family-models>${family ? C.orderedModels(catalog, params, family) : ''}</div>
                    <p class="category-model-empty" ${family || models.length ? 'hidden' : ''}>Kies een toestelfamilie of typ een modelnaam.</p>
                </div>
            </section>`;
        },
        bind(root, catalog, params) {
            if (!root) return;
            const input = root.querySelector('[data-category-model-search]');
            const list = root.querySelector('.category-model-search-results');
            const count = root.querySelector('[data-category-model-count]');
            const empty = root.querySelector('.category-model-empty');
            const refresh = () => {
                const {models, total} = C.shortlist(catalog, input.value);
                list.innerHTML = C.links(models, params);
                list.hidden = !input.value.trim();
                count.textContent = C.caption(models.length, total, input.value);
                empty.hidden = models.length > 0 || !input.value.trim();
                empty.textContent = 'Geen model met deze naam in uw selectie. Probeer een andere modelnaam of pas uw filters aan.';
            };
            input.addEventListener('input', refresh);
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (C.options(catalog, input.value).length === 1) list.querySelector('a')?.click();
                    else list.querySelector('a')?.focus();
                }
                if (event.key === 'ArrowDown') { event.preventDefault(); list.querySelector('a')?.focus(); }
                if (event.key === 'Escape' && input.value) { event.preventDefault(); input.value = ''; refresh(); }
            });
            root.addEventListener('click', event => {
                const link = event.target.closest('[data-category-model]');
                if (!link) return;
                const model = catalog.models.find(item => String(item.id) === link.dataset.categoryModel);
                if (model) window.FastFinder.remember(model);
                window.Discovery.focusResultsAfterModel = true;
            });
        }
    };
})();