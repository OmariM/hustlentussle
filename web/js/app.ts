import { getState as apiGetState } from './api';
import type { GameStateResponse, ScoreboardRow } from './types';
import { showToast } from './toast';
import {
    playlist,
    isSpotifyEnabled,
    syncPlaylistUI,
    preparePlaylistSongForRound,
    maybeEnablePlaylistMode,
    disablePlaylistMode,
    markCurrentRoundTrackUsed,
    resetPlaylistState,
    hydratePlaylistFromStorage,
    startSpotifyAuth,
} from './spotify';
import { initDemo, currentDemoAction, demoActionCompleted } from './demo';
import { initTiebreakDeps, startTiebreakFlow } from './tiebreak';
import {
    initResultsDeps,
    initResultsUI,
    showResults,
    hydrateResultsRoute,
    setUploadedBattlePayload,
    resetResultsState,
} from './results';

// Wire the results domain to the live-game state it still reads/writes
// (function declarations and `let` bindings hoist; arrows defer evaluation)
initResultsDeps({
    getSessionId: () => sessionId,
    getGuestJudges: () => guestJudges,
    setScoreboard: (leads, follows) => {
        currentLeads = leads;
        currentFollows = follows;
    },
    getScoreboard: () => ({ leads: currentLeads, follows: currentFollows }),
});

// Wire the tie-break modal to app state (function declarations hoist)
initTiebreakDeps({
    getSessionId: () => sessionId,
    getInitialOrder: () => ({ leads: initialLeads, follows: initialFollows }),
    showResults: (data) => showResults(data),
});
import {
    display,
    detectDisplayMode,
    initDisplayDeps,
    initDisplayMode,
    applyDisplayModeUI,
    startDisplayPolling,
    stopDisplayPolling,
    renderDisplayModeTiebreak,
} from './display';

// Wire display mode to the render pipeline (function declarations hoist;
// DOM-dependent values are resolved lazily inside the arrows)
initDisplayDeps({
    fetchState: () => fetchCanonicalState(),
    renderFromState: (state) => renderFromState(state),
    renderFromStateWithoutQueueAnimation: (state) => {
        skipQueueAnimationOnNextRender = true;
        renderFromState(state);
        skipQueueAnimationOnNextRender = false;
    },
    hasPendingQueueAnimation: () => !!(pendingQueueAnimationData &&
        (pendingQueueAnimationData.leadLosers.length > 0 ||
         pendingQueueAnimationData.followLosers.length > 0)),
    triggerPendingQueueAnimation: () => triggerPendingQueueAnimation(),
    endCompetition: () => endCompetition(),
    showBattleScreen: () => showScreen(roundScreen),
});

// Client-side routing lives in router.ts; it publishes navigate() on window.
function navigate(path: string, opts?: { replace?: boolean }): void {
    window.navigate?.(path, opts);
}

type VoteType = 'lead' | 'follow';
type VotesByJudge = Record<string, number>;

interface PendingQueueAnimation {
    leadContainer: HTMLElement;
    followContainer: HTMLElement;
    leadOrder: string[];
    followOrder: string[];
    leadLosers: string[];
    followLosers: string[];
}

// Global variables
let sessionId: string | null = null;
let liveBattleActive = false;      // a battle is live in-memory (skip refetch on route enter)
// Results state (rendered payload, uploaded battle, editor modal) lives in results.ts
let guestJudges: string[] = [];
let leadVotes: VotesByJudge = {};  // Changed to an object to easily update votes
let followVotes: VotesByJudge = {}; // Changed to an object to easily update votes
let votingLocked: Record<VoteType, boolean> = { lead: false, follow: false }; // Track if voting is locked
let currentLeads: ScoreboardRow[] = []; // Store current lead contestants with points
let currentFollows: ScoreboardRow[] = []; // Store current follow contestants with points
let initialLeads: string[] = []; // Store initial order of leads
let initialFollows: string[] = []; // Store initial order of follows
let contestantJudgingEnabled = true; // Track whether contestant judging is enabled for the battle

// Display mode state lives in display.ts (`display.active` + polling internals)

// Queue order animation state (for display mode)
let previousLeadOrder: string[] = [];
let previousFollowOrder: string[] = [];
let previousRoundNumber: number | null = null;
let animationInProgress = false;
let skipQueueAnimationOnNextRender = false; // Skip queue animation during stagger sequence
let pendingQueueAnimationData: PendingQueueAnimation | null = null; // Store data for queue animation after stagger
let isUndoInProgress = false; // Skip animations during undo operations
let isSubmitting = false; // Prevent double-submission

// Demo mode lives in demo.ts (initDemo / currentDemoAction / demoActionCompleted)

// Tie-break state
// Tie-break state lives in tiebreak.ts (startTiebreakFlow + module-private state)

// Voting constants (frontend-only)
const PROXY_CONTESTANT_JUDGES_NAME = 'Contestant Judges';
const VOTE_MIXED = 5; // Special option used only for the proxy judge UI (never sent to backend)

// Playlist mode state lives in spotify.ts (the imported `playlist` object)
let playlistUrlInput: HTMLInputElement;
let simpleContestantJudgesEnabled = false;

// Apply mode (layout) and color (light/dark) independently
// Color preferences are stored per mode so admin and display can differ
function applyTheme() {
    const mode = display.active ? 'display' : 'admin';
    document.documentElement.setAttribute('data-mode', mode);

    const colorKey = `color-preference-${mode}`;
    const savedColor = localStorage.getItem(colorKey);
    const color = savedColor || (display.active ? 'dark' : 'light');
    document.documentElement.setAttribute('data-color', color);
}

function toggleTheme() {
    const mode = display.active ? 'display' : 'admin';
    const current = document.documentElement.getAttribute('data-color');
    const next = (current === 'light') ? 'dark' : 'light';
    localStorage.setItem(`color-preference-${mode}`, next);
    document.documentElement.setAttribute('data-color', next);
}

// Loading state utility
function setButtonLoading(button: HTMLButtonElement | null, loading: boolean) {
    if (!button) return;
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
        }
    }
}

// DOM Elements (initialized in the DOMContentLoaded event; assigned with `!`/casts
// there — code that runs before that event must not touch them)
let homeScreen: HTMLElement, uploadScreen: HTMLElement, setupScreen: HTMLElement, roundScreen: HTMLElement, resultsScreen: HTMLElement;
let goToBattleBtn: HTMLElement, goToUploadBtn: HTMLElement;
let battleFileUpload: HTMLInputElement, uploadFileName: HTMLElement, uploadBattleDataBtn: HTMLButtonElement, backToHomeBtn: HTMLElement, uploadError: HTMLElement;
let leadNamesInput: HTMLInputElement, followNamesInput: HTMLInputElement, judgeNamesInput: HTMLInputElement, startCompetitionBtn: HTMLButtonElement, setupBackToHomeBtn: HTMLElement;
let pointsToWinInput: HTMLInputElement, pointsToWinModeSelect: HTMLSelectElement, customPointsContainer: HTMLElement, pointsToWinHelper: HTMLElement;
let numContestantJudgesInput: HTMLInputElement, contestantJudgesWarning: HTMLElement;
let contestantJudgingToggle: HTMLInputElement, simpleContestantJudgesInput: HTMLInputElement, randomizeOrderToggle: HTMLInputElement;
let roundNumber: HTMLElement, lead1Name: HTMLElement, lead2Name: HTMLElement, follow1Name: HTMLElement, follow2Name: HTMLElement, contestantJudgesList: HTMLElement, guestJudgesList: HTMLElement;
let currentLeadScores: HTMLElement, currentFollowScores: HTMLElement;
let liveLeadGraphic: HTMLElement, liveFollowGraphic: HTMLElement;
let leadJudgesContainer: HTMLElement, followJudgesContainer: HTMLElement;
let leadWinner: HTMLElement, followWinner: HTMLElement;
let leadGuestVotes: HTMLElement, leadContestantVotes: HTMLElement, followGuestVotes: HTMLElement, followContestantVotes: HTMLElement;
let submitVotesBtn: HTMLButtonElement, votingResults: HTMLElement;
let leadWinnerPreview: HTMLElement, followWinnerPreview: HTMLElement, leadPreviewName: HTMLElement, followPreviewName: HTMLElement;
let roundResultsSection: HTMLElement, winMessages: HTMLElement, nextRoundBtn: HTMLButtonElement, endBattleBtn: HTMLButtonElement;
let backToHomeFromResultsBtn: HTMLElement;
// Vote confirmation modal elements
let voteConfirmModal: HTMLElement, voteConfirmCloseBtn: HTMLElement, voteConfirmCancelBtn: HTMLElement, voteConfirmSubmitBtn: HTMLButtonElement;
let voteConfirmRound: HTMLElement, voteConfirmLead1: HTMLElement, voteConfirmLead2: HTMLElement, voteConfirmFollow1: HTMLElement, voteConfirmFollow2: HTMLElement;
let voteConfirmLeadWinner: HTMLElement, voteConfirmFollowWinner: HTMLElement, voteConfirmError: HTMLElement;
// End battle early modal elements
let endEarlyBtn: HTMLButtonElement, endEarlyModal: HTMLElement, endEarlyCloseBtn: HTMLElement, endEarlyCancelBtn: HTMLElement, endEarlyConfirmBtn: HTMLButtonElement;
// Undo round button
let undoRoundBtn: HTMLButtonElement;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    
    // Detect display mode early (before DOM element setup); adopt the URL's session id
    const displaySessionId = detectDisplayMode();
    if (displaySessionId) {
        sessionId = displaySessionId;
        localStorage.setItem('sessionId', sessionId);
    }
    applyTheme();

    // Initialize DOM elements
    homeScreen = document.getElementById('home-screen')!;
    uploadScreen = document.getElementById('upload-screen')!;
    setupScreen = document.getElementById('setup-screen')!;
    roundScreen = document.getElementById('battle-screen')!;
    resultsScreen = document.getElementById('results-screen')!;
    
    // Home screen elements
    goToBattleBtn = document.getElementById('go-to-battle')!;
    goToUploadBtn = document.getElementById('go-to-upload')!;
    
    // Upload screen elements
    battleFileUpload = document.getElementById('battle-file-upload') as HTMLInputElement;
    uploadFileName = document.getElementById('upload-file-name')!;
    uploadBattleDataBtn = document.getElementById('upload-battle-data') as HTMLButtonElement;
    backToHomeBtn = document.getElementById('back-to-home')!;
    uploadError = document.getElementById('upload-error')!;

