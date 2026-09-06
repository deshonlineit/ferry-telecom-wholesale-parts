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
        links(models, params) {
            return models.map(model => `<a class="category-model-choice ${String(model.id) === params.get('model') ? 'active' : ''}" href="${esc(C.modelUrl(params, model))}" data-category-model="${model.id}" ${String(model.id) === params.get('model') ? 'aria-current="page"' : ''}>
                <strong>${esc(model.name)}</strong><small aria-label="${Number(model.count)} onderdelen">${Number(model.count)}</small></a>`).join('');
        },
        render(catalog, params, subject) {
            const models = C.options(catalog);
            const selected = catalog.models.find(model => String(model.id) === params.get('model'));
            const brand = params.get('brand') || '';
            const brands = catalog.brands.filter(item => Number(item.count) > 0 || String(item.id) === brand);
            return `<details class="category-models" data-category-models ${selected ? '' : 'open'}>
                <summary><span class="category-model-step" aria-hidden="true">2</span><span class="category-model-heading"><strong>${selected ? esc(selected.name) : 'Kies uw model'}</strong><small>${selected ? 'Model wijzigen · onderdeel en filters blijven behouden' : esc(subject) + ' · klik op het model waarvoor u onderdelen zoekt.'}</small></span><span class="category-model-chevron" aria-hidden="true">⌄</span></summary>
                <div class="category-model-body">
                    <div class="category-model-tools">
                        <nav class="category-model-brands" aria-label="Modellen op merk filteren">
                            <a href="${esc(window.Discovery.buildUrl(params, {brand: '', model: ''}))}" class="${brand ? '' : 'active'}" ${brand ? '' : 'aria-current="page"'}>Alle merken</a>
                            ${brands.map(item => `<a href="${esc(window.Discovery.buildUrl(params, {brand: item.id, model: ''}))}" class="${String(item.id) === brand ? 'active' : ''}" ${String(item.id) === brand ? 'aria-current="page"' : ''}>${esc(item.name)}</a>`).join('')}
                        </nav>
                        <label class="category-model-search"><span>Model zoeken</span><input type="search" class="form-control" data-category-model-search placeholder="Bijv. iPhone 13 of Galaxy S22" autocomplete="off"></label>
                    </div>
                    <div class="category-model-caption"><span data-category-model-count role="status" aria-live="polite">${models.length} modellen met onderdelen in deze selectie</span>${selected ? `<a href="${esc(window.Discovery.buildUrl(params, {model: ''}))}">Alle modellen bekijken</a>` : '<span>Het getal toont het aantal onderdelen</span>'}</div>
                    <nav class="category-model-options" aria-label="Kies het model voor deze onderdelen">${C.links(models, params)}</nav>
                    <p class="category-model-empty" ${models.length ? 'hidden' : ''}>Voor deze selectie zijn geen modellen gekoppeld. Bekijk de producten hieronder of pas uw filters aan.</p>
                </div>
            </details>`;
        },
        bind(root, catalog, params) {
            if (!root) return;
            const input = root.querySelector('[data-category-model-search]');
            const list = root.querySelector('.category-model-options');
            const count = root.querySelector('[data-category-model-count]');
            const empty = root.querySelector('.category-model-empty');
            const refresh = () => {
                const models = C.options(catalog, input.value);
                list.innerHTML = C.links(models, params);
                list.scrollTop = 0;
                count.textContent = `${models.length} ${models.length === 1 ? 'model' : 'modellen'} met onderdelen in deze selectie`;
                empty.hidden = models.length > 0;
                empty.textContent = input.value.trim()
                    ? 'Geen model met deze naam in uw selectie. Probeer een andere modelnaam of pas uw filters aan.'
                    : 'Voor deze selectie zijn geen modellen gekoppeld. Bekijk de producten hieronder of pas uw filters aan.';
            };
            input.addEventListener('input', refresh);
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') { event.preventDefault(); list.querySelector('a')?.click(); }
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