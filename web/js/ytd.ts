/**
 * Year-to-Date stats page: public leaderboards + admin login + battle ingest.
 * Self-contained; reuses the existing `.screen`/`.active` show pattern and
 * shared button/table classes. Talks to /api/stats/* and /api/admin/* .
 */
import { downloadCanvasAsPng, drawCrown, fitCrownedNameToBox, fitNameToBox, getSocialTheme, isDarkTheme, roundRect, singleLineBaseline, SOCIAL_H, SOCIAL_W } from './socialImage';
import type { FitNameResult } from './socialImage';
import { showToast } from './toast';
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
    let currentStandings: Pick<YtdStandingsResponse, 'leads' | 'follows'> = { leads: [], follows: [] };

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

        currentStandings = data;
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

    // ---- top-8 social image export (Instagram feed post, 4:5) ----

    interface PlannedYtdRow {
        fit: FitNameResult;
        isTop: boolean;
        height: number;
    }
    interface YtdSectionPlan {
        rows: PlannedYtdRow[];
        totalHeight: number;
        nameFontSize: number;
        rankFontSize: number;
    }

    /** Draws one ranked "top 8" card (rank, name, points) — modeled on the battle-results
     * card chrome in web/js/results.ts's drawSection(), but without round badges since YTD
     * standings have no per-round data. Row heights/name line-wrapping/font sizes are
     * pre-computed by exportYtdImage() (via fitNameToBox) and passed in as `plan`, so every
     * row here just draws whatever it was told to. */
    function drawYtdCard(
        ctx: CanvasRenderingContext2D,
        theme: ReturnType<typeof getSocialTheme>,
        rows: YtdStandingRow[],
        label: string,
        cardX: number,
        cardW: number,
        startY: number,
        plan: YtdSectionPlan,
    ): void {
        const CARD_HEADER_H = 76;
        const CARD_PAD_BOTTOM = 16;
        const CARD_RADIUS = 20;
        const cardH = CARD_HEADER_H + plan.totalHeight + CARD_PAD_BOTTOM;

        roundRect(ctx, cardX, startY, cardW, cardH, CARD_RADIUS);
        ctx.fillStyle = theme.bgCard;
        ctx.fill();

        ctx.save();
        roundRect(ctx, cardX, startY, cardW, cardH, CARD_RADIUS);
        ctx.clip();
        ctx.fillStyle = theme.accent;
        ctx.fillRect(cardX, startY, cardW, CARD_HEADER_H);
        ctx.restore();

        roundRect(ctx, cardX, startY, cardW, cardH, CARD_RADIUS);
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 52px ${theme.fontDisplay}`;
        ctx.textAlign = 'left';
        ctx.fillText(label.toUpperCase(), cardX + 24, startY + CARD_HEADER_H - 18);

        const rowsStartY = startY + CARD_HEADER_H;
        const rowPad = cardX + 24;
        const rankW = 44;
        const pointsColX = cardX + cardW - 24;
        const nameAreaW = cardW - 48 - rankW - 140;
        let rowY = rowsStartY;

        rows.forEach((row, idx) => {
            const { fit, isTop, height: rowHeight } = plan.rows[idx];
            const isWrapped = fit.lines.length === 2;

            // Alternating row tint — scoped to this column's own bounds (not the full canvas
            // width), since there are now two side-by-side cards, not one full-width card.
            if (idx % 2 === 0) {
                ctx.fillStyle = theme.rowAlt;
                ctx.fillRect(cardX + 12, rowY + 1, cardW - 24, rowHeight - 1);
            }

            // Rank/points baselines: same formula as a normal row; centered instead for a
            // wrapped row, whose height doesn't match what that formula was tuned for. Rank
            // uses the proportional body font, not the mono font used for points: a monospace
            // "1." reserves a full fixed-width cell for the narrow "1" glyph, leaving a visible
            // gap before the period that a proportional font's natural kerning doesn't have.
            const rankBaseY = singleLineBaseline(rowY, rowHeight, plan.rankFontSize, isWrapped);
            ctx.fillStyle = theme.textMuted;
            ctx.font = `400 ${plan.rankFontSize}px ${theme.fontBody}`;
            ctx.textAlign = 'left';
            ctx.fillText((idx + 1) + '.', rowPad, rankBaseY);

            // Name (1 or 2 lines, per fitNameToBox) + crown — clipped to the row's full height
            // so a wrapped second line never spills into the points column.
            ctx.save();
            ctx.beginPath();
            ctx.rect(rowPad + rankW, rowY, nameAreaW, rowHeight);
            ctx.clip();
            ctx.fillStyle = isTop ? theme.textPrimary : theme.textSecondary;
            ctx.font = isTop ? `bold ${fit.fontSize}px ${theme.fontBody}` : `400 ${fit.fontSize}px ${theme.fontBody}`;

            let lastLineY: number;
            if (!isWrapped) {
                lastLineY = singleLineBaseline(rowY, rowHeight, fit.fontSize, false);
                ctx.fillText(fit.lines[0], rowPad + rankW, lastLineY);
            } else {
                const lineGap = fit.fontSize * 1.15;
                const line1Y = rowY + rowHeight / 2 - lineGap / 2 + fit.fontSize * 0.35;
                lastLineY = line1Y + lineGap;
                ctx.fillText(fit.lines[0], rowPad + rankW, line1Y);
                ctx.fillText(fit.lines[1], rowPad + rankW, lastLineY);
            }
            if (isTop) {
                const lastLineW = ctx.measureText(fit.lines[fit.lines.length - 1]).width;
                drawCrown(ctx, rowPad + rankW + lastLineW, lastLineY, fit.fontSize);
            }
            ctx.restore();

            const pointsBaseY = singleLineBaseline(rowY, rowHeight, plan.nameFontSize, isWrapped);
            ctx.textAlign = 'right';
            ctx.fillStyle = theme.textPrimary;
            ctx.font = `bold ${plan.nameFontSize}px ${theme.fontMono}`;
            ctx.fillText(`${row.total_points} pts`, pointsColX, pointsBaseY);

            rowY += rowHeight;
        });
    }

    async function exportYtdImage(): Promise<void> {
        const year = $<HTMLSelectElement>('ytd-year-select').value;
        const top8Leads = (currentStandings.leads || []).slice(0, 8);
        const top8Follows = (currentStandings.follows || []).slice(0, 8);
        if (top8Leads.length === 0 && top8Follows.length === 0) {
            showToast('No standings to export for this year.', 'error');
            return;
        }

        await document.fonts.ready;

        const W = SOCIAL_W;
        const H = SOCIAL_H;
        const PAD = 50;
        const theme = getSocialTheme(isDarkTheme());

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            showToast('Failed to generate image', 'error');
            return;
        }

        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = theme.accent;
        ctx.fillRect(0, 0, W, 12);

        // --- Header --- (shrunk so more vertical room goes to the cards below;
        // contentStartY is derived from what actually rendered, not a flat constant)
        const TITLE_SIZE = 44;
        const SUBTITLE_SIZE = 32;
        const HEADER_TOP = 20;
        const HEADER_LINE_GAP = 14;

        ctx.textAlign = 'center';
        ctx.fillStyle = theme.textPrimary;
        ctx.font = `bold ${TITLE_SIZE}px ${theme.fontDisplay}`;
        const titleY = HEADER_TOP + TITLE_SIZE * 0.8;
        ctx.fillText("Hustle n' Tussle", W / 2, titleY);

        ctx.fillStyle = theme.textSecondary;
        ctx.font = `400 ${SUBTITLE_SIZE}px ${theme.fontBody}`;
        const subtitleY = titleY + SUBTITLE_SIZE * 0.85 + HEADER_LINE_GAP;
        ctx.fillText(`Year-to-Date Stats — ${year}`, W / 2, subtitleY);

        const contentStartY = subtitleY + 32;

        // Layout: two side-by-side card columns (Leads | Follows), each sized independently
        // off its own row count so a shorter list doesn't leave dead space below its card.
        const CARD_HEADER_H = 76;
        const CARD_PAD_BOTTOM = 16;
        const COLUMN_GAP = 24;
        const FOOTER_H = 40;
        const ROW_INSET = 12; // matches the old single-card cardX = PAD - 12 inset
        const MIN_ROW_H = 44;
        const ABSOLUTE_MAX_ROW_H = 200; // hard ceiling regardless of the other column
        const ROW_H_CAP_RATIO = 1.6;    // a column can grow up to this many times the other column's own row height
        const availForRows = (H - FOOTER_H) - contentStartY - (CARD_HEADER_H + CARD_PAD_BOTTOM);

        // A column's row-height cap is relative to the *other* column, not a flat constant: two
        // even lists (e.g. 8 leads vs 8 follows) should both fill the available height with no
        // cap at all, while a lopsided pair still gets bounded so the short column doesn't
        // balloon into a single giant, visually-mismatched row.
        const naturalRowH = (count: number): number => count > 0 ? Math.floor(availForRows / count) : ABSOLUTE_MAX_ROW_H;
        const rowHCapFor = (otherCount: number): number =>
            Math.min(ABSOLUTE_MAX_ROW_H, Math.max(MIN_ROW_H, naturalRowH(otherCount)) * ROW_H_CAP_RATIO);

        const columnW = (W - 2 * (PAD - ROW_INSET) - COLUMN_GAP) / 2;
        const leadsCardX = PAD - ROW_INSET;
        const followsCardX = leadsCardX + columnW + COLUMN_GAP;

        const rankW = 44;
        const nameAreaW = columnW - 48 - rankW - 140;

        // A name that doesn't fit on one line even after shrinking wraps onto two lines
        // instead of being cut short (see fitNameToBox in socialImage.ts). A wrapped row
        // needs more vertical room than a normal row; WRAP_ROWS is how much more.
        const WRAP_ROWS = 1.7;

        const nameFontSizeFor = (rowH: number): number => Math.max(20, Math.min(40, rowH - 26));
        const rankFontSizeFor = (nameFontSize: number): number => Math.max(18, nameFontSize - 4);
        const minNameFontSizeFor = (nameFontSize: number): number => Math.max(18, Math.round(nameFontSize * 0.7));

        // Solves this column's row height independently of the other column: bigger rows for
        // a shorter list, no shared "sized off the larger list" dead space.
        const planColumn = (rows: YtdStandingRow[], rowHBaseline: number, rowHCap: number): YtdSectionPlan => {
            const buildAt = (rowH: number): YtdSectionPlan => {
                const nameFontSize = nameFontSizeFor(rowH);
                const rankFontSize = rankFontSizeFor(nameFontSize);
                const minNameFontSize = minNameFontSizeFor(nameFontSize);
                let totalHeight = 0;
                const planned = rows.map((row, idx) => {
                    const isTop = idx === 0;
                    const fit = isTop
                        ? fitCrownedNameToBox(ctx, row.display_name, nameAreaW, nameFontSize, minNameFontSize, theme.fontBody)
                        : fitNameToBox(ctx, row.display_name, nameAreaW, nameFontSize, minNameFontSize, theme.fontBody, false);
                    const height = fit.lines.length === 2 ? rowH * WRAP_ROWS : rowH;
                    totalHeight += height;
                    return { fit, isTop, height };
                });
                return { rows: planned, totalHeight, nameFontSize, rankFontSize };
            };

            let plan = buildAt(rowHBaseline);
            const effectiveUnits = plan.rows.reduce((sum, r) => sum + r.height / rowHBaseline, 0);
            if (rows.length > 0 && effectiveUnits > rows.length) {
                const rowHFinal = Math.max(MIN_ROW_H, Math.min(rowHCap, Math.floor(availForRows / effectiveUnits)));
                plan = buildAt(rowHFinal);
            }
            return plan;
        };

        const leadsRowHCap = rowHCapFor(top8Follows.length);
        const followsRowHCap = rowHCapFor(top8Leads.length);
        const leadsRowHBaseline = top8Leads.length > 0
            ? Math.max(MIN_ROW_H, Math.min(leadsRowHCap, naturalRowH(top8Leads.length)))
            : leadsRowHCap;
        const followsRowHBaseline = top8Follows.length > 0
            ? Math.max(MIN_ROW_H, Math.min(followsRowHCap, naturalRowH(top8Follows.length)))
            : followsRowHCap;

        const leadsPlan = planColumn(top8Leads, leadsRowHBaseline, leadsRowHCap);
        const followsPlan = planColumn(top8Follows, followsRowHBaseline, followsRowHCap);

        drawYtdCard(ctx, theme, top8Leads, 'Leads', leadsCardX, columnW, contentStartY, leadsPlan);
        drawYtdCard(ctx, theme, top8Follows, 'Follows', followsCardX, columnW, contentStartY, followsPlan);

        downloadCanvasAsPng(canvas, `hnt-ytd-${year}-top8.png`, () => showToast('Failed to generate image', 'error'));
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
            const image = document.createElement('button');
            image.className = 'btn secondary small';
            image.textContent = 'Instagram Post';
            image.addEventListener('click', () => exportBattleImage(b.id));
            actions.appendChild(image);
            const del = document.createElement('button');
            del.className = 'btn secondary small';
            del.textContent = 'Delete';
            del.addEventListener('click', () => deleteBattle(b.id, b.name));
            actions.appendChild(del);
            tr.appendChild(actions);
            body.appendChild(tr);
        });
    }

    async function exportBattleImage(id: string): Promise<void> {
        let battle: BattleDetail;
        try {
            const res = await fetch(`/api/stats/battles/${id}`);
            if (!res.ok) throw new Error();
            battle = (await res.json()) as BattleDetail;
        } catch {
            alert('Failed to load battle.');
            return;
        }
        if (!window.exportBattleResultsImage) {
            alert('Image export is unavailable.');
            return;
        }
        await window.exportBattleResultsImage(battle.raw_data, { name: battle.name, battle_date: battle.battle_date || '' });
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
                if (!meta) throw new Error('Battle name/date missing.'); // showMetaFields is true, so meta is always set
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

    // ---- admin: dancers (rename, merge duplicates) ----

    let mergeNameDirty = false; // true once the admin has typed into #ytd-merge-name themselves
    let lastDancers: DancersResponse['dancers'] = [];
    let editingDancerId: string | null = null; // dancer row currently showing the rename input

    async function loadDancers(): Promise<void> {
        if (!isAdmin) return;
        try {
            const res = await fetch('/api/stats/dancers');
            lastDancers = ((await res.json()) as DancersResponse).dancers || [];
        } catch {
            lastDancers = [];
        }
        editingDancerId = null;
        renderDancerRows();
    }

    function renderDancerRows(): void {
        const body = $('ytd-dancers-body');
        body.innerHTML = '';
        lastDancers.forEach((d) => {
            const tr = document.createElement('tr');
            const checkCell = document.createElement('td');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.dataset.id = d.id;
            check.dataset.name = d.display_name;
            checkCell.appendChild(check);
            tr.appendChild(checkCell);

            const nameCell = document.createElement('td');
            const actionsCell = document.createElement('td');

            if (editingDancerId === d.id) {
                const input = document.createElement('input');
                input.type = 'text';
                input.value = d.display_name;
                nameCell.appendChild(input);
                const errorEl = document.createElement('div');
                errorEl.className = 'error-message';
                nameCell.appendChild(errorEl);

                const saveBtn = document.createElement('button');
                saveBtn.className = 'btn primary small';
                saveBtn.textContent = 'Save';
                saveBtn.addEventListener('click', () => void saveDancerRename(d.id, input.value.trim(), errorEl));
                actionsCell.appendChild(saveBtn);

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn secondary small';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', () => {
                    editingDancerId = null;
                    renderDancerRows();
                });
                actionsCell.appendChild(cancelBtn);

                input.focus();
                input.select();
            } else {
                nameCell.textContent = d.display_name;
                const renameBtn = document.createElement('button');
                renameBtn.className = 'btn secondary small';
                renameBtn.textContent = 'Rename';
                renameBtn.addEventListener('click', () => {
                    editingDancerId = d.id;
                    renderDancerRows();
                });
                actionsCell.appendChild(renameBtn);
            }
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

            tr.appendChild(actionsCell);
            body.appendChild(tr);
        });
        updateMergeButtonState();
    }

    async function saveDancerRename(id: string, newName: string, errorEl: HTMLElement): Promise<void> {
        errorEl.textContent = '';
        if (!newName) {
            errorEl.textContent = 'Name is required.';
            return;
        }
        const res = await fetch(`/api/stats/dancers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: newName }),
        });
        let data: Partial<ApiErrorResponse>;
        try {
            data = (await res.json()) as Partial<ApiErrorResponse>;
        } catch {
            data = {};
        }
        if (!res.ok) {
            errorEl.textContent = data.error || 'Failed to rename dancer.';
            return;
        }
        editingDancerId = null;
        await loadDancers();
        await loadStandings();
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
        on('ytd-export-image-btn', 'click', () => void exportYtdImage());

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
