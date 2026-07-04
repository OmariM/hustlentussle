/**
 * Display mode: the read-only audience view (/battle/<id>?mode=display).
 *
 * Owns the display-mode flag, the 3s state-polling loop, the round-transition
 * overlay + staggered fade-in sequence, and the display-only tiebreak panel.
 * The render pipeline and queue animation stay in app.js and are injected via
 * initDisplayDeps(); `display.active` is the shared flag app.js reads.
 */

import type { GameStateResponse } from './types';

export const display = {
    active: false,
};

const DISPLAY_POLL_INTERVAL_MS = 3000; // Poll every 3 seconds in display mode

let displayPollInterval: ReturnType<typeof setInterval> | null = null;
let roundTransitionInProgress = false; // Track if round transition overlay is showing

interface DisplayDeps {
    fetchState: () => Promise<GameStateResponse | null>;
    renderFromState: (state: GameStateResponse) => void;
    /** Render with the queue animation suppressed (display runs it after the stagger). */
    renderFromStateWithoutQueueAnimation: (state: GameStateResponse) => void;
    /** Whether a deferred queue animation with actual movement is pending. */
    hasPendingQueueAnimation: () => boolean;
    triggerPendingQueueAnimation: () => void;
    endCompetition: () => void;
    showBattleScreen: () => void;
}

let deps: DisplayDeps | null = null;

export function initDisplayDeps(d: DisplayDeps): void {
    deps = d;
}

/**
 * Detect ?mode=display early on load. Returns the session id from the URL
 * when display mode carries one (the caller adopts it), else null.
 */
export function detectDisplayMode(): string | null {
    try {
        const url = new URL(window.location.href);
        const mode = url.searchParams.get('mode');
        const urlSessionId = url.searchParams.get('session_id');

        if (mode === 'display') {
            display.active = true;
            document.body.classList.add('display-mode');
            console.log('Display mode enabled');
            if (urlSessionId) return urlSessionId;
        }
    } catch (e) {
        console.warn('Failed to detect display mode:', e);
    }
    return null;
}

export function startDisplayPolling(): void {
    if (!display.active || displayPollInterval || !deps) return;
    const d = deps;

    // Track the last round number we displayed (for overlay triggering)
    let lastDisplayedRound: number | null = null;

    console.log('Starting display mode polling...');
    displayPollInterval = setInterval(async () => {
        // Skip polling while transition overlay is showing
        if (roundTransitionInProgress) return;

        try {
            const state = await d.fetchState();
            if (state) {
                const currentRound = state.round?.number || null;

                // Check if round went forward (not backwards like in an undo)
                const roundWentForward = lastDisplayedRound !== null &&
                                         currentRound !== null &&
                                         currentRound > lastDisplayedRound;

                if (roundWentForward) {
                    // Full transition sequence:
                    // 1. Hide sections immediately (invisible during overlay)
                    // 2. Show overlay
                    // 3. Render state (skip queue animation, keep old order for animation)
                    // 4. Staggered fade-in of sections
                    // 5. Trigger queue animation (from old order to new order)
                    // 6. Clear transition flag when complete

                    // Hide sections before overlay so they're invisible during it
                    hideSectionsForTransition();

                    showRoundTransitionOverlay(currentRound, () => {
                        // Skip queue animation during initial render - we'll trigger it after stagger
                        d.renderFromStateWithoutQueueAnimation(state);
                        lastDisplayedRound = currentRound;

                        // Re-hide sections after render (render may have reset DOM)
                        hideSectionsForTransition();

                        // Perform staggered fade-in, then trigger queue animation
                        performStaggeredFadeIn(() => {
                            // Check if queue animation will run before triggering
                            const willAnimateQueue = d.hasPendingQueueAnimation();

                            d.triggerPendingQueueAnimation();

                            // Wait for queue animation to complete before allowing next poll
                            // Queue animation takes EXIT_DURATION + ENTRY_DURATION + CLEANUP_BUFFER = ~2.4s
                            const QUEUE_ANIMATION_TOTAL = 2500;
                            setTimeout(() => {
                                roundTransitionInProgress = false;
                            }, willAnimateQueue ? QUEUE_ANIMATION_TOTAL : 0);
                        });
                    });
                } else {
                    // No round change, just update normally
                    d.renderFromState(state);
                    lastDisplayedRound = currentRound;
                }

                // Check if game is finished and redirect to results
                if (state.flags && state.flags.finished) {
                    stopDisplayPolling();
                    // Trigger end game to show results
                    d.endCompetition();
                }
            }
        } catch (e) {
            console.warn('Display polling error:', e);
        }
    }, DISPLAY_POLL_INTERVAL_MS);
}

export function stopDisplayPolling(): void {
    if (displayPollInterval) {
        clearInterval(displayPollInterval);
        displayPollInterval = null;
        console.log('Display mode polling stopped');
    }
}

// Round transition overlay for display mode
const ROUND_OVERLAY_FADE_IN = 400;   // ms - fade in duration
const ROUND_OVERLAY_HOLD = 1500;     // ms - hold duration
const ROUND_OVERLAY_FADE_OUT = 400;  // ms - fade out duration

function showRoundTransitionOverlay(roundNumber: number | null, callback: () => void): void {
    const overlay = document.getElementById('round-transition-overlay');
    const roundNumberEl = document.getElementById('overlay-round-number');

    if (!overlay || !roundNumberEl) {
        // Overlay elements not found, just run callback
        callback();
        return;
    }

    roundTransitionInProgress = true;

    // Set the round number
    roundNumberEl.textContent = String(roundNumber ?? '');

    // Show overlay (remove hidden, add active after a frame for transition)
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    // Hold, then fade out
    setTimeout(() => {
        overlay.classList.remove('active');

        // After fade out, hide completely and run callback
        // NOTE: Keep roundTransitionInProgress = true until entire sequence completes
        setTimeout(() => {
            overlay.classList.add('hidden');
            // Don't set roundTransitionInProgress to false here - let the full sequence control it
            callback();
        }, ROUND_OVERLAY_FADE_OUT);
    }, ROUND_OVERLAY_FADE_IN + ROUND_OVERLAY_HOLD);
}

// Staggered fade-in animation timing
const STAGGER_DELAY_MS = 150; // Delay between each section
const STAGGER_ANIMATION_MS = 400; // Duration of each fade-in

// Get the display mode sections to animate (grid children in display mode)
function getDisplaySections(): HTMLElement[] {
    return [
        document.getElementById('current-matchup'),
        document.querySelector<HTMLElement>('.judges'),
        document.getElementById('next-up-section'),
        document.querySelector<HTMLElement>('.scores-display'),
    ].filter((el): el is HTMLElement => el !== null);
}

// Hide sections before overlay (so they're invisible during overlay)
function hideSectionsForTransition(): void {
    getDisplaySections().forEach((section) => {
        section.style.opacity = '0';
    });
}

function performStaggeredFadeIn(callback: () => void): void {
    const sections = getDisplaySections();
    if (sections.length === 0) {
        callback();
        return;
    }

    // Ensure all sections start hidden
    sections.forEach((section) => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(12px)';
    });

    // Stagger each section's fade-in
    sections.forEach((section, index) => {
        setTimeout(() => {
            section.style.transition = `opacity ${STAGGER_ANIMATION_MS}ms ease, transform ${STAGGER_ANIMATION_MS}ms ease`;
            section.style.opacity = '1';
            section.style.transform = 'translateY(0)';
        }, index * STAGGER_DELAY_MS);
    });

    // Calculate total animation time and run callback after completion
    const totalAnimationTime = (sections.length - 1) * STAGGER_DELAY_MS + STAGGER_ANIMATION_MS + 50;
    setTimeout(() => {
        // Clean up inline styles
        sections.forEach((section) => {
            section.style.transition = '';
            section.style.opacity = '';
            section.style.transform = '';
        });
        callback();
    }, totalAnimationTime);
}

export function applyDisplayModeUI(): void {
    if (!display.active) return;

    // Hide voting sections
    const combinedVoting = document.getElementById('combined-voting');
    if (combinedVoting) combinedVoting.style.display = 'none';

    // Hide round results section (Next Round / End Battle buttons)
    const roundResults = document.getElementById('round-results');
    if (roundResults) roundResults.style.display = 'none';

    // Hide spotify-related controls for cleaner display
    const spotifyToggleEl = document.getElementById('spotify-toggle');
    if (spotifyToggleEl && spotifyToggleEl.parentElement) spotifyToggleEl.parentElement.style.display = 'none';
}

export async function initDisplayMode(sessionId: string | null): Promise<void> {
    if (!display.active || !deps) return;

    if (!sessionId) {
        // No session ID - show error on home screen
        alert('Display mode requires a session_id parameter. Example: ?mode=display&session_id=YOUR_SESSION_ID');
        return;
    }

    // Apply display mode UI changes
    applyDisplayModeUI();

    // Fetch initial state and go directly to battle screen
    try {
        const state = await deps.fetchState();
        if (state) {
            // Update session ID display
            const sessionIdDisplay = document.getElementById('session-id-display');
            if (sessionIdDisplay) {
                sessionIdDisplay.textContent = `Session: ${sessionId}`;
                sessionIdDisplay.style.display = 'block';
            }

            // Go directly to battle screen
            deps.showBattleScreen();
            deps.renderFromState(state);

            // Start polling for updates
            startDisplayPolling();
        } else {
            alert('Failed to load game state. Session may not exist.');
        }
    } catch (e) {
        console.error('Failed to initialize display mode:', e);
        alert('Failed to connect to game session.');
    }
}

export function renderDisplayModeTiebreak(tb: GameStateResponse['tiebreak']): void {
    const section = document.getElementById('tiebreak-display-section');
    if (section) section.style.display = '';
    const roundHeader = document.querySelector<HTMLElement>('.round-header');
    if (roundHeader) roundHeader.style.display = 'none';

    const phaseEl = document.getElementById('tiebreak-display-phase-label');
    const contestantsEl = document.getElementById('tiebreak-display-contestants');
    const pairingsEl = document.getElementById('tiebreak-display-pairings');
    const winnersEl = document.getElementById('tiebreak-display-winners');
    if (!phaseEl || !contestantsEl || !pairingsEl || !winnersEl) return;

    const phaseLabels: Record<number, string> = {
        0: 'Tie-Break — Selecting Partners',
        1: 'Tie-Break — Sub-Round 1',
        2: 'Tie-Break — Sub-Round 2',
        3: 'Tie-Break — Final Vote',
    };
    phaseEl.textContent = phaseLabels[tb.sub_round] ?? 'Tie-Break';

    if (tb.sub_round === 0 || tb.sub_round === 3) {
        let html = '';
        if (tb.lead_needed && tb.tied_leads.length && !tb.lead_winner) {
            html += `<div class="tiebreak-display-role-group">
                <span class="tiebreak-display-role-label">Leads</span>
                ${tb.tied_leads.map(n => `<span class="contestant lead tiebreak-display-name">${n}</span>`).join('<span class="tiebreak-display-vs">vs</span>')}
            </div>`;
        }
        if (tb.follow_needed && tb.tied_follows.length && !tb.follow_winner) {
            html += `<div class="tiebreak-display-role-group">
                <span class="tiebreak-display-role-label">Follows</span>
                ${tb.tied_follows.map(n => `<span class="contestant follow tiebreak-display-name">${n}</span>`).join('<span class="tiebreak-display-vs">vs</span>')}
            </div>`;
        }
        contestantsEl.innerHTML = html;
        pairingsEl.innerHTML = '';
    }

    if (tb.sub_round === 1 || tb.sub_round === 2) {
        const pairings = tb.sub_round === 1 ? tb.sr1_pairings : tb.sr2_pairings;
        contestantsEl.innerHTML = '';
        pairingsEl.innerHTML = pairings.map(([lead, follow]) =>
            `<div class="tiebreak-display-pairing-card">
                <span class="contestant lead">${lead}</span>
                <span class="tiebreak-display-plus">+</span>
                <span class="contestant follow">${follow}</span>
            </div>`
        ).join('');
    }

    let winnerHtml = '';
    if (tb.lead_winner) winnerHtml += `<div class="tiebreak-display-winner-banner">
        <span class="tiebreak-display-role-label">Lead Winner</span>
        <span class="tiebreak-display-winner-name contestant lead">${tb.lead_winner}</span>
    </div>`;
    if (tb.follow_winner) winnerHtml += `<div class="tiebreak-display-winner-banner">
        <span class="tiebreak-display-role-label">Follow Winner</span>
        <span class="tiebreak-display-winner-name contestant follow">${tb.follow_winner}</span>
    </div>`;
    winnersEl.innerHTML = winnerHtml;
}
