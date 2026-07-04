/**
 * Year-to-Date stats page: public leaderboards + admin login + battle ingest.
 * Self-contained; reuses the existing `.screen`/`.active` show pattern and
 * shared button/table classes. Talks to /api/stats/* and /api/admin/* .
 */
import type {
    AdminLoginResponse,
    AdminMeResponse,
    ApiErrorResponse,
    BattleDetail,
    BattlesResponse,
    DancersResponse,
    IngestPreviewResponse,
    NameResolutions,
    YtdStandingRow,
    YtdStandingsResponse,
    YtdYearsResponse,
} from './types';

(function () {
    'use strict';

    const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

    let isAdmin = false;
    let preview: IngestPreviewResponse | null = null;

    // ---- screen helpers ----

    function openModal(id: string): void {
        $(id).classList.remove('hidden');
    }
    function closeModal(id: string): void {
        $(id).classList.add('hidden');
    }

    // ---- admin state ----

    async function refreshAdmin(): Promise<void> {
        try {
            const res = await fetch('/api/admin/me');
            const data = (await res.json()) as AdminMeResponse;
            isAdmin = !!data.authenticated;
            applyAdminUI(data.email ?? null);
        } catch {
            isAdmin = false;
            applyAdminUI(null);
        }
    }

    function applyAdminUI(email: string | null): void {
        const set = (id: string, show: boolean) => {
            const el = $(id);
            if (el) el.style.display = show ? '' : 'none';
        };
        set('ytd-admin-login-btn', !isAdmin);
        set('ytd-admin-logout-btn', isAdmin);
        set('ytd-admin-tools', isAdmin);
        set('publish-to-ytd', isAdmin);
        const who = $('ytd-admin-email');
        if (who) who.textContent = isAdmin && email ? email : '';
    }

    // ---- standings ----

    async function loadYears(): Promise<void> {
        const sel = $<HTMLSelectElement>('ytd-year-select');
        let years: number[] = [];
        try {
            const res = await fetch('/api/stats/years');
            years = ((await res.json()) as YtdYearsResponse).years || [];
        } catch {
            years = [];
        }
        if (years.length === 0) years = [new Date().getFullYear()];
        sel.innerHTML = '';
        years.forEach((y) => {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            sel.appendChild(opt);
        });
    }

    async function loadStandings(): Promise<void> {
        const year = $<HTMLSelectElement>('ytd-year-select').value;
        let data: Pick<YtdStandingsResponse, 'leads' | 'follows'> = { leads: [], follows: [] };
        try {
            const res = await fetch(`/api/stats/year-to-date?year=${encodeURIComponent(year)}`);
            if (res.ok) data = (await res.json()) as YtdStandingsResponse;
        } catch {
            /* keep empty */
        }

        renderStandings('ytd-lead-body', data.leads || []);
        renderStandings('ytd-follow-body', data.follows || []);
        const empty = (data.leads || []).length === 0 && (data.follows || []).length === 0;
        $('ytd-empty').style.display = empty ? '' : 'none';
    }

    function renderStandings(bodyId: string, rows: YtdStandingRow[]): void {
        const body = $(bodyId);
        body.innerHTML = '';
        rows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML =
                `<td>${idx + 1}</td>` +
                `<td>${escapeHtml(row.display_name)}</td>` +
                `<td>${row.total_points}</td>` +
                `<td>${row.crowns || 0}</td>` +
                `<td>${row.battles_entered || 0}</td>`;
            body.appendChild(tr);
        });
    }

    // ---- admin: contributed battles ----

    async function loadBattles(): Promise<void> {
        if (!isAdmin) return;
        const year = $<HTMLSelectElement>('ytd-year-select').value;
        let battles: BattlesResponse['battles'] = [];
        try {
            const res = await fetch(`/api/stats/battles?year=${encodeURIComponent(year)}`);
            battles = ((await res.json()) as BattlesResponse).battles || [];
        } catch {
            battles = [];
        }
        const body = $('ytd-battles-body');
        body.innerHTML = '';
        battles.forEach((b) => {
            const tr = document.createElement('tr');
            tr.innerHTML =
                `<td>${escapeHtml(b.battle_date || '')}</td>` +
                `<td>${escapeHtml(b.name)}</td>` +
                `<td>${escapeHtml(b.source)}</td>` +
                `<td>${b.result_count}</td>`;
            const actions = document.createElement('td');
            const edit = document.createElement('button');
            edit.className = 'btn secondary small';
            edit.textContent = 'Edit';
            edit.addEventListener('click', () => editBattle(b.id));
            actions.appendChild(edit);
            const del = document.createElement('button');
            del.className = 'btn secondary small';
            del.textContent = 'Delete';
            del.addEventListener('click', () => deleteBattle(b.id, b.name));
            actions.appendChild(del);
            tr.appendChild(actions);
            body.appendChild(tr);
        });
    }

    async function deleteBattle(id: string, name: string): Promise<void> {
        if (!confirm(`Delete "${name}"? This removes its results from the stats.`)) return;
        const res = await fetch(`/api/stats/battles/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadStandings();
            await loadBattles();
        } else {
            alert('Failed to delete battle.');
        }
    }

    async function editBattle(id: string): Promise<void> {
        let battle: BattleDetail;
        try {
            const res = await fetch(`/api/stats/battles/${id}`);
            if (!res.ok) throw new Error();
            battle = (await res.json()) as BattleDetail;
        } catch {
            alert('Failed to load battle.');
            return;
        }

        if (!window.openBattlePayloadEditor) {
            alert('Battle editor is unavailable.');
            return;
        }
        window.openBattlePayloadEditor(battle.raw_data, {
            title: 'Edit Published Battle',
            showMetaFields: true,
            initialMeta: { name: battle.name, battle_date: battle.battle_date },
            onSave: async (editedPayload, meta) => {
                const res = await fetch(`/api/stats/battles/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        battle_name: meta.name,
                        battle_date: meta.battle_date,
                        raw_payload: editedPayload,
                    }),
                });
                let data: Partial<ApiErrorResponse>;
                try {
                    data = (await res.json()) as Partial<ApiErrorResponse>;
                } catch {
                    data = {};
                }
                if (!res.ok) throw new Error(data.error || 'Failed to update battle.');
                await loadYears();
                await loadStandings();
                await loadBattles();
                alert('Battle updated.');
            },
        });
    }

    // ---- admin: dancers (merge duplicates) ----

    let mergeNameDirty = false; // true once the admin has typed into #ytd-merge-name themselves

    async function loadDancers(): Promise<void> {
        if (!isAdmin) return;
        let dancers: DancersResponse['dancers'] = [];
        try {
            const res = await fetch('/api/stats/dancers');
            dancers = ((await res.json()) as DancersResponse).dancers || [];
        } catch {
            dancers = [];
        }
        const body = $('ytd-dancers-body');
        body.innerHTML = '';
        dancers.forEach((d) => {
            const tr = document.createElement('tr');
            const checkCell = document.createElement('td');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.dataset.id = d.id;
            check.dataset.name = d.display_name;
            checkCell.appendChild(check);
            tr.appendChild(checkCell);

            const nameCell = document.createElement('td');
            nameCell.textContent = d.display_name;
            tr.appendChild(nameCell);

            const aliasCell = document.createElement('td');
            aliasCell.textContent = (d.aliases || []).join(', ');
            tr.appendChild(aliasCell);

            const battlesCell = document.createElement('td');
            battlesCell.textContent = String(d.battles_entered);
            if (d.battles_entered === 0) {
                const hint = document.createElement('span');
                hint.style.color = 'var(--text-muted, #888)';
                hint.textContent = ' (no battles)';
                battlesCell.appendChild(hint);
            }
            tr.appendChild(battlesCell);

            body.appendChild(tr);
        });
        updateMergeButtonState();
    }

    function updateMergeButtonState(): void {
        const checked = $('ytd-dancers-body').querySelectorAll('input[type=checkbox]:checked');
        $<HTMLButtonElement>('ytd-merge-selected-btn').disabled = checked.length < 2;
    }

    function openMergeModal(): void {
        const checked = Array.from(
            $('ytd-dancers-body').querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked'),
        );
        if (checked.length < 2) return;

        mergeNameDirty = false;
        $('ytd-merge-error').textContent = '';
        const choices = $('ytd-merge-choices');
        choices.innerHTML = '';

        checked.forEach((cb, i) => {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'ytd-merge-target';
            radio.value = cb.dataset.id || '';
            radio.dataset.name = cb.dataset.name;
            if (i === 0) radio.checked = true;
            radio.addEventListener('change', () => {
                if (!mergeNameDirty) $<HTMLInputElement>('ytd-merge-name').value = radio.dataset.name || '';
            });
            label.appendChild(radio);
            label.appendChild(document.createTextNode(cb.dataset.name || ''));
            choices.appendChild(label);
        });

        $<HTMLInputElement>('ytd-merge-name').value = checked[0].dataset.name || '';
        openModal('ytd-merge-modal');
    }

    async function confirmMerge(): Promise<void> {
        const errEl = $('ytd-merge-error');
        errEl.textContent = '';

        const targetRadio = $('ytd-merge-choices').querySelector<HTMLInputElement>('input[type=radio]:checked');
        if (!targetRadio) {
            errEl.textContent = 'Choose a dancer to keep.';
            return;
        }
        const targetId = targetRadio.value;
        const targetName = targetRadio.dataset.name;

        const sourceIds = Array.from(
            $('ytd-dancers-body').querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked'),
        )
            .map((cb) => cb.dataset.id || '')
            .filter((id) => id !== targetId);

        const typedName = $<HTMLInputElement>('ytd-merge-name').value.trim();
        const payload: { target_id: string; source_ids: string[]; new_display_name?: string } = {
            target_id: targetId,
            source_ids: sourceIds,
        };
        if (typedName && typedName !== targetName) payload.new_display_name = typedName;

        const res = await fetch('/api/stats/dancers/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let data: Partial<ApiErrorResponse>;
        try {
            data = (await res.json()) as Partial<ApiErrorResponse>;
        } catch {
            data = {};
        }
        if (!res.ok) {
            errEl.textContent = data.error || 'Failed to merge dancers.';
            return;
        }

        closeModal('ytd-merge-modal');
        await loadDancers();
        await loadStandings();
    }

    // ---- ingest (preview -> resolve -> commit) ----

    async function previewFromFile(): Promise<void> {
        const input = $<HTMLInputElement>('ytd-file-input');
        const file = input.files && input.files[0];
        if (!file) {
            alert('Choose a .json battle file first.');
            return;
        }
        const fd = new FormData();
        fd.append('battle_file', file);
        const res = await fetch('/api/stats/ingest/preview', { method: 'POST', body: fd });
        await handlePreviewResponse(res);
    }

    async function previewFromLiveBattle(): Promise<void> {
        const sid = localStorage.getItem('sessionId');
        if (!sid) {
            alert('No active battle found to publish.');
            return;
        }
        const res = await fetch('/api/stats/ingest/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid }),
        });
        await handlePreviewResponse(res);
    }

    async function handlePreviewResponse(res: Response): Promise<void> {
        let data: IngestPreviewResponse | Record<string, never>;
        try {
            data = (await res.json()) as IngestPreviewResponse;
        } catch {
            data = {};
        }
        if (!res.ok) {
            alert(('error' in data && data.error) || 'Failed to load battle for review.');
            return;
        }
        preview = data as IngestPreviewResponse;
        openIngestModal();
    }

    function openIngestModal(): void {
        if (!preview) return;
        $('ytd-ingest-error').textContent = '';
        $<HTMLInputElement>('ytd-battle-name').value = '';
        $<HTMLInputElement>('ytd-battle-date').value = new Date().toISOString().slice(0, 10);
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

            preview!.dancers.forEach((d) => {
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

    async function commitIngest(): Promise<void> {
        if (!preview) return;
        const name = $<HTMLInputElement>('ytd-battle-name').value.trim();
        const date = $<HTMLInputElement>('ytd-battle-date').value;
        const errEl = $('ytd-ingest-error');
        errEl.textContent = '';
        if (!name || !date) {
            errEl.textContent = 'Battle name and date are required.';
            return;
        }

        const resolutions: NameResolutions = {};
        $('ytd-resolve-body')
            .querySelectorAll('select')
            .forEach((sel) => {
                const seen = sel.dataset.name || '';
                if (sel.value) {
                    resolutions[seen] = { dancer_id: sel.value };
                } else {
                    const input = sel.parentElement && sel.parentElement.querySelector<HTMLInputElement>('input[type=text]');
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
        let data: Partial<ApiErrorResponse>;
        try {
            data = (await res.json()) as Partial<ApiErrorResponse>;
        } catch {
            data = {};
        }
        if (!res.ok) {
            errEl.textContent = data.error || 'Failed to publish battle.';
            return;
        }

        closeModal('ytd-ingest-modal');
        $<HTMLInputElement>('ytd-file-input').value = '';
        $('ytd-file-name').textContent = '';
        await loadYears();
        await loadStandings();
        await loadBattles();
        alert('Battle published to year-to-date stats.');
    }

    // ---- admin login ----

    async function submitLogin(): Promise<void> {
        const email = $<HTMLInputElement>('ytd-login-email').value.trim();
        const password = $<HTMLInputElement>('ytd-login-password').value;
        const errEl = $('ytd-login-error');
        errEl.textContent = '';
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        let data: AdminLoginResponse;
        try {
            data = (await res.json()) as AdminLoginResponse;
        } catch {
            data = {};
        }
        if (!res.ok) {
            errEl.textContent = data.error || 'Login failed.';
            return;
        }
        isAdmin = true;
        applyAdminUI(data.email ?? null);
        closeModal('ytd-login-modal');
        $<HTMLInputElement>('ytd-login-password').value = '';
        await loadBattles();
        await loadDancers();
    }

    async function logout(): Promise<void> {
        await fetch('/api/admin/logout', { method: 'POST' });
        isAdmin = false;
        applyAdminUI(null);
    }

    // ---- entry ----

    // Called by the router (js/router.ts) after it activates the stats screen.
    async function enterStats(): Promise<void> {
        await refreshAdmin();
        await loadYears();
        await loadStandings();
        await loadBattles();
        await loadDancers();
    }
    window.ytdOnEnterStats = enterStats;

    function escapeHtml(s: unknown): string {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const on = (id: string, evt: string, fn: (e: Event) => void) => {
            const el = $(id);
            if (el) el.addEventListener(evt, fn);
        };

        on('go-to-ytd', 'click', () => window.navigate!('/stats'));
        on('ytd-back-home', 'click', () => window.navigate!('/'));
        on('ytd-year-select', 'change', async () => {
            await loadStandings();
            await loadBattles();
        });

        // admin login modal
        on('ytd-admin-login-btn', 'click', () => {
            $('ytd-login-error').textContent = '';
            openModal('ytd-login-modal');
        });
        on('ytd-login-cancel', 'click', () => closeModal('ytd-login-modal'));
        on('ytd-login-submit', 'click', submitLogin);
        on('ytd-admin-logout-btn', 'click', logout);

        // ingest
        on('ytd-upload-btn', 'click', previewFromFile);
        on('publish-to-ytd', 'click', previewFromLiveBattle);
        on('ytd-ingest-cancel', 'click', () => closeModal('ytd-ingest-modal'));
        on('ytd-ingest-commit', 'click', commitIngest);

        // dancers (merge duplicates)
        const dancersBody = $('ytd-dancers-body');
        if (dancersBody) dancersBody.addEventListener('change', updateMergeButtonState);
        on('ytd-merge-selected-btn', 'click', openMergeModal);
        on('ytd-merge-cancel', 'click', () => closeModal('ytd-merge-modal'));
        on('ytd-merge-confirm', 'click', confirmMerge);
        on('ytd-merge-name', 'input', () => {
            mergeNameDirty = true;
        });

        // file name display
        on('ytd-file-input', 'change', () => {
            const files = $<HTMLInputElement>('ytd-file-input').files;
            $('ytd-file-name').textContent = files && files[0] ? files[0].name : '';
        });

        // reflect admin state on the results screen's publish button on first load
        refreshAdmin();
    });
})();