// Setup screen elements
    leadNamesInput = document.getElementById('lead-names') as HTMLInputElement;
    followNamesInput = document.getElementById('follow-names') as HTMLInputElement;
    judgeNamesInput = document.getElementById('judge-names') as HTMLInputElement;
    pointsToWinInput = document.getElementById('points-to-win') as HTMLInputElement;
    pointsToWinModeSelect = document.getElementById('points-to-win-mode') as HTMLSelectElement;
    customPointsContainer = document.getElementById('custom-points-container')!;
    pointsToWinHelper = document.getElementById('points-to-win-helper')!;
    numContestantJudgesInput = document.getElementById('num-contestant-judges') as HTMLInputElement;
    contestantJudgesWarning = document.getElementById('contestant-judges-warning')!;
    startCompetitionBtn = document.getElementById('start-competition') as HTMLButtonElement;
    setupBackToHomeBtn = document.getElementById('setup-back-to-home')!;
    playlistUrlInput = document.getElementById('playlist-url') as HTMLInputElement;
    simpleContestantJudgesInput = document.getElementById('simple-contestant-judges') as HTMLInputElement;
    contestantJudgingToggle = document.getElementById('contestant-judging-toggle') as HTMLInputElement;
    randomizeOrderToggle = document.getElementById('randomize-order-toggle') as HTMLInputElement;

    if (contestantJudgingToggle && simpleContestantJudgesInput) {
        const syncContestantJudgingControls = () => {
            const enabled = contestantJudgingToggle.checked;
            if (!enabled) {
                simpleContestantJudgesInput.checked = false;
            }
            simpleContestantJudgesInput.disabled = !enabled;
            // Also disable/enable num contestant judges input
            if (numContestantJudgesInput) {
                numContestantJudgesInput.disabled = !enabled;
                const numContestantJudgesGroup = document.getElementById('num-contestant-judges-group');
                if (numContestantJudgesGroup) {
                    numContestantJudgesGroup.style.opacity = enabled ? '1' : '0.5';
                }
            }
        };
        contestantJudgingToggle.addEventListener('change', syncContestantJudgingControls);
        syncContestantJudgingControls();
    }

    // Points to win mode toggle
    if (pointsToWinModeSelect && customPointsContainer && pointsToWinHelper) {
        const updatePointsToWinUI = () => {
            const mode = pointsToWinModeSelect.value;
            if (mode === 'custom') {
                customPointsContainer.style.display = 'block';
                pointsToWinHelper.textContent = 'Enter a custom number of points required to win.';
            } else if (mode === 'auto') {
                customPointsContainer.style.display = 'none';
                pointsToWinHelper.textContent = 'Points to win = max(leads, follows) - 1';
            } else {
                customPointsContainer.style.display = 'none';
                pointsToWinHelper.textContent = 'First contestant to reach 7 points wins.';
            }
        };
        pointsToWinModeSelect.addEventListener('change', updatePointsToWinUI);
        updatePointsToWinUI();
    }

    // Contestant judges validation
    if (numContestantJudgesInput && judgeNamesInput && contestantJudgesWarning) {
        const validateContestantJudges = () => {
            const numContestantJudgesRaw = numContestantJudgesInput.value.trim();
            if (numContestantJudgesRaw === '') {
                contestantJudgesWarning.style.display = 'none';
                return;
            }
            const numContestantJudges = parseInt(numContestantJudgesRaw, 10);
            const guestJudgeCount = judgeNamesInput.value.split(',').filter(n => n.trim()).length;
            const expected = guestJudgeCount + 1;
            if (!isNaN(numContestantJudges) && numContestantJudges !== expected) {
                contestantJudgesWarning.textContent = `Warning: You specified ${numContestantJudges} contestant judge(s), but the recommended number is ${expected} (1 more than the ${guestJudgeCount} guest judge(s)). This may cause undetermined behavior.`;
                contestantJudgesWarning.style.display = 'block';
            } else {
                contestantJudgesWarning.style.display = 'none';
            }
        };
        numContestantJudgesInput.addEventListener('input', validateContestantJudges);
        judgeNamesInput.addEventListener('input', validateContestantJudges);
    }

// Round screen elements
    roundNumber = document.getElementById('round-number')!;
    lead1Name = document.getElementById('lead1-name')!;
    lead2Name = document.getElementById('lead2-name')!;
    follow1Name = document.getElementById('follow1-name')!;
    follow2Name = document.getElementById('follow2-name')!;
    contestantJudgesList = document.getElementById('contestant-judges-list')!;
    guestJudgesList = document.getElementById('guest-judges-list')!;
    currentLeadScores = document.getElementById('current-lead-scores')!;
    currentFollowScores = document.getElementById('current-follow-scores')!;
    liveLeadGraphic = document.getElementById('live-lead-graphic')!;
    liveFollowGraphic = document.getElementById('live-follow-graphic')!;

// Voting elements
    leadJudgesContainer = document.getElementById('lead-judges-container')!;
    followJudgesContainer = document.getElementById('follow-judges-container')!;
    leadWinner = document.getElementById('lead-winner')!;
    followWinner = document.getElementById('follow-winner')!;
    leadGuestVotes = document.getElementById('lead-guest-votes')!;
    leadContestantVotes = document.getElementById('lead-contestant-votes')!;
    followGuestVotes = document.getElementById('follow-guest-votes')!;
    followContestantVotes = document.getElementById('follow-contestant-votes')!;
    submitVotesBtn = document.getElementById('submit-votes') as HTMLButtonElement;
    votingResults = document.getElementById('voting-results')!;
    leadWinnerPreview = document.getElementById('lead-winner-preview')!;
    followWinnerPreview = document.getElementById('follow-winner-preview')!;
    leadPreviewName = document.getElementById('lead-preview-name')!;
    followPreviewName = document.getElementById('follow-preview-name')!;

    // Vote confirmation modal
    voteConfirmModal = document.getElementById('vote-confirm-modal')!;
    voteConfirmCloseBtn = document.getElementById('vote-confirm-close')!;
    voteConfirmCancelBtn = document.getElementById('vote-confirm-cancel')!;
    voteConfirmSubmitBtn = document.getElementById('vote-confirm-submit') as HTMLButtonElement;
    voteConfirmRound = document.getElementById('vote-confirm-round')!;
    voteConfirmLead1 = document.getElementById('vote-confirm-lead1')!;
    voteConfirmLead2 = document.getElementById('vote-confirm-lead2')!;
    voteConfirmFollow1 = document.getElementById('vote-confirm-follow1')!;
    voteConfirmFollow2 = document.getElementById('vote-confirm-follow2')!;
    voteConfirmLeadWinner = document.getElementById('vote-confirm-lead-winner')!;
    voteConfirmFollowWinner = document.getElementById('vote-confirm-follow-winner')!;
    voteConfirmError = document.getElementById('vote-confirm-error')!;

    // End battle early modal
    endEarlyBtn = document.getElementById('end-battle-early') as HTMLButtonElement;
    endEarlyModal = document.getElementById('end-early-modal')!;
    endEarlyCloseBtn = document.getElementById('end-early-close')!;
    endEarlyCancelBtn = document.getElementById('end-early-cancel')!;
    endEarlyConfirmBtn = document.getElementById('end-early-confirm') as HTMLButtonElement;

    // Undo round button
    undoRoundBtn = document.getElementById('undo-round') as HTMLButtonElement;

// Results elements
    roundResultsSection = document.getElementById('round-results')!;
    winMessages = document.getElementById('win-messages')!;
    nextRoundBtn = document.getElementById('next-round') as HTMLButtonElement;
    endBattleBtn = document.getElementById('end-battle') as HTMLButtonElement;
    backToHomeFromResultsBtn = document.getElementById('back-to-home-from-results')!;
    
    // Check if elements exist
    console.log('Checking elements:');
    console.log('homeScreen:', homeScreen);
    console.log('uploadScreen:', uploadScreen);
    console.log('setupScreen:', setupScreen);
    console.log('resultsScreen:', resultsScreen);
    console.log('backToHomeBtn:', backToHomeBtn);
    console.log('setupBackToHomeBtn:', setupBackToHomeBtn);
    console.log('backToHomeFromResultsBtn:', backToHomeFromResultsBtn);
    
    // Create direct handler functions for better debugging
    function goToHome() {
        console.log('Go to home clicked');
        navigate('/');
    }

    function setupBackToHomeHandler() {
        console.log('Setup back to home clicked');
        navigate('/');
    }

    // Home screen navigation
    goToBattleBtn.addEventListener('click', () => navigate('/setup'));
    document.getElementById('go-to-prelims')?.addEventListener('click', () => navigate('/prelim-setup'));
    if (goToUploadBtn) goToUploadBtn.addEventListener('click', () => navigate('/upload'));
    
    // Upload screen
    battleFileUpload.addEventListener('change', handleFileSelect);
    uploadBattleDataBtn.addEventListener('click', processUploadedFile);
    backToHomeBtn.addEventListener('click', goToHome);
    
    // Setup screen
    setupBackToHomeBtn.addEventListener('click', setupBackToHomeHandler);
    startCompetitionBtn.addEventListener('click', () => {
        const allowContestantJudging = contestantJudgingToggle ? contestantJudgingToggle.checked : true;
        startCompetition(
            simpleContestantJudgesInput && simpleContestantJudgesInput.checked,
            allowContestantJudging
        );
    });

    // Hydrate used tracks and playlist from localStorage for current session if available
    hydratePlaylistFromStorage();

    // Wire the guided demo (needs the reset callback for its exit path)
    initDemo({ resetAndGoHome });
    
    // Battle flow
    submitVotesBtn.addEventListener('click', () => openVoteConfirmModal());
    nextRoundBtn.addEventListener('click', goToNextRound);
    endBattleBtn.addEventListener('click', endCompetition);

    // Modal controls
    if (voteConfirmCloseBtn) voteConfirmCloseBtn.addEventListener('click', closeVoteConfirmModal);
    if (voteConfirmCancelBtn) voteConfirmCancelBtn.addEventListener('click', closeVoteConfirmModal);
    if (voteConfirmModal) {
        voteConfirmModal.addEventListener('click', (e) => {
            // click outside the modal closes
            if (e.target === voteConfirmModal) closeVoteConfirmModal();
        });
    }
    if (voteConfirmSubmitBtn) {
        voteConfirmSubmitBtn.addEventListener('click', async () => {
            await submitCombinedVotes({ autoAdvance: true });
        });
    }
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && voteConfirmModal && !voteConfirmModal.classList.contains('hidden')) {
            closeVoteConfirmModal();
        }
        if (e.key === 'Escape' && endEarlyModal && !endEarlyModal.classList.contains('hidden')) {
            closeEndEarlyModal();
        }
    });

    // End battle early modal controls
    if (endEarlyBtn) endEarlyBtn.addEventListener('click', openEndEarlyModal);
    if (endEarlyCloseBtn) endEarlyCloseBtn.addEventListener('click', closeEndEarlyModal);
    if (endEarlyCancelBtn) endEarlyCancelBtn.addEventListener('click', closeEndEarlyModal);
    if (endEarlyModal) {
        endEarlyModal.addEventListener('click', (e) => {
            if (e.target === endEarlyModal) closeEndEarlyModal();
        });
    }
    if (endEarlyConfirmBtn) {
        endEarlyConfirmBtn.addEventListener('click', () => {
            closeEndEarlyModal();
            endCompetition();
        });
    }

    // Undo round button
    if (undoRoundBtn) {
        undoRoundBtn.addEventListener('click', undoLastRound);
    }

    // Ensure modal is never shown by default on load
    closeVoteConfirmModal();
    closeEndEarlyModal();
    
    // Results screen
    console.log('Adding click handler to backToHomeFromResultsBtn');
    if (backToHomeFromResultsBtn) {
        backToHomeFromResultsBtn.addEventListener('click', resetAndGoHome);
        console.log('Event listener added successfully');
        // Add direct onclick handler as backup
        backToHomeFromResultsBtn.onclick = function() {
            console.log('Back to home from results clicked via onclick');
            resetAndGoHome();
        };
    } else {
        console.error('backToHomeFromResultsBtn is null or undefined!');
    }
    
    // Results screen + edit-results modal wiring lives in results.ts
    initResultsUI();

    // Theme toggles (nav bar + floating for display mode)
    document.querySelectorAll('#theme-toggle, #theme-toggle-floating').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // Nav pills are status indicators only — no click navigation
    document.querySelectorAll<HTMLElement>('.nav-pill').forEach(pill => {
        pill.style.pointerEvents = 'none';
        pill.style.cursor = 'default';
    });

    // Spotify integration UI gating
    const playlistUrlGroup = document.getElementById('playlist-url-group');
    const spotifyToggleCheckbox = document.getElementById('spotify-toggle') as HTMLInputElement | null;
    const spotifyAuthGroup = document.getElementById('spotify-auth-group');
    const spotifyAuthSetupBtn = document.getElementById('spotify-auth-setup-btn');
    const spotifyAuthStatus = document.getElementById('spotify-auth-status');
    if (localStorage.getItem('spotify.enabled') === null) {
        localStorage.setItem('spotify.enabled', 'false');
    }
    // Initialize checkbox from localStorage
    if (spotifyToggleCheckbox) {
        spotifyToggleCheckbox.checked = localStorage.getItem('spotify.enabled') === 'true';
        spotifyToggleCheckbox.addEventListener('change', () => {
            localStorage.setItem('spotify.enabled', spotifyToggleCheckbox.checked ? 'true' : 'false');
            applySpotifyEnabledUI();
        });
    }
    // Auth button on setup page
    if (spotifyAuthSetupBtn) {
        spotifyAuthSetupBtn.addEventListener('click', () => {
            startSpotifyAuth(window.location.origin + window.location.pathname, sessionId);
        });
    }
    function applySpotifyEnabledUI() {
        const isOn = localStorage.getItem('spotify.enabled') === 'true';
        if (playlistUrlGroup) playlistUrlGroup.style.display = isOn ? '' : 'none';
        if (spotifyAuthGroup) spotifyAuthGroup.style.display = isOn ? '' : 'none';
        const sis = document.getElementById('song-input-section');
        const pes = document.getElementById('playlist-embed-section');
        if (sis) sis.style.display = isOn ? '' : 'none';
        if (pes) pes.style.display = isOn && playlist.modeEnabled ? '' : 'none';
        // Check auth status when Spotify is enabled
        if (isOn) checkSpotifyAuthStatus();
    }
    async function checkSpotifyAuthStatus() {
        if (!spotifyAuthStatus || !spotifyAuthSetupBtn) return;
        try {
            const resp = await fetch('/api/spotify/user_token?session_id=preauth');
            if (resp.ok) {
                spotifyAuthStatus.textContent = 'Connected';
                spotifyAuthStatus.className = 'spotify-status spotify-status--connected';
                spotifyAuthSetupBtn.textContent = 'Reconnect Spotify';
            } else {
                spotifyAuthStatus.textContent = 'Not connected';
                spotifyAuthStatus.className = 'spotify-status spotify-status--disconnected';
                spotifyAuthSetupBtn.textContent = 'Connect Spotify';
            }
        } catch {
            spotifyAuthStatus.textContent = 'Not connected';
            spotifyAuthStatus.className = 'spotify-status spotify-status--disconnected';
            spotifyAuthSetupBtn.textContent = 'Connect Spotify';
        }
    }
    applySpotifyEnabledUI();

    // Hide nav bar initially to avoid a flash before the router renders the first route.
    const navBar = document.getElementById('nav-bar');
    if (navBar && !display.active) {
        navBar.style.display = 'none';
    }

    // Initial screen + display-mode init are driven by the router (js/router.js),
    // whose DOMContentLoaded handler runs after this one. See hydrateBattleRoute().
});

