/* Shared model matching: used by the mega menu and the on-page model refilter. */
(function () {
    const tokenize = value => String(value || '').toLocaleLowerCase('nl').match(/\p{L}+|\d+/gu) || [];
    const compact = value => String(value || '').toLocaleLowerCase('nl').replace(/[^\p{L}\p{N}]+/gu, '');
    const M = window.ModelSearch = {
        tokenize,
        compact,
        /**
         * Relevance of one model name for a typed query.
         * Returns -1 when a typed word appears nowhere in the name, so callers can drop it.
         */
        score(name, query) {
            const queryTokens = tokenize(query);
            if (!queryTokens.length) return 0;
            const nameTokens = tokenize(name);
            const compactName = compact(name);
            const compactQuery = compact(query);
            let score = 0;
            for (const token of queryTokens) {
                if (nameTokens.includes(token)) score += 120;
                else if (nameTokens.some(candidate => candidate.startsWith(token))) score += 60;
                else if (compactName.includes(token)) score += 20;
                else return -1;
            }
            if (compactName === compactQuery) score += 1000;
            else if (compactName.startsWith(compactQuery)) score += 300;
            else if (compactName.includes(compactQuery)) score += 80;
            // With everything else equal the shorter, plainer name is the better hit.
            return score - Math.min(nameTokens.length, 12);
        },
        matches(name, query) {
            return M.score(name, query) >= 0;
        },
        /** Best matches first; ties keep the caller's order, which is newest to oldest. */
        rank(models, query, name = model => model?.name) {
            const term = String(query || '').trim();
            if (!term) return [...models];
            return models.map((model, index) => ({model, index, score: M.score(name(model), term)}))
                .filter(entry => entry.score >= 0)
                .sort((a, b) => b.score - a.score || a.index - b.index)
                .map(entry => entry.model);
        }
    };
})();
