/**
 * Client-side History API router.
 *
 * Maps clean URL paths to the app's screens and hydrates the session-bearing
 * screens (/battle/<id>, /results/<id>) so they are shareable and reloadable.
 * Cross-file calls go through window (app.js's top-level function
 * declarations are window properties): showScreen, hydrateBattleRoute,
 * hydrateResultsRoute, ytdOnEnterStats.
 */
(function () {
    'use strict';

    function activate(screenId: string): void {
        const el = document.getElementById(screenId);
        if (el && typeof window.showScreen === 'function') window.showScreen(el);
    }

    interface Route {
        re: RegExp;
        enter: (m: RegExpMatchArray) => void;
    }

    const routes: Route[] = [
        { re: /^\/$/, enter: () => activate('home-screen') },
        { re: /^\/setup\/?$/, enter: () => activate('setup-screen') },
        {
            re: /^\/prelim-setup\/?$/,
            enter: () => {
                activate('prelim-setup-screen');
                if (typeof window.initPrelimSetup === 'function') window.initPrelimSetup();
            },
        },
        { re: /^\/upload\/?$/, enter: () => activate('upload-screen') },
        {
            re: /^\/stats\/?$/,
            enter: () => {
                activate('stats-screen');
                if (typeof window.ytdOnEnterStats === 'function') window.ytdOnEnterStats();
            },
        },
        {
            re: /^\/prelims\/([^/]+)\/?$/,
            enter: (m) => {
                activate('prelims-screen');
                if (typeof window.hydratePrelimRoute === 'function') window.hydratePrelimRoute(decodeURIComponent(m[1]));
            },
        },
        {
            re: /^\/battle\/([^/]+)\/?$/,
            enter: (m) => {
                activate('battle-screen');
                if (typeof window.hydrateBattleRoute === 'function') window.hydrateBattleRoute(decodeURIComponent(m[1]));
            },
        },
        {
            re: /^\/results\/([^/]+)\/?$/,
            enter: (m) => {
                activate('results-screen');
                if (typeof window.hydrateResultsRoute === 'function') {
                    window.hydrateResultsRoute(decodeURIComponent(m[1]));
                }
            },
        },
        {
            re: /^\/results\/?$/,
            enter: () => {
                activate('results-screen');
                if (typeof window.hydrateResultsRoute === 'function') window.hydrateResultsRoute(null);
            },
        },
    ];

    function navigate(path: string, opts?: { replace?: boolean }): void {
        if (opts && opts.replace) history.replaceState({}, '', path);
        else history.pushState({}, '', path);
        renderRoute();
    }

    function renderRoute(): void {
        const path = window.location.pathname || '/';

        // Back-compat: legacy viewer link /?mode=display&session_id=X becomes
        // the new path form /battle/X?mode=display (keeps old QR codes working).
        if (path === '/') {
            const params = new URLSearchParams(window.location.search);
            const sid = params.get('session_id');
            if (params.get('mode') === 'display' && sid) {
                navigate('/battle/' + encodeURIComponent(sid) + '?mode=display', { replace: true });
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
    // Runs after app.js / ytd.ts DOMContentLoaded handlers (script order), so their
    // element setup and detectDisplayMode() have already executed.
    document.addEventListener('DOMContentLoaded', renderRoute);
})();