// Functions
function updateNavPills(activeScreen: HTMLElement) {
    document.querySelectorAll<HTMLElement>('.nav-pill').forEach(pill => {
        pill.classList.remove('active');
        if (activeScreen && pill.dataset.screen === activeScreen.id) {
            pill.classList.add('active');
        }
    });
}

function showScreen(screen: HTMLElement) {
    // Deactivate every screen (includes stats-screen and any future screens)
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    screen.classList.add('active');

    // Update nav pills to reflect current screen
    updateNavPills(screen);

    // Hide nav on home screen and in display mode
    const navBar = document.getElementById('nav-bar');
    if (navBar) {
        navBar.style.display = (screen === homeScreen || display.active) ? 'none' : '';
    }

    // Reset error messages when switching screens
    uploadError.textContent = '';
    uploadError.classList.remove('visible');

    // Apply Spotify UI gating on screen change
    try {
        const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
        const sig = document.getElementById('song-input-section');
        const pes = document.getElementById('playlist-embed-section');
        const pug = document.getElementById('playlist-url-group');
        if (pug) pug.style.display = spotifyOn ? '' : 'none';
        if (sig) sig.style.display = spotifyOn ? (playlist.modeEnabled ? 'none' : '') : 'none';
        if (pes) pes.style.display = spotifyOn && playlist.modeEnabled ? '' : 'none';
    } catch { /* ignore */ }

    // Apply display mode UI changes when switching screens
    if (display.active) {
        applyDisplayModeUI();
        // Start/stop polling based on which screen is active
        if (screen === roundScreen) {
            startDisplayPolling();
        } else {
            stopDisplayPolling();
        }
    }
}

function triggerPendingQueueAnimation() {
    if (!pendingQueueAnimationData) return;
    
    const { leadContainer, followContainer, leadOrder, followOrder, leadLosers, followLosers } = pendingQueueAnimationData;
    
    if ((leadLosers.length > 0 || followLosers.length > 0) && !animationInProgress) {
        animateQueueTransition(leadContainer, followContainer, leadOrder, followOrder, leadLosers, followLosers);
    }
    
    pendingQueueAnimationData = null;
}

// Canonical state helpers
async function fetchCanonicalState() {
    if (!sessionId) return null;
    return await apiGetState(sessionId);
}

function renderFromState(state: GameStateResponse) {
    if (!state || !state.round || !state.round.pairs) return;

    // Display mode: hand off to tiebreak renderer when a tiebreak is active
    if (display.active && state.tiebreak?.active) {
        renderDisplayModeTiebreak(state.tiebreak);
        return;
    }
    // Restore normal display layout if tiebreak just ended
    if (display.active) {
        const tds = document.getElementById('tiebreak-display-section');
        if (tds) tds.style.display = 'none';
        const rh = document.querySelector<HTMLElement>('.round-header');
        if (rh) rh.style.display = '';
    }

    // Store initial order for results display (important for display mode)
    if (Array.isArray(state.initial_order?.leads)) initialLeads = state.initial_order.leads;
    if (Array.isArray(state.initial_order?.follows)) initialFollows = state.initial_order.follows;

    // If we haven't initialized playlist mode yet but have a pending URL (from start), enable it
    if (isSpotifyEnabled() && !playlist.modeEnabled && playlist.pendingUrl) {
        maybeEnablePlaylistMode(playlist.pendingUrl, sessionId).catch(e => console.warn('Failed to enable playlist mode on render:', e));
        playlist.pendingUrl = null;
    }

    // Round number
    if (roundNumber) roundNumber.textContent = String(state.round.number);

    // If Spotify enabled and playlist mode is on and the round changed, prepare a song for this round
    if (isSpotifyEnabled() && playlist.modeEnabled) {
        const rn = state.round.number;
        if (playlist.lastPreparedSongRoundNumber !== rn) {
            preparePlaylistSongForRound(rn).catch(e => console.warn('Failed to prepare playlist song:', e));
        }
    }

    // Pairs
    if (lead1Name) lead1Name.textContent = state.round.pairs.pair_1.lead;
    if (follow1Name) follow1Name.textContent = state.round.pairs.pair_1.follow;
    if (lead2Name) lead2Name.textContent = state.round.pairs.pair_2.lead;
    if (follow2Name) follow2Name.textContent = state.round.pairs.pair_2.follow;

    // Judges
    if (guestJudgesList) {
        guestJudgesList.innerHTML = '';
        const gj = state.round.judges.guest || [];
        gj.forEach(judge => {
            const el = document.createElement('div');
            el.className = 'judge-item guest';
            el.textContent = judge;
            guestJudgesList.appendChild(el);
        });
        guestJudges = gj; // keep local cache for previews
    }
    const contestantEnabledFromState = state.round?.judges?.contestant_judging_enabled !== false;
    contestantJudgingEnabled = contestantEnabledFromState;
    if (contestantJudgesList) {
        contestantJudgesList.innerHTML = '';
        const cj = state.round.judges.contestant || [];
        if (contestantEnabledFromState) {
            cj.forEach(judge => {
                const el = document.createElement('div');
                el.className = 'judge-item contestant';
                el.textContent = judge;
                contestantJudgesList.appendChild(el);
            });
        }
        const contestantSection = contestantJudgesList.closest<HTMLElement>('.judges-section');
        if (contestantSection) {
            contestantSection.style.display = contestantEnabledFromState ? '' : 'none';
        }
    }
    // Store simple mode flag from state
    try {
        simpleContestantJudgesEnabled = contestantJudgingEnabled && Boolean(state.round?.judges?.simple_contestant_judges);
    } catch {
        simpleContestantJudgesEnabled = false;
    }

    // Scoreboard
    updateLiveGraphicFromState(state);

    // Update mini leaderboard
    updateMiniLeaderboard();

    // Update contestant order visualization
    updateContestantOrder(state);

    // Reset voting UI for the current round
    closeVoteConfirmModal();
    votingResults.classList.add('hidden');
    roundResultsSection.classList.add('hidden');
    winMessages.innerHTML = '';
    leadWinnerPreview.classList.add('hidden');
    followWinnerPreview.classList.add('hidden');
    leadVotes = {}; followVotes = {}; votingLocked = { lead: false, follow: false };
    submitVotesBtn.disabled = false;

    // Update undo button state - enabled if there are completed rounds to undo
    if (undoRoundBtn) {
        const hasRoundsToUndo = Array.isArray(state.rounds) && state.rounds.length > 0;
        undoRoundBtn.disabled = !hasRoundsToUndo || display.active;
    }

    // Rebuild voting cards based on current state
    setupVotingUI();

    // Enforce Spotify UI gating after state render
    try {
        syncPlaylistUI();
    } catch { /* ignore */ }
}

function getContestantJudgeNames() {
    if (!contestantJudgingEnabled || !contestantJudgesList) {
        return [];
    }
    const elements = contestantJudgesList.querySelectorAll('.judge-item.contestant');
    return Array.from(elements)
        .map(el => el.textContent)
        .filter(Boolean);
}

function buildJudgeRoster() {
    const roster = [...guestJudges];
    if (!contestantJudgingEnabled) {
        return roster;
    }
    if (simpleContestantJudgesEnabled) {
        roster.push(PROXY_CONTESTANT_JUDGES_NAME);
    } else {
        roster.push(...getContestantJudgeNames());
    }
    return roster;
}

function computeGuestWinnerDecision(votesObj: VotesByJudge) {
    // Decide which contestant is "winning" based on guest judges only.
    // vote=1 => contestant 1 (+2), vote=2 => contestant 2 (+2), vote=3 => tie (+1 each), vote=4 => no contest (+0).
    let s1 = 0;
    let s2 = 0;
    (guestJudges || []).forEach(j => {
        const v = votesObj ? votesObj[j] : undefined;
        if (v === 1) s1 += 2;
        else if (v === 2) s2 += 2;
        else if (v === 3) { s1 += 1; s2 += 1; }
    });
    return s1 >= s2 ? 1 : 2;
}

function expandSimpleContestantJudgesVotes(votesObj: VotesByJudge): Array<[string, number]> {
    const proxyVote = votesObj ? votesObj[PROXY_CONTESTANT_JUDGES_NAME] : undefined;
    const cjNames = getContestantJudgeNames();
    if (!contestantJudgingEnabled || !simpleContestantJudgesEnabled) {
        return [];
    }
    if (!cjNames || cjNames.length === 0) {
        // No contestant judges assigned this round; proxy vote has no effect.
        return [];
    }

    if (proxyVote === 1 || proxyVote === 2) {
        return cjNames.map(n => [n, proxyVote] as [string, number]);
    }

    if (proxyVote === VOTE_MIXED) {
        // "Mixed" means contestant judges are not unanimous. Split votes ~in half, but
        // give the majority to the contestant currently winning among the guest judges.
        const winnerDecision = computeGuestWinnerDecision(votesObj);
        const loserDecision = winnerDecision === 1 ? 2 : 1;
        const majorityCount = Math.floor(cjNames.length / 2) + 1;
        return cjNames.map((n, idx) => [n, idx < majorityCount ? winnerDecision : loserDecision] as [string, number]);
    }

    return [];
}

function buildEffectiveVotesArray(voteType: VoteType) {
    const roster = buildJudgeRoster();
    const votesObj = voteType === 'lead' ? leadVotes : followVotes;

    const out: Array<[string, number]> = [];

    roster.forEach(judge => {
        if (judge === PROXY_CONTESTANT_JUDGES_NAME && contestantJudgingEnabled && simpleContestantJudgesEnabled) {
            // Replace proxy with expanded contestant-judge votes (unanimous or mixed).
            const expanded = expandSimpleContestantJudgesVotes(votesObj);
            expanded.forEach(v => out.push(v));
            return;
        }
        if (typeof votesObj[judge] !== 'undefined') {
            out.push([judge, votesObj[judge]]);
        }
    });

    return out;
}

function updateLiveGraphicFromState(state: GameStateResponse) {
    if (!state || !state.scoreboard) return;
    const leads = state.scoreboard.leads || [];
    const follows = state.scoreboard.follows || [];
    const rounds = state.rounds || [];

    // Cache current arrays for possible other uses
    currentLeads = leads;
    currentFollows = follows;

    if (!liveLeadGraphic || !liveFollowGraphic) return;

    // Build quick lookups for current points
    const winThreshold = (state.thresholds && typeof state.thresholds.win === 'number') ? state.thresholds.win : Infinity;
    
    // Determine crown holders: first to reach threshold per role. We rely on flags
    // to indicate a winner exists, then pick the contestant at/above threshold.
    const winnerLeadName = (state.flags && state.flags.has_winning_lead)
        ? (leads.find(l => (l.points || 0) >= winThreshold)?.name || null)
        : null;
    const winnerFollowName = (state.flags && state.flags.has_winning_follow)
        ? (follows.find(f => (f.points || 0) >= winThreshold)?.name || null)
        : null;
    const canShowLeadCrown = Boolean(winnerLeadName);
    const canShowFollowCrown = Boolean(winnerFollowName);

    // Build participation maps from accumulated rounds
    const leadMap = new Map();
    const followMap = new Map();
    rounds.forEach(r => {
        const rn = r.round_num;
        const l1 = r.pairs?.pair_1?.lead; const f1 = r.pairs?.pair_1?.follow;
        const l2 = r.pairs?.pair_2?.lead; const f2 = r.pairs?.pair_2?.follow;
        if (l1) { if (!leadMap.has(l1)) leadMap.set(l1, []); leadMap.get(l1).push({round: rn, win: r.lead_winner===l1}); }
        if (l2) { if (!leadMap.has(l2)) leadMap.set(l2, []); leadMap.get(l2).push({round: rn, win: r.lead_winner===l2}); }
        if (f1) { if (!followMap.has(f1)) followMap.set(f1, []); followMap.get(f1).push({round: rn, win: r.follow_winner===f1}); }
        if (f2) { if (!followMap.has(f2)) followMap.set(f2, []); followMap.get(f2).push({round: rn, win: r.follow_winner===f2}); }
    });

    // Clear containers
    liveLeadGraphic.innerHTML = '';
    liveFollowGraphic.innerHTML = '';

    const renderColumn = (ordered: string[], map: Map<string, { round: number; win: boolean }[]>, crownName: string | null, container: HTMLElement, showCrown: boolean) => {
        ordered.forEach((entry, idx) => {
            const name = entry;
            const row = document.createElement('div');
            row.className = 'graphic-row';
            const rank = document.createElement('div');
            rank.className = 'graphic-rank';
            rank.textContent = `${idx + 1}.`;
            const nameDiv = document.createElement('div');
            nameDiv.className = 'graphic-name';
            nameDiv.textContent = name;
            if (showCrown && crownName && name === crownName) {
                const crown = document.createElement('span');
                crown.className = 'crown-icon';
                crown.textContent = '👑';
                nameDiv.appendChild(crown);
            }
            const badges = document.createElement('div');
            badges.className = 'round-badges';
            const roundsFor = (map.get(name) || []).slice().sort((a,b)=>a.round-b.round);
            roundsFor.forEach(info => {
                const b = document.createElement('div');
                b.className = 'badge' + (info.win ? ' win' : '');
                b.textContent = String(info.round);
                badges.appendChild(b);
            });
            row.appendChild(rank);
            row.appendChild(nameDiv);
            row.appendChild(badges);
            container.appendChild(row);
        });
    };

    // Strictly follow initial order; fall back to scoreboard names if absent
    const orderedLeads = Array.isArray(state.initial_order?.leads)
        ? state.initial_order.leads
        : (leads || []).map(l => l.name);
    const orderedFollows = Array.isArray(state.initial_order?.follows)
        ? state.initial_order.follows
        : (follows || []).map(f => f.name);
    renderColumn(orderedLeads, leadMap, winnerLeadName, liveLeadGraphic, canShowLeadCrown);
    renderColumn(orderedFollows, followMap, winnerFollowName, liveFollowGraphic, canShowFollowCrown);
}

function updateMiniLeaderboard() {
    const leadContainer = document.getElementById('mini-lead-standings')!;
    const followContainer = document.getElementById('mini-follow-standings')!;
    if (!leadContainer || !followContainer) return;

    function renderStandings(contestants: ScoreboardRow[], container: HTMLElement) {
        container.innerHTML = '';
        if (!contestants || contestants.length === 0) return;
        const sorted = [...contestants].sort((a, b) => (b.points || 0) - (a.points || 0));
        sorted.forEach((c, i) => {
            const row = document.createElement('div');
            row.className = 'standings-row';
            const name = c.name || c;
            const points = c.points || 0;
            row.innerHTML =
                '<span class="rank">' + (i + 1) + '</span>' +
                '<span class="name">' + name + '</span>' +
                '<div class="bar-track"><div class="fill" style="width: ' + Math.min((points / 7) * 100, 100) + '%"></div></div>' +
                '<span class="pts">' + points + '</span>';
            container.appendChild(row);
        });
    }

    renderStandings(currentLeads, leadContainer);
    renderStandings(currentFollows, followContainer);
}

function updateContestantOrder(state: GameStateResponse) {
    // Update the contestant order visualization showing who's competing now and who's next
    const leadOrderList = document.getElementById('lead-order-list');
    const followOrderList = document.getElementById('follow-order-list');
    
    if (!leadOrderList || !followOrderList) return;
    
    // Get queue order from state
    const leadOrder = state.queue_order?.leads || [];
    const followOrder = state.queue_order?.follows || [];
    const currentRoundNumber = state.round?.number || null;
    
    // Detect if this is a round change in display mode and identify losers
    // Skip animation if round went backwards (undo) or if undo is in progress
    const roundWentForward = previousRoundNumber !== null && currentRoundNumber !== null && currentRoundNumber > previousRoundNumber;
    const roundChanged = display.active && roundWentForward && !isUndoInProgress;
    
    // Find losers: contestants who were in top 2 but are now at the back
    // Returns an array to handle both normal (1 loser) and no-contest (2 losers) cases
    const findLosers = (prevOrder: string[], newOrder: string[]) => {
        if (prevOrder.length < 2 || newOrder.length < 2) return [];
        const prevTop2 = prevOrder.slice(0, 2);
        const newTop2 = newOrder.slice(0, 2);
        const losers: string[] = [];
        // Find all contestants who were in prevTop2 but are not in newTop2 (moved to back)
        for (const name of prevTop2) {
            if (!newTop2.includes(name) && newOrder.includes(name)) {
                losers.push(name);
            }
        }
        return losers;
    };
    
    const leadLosers = roundChanged ? findLosers(previousLeadOrder, leadOrder) : [];
    const followLosers = roundChanged ? findLosers(previousFollowOrder, followOrder) : [];
    
    // If we have losers and are in display mode, animate the transition (unless skipped for stagger sequence)
    if (display.active && roundChanged && (leadLosers.length > 0 || followLosers.length > 0) && !animationInProgress) {
        if (skipQueueAnimationOnNextRender) {
            // Store animation data for later - will be triggered after stagger fade-in
            // KEEP the old order in DOM - don't render new order yet
            // The animation will transition from old (current DOM) to new order
            pendingQueueAnimationData = {
                leadContainer: leadOrderList,
                followContainer: followOrderList,
                leadOrder: [...leadOrder],       // NEW order to animate TO
                followOrder: [...followOrder],   // NEW order to animate TO
                leadLosers: [...leadLosers],
                followLosers: [...followLosers]
            };
            // Don't render - keep old order visible for animation start
        } else {
            animateQueueTransition(leadOrderList, followOrderList, leadOrder, followOrder, leadLosers, followLosers);
        }
    } else {
        // No animation needed, just render normally
        renderOrderListImmediate(leadOrder, leadOrderList, 'lead', []);
        renderOrderListImmediate(followOrder, followOrderList, 'follow', []);
    }
    
    // Store current order for next comparison
    previousLeadOrder = [...leadOrder];
    previousFollowOrder = [...followOrder];
    previousRoundNumber = currentRoundNumber;

    // Update "Next Up" section for display mode
    // The queue order shows: index 0 and 1 are currently competing, index 2 is next up
    const nextUpLead = document.getElementById('next-up-lead');
    const nextUpFollow = document.getElementById('next-up-follow');
    if (nextUpLead) nextUpLead.textContent = leadOrder[2] || '—';
    if (nextUpFollow) nextUpFollow.textContent = followOrder[2] || '—';
}

function renderOrderListImmediate(order: string[], container: HTMLElement, role: 'lead' | 'follow', loserNames: string[]) {
    // Clear existing list
    container.innerHTML = '';
    // Ensure loserNames is an array
    const losers = Array.isArray(loserNames) ? loserNames : (loserNames ? [loserNames] : []);
    
    order.forEach((name, idx) => {
        const li = document.createElement('li');
        li.className = 'order-item';
        li.dataset.name = name;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'order-name';
        nameSpan.textContent = name;
        
        if (idx < 2) {
            // Current round participants - bold
            li.classList.add('current-participant');
        } else if (idx === 2) {
            // Next new participant - semi-bold
            li.classList.add('next-participant');
        }
        
        // Mark losers for potential animation styling
        if (losers.includes(name)) {
            li.classList.add('loser-arrived');
        }
        
        li.appendChild(nameSpan);
        container.appendChild(li);
    });
}

function animateQueueTransition(leadContainer: HTMLElement, followContainer: HTMLElement, newLeadOrder: string[], newFollowOrder: string[], leadLosers: string[], followLosers: string[]) {
    animationInProgress = true;
    
    // Animation timing constants (longer for spectator visibility)
    const EXIT_DURATION = 1000;  // 1 second for exit animation
    const ENTRY_DURATION = 1200; // 1.2 seconds for entry animation
    const CLEANUP_BUFFER = 200;  // Buffer before allowing next animation
    
    // Ensure losers are arrays
    const leadLosersArr = Array.isArray(leadLosers) ? leadLosers : (leadLosers ? [leadLosers] : []);
    const followLosersArr = Array.isArray(followLosers) ? followLosers : (followLosers ? [followLosers] : []);
    
    // Phase 1: Mark losers in the old list with exit animation
    const animateColumnExit = (container: HTMLElement, loserNames: string[]) => {
        if (loserNames.length === 0) return;
        const items = container.querySelectorAll<HTMLElement>('.order-item');
        items.forEach(item => {
            if (loserNames.includes(item.dataset.name ?? '')) {
                item.classList.add('animating-out');
            }
        });
    };
    
    animateColumnExit(leadContainer, leadLosersArr);
    animateColumnExit(followContainer, followLosersArr);
    
    // Phase 2: After exit animation, render new list with entry animation for losers
    setTimeout(() => {
        renderOrderListImmediate(newLeadOrder, leadContainer, 'lead', leadLosersArr);
        renderOrderListImmediate(newFollowOrder, followContainer, 'follow', followLosersArr);
        
        // Apply entry animation to losers at their new position
        requestAnimationFrame(() => {
            const applyEntryAnimation = (container: HTMLElement, loserNames: string[]) => {
                if (loserNames.length === 0) return;
                const items = container.querySelectorAll<HTMLElement>('.order-item');
                items.forEach(item => {
                    if (loserNames.includes(item.dataset.name ?? '')) {
                        item.classList.add('animating-in');
                        // Remove animation class after animation completes
                        setTimeout(() => {
                            item.classList.remove('animating-in', 'loser-arrived');
                        }, ENTRY_DURATION);
                    }
                });
            };
            
            applyEntryAnimation(leadContainer, leadLosersArr);
            applyEntryAnimation(followContainer, followLosersArr);
        });
        
        // Reset animation flag after all animations complete
        setTimeout(() => {
            animationInProgress = false;
        }, ENTRY_DURATION + CLEANUP_BUFFER);
    }, EXIT_DURATION); // Wait for exit animation to complete
}

async function refreshCanonicalState() {
    try {
        const state = await fetchCanonicalState();
        if (state) {
            // Keep initial order for results use
            if (Array.isArray(state.initial_order?.leads)) initialLeads = state.initial_order.leads;
            if (Array.isArray(state.initial_order?.follows)) initialFollows = state.initial_order.follows;
            renderFromState(state);
        }
    } catch (e) {
        console.error('refreshCanonicalState failed:', e);
    }
}

function handleFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
        uploadFileName.textContent = file.name;
        uploadError.textContent = '';
        uploadError.classList.remove('visible');
    } else {
        uploadFileName.textContent = '';
    }
}

async function processUploadedFile() {
    const file = battleFileUpload.files?.[0];
    
    if (!file) {
        uploadError.textContent = 'Please select a file to upload.';
        uploadError.classList.add('visible');
        return;
    }
    
    // Clear any previous error messages
    uploadError.textContent = '';
    uploadError.classList.remove('visible');

    // Keep a raw copy of the uploaded payload so results can be edited/re-processed later
    let rawPayload = null;
    try {
        rawPayload = JSON.parse(await file.text());
    } catch {
        rawPayload = null;
    }

    // Create FormData object
    const formData = new FormData();
    formData.append('battle_file', file);

    try {
        console.log('Uploading file:', file.name);
        const response = await fetch('/api/process_uploaded_file', {
            method: 'POST',
            body: formData
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Received data:', data);
        
        if (data.error) {
            console.error('Error in response:', data.error);
            uploadError.textContent = data.error;
            uploadError.classList.add('visible');
            return;
        }
        
        // Store initial order data
        initialLeads = data.initial_leads || [];
        initialFollows = data.initial_follows || [];
        
        console.log("Initial leads:", initialLeads);
        console.log("Initial follows:", initialFollows);
        
        // Check leads data
        if (data.leads) {
            console.log("Lead data:", data.leads);
            console.log(`Processing ${data.leads.length} leads:`);
            data.leads.forEach((lead: { name?: string; points?: number | string | null }, i: number) => {
                console.log(`Lead ${i}:`, lead, "Points:", lead.points, "Type:", typeof lead.points);
                // Convert points to number if needed
                if (lead.points !== undefined && lead.points !== null) {
                    if (typeof lead.points !== 'number') {
                        lead.points = parseInt(lead.points, 10) || 0;
                        console.log(`Converted lead ${lead.name} points to:`, lead.points);
                    }
                } else {
                    lead.points = 0;
                    console.log(`Set default points (0) for lead ${lead.name}`);
                }
            });
        }
        
        // Check follows data
        if (data.follows) {
            console.log("Follow data:", data.follows);
            console.log(`Processing ${data.follows.length} follows:`);
            data.follows.forEach((follow: { name?: string; points?: number | string | null }, i: number) => {
                console.log(`Follow ${i}:`, follow, "Points:", follow.points, "Type:", typeof follow.points);
                // Convert points to number if needed
                if (follow.points !== undefined && follow.points !== null) {
                    if (typeof follow.points !== 'number') {
                        follow.points = parseInt(follow.points, 10) || 0;
                        console.log(`Converted follow ${follow.name} points to:`, follow.points);
                    }
                } else {
                    follow.points = 0;
                    console.log(`Set default points (0) for follow ${follow.name}`);
                }
            });
        }
        
        // Display the results
        setUploadedBattlePayload(rawPayload);
        data.uploaded = true;
        showResults(data, { sessionId: null });
    } catch (error) {
        console.error('Error processing file:', error);
        showUploadError(`Failed to process the file: ${error instanceof Error ? error.message : error}`);
    }
}

function showUploadError(message: string) {
    uploadError.textContent = message;
    uploadError.classList.add('visible');
}

// Function to update session ID display
function updateSessionIdDisplay() {
    const sessionIdDisplay = document.getElementById('session-id-display');
    if (!sessionIdDisplay) return;
    if (!sessionId) {
        sessionIdDisplay.textContent = '';
        sessionIdDisplay.className = 'session-id-display';
        return;
    }
    const isMinimized = localStorage.getItem('session-info-minimized') !== 'false';
    if (sessionId && !display.active) {
        const displayUrl = `${window.location.origin}/battle/${encodeURIComponent(sessionId)}?mode=display`;
        sessionIdDisplay.innerHTML = `
            <div class="session-id-display-header">
                <span class="session-id-display-label">Session: ${sessionId}</span>
                <button type="button" class="session-id-display-toggle" title="${isMinimized ? 'Expand' : 'Minimize'}" aria-label="${isMinimized ? 'Expand' : 'Minimize'}">${isMinimized ? '▶' : '−'}</button>
            </div>
            <div class="session-id-display-body">
                <div class="display-url-info">
                    <span>Display URL (for viewers):</span>
                    <input type="text" readonly value="${displayUrl}" onclick="this.select()" class="display-url-input" />
                    <button type="button" class="btn-copy" onclick="navigator.clipboard.writeText('${displayUrl}').then(() => this.textContent = 'Copied!').catch(() => {})">Copy</button>
                </div>
                <div class="display-url-qr">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(displayUrl)}" alt="QR code for display URL" class="display-url-qr-img" />
                </div>
            </div>
        `;
        sessionIdDisplay.classList.toggle('session-id-display--minimized', isMinimized);
        const toggleBtn = sessionIdDisplay.querySelector<HTMLElement>('.session-id-display-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const minimized = sessionIdDisplay.classList.toggle('session-id-display--minimized');
                localStorage.setItem('session-info-minimized', minimized ? 'true' : 'false');
                toggleBtn.textContent = minimized ? '▶' : '−';
                toggleBtn.title = minimized ? 'Expand' : 'Minimize';
                toggleBtn.setAttribute('aria-label', minimized ? 'Expand' : 'Minimize');
            });
        }
    } else if (sessionId) {
        sessionIdDisplay.innerHTML = `
            <div class="session-id-display-header">
                <span class="session-id-display-label">Session: ${sessionId}</span>
                <button type="button" class="session-id-display-toggle" title="${isMinimized ? 'Expand' : 'Minimize'}" aria-label="${isMinimized ? 'Expand' : 'Minimize'}">${isMinimized ? '▶' : '−'}</button>
            </div>
            <div class="session-id-display-body">Session: ${sessionId}</div>
        `;
        sessionIdDisplay.classList.toggle('session-id-display--minimized', isMinimized);
        const toggleBtn = sessionIdDisplay.querySelector<HTMLElement>('.session-id-display-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const minimized = sessionIdDisplay.classList.toggle('session-id-display--minimized');
                localStorage.setItem('session-info-minimized', minimized ? 'true' : 'false');
                toggleBtn.textContent = minimized ? '▶' : '−';
                toggleBtn.title = minimized ? 'Expand' : 'Minimize';
                toggleBtn.setAttribute('aria-label', minimized ? 'Expand' : 'Minimize');
            });
        }
    }
}

// Update the startCompetition function
async function startCompetition(useSimpleContestantJudges: boolean, allowContestantJudging = true) {
    const leads = leadNamesInput.value.trim();
    const follows = followNamesInput.value.trim();
    const judges = judgeNamesInput.value.trim();
    
    // Handle points to win mode
    const pointsToWinMode = pointsToWinModeSelect ? pointsToWinModeSelect.value : 'default';
    let points_to_win = null;
    let points_to_win_mode = pointsToWinMode;
    
    if (pointsToWinMode === 'custom') {
        const pointsToWinRaw = pointsToWinInput ? pointsToWinInput.value.trim() : '';
        if (pointsToWinRaw !== '') {
            points_to_win = parseInt(pointsToWinRaw, 10);
        }
        // If custom but no value entered, fall back to default
        if (points_to_win === null || isNaN(points_to_win)) {
            points_to_win_mode = 'default';
        }
    }
    
    // Handle num contestant judges
    const numContestantJudgesRaw = numContestantJudgesInput ? numContestantJudgesInput.value.trim() : '';
    const num_contestant_judges = numContestantJudgesRaw === '' ? null : parseInt(numContestantJudgesRaw, 10);
    
    const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
    const playlistUrlRaw = (spotifyOn && playlistUrlInput) ? playlistUrlInput.value.trim() : '';
    const contestantJudgingRequested = allowContestantJudging !== false;
    const simpleModeRequested = contestantJudgingRequested && !!useSimpleContestantJudges;
    const randomizeOrder = randomizeOrderToggle ? randomizeOrderToggle.checked : true;
    // Present on /setup?prelim=<id> (the roster came from a prelim). Sending it links the
    // battle back to the prelim so its spectator display can redirect here.
    const prelimSessionId = new URLSearchParams(window.location.search).get('prelim');

    if (!leads || !follows || !judges) {
        showToast('Please enter names for leads, follows, and judges.', 'error');
        return;
    }

    setButtonLoading(startCompetitionBtn, true);
    try {
        const response = await fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leads,
                follows,
                judges,
                points_to_win,
                points_to_win_mode,
                num_contestant_judges,
                playlist_url: playlistUrlRaw,
                simple_contestant_judges: simpleModeRequested,
                contestant_judging_enabled: contestantJudgingRequested,
                randomize_order: randomizeOrder,
                prelim_session_id: prelimSessionId
            })
        });
        
        const data = await response.json();
        
        // Check for contestant judges warning and show confirmation if needed
        if (data.contestant_judges_warning) {
            const proceed = confirm(data.contestant_judges_warning + '\n\nDo you want to proceed anyway?');
            if (!proceed) {
                return; // User cancelled, don't start the game
            }
        }
        
        sessionId = data.session_id;
        localStorage.setItem('sessionId', data.session_id);  // Store in localStorage
        guestJudges = data.guest_judges;
        initialLeads = data.initial_leads;  // Store initial order
        initialFollows = data.initial_follows;  // Store initial order
        contestantJudgingEnabled = data.contestant_judging_enabled !== false;
        if (Object.prototype.hasOwnProperty.call(data, 'simple_contestant_judges')) {
            simpleContestantJudgesEnabled = contestantJudgingEnabled && !!data.simple_contestant_judges;
        } else {
            simpleContestantJudgesEnabled = contestantJudgingEnabled && !!simpleModeRequested;
        }
        
        // Store the actual points to win for display
        if (data.points_to_win) {
            console.log(`Game started with points to win: ${data.points_to_win} (auto-calculated would be: ${data.auto_win_threshold})`);
        }
        
        // Update session ID display
        updateSessionIdDisplay();

        // Initialize playlist mode if Spotify is enabled and a playlist URL is present
        playlist.pendingUrl = spotifyOn ? playlistUrlRaw : '';
        if (spotifyOn && playlist.pendingUrl) {
            await maybeEnablePlaylistMode(playlist.pendingUrl, sessionId);
        } else {
            disablePlaylistMode('Spotify disabled or no playlist');
        }
        
        // Render from canonical state
        await refreshCanonicalState();

        // Navigate to the battle route (shareable/reloadable URL)
        liveBattleActive = true;
        navigate('/battle/' + encodeURIComponent(sessionId ?? ''));

        // Demo mode hook: advance past the "Start Competition" step
        demoActionCompleted('wait-for-start');
    } catch (error) {
        console.error('Error starting game:', error);
        showToast('Failed to start game: ' + ((error instanceof Error && error.message) || 'Unknown error'), 'error');
    } finally {
        setButtonLoading(startCompetitionBtn, false);
    }
}

function fetchScores() {
    fetch(`/api/get_scores?session_id=${sessionId}`)
        .then(response => response.json())
        .then(async data => {
            // Store current scores data
            currentLeads = data.leads || [];
            currentFollows = data.follows || [];
            
            // If server echoed playlist_url and we haven't enabled mode yet, enable it
            try {
                const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
                if (spotifyOn && !playlist.modeEnabled && data.playlist_url) {
                    playlist.pendingUrl = data.playlist_url;
                    await maybeEnablePlaylistMode(data.playlist_url, sessionId);
                    playlist.pendingUrl = null;
                }
            } catch { /* ignore */ }

            // Update current scores display
            updateScoresDisplay();
            
            // Update score tables with new data (for final results)
            updateScoreTable(data.leads, data.follows);
        })
        .catch(error => {
            console.error('Error fetching scores:', error);
        });
}

function updateScoresDisplay() {
    // These list containers are not present in the current markup (standings render
    // via the mini-leaderboard and battle graphic); bail out safely if absent.
    if (!currentLeadScores || !currentFollowScores) return;

    // Clear current lists
    currentLeadScores.innerHTML = '';
    currentFollowScores.innerHTML = '';

    // Sort contestants by points (highest first)
    const sortedLeads = [...currentLeads].sort((a, b) => b.points - a.points);
    const sortedFollows = [...currentFollows].sort((a, b) => b.points - a.points);
    
    // Add leads to the list
    sortedLeads.forEach(lead => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="score-name">${lead.name}${lead.is_winner ? ' 👑' : ''}</span><span class="score-points">${lead.points}</span>`;
        currentLeadScores.appendChild(li);
    });
    
    // Add follows to the list
    sortedFollows.forEach(follow => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="score-name">${follow.name}${follow.is_winner ? ' 👑' : ''}</span><span class="score-points">${follow.points}</span>`;
        currentFollowScores.appendChild(li);
    });
}

function setupVotingUI() {
    // Clear previous voting UI
    leadJudgesContainer.innerHTML = '';
    followJudgesContainer.innerHTML = '';
    
    const allJudges = buildJudgeRoster();
    
    // Create lead voting UI
    allJudges.forEach(judge => {
        const isGuest = guestJudges.includes(judge);
        const judgeCard = createJudgeVotingCard(judge, isGuest, 'lead');
        leadJudgesContainer.appendChild(judgeCard);
    });
    
    // Create follow voting UI
    allJudges.forEach(judge => {
        const isGuest = guestJudges.includes(judge);
        const judgeCard = createJudgeVotingCard(judge, isGuest, 'follow');
        followJudgesContainer.appendChild(judgeCard);
    });
    
    // Hide winner previews initially
    leadWinnerPreview.classList.add('hidden');
    followWinnerPreview.classList.add('hidden');
    
    // Initialize submit button state
    updateSubmitButtonState();
}

function createJudgeVotingCard(judgeName: string, isGuest: boolean, voteType: VoteType) {
    const row = document.createElement('div');
    row.className = 'judge-row';
    row.id = `${voteType}-judge-${judgeName.replace(/\s+/g, '-').toLowerCase()}`;

    // Avatar with initials
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    const initials = judgeName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    avatar.textContent = initials;

    // Judge name
    const judgeNameEl = document.createElement('span');
    judgeNameEl.className = 'judge-name';
    judgeNameEl.textContent = judgeName + (isGuest ? ' (Guest)' : '');

    // Vote chips container
    const voteChips = document.createElement('div');
    voteChips.className = 'vote-chips';

    const option1Name = voteType === 'lead' ? lead1Name.textContent : follow1Name.textContent;
    const option2Name = voteType === 'lead' ? lead2Name.textContent : follow2Name.textContent;
    const isProxyContestantJudges = simpleContestantJudgesEnabled && judgeName === PROXY_CONTESTANT_JUDGES_NAME;

    // Helper to handle chip click
    function onChipClick(chip: HTMLButtonElement, voteValue: number) {
        if (votingLocked[voteType]) return;
        if (chip.disabled) return;
        voteChips.querySelectorAll('.vote-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        row.classList.add('voted');
        avatar.classList.add('voted');
        recordVote(judgeName, voteValue, voteType);
    }

    // Option 1 chip
    const option1Chip = document.createElement('button');
    option1Chip.className = 'vote-chip';
    option1Chip.textContent = option1Name;
    option1Chip.addEventListener('click', () => onChipClick(option1Chip, 1));

    // Mixed chip (proxy contestant judges only)
    let mixedChip: HTMLButtonElement | null = null;
    if (isProxyContestantJudges) {
        mixedChip = document.createElement('button');
        mixedChip.className = 'vote-chip vote-option-mixed';
        mixedChip.textContent = 'Mixed';
        mixedChip.disabled = true;
        mixedChip.style.display = 'none'; // Hidden until a guest judge picks Tie or NC
        const chip = mixedChip;
        chip.addEventListener('click', () => onChipClick(chip, VOTE_MIXED));
    }

    // Option 2 chip
    const option2Chip = document.createElement('button');
    option2Chip.className = 'vote-chip';
    option2Chip.textContent = option2Name;
    option2Chip.addEventListener('click', () => onChipClick(option2Chip, 2));

    voteChips.appendChild(option1Chip);
    if (mixedChip) voteChips.appendChild(mixedChip);
    voteChips.appendChild(option2Chip);

    // Tie and No Contest chips for guest judges
    if (isGuest) {
        const tieChip = document.createElement('button');
        tieChip.className = 'vote-chip tie-chip';
        tieChip.textContent = 'Tie';
        tieChip.addEventListener('click', () => onChipClick(tieChip, 3));

        const ncChip = document.createElement('button');
        ncChip.className = 'vote-chip nc-chip';
        ncChip.textContent = 'NC';
        ncChip.addEventListener('click', () => onChipClick(ncChip, 4));

        voteChips.appendChild(tieChip);
        voteChips.appendChild(ncChip);
    }

    row.appendChild(avatar);
    row.appendChild(judgeNameEl);
    row.appendChild(voteChips);

    return row;
}

function recordVote(judgeName: string, voteOption: number, voteType: VoteType) {
    if (voteType === 'lead') {
        leadVotes[judgeName] = voteOption;
    } else if (voteType === 'follow') {
        followVotes[judgeName] = voteOption;
    }
    console.log(`${voteType} vote recorded for ${judgeName}: ${voteOption}`);

    // Demo mode hook: advance once ALL votes for a role are cast
    {
        const demoAction = voteType === 'lead' ? 'wait-for-lead-vote' : 'wait-for-follow-vote';
        if (currentDemoAction() === demoAction) {
            const votes = voteType === 'lead' ? leadVotes : followVotes;
            const allJudges = buildJudgeRoster();
            const allVoted = allJudges.every(j => votes[j] !== undefined);
            if (allVoted) {
                demoActionCompleted(demoAction);
            }
        }
    }

    // Update mixed button availability based on tie/no contest votes
    updateMixedButtonState(voteType);

    // Update submit button state based on voting progress
    updateSubmitButtonState();
}

// Check if any guest judge has voted tie (3) or no contest (4) for the given vote type
function hasGuestTieOrNoContest(voteType: VoteType) {
    const votes = voteType === 'lead' ? leadVotes : followVotes;
    return (guestJudges || []).some(judge => {
        const vote = votes[judge];
        return vote === 3 || vote === 4; // 3 = tie, 4 = no contest
    });
}

// Check if ALL guest judges who have voted have ONLY voted tie or no contest (no votes for contestant 1 or 2)
// Returns true if all guest votes are tie/no contest, meaning there's no clear winner to base the mixed vote on
function allGuestsOnlyTieOrNoContest(voteType: VoteType) {
    const votes = voteType === 'lead' ? leadVotes : followVotes;
    const guestVotes = (guestJudges || []).map(judge => votes[judge]).filter(v => v !== undefined);
    
    // If no guest votes yet, return false (don't disable mixed prematurely)
    if (guestVotes.length === 0) return false;
    
    // Check if all guest votes are only tie (3) or no contest (4)
    return guestVotes.every(vote => vote === 3 || vote === 4);
}

// Update the mixed button's enabled/disabled state for the given vote type
function updateMixedButtonState(voteType: VoteType) {
    if (!simpleContestantJudgesEnabled) return;
    
    const proxyCardId = `${voteType}-judge-${PROXY_CONTESTANT_JUDGES_NAME.replace(/\s+/g, '-').toLowerCase()}`;
    const proxyCard = document.getElementById(proxyCardId);
    if (!proxyCard) return;
    
    const mixedBtn = proxyCard.querySelector<HTMLButtonElement>('.vote-option-mixed');
    if (!mixedBtn) return;
    
    // Enable mixed only if there's a tie/no contest vote AND at least one guest voted for a contestant
    // If ALL guest votes are only tie/no contest, there's no winner to base the mixed split on
    const hasTieOrNoContest = hasGuestTieOrNoContest(voteType);
    const allOnlyTieOrNoContest = allGuestsOnlyTieOrNoContest(voteType);
    const shouldEnable = hasTieOrNoContest && !allOnlyTieOrNoContest;
    mixedBtn.disabled = !shouldEnable;
    mixedBtn.style.display = shouldEnable ? '' : 'none';

    // If mixed was selected but is now disabled, clear the selection
    if (!shouldEnable && mixedBtn.classList.contains('selected')) {
        mixedBtn.classList.remove('selected');
        // Clear the vote for the proxy judge
        if (voteType === 'lead') {
            delete leadVotes[PROXY_CONTESTANT_JUDGES_NAME];
        } else {
            delete followVotes[PROXY_CONTESTANT_JUDGES_NAME];
        }
        proxyCard.classList.remove('voted');
        const avatar = proxyCard.querySelector('.avatar');
        if (avatar) avatar.classList.remove('voted');
    }
}

function updateSubmitButtonState() {
    const allJudges = buildJudgeRoster();
    const leadVotesComplete = allJudges.every(judge => leadVotes[judge]);
    const followVotesComplete = allJudges.every(judge => followVotes[judge]);
    
    const submitBtn = document.getElementById('submit-votes') as HTMLButtonElement | null;
    if (submitBtn) {
        const leadCount = allJudges.filter(judge => leadVotes[judge]).length;
        const followCount = allJudges.filter(judge => followVotes[judge]).length;
        const total = allJudges.length * 2;
        const cast = leadCount + followCount;

        if (leadVotesComplete && followVotesComplete) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Votes';
            submitBtn.classList.remove('partial-votes');
        } else {
            // Smooth flow: disable confirm until all votes are in
            submitBtn.disabled = true;
            submitBtn.textContent = `Confirm Votes (${cast}/${total} cast)`;
            submitBtn.classList.add('partial-votes');
        }
    }
    
    // Show winner previews when all votes for a role are complete
    if (leadVotesComplete) {
        showWinnerPreview('lead');
    } else {
        hideWinnerPreview('lead');
    }
    
    if (followVotesComplete) {
        showWinnerPreview('follow');
    } else {
        hideWinnerPreview('follow');
    }
}

function showVoteConfirmError(message: string) {
    if (!voteConfirmError) return;
    voteConfirmError.textContent = message || '';
    if (message) {
        voteConfirmError.classList.remove('hidden');
    } else {
        voteConfirmError.classList.add('hidden');
    }
}

function openVoteConfirmModal() {
    if (!voteConfirmModal) return;

    // Guard: should not be available until after votes are cast
    const allJudges = buildJudgeRoster();
    const leadVotesComplete = allJudges.every(judge => leadVotes[judge]);
    const followVotesComplete = allJudges.every(judge => followVotes[judge]);
    if (!leadVotesComplete || !followVotesComplete) {
        // If something tries to open it early, keep it closed.
        closeVoteConfirmModal();
        return;
    }

    showVoteConfirmError('');

    // Populate round/contestants
    if (voteConfirmRound) voteConfirmRound.textContent = roundNumber ? roundNumber.textContent : '?';
    if (voteConfirmLead1) voteConfirmLead1.textContent = lead1Name ? lead1Name.textContent : '';
    if (voteConfirmLead2) voteConfirmLead2.textContent = lead2Name ? lead2Name.textContent : '';
    if (voteConfirmFollow1) voteConfirmFollow1.textContent = follow1Name ? follow1Name.textContent : '';
    if (voteConfirmFollow2) voteConfirmFollow2.textContent = follow2Name ? follow2Name.textContent : '';

    // Preview winners (requires all votes)
    const leadPreview = calculateWinner('lead');
    const followPreview = calculateWinner('follow');
    if (voteConfirmLeadWinner) voteConfirmLeadWinner.textContent = leadPreview || '—';
    if (voteConfirmFollowWinner) voteConfirmFollowWinner.textContent = followPreview || '—';

    if (!leadPreview || !followPreview) {
        showVoteConfirmError('Votes are not complete yet. Please make sure every judge has voted for both leads and follows.');
        if (voteConfirmSubmitBtn) voteConfirmSubmitBtn.disabled = true;
    } else {
        if (voteConfirmSubmitBtn) voteConfirmSubmitBtn.disabled = false;
    }

    voteConfirmModal.classList.remove('hidden');
    try {
        if (voteConfirmSubmitBtn) voteConfirmSubmitBtn.focus();
    } catch { /* ignore */ }
}

function closeVoteConfirmModal() {
    if (!voteConfirmModal) return;
    voteConfirmModal.classList.add('hidden');
    showVoteConfirmError('');
    try {
        if (submitVotesBtn) submitVotesBtn.focus();
    } catch { /* ignore */ }
}

function openEndEarlyModal() {
    if (!endEarlyModal) return;
    endEarlyModal.classList.remove('hidden');
    try {
        if (endEarlyConfirmBtn) endEarlyConfirmBtn.focus();
    } catch { /* ignore */ }
}

function closeEndEarlyModal() {
    if (!endEarlyModal) return;
    endEarlyModal.classList.add('hidden');
}

function calculateWinner(voteType: VoteType) {
    const votes = voteType === 'lead' ? leadVotes : followVotes;
    
    // Get contestant names
    const contestant1 = voteType === 'lead' ? lead1Name.textContent : follow1Name.textContent;
    const contestant2 = voteType === 'lead' ? lead2Name.textContent : follow2Name.textContent;
    
    // Check if all votes are present
    const allJudges = buildJudgeRoster();
    const hasAllVotes = allJudges.every(judge => votes[judge]);
    if (!hasAllVotes) {
        return null; // Not all votes are in yet
    }
    
    // Convert votes to the format expected by the game logic
    const votesArray = buildEffectiveVotesArray(voteType);
    
    // Calculate winner using the same logic as the backend
    const guestVotes = votesArray.filter(([judge]) => guestJudges.includes(judge)).map(([, vote]) => vote);
    
    // Check for special cases - need all guest judges to vote the same
    if (guestVotes.length > 0 && guestVotes.every(vote => vote === 3)) {
        return `Tie between ${contestant1} and ${contestant2}`;
    }
    
    if (guestVotes.length > 0 && guestVotes.every(vote => vote === 4)) {
        return "No Contest";
    }
    
    // Calculate scores
    let score1 = 0;
    let score2 = 0;
    
    for (const [judge, vote] of votesArray) {
        const isGuest = guestJudges.includes(judge);
        const voteWeight = isGuest ? 2 : 1;
        
        if (vote === 1) {
            score1 += voteWeight;
        } else if (vote === 2) {
            score2 += voteWeight;
        } else if (vote === 3 && isGuest) {
            score1 += 1;
            score2 += 1;
        }
    }
    
    // Winner is whoever has higher score, ties go to contestant 1
    return score1 >= score2 ? contestant1 : contestant2;
}

function showWinnerPreview(voteType: VoteType) {
    const winner = calculateWinner(voteType);
    
    // Only show preview if we have a calculated winner
    if (winner) {
        if (voteType === 'lead') {
            leadPreviewName.textContent = winner;
            leadWinnerPreview.classList.remove('hidden');
        } else {
            followPreviewName.textContent = winner;
            followWinnerPreview.classList.remove('hidden');
        }
    } else {
        hideWinnerPreview(voteType);
    }
}

function hideWinnerPreview(voteType: VoteType) {
    if (voteType === 'lead') {
        leadWinnerPreview.classList.add('hidden');
    } else {
        followWinnerPreview.classList.add('hidden');
    }
}

// Lock all voting buttons for a specific vote type (lead or follow)
function lockVoting(voteType: VoteType) {
    votingLocked[voteType] = true;
    
    // Get all judge rows for this vote type
    const container = voteType === 'lead' ? leadJudgesContainer : followJudgesContainer;
    const judgeRows = container.querySelectorAll('.judge-row');

    // Add a 'locked' class to all judge rows and vote chips
    judgeRows.forEach(row => {
        row.classList.add('locked');
        row.querySelectorAll('.vote-chip').forEach(chip => {
            chip.classList.add('locked');
        });
    });
}

async function submitCombinedVotes(options: { autoAdvance?: boolean } = {}) {
    if (isSubmitting) return;
    isSubmitting = true;
    const allJudges = buildJudgeRoster();
    
    // Check if all judges have voted for both lead and follow
    const missingLeadVotes = allJudges.filter(judge => !leadVotes[judge]);
    const missingFollowVotes = allJudges.filter(judge => !followVotes[judge]);
    
    if (missingLeadVotes.length > 0 || missingFollowVotes.length > 0) {
        const totalMissing = Math.max(missingLeadVotes.length, missingFollowVotes.length);
        const msg = `Waiting for votes from ${totalMissing} judge(s). Please ensure all judges have voted for both leads and follows.`;
        // If the modal is open, show inline error; otherwise fallback to alert
        if (voteConfirmModal && !voteConfirmModal.classList.contains('hidden')) {
            showVoteConfirmError(msg);
        } else {
            showToast(msg, 'error');
        }
        isSubmitting = false;
        return;
    }

    // Convert votes to arrays for API, expanding the proxy judge when simple contestant judges is enabled.
    const leadVotesArray = buildEffectiveVotesArray('lead');
    const followVotesArray = buildEffectiveVotesArray('follow');
    
    // Get song information (Spotify fields only when integration is enabled)
    const songInput = document.getElementById('song-input') as HTMLInputElement | null;
    const songInfo: { spotify_url?: string; title?: string; artist?: string } = {};
    const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
    if (spotifyOn) {
        if (playlist.modeEnabled && playlist.currentRoundTrack && playlist.currentRoundTrack.id) {
            songInfo.spotify_url = `https://open.spotify.com/track/${playlist.currentRoundTrack.id}`;
            songInfo.title = playlist.currentRoundTrack.name || '';
            songInfo.artist = playlist.currentRoundTrack.artists || '';
        } else if (songInput && songInput.value) {
            try {
                const spotifyUrl = new URL(songInput.value);
                if (spotifyUrl.hostname === 'open.spotify.com') {
                    songInfo.spotify_url = songInput.value;
                }
            } catch (e) {
                console.error('Invalid Spotify URL:', e);
            }
        }
    }
    
    // Lock voting and disable the button to prevent further changes
    lockVoting('lead');
    lockVoting('follow');
    setButtonLoading(submitVotesBtn, true);
    if (voteConfirmSubmitBtn) voteConfirmSubmitBtn.disabled = true;

    try {
        const response = await fetch('/api/judge_combined', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                lead_votes: leadVotesArray,
                follow_votes: followVotesArray,
                song_info: songInfo
            })
        });
        
        const data = await response.json();
        
        // If playlist mode, mark this track as used after successful submission
        markCurrentRoundTrackUsed(sessionId);
        
        // Close the modal on successful submit
        closeVoteConfirmModal();

        // Demo mode hook: advance past the "Submit" step
        demoActionCompleted('wait-for-submit');

        const shouldAutoAdvance = options && options.autoAdvance === true;
        const showResultsInRound = !shouldAutoAdvance || data.game_finished;

        if (showResultsInRound) {
            // Update results UI
            leadWinner.textContent = data.lead_winner;
            leadGuestVotes.textContent = data.lead_guest_votes.join(', ') || 'None';
            leadContestantVotes.textContent = data.lead_contestant_votes.join(', ') || 'None';
            
            followWinner.textContent = data.follow_winner;
            followGuestVotes.textContent = data.follow_guest_votes.join(', ') || 'None';
            followContestantVotes.textContent = data.follow_contestant_votes.join(', ') || 'None';
            
            // Show results
            votingResults.classList.remove('hidden');
            
            // Show win messages if any
            if (data.win_messages && data.win_messages.length > 0) {
                winMessages.innerHTML = data.win_messages.map((msg: string) => `<p>${msg}</p>`).join('');
            }
            
            // Show round results section
            roundResultsSection.classList.remove('hidden');
            
            // If game is finished, disable next round button
            if (data.game_finished) {
                nextRoundBtn.disabled = true;
            }
        } else {
            // Keep the UI clean; we’re auto-advancing
            votingResults.classList.add('hidden');
            roundResultsSection.classList.add('hidden');
            winMessages.innerHTML = '';
        }
        
        // Update live graphic immediately with the latest canonical state
        try {
            const state = await fetchCanonicalState();
            if (state) {
                updateLiveGraphicFromState(state);
                updateMiniLeaderboard();
            }
        } catch { /* ignore */ }

        // Auto-advance to the next round (unless game finished)
        if (shouldAutoAdvance && !data.game_finished) {
            try {
                await goToNextRound();
            } catch {
                // If next round fails, allow the user to try again
                votingLocked.lead = false;
                votingLocked.follow = false;
                setButtonLoading(submitVotesBtn, false);
                if (voteConfirmSubmitBtn) voteConfirmSubmitBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error submitting combined votes:', error);
        const msg = 'Failed to submit votes. Please try again.';
        if (voteConfirmModal && !voteConfirmModal.classList.contains('hidden')) {
            showVoteConfirmError(msg);
        } else {
            showToast('Error submitting votes', 'error');
        }
        votingLocked.lead = false; // Unlock voting if there's an error
        votingLocked.follow = false;
        setButtonLoading(submitVotesBtn, false);
        if (voteConfirmSubmitBtn) voteConfirmSubmitBtn.disabled = false;
    } finally {
        isSubmitting = false;
        setButtonLoading(submitVotesBtn, false);
    }
}

async function goToNextRound() {
    try {
        const response = await fetch('/api/next_round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        await response.json();
        
        // Render from canonical state
        await refreshCanonicalState();
        
        // Scroll to top so current contestants are visible
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error starting next round:', error);
        showToast('Failed to advance round', 'error');
    }
}

async function undoLastRound() {
    if (!sessionId) {
        showToast('No active session to undo.', 'error');
        return;
    }

    // Disable button while processing to prevent double-clicks
    if (undoRoundBtn) undoRoundBtn.disabled = true;

    try {
        const response = await fetch('/api/undo_round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || 'Failed to undo round.', 'error');
            return;
        }

        console.log('Undo successful:', data.message);

        // Set flag to skip animations during undo
        isUndoInProgress = true;
        
        // Reset previous order tracking so we don't detect a "round change" and animate
        previousRoundNumber = null;
        previousLeadOrder = [];
        previousFollowOrder = [];

        // Render from canonical state to update UI
        await refreshCanonicalState();

        // Clear the undo flag
        isUndoInProgress = false;

        // Scroll to top so current contestants are visible
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error undoing round:', error);
        showToast('Failed to undo round', 'error');
        isUndoInProgress = false;
    } finally {
        // Re-enable button will happen via renderFromState after refreshCanonicalState
    }
}

async function endCompetition() {
    // Stop any display mode polling before ending the game
    stopDisplayPolling();
    // Call our updated endGame function that works with the new UI components
    endGame();
}

function resetAndGoHome() {
    console.log('resetAndGoHome called');
    resetCompetition();
    liveBattleActive = false;
    resetResultsState();
    console.log('resetCompetition completed, navigating home');
    navigate('/');
}

function resetCompetition() {
    // Reset global variables
    sessionId = null;
    guestJudges = [];
    leadVotes = {};
    followVotes = {};
    votingLocked = { lead: false, follow: false };
    currentLeads = [];
    currentFollows = [];
    contestantJudgingEnabled = true;
    simpleContestantJudgesEnabled = false;
    
    // Reset playlist state (also clears per-session localStorage + reapplies UI gating)
    resetPlaylistState();
    if (playlistUrlInput) playlistUrlInput.value = '';
    
    // Hide winner previews
    if (leadWinnerPreview) leadWinnerPreview.classList.add('hidden');
    if (followWinnerPreview) followWinnerPreview.classList.add('hidden');
    
    // Clear form inputs
    leadNamesInput.value = '';
    followNamesInput.value = '';
    judgeNamesInput.value = '';
    
    if (contestantJudgingToggle) {
        contestantJudgingToggle.checked = true;
    }
    if (simpleContestantJudgesInput) {
        simpleContestantJudgesInput.checked = false;
        simpleContestantJudgesInput.disabled = contestantJudgingToggle ? !contestantJudgingToggle.checked : false;
    }
    if (randomizeOrderToggle) {
        randomizeOrderToggle.checked = true;
    }
    
    // Clear file upload
    battleFileUpload.value = '';
    uploadFileName.textContent = '';
    
    // Reset error messages
    uploadError.textContent = '';
    uploadError.classList.remove('visible');
}

// Update score table with current standings
function updateScoreTable(leads: ScoreboardRow[], follows: ScoreboardRow[]) {
    // Clear existing scores
    const leadScoreBody = document.getElementById('lead-results-body');
    const followScoreBody = document.getElementById('follow-results-body');
    if (!leadScoreBody || !followScoreBody) return;
    leadScoreBody.innerHTML = '';
    followScoreBody.innerHTML = '';

    // Sort by points in descending order
    leads.sort((a, b) => b.points - a.points);
    follows.sort((a, b) => b.points - a.points);

    // Update lead scores
    leads.forEach(lead => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = lead.name + (lead.is_winner ? ' 👑' : '');
        const pointsCell = document.createElement('td');
        pointsCell.textContent = String(lead.points);
        row.appendChild(nameCell);
        row.appendChild(pointsCell);
        leadScoreBody.appendChild(row);
    });

    // Update follow scores
    follows.forEach(follow => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = follow.name + (follow.is_winner ? ' 👑' : '');
        const pointsCell = document.createElement('td');
        pointsCell.textContent = String(follow.points);
        row.appendChild(nameCell);
        row.appendChild(pointsCell);
        followScoreBody.appendChild(row);
    });
}

// --- Router hydration helpers (called by js/router.js) -------------------

// Enter /battle/<id>: rebuild the interactive (or display) battle from server state.
function hydrateBattleRoute(sid: string | null) {
    if (!sid) { navigate('/', { replace: true }); return; }
    // Already live in-memory for this session (e.g. just started) — no refetch needed.
    if (sessionId === sid && liveBattleActive && !display.active) {
        updateSessionIdDisplay();
        return;
    }
    sessionId = sid;
    try { localStorage.setItem('sessionId', sid); } catch { /* ignore */ }
    fetch(`/api/state?session_id=${encodeURIComponent(sid)}`)
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(state => {
            if (state.flags && state.flags.finished) {
                navigate('/results/' + encodeURIComponent(sid), { replace: true });
                return;
            }
            if (display.active) { initDisplayMode(sessionId); return; }
            liveBattleActive = true;
            renderFromState(state);
            updateSessionIdDisplay();
            if (typeof fetchScores === 'function') fetchScores();
        })
        .catch(() => {
            try { showToast('That battle was not found or has expired.', 'error'); } catch { /* ignore */ }
            navigate('/', { replace: true });
        });
}

// End game function
function endGame() {
    // Disable voting buttons
    document.querySelectorAll<HTMLButtonElement>('.vote-button').forEach(button => {
        button.disabled = true;
    });
    
    console.log('Ending game with session ID:', sessionId);
    
    // Send request to end game
    fetch('/api/end_game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            session_id: sessionId
        }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('Received end game data:', data);

        if (data.tiebreak_required) {
            startTiebreakFlow(data);
            return;
        }

        // Ensure we have the initial order data
        if (!data.initial_leads || !data.initial_follows) {
            console.log('Using stored initial order data');
            data.initial_leads = initialLeads;
            data.initial_follows = initialFollows;
        }

        // Display final results (navigates to /results/<id>)
        showResults(data);
    })
    .catch(error => {
        console.error('Error ending game:', error);
        showToast('Failed to end the competition', 'error');
    });
} 

// Add a button to home screen for pre-auth
(function addSpotifyAuthButtonToHome(){
    try {
        const home = document.getElementById('home-screen');
        if (!home) return;
        const actions = home.querySelector('.home-actions');
        if (!actions) return;
        const btn = document.createElement('button');
        btn.id = 'spotify-auth-btn';
        btn.className = 'btn secondary large';
        btn.textContent = 'Authenticate Spotify';
        btn.onclick = () => {
            if (isSpotifyEnabled()) {
                startSpotifyAuth(window.location.origin + window.location.pathname, sessionId);
            }
        };
        if (isSpotifyEnabled()) {
            actions.appendChild(btn);
        }
    } catch { /* ignore */ }
})();

// Resume session UI if returning from OAuth with session_id in URL
(function resumeAfterOAuth(){
    try {
        const url = new URL(window.location.href);
        const sid = url.searchParams.get('session_id');
        if (sid) {
            sessionId = sid;
            localStorage.setItem('sessionId', sid);
            updateSessionIdDisplay();
            // Try to render round screen if we already have a game
            fetchCanonicalState().then(state => {
                if (state && state.round && state.round.pairs) {
                    showScreen(roundScreen);
                    renderFromState(state);
                }
            }).catch(() => {});
        }
    } catch { /* ignore */ }
})();

// ============================================================
// Cross-file exports
// ============================================================
// app.js is bundled as an IIFE, so top-level declarations are no longer
// window properties. Everything other files call lives here explicitly
// (router.ts, ytd.ts, components/DebugTools.ts; see global.d.ts).
window.showScreen = showScreen;
window.hydrateBattleRoute = hydrateBattleRoute;
window.hydrateResultsRoute = hydrateResultsRoute;
window.updateSessionIdDisplay = updateSessionIdDisplay;
window.renderFromState = renderFromState;
window.refreshCanonicalState = refreshCanonicalState;
window.endGame = endGame;
