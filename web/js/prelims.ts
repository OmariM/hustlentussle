/**
 * Prelims screen. Two modes share the same #prelims-screen:
 *
 * - Operator (/prelims/<id>): a pairing table (which lead is with which follow right
 *   now) plus a per-heat Start button. The operator presses Start once dancers are in
 *   place; the client then drives the 45s rotation timer, pushing each rotation change
 *   to the server so the spectator display can mirror it. After the last heat, the
 *   operator picks who advances (selection checklist) and commits, which builds the
 *   main battle (POST /api/prelims/commit_selection) and routes to /battle/<newId>.
 *
 * - Display (/prelims/<id>?mode=display): the rotating-circle visualization for
 *   contestants/spectators — a circle of follows with leads rotating clockwise. It
 *   polls /api/prelims/state (~1s) and renders the current heat/rotation + countdown.
 *
 * Rotation/timer state (current_rotation_index, running, rotation_started_at) lives on
 * the server so both views stay in sync and a reload resumes cleanly.
 */
import { apiFetch, postJson } from './api';
import { showToast } from './toast';
import type { PrelimStateResponse } from './types';

interface CommitResponse {
    session_id: string;
    contestant_judges_warning?: string;
}

let state: PrelimStateResponse | null = null;
let prelimId: string | null = null;
let displayMode = false;
let heatIndex = 0;
let rotationIndex = 0;
let remaining = 0;
let paused = false; // operator paused the countdown (mirrors server state)
let opTimer: number | null = null; // operator's local 1s rotation countdown
let pollTimer: number | null = null; // display's state poll
let circleHeatKey = -1; // which heat the circle DOM is currently built for

const leadPicks = new Set<string>();
const followPicks = new Set<string>();

function $(id: string): HTMLElement | null {
    return document.getElementById(id);
}

function setVisible(id: string, visible: boolean): void {
    const el = $(id);
    if (el) el.style.display = visible ? '' : 'none';
}

// The bib number a dancer wears (empty string if none assigned).
function bibOf(role: 'lead' | 'follow', name: string): string {
    if (!state) return '';
    const map = role === 'lead' ? state.numbers.leads : state.numbers.follows;
    return (map && map[name]) || '';
}

// Inline "<bib> name" HTML for the display circle (both parts escaped).
function bibNameHtml(role: 'lead' | 'follow', name: string): string {
    const bib = bibOf(role, name);
    const badge = bib ? `<span class="seat-bib">${escapeHtml(bib)}</span>` : '';
    return `${badge}${escapeHtml(name)}`;
}

