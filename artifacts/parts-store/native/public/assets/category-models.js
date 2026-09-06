(function () {
    const esc = window.Core.escapeHtml;
    const C = window.CategoryModels = {
        modelUrl(params, model) {
            // Narrow the current selection; a model choice must not discard the part search.
            return window.Discovery.buildUrl(params, { model: model.id });
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
        caption(shown, total, query) {
            if (total > shown) return query ? `${shown} van ${total} modellen · typ verder om te verfijnen` : 'Een snelle selectie · typ om uw model te vinden';
            return `${total} ${total === 1 ? 'model' : 'modellen'} met onderdelen in deze selectie`;
        },
        links(models, params) {
            return models.map(model => `<a class="category-model-choice ${String(model.id) === params.get('model') ? 'active' : ''}" href="${esc(C.modelUrl(params, model))}" data-category-model="${model.id}" ${String(model.id) === params.get('model') ? 'aria-current="page"' : ''}>
                <strong>${esc(model.name)}</strong><small aria-label="${Number(model.count)} onderdelen">${Number(model.count)}</small></a>`).join('');
        },
        render(catalog, params, subject) {
            const query = window.FastFinder.modelQuery(params.get('q'));
            const {models, total} = C.shortlist(catalog, query, params.get('model'));
            const selected = catalog.models.find(model => String(model.id) === params.get('model'));
            return `<section class="category-models" data-category-models aria-label="Model zoeken">
                <div class="category-model-heading"><strong>${selected ? esc(selected.name) : 'Voor welk model?'}</strong><small>${selected ? 'Een ander model? Zoek hieronder. Uw onderdeelkeuze blijft behouden.' : esc(subject) + ' · typ uw model en kies direct.'}</small></div>
                <div class="category-model-body">
                    <div class="category-model-tools">
                        <label class="category-model-search"><span>Model zoeken</span><input type="search" class="form-control" data-category-model-search value="${esc(query)}" placeholder="Bijv. iPhone 13 Pro of S23" autocomplete="off" aria-controls="category-model-options"></label>
                    </div>
                    <div class="category-model-caption"><span data-category-model-count role="status" aria-live="polite">${C.caption(models.length, total, query)}</span>${selected ? `<a href="${esc(window.Discovery.buildUrl(params, {model: ''}))}">Modelkeuze wissen</a>` : ''}</div>
                    <nav class="category-model-options" id="category-model-options" aria-label="Kies het model voor deze onderdelen">${C.links(models, params)}</nav>
                    <p class="category-model-empty" ${models.length ? 'hidden' : ''}>Voor deze selectie zijn geen modellen gekoppeld. Bekijk de producten hieronder of pas uw filters aan.</p>
                </div>
            </section>`;
        },
        bind(root, catalog, params) {
            if (!root) return;
            const input = root.querySelector('[data-category-model-search]');
            const list = root.querySelector('.category-model-options');
            const count = root.querySelector('[data-category-model-count]');
            const empty = root.querySelector('.category-model-empty');
            const refresh = () => {
                const {models, total} = C.shortlist(catalog, input.value);
                list.innerHTML = C.links(models, params);
                list.scrollTop = 0;
                count.textContent = C.caption(models.length, total, input.value);
                empty.hidden = models.length > 0;
                empty.textContent = input.value.trim()
                    ? 'Geen model met deze naam in uw selectie. Probeer een andere modelnaam of pas uw filters aan.'
                    : 'Voor deze selectie zijn geen modellen gekoppeld. Bekijk de producten hieronder of pas uw filters aan.';
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
            });
        }
    };
})();