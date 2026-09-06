(function () {
    window.Router.add(/^$/, (match, root, params) =>
        window.HomeSearch.mount(root, params, window.Router.renderVersion)
    );
})();