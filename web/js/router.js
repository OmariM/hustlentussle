/**
 * Client-side History API router.
 *
 * Maps clean URL paths to the app's screens and hydrates the session-bearing
 * screens (/battle/<id>, /results/<id>) so they are shareable and reloadable.
 * Relies on globals defined in app.js (classic scripts share one global scope):
 *   showScreen(el), hydrateBattleRoute(sid), hydrateResultsRoute(sid),
 *   and window.ytdOnEnterStats (from ytd.js).
 */
(function () {
    'use strict';

    function activate(screenId) {
        const el = document.getElementById(screenId);
        if (el && typeof showScreen === 'function') showScreen(el);
    }

    const routes = [
        { re: /^\/$/, enter: () => activate('home-screen') },
        { re: /^\/setup\/?$/, enter: () => activate('setup-screen') },
        { re: /^\/upload\/?$/, enter: () => activate('upload-screen') },
        {
            re: /^\/stats\/?$/,
            enter: () => {
                activate('stats-screen');
                if (typeof window.ytdOnEnterStats === 'function') window.ytdOnEnterStats();
            },
        },
        {
            re: /^\/battle\/([^/]+)\/?$/,
            enter: (m) => {
                activate('battle-screen');
                if (typeof hydrateBattleRoute === 'function') hydrateBattleRoute(decodeURIComponent(m[1]));
            },
        },
        {
            re: /^\/results\/([^/]+)\/?$/,
            enter: (m) => {
                activate('results-screen');
                if (typeof hydrateResultsRoute === 'function') hydrateResultsRoute(decodeURIComponent(m[1]));
            },
        },
        {
            re: /^\/results\/?$/,
            enter: () => {
                activate('results-screen');
                if (typeof hydrateResultsRoute === 'function') hydrateResultsRoute(null);
            },
        },
    ];

    function navigate(path, opts) {
        opts = opts || {};
        if (opts.replace) history.replaceState({}, '', path);
        else history.pushState({}, '', path);
        renderRoute();
    }

    function renderRoute() {
        const path = window.location.pathname || '/';

        // Back-compat: legacy viewer link /?mode=display&session_id=X becomes
        // the new path form /battle/X?mode=display (keeps old QR codes working).
        if (path === '/') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('mode') === 'display' && params.get('session_id')) {
                navigate('/battle/' + encodeURIComponent(params.get('session_id')) + '?mode=display', { replace: true });
                return;
            }
        }

        for (const route of routes) {
            const m = path.match(route.re);
            if (m) {
                route.enter(m);
                return;
            }
        }
        // Unknown path -> home.
        navigate('/', { replace: true });
    }

    window.navigate = navigate;
    window.renderRoute = renderRoute;

    window.addEventListener('popstate', renderRoute);
    // Runs after app.js / ytd.js DOMContentLoaded handlers (script order), so their
    // element setup and detectDisplayMode() have already executed.
    document.addEventListener('DOMContentLoaded', renderRoute);
})();
