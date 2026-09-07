/* The front page route. Filtered product views belong to the shop and category pages. */
(function () {
    const discovery = ['q', 'category', 'part', 'brand', 'family', 'model', 'quality', 'stock', 'featured', 'sort', 'page', 'limit'];
    window.Router.add(/^$/, (match, root, params) => {
        if (discovery.some(key => (params.get(key) || '').trim() !== '')) {
            return window.Router.navigate(window.Discovery.buildUrl(params));
        }
        return window.HomeLanding.mount(root);
    });
})();
