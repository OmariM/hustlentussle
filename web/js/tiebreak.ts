/**
 * Tie-break flow: the modal state machine that resolves end-of-battle ties
 * (partner selection → two sub-rounds → final vote → results).
 *
 * All tie-break state is module-private; app.js enters through
 * startTiebreakFlow() (from /api/end_game when tiebreak_required) after
 * providing initTiebreakDeps() with session/order accessors and the
 * results renderer.
 */

import { postJson } from './api';
import { showToast } from './toast';
import type {
    ResultsResponse,
    TiebreakStartData,
    TiebreakSetPartnersResponse,
    TiebreakAdvanceResponse,
    TiebreakVoteResponse,
} from './types';

let tiebreakActive = false;
let tiebreakLeadNeeded = false;
let tiebreakFollowNeeded = false;
let tiedLeads: string[] = [];
let tiedFollows: string[] = [];
let tiebreakAllLeads: string[] = [];
let tiebreakAllFollows: string[] = [];
let tiebreakSubRound = 0;
let tiebreakSR1Pairings: Array<[string, string]> = [];
let tiebreakSR2Pairings: Array<[string, string]> = [];
let tiebreakLeadVotes: Record<string, string> = {};
let tiebreakFollowVotes: Record<string, string> = {};
let tiebreakGuestJudges: string[] = [];
let tiebreakContestantJudges: string[] = [];
let tiebreakResolvedLeadWinner: string | null = null;
let tiebreakResolvedFollowWinner: string | null = null;

interface TiebreakDeps {
    getSessionId: () => string | null;
    getInitialOrder: () => { leads: string[]; follows: string[] };
    showResults: (data: ResultsResponse) => void;
}

let deps: TiebreakDeps | null = null;

export function initTiebreakDeps(d: TiebreakDeps): void {
    deps = d;
}

export function isTiebreakActive(): boolean {
    return tiebreakActive;
}

export function startTiebreakFlow(data: TiebreakStartData): void {
    tiebreakActive = true;
    tiebreakLeadNeeded = data.lead_needed;
    tiebreakFollowNeeded = data.follow_needed;
    tiedLeads = data.tied_leads || [];
    tiedFollows = data.tied_follows || [];
    tiebreakAllLeads = data.all_leads || [];
    tiebreakAllFollows = data.all_follows || [];
    tiebreakSubRound = 0;
    tiebreakSR1Pairings = [];
    tiebreakSR2Pairings = [];
    tiebreakLeadVotes = {};
    tiebreakFollowVotes = {};
    tiebreakGuestJudges = data.guest_judges || [];
    tiebreakContestantJudges = data.contestant_judges || [];
    tiebreakResolvedLeadWinner = null;
    tiebreakResolvedFollowWinner = null;
    renderTiebreakPhase0();
    document.getElementById('tiebreak-modal')?.classList.remove('hidden');
}

function modalParts(): { title: HTMLElement; body: HTMLElement; footer: HTMLElement } | null {
    const title = document.getElementById('tiebreak-modal-title');
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');
    if (!title || !body || !footer) return null;
    return { title, body, footer };
}

function renderTiebreakPhase0(): void {
    const parts = modalParts();
    if (!parts) return;
    parts.title.textContent = 'Tie-Break: Partner Selection';
    const { body, footer } = parts;

    let html = '<p class="tiebreak-subtitle">Tied dancers must each choose a partner for the tie-break round.</p>';

    if (tiebreakLeadNeeded) {
        html += '<div class="tiebreak-partner-grid" id="tiebreak-lead-partner-grid">';
        tiedLeads.forEach(lead => {
            const safeId = lead.replace(/\s+/g, '-').toLowerCase();
            html += `<div class="tiebreak-partner-row">
                <span class="tiebreak-lead-name contestant lead">${lead}</span>
                <span class="tiebreak-arrow">→</span>
                <select class="tiebreak-partner-select" data-role="lead" data-name="${lead}" id="tiebreak-lead-select-${safeId}">
                    <option value="">Select a follow…</option>
                    ${tiebreakAllFollows.map(f => `<option value="${f}">${f}</option>`).join('')}
                </select>
            </div>`;
        });
        html += '</div>';
    }

    if (tiebreakFollowNeeded) {
        if (tiebreakLeadNeeded) html += '<hr class="tiebreak-section-divider">';
        html += '<div class="tiebreak-partner-grid" id="tiebreak-follow-partner-grid">';
        tiedFollows.forEach(follow => {
            const safeId = follow.replace(/\s+/g, '-').toLowerCase();
            html += `<div class="tiebreak-partner-row">
                <span class="tiebreak-follow-name contestant follow">${follow}</span>
                <span class="tiebreak-arrow">→</span>
                <select class="tiebreak-partner-select" data-role="follow" data-name="${follow}" id="tiebreak-follow-select-${safeId}">
                    <option value="">Select a lead…</option>
                    ${tiebreakAllLeads.map(l => `<option value="${l}">${l}</option>`).join('')}
                </select>
            </div>`;
        });
        html += '</div>';
    }

    body.innerHTML = html;
    body.querySelectorAll('.tiebreak-partner-select').forEach(sel => {
        sel.addEventListener('change', () => {
            syncTiebreakSelects();
            updateTiebreakPartnerConfirmState();
        });
    });

    footer.innerHTML = '<button id="tiebreak-confirm-partners" class="btn primary" disabled>Confirm Partners</button>';
    document.getElementById('tiebreak-confirm-partners')?.addEventListener('click', () => void submitTiebreakPartnerSelections());
}

function syncTiebreakSelects(): void {
    // Disable options already chosen by sibling selects within the same grid
    (['lead', 'follow'] as const).forEach(role => {
        const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(`.tiebreak-partner-select[data-role="${role}"]`));
        const chosen = new Set(selects.map(s => s.value).filter(Boolean));
        selects.forEach(sel => {
            Array.from(sel.options).forEach(opt => {
                if (!opt.value) return;
                opt.disabled = chosen.has(opt.value) && sel.value !== opt.value;
            });
        });
    });
}

function updateTiebreakPartnerConfirmState(): void {
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('.tiebreak-partner-select'));
    const allPicked = selects.length > 0 && selects.every(s => s.value);
    const btn = document.getElementById('tiebreak-confirm-partners') as HTMLButtonElement | null;
    if (btn) btn.disabled = !allPicked;
}

async function submitTiebreakPartnerSelections(): Promise<void> {
    const leadSelections: Record<string, string> = {};
    const followSelections: Record<string, string> = {};
    document.querySelectorAll<HTMLSelectElement>('.tiebreak-partner-select[data-role="lead"]').forEach(sel => {
        if (sel.value && sel.dataset.name) leadSelections[sel.dataset.name] = sel.value;
    });
    document.querySelectorAll<HTMLSelectElement>('.tiebreak-partner-select[data-role="follow"]').forEach(sel => {
        if (sel.value && sel.dataset.name) followSelections[sel.dataset.name] = sel.value;
    });

    try {
        const data = await postJson<TiebreakSetPartnersResponse>('/api/tiebreak/set_partners', {
            session_id: deps?.getSessionId(),
            lead_selections: leadSelections,
            follow_selections: followSelections,
        });
        tiebreakSubRound = data.sub_round;
        tiebreakSR1Pairings = data.sr1_pairings;
        tiebreakSR2Pairings = data.sr2_pairings;
        renderTiebreakPhase1();
    } catch {
        showToast('Failed to submit partner selections', 'error');
    }
}

function renderTiebreakPairings(pairings: Array<[string, string]>): string {
    return pairings.map(([lead, follow]) =>
        `<div class="tiebreak-pairing-card">
            <span class="contestant lead">${lead}</span>
            <span class="tiebreak-vs">+</span>
            <span class="contestant follow">${follow}</span>
        </div>`
    ).join('');
}

function renderTiebreakPhase1(): void {
    const parts = modalParts();
    if (!parts) return;
    parts.title.textContent = 'Tie-Break: Sub-Round 1';
    parts.body.innerHTML = `
        <p class="tiebreak-subtitle">Announce these pairings. Dancers compete — no vote yet.</p>
        <div class="tiebreak-pairings">${renderTiebreakPairings(tiebreakSR1Pairings)}</div>
        <p class="tiebreak-note">After all pairs have danced, click "Next" to swap partners.</p>`;
    parts.footer.innerHTML = '<button id="tiebreak-advance-btn" class="btn primary">Next: Partner Swap →</button>';
    document.getElementById('tiebreak-advance-btn')?.addEventListener('click', () => void advanceTiebreakSubRound());
}

function renderTiebreakPhase2(): void {
    const parts = modalParts();
    if (!parts) return;
    parts.title.textContent = 'Tie-Break: Sub-Round 2 (Swapped Partners)';
    parts.body.innerHTML = `
        <p class="tiebreak-subtitle">Partners have swapped. Announce these pairings.</p>
        <div class="tiebreak-pairings">${renderTiebreakPairings(tiebreakSR2Pairings)}</div>
        <p class="tiebreak-note">After all pairs have danced, proceed to voting.</p>`;
    parts.footer.innerHTML = '<button id="tiebreak-advance-btn" class="btn primary">Proceed to Voting →</button>';
    document.getElementById('tiebreak-advance-btn')?.addEventListener('click', () => void advanceTiebreakSubRound());
}

async function advanceTiebreakSubRound(): Promise<void> {
    try {
        const data = await postJson<TiebreakAdvanceResponse>('/api/tiebreak/advance', {
            session_id: deps?.getSessionId(),
        });
        tiebreakSubRound = data.sub_round;
        if (tiebreakSubRound === 2) renderTiebreakPhase2();
        else if (tiebreakSubRound === 3) renderTiebreakPhase3();
    } catch {
        showToast('Failed to advance tie-break', 'error');
    }
}

function renderTiebreakPhase3(): void {
    const parts = modalParts();
    if (!parts) return;
    parts.title.textContent = 'Tie-Break: Final Vote';
    const { body, footer } = parts;
    tiebreakLeadVotes = {};
    tiebreakFollowVotes = {};

    body.innerHTML = '<p class="tiebreak-subtitle">Judges vote for the tie-break winner. Tie and No-Contest are not available.</p>';

    const allJudges = [...tiebreakGuestJudges, ...tiebreakContestantJudges];

    if (tiebreakLeadNeeded && tiedLeads.length >= 2) {
        const section = document.createElement('div');
        section.className = 'tiebreak-voting-section';
        const leadVsList = tiedLeads.map(n => `<span class="contestant lead">${n}</span>`).join(' vs ');
        section.innerHTML = `<h4>Lead Tie-Break: ${leadVsList}</h4>`;
        const container = document.createElement('div');
        container.className = 'judges-container';
        allJudges.forEach(judge => {
            container.appendChild(createTiebreakJudgeCard(judge, tiebreakGuestJudges.includes(judge), 'tb-lead', tiedLeads));
        });
        section.appendChild(container);
        body.appendChild(section);
    }

    if (tiebreakFollowNeeded && tiedFollows.length >= 2) {
        if (tiebreakLeadNeeded) {
            const hr = document.createElement('hr');
            hr.className = 'tiebreak-section-divider';
            body.appendChild(hr);
        }
        const section = document.createElement('div');
        section.className = 'tiebreak-voting-section';
        const followVsList = tiedFollows.map(n => `<span class="contestant follow">${n}</span>`).join(' vs ');
        section.innerHTML = `<h4>Follow Tie-Break: ${followVsList}</h4>`;
        const container = document.createElement('div');
        container.className = 'judges-container';
        allJudges.forEach(judge => {
            container.appendChild(createTiebreakJudgeCard(judge, tiebreakGuestJudges.includes(judge), 'tb-follow', tiedFollows));
        });
        section.appendChild(container);
        body.appendChild(section);
    }

    footer.innerHTML = '<button id="tiebreak-submit-votes" class="btn primary" disabled>Submit Tie-Break Votes</button>';
    document.getElementById('tiebreak-submit-votes')?.addEventListener('click', () => void submitTiebreakVotes());
}

function createTiebreakJudgeCard(judgeName: string, isGuest: boolean, voteType: 'tb-lead' | 'tb-follow', names: string[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'judge-row';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = judgeName.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2);

    const nameEl = document.createElement('span');
    nameEl.className = 'judge-name';
    nameEl.textContent = judgeName + (isGuest ? ' (Guest)' : '');

    const chips = document.createElement('div');
    chips.className = 'vote-chips';

    function onChip(chip: HTMLElement, chosenName: string): void {
        chips.querySelectorAll('.vote-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        row.classList.add('voted');
        avatar.classList.add('voted');
        if (voteType === 'tb-lead') tiebreakLeadVotes[judgeName] = chosenName;
        else tiebreakFollowVotes[judgeName] = chosenName;
        updateTiebreakSubmitState();
    }

    names.forEach(name => {
        const chip = document.createElement('button');
        chip.className = 'vote-chip';
        chip.textContent = name;
        chip.addEventListener('click', () => onChip(chip, name));
        chips.appendChild(chip);
    });

    row.appendChild(avatar);
    row.appendChild(nameEl);
    row.appendChild(chips);
    return row;
}

function updateTiebreakSubmitState(): void {
    const btn = document.getElementById('tiebreak-submit-votes') as HTMLButtonElement | null;
    if (!btn) return;
    const allJudges = [...tiebreakGuestJudges, ...tiebreakContestantJudges];
    const leadOk = !tiebreakLeadNeeded || allJudges.every(j => tiebreakLeadVotes[j] !== undefined);
    const followOk = !tiebreakFollowNeeded || allJudges.every(j => tiebreakFollowVotes[j] !== undefined);
    btn.disabled = !(leadOk && followOk);
}

async function submitTiebreakVotes(): Promise<void> {
    const allJudges = [...tiebreakGuestJudges, ...tiebreakContestantJudges];
    const leadVotesArray = tiebreakLeadNeeded ? allJudges.filter(j => tiebreakLeadVotes[j] !== undefined).map(j => [j, tiebreakLeadVotes[j]]) : [];
    const followVotesArray = tiebreakFollowNeeded ? allJudges.filter(j => tiebreakFollowVotes[j] !== undefined).map(j => [j, tiebreakFollowVotes[j]]) : [];

    try {
        const data = await postJson<TiebreakVoteResponse>('/api/tiebreak/vote', {
            session_id: deps?.getSessionId(),
            lead_votes: leadVotesArray,
            follow_votes: followVotesArray,
        });

        if (data.lead_result?.resolved) {
            tiebreakLeadNeeded = false;
            tiebreakResolvedLeadWinner = data.lead_result.winner;
        }
        if (data.follow_result?.resolved) {
            tiebreakFollowNeeded = false;
            tiebreakResolvedFollowWinner = data.follow_result.winner;
        }

        if (data.needs_another_round) {
            tiedLeads = data.tied_leads || tiedLeads;
            tiedFollows = data.tied_follows || tiedFollows;
            renderTiebreakStillTied(data);
        } else {
            renderTiebreakResults();
        }
    } catch {
        showToast('Failed to submit tie-break votes', 'error');
    }
}

function renderTiebreakStillTied(data: TiebreakVoteResponse): void {
    const parts = modalParts();
    if (!parts) return;
    parts.title.textContent = 'Tie-Break: Votes Tied';
    const { body, footer } = parts;

    let html = '<p class="tiebreak-subtitle">The vote ended in a tie. Another round is needed.</p>';

    const buildTallyHtml = (result: NonNullable<TiebreakVoteResponse['lead_result']>, role: 'lead' | 'follow'): string => {
        const colorClass = role === 'lead' ? 'lead' : 'follow';
        let h = '<div class="tiebreak-vote-tally">';
        Object.entries(result.vote_tally).sort((a, b) => b[1] - a[1]).forEach(([name, score]) => {
            const tied = result.still_tied && result.still_tied.includes(name);
            h += `<div class="tiebreak-tally-row${tied ? ' tiebreak-tally-tied' : ''}">
                <span class="contestant ${colorClass}">${name}</span>
                <span class="tiebreak-tally-score">${score} pt${score !== 1 ? 's' : ''}</span>
                ${tied ? '<span class="tiebreak-tally-badge">tied</span>' : ''}
            </div>`;
        });
        h += '</div>';
        return h;
    };

    if (data.lead_result && !data.lead_result.resolved) {
        html += `<div class="tiebreak-still-tied-section"><h4>Lead Vote — Still Tied</h4>${buildTallyHtml(data.lead_result, 'lead')}</div>`;
    } else if (tiebreakResolvedLeadWinner) {
        html += `<div class="tiebreak-winner-banner"><span class="tiebreak-role-label">Lead Winner</span><span class="tiebreak-winner-name contestant lead">${tiebreakResolvedLeadWinner}</span></div>`;
    }

    if (data.lead_result && !data.lead_result.resolved && data.follow_result) {
        html += '<hr class="tiebreak-section-divider">';
    }

    if (data.follow_result && !data.follow_result.resolved) {
        html += `<div class="tiebreak-still-tied-section"><h4>Follow Vote — Still Tied</h4>${buildTallyHtml(data.follow_result, 'follow')}</div>`;
    } else if (tiebreakResolvedFollowWinner) {
        html += `<div class="tiebreak-winner-banner"><span class="tiebreak-role-label">Follow Winner</span><span class="tiebreak-winner-name contestant follow">${tiebreakResolvedFollowWinner}</span></div>`;
    }

    body.innerHTML = html;
    footer.innerHTML = '<button id="tiebreak-next-round-btn" class="btn primary">Continue Tie-Break →</button>';
    document.getElementById('tiebreak-next-round-btn')?.addEventListener('click', renderTiebreakPhase0);
}

function renderTiebreakResults(): void {
    const parts = modalParts();
    if (!parts) return;
    parts.title.textContent = 'Tie-Break Results';
    const { body, footer } = parts;

    let html = '<div class="tiebreak-results">';
    if (tiebreakResolvedLeadWinner) {
        html += `<div class="tiebreak-winner-banner">
            <span class="tiebreak-role-label">Lead Winner</span>
            <span class="tiebreak-winner-name contestant lead">${tiebreakResolvedLeadWinner}</span>
        </div>`;
    }
    if (tiebreakResolvedFollowWinner) {
        html += `<div class="tiebreak-winner-banner">
            <span class="tiebreak-role-label">Follow Winner</span>
            <span class="tiebreak-winner-name contestant follow">${tiebreakResolvedFollowWinner}</span>
        </div>`;
    }
    html += '</div>';
    body.innerHTML = html;

    footer.innerHTML = '<button id="tiebreak-view-results" class="btn primary">View Final Results</button>';
    document.getElementById('tiebreak-view-results')?.addEventListener('click', () => void finalizeTiebreakAndShowResults());
}

async function finalizeTiebreakAndShowResults(): Promise<void> {
    if (!deps) return;
    try {
        const data = await postJson<ResultsResponse>('/api/tiebreak/finalize', {
            session_id: deps.getSessionId(),
        });
        document.getElementById('tiebreak-modal')?.classList.add('hidden');
        tiebreakActive = false;
        if (!data.initial_leads || !data.initial_follows) {
            const order = deps.getInitialOrder();
            data.initial_leads = order.leads;
            data.initial_follows = order.follows;
        }
        deps.showResults(data);
    } catch {
        showToast('Failed to finalize tie-break', 'error');
    }
}