function stopTimers(): void {
    if (opTimer !== null) {
        window.clearInterval(opTimer);
        opTimer = null;
    }
    if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

async function hydratePrelimRoute(id: string): Promise<void> {
    if (!id) {
        window.navigate?.('/', { replace: true });
        return;
    }
    stopTimers();
    prelimId = id;
    displayMode = new URLSearchParams(window.location.search).get('mode') === 'display';

    try {
        state = await apiFetch<PrelimStateResponse>(`/api/prelims/state?session_id=${encodeURIComponent(id)}`);
    } catch {
        showToast('That prelim was not found or has expired.', 'error');
        window.navigate?.('/', { replace: true });
        return;
    }

    heatIndex = Math.min(state.current_heat_index || 0, Math.max(0, state.num_heats - 1));
    rotationIndex = state.current_rotation_index || 0;
    circleHeatKey = -1;
    leadPicks.clear();
    followPicks.clear();
    wireControlsOnce();
    updateCounters();

    if (displayMode) {
        enterDisplay();
    } else if (state.complete) {
        // Already committed elsewhere — nothing to do here.
        showView('operator');
        const msg = $('prelims-op-message');
        if (msg) msg.textContent = 'This prelim has already finished.';
    } else {
        // The roster is built on the dedicated setup screen, so we land on the operator
        // view (the prelim arrives already confirmed).
        enterOperator();
    }
}

function showView(which: 'operator' | 'display' | 'selection'): void {
    setVisible('prelims-operator-view', which === 'operator');
    setVisible('prelims-display-view', which === 'display');
    setVisible('prelims-selection', which === 'selection');
}

// During a break/intermission the dancers are moving to their NEXT partner, so the
// pairing table and circle show the upcoming rotation.
function visualRotationIndex(): number {
    if (state && (state.phase === 'break' || state.phase === 'intermission')) {
        return Math.min(rotationIndex + 1, state.config.num_rotations - 1);
    }
    return rotationIndex;
}

function updateCounters(): void {
    if (!state) return;
    const set = (id: string, v: number | string) => {
        const el = $(id);
        if (el) el.textContent = String(v);
    };
    set('prelims-heat-num', heatIndex + 1);
    set('prelims-heat-total', state.num_heats);
    set('prelims-rotation-num', visualRotationIndex() + 1);
    set('prelims-rotation-total', state.config.num_rotations);
}

// ---- operator view --------------------------------------------------------

function enterOperator(): void {
    if (!state) return;
    showView('operator');
    syncOperatorFromState();
}

// Mirror module state from the server snapshot and (re)start or stop the local
// countdown depending on the phase. A break/dancing phase runs the countdown; an
// intermission or an idle/finished heat holds it.
function syncOperatorFromState(): void {
    if (!state) return;
    heatIndex = state.current_heat_index;
    rotationIndex = state.current_rotation_index;
    paused = state.paused;
    if (state.running && state.phase !== 'intermission') {
        remaining = state.rotation_remaining || phaseFullSeconds();
        startOpTimer();
    } else {
        stopOpTimer();
    }
    renderOperator();
}

function phaseFullSeconds(): number {
    if (!state) return 0;
    return state.phase === 'break' ? state.config.break_seconds : state.config.rotation_seconds;
}

function stopOpTimer(): void {
    if (opTimer !== null) {
        window.clearInterval(opTimer);
        opTimer = null;
    }
}

function nameCell(role: 'lead' | 'follow', name: string): HTMLElement {
    const cell = document.createElement('td');
    const bib = bibOf(role, name);
    if (bib) {
        const badge = document.createElement('span');
        badge.className = 'prelims-bib';
        badge.textContent = bib;
        cell.appendChild(badge);
    }
    const label = document.createElement('span');
    label.textContent = name;
    cell.appendChild(label);
    return cell;
}

function buildPairingTable(): void {
    const body = $('prelims-pairing-body');
    if (!body || !state) return;
    body.innerHTML = '';
    const heat = state.heats[heatIndex];
    const pairs = (heat && heat.rotations[visualRotationIndex()]) || [];
    pairs.forEach((pair, i) => {
        const tr = document.createElement('tr');
        const idx = document.createElement('td');
        idx.textContent = String(i + 1);
        tr.appendChild(idx);
        tr.appendChild(nameCell('lead', pair[0]));
        tr.appendChild(nameCell('follow', pair[1]));
        body.appendChild(tr);
    });
}

function renderOperator(): void {
    if (!state) return;
    updateCounters();
    buildPairingTable();

    const timer = $('prelims-op-timer');
    const msg = $('prelims-op-message');
    const startBtn = $('prelims-start-heat') as HTMLButtonElement | null;
    const pauseBtn = $('prelims-pause');
    const gotoBtn = $('prelims-goto-selection');

    const dancing = !!state.running && state.phase === 'dancing';
    const intermission = !!state.running && state.phase === 'intermission';
    // Pause/skip apply to a live rotation; "Start next rotations" resumes the intermission.
    setVisible('prelims-pause', dancing);
    setVisible('prelims-skip-rotation', dancing);
    setVisible('prelims-start-next', intermission);

    if (state.heats_complete) {
        if (startBtn) startBtn.style.display = 'none';
        if (timer) timer.textContent = '✓';
        if (msg) msg.textContent = 'All heats complete — go to selection.';
        // Make the selection button the prominent action.
        if (gotoBtn) {
            gotoBtn.classList.add('primary');
            gotoBtn.classList.remove('secondary');
            gotoBtn.textContent = 'Go to selection';
        }
    } else if (intermission) {
        if (startBtn) startBtn.style.display = 'none';
        if (timer) {
            timer.textContent = '🎵';
            timer.classList.remove('paused');
        }
        if (msg) msg.textContent = 'Music change — press “Start next rotations” when the new song is ready.';
    } else if (state.running) {
        if (startBtn) startBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.textContent = paused ? 'Resume' : 'Pause';
        if (timer) {
            timer.textContent = String(remaining);
            timer.classList.toggle('paused', paused);
        }
        if (msg) {
            if (paused) {
                msg.textContent = 'Paused.';
            } else if (state.phase === 'break') {
                msg.textContent = `Switch partners — rotation ${visualRotationIndex() + 1} in ${remaining}s.`;
            } else {
                msg.textContent = `Heat ${heatIndex + 1} in progress — rotation ${rotationIndex + 1} of ${state.config.num_rotations}.`;
            }
        }
    } else {
        if (startBtn) {
            startBtn.style.display = '';
            startBtn.disabled = false;
            startBtn.textContent = `Start heat ${heatIndex + 1}`;
        }
        if (timer) {
            timer.textContent = String(state.config.rotation_seconds);
            timer.classList.remove('paused');
        }
        if (msg) msg.textContent = 'Ready — press Start when the dancers are in place.';
    }
}

function startOpTimer(): void {
    if (opTimer !== null) window.clearInterval(opTimer);
    opTimer = window.setInterval(() => {
        if (paused) return; // frozen while the operator has paused
        remaining -= 1;
        if (remaining <= 0) {
            void nextPhaseOp();
        } else {
            const timer = $('prelims-op-timer');
            if (timer) timer.textContent = String(remaining);
        }
    }, 1000);
}

async function startHeat(): Promise<void> {
    if (!prelimId) return;
    try {
        state = await postJson<PrelimStateResponse>('/api/prelims/start_heat', { session_id: prelimId });
    } catch {
        showToast('Could not start the heat.', 'error');
        return;
    }
    syncOperatorFromState();
}

async function togglePauseOp(): Promise<void> {
    if (!prelimId) return;
    try {
        state = await postJson<PrelimStateResponse>('/api/prelims/toggle_pause', { session_id: prelimId });
    } catch {
        showToast('Could not pause the timer.', 'error');
        return;
    }
    paused = state.paused;
    remaining = state.rotation_remaining || remaining;
    renderOperator();
}

// Advance the phase machine: rotation end -> break/intermission/next rotation, or the
// operator's skip-rotation / "start next rotations" (all hit the same endpoint).
async function nextPhaseOp(): Promise<void> {
    if (!prelimId) return;
    try {
        state = await postJson<PrelimStateResponse>('/api/prelims/next_phase', { session_id: prelimId });
    } catch {
        showToast('Could not advance the rotation.', 'error');
        return;
    }
    syncOperatorFromState();
}

// ---- display view (spectators) --------------------------------------------

let displayResizeWired = false;

function enterDisplay(): void {
    showView('display');
    if (!displayResizeWired) {
        // The oval is sized to the viewport, so rebuild it on resize.
        window.addEventListener('resize', () => {
            if (!displayMode || !state) return;
            circleHeatKey = -1; // force a rebuild at the new size
            renderDisplay(state);
        });
        displayResizeWired = true;
    }
    if (state) renderDisplay(state);
    pollTimer = window.setInterval(async () => {
        if (!prelimId) return;
        try {
            const next = await apiFetch<PrelimStateResponse>(
                `/api/prelims/state?session_id=${encodeURIComponent(prelimId)}`,
            );
            renderDisplay(next);
        } catch {
            /* transient — keep polling */
        }
    }, 1000);
}

// Ellipse of seat positions filling a width×height stage (a horizontal oval when the
// stage is wider than tall). Padding leaves room for the (untruncated) name labels.
function seatPositions(k: number, width: number, height: number): Array<{ x: number; y: number }> {
    const cx = width / 2;
    const cy = height / 2;
    const rx = Math.max(40, cx - Math.min(170, width * 0.14));
    const ry = Math.max(40, cy - Math.min(90, height * 0.16));
    const positions: Array<{ x: number; y: number }> = [];
    for (let j = 0; j < k; j++) {
        const theta = -Math.PI / 2 + (j * 2 * Math.PI) / k;
        positions.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
    }
    return positions;
}

function stageSize(): { width: number; height: number } {
    const wrap = $('prelims-stage-wrap');
    return { width: wrap?.clientWidth || 800, height: wrap?.clientHeight || 400 };
}

function buildCircle(): void {
    if (!state) return;
    const circle = $('prelims-circle');
    const wrap = $('prelims-stage-wrap');
    if (!circle || !wrap) return;
    circle.innerHTML = '';

    const heat = state.heats[heatIndex];
    if (!heat) return;
    const k = heat.leads.length;
    const { width, height } = stageSize();
    const seats = seatPositions(k, width, height);
    const cx = width / 2;
    const cy = height / 2;

    for (let j = 0; j < k; j++) {
        const seat = document.createElement('div');
        seat.className = 'prelims-seat prelims-follow-seat';
        seat.style.left = `${seats[j].x}px`;
        seat.style.top = `${seats[j].y}px`;
        seat.innerHTML = `<span class="seat-follow" title="${escapeAttr(heat.follows[j])}">${bibNameHtml('follow', heat.follows[j])}</span>`;
        circle.appendChild(seat);
    }

    for (let i = 0; i < k; i++) {
        const chip = document.createElement('div');
        chip.className = 'prelims-seat prelims-lead-chip';
        chip.dataset.leadIndex = String(i);
        chip.innerHTML = `<span class="seat-lead" title="${escapeAttr(heat.leads[i])}">${bibNameHtml('lead', heat.leads[i])}</span>`;
        chip.style.left = `${cx}px`;
        chip.style.top = `${cy}px`;
        circle.appendChild(chip);
    }
    circleHeatKey = heatIndex;
}

function positionChips(): void {
    if (!state) return;
    const heat = state.heats[heatIndex];
    if (!heat) return;
    const k = heat.leads.length;
    const { width, height } = stageSize();
    const seats = seatPositions(k, width, height);

    // Lead i dances with follow (i + rotationIndex) % k. Park the lead pill a fixed
    // distance directly BELOW its follow (not radially inward): a vertical gap keeps
    // the pills from overlapping at every angle — radial-inward collapses to zero
    // vertical separation at the left/right of the ellipse, where the pills are widest.
    const leadDrop = Math.max(42, height * 0.1);
    const vis = visualRotationIndex();
    document.querySelectorAll<HTMLElement>('.prelims-lead-chip').forEach((chip) => {
        const i = Number(chip.dataset.leadIndex);
        const seat = seats[(i + vis) % k];
        chip.style.left = `${seat.x}px`;
        chip.style.top = `${seat.y + leadDrop}px`;
    });
}

function renderDisplay(next: PrelimStateResponse): void {
    state = next;
    heatIndex = next.current_heat_index;
    rotationIndex = next.current_rotation_index;

    const stage = $('prelims-stage-wrap');
    const status = $('prelims-display-status');
    const selecting = $('prelims-display-selecting');
    const selectingText = $('prelims-selecting-text');

    // Once the heats are done, swap the circle for a "selecting…" screen while the
    // operator picks who advances, then a final "selected!" once committed.
    if (next.heats_complete || next.complete) {
        if (stage) stage.style.display = 'none';
        if (status) status.style.display = 'none';
        if (selecting) selecting.style.display = '';
        if (selectingText) selectingText.textContent = next.complete ? 'Competitors selected!' : 'Selecting competitors…';
        if (next.complete && pollTimer !== null) {
            window.clearInterval(pollTimer); // done — stop polling
            pollTimer = null;
        }
        return;
    }

    if (stage) stage.style.display = '';
    if (status) status.style.display = '';
    if (selecting) selecting.style.display = 'none';

    updateCounters();
    if (circleHeatKey !== heatIndex) buildCircle();
    positionChips();

    const timer = $('prelims-timer');
    if (next.running && next.phase === 'intermission') {
        // Music change — hold for the operator.
        if (timer) {
            timer.textContent = '🎵';
            timer.classList.remove('paused');
        }
        if (status) status.textContent = 'Music change — get ready to switch partners';
    } else if (next.running && next.phase === 'break') {
        if (timer) {
            timer.textContent = String(next.rotation_remaining);
            timer.classList.remove('paused');
        }
        if (status) status.textContent = `Switch partners — rotation ${visualRotationIndex() + 1} of ${next.config.num_rotations}`;
    } else if (next.running) {
        if (timer) {
            timer.textContent = String(next.rotation_remaining);
            timer.classList.toggle('paused', next.paused);
        }
        if (status) {
            status.textContent = next.paused
                ? 'Paused'
                : `Heat ${heatIndex + 1} — Rotation ${rotationIndex + 1} of ${next.config.num_rotations}`;
        }
    } else {
        if (timer) {
            timer.textContent = String(next.config.rotation_seconds);
            timer.classList.remove('paused');
        }
        if (status) status.textContent = `Get ready — Heat ${heatIndex + 1}`;
    }
}

// ---- selection ------------------------------------------------------------

function showSelection(): void {
    stopTimers();
    if (!state) return;
    showView('selection');

    buildChoices('lead', state.eligible.leads, state.config.lead_needs_cut, state.config.lead_spots, leadPicks);
    buildChoices('follow', state.eligible.follows, state.config.follow_needs_cut, state.config.follow_spots, followPicks);
    updateSelectionState();
}

function buildChoices(
    role: 'lead' | 'follow',
    eligible: string[],
    needsCut: boolean,
    spots: number,
    picks: Set<string>,
): void {
    const container = $(`prelims-${role}-choices`);
    if (!container) return;
    container.innerHTML = '';
    picks.clear();

    for (const name of eligible) {
        // A plain <div> (not <label>) so the checkbox is a passive indicator and the
        // single click handler is the only thing that toggles selection.
        const choice = document.createElement('div');
        choice.className = 'prelims-choice';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = name;
        cb.tabIndex = -1;
        const bib = bibOf(role, name);
        const badge = document.createElement('span');
        badge.className = 'prelims-bib';
        badge.textContent = bib;
        const label = document.createElement('span');
        label.textContent = name;

        if (!needsCut) {
            // Auto-advance: everyone advances, locked on.
            cb.checked = true;
            cb.disabled = true;
            choice.classList.add('locked', 'selected');
        } else {
            choice.addEventListener('click', () => {
                const willSelect = !picks.has(name);
                if (willSelect && picks.size >= spots) {
                    showToast(`You can only advance ${spots} ${role}(s).`, 'info');
                    return;
                }
                if (willSelect) picks.add(name);
                else picks.delete(name);
                cb.checked = willSelect;
                choice.classList.toggle('selected', willSelect);
                updateSelectionState();
            });
        }

        choice.appendChild(cb);
        if (bib) choice.appendChild(badge);
        choice.appendChild(label);
        container.appendChild(choice);
    }
}

function updateSelectionState(): void {
    if (!state) return;
    const leadCounter = $('prelims-lead-counter');
    const followCounter = $('prelims-follow-counter');
    const cfg = state.config;

    if (leadCounter) {
        leadCounter.textContent = cfg.lead_needs_cut
            ? `${leadPicks.size} / ${cfg.lead_spots}`
            : `all ${state.eligible.leads.length} advance`;
    }
    if (followCounter) {
        followCounter.textContent = cfg.follow_needs_cut
            ? `${followPicks.size} / ${cfg.follow_spots}`
            : `all ${state.eligible.follows.length} advance`;
    }

    const leadOk = !cfg.lead_needs_cut || leadPicks.size === cfg.lead_spots;
    const followOk = !cfg.follow_needs_cut || followPicks.size === cfg.follow_spots;
    const confirm = $('prelims-confirm-selection') as HTMLButtonElement | null;
    if (confirm) confirm.disabled = !(leadOk && followOk);
}

async function confirmSelection(): Promise<void> {
    if (!state || !prelimId) return;
    const btn = $('prelims-confirm-selection') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
        const data = await postJson<CommitResponse>('/api/prelims/commit_selection', {
            session_id: prelimId,
            // Auto-advance roles send [] and the server fills in the full eligible set.
            lead_selections: state.config.lead_needs_cut ? Array.from(leadPicks) : [],
            follow_selections: state.config.follow_needs_cut ? Array.from(followPicks) : [],
        });
        window.navigate?.('/battle/' + encodeURIComponent(data.session_id));
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to advance to the battle.';
        showToast(msg, 'error');
        if (btn) btn.disabled = false;
    }
}

// ---- competitor numbers editor --------------------------------------------

function validateEditor(): boolean {
    return validateNumbers('prelims-numbers-leads', 'prelims-numbers-follows', 'prelims-numbers-save');
}

function openNumbersEditor(): void {
    if (!state) return;
    buildNumberRows('lead', 'prelims-numbers-leads');
    buildNumberRows('follow', 'prelims-numbers-follows');
    setVisible('prelims-numbers-editor', true);
    validateEditor();
}

function buildNumberRows(role: 'lead' | 'follow', containerId: string): void {
    const container = $(containerId);
    if (!container || !state) return;
    container.innerHTML = '';
    const map = role === 'lead' ? state.numbers.leads : state.numbers.follows;
    for (const name of Object.keys(map)) {
        const row = document.createElement('div');
        row.className = 'prelims-number-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.className = 'prelims-number-input';
        input.value = map[name];
        input.dataset.name = name;
        input.addEventListener('input', validateEditor);
        const label = document.createElement('span');
        label.textContent = name;
        row.appendChild(input);
        row.appendChild(label);
        container.appendChild(row);
    }
}

// Highlight duplicate bib numbers across the two containers and disable the action
// button until they're resolved. Returns true when all numbers are unique.
function validateNumbers(leadContainerId: string, followContainerId: string, buttonId: string): boolean {
    const inputs = [
        ...Array.from($(leadContainerId)?.querySelectorAll<HTMLInputElement>('.prelims-number-input') || []),
        ...Array.from($(followContainerId)?.querySelectorAll<HTMLInputElement>('.prelims-number-input') || []),
    ];
    const counts: Record<string, number> = {};
    for (const inp of inputs) {
        const v = inp.value.trim();
        if (v) counts[v] = (counts[v] || 0) + 1;
    }
    let ok = true;
    for (const inp of inputs) {
        const v = inp.value.trim();
        const dup = !!v && counts[v] > 1;
        inp.classList.toggle('dup', dup);
        if (dup) ok = false;
    }
    const btn = $(buttonId) as HTMLButtonElement | null;
    if (btn) btn.disabled = !ok;
    return ok;
}

function collectNumbers(containerId: string): Record<string, string> {
    const out: Record<string, string> = {};
    $(containerId)
        ?.querySelectorAll<HTMLInputElement>('.prelims-number-input')
        .forEach((inp) => {
            if (inp.dataset.name) out[inp.dataset.name] = inp.value;
        });
    return out;
}

async function saveNumbers(): Promise<void> {
    if (!prelimId) return;
    if (!validateEditor()) {
        showToast('Each dancer needs a unique bib number.', 'error');
        return;
    }
    try {
        state = await postJson<PrelimStateResponse>('/api/prelims/set_numbers', {
            session_id: prelimId,
            lead_numbers: collectNumbers('prelims-numbers-leads'),
            follow_numbers: collectNumbers('prelims-numbers-follows'),
        });
    } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not save the numbers.', 'error');
        return;
    }
    setVisible('prelims-numbers-editor', false);
    // Re-render so the new bibs show immediately (the display picks them up on poll).
    circleHeatKey = -1;
    if (displayMode) renderDisplay(state);
    else renderOperator();
    showToast('Numbers saved.', 'success');
}

// ---- controls -------------------------------------------------------------

let controlsWired = false;

function wireControlsOnce(): void {
    if (controlsWired) return;
    controlsWired = true;

    $('prelims-start-heat')?.addEventListener('click', () => {
        void startHeat();
    });
    $('prelims-pause')?.addEventListener('click', () => {
        void togglePauseOp();
    });
    $('prelims-skip-rotation')?.addEventListener('click', () => {
        void nextPhaseOp();
    });
    $('prelims-start-next')?.addEventListener('click', () => {
        void nextPhaseOp();
    });
    $('prelims-edit-numbers')?.addEventListener('click', () => openNumbersEditor());
    $('prelims-numbers-save')?.addEventListener('click', () => {
        void saveNumbers();
    });
    $('prelims-numbers-cancel')?.addEventListener('click', () => setVisible('prelims-numbers-editor', false));
    $('prelims-open-display')?.addEventListener('click', () => {
        if (prelimId) window.open('/prelims/' + encodeURIComponent(prelimId) + '?mode=display', '_blank');
    });
    $('prelims-goto-selection')?.addEventListener('click', () => showSelection());
    $('prelims-confirm-selection')?.addEventListener('click', () => {
        void confirmSelection();
    });
    $('prelims-back-home')?.addEventListener('click', () => {
        stopTimers();
        window.navigate?.('/');
    });
}

// ---- small html helpers ---------------------------------------------------

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string;
    });
}

function escapeAttr(s: string): string {
    return escapeHtml(s);
}

window.hydratePrelimRoute = hydratePrelimRoute;
