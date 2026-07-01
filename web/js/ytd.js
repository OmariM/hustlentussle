/**
 * Year-to-Date stats page: public leaderboards + admin login + battle ingest.
 * Self-contained; reuses the existing `.screen`/`.active` show pattern and
 * shared button/table classes. Talks to /api/stats/* and /api/admin/* .
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    let isAdmin = false;
    let preview = null; // { source, session_id, results, names, dancers, raw_payload }

    // ---- screen helpers ----

    function showScreenById(screenId) {
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
        const el = $(screenId);
        if (el) el.classList.add('active');
        const nav = $('nav-bar');
        if (nav) nav.style.display = screenId === 'home-screen' ? 'none' : '';
        window.scrollTo(0, 0);
    }

    function openModal(id) { $(id).classList.remove('hidden'); }
    function closeModal(id) { $(id).classList.add('hidden'); }

    // ---- admin state ----

    async function refreshAdmin() {
        try {
            const res = await fetch('/api/admin/me');
            const data = await res.json();
            isAdmin = !!data.authenticated;
            applyAdminUI(data.email);
        } catch (e) {
            isAdmin = false;
            applyAdminUI(null);
        }
    }

    function applyAdminUI(email) {
        const set = (id, show) => { const el = $(id); if (el) el.style.display = show ? '' : 'none'; };
        set('ytd-admin-login-btn', !isAdmin);
        set('ytd-admin-logout-btn', isAdmin);
        set('ytd-admin-tools', isAdmin);
        set('publish-to-ytd', isAdmin);
        const who = $('ytd-admin-email');
        if (who) who.textContent = isAdmin && email ? email : '';
    }

    // ---- standings ----

    async function loadYears() {
        const sel = $('ytd-year-select');
        let years = [];
        try {
            const res = await fetch('/api/stats/years');
            years = (await res.json()).years || [];
        } catch (e) { years = []; }
        if (years.length === 0) years = [new Date().getFullYear()];
        sel.innerHTML = '';
        years.forEach((y) => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            sel.appendChild(opt);
        });
    }

    async function loadStandings() {
        const year = $('ytd-year-select').value;
        let data = { leads: [], follows: [] };
        try {
            const res = await fetch(`/api/stats/year-to-date?year=${encodeURIComponent(year)}`);
            if (res.ok) data = await res.json();
        } catch (e) { /* keep empty */ }

        renderStandings('ytd-lead-body', data.leads || []);
        renderStandings('ytd-follow-body', data.follows || []);
        const empty = (data.leads || []).length === 0 && (data.follows || []).length === 0;
        $('ytd-empty').style.display = empty ? '' : 'none';
    }

    function renderStandings(bodyId, rows) {
        const body = $(bodyId);
        body.innerHTML = '';
        rows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${idx + 1}</td>` +
                `<td>${escapeHtml(row.display_name)}</td>` +
                `<td>${row.total_points}</td>` +
                `<td>${row.crowns || 0}</td>` +
                `<td>${row.battles_entered || 0}</td>`;
            body.appendChild(tr);
        });
    }

    // ---- admin: contributed battles ----

    async function loadBattles() {
        if (!isAdmin) return;
        const year = $('ytd-year-select').value;
        let battles = [];
        try {
            const res = await fetch(`/api/stats/battles?year=${encodeURIComponent(year)}`);
            battles = (await res.json()).battles || [];
        } catch (e) { battles = []; }
        const body = $('ytd-battles-body');
        body.innerHTML = '';
        battles.forEach((b) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(b.battle_date || '')}</td>` +
                `<td>${escapeHtml(b.name)}</td>` +
                `<td>${escapeHtml(b.source)}</td>` +
                `<td>${b.result_count}</td>`;
            const actions = document.createElement('td');
            const del = document.createElement('button');
            del.className = 'btn secondary small';
            del.textContent = 'Delete';
            del.addEventListener('click', () => deleteBattle(b.id, b.name));
            actions.appendChild(del);
            tr.appendChild(actions);
            body.appendChild(tr);
        });
    }

    async function deleteBattle(id, name) {
        if (!confirm(`Delete "${name}"? This removes its results from the stats.`)) return;
        const res = await fetch(`/api/stats/battles/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadStandings();
            await loadBattles();
        } else {
            alert('Failed to delete battle.');
        }
    }

    // ---- ingest (preview -> resolve -> commit) ----

    async function previewFromFile() {
        const input = $('ytd-file-input');
        const file = input.files[0];
        if (!file) { alert('Choose a .json battle file first.'); return; }
        const fd = new FormData();
        fd.append('battle_file', file);
        const res = await fetch('/api/stats/ingest/preview', { method: 'POST', body: fd });
        await handlePreviewResponse(res);
    }

    async function previewFromLiveBattle() {
        const sid = localStorage.getItem('sessionId');
        if (!sid) { alert('No active battle found to publish.'); return; }
        const res = await fetch('/api/stats/ingest/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid }),
        });
        await handlePreviewResponse(res);
    }

    async function handlePreviewResponse(res) {
        let data;
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) { alert(data.error || 'Failed to load battle for review.'); return; }
        preview = data;
        openIngestModal();
    }

    function openIngestModal() {
        $('ytd-ingest-error').textContent = '';
        $('ytd-battle-name').value = '';
        $('ytd-battle-date').value = new Date().toISOString().slice(0, 10);
        const body = $('ytd-resolve-body');
        body.innerHTML = '';

        preview.names.forEach((n) => {
            const tr = document.createElement('tr');
            const fromCell = document.createElement('td');
            fromCell.textContent = n.name;
            tr.appendChild(fromCell);

            const mapCell = document.createElement('td');
            const select = document.createElement('select');
            select.dataset.name = n.name;

            // "Create new" option (value="" => create using the new-name input)
            const newOpt = document.createElement('option');
            newOpt.value = '';
            newOpt.textContent = '➕ Create new dancer';
            select.appendChild(newOpt);

            preview.dancers.forEach((d) => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.display_name;
                if (n.suggested_dancer_id && d.id === n.suggested_dancer_id) opt.selected = true;
                select.appendChild(opt);
            });

            // New-name text input, shown when "Create new" is selected
            const newName = document.createElement('input');
            newName.type = 'text';
            newName.value = n.name;
            newName.dataset.newname = n.name;
            newName.style.marginTop = '.25rem';
            newName.style.display = n.suggested_dancer_id ? 'none' : '';

            select.addEventListener('change', () => {
                newName.style.display = select.value === '' ? '' : 'none';
            });

            mapCell.appendChild(select);
            mapCell.appendChild(newName);
            tr.appendChild(mapCell);
            body.appendChild(tr);
        });

        openModal('ytd-ingest-modal');
    }

    async function commitIngest() {
        const name = $('ytd-battle-name').value.trim();
        const date = $('ytd-battle-date').value;
        const errEl = $('ytd-ingest-error');
        errEl.textContent = '';
        if (!name || !date) { errEl.textContent = 'Battle name and date are required.'; return; }

        const resolutions = {};
        $('ytd-resolve-body').querySelectorAll('select').forEach((sel) => {
            const seen = sel.dataset.name;
            if (sel.value) {
                resolutions[seen] = { dancer_id: sel.value };
            } else {
                const input = sel.parentElement.querySelector('input[type=text]');
                resolutions[seen] = { new_name: (input && input.value.trim()) || seen };
            }
        });

        const payload = {
            battle_name: name,
            battle_date: date,
            source: preview.source,
            session_id: preview.session_id,
            results: preview.results,
            raw_payload: preview.raw_payload,
            resolutions: resolutions,
        };

        const res = await fetch('/api/stats/ingest/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let data; try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) { errEl.textContent = data.error || 'Failed to publish battle.'; return; }

        closeModal('ytd-ingest-modal');
        $('ytd-file-input').value = '';
        $('ytd-file-name').textContent = '';
        await loadYears();
        await loadStandings();
        await loadBattles();
        alert('Battle published to year-to-date stats.');
    }

    // ---- admin login ----

    async function submitLogin() {
        const email = $('ytd-login-email').value.trim();
        const password = $('ytd-login-password').value;
        const errEl = $('ytd-login-error');
        errEl.textContent = '';
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        let data; try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) { errEl.textContent = data.error || 'Login failed.'; return; }
        isAdmin = true;
        applyAdminUI(data.email);
        closeModal('ytd-login-modal');
        $('ytd-login-password').value = '';
        await loadBattles();
    }

    async function logout() {
        await fetch('/api/admin/logout', { method: 'POST' });
        isAdmin = false;
        applyAdminUI(null);
    }

    // ---- entry ----

    // Called by the router (js/router.js) after it activates the stats screen.
    async function enterStats() {
        await refreshAdmin();
        await loadYears();
        await loadStandings();
        await loadBattles();
    }
    window.ytdOnEnterStats = enterStats;

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

        on('go-to-ytd', 'click', () => window.navigate('/stats'));
        on('ytd-back-home', 'click', () => window.navigate('/'));
        on('ytd-year-select', 'change', async () => { await loadStandings(); await loadBattles(); });

        // admin login modal
        on('ytd-admin-login-btn', 'click', () => { $('ytd-login-error').textContent = ''; openModal('ytd-login-modal'); });
        on('ytd-login-cancel', 'click', () => closeModal('ytd-login-modal'));
        on('ytd-login-submit', 'click', submitLogin);
        on('ytd-admin-logout-btn', 'click', logout);

        // ingest
        on('ytd-upload-btn', 'click', previewFromFile);
        on('publish-to-ytd', 'click', previewFromLiveBattle);
        on('ytd-ingest-cancel', 'click', () => closeModal('ytd-ingest-modal'));
        on('ytd-ingest-commit', 'click', commitIngest);

        // file name display
        on('ytd-file-input', 'change', () => {
            const f = $('ytd-file-input').files[0];
            $('ytd-file-name').textContent = f ? f.name : '';
        });

        // reflect admin state on the results screen's publish button on first load
        refreshAdmin();
    });
})();
