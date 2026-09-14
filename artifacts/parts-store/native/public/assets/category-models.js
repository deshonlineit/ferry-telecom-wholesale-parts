(function () {
    const esc = window.Core.escapeHtml;
    const t = (key, values) => window.I18n.t(key, values);
    const BROWSE_LIMIT = 8;
    const SERIES_LIMIT = 5;
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
        groupLabel(family, label) {
            const value = String(label || '').trim();
            if (family !== 'iphone' || !value) return value;
            if (/^iPhone\b.*\bSeries$/i.test(value)) return value;
            const series = value.match(/^(?:iPhone\s+)?(.+?)\s+Series$/i);
            if (series) return `iPhone ${series[1]} Series`;
            const generation = value.match(/^iPhone\s+(.+)$/i);
            return generation ? `iPhone ${generation[1]} Series` : value;
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
        groupedModels(catalog, family, models) {
            const configured = (catalog.device_families || []).find(item => item.id === family)?.groups || [];
            const order = new Map(configured.map((group, index) => [group.id, index]));
            const groups = new Map();
            models.forEach(model => {
                const id = model.family_group || family || 'other';
                const label = C.groupLabel(family, model.family_group_label
                    || configured.find(group => group.id === id)?.label
                    || C.familyLabel(catalog, family));
                if (!groups.has(id)) groups.set(id, {id, label, models: [], sortOrder: 0});
                const group = groups.get(id);
                group.models.push(model);
                group.sortOrder = Math.max(group.sortOrder, Number(model.sort_order || 0));
            });
            return Array.from(groups.values()).sort((a, b) =>
                (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)
                || b.sortOrder - a.sortOrder
                || a.label.localeCompare(b.label, 'en', {numeric: true})
            );
        },
        visibleModels(catalog, params, family, query = '', expanded = false) {
            const all = C.familyOptions(catalog, params, family, query);
            if (query.trim() || expanded || all.length <= BROWSE_LIMIT) return {models: all, total: all.length};
            const models = all.slice(0, BROWSE_LIMIT);
            const selected = all.find(model => String(model.id) === params.get('model'));
            if (selected && !models.some(model => String(model.id) === String(selected.id))) {
                models.unshift(selected);
            }
            return {models, total: all.length};
        },
        familyLinks(catalog, params, openFirst = false) {
            const selected = params.get('family') || '';
            return (catalog.device_families || []).filter(family => Number(family.count) > 0 || family.id === selected)
                .map((family, index) => {
                    const isSelected = family.id === selected || C.activeFamily(catalog, params) === family.id;
                    return `<details class="device-family-group" name="device-family-accordion" ${isSelected || (openFirst && index === 0) ? 'open' : ''}>
                        <summary class="device-family-choice ${isSelected ? 'active' : ''}">
                            <strong>${esc(family.label)}</strong>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </summary>
                        <div class="device-family-dropdown">
                            <div class="category-model-tools">
                                <strong class="category-model-search-title">${esc(t('searchYourModel'))}</strong>
                                <span class="category-model-search-copy">${esc(t('searchModelFirstHint'))}</span>
                                <label class="category-model-search">
                                    <span class="category-model-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span>
                                    <input type="search" class="form-control" data-category-model-search="${esc(family.id)}" placeholder="${esc(t('searchModelExample'))}" aria-label="${esc(t('searchModels'))}" autocomplete="off">
                                </label>
                                <p class="category-model-search-hint">${esc(t('searchModelHint'))}</p>
                            </div>
                            <div class="device-family-models" data-family-models="${esc(family.id)}" data-expanded="false">
                                ${C.orderedModels(catalog, params, family.id, '')}
                            </div>
                            <div class="device-family-all-link mt-2">
                                <a href="${esc(C.familyUrl(catalog, params, family.id))}" class="btn btn-outline btn-sm">${esc(t('allPartsFor', {label: family.label}))}</a>
                            </div>
                        </div>
                    </details>`;
                }).join('');
        },
        orderedModels(catalog, params, family, query = '', expanded = false) {
            const models = C.familyOptions(catalog, params, family, query);
            if (!models.length) return `<p class="category-model-empty">${esc(t('noResults'))}</p>`;
            const groups = C.groupedModels(catalog, family, models);
            const selectedId = params.get('model');
            const selectedGroup = groups.find(group => group.models.some(model => String(model.id) === selectedId))?.id;
            const grouped = groups.map((group, index) => {
                const shown = query.trim() || expanded ? group.models : group.models.slice(0, SERIES_LIMIT);
                const more = !query.trim() && group.models.length > shown.length
                    ? `<button type="button" class="category-model-series-more" data-category-series-all="${esc(family)}" data-category-series="${esc(group.id)}">${esc(t('showAllInSeries', {count: window.I18n.number(group.models.length), series: group.label}))}</button>`
                    : '';
                return `<details class="category-model-series" data-device-model-group="${esc(group.id)}" ${query.trim() || group.id === selectedGroup || (!selectedGroup && index === 0) ? 'open' : ''}>
                    <summary><span>${esc(group.label)}</span><small>${window.I18n.number(group.models.length)}</small></summary>
                    <div class="category-model-series-body"><nav class="category-model-options" aria-label="${esc(group.label)}">${C.links(shown, params)}</nav>${more}</div>
                </details>`;
            }).join('');
            return `<div class="category-model-results-meta">${esc(query.trim() ? C.caption(models.length, models.length, query) : t('chooseSeriesOrSearch', {count: window.I18n.number(models.length)}))}</div>
                <div class="category-model-scroll category-model-series-grid">${grouped}</div>`;
        },
        render(catalog, params, subject, options = {}) {
            const selected = catalog.models.find(model => String(model.id) === params.get('model'));
            const heading = selected
                ? `<strong>${esc(selected.name)}</strong><small>${t('device')} · ${t('changeDevice', {name: ''}).replace('…', '')}</small>`
                : `<strong>${options.prominent ? t('compatibleModels') : t('chooseModel')}</strong><small>${options.prominent ? esc(subject) : t('optional')}</small>`;
            return `<details class="category-models ${options.prominent ? 'category-models--prominent' : ''}" data-category-models ${options.open ? 'open' : ''}>
                <summary class="category-model-trigger">
                    <span class="category-model-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/></svg></span>
                    <span class="category-model-heading">${heading}</span>
                    <svg class="category-model-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <div class="category-model-body">
                    <nav class="device-family-options" data-device-family-options aria-label="${t('chooseModel')}">${C.familyLinks(catalog, params, Boolean(options.openFirst))}</nav>
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
                        if (host.dataset) host.dataset.expanded = 'false';
                        host.innerHTML = C.orderedModels(catalog, params, familyId, input.value);
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
                const seriesAll = event.target.closest('[data-category-series-all]');
                if (seriesAll) {
                    const family = seriesAll.dataset.categorySeriesAll;
                    const groupId = seriesAll.dataset.categorySeries;
                    const group = C.groupedModels(catalog, family, C.familyOptions(catalog, params, family))
                        .find(candidate => candidate.id === groupId);
                    const card = seriesAll.closest('[data-device-model-group]');
                    if (group && card) {
                        card.open = true;
                        card.querySelector('.category-model-options').innerHTML = C.links(group.models, params);
                        seriesAll.remove();
                        card.querySelector('a')?.focus({preventScroll: true});
                    }
                    return;
                }
                const showAll = event.target.closest('[data-category-model-show-all]');
                if (showAll) {
                    const family = showAll.dataset.categoryModelShowAll;
                    const host = root.querySelector(`[data-family-models="${family}"]`);
                    if (host) {
                        if (host.dataset) host.dataset.expanded = 'true';
                        host.innerHTML = C.orderedModels(catalog, params, family, '', true);
                        host.querySelector('a')?.focus();
                    }
                    return;
                }
                const link = event.target.closest('[data-category-model]');
                if (!link) return;
                const model = catalog.models.find(item => String(item.id) === link.dataset.categoryModel);
                if (model) window.FastFinder.remember(model);
                if (model?.family && root.closest('.housing-guide')) {
                    window.Discovery.trackHousingGuide('housing_guide_model_selected', {
                        model_family: String(model.family)
                    });
                }
                window.Discovery.focusResultsAfterModel = true;
            });
        }
    };
})();
