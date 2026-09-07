(function () {
    const esc = window.Core.escapeHtml;
    const t = (key, values) => window.I18n.t(key, values);
    const C = window.CategoryModels = {
        modelUrl(params, model) {
            const currentFamily = params.get('family') || '';
            // A concrete model is the narrowest device scope, so a wider device brand must never survive it.
            return window.Discovery.buildUrl(params, {
                model: model.id,
                device_brand: '',
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
            return String(value || '').toLocaleLowerCase('en').match(/[a-z]+|\d+/g) || [];
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
            return window.Discovery.buildUrl(params, {family, model: '', device_brand: '', q: C.cleanFamilyQuery(catalog, params.get('q'))});
        },
        familyModels(catalog, family) {
            return (catalog.models || []).filter(model => model.family === family && Number(model.count) > 0)
                .sort((a, b) => Number(Boolean(b.order_known)) - Number(Boolean(a.order_known))
                    || Number(b.sort_order || 0) - Number(a.sort_order || 0)
                    || b.name.localeCompare(a.name, 'en', {numeric: true}));
        },
        caption(shown, total, query) {
            if (total > shown) return query ? t('modelsOfTotal', {shown, total}) : t('modelSearch');
            return t('modelsWithParts', {count: window.I18n.number(total), models: t(total === 1 ? 'model' : 'models')});
        },
        activeFamily(catalog, params) {
            const selected = (catalog.models || []).find(model => String(model.id) === params.get('model'));
            return params.get('family') || selected?.family || '';
        },
        familyLabel(catalog, family) {
            return (catalog.device_families || []).find(item => item.id === family)?.label || family;
        },
        familyCaption(label, shown, total, query, outside = 0) {
            if (!String(query || '').trim()) return t('modelsWithParts', {count: window.I18n.number(total), models: t(total === 1 ? 'model' : 'models')});
            if (shown) return t('modelsOfTotal', {shown, total});
            return t('noModelInFamily', {label});
        },
        familyOptions(catalog, params, family, query = '') {
            return window.ModelSearch.rank(C.familyModels(catalog, family), query);
        },
        links(models, params) {
            return models.map(model => `<a class="category-model-choice ${String(model.id) === params.get('model') ? 'active' : ''}" href="${esc(C.modelUrl(params, model))}" data-category-model="${model.id}" ${String(model.id) === params.get('model') ? 'aria-current="page"' : ''}>
                <strong>${esc(model.name)}</strong><small aria-label="${Number(model.count)} parts">${Number(model.count)}</small></a>`).join('');
        },
        familyLinks(catalog, params) {
            const selected = params.get('family') || '';
            return (catalog.device_families || []).filter(family => Number(family.count) > 0 || family.id === selected)
                .map(family => {
                    const isSelected = family.id === selected || C.activeFamily(catalog, params) === family.id;
                    return `<details class="device-family-group" name="device-family-accordion">
                        <summary class="device-family-choice ${isSelected ? 'active' : ''}">
                            <strong>${esc(family.label)}</strong>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </summary>
                        <div class="device-family-dropdown">
                            <div class="category-model-tools">
                                <label class="category-model-search">
                                    <input type="search" class="form-control" data-category-model-search="${esc(family.id)}" placeholder="${esc(t('searchModels'))}" aria-label="${esc(t('searchModels'))}" autocomplete="off">
                                </label>
                            </div>
                            <div class="device-family-models" data-family-models="${esc(family.id)}">
                                ${C.orderedModels(catalog, params, family.id, '')}
                            </div>
                            <div class="device-family-all-link mt-2">
                                <a href="${esc(C.familyUrl(catalog, params, family.id))}" class="btn btn-outline btn-sm">${esc(t('allPartsFor', {label: family.label}))}</a>
                            </div>
                        </div>
                    </details>`;
                }).join('');
        },
        orderedModels(catalog, params, family, query = '') {
            const models = C.familyOptions(catalog, params, family, query);
            return `<nav class="category-model-options" aria-label="${t('modelsFound')}">${C.links(models, params)}</nav>`;
        },
        render(catalog, params, subject) {
            const selected = catalog.models.find(model => String(model.id) === params.get('model'));
            const heading = selected
                ? `<strong>${esc(selected.name)}</strong><small>${t('device')} · ${t('changeDevice', {name: ''}).replace('…', '')}</small>`
                : `<strong>${t('chooseModel')}</strong><small>${t('optional')}</small>`;
            return `<details class="category-models" data-category-models>
                <summary class="category-model-trigger">
                    <span class="category-model-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/></svg></span>
                    <span class="category-model-heading">${heading}</span>
                    <svg class="category-model-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <div class="category-model-body">
                    <nav class="device-family-options" data-device-family-options aria-label="${t('chooseModel')}">${C.familyLinks(catalog, params)}</nav>
                </div>
            </details>`;
        },
        bind(root, catalog, params) {
            if (!root) return;
            // Accordion logic: only one details open at a time (if browser doesn't support 'name' attribute natively)
            const details = root.querySelectorAll('details[name="device-family-accordion"]');
            details.forEach(d => {
                d.addEventListener('toggle', (e) => {
                    if (d.open) {
                        details.forEach(other => { if (other !== d) other.open = false; });
                        const input = d.querySelector('input[type="search"]');
                        if (input) input.focus();
                    }
                });
            });

            root.querySelectorAll('input[type="search"]').forEach(input => {
                input.addEventListener('input', () => {
                    const familyId = input.dataset.categoryModelSearch;
                    const host = root.querySelector(`[data-family-models="${familyId}"]`);
                    if (host) {
                        const matches = C.familyOptions(catalog, params, familyId, input.value);
                        host.innerHTML = `<nav class="category-model-options" aria-label="${t('modelsFound')}">${C.links(matches, params)}</nav>`;
                    }
                });
                input.addEventListener('keydown', event => {
                    const familyId = input.dataset.categoryModelSearch;
                    const host = root.querySelector(`[data-family-models="${familyId}"]`);
                    if (!host) return;
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        const matches = C.familyOptions(catalog, params, familyId, input.value);
                        if (matches.length === 1) host.querySelector('a')?.click();
                        else host.querySelector('a')?.focus();
                    }
                    if (event.key === 'ArrowDown') { event.preventDefault(); host.querySelector('a')?.focus(); }
                    if (event.key === 'Escape' && input.value) { event.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); }
                });
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