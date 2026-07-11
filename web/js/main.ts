/**
 * Single bundle entry point (built by esbuild into js/dist/main.js).
 *
 * Import order mirrors the old script-tag order and matters:
 * - DebugTools first, so the inline bootstrap in index.html (which runs
 *   before this bundle) finds window.DebugTools ready when it instantiates.
 * - app before router: both register DOMContentLoaded handlers and the
 *   router's initial-route render must run after app.ts has grabbed its
 *   DOM elements.
 * - Cross-module calls between these files go through the window surface
 *   declared in global.d.ts.
 */
import './components/DebugTools';
import './app';
import './explainers';
import './prelims';
import './prelim_setup';
import './ytd';
import './router';
