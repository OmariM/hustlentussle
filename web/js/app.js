// Global variables
let sessionId = null;
let liveBattleActive = false;      // a battle is live in-memory (skip refetch on route enter)
let currentResultsData = null;     // last rendered results payload (for /results hydration)
let guestJudges = [];
let leadVotes = {};  // Changed to an object to easily update votes
let followVotes = {}; // Changed to an object to easily update votes
let votingLocked = { lead: false, follow: false }; // Track if voting is locked
    let currentLeads = []; // Store current lead contestants with points
    let currentFollows = []; // Store current follow contestants with points
    let liveRounds = []; // Accumulate round records for live battle graphic
let initialLeads = []; // Store initial order of leads
let initialFollows = []; // Store initial order of follows
let contestantJudgingEnabled = true; // Track whether contestant judging is enabled for the battle

// Cached data for the social export image (populated by displayResults)
let resultsLeadMap = new Map();
let resultsFollowMap = new Map();
let resultsInitialLeads = [];
let resultsInitialFollows = [];
let resultsTopLeadName = null;
let resultsTopFollowName = null;
let resultsNumRounds = 0;
let resultsGuestJudges = [];

// Display mode state (for viewer-only mode without voting controls)
let displayMode = false;
let displayPollInterval = null;
const DISPLAY_POLL_INTERVAL_MS = 3000; // Poll every 3 seconds in display mode

// Queue order animation state (for display mode)
let previousLeadOrder = [];
let previousFollowOrder = [];
let previousRoundNumber = null;
let animationInProgress = false;
let roundTransitionInProgress = false; // Track if round transition overlay is showing
let skipQueueAnimationOnNextRender = false; // Skip queue animation during stagger sequence
let pendingQueueAnimationData = null; // Store data for queue animation after stagger
let isUndoInProgress = false; // Skip animations during undo operations
let isSubmitting = false; // Prevent double-submission

// Demo mode state
let demoMode = false;
let demoStep = 0;
let demoOverlay = null; // Container for backdrop + hint
let demoWaitingForAction = false; // True when waiting for user interaction before enabling Next

// Tie-break state
let tiebreakActive = false;
let tiebreakLeadNeeded = false;
let tiebreakFollowNeeded = false;
let tiedLeads = [];
let tiedFollows = [];
let tiebreakAllLeads = [];
let tiebreakAllFollows = [];
let tiebreakSubRound = 0;
let tiebreakSR1Pairings = [];
let tiebreakSR2Pairings = [];
let tiebreakLeadVotes = {};
let tiebreakFollowVotes = {};
let tiebreakGuestJudges = [];
let tiebreakContestantJudges = [];
let tiebreakResolvedLeadWinner = null;
let tiebreakResolvedFollowWinner = null;

// Voting constants (frontend-only)
const PROXY_CONTESTANT_JUDGES_NAME = 'Contestant Judges';
const VOTE_MIXED = 5; // Special option used only for the proxy judge UI (never sent to backend)

// Playlist mode state
let songInputSection, playlistUrlInput, playlistEmbedSection, playlistEmbedContainer;
let playlistModeEnabled = false;
let simpleContestantJudgesEnabled = false;
let playlistUrl = '';
let playlistId = '';
let playlistTracks = [];
let usedTrackIds = new Set();
let currentRoundTrack = null;
let lastPreparedSongRoundNumber = null;
let pendingPlaylistUrl = null;

// Ensure Spotify integration default is persisted as off on first load
try {
    if (localStorage.getItem('spotify.enabled') === null) {
        localStorage.setItem('spotify.enabled', 'false');
    }
} catch (_) {}

// Apply mode (layout) and color (light/dark) independently
// Color preferences are stored per mode so admin and display can differ
function applyTheme() {
    const mode = displayMode ? 'display' : 'admin';
    document.documentElement.setAttribute('data-mode', mode);

    const colorKey = `color-preference-${mode}`;
    const savedColor = localStorage.getItem(colorKey);
    const color = savedColor || (displayMode ? 'dark' : 'light');
    document.documentElement.setAttribute('data-color', color);
}

function toggleTheme() {
    const mode = displayMode ? 'display' : 'admin';
    const current = document.documentElement.getAttribute('data-color');
    const next = (current === 'light') ? 'dark' : 'light';
    localStorage.setItem(`color-preference-${mode}`, next);
    document.documentElement.setAttribute('data-color', next);
}

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// Loading state utility
function setButtonLoading(button, loading) {
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

// DOM Elements (initialized in the DOMContentLoaded event)
let homeScreen, uploadScreen, setupScreen, roundScreen, resultsScreen;
let goToBattleBtn, goToUploadBtn;
let battleFileUpload, uploadFileName, uploadBattleDataBtn, backToHomeBtn, uploadError;
let leadNamesInput, followNamesInput, judgeNamesInput, startCompetitionBtn, setupBackToHomeBtn;
let pointsToWinInput, pointsToWinModeSelect, customPointsContainer, pointsToWinHelper;
let numContestantJudgesInput, contestantJudgesWarning;
let contestantJudgingToggle, simpleContestantJudgesInput, randomizeOrderToggle;
let roundNumber, lead1Name, lead2Name, follow1Name, follow2Name, contestantJudgesList, guestJudgesList;
    let currentLeadScores, currentFollowScores;
    let liveLeadGraphic, liveFollowGraphic;
let leadVotingSection, followVotingSection, leadJudgesContainer, followJudgesContainer;
let leadResults, followResults, leadWinner, followWinner;
let leadGuestVotes, leadContestantVotes, followGuestVotes, followContestantVotes;
let submitVotesBtn, votingResults;
let leadWinnerPreview, followWinnerPreview, leadPreviewName, followPreviewName;
let roundResultsSection, winMessages, nextRoundBtn, endBattleBtn;
let leadsLeaderboard, followsLeaderboard;
let backToHomeFromResultsBtn, downloadBattleDataBtn, exportSocialImageBtn;
// Vote confirmation modal elements
let voteConfirmModal, voteConfirmCloseBtn, voteConfirmCancelBtn, voteConfirmSubmitBtn;
let voteConfirmRound, voteConfirmLead1, voteConfirmLead2, voteConfirmFollow1, voteConfirmFollow2;
let voteConfirmLeadWinner, voteConfirmFollowWinner, voteConfirmError;
// End battle early modal elements
let endEarlyBtn, endEarlyModal, endEarlyCloseBtn, endEarlyCancelBtn, endEarlyConfirmBtn;
// Undo round button
let undoRoundBtn;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    
    // Detect display mode early (before DOM element setup)
    detectDisplayMode();
    applyTheme();

    // Initialize DOM elements
    homeScreen = document.getElementById('home-screen');
    uploadScreen = document.getElementById('upload-screen');
    setupScreen = document.getElementById('setup-screen');
    roundScreen = document.getElementById('battle-screen');
    resultsScreen = document.getElementById('results-screen');
    
    // Home screen elements
    goToBattleBtn = document.getElementById('go-to-battle');
    goToUploadBtn = document.getElementById('go-to-upload');
    
    // Upload screen elements
    battleFileUpload = document.getElementById('battle-file-upload');
    uploadFileName = document.getElementById('upload-file-name');
    uploadBattleDataBtn = document.getElementById('upload-battle-data');
    backToHomeBtn = document.getElementById('back-to-home');
    uploadError = document.getElementById('upload-error');

// Setup screen elements
    leadNamesInput = document.getElementById('lead-names');
    followNamesInput = document.getElementById('follow-names');
    judgeNamesInput = document.getElementById('judge-names');
    pointsToWinInput = document.getElementById('points-to-win');
    pointsToWinModeSelect = document.getElementById('points-to-win-mode');
    customPointsContainer = document.getElementById('custom-points-container');
    pointsToWinHelper = document.getElementById('points-to-win-helper');
    numContestantJudgesInput = document.getElementById('num-contestant-judges');
    contestantJudgesWarning = document.getElementById('contestant-judges-warning');
    startCompetitionBtn = document.getElementById('start-competition');
    setupBackToHomeBtn = document.getElementById('setup-back-to-home');
    playlistUrlInput = document.getElementById('playlist-url');
    simpleContestantJudgesInput = document.getElementById('simple-contestant-judges');
    contestantJudgingToggle = document.getElementById('contestant-judging-toggle');
    randomizeOrderToggle = document.getElementById('randomize-order-toggle');

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
    roundNumber = document.getElementById('round-number');
    lead1Name = document.getElementById('lead1-name');
    lead2Name = document.getElementById('lead2-name');
    follow1Name = document.getElementById('follow1-name');
    follow2Name = document.getElementById('follow2-name');
    contestantJudgesList = document.getElementById('contestant-judges-list');
    guestJudgesList = document.getElementById('guest-judges-list');
    currentLeadScores = document.getElementById('current-lead-scores');
    currentFollowScores = document.getElementById('current-follow-scores');
    liveLeadGraphic = document.getElementById('live-lead-graphic');
    liveFollowGraphic = document.getElementById('live-follow-graphic');
    songInputSection = document.getElementById('song-input-section');
    playlistEmbedSection = document.getElementById('playlist-embed-section');
    playlistEmbedContainer = document.getElementById('playlist-embed');

// Voting elements
    leadVotingSection = document.getElementById('lead-voting');
    followVotingSection = document.getElementById('follow-voting');
    leadJudgesContainer = document.getElementById('lead-judges-container');
    followJudgesContainer = document.getElementById('follow-judges-container');
    leadResults = document.getElementById('lead-results');
    followResults = document.getElementById('follow-results');
    leadWinner = document.getElementById('lead-winner');
    followWinner = document.getElementById('follow-winner');
    leadGuestVotes = document.getElementById('lead-guest-votes');
    leadContestantVotes = document.getElementById('lead-contestant-votes');
    followGuestVotes = document.getElementById('follow-guest-votes');
    followContestantVotes = document.getElementById('follow-contestant-votes');
    submitVotesBtn = document.getElementById('submit-votes');
    votingResults = document.getElementById('voting-results');
    leadWinnerPreview = document.getElementById('lead-winner-preview');
    followWinnerPreview = document.getElementById('follow-winner-preview');
    leadPreviewName = document.getElementById('lead-preview-name');
    followPreviewName = document.getElementById('follow-preview-name');

    // Vote confirmation modal
    voteConfirmModal = document.getElementById('vote-confirm-modal');
    voteConfirmCloseBtn = document.getElementById('vote-confirm-close');
    voteConfirmCancelBtn = document.getElementById('vote-confirm-cancel');
    voteConfirmSubmitBtn = document.getElementById('vote-confirm-submit');
    voteConfirmRound = document.getElementById('vote-confirm-round');
    voteConfirmLead1 = document.getElementById('vote-confirm-lead1');
    voteConfirmLead2 = document.getElementById('vote-confirm-lead2');
    voteConfirmFollow1 = document.getElementById('vote-confirm-follow1');
    voteConfirmFollow2 = document.getElementById('vote-confirm-follow2');
    voteConfirmLeadWinner = document.getElementById('vote-confirm-lead-winner');
    voteConfirmFollowWinner = document.getElementById('vote-confirm-follow-winner');
    voteConfirmError = document.getElementById('vote-confirm-error');

    // End battle early modal
    endEarlyBtn = document.getElementById('end-battle-early');
    endEarlyModal = document.getElementById('end-early-modal');
    endEarlyCloseBtn = document.getElementById('end-early-close');
    endEarlyCancelBtn = document.getElementById('end-early-cancel');
    endEarlyConfirmBtn = document.getElementById('end-early-confirm');

    // Undo round button
    undoRoundBtn = document.getElementById('undo-round');

// Results elements
    roundResultsSection = document.getElementById('round-results');
    winMessages = document.getElementById('win-messages');
    nextRoundBtn = document.getElementById('next-round');
    endBattleBtn = document.getElementById('end-battle');
    leadsLeaderboard = document.getElementById('leads-leaderboard');
    followsLeaderboard = document.getElementById('follows-leaderboard');
    backToHomeFromResultsBtn = document.getElementById('back-to-home-from-results');
    downloadBattleDataBtn = document.getElementById('download-battle-data');
    exportSocialImageBtn = document.getElementById('export-social-image');
    
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
    try {
        const sid = localStorage.getItem('sessionId');
        if (sid) {
            const stored = localStorage.getItem(`usedTracks:${sid}`);
            if (stored) usedTrackIds = new Set(JSON.parse(stored));
            const storedPlaylistUrl = localStorage.getItem(`playlist:url:${sid}`);
            if (storedPlaylistUrl && localStorage.getItem('spotify.enabled') === 'true') {
                pendingPlaylistUrl = storedPlaylistUrl;
                maybeEnablePlaylistMode(pendingPlaylistUrl).catch(() => {});
                pendingPlaylistUrl = null;
            }
        }
    } catch (e) { console.warn('Failed to hydrate used tracks/playlist', e); }
    
    // Battle flow
    submitVotesBtn.addEventListener('click', (e) => openVoteConfirmModal(e));
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
            await submitCombinedVotes({ autoAdvance: true, source: 'modal' });
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
    
    downloadBattleDataBtn.addEventListener('click', downloadBattleData);
    if (exportSocialImageBtn) exportSocialImageBtn.addEventListener('click', exportSocialImage);

    // Theme toggles (nav bar + floating for display mode)
    document.querySelectorAll('#theme-toggle, #theme-toggle-floating').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // Nav pills are status indicators only — no click navigation
    document.querySelectorAll('.nav-pill').forEach(pill => {
        pill.style.pointerEvents = 'none';
        pill.style.cursor = 'default';
    });

    // Spotify integration UI gating
    const playlistUrlGroup = document.getElementById('playlist-url-group');
    const spotifyToggleCheckbox = document.getElementById('spotify-toggle');
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
            startSpotifyAuth(window.location.origin + window.location.pathname);
        });
    }
    function applySpotifyEnabledUI() {
        const isOn = localStorage.getItem('spotify.enabled') === 'true';
        if (playlistUrlGroup) playlistUrlGroup.style.display = isOn ? '' : 'none';
        if (spotifyAuthGroup) spotifyAuthGroup.style.display = isOn ? '' : 'none';
        if (songInputSection) songInputSection.style.display = isOn ? '' : 'none';
        if (playlistEmbedSection) playlistEmbedSection.style.display = isOn && playlistModeEnabled ? '' : 'none';
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
        } catch (_) {
            spotifyAuthStatus.textContent = 'Not connected';
            spotifyAuthStatus.className = 'spotify-status spotify-status--disconnected';
            spotifyAuthSetupBtn.textContent = 'Connect Spotify';
        }
    }
    applySpotifyEnabledUI();

    // Hide nav bar initially to avoid a flash before the router renders the first route.
    const navBar = document.getElementById('nav-bar');
    if (navBar && !displayMode) {
        navBar.style.display = 'none';
    }

    // Initial screen + display-mode init are driven by the router (js/router.js),
    // whose DOMContentLoaded handler runs after this one. See hydrateBattleRoute().
});

// Functions
function updateNavPills(activeScreen) {
    document.querySelectorAll('.nav-pill').forEach(pill => {
        pill.classList.remove('active');
        if (activeScreen && pill.dataset.screen === activeScreen.id) {
            pill.classList.add('active');
        }
    });
}

function showScreen(screen) {
    // Deactivate every screen (includes stats-screen and any future screens)
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    screen.classList.add('active');

    // Update nav pills to reflect current screen
    updateNavPills(screen);

    // Hide nav on home screen and in display mode
    const navBar = document.getElementById('nav-bar');
    if (navBar) {
        navBar.style.display = (screen === homeScreen || displayMode) ? 'none' : '';
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
        if (sig) sig.style.display = spotifyOn ? (playlistModeEnabled ? 'none' : '') : 'none';
        if (pes) pes.style.display = spotifyOn && playlistModeEnabled ? '' : 'none';
    } catch (_) {}

    // Apply display mode UI changes when switching screens
    if (displayMode) {
        applyDisplayModeUI();
        // Start/stop polling based on which screen is active
        if (screen === roundScreen) {
            startDisplayPolling();
        } else {
            stopDisplayPolling();
        }
    }
}

// Display mode functions
function detectDisplayMode() {
    try {
        const url = new URL(window.location.href);
        const mode = url.searchParams.get('mode');
        const urlSessionId = url.searchParams.get('session_id');
        
        if (mode === 'display') {
            displayMode = true;
            document.body.classList.add('display-mode');
            console.log('Display mode enabled');
            
            // If session_id is provided in URL, use it
            if (urlSessionId) {
                sessionId = urlSessionId;
                localStorage.setItem('sessionId', sessionId);
            }
        }
    } catch (e) {
        console.warn('Failed to detect display mode:', e);
    }
    return displayMode;
}

function startDisplayPolling() {
    if (!displayMode || displayPollInterval) return;
    
    // Track the last round number we displayed (for overlay triggering)
    let lastDisplayedRound = null;
    
    console.log('Starting display mode polling...');
    displayPollInterval = setInterval(async () => {
        // Skip polling while transition overlay is showing
        if (roundTransitionInProgress) return;
        
        try {
            const state = await fetchCanonicalState();
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
                        skipQueueAnimationOnNextRender = true;
                        renderFromState(state);
                        skipQueueAnimationOnNextRender = false;
                        lastDisplayedRound = currentRound;
                        
                        // Re-hide sections after render (render may have reset DOM)
                        hideSectionsForTransition();
                        
                        // Perform staggered fade-in, then trigger queue animation
                        performStaggeredFadeIn(() => {
                            // Check if queue animation will run before triggering
                            const willAnimateQueue = pendingQueueAnimationData && 
                                (pendingQueueAnimationData.leadLosers.length > 0 || 
                                 pendingQueueAnimationData.followLosers.length > 0);
                            
                            triggerPendingQueueAnimation();
                            
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
                    renderFromState(state);
                    lastDisplayedRound = currentRound;
                }
                
                // Check if game is finished and redirect to results
                if (state.flags && state.flags.finished) {
                    stopDisplayPolling();
                    // Trigger end game to show results
                    endCompetition();
                }
            }
        } catch (e) {
            console.warn('Display polling error:', e);
        }
    }, DISPLAY_POLL_INTERVAL_MS);
}

function stopDisplayPolling() {
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

function showRoundTransitionOverlay(roundNumber, callback) {
    const overlay = document.getElementById('round-transition-overlay');
    const roundNumberEl = document.getElementById('overlay-round-number');
    
    if (!overlay || !roundNumberEl) {
        // Overlay elements not found, just run callback
        if (callback) callback();
        return;
    }
    
    roundTransitionInProgress = true;
    
    // Set the round number
    roundNumberEl.textContent = roundNumber;
    
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
            if (callback) callback();
        }, ROUND_OVERLAY_FADE_OUT);
    }, ROUND_OVERLAY_FADE_IN + ROUND_OVERLAY_HOLD);
}

// Staggered fade-in animation timing
const STAGGER_DELAY_MS = 150; // Delay between each section
const STAGGER_ANIMATION_MS = 400; // Duration of each fade-in

// Get the display mode sections to animate (grid children in display mode)
function getDisplaySections() {
    return [
        document.getElementById('current-matchup'),
        document.querySelector('.judges'),
        document.getElementById('next-up-section'),
        document.querySelector('.scores-display')
    ].filter(Boolean);
}

// Hide sections before overlay (so they're invisible during overlay)
function hideSectionsForTransition() {
    getDisplaySections().forEach(section => {
        section.style.opacity = '0';
    });
}

function performStaggeredFadeIn(callback) {
    const sections = getDisplaySections();
    if (sections.length === 0) {
        if (callback) callback();
        return;
    }

    // Ensure all sections start hidden
    sections.forEach(section => {
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
        sections.forEach(section => {
            section.style.transition = '';
            section.style.opacity = '';
            section.style.transform = '';
        });
        if (callback) callback();
    }, totalAnimationTime);
}

function triggerPendingQueueAnimation() {
    if (!pendingQueueAnimationData) return;
    
    const { leadContainer, followContainer, leadOrder, followOrder, leadLosers, followLosers } = pendingQueueAnimationData;
    
    if ((leadLosers.length > 0 || followLosers.length > 0) && !animationInProgress) {
        animateQueueTransition(leadContainer, followContainer, leadOrder, followOrder, leadLosers, followLosers);
    }
    
    pendingQueueAnimationData = null;
}

function applyDisplayModeUI() {
    if (!displayMode) return;
    
    // Hide voting sections
    const combinedVoting = document.getElementById('combined-voting');
    if (combinedVoting) combinedVoting.style.display = 'none';
    
    // Hide round results section (Next Round / End Battle buttons)
    const roundResults = document.getElementById('round-results');
    if (roundResults) roundResults.style.display = 'none';
    
    // Hide spotify-related controls for cleaner display
    const spotifyToggleEl = document.getElementById('spotify-toggle');
    if (spotifyToggleEl) spotifyToggleEl.parentElement.style.display = 'none';
}

async function initDisplayMode() {
    if (!displayMode) return;
    
    if (!sessionId) {
        // No session ID - show error on home screen
        alert('Display mode requires a session_id parameter. Example: ?mode=display&session_id=YOUR_SESSION_ID');
        return;
    }
    
    // Apply display mode UI changes
    applyDisplayModeUI();
    
    // Fetch initial state and go directly to battle screen
    try {
        const state = await fetchCanonicalState();
        if (state) {
            // Update session ID display
            const sessionIdDisplay = document.getElementById('session-id-display');
            if (sessionIdDisplay) {
                sessionIdDisplay.textContent = `Session: ${sessionId}`;
                sessionIdDisplay.style.display = 'block';
            }
            
            // Go directly to battle screen
            showScreen(roundScreen);
            renderFromState(state);
            
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

// Canonical state helpers
async function fetchCanonicalState() {
    if (!sessionId) return null;
    const resp = await fetch(`/api/state?session_id=${sessionId}`);
    if (!resp.ok) throw new Error('Failed to fetch canonical state');
    return await resp.json();
}

function renderDisplayModeTiebreak(tb) {
    document.getElementById('tiebreak-display-section').style.display = '';
    document.querySelector('.round-header').style.display = 'none';

    const phaseEl = document.getElementById('tiebreak-display-phase-label');
    const contestantsEl = document.getElementById('tiebreak-display-contestants');
    const pairingsEl = document.getElementById('tiebreak-display-pairings');
    const winnersEl = document.getElementById('tiebreak-display-winners');

    const phaseLabels = {
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

function renderFromState(state) {
    if (!state || !state.round || !state.round.pairs) return;

    // Display mode: hand off to tiebreak renderer when a tiebreak is active
    if (displayMode && state.tiebreak?.active) {
        renderDisplayModeTiebreak(state.tiebreak);
        return;
    }
    // Restore normal display layout if tiebreak just ended
    if (displayMode) {
        document.getElementById('tiebreak-display-section').style.display = 'none';
        document.querySelector('.round-header').style.display = '';
    }

    // Store initial order for results display (important for display mode)
    if (Array.isArray(state.initial_order?.leads)) initialLeads = state.initial_order.leads;
    if (Array.isArray(state.initial_order?.follows)) initialFollows = state.initial_order.follows;

    // If we haven't initialized playlist mode yet but have a pending URL (from start), enable it
    if (localStorage.getItem('spotify.enabled') === 'true' && !playlistModeEnabled && pendingPlaylistUrl) {
        maybeEnablePlaylistMode(pendingPlaylistUrl).catch(e => console.warn('Failed to enable playlist mode on render:', e));
        pendingPlaylistUrl = null;
    }

    // Round number
    if (roundNumber) roundNumber.textContent = state.round.number;

    // If Spotify enabled and playlist mode is on and the round changed, prepare a song for this round
    if (localStorage.getItem('spotify.enabled') === 'true' && playlistModeEnabled) {
        const rn = state.round.number;
        if (lastPreparedSongRoundNumber !== rn) {
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
        const contestantSection = contestantJudgesList.closest('.judges-section');
        if (contestantSection) {
            contestantSection.style.display = contestantEnabledFromState ? '' : 'none';
        }
    }
    // Store simple mode flag from state
    try {
        simpleContestantJudgesEnabled = contestantJudgingEnabled && Boolean(state.round?.judges?.simple_contestant_judges);
    } catch (_) {
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
        undoRoundBtn.disabled = !hasRoundsToUndo || displayMode;
    }

    // Rebuild voting cards based on current state
    setupVotingUI();

    // Enforce Spotify UI gating after state render
    try {
        const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
        if (songInputSection) songInputSection.style.display = spotifyOn ? (playlistModeEnabled ? 'none' : '') : 'none';
        if (playlistEmbedSection) playlistEmbedSection.style.display = spotifyOn && playlistModeEnabled ? '' : 'none';
    } catch (_) {}
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

function computeGuestWinnerDecision(votesObj) {
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

function expandSimpleContestantJudgesVotes(votesObj) {
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
        return cjNames.map(n => [n, proxyVote]);
    }

    if (proxyVote === VOTE_MIXED) {
        // "Mixed" means contestant judges are not unanimous. Split votes ~in half, but
        // give the majority to the contestant currently winning among the guest judges.
        const winnerDecision = computeGuestWinnerDecision(votesObj);
        const loserDecision = winnerDecision === 1 ? 2 : 1;
        const majorityCount = Math.floor(cjNames.length / 2) + 1;
        return cjNames.map((n, idx) => [n, idx < majorityCount ? winnerDecision : loserDecision]);
    }

    return [];
}

function buildEffectiveVotesArray(voteType) {
    const roster = buildJudgeRoster();
    const votesObj = voteType === 'lead' ? leadVotes : followVotes;

    const out = [];

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

function updateLiveGraphicFromState(state) {
    if (!state || !state.scoreboard) return;
    const leads = state.scoreboard.leads || [];
    const follows = state.scoreboard.follows || [];
    const rounds = state.rounds || [];

    // Cache current arrays for possible other uses
    currentLeads = leads;
    currentFollows = follows;
    liveRounds = rounds;

    if (!liveLeadGraphic || !liveFollowGraphic) return;

    // Build quick lookups for current points
    const leadPointsMap = Object.fromEntries((leads || []).map(l => [l.name, l.points]));
    const followPointsMap = Object.fromEntries((follows || []).map(f => [f.name, f.points]));
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

    const renderColumn = (ordered, map, crownName, container, showCrown) => {
        ordered.forEach((entry, idx) => {
            const name = typeof entry === 'string' ? entry : entry.name;
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
                b.textContent = info.round;
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
    const leadContainer = document.getElementById('mini-lead-standings');
    const followContainer = document.getElementById('mini-follow-standings');
    if (!leadContainer || !followContainer) return;

    function renderStandings(contestants, container) {
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

function updateContestantOrder(state) {
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
    const roundWentForward = previousRoundNumber !== null && currentRoundNumber > previousRoundNumber;
    const roundChanged = displayMode && roundWentForward && !isUndoInProgress;
    
    // Find losers: contestants who were in top 2 but are now at the back
    // Returns an array to handle both normal (1 loser) and no-contest (2 losers) cases
    const findLosers = (prevOrder, newOrder) => {
        if (prevOrder.length < 2 || newOrder.length < 2) return [];
        const prevTop2 = prevOrder.slice(0, 2);
        const newTop2 = newOrder.slice(0, 2);
        const losers = [];
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
    if (displayMode && roundChanged && (leadLosers.length > 0 || followLosers.length > 0) && !animationInProgress) {
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

function renderOrderListImmediate(order, container, role, loserNames) {
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

function animateQueueTransition(leadContainer, followContainer, newLeadOrder, newFollowOrder, leadLosers, followLosers) {
    animationInProgress = true;
    
    // Animation timing constants (longer for spectator visibility)
    const EXIT_DURATION = 1000;  // 1 second for exit animation
    const ENTRY_DURATION = 1200; // 1.2 seconds for entry animation
    const CLEANUP_BUFFER = 200;  // Buffer before allowing next animation
    
    // Ensure losers are arrays
    const leadLosersArr = Array.isArray(leadLosers) ? leadLosers : (leadLosers ? [leadLosers] : []);
    const followLosersArr = Array.isArray(followLosers) ? followLosers : (followLosers ? [followLosers] : []);
    
    // Phase 1: Mark losers in the old list with exit animation
    const animateColumnExit = (container, loserNames) => {
        if (loserNames.length === 0) return;
        const items = container.querySelectorAll('.order-item');
        items.forEach(item => {
            if (loserNames.includes(item.dataset.name)) {
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
            const applyEntryAnimation = (container, loserNames) => {
                if (loserNames.length === 0) return;
                const items = container.querySelectorAll('.order-item');
                items.forEach(item => {
                    if (loserNames.includes(item.dataset.name)) {
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

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadFileName.textContent = file.name;
        uploadError.textContent = '';
        uploadError.classList.remove('visible');
    } else {
        uploadFileName.textContent = '';
    }
}

async function processUploadedFile() {
    const file = battleFileUpload.files[0];
    
    if (!file) {
        uploadError.textContent = 'Please select a file to upload.';
        uploadError.classList.add('visible');
        return;
    }
    
    // Clear any previous error messages
    uploadError.textContent = '';
    uploadError.classList.remove('visible');
    
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
            data.leads.forEach((lead, i) => {
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
            data.follows.forEach((follow, i) => {
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
        showResults(data, { sessionId: null });
    } catch (error) {
        console.error('Error processing file:', error);
        showUploadError(`Failed to process the file: ${error.message}`);
    }
}

function showUploadError(message) {
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
    if (sessionId && !displayMode) {
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
        const toggleBtn = sessionIdDisplay.querySelector('.session-id-display-toggle');
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
        const toggleBtn = sessionIdDisplay.querySelector('.session-id-display-toggle');
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
async function startCompetition(useSimpleContestantJudges, allowContestantJudging = true) {
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
                randomize_order: randomizeOrder
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
        pendingPlaylistUrl = spotifyOn ? playlistUrlRaw : '';
        if (spotifyOn && pendingPlaylistUrl) {
            await maybeEnablePlaylistMode(pendingPlaylistUrl);
        } else {
            disablePlaylistMode('Spotify disabled or no playlist');
        }
        
        // Render from canonical state
        await refreshCanonicalState();

        // Navigate to the battle route (shareable/reloadable URL)
        liveBattleActive = true;
        navigate('/battle/' + encodeURIComponent(sessionId));

        // Demo mode hook: advance past the "Start Competition" step
        if (demoMode) {
            const currentStep = DEMO_STEPS[demoStep];
            if (currentStep && currentStep.action === 'wait-for-start') {
                enableDemoNextButton();
            }
        }
    } catch (error) {
        console.error('Error starting game:', error);
        showToast('Failed to start game: ' + (error.message || 'Unknown error'), 'error');
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
                if (spotifyOn && !playlistModeEnabled && data.playlist_url) {
                    pendingPlaylistUrl = data.playlist_url;
                    await maybeEnablePlaylistMode(pendingPlaylistUrl);
                    pendingPlaylistUrl = null;
                }
            } catch (_) {}

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

function updateRoundUI(data) {
    roundNumber.textContent = data.round;
    lead1Name.textContent = data.pair_1[0];
    follow1Name.textContent = data.pair_1[1];
    lead2Name.textContent = data.pair_2[0];
    follow2Name.textContent = data.pair_2[1];
    
    // Update guest judges
    guestJudgesList.innerHTML = '';
    if (guestJudges.length > 0) {
        guestJudges.forEach(judge => {
            const judgeItem = document.createElement('div');
            judgeItem.className = 'judge-item guest';
            judgeItem.textContent = judge;
            guestJudgesList.appendChild(judgeItem);
        });
    } else {
        const noJudges = document.createElement('div');
        noJudges.className = 'judge-item';
        noJudges.textContent = 'No guest judges assigned';
        guestJudgesList.appendChild(noJudges);
    }
    
    // Update contestant judges
    contestantJudgesList.innerHTML = '';
    const contestantSection = contestantJudgesList.closest('.judges-section');
    if (!contestantJudgingEnabled) {
        if (contestantSection) contestantSection.style.display = 'none';
    } else {
        if (contestantSection) contestantSection.style.display = '';
        if (data.contestant_judges && data.contestant_judges.length > 0) {
            data.contestant_judges.forEach(judge => {
                const judgeItem = document.createElement('div');
                judgeItem.className = 'judge-item contestant';
                judgeItem.textContent = judge;
                contestantJudgesList.appendChild(judgeItem);
            });
        } else {
            const noJudges = document.createElement('div');
            noJudges.className = 'judge-item';
            noJudges.textContent = 'No contestant judges assigned';
            contestantJudgesList.appendChild(noJudges);
        }
    }
    
    // Reset voting sections - both are now visible side by side
    closeVoteConfirmModal();
    votingResults.classList.add('hidden');
    roundResultsSection.classList.add('hidden');
    winMessages.innerHTML = '';
    
    // Hide winner previews
    leadWinnerPreview.classList.add('hidden');
    followWinnerPreview.classList.add('hidden');
    
    // Reset collected votes
    leadVotes = {};
    followVotes = {};
    votingLocked = { lead: false, follow: false };
    
    // Reset submit button
    submitVotesBtn.disabled = false;
    
	// Only reset song input if we're not in auto-advance mode
	if (!window.debugTools || !window.debugTools.autoAdvance) {
		const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
		const si = document.getElementById('song-input');
		if (si) si.value = '';
		if (!spotifyOn) {
			if (songInputSection) songInputSection.style.display = 'none';
			if (playlistEmbedSection) playlistEmbedSection.style.display = 'none';
		} else if (!playlistModeEnabled) {
			if (songInputSection) songInputSection.style.display = '';
			if (playlistEmbedSection) playlistEmbedSection.style.display = 'none';
		} else {
			if (songInputSection) songInputSection.style.display = 'none';
			if (playlistEmbedSection) playlistEmbedSection.style.display = '';
		}
	}
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

function createJudgeVotingCard(judgeName, isGuest, voteType) {
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
    function onChipClick(chip, voteValue) {
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
    let mixedChip = null;
    if (isProxyContestantJudges) {
        mixedChip = document.createElement('button');
        mixedChip.className = 'vote-chip vote-option-mixed';
        mixedChip.textContent = 'Mixed';
        mixedChip.disabled = true;
        mixedChip.style.display = 'none'; // Hidden until a guest judge picks Tie or NC
        mixedChip.addEventListener('click', () => onChipClick(mixedChip, VOTE_MIXED));
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

function recordVote(judgeName, voteOption, voteType) {
    if (voteType === 'lead') {
        leadVotes[judgeName] = voteOption;
    } else if (voteType === 'follow') {
        followVotes[judgeName] = voteOption;
    }
    console.log(`${voteType} vote recorded for ${judgeName}: ${voteOption}`);

    // Demo mode hook: advance once ALL votes for a role are cast
    if (demoMode) {
        const currentStep = DEMO_STEPS[demoStep];
        if (currentStep && (
            (currentStep.action === 'wait-for-lead-vote' && voteType === 'lead') ||
            (currentStep.action === 'wait-for-follow-vote' && voteType === 'follow')
        )) {
            const votes = voteType === 'lead' ? leadVotes : followVotes;
            const allJudges = buildJudgeRoster();
            const allVoted = allJudges.every(j => votes[j] !== undefined);
            if (allVoted) {
                enableDemoNextButton();
            }
        }
    }

    // Update mixed button availability based on tie/no contest votes
    updateMixedButtonState(voteType);

    // Update submit button state based on voting progress
    updateSubmitButtonState();
}

// Check if any guest judge has voted tie (3) or no contest (4) for the given vote type
function hasGuestTieOrNoContest(voteType) {
    const votes = voteType === 'lead' ? leadVotes : followVotes;
    return (guestJudges || []).some(judge => {
        const vote = votes[judge];
        return vote === 3 || vote === 4; // 3 = tie, 4 = no contest
    });
}

// Check if ALL guest judges who have voted have ONLY voted tie or no contest (no votes for contestant 1 or 2)
// Returns true if all guest votes are tie/no contest, meaning there's no clear winner to base the mixed vote on
function allGuestsOnlyTieOrNoContest(voteType) {
    const votes = voteType === 'lead' ? leadVotes : followVotes;
    const guestVotes = (guestJudges || []).map(judge => votes[judge]).filter(v => v !== undefined);
    
    // If no guest votes yet, return false (don't disable mixed prematurely)
    if (guestVotes.length === 0) return false;
    
    // Check if all guest votes are only tie (3) or no contest (4)
    return guestVotes.every(vote => vote === 3 || vote === 4);
}

// Update the mixed button's enabled/disabled state for the given vote type
function updateMixedButtonState(voteType) {
    if (!simpleContestantJudgesEnabled) return;
    
    const proxyCardId = `${voteType}-judge-${PROXY_CONTESTANT_JUDGES_NAME.replace(/\s+/g, '-').toLowerCase()}`;
    const proxyCard = document.getElementById(proxyCardId);
    if (!proxyCard) return;
    
    const mixedBtn = proxyCard.querySelector('.vote-option-mixed');
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
    
    const submitBtn = document.getElementById('submit-votes');
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

function showVoteConfirmError(message) {
    if (!voteConfirmError) return;
    voteConfirmError.textContent = message || '';
    if (message) {
        voteConfirmError.classList.remove('hidden');
    } else {
        voteConfirmError.classList.add('hidden');
    }
}

function openVoteConfirmModal(evt) {
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
    } catch (_) {}
}

function closeVoteConfirmModal() {
    if (!voteConfirmModal) return;
    voteConfirmModal.classList.add('hidden');
    showVoteConfirmError('');
    try {
        if (submitVotesBtn) submitVotesBtn.focus();
    } catch (_) {}
}

function openEndEarlyModal() {
    if (!endEarlyModal) return;
    endEarlyModal.classList.remove('hidden');
    try {
        if (endEarlyConfirmBtn) endEarlyConfirmBtn.focus();
    } catch (_) {}
}

function closeEndEarlyModal() {
    if (!endEarlyModal) return;
    endEarlyModal.classList.add('hidden');
}

function calculateWinner(voteType) {
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
    const guestVotes = votesArray.filter(([judge, vote]) => guestJudges.includes(judge)).map(([judge, vote]) => vote);
    
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

function showWinnerPreview(voteType) {
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

function hideWinnerPreview(voteType) {
    if (voteType === 'lead') {
        leadWinnerPreview.classList.add('hidden');
    } else {
        followWinnerPreview.classList.add('hidden');
    }
}

// Lock all voting buttons for a specific vote type (lead or follow)
function lockVoting(voteType) {
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

async function submitCombinedVotes(options = {}) {
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
    const songInput = document.getElementById('song-input');
    const songInfo = {};
    const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
    if (spotifyOn) {
        if (playlistModeEnabled && currentRoundTrack && currentRoundTrack.id) {
            songInfo.spotify_url = `https://open.spotify.com/track/${currentRoundTrack.id}`;
            songInfo.title = currentRoundTrack.name || '';
            songInfo.artist = currentRoundTrack.artists || '';
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
        if (playlistModeEnabled && currentRoundTrack && currentRoundTrack.id) {
            usedTrackIds.add(currentRoundTrack.id);
            try {
                localStorage.setItem(`usedTracks:${sessionId}`, JSON.stringify(Array.from(usedTrackIds)));
            } catch (_) {}
        }
        
        // Close the modal on successful submit
        closeVoteConfirmModal();

        // Demo mode hook: advance past the "Submit" step
        if (demoMode) {
            const currentStep = DEMO_STEPS[demoStep];
            if (currentStep && currentStep.action === 'wait-for-submit') {
                enableDemoNextButton();
            }
        }

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
                winMessages.innerHTML = data.win_messages.map(msg => `<p>${msg}</p>`).join('');
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
        } catch (_) {}

        // Auto-advance to the next round (unless game finished)
        if (shouldAutoAdvance && !data.game_finished) {
            try {
                await goToNextRound();
            } catch (_) {
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
    currentResultsData = null;
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
    
    // Reset playlist state
    playlistModeEnabled = false;
    playlistUrl = '';
    playlistId = '';
    playlistTracks = [];
    usedTrackIds = new Set();
    currentRoundTrack = null;
    lastPreparedSongRoundNumber = null;
    try {
        const sid = localStorage.getItem('sessionId');
        if (sid) {
            localStorage.removeItem(`usedTracks:${sid}`);
            localStorage.removeItem(`playlist:url:${sid}`);
        }
    } catch (_) {}
    const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
    if (songInputSection) songInputSection.style.display = spotifyOn ? '' : 'none';
    if (playlistEmbedSection) playlistEmbedSection.style.display = 'none';
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
function updateScoreTable(leads, follows) {
    // Clear existing scores
    const leadScoreBody = document.getElementById('lead-results-body');
    const followScoreBody = document.getElementById('follow-results-body');
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
        pointsCell.textContent = lead.points;
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
        pointsCell.textContent = follow.points;
        row.appendChild(nameCell);
        row.appendChild(pointsCell);
        followScoreBody.appendChild(row);
    });
}

// --- Router hydration helpers (called by js/router.js) -------------------

// Navigate to the results screen for a given payload, updating the URL.
function showResults(data, opts) {
    currentResultsData = data;
    let sid;
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'sessionId')) sid = opts.sessionId;
    else sid = (data && data.session_id) ? data.session_id : sessionId;
    navigate(sid ? '/results/' + encodeURIComponent(sid) : '/results');
}

// Enter /battle/<id>: rebuild the interactive (or display) battle from server state.
function hydrateBattleRoute(sid) {
    if (!sid) { navigate('/', { replace: true }); return; }
    // Already live in-memory for this session (e.g. just started) — no refetch needed.
    if (sessionId === sid && liveBattleActive && !displayMode) {
        updateSessionIdDisplay();
        return;
    }
    sessionId = sid;
    try { localStorage.setItem('sessionId', sid); } catch (e) {}
    fetch(`/api/state?session_id=${encodeURIComponent(sid)}`)
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(state => {
            if (state.flags && state.flags.finished) {
                navigate('/results/' + encodeURIComponent(sid), { replace: true });
                return;
            }
            if (displayMode) { initDisplayMode(); return; }
            liveBattleActive = true;
            renderFromState(state);
            updateSessionIdDisplay();
            if (typeof fetchScores === 'function') fetchScores();
        })
        .catch(() => {
            try { showToast('That battle was not found or has expired.', 'error'); } catch (e) {}
            navigate('/', { replace: true });
        });
}

// Enter /results/<id> (or /results with in-memory data): render final results.
function hydrateResultsRoute(sid) {
    if (!sid) {
        if (currentResultsData) displayResults(currentResultsData);
        else navigate('/', { replace: true });
        return;
    }
    if (currentResultsData && currentResultsData.session_id === sid) {
        displayResults(currentResultsData);
        return;
    }
    fetch(`/api/results?session_id=${encodeURIComponent(sid)}`)
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(data => { currentResultsData = data; displayResults(data); })
        .catch(() => {
            try { showToast('Those results were not found or have expired.', 'error'); } catch (e) {}
            navigate('/', { replace: true });
        });
}

async function displayResults(data) {
    console.log('Displaying results with data:', data);
    
    // Ensure display mode polling is stopped when showing results
    stopDisplayPolling();
    
    // Use the showScreen function with the correct screen element
    showScreen(resultsScreen);
    
    // Clear previous results
    const leadResultsBody = document.getElementById('lead-results-body');
    const followResultsBody = document.getElementById('follow-results-body');
    const roundsContainer = document.getElementById('rounds-accordion');
    const leadsInitialOrder = document.getElementById('leads-initial-order');
    const followsInitialOrder = document.getElementById('follows-initial-order');
    const leadGraphic = document.getElementById('lead-graphic');
    const followGraphic = document.getElementById('follow-graphic');
    
    if (!leadResultsBody || !followResultsBody || !roundsContainer) {
        console.error('Could not find required elements for results display');
        return;
    }
    
    // Clear all previous data
    leadResultsBody.innerHTML = '';
    followResultsBody.innerHTML = '';
    roundsContainer.innerHTML = '';
    if (leadsInitialOrder) leadsInitialOrder.innerHTML = '';
    if (followsInitialOrder) followsInitialOrder.innerHTML = '';
    if (leadGraphic) leadGraphic.innerHTML = '';
    if (followGraphic) followGraphic.innerHTML = '';
    
    // Sync globals so exportSocialImage() has current data
    currentLeads = data.leads || [];
    currentFollows = data.follows || [];

    // Always use the initial order from the server response
    const initialLeadsData = data.initial_leads || [];
    const initialFollowsData = data.initial_follows || [];
    console.log('Using initial leads from server:', initialLeadsData);
    console.log('Using initial follows from server:', initialFollowsData);
    
    console.log('Lead results:', data.leads);
    console.log('Follow results:', data.follows);
    
    // Crown the resolved battle champion (threshold / tie-break / early-end leader).
    // Falls back to the top scorer only if champion info is absent.
    const champions = data.champions;
    function crownName(role, list) {
        if (champions && champions[role] !== undefined) {
            // Champion info present: trust it — a null name means no outright winner.
            return champions[role] && champions[role].name ? champions[role].name : null;
        }
        // Legacy payload without champions: fall back to the top scorer.
        if (Array.isArray(list) && list.length > 0) {
            const top = list.reduce((best, c) =>
                (Number(c.points) || 0) > (Number(best.points) || 0) ? c : best, list[0]);
            return top && top.name ? top.name : null;
        }
        return null;
    }
    const topLeadName = crownName('lead', data.leads);
    const topFollowName = crownName('follow', data.follows);

    // Display lead results
    if (data.leads && Array.isArray(data.leads)) {
        data.leads.forEach(lead => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            const leadCrown = (topLeadName && lead.name === topLeadName) ? ' 👑' : '';
            nameCell.textContent = `${lead.name}${leadCrown}`.trim();
            
            const pointsCell = document.createElement('td');
            pointsCell.textContent = lead.points;
            
            row.appendChild(nameCell);
            row.appendChild(pointsCell);
            leadResultsBody.appendChild(row);
        });
    } else {
        console.warn('No lead results data available');
    }
    
    // Display follow results
    if (data.follows && Array.isArray(data.follows)) {
        data.follows.forEach(follow => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            const followCrown = (topFollowName && follow.name === topFollowName) ? ' 👑' : '';
            nameCell.textContent = `${follow.name}${followCrown}`.trim();
            
            const pointsCell = document.createElement('td');
            pointsCell.textContent = follow.points;
            
            row.appendChild(nameCell);
            row.appendChild(pointsCell);
            followResultsBody.appendChild(row);
        });
    } else {
        console.warn('No follow results data available');
    }

    // Build battle graphic data: map contestant to rounds and wins
    if (Array.isArray(data.rounds) && data.rounds.length > 0 && leadGraphic && followGraphic) {
        const leadMap = new Map();
        const followMap = new Map();
        const totalRounds = data.rounds.length;
        data.rounds.forEach(r => {
            const roundNum = r.round_num;
            if (r.tiebreak) {
                (r.tiebreak_leads || []).forEach(name => {
                    if (!leadMap.has(name)) leadMap.set(name, []);
                    leadMap.get(name).push({ round: roundNum, win: r.lead_winner === name });
                });
                (r.tiebreak_follows || []).forEach(name => {
                    if (!followMap.has(name)) followMap.set(name, []);
                    followMap.get(name).push({ round: roundNum, win: r.follow_winner === name });
                });
                return;
            }
            const pair1Lead = r.pairs?.pair_1?.lead;
            const pair1Follow = r.pairs?.pair_1?.follow;
            const pair2Lead = r.pairs?.pair_2?.lead;
            const pair2Follow = r.pairs?.pair_2?.follow;
            const leadWinner = r.lead_winner;
            const followWinner = r.follow_winner;
            if (pair1Lead) {
                if (!leadMap.has(pair1Lead)) leadMap.set(pair1Lead, []);
                leadMap.get(pair1Lead).push({ round: roundNum, win: leadWinner === pair1Lead });
            }
            if (pair2Lead) {
                if (!leadMap.has(pair2Lead)) leadMap.set(pair2Lead, []);
                leadMap.get(pair2Lead).push({ round: roundNum, win: leadWinner === pair2Lead });
            }
            if (pair1Follow) {
                if (!followMap.has(pair1Follow)) followMap.set(pair1Follow, []);
                followMap.get(pair1Follow).push({ round: roundNum, win: followWinner === pair1Follow });
            }
            if (pair2Follow) {
                if (!followMap.has(pair2Follow)) followMap.set(pair2Follow, []);
                followMap.get(pair2Follow).push({ round: roundNum, win: followWinner === pair2Follow });
            }
        });

        // Helper to render a column by initial order
        const renderGraphicColumn = (initialOrder, dataMap, topName, container) => {
            initialOrder.forEach((name, idx) => {
                const row = document.createElement('div');
                row.className = 'graphic-row';
                const rank = document.createElement('div');
                rank.className = 'graphic-rank';
                rank.textContent = `${idx + 1}.`;
                const nameDiv = document.createElement('div');
                nameDiv.className = 'graphic-name';
                nameDiv.textContent = name;
                if (topName && name === topName) {
                    const crown = document.createElement('span');
                    crown.className = 'crown-icon';
                    crown.textContent = '👑';
                    nameDiv.appendChild(crown);
                }
                const badges = document.createElement('div');
                badges.className = 'round-badges';
                const rounds = dataMap.get(name) || [];
                // Sort rounds ascending by round number
                rounds.sort((a, b) => a.round - b.round);
                rounds.forEach(info => {
                    const b = document.createElement('div');
                    b.className = 'badge' + (info.win ? ' win' : '');
                    b.textContent = info.round;
                    badges.appendChild(b);
                });
                row.appendChild(rank);
                row.appendChild(nameDiv);
                row.appendChild(badges);
                container.appendChild(row);
            });
        };

        renderGraphicColumn(initialLeadsData || [], leadMap, topLeadName, leadGraphic);
        renderGraphicColumn(initialFollowsData || [], followMap, topFollowName, followGraphic);

        // Cache for social export
        resultsLeadMap = leadMap;
        resultsFollowMap = followMap;
        resultsInitialLeads = [...(initialLeadsData || [])];
        resultsInitialFollows = [...(initialFollowsData || [])];
        resultsTopLeadName = topLeadName;
        resultsTopFollowName = topFollowName;
        resultsNumRounds = totalRounds;
        resultsGuestJudges = guestJudges.length > 0
            ? [...guestJudges]
            : (() => {
                // Fallback: extract unique judge names from rounds data
                // (handles page-reload case where guestJudges global was reset)
                const seen = new Set();
                (data.rounds || []).forEach(r => {
                    if (Array.isArray(r.judges)) r.judges.forEach(j => seen.add(j));
                });
                return [...seen];
            })();
    }
    
    console.log('Round history:', data.rounds);
    
    // Always render round history; optionally enrich with Spotify metadata if enabled
    const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
    if (spotifyOn && data.rounds && data.rounds.length > 0) {
        try {
            const access_token = await getSpotifyToken();
            
            // Fetch metadata for all rounds in parallel
            await Promise.all(data.rounds.map(async (round) => {
                if (spotifyOn && round.song_info && round.song_info.spotify_url) {
                    try {
                        const spotifyUrl = new URL(round.song_info.spotify_url);
                        const trackId = spotifyUrl.pathname.split('/').pop();
                        
                        if (trackId) {
                            const metadataResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                                headers: {
                                    'Authorization': `Bearer ${access_token}`
                                }
                            });
                            
                            if (metadataResponse.status === 401 && spotifyOn) {
                                // Token expired, get a new one and retry
                                const newToken = await getSpotifyToken();
                                const retryResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                                    headers: {
                                        'Authorization': `Bearer ${newToken}`
                                    }
                                });
                                
                                if (retryResponse.ok) {
                                    const metadata = await retryResponse.json();
                                    round.song_info.title = metadata.name;
                                    round.song_info.artist = metadata.artists.map(artist => artist.name).join(', ');
                                }
                            } else if (metadataResponse.ok) {
                                const metadata = await metadataResponse.json();
                                round.song_info.title = metadata.name;
                                round.song_info.artist = metadata.artists.map(artist => artist.name).join(', ');
                            }
                        }
                    } catch (e) {
                        console.error(`Error fetching metadata for ${round.song_info.spotify_url}:`, e);
                    }
                }
            }));
        } catch (error) {
            console.error('Error fetching Spotify metadata:', error);
        }
        
        // Fallthrough to render below
    }

    // Display round history regardless of Spotify status
    if (data.rounds && data.rounds.length > 0) {
        displayRoundHistory(data.rounds);
    } else {
        console.warn('No round history data available');
    }

    showToast('Battle complete!', 'success');
}

// Update the displayRoundHistory function
function displayRoundHistory(rounds) {
    const roundsContainer = document.getElementById('rounds-accordion');
    roundsContainer.innerHTML = '';
    
    // Sort rounds by round number
    rounds.sort((a, b) => a.round_num - b.round_num);
    
    // Create an accordion item for each round
    rounds.forEach(round => {
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item' + (round.tiebreak ? ' tiebreak' : '');

        // Create the header
        const header = document.createElement('div');
        header.className = 'accordion-header' + (round.tiebreak ? ' tiebreak' : '');
        const headerLabel = round.tiebreak
            ? `Round ${round.round_num} <span class="tiebreak-history-badge">Tie-Break</span>`
            : `Round ${round.round_num}`;
        header.innerHTML = `<span>${headerLabel}</span><span>+</span>`;
        
        // Add click handler for accordion functionality
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isOpen = content.classList.contains('open');

            // Toggle open state
            header.classList.toggle('active');
            content.classList.toggle('open');

            // Update the plus/minus symbol
            const symbol = header.lastElementChild;
            symbol.textContent = isOpen ? '+' : '-';
        });
        
        // Create the content
        const content = document.createElement('div');
        content.className = 'accordion-content';
        
        // Add round details
        const details = document.createElement('div');
        details.className = 'round-details';
        const topRow = document.createElement('div');
        topRow.className = 'round-top-row';
        
        // Add song information if available
        if (round.song_info) {
            const songSection = document.createElement('div');
            songSection.className = 'round-song';
            let songHTML = '<h4>Song</h4>';
            
            // Add song title and artist if available
            if (round.song_info.title || round.song_info.artist) {
                songHTML += '<div class="song-details">';
                if (round.song_info.title) {
                    songHTML += `<div class="song-title">${round.song_info.title}</div>`;
                }
                if (round.song_info.artist) {
                    songHTML += `<div class="song-artist">${round.song_info.artist}</div>`;
                }
                songHTML += '</div>';
            }
            
            if (localStorage.getItem('spotify.enabled') === 'true' && round.song_info.spotify_url) {
                try {
                    const spotifyUrl = new URL(round.song_info.spotify_url);
                    const trackId = spotifyUrl.pathname.split('/').pop();
                    if (trackId) {
                        songHTML += `
                            <iframe 
                                src="https://open.spotify.com/embed/track/${trackId}" 
                                width="100%" 
                                height="80" 
                                frameborder="0" 
                                allowtransparency="true" 
                                allow="encrypted-media"
                                class="spotify-embed">
                            </iframe>`;
                    }
                } catch (e) {
                    console.error('Invalid Spotify URL:', e);
                }
            }
            
            songSection.innerHTML = songHTML;
            topRow.appendChild(songSection);
        }
        
        // Participants section
        const participants = document.createElement('div');
        participants.className = 'round-participants';

        if (round.tiebreak) {
            let html = '<h4>Tie-Break</h4>';
            if (round.tiebreak_leads?.length) {
                html += `<div class="tiebreak-history-group">
                    <span class="tiebreak-history-role-label">Leads</span>
                    <span class="tiebreak-history-names">
                        ${round.tiebreak_leads.map(n =>
                            `<span class="contestant lead${round.lead_winner === n ? ' tiebreak-history-winner' : ''}">${n}${round.lead_winner === n ? ' 🏆' : ''}</span>`
                        ).join('<span class="tiebreak-history-vs">vs</span>')}
                    </span>
                </div>`;
            }
            if (round.tiebreak_follows?.length) {
                html += `<div class="tiebreak-history-group">
                    <span class="tiebreak-history-role-label">Follows</span>
                    <span class="tiebreak-history-names">
                        ${round.tiebreak_follows.map(n =>
                            `<span class="contestant follow${round.follow_winner === n ? ' tiebreak-history-winner' : ''}">${n}${round.follow_winner === n ? ' 🏆' : ''}</span>`
                        ).join('<span class="tiebreak-history-vs">vs</span>')}
                    </span>
                </div>`;
            }
            participants.innerHTML = html;
            topRow.appendChild(participants);
            details.appendChild(topRow);
        } else {
            let participantsHTML = '<h4>Participants</h4>';
            if (round.pairs && Object.keys(round.pairs).length > 0) {
                participantsHTML += `
                    <div class="match-pair">
                        <div>Couple 1:</div>
                        <div><span class="lead">${round.pairs.pair_1.lead}</span> (Lead) &
                        <span class="follow">${round.pairs.pair_1.follow}</span> (Follow)</div>
                    </div>
                    <div class="match-pair">
                        <div>Couple 2:</div>
                        <div><span class="lead">${round.pairs.pair_2.lead}</span> (Lead) &
                        <span class="follow">${round.pairs.pair_2.follow}</span> (Follow)</div>
                    </div>
                `;
                if (round.lead_winner) participantsHTML += `<div class="winner">Lead Winner: ${round.lead_winner}</div>`;
                if (round.follow_winner) participantsHTML += `<div class="winner">Follow Winner: ${round.follow_winner}</div>`;
            } else {
                participantsHTML += '<p>No participant data available for this round.</p>';
            }
            participants.innerHTML = participantsHTML;
            topRow.appendChild(participants);
            details.appendChild(topRow);
        }

        // Add judge votes section (normal rounds only)
        if (round.tiebreak) {
            content.appendChild(details);
            accordionItem.appendChild(header);
            accordionItem.appendChild(content);
            roundsContainer.appendChild(accordionItem);
            return;
        }

        const judgeVotes = document.createElement('div');
        judgeVotes.className = 'judge-votes';
        let judgeVotesHTML = '<h4>Judge Votes</h4>';
        judgeVotesHTML += '<div class="vote-sections">';

        // Lead votes
        if (round.lead_votes) {
            judgeVotesHTML += '<div class="vote-section lead"><h5>Lead Votes</h5>';
            
            // Sort votes to show guest judges first
            const sortedVotes = Object.entries(round.lead_votes).sort((a, b) => {
                const aIsGuest = guestJudges.includes(a[0]);
                const bIsGuest = guestJudges.includes(b[0]);
                if (aIsGuest && !bIsGuest) return -1;
                if (!aIsGuest && bIsGuest) return 1;
                return 0;
            });

            judgeVotesHTML += '<table class="judge-votes-table"><thead><tr><th>Judge</th><th>Type</th><th>Vote</th></tr></thead><tbody>';
            sortedVotes.forEach(([judge, vote]) => {
                const isGuest = guestJudges.includes(judge);
                const voteText = getVoteText(vote, round);
                const judgeType = isGuest ? 'Guest' : 'Contestant';
                judgeVotesHTML += `
                    <tr class="judge-vote ${isGuest ? 'guest-judge' : ''}">
                        <td class="judge-name">${judge}</td>
                        <td><span class="judge-type ${isGuest ? 'guest' : 'contestant'}">${judgeType}</span></td>
                        <td class="vote">${voteText}</td>
                    </tr>
                `;
            });
            judgeVotesHTML += '</tbody></table></div>';
        }

        // Follow votes
        if (round.follow_votes) {
            judgeVotesHTML += '<div class="vote-section follow"><h5>Follow Votes</h5>';
            
            // Sort votes to show guest judges first
            const sortedVotes = Object.entries(round.follow_votes).sort((a, b) => {
                const aIsGuest = guestJudges.includes(a[0]);
                const bIsGuest = guestJudges.includes(b[0]);
                if (aIsGuest && !bIsGuest) return -1;
                if (!aIsGuest && bIsGuest) return 1;
                return 0;
            });

            judgeVotesHTML += '<table class="judge-votes-table"><thead><tr><th>Judge</th><th>Type</th><th>Vote</th></tr></thead><tbody>';
            sortedVotes.forEach(([judge, vote]) => {
                const isGuest = guestJudges.includes(judge);
                const voteText = getFollowVoteText(vote, round);
                const judgeType = isGuest ? 'Guest' : 'Contestant';
                judgeVotesHTML += `
                    <tr class="judge-vote ${isGuest ? 'guest-judge' : ''}">
                        <td class="judge-name">${judge}</td>
                        <td><span class="judge-type ${isGuest ? 'guest' : 'contestant'}">${judgeType}</span></td>
                        <td class="vote">${voteText}</td>
                    </tr>
                `;
            });
            judgeVotesHTML += '</tbody></table></div>';
        }
        judgeVotesHTML += '</div>';
        judgeVotes.innerHTML = judgeVotesHTML;
        details.appendChild(judgeVotes);
        
        // Session ID removed from round cell for cleaner display
        
        // Append assembled sections
        content.appendChild(details);
        accordionItem.appendChild(header);
        accordionItem.appendChild(content);
        roundsContainer.appendChild(accordionItem);
    });
}

// Helper function to convert vote numbers to text
function getVoteText(vote, round) {
    if (!round || !round.pairs) return 'Unknown';
    
    switch (vote) {
        case 1:
            return round.pairs.pair_1.lead;
        case 2:
            return round.pairs.pair_2.lead;
        case 3:
            return 'Tie';
        case 4:
            return 'No Contest';
        default:
            return 'Unknown';
    }
}

// Helper function to convert follow vote numbers to text
function getFollowVoteText(vote, round) {
    if (!round || !round.pairs) return 'Unknown';
    
    switch (vote) {
        case 1:
            return round.pairs.pair_1.follow;
        case 2:
            return round.pairs.pair_2.follow;
        case 3:
            return 'Tie';
        case 4:
            return 'No Contest';
        default:
            return 'Unknown';
    }
}

async function getSpotifyToken() {
    try {
        const response = await fetch('/api/get_spotify_token');
        if (!response.ok) {
            throw new Error('Failed to get Spotify access token');
        }
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('Error getting Spotify token:', error);
        throw error;
    }
}

async function fetchPlaylistTracks(offset = 0) {
    // Use server proxy to avoid client-side CORS and centralize token handling
    const resp = await fetch(`/api/spotify/playlist_tracks?playlist_id=${encodeURIComponent(playlistId)}`);
    if (!resp.ok) {
        let details = '';
        try { const j = await resp.json(); details = j && j.error ? j.error : ''; } catch (_) {}
        throw new Error(`Failed to fetch playlist tracks: ${resp.status} ${details}`);
    }
    const data = await resp.json();
    const newTracks = Array.isArray(data.tracks) ? data.tracks : [];
    const existingIds = new Set(playlistTracks.map(t => t.id));
    newTracks.forEach(t => { if (t && t.id && !existingIds.has(t.id)) playlistTracks.push(t); });
}

async function preparePlaylistSongForRound(roundNum) {
    try {
        const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
        if (!spotifyOn || !playlistModeEnabled || !playlistId) return;
        if (playlistTracks.length === 0) await fetchPlaylistTracks();
        let track = pickNextUnusedTrack();
        if (!track) {
            // Try refreshing tracks in case playlist changed since initial fetch
            playlistTracks = [];
            await fetchPlaylistTracks();
            track = pickNextUnusedTrack();
        }
        if (!track) {
            console.warn('No available unused tracks in playlist. Disabling playlist mode.');
            renderPlaylistEmbed(null);
            currentRoundTrack = null;
            disablePlaylistMode('No more unused tracks available.');
            if (localStorage.getItem('spotify.enabled') === 'true') {
                try { showToast('No more unused tracks left in the playlist. Please enter a song URL manually for remaining rounds.', 'error', 5000); } catch (_) {}
            }
            return;
        }
        currentRoundTrack = track;
        lastPreparedSongRoundNumber = roundNum;
        renderPlaylistEmbed(track);
        // Do not auto-start full playback; user can click Play Full to initiate OAuth if needed
    } catch (e) {
        console.warn('preparePlaylistSongForRound error:', e);
        disablePlaylistMode('Error preparing playlist track.');
    }
}

function renderPlaylistEmbed(track) {
    if (!playlistEmbedContainer) return;
    playlistEmbedContainer.innerHTML = '';
    if (!track || !track.id) return;
    const iframe = document.createElement('iframe');
    iframe.src = `https://open.spotify.com/embed/track/${track.id}`;
    iframe.width = '100%';
    iframe.height = '80';
    iframe.frameBorder = '0';
    iframe.allow = 'encrypted-media';
    iframe.className = 'spotify-embed';
    playlistEmbedContainer.appendChild(iframe);
}

function _rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function exportSocialImage() {
    const W = 1080, H = 1920;
    await document.fonts.ready;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Design tokens
    const C = {
        ink:      '#111111',
        paper:    '#F8F7F4',
        paperAlt: '#EFEDE9',
        gray:     '#808080',
        border:   '#D4D4D4',
        gold:     '#F5B400',
    };

    // Background (paper, never pure white)
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);

    // Top accent bar
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, 12);

    // Custom crown path — gold, drawn at center (cx, cy), given height `size`
    const drawCrown = (cx, cy, size) => {
        const w = size * 1.4;
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2,    cy + size * 0.42);
        ctx.lineTo(cx - w / 2,    cy - size * 0.08);
        ctx.lineTo(cx - w * 0.15, cy + size * 0.22);
        ctx.lineTo(cx,            cy - size * 0.52);
        ctx.lineTo(cx + w * 0.15, cy + size * 0.22);
        ctx.lineTo(cx + w / 2,    cy - size * 0.08);
        ctx.lineTo(cx + w / 2,    cy + size * 0.42);
        ctx.closePath();
        ctx.fill();
        // Dots at the three tips
        const dr = size * 0.11;
        [[cx - w / 2, cy - size * 0.08], [cx, cy - size * 0.52], [cx + w / 2, cy - size * 0.08]].forEach(([dx, dy]) => {
            ctx.beginPath();
            ctx.arc(dx, dy - dr * 0.7, dr, 0, Math.PI * 2);
            ctx.fill();
        });
    };

    // --- Header ---
    const now = new Date();
    const TITLE_SIZE = 96;
    const titleY = 12 + 52 + Math.round(TITLE_SIZE * 0.78); // baseline ≈ 151
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    ctx.font = `${TITLE_SIZE}px "Permanent Marker","Knewave",cursive`;
    ctx.fillText("Hustle n' Tussle", W / 2, titleY);

    // Gold rule directly below title
    const ruleY = titleY + 14;
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 320, ruleY);
    ctx.quadraticCurveTo(W / 2, ruleY + 5, W / 2 + 320, ruleY + 1);
    ctx.stroke();

    // Date sticky-note tag — top right, slightly rotated
    ctx.save();
    ctx.translate(W - 72, titleY - 40);
    ctx.rotate(0.09);
    const tagW = 148, tagH = 96;
    _rrect(ctx, -tagW / 2, -tagH / 2, tagW, tagH, 8);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `32px "Permanent Marker",cursive`;
    ctx.textAlign = 'center';
    ctx.fillText(`${now.toLocaleDateString('en-US', { month: 'short' })} ${now.getDate()},`, 0, -10);
    ctx.fillText(`${now.getFullYear()}.`, 0, 30);
    ctx.restore();

    // Black brush-band for edition
    const EDITION_SIZE = 42;
    const bandGap = 18; // gap from rule to band
    const bandH = EDITION_SIZE + 28;
    const bandY = ruleY + bandGap;
    const bandMid = bandY + bandH / 2;
    // Rough brush-stroke shape
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(24, bandY + 3);
    ctx.quadraticCurveTo(W / 2, bandY - 5, W - 24, bandY + 6);
    ctx.quadraticCurveTo(W - 18, bandMid, W - 24, bandY + bandH - 4);
    ctx.quadraticCurveTo(W / 2, bandY + bandH + 6, 24, bandY + bandH - 2);
    ctx.quadraticCurveTo(18, bandMid, 24, bandY + 3);
    ctx.fill();
    // Edition text in gold on the band
    const editionText = `${now.toLocaleDateString('en-US', { month: 'long' })} Edition (${now.getFullYear()})`;
    ctx.fillStyle = C.gold;
    ctx.font = `${EDITION_SIZE}px "Permanent Marker",cursive`;
    ctx.textAlign = 'center';
    ctx.fillText(editionText, W / 2, bandY + bandH * 0.68);

    // Judges line below the band
    let contentStartY = bandY + bandH + 16 + 32; // no judges
    if (resultsGuestJudges.length > 0) {
        const JUDGES_SIZE = 34;
        const judgesY = bandY + bandH + 16 + JUDGES_SIZE;
        ctx.fillStyle = C.gray;
        ctx.font = `500 ${JUDGES_SIZE}px "Inter","DM Sans",sans-serif`;
        ctx.fillText(
            `${resultsGuestJudges.length === 1 ? 'Judge' : 'Judges'}: ${resultsGuestJudges.join(', ')}`,
            W / 2, judgesY
        );
        contentStartY = judgesY + 32;
    }

    // --- Data ---
    const sortedLeads = [...currentLeads].sort((a, b) => (b.points || 0) - (a.points || 0));
    const sortedFollows = [...currentFollows].sort((a, b) => (b.points || 0) - (a.points || 0));
    const leadsOrder = resultsInitialLeads.length ? resultsInitialLeads : sortedLeads.map(l => l.name);
    const followsOrder = resultsInitialFollows.length ? resultsInitialFollows : sortedFollows.map(f => f.name);

    // --- Layout constants (from design system) ---
    const CARD_X = 24;
    const CARD_W = W - 48;
    const CARD_PAD_H = 24;    // horizontal inner padding
    const CARD_HEADER_H = 72;
    const ROW_H = 72;
    const CARD_PAD_BOTTOM = 24;
    const BETWEEN_CARDS = 32;
    const CARD_RADIUS = 20;
    const TOKEN_SIZE = 44;
    const TOKEN_GAP = 8;
    const CROWN_SIZE = 18;

    const innerLeft = CARD_X + CARD_PAD_H;
    const innerRight = CARD_X + CARD_W - CARD_PAD_H;

    // Row sub-layout: Rank | gap | Name | gap | Tokens (right portion)
    const RANK_W = 36;
    const RANK_NAME_GAP = 16;
    const NAME_W = 220;
    const NAME_BADGE_GAP = 24;
    const badgeStartX = innerLeft + RANK_W + RANK_NAME_GAP + NAME_W + NAME_BADGE_GAP;
    const badgeAreaW = innerRight - badgeStartX;

    // Token sizing: 44 px target, scale down only when necessary
    const allRoundCounts = [
        ...[...leadsOrder].map(n => (resultsLeadMap.get(n) || []).length),
        ...[...followsOrder].map(n => (resultsFollowMap.get(n) || []).length),
    ];
    const maxRoundsPerDancer = Math.max(...allRoundCounts, 1);
    const tokenSizeFromW = Math.floor((badgeAreaW + TOKEN_GAP) / maxRoundsPerDancer) - TOKEN_GAP;
    const tokenSize = Math.max(20, Math.min(TOKEN_SIZE, tokenSizeFromW));
    const tokenFontSize = Math.max(10, Math.round(tokenSize * 0.46));

    const NAME_SIZE = 34;
    const RANK_SIZE = 28;

    // --- Draw one card section ---
    const drawSection = (order, map, topName, label, startY) => {
        const cardH = CARD_HEADER_H + order.length * ROW_H + CARD_PAD_BOTTOM;

        // Card base (paper background + border)
        _rrect(ctx, CARD_X, startY, CARD_W, cardH, CARD_RADIUS);
        ctx.fillStyle = C.paper;
        ctx.fill();
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Everything inside the card is clipped to its rounded shape
        ctx.save();
        _rrect(ctx, CARD_X, startY, CARD_W, cardH, CARD_RADIUS);
        ctx.clip();

        // Dark header strip
        ctx.fillStyle = C.ink;
        ctx.fillRect(CARD_X, startY, CARD_W, CARD_HEADER_H);

        // Crown icon + section label in header
        const HEADER_CROWN = 26;
        const crownHCX = innerLeft + HEADER_CROWN * 0.7;
        drawCrown(crownHCX, startY + CARD_HEADER_H / 2, HEADER_CROWN);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `normal 56px "Anton","Bebas Neue","Space Grotesk",sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(label.toUpperCase(), innerLeft + HEADER_CROWN * 1.4 + 14, startY + CARD_HEADER_H - 14);

        // Contestant rows
        const rowsStartY = startY + CARD_HEADER_H;
        order.forEach((name, idx) => {
            const rowY = rowsStartY + idx * ROW_H;
            const isTop = name === topName;
            const baseY = rowY + Math.round(ROW_H * 0.625);

            // Alternating row background (Paper / PaperAlt)
            ctx.fillStyle = idx % 2 === 0 ? C.paper : C.paperAlt;
            ctx.fillRect(CARD_X, rowY, CARD_W, ROW_H);

            // Row separator (almost invisible)
            if (idx > 0) {
                ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(innerLeft, rowY);
                ctx.lineTo(innerRight, rowY);
                ctx.stroke();
            }

            // Rank number
            ctx.fillStyle = C.gray;
            ctx.font = `400 ${RANK_SIZE}px "Inter","DM Sans",sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(`${idx + 1}.`, innerLeft, baseY);

            // Name (clipped to name column so it never bleeds into tokens)
            const nameX = innerLeft + RANK_W + RANK_NAME_GAP;
            ctx.save();
            ctx.beginPath();
            ctx.rect(nameX, rowY, NAME_W, ROW_H);
            ctx.clip();
            ctx.fillStyle = isTop ? C.ink : '#444444';
            ctx.font = `${isTop ? 700 : 600} ${NAME_SIZE}px "Inter","DM Sans",sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(name, nameX, baseY);
            ctx.restore();

            // Crown icon (custom path, gold) placed after name if champion
            if (isTop) {
                ctx.font = `700 ${NAME_SIZE}px "Inter","DM Sans",sans-serif`;
                const nameTextW = ctx.measureText(name).width;
                const crownCX = nameX + nameTextW + 12 + CROWN_SIZE * 0.7;
                if (crownCX + CROWN_SIZE < badgeStartX) {
                    drawCrown(crownCX, baseY - NAME_SIZE * 0.38, CROWN_SIZE);
                }
            }

            // Round tokens
            const rounds = (map.get(name) || []).slice().sort((a, b) => a.round - b.round);
            const tokenCY = rowY + ROW_H / 2;
            rounds.forEach((info, bi) => {
                const cx = badgeStartX + bi * (tokenSize + TOKEN_GAP) + tokenSize / 2;
                const r = tokenSize / 2;

                // Token fill
                ctx.beginPath();
                ctx.arc(cx, tokenCY, r, 0, Math.PI * 2);
                ctx.fillStyle = info.win ? C.ink : C.paper;
                ctx.fill();

                // Token border
                ctx.beginPath();
                ctx.arc(cx, tokenCY, r - 1, 0, Math.PI * 2);
                ctx.strokeStyle = info.win ? C.ink : C.border;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Round number
                ctx.fillStyle = info.win ? '#FFFFFF' : C.ink;
                ctx.font = `700 ${tokenFontSize}px "Inter","DM Mono",monospace`;
                ctx.textAlign = 'center';
                ctx.fillText(String(info.round), cx, tokenCY + tokenFontSize * 0.37);
            });
        });

        ctx.restore(); // end card clip

        return rowsStartY + order.length * ROW_H + CARD_PAD_BOTTOM;
    };

    const leadsEnd = drawSection(leadsOrder, resultsLeadMap, resultsTopLeadName, 'Leads', contentStartY);
    drawSection(followsOrder, resultsFollowMap, resultsTopFollowName, 'Follows', leadsEnd + BETWEEN_CARDS);

    canvas.toBlob(blob => {
        if (!blob) { showToast('Failed to generate image', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hnt-results.png';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 'image/png');
}

async function downloadBattleData() {
    if (!sessionId) {
        console.error('No active session to download data from.');
        return;
    }
    
    try {
        // Fetch the portable JSON battle export (hustlentussle.battle v1)
        const response = await fetch(`/api/export_battle_data?session_id=${sessionId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch battle data: ${response.status}`);
        }
        const battleData = await response.json();

        // If Spotify integration is enabled, enrich song title/artist in-place
        const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
        if (spotifyOn) {
            let access_token = await getSpotifyToken();
            await Promise.all((battleData.rounds || []).map(async (round) => {
                const song = round.song;
                if (!song || !song.spotify_url) return;
                try {
                    const trackId = new URL(song.spotify_url).pathname.split('/').pop();
                    if (!trackId) return;
                    let md = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                        headers: { 'Authorization': `Bearer ${access_token}` }
                    });
                    if (md.status === 401) {
                        access_token = await getSpotifyToken();
                        md = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                            headers: { 'Authorization': `Bearer ${access_token}` }
                        });
                    }
                    if (md.ok) {
                        const meta = await md.json();
                        song.title = meta.name;
                        song.artist = meta.artists.map(a => a.name).join(', ');
                    }
                } catch (e) {
                    console.error(`Error fetching metadata for ${song.spotify_url}:`, e);
                }
            }));
        }

        // Download the JSON directly
        const blob = new Blob([JSON.stringify(battleData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `battle_${sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Error downloading battle data:', error);
        showToast('Failed to download battle data', 'error');
    }
}

// End game function
function endGame() {
    // Disable voting buttons
    document.querySelectorAll('.vote-button').forEach(button => {
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

// ============================================================
// Tie-Break Flow
// ============================================================

function startTiebreakFlow(data) {
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
    document.getElementById('tiebreak-modal').classList.remove('hidden');
}

function renderTiebreakPhase0() {
    document.getElementById('tiebreak-modal-title').textContent = 'Tie-Break: Partner Selection';
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');

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
    document.getElementById('tiebreak-confirm-partners').addEventListener('click', submitTiebreakPartnerSelections);
}

function syncTiebreakSelects() {
    // Disable options already chosen by sibling selects within the same grid
    ['lead', 'follow'].forEach(role => {
        const selects = Array.from(document.querySelectorAll(`.tiebreak-partner-select[data-role="${role}"]`));
        const chosen = new Set(selects.map(s => s.value).filter(Boolean));
        selects.forEach(sel => {
            Array.from(sel.options).forEach(opt => {
                if (!opt.value) return;
                opt.disabled = chosen.has(opt.value) && sel.value !== opt.value;
            });
        });
    });
}

function updateTiebreakPartnerConfirmState() {
    const selects = Array.from(document.querySelectorAll('.tiebreak-partner-select'));
    const allPicked = selects.length > 0 && selects.every(s => s.value);
    const btn = document.getElementById('tiebreak-confirm-partners');
    if (btn) btn.disabled = !allPicked;
}

async function submitTiebreakPartnerSelections() {
    const leadSelections = {};
    const followSelections = {};
    document.querySelectorAll('.tiebreak-partner-select[data-role="lead"]').forEach(sel => {
        if (sel.value) leadSelections[sel.dataset.name] = sel.value;
    });
    document.querySelectorAll('.tiebreak-partner-select[data-role="follow"]').forEach(sel => {
        if (sel.value) followSelections[sel.dataset.name] = sel.value;
    });

    try {
        const resp = await fetch('/api/tiebreak/set_partners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, lead_selections: leadSelections, follow_selections: followSelections }),
        });
        const data = await resp.json();
        tiebreakSubRound = data.sub_round;
        tiebreakSR1Pairings = data.sr1_pairings;
        tiebreakSR2Pairings = data.sr2_pairings;
        renderTiebreakPhase1();
    } catch (e) {
        showToast('Failed to submit partner selections', 'error');
    }
}

function renderTiebreakPairings(pairings) {
    return pairings.map(([lead, follow]) =>
        `<div class="tiebreak-pairing-card">
            <span class="contestant lead">${lead}</span>
            <span class="tiebreak-vs">+</span>
            <span class="contestant follow">${follow}</span>
        </div>`
    ).join('');
}

function renderTiebreakPhase1() {
    document.getElementById('tiebreak-modal-title').textContent = 'Tie-Break: Sub-Round 1';
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');
    body.innerHTML = `
        <p class="tiebreak-subtitle">Announce these pairings. Dancers compete — no vote yet.</p>
        <div class="tiebreak-pairings">${renderTiebreakPairings(tiebreakSR1Pairings)}</div>
        <p class="tiebreak-note">After all pairs have danced, click "Next" to swap partners.</p>`;
    footer.innerHTML = '<button id="tiebreak-advance-btn" class="btn primary">Next: Partner Swap →</button>';
    document.getElementById('tiebreak-advance-btn').addEventListener('click', advanceTiebreakSubRound);
}

function renderTiebreakPhase2() {
    document.getElementById('tiebreak-modal-title').textContent = 'Tie-Break: Sub-Round 2 (Swapped Partners)';
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');
    body.innerHTML = `
        <p class="tiebreak-subtitle">Partners have swapped. Announce these pairings.</p>
        <div class="tiebreak-pairings">${renderTiebreakPairings(tiebreakSR2Pairings)}</div>
        <p class="tiebreak-note">After all pairs have danced, proceed to voting.</p>`;
    footer.innerHTML = '<button id="tiebreak-advance-btn" class="btn primary">Proceed to Voting →</button>';
    document.getElementById('tiebreak-advance-btn').addEventListener('click', advanceTiebreakSubRound);
}

async function advanceTiebreakSubRound() {
    try {
        const resp = await fetch('/api/tiebreak/advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await resp.json();
        tiebreakSubRound = data.sub_round;
        if (tiebreakSubRound === 2) renderTiebreakPhase2();
        else if (tiebreakSubRound === 3) renderTiebreakPhase3();
    } catch (e) {
        showToast('Failed to advance tie-break', 'error');
    }
}

function renderTiebreakPhase3() {
    document.getElementById('tiebreak-modal-title').textContent = 'Tie-Break: Final Vote';
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');
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
    document.getElementById('tiebreak-submit-votes').addEventListener('click', submitTiebreakVotes);
}

function createTiebreakJudgeCard(judgeName, isGuest, voteType, names) {
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

    function onChip(chip, chosenName) {
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

function updateTiebreakSubmitState() {
    const btn = document.getElementById('tiebreak-submit-votes');
    if (!btn) return;
    const allJudges = [...tiebreakGuestJudges, ...tiebreakContestantJudges];
    const leadOk = !tiebreakLeadNeeded || allJudges.every(j => tiebreakLeadVotes[j] !== undefined);
    const followOk = !tiebreakFollowNeeded || allJudges.every(j => tiebreakFollowVotes[j] !== undefined);
    btn.disabled = !(leadOk && followOk);
}

async function submitTiebreakVotes() {
    const allJudges = [...tiebreakGuestJudges, ...tiebreakContestantJudges];
    const leadVotesArray = tiebreakLeadNeeded ? allJudges.filter(j => tiebreakLeadVotes[j] !== undefined).map(j => [j, tiebreakLeadVotes[j]]) : [];
    const followVotesArray = tiebreakFollowNeeded ? allJudges.filter(j => tiebreakFollowVotes[j] !== undefined).map(j => [j, tiebreakFollowVotes[j]]) : [];

    try {
        const resp = await fetch('/api/tiebreak/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, lead_votes: leadVotesArray, follow_votes: followVotesArray }),
        });
        const data = await resp.json();

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
            renderTiebreakResults(data);
        }
    } catch (e) {
        showToast('Failed to submit tie-break votes', 'error');
    }
}

function renderTiebreakStillTied(data) {
    document.getElementById('tiebreak-modal-title').textContent = 'Tie-Break: Votes Tied';
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');

    let html = '<p class="tiebreak-subtitle">The vote ended in a tie. Another round is needed.</p>';

    const buildTallyHtml = (result, role) => {
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
    document.getElementById('tiebreak-next-round-btn').addEventListener('click', renderTiebreakPhase0);
}

function renderTiebreakResults(data) {
    document.getElementById('tiebreak-modal-title').textContent = 'Tie-Break Results';
    const body = document.getElementById('tiebreak-modal-body');
    const footer = document.getElementById('tiebreak-modal-footer');

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
    document.getElementById('tiebreak-view-results').addEventListener('click', finalizeTiebreakAndShowResults);
}

async function finalizeTiebreakAndShowResults() {
    try {
        const resp = await fetch('/api/tiebreak/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await resp.json();
        document.getElementById('tiebreak-modal').classList.add('hidden');
        tiebreakActive = false;
        if (!data.initial_leads || !data.initial_follows) {
            data.initial_leads = initialLeads;
            data.initial_follows = initialFollows;
        }
        showResults(data);
    } catch (e) {
        showToast('Failed to finalize tie-break', 'error');
    }
}

function pickNextUnusedTrack() {
    const unused = playlistTracks.filter(t => t && t.id && !usedTrackIds.has(t.id));
    if (unused.length === 0) return null;
    const idx = Math.floor(Math.random() * unused.length);
    return unused[idx];
} 

async function maybeEnablePlaylistMode(url) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'open.spotify.com') return;
        const parts = parsed.pathname.split('/').filter(Boolean);
        // Accept /playlist/{id} and legacy /user/{userId}/playlist/{id}
        let id = '';
        if (parts[0] === 'playlist' && parts[1]) {
            id = parts[1];
        } else if (parts[0] === 'user' && parts[2] === 'playlist' && parts[3]) {
            id = parts[3];
        } else {
            return;
        }
        playlistId = id;
        playlistUrl = url;
        playlistModeEnabled = true;
        // Reset trackers for new session
        usedTrackIds = new Set();
        currentRoundTrack = null;
        lastPreparedSongRoundNumber = null;
        // UI: hide manual input, show embed section
        if (songInputSection) songInputSection.style.display = 'none';
        if (playlistEmbedSection) playlistEmbedSection.style.display = '';
        // Preload tracks (may fetch multiple pages)
        await fetchPlaylistTracks();
        // Persist playlist URL for the session
        if (sessionId) {
            try {
                localStorage.setItem(`playlist:url:${sessionId}`, playlistUrl);
            } catch (e) {
                console.warn('Failed to persist playlist URL:', e);
            }
        }
    } catch (e) {
        console.warn('Failed to enable playlist mode:', e);
        disablePlaylistMode('Could not fetch playlist tracks. Falling back to manual song input.');
        try { showToast('Could not load Spotify playlist. Falling back to manual song input.', 'error'); } catch (_) {}
    }
}

function disablePlaylistMode(reason) {
    playlistModeEnabled = false;
    playlistUrl = '';
    playlistId = '';
    playlistTracks = [];
    currentRoundTrack = null;
    lastPreparedSongRoundNumber = null;
    if (songInputSection) songInputSection.style.display = '';
    if (playlistEmbedSection) playlistEmbedSection.style.display = 'none';
    if (reason) console.warn('Playlist mode disabled:', reason);
} 

// Spotify Web Playback SDK integration
let spotifyPlayer = null;
let spotifyDeviceId = null;
let webPlaybackReady = false;

function loadSpotifySDK() {
    return new Promise((resolve, reject) => {
        if (window.Spotify) return resolve();
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.onload = () => resolve();
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

async function ensureUserAuthForPlayback() {
    if (!sessionId) return false;
    try {
        const resp = await fetch(`/api/spotify/user_token?session_id=${encodeURIComponent(sessionId)}`);
        if (resp.status === 200) return true;
        if (resp.status === 401) {
            const returnTo = `${window.location.origin}${window.location.pathname}?session_id=${encodeURIComponent(sessionId)}`;
            await startSpotifyAuth(returnTo);
            return false;
        }
        return false;
    } catch (_) {
        return false;
    }
}

async function initWebPlaybackPlayer() {
    await loadSpotifySDK();
    if (!await ensureUserAuthForPlayback()) return;
    if (spotifyPlayer) return;

    window.onSpotifyWebPlaybackSDKReady = () => {};

    // Provide a valid token to the SDK via callback
    try {
        spotifyPlayer = new Spotify.Player({
            name: 'Battle Manager Player',
            getOAuthToken: async (cb) => {
                try {
                    const resp = await fetch(`/api/spotify/user_token?session_id=${encodeURIComponent(sessionId)}`);
                    if (resp.ok) {
                        const data = await resp.json();
                        cb(data.access_token);
                    } else {
                        cb('');
                    }
                } catch (_) {
                    cb('');
                }
            }
        });
    } catch (e) {
        console.warn('Failed to create Spotify Player:', e);
        return;
    }

    spotifyPlayer.addListener('ready', ({ device_id }) => {
        spotifyDeviceId = device_id;
        webPlaybackReady = true;
        console.log('Spotify Web Playback SDK ready with device:', device_id);
    });
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('Spotify Device went offline:', device_id);
        webPlaybackReady = false;
    });

    try { await spotifyPlayer.connect(); } catch (_) {}
}

async function playCurrentRoundTrackViaSpotify() {
    if (!(localStorage.getItem('spotify.enabled') === 'true') || !playlistModeEnabled || !currentRoundTrack || !currentRoundTrack.id) return;
    await initWebPlaybackPlayer();

    // Wait briefly for device readiness if needed
    let tries = 0;
    while (!webPlaybackReady && tries < 20) {
        await new Promise(r => setTimeout(r, 100));
        tries++;
    }

    try {
        const resp = await fetch('/api/spotify/play_track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, track_uri: `spotify:track:${currentRoundTrack.id}`, device_id: spotifyDeviceId || undefined })
        });
        if (!resp.ok) {
            if (resp.status === 401) {
                const returnTo = `${window.location.origin}${window.location.pathname}?session_id=${encodeURIComponent(sessionId)}`;
                await startSpotifyAuth(returnTo);
            } else {
                const err = await resp.json().catch(() => ({}));
                console.warn('Failed to start playback:', err);
                showToast('Unable to start Spotify playback. Please ensure a Premium account and open Spotify on this device.', 'error', 5000);
            }
        }
    } catch (e) {
        console.warn('Failed to start Spotify playback:', e);
    }
}

// Add helper to kick off Spotify auth with return_to
async function startSpotifyAuth(returnToUrl, authKey = '') {
    const url = new URL(window.location.href);
    const sid = sessionId || url.searchParams.get('session_id') || '';
    const params = new URLSearchParams();
    params.set('session_id', sid || 'preauth');
    if (returnToUrl) params.set('return_to', returnToUrl);
    if (authKey) params.set('auth_key', authKey);
    window.location.href = `/api/spotify/authorize?${params.toString()}`;
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
            if (localStorage.getItem('spotify.enabled') === 'true') {
                startSpotifyAuth(window.location.origin + window.location.pathname);
            }
        };
        if (localStorage.getItem('spotify.enabled') === 'true') {
            actions.appendChild(btn);
        }
    } catch (_) {}
})();

// When preparing playlist track, ensure auth redirect returns to the current round page with sessionId
async function ensureUserAuthForPlayback() {
    if (!sessionId) return false;
    try {
        const resp = await fetch(`/api/spotify/current_track?session_id=${sessionId}`);
        if (resp.status === 200) return true;
    } catch (_) {}
    const returnTo = `${window.location.origin}${window.location.pathname}?session_id=${encodeURIComponent(sessionId)}`;
    await startSpotifyAuth(returnTo);
    return false;
}

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
    } catch (_) {}
})();

// ============================================================
// Demo Mode
// ============================================================

const DEMO_STEPS = [
    {
        title: 'Welcome to Hustle n\' Tussle!',
        content: 'This guided demo will walk you through setting up and running a dance battle. We\'ve pre-filled some sample data so you can try the full flow. Click Next to get started.',
        screen: 'setup',
        position: 'center'
    },
    {
        title: 'Lead & Follow Names',
        content: 'Enter the names of your lead and follow dancers, separated by commas. We\'ve filled in 4 of each for this demo.',
        screen: 'setup',
        target: '#lead-names',
        position: 'bottom'
    },
    {
        title: 'Guest Judges',
        content: 'Guest judges award 2 points per vote and can vote Tie or No Contest. We\'ve added 2 judges for this demo.',
        screen: 'setup',
        target: '#judge-names',
        position: 'bottom'
    },
    {
        title: 'Contestant Judging',
        content: 'When enabled, non-competing dancers also judge (1 point each). Simple mode lets them vote as a single group. Try toggling these options!',
        screen: 'setup',
        target: '#simple-contestant-judges',
        position: 'bottom'
    },
    {
        title: 'Points to Win',
        content: 'Set the threshold to win. Default is 7 points. Auto-calculate uses (contestants - 1). For this quick demo, we\'ll use a low value.',
        screen: 'setup',
        target: '#points-to-win-mode',
        position: 'bottom'
    },
    {
        title: 'Start the Competition',
        content: 'Everything looks good! Click "Start Competition" to begin the battle.',
        screen: 'setup',
        target: '#start-competition',
        position: 'top',
        action: 'wait-for-start'
    },
    {
        title: 'The Matchup',
        content: 'Two pairs are competing. Pair 1 vs Pair 2 — each has a lead and a follow. Judges vote on leads and follows separately.',
        screen: 'battle',
        target: '#current-matchup',
        position: 'bottom'
    },
    {
        title: 'Cast Your Lead Votes',
        content: 'Each judge votes for who danced better as a lead. Guest judges can also vote Tie or No Contest. Try casting a vote now!',
        screen: 'battle',
        target: '#lead-voting',
        position: 'bottom',
        action: 'wait-for-lead-vote'
    },
    {
        title: 'Cast Your Follow Votes',
        content: 'Now vote for the follows. Same rules apply — guest judges get Tie/NC options, contestant judges must pick a winner.',
        screen: 'battle',
        target: '#follow-voting',
        position: 'top',
        action: 'wait-for-follow-vote'
    },
    {
        title: 'Submit Your Votes',
        content: 'Once all judges have voted for both leads and follows, click "Confirm Votes" to submit. The round results will appear and the next round starts automatically.',
        screen: 'battle',
        target: '#submit-votes',
        position: 'top',
        action: 'wait-for-submit'
    },
    {
        title: 'Round 2 — Try the Mixed Vote',
        content: 'Now try this: have one guest judge vote Tie or No Contest for a lead, while the other guest judge picks a winner. When you do, the "Mixed" button will appear on the contestant judge row — use it when contestants are split (not unanimously voting for one dancer).',
        screen: 'battle',
        target: '#lead-voting',
        position: 'bottom',
        action: 'wait-for-lead-vote'
    },
    {
        title: 'Finish Round 2 Follows',
        content: 'Cast the follow votes for round 2 as well.',
        screen: 'battle',
        target: '#follow-voting',
        position: 'top',
        action: 'wait-for-follow-vote'
    },
    {
        title: 'Submit Round 2',
        content: 'Submit your votes to see the results and battle graphic update.',
        screen: 'battle',
        target: '#submit-votes',
        position: 'top',
        action: 'wait-for-submit'
    },
    {
        title: 'The Battle Graphic',
        content: 'The battle graphic shows each dancer\'s score progression across rounds. It updates in real-time as you submit votes. This is also visible in Display Mode for audiences.',
        screen: 'battle',
        target: '.scores-display',
        position: 'left'
    },
    {
        title: 'Demo Complete!',
        content: 'You now know the basics of running a Hustle n\' Tussle battle. You can continue exploring this demo battle, or exit to start a real one. Have fun!',
        screen: 'battle',
        position: 'center'
    }
];

function startDemo() {
    demoMode = true;
    demoStep = 0;

    // Pre-fill setup form with sample data
    showScreen(setupScreen);
    if (leadNamesInput) leadNamesInput.value = 'Alex, Blake, Casey, Dana';
    if (followNamesInput) followNamesInput.value = 'Jordan, Morgan, Riley, Skyler';
    if (judgeNamesInput) judgeNamesInput.value = 'Sam, Pat';
    if (contestantJudgingToggle) contestantJudgingToggle.checked = true;
    if (simpleContestantJudgesInput) {
        simpleContestantJudgesInput.checked = true;
        simpleContestantJudgesInput.disabled = false;
    }
    // Set points to win to custom low value for quick demo
    if (pointsToWinModeSelect) {
        pointsToWinModeSelect.value = 'custom';
        if (customPointsContainer) customPointsContainer.style.display = '';
        if (pointsToWinInput) pointsToWinInput.value = '3';
        if (pointsToWinHelper) pointsToWinHelper.textContent = 'First contestant to reach 3 points wins.';
    }

    createDemoOverlay();
    showDemoStep(0);
}

function createDemoOverlay() {
    // Remove existing if any
    removeDemoOverlay();

    demoOverlay = document.createElement('div');
    demoOverlay.id = 'demo-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'demo-backdrop';
    backdrop.addEventListener('click', (e) => e.stopPropagation());
    demoOverlay.appendChild(backdrop);

    const hint = document.createElement('div');
    hint.className = 'demo-hint';
    hint.id = 'demo-hint';
    demoOverlay.appendChild(hint);

    document.body.appendChild(demoOverlay);
}

function removeDemoOverlay() {
    if (demoOverlay) {
        demoOverlay.remove();
        demoOverlay = null;
    }
    // Clean up any highlights
    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
}

function showDemoStep(index) {
    demoStep = index;
    const step = DEMO_STEPS[index];
    if (!step) return;

    // Switch to the correct screen if needed
    if (step.screen) {
        const screenMap = { setup: setupScreen, battle: roundScreen, results: resultsScreen };
        const targetScreen = screenMap[step.screen];
        if (targetScreen) {
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen !== targetScreen) {
                showScreen(targetScreen);
            }
        }
    }

    const hint = document.getElementById('demo-hint');
    if (!hint) return;

    // Clear old highlights
    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));

    // Check if this step has a wait-for action
    const isInteractive = !!step.action;
    demoWaitingForAction = isInteractive;

    // Show/hide backdrop: hide on interactive steps so user can interact with the page
    const backdrop = demoOverlay ? demoOverlay.querySelector('.demo-backdrop') : null;
    if (backdrop) {
        backdrop.style.display = isInteractive ? 'none' : '';
    }

    // Build hint content
    const totalSteps = DEMO_STEPS.length;
    const isFirst = index === 0;
    const isLast = index === totalSteps - 1;

    hint.innerHTML = `
        <div class="demo-hint-drag-handle">
            <div class="demo-hint-step">Step ${index + 1} of ${totalSteps}</div>
            <span class="demo-drag-icon">⠿</span>
        </div>
        <h4>${step.title}</h4>
        <p>${step.content}</p>
        <div class="demo-hint-actions">
            <button class="btn secondary" id="demo-exit-btn">Exit Demo</button>
            ${!isFirst ? '<button class="btn secondary" id="demo-prev-btn">Previous</button>' : ''}
            ${isLast
                ? '<button class="btn primary" id="demo-finish-btn">Finish</button>'
                : (isInteractive ? '' : '<button class="btn primary" id="demo-next-btn">Next</button>')
            }
        </div>
    `;

    // Position the hint
    positionDemoHint(step);

    // Make hint draggable
    makeDemoHintDraggable(hint);

    // Wire up buttons
    const exitBtn = document.getElementById('demo-exit-btn');
    const prevBtn = document.getElementById('demo-prev-btn');
    const nextBtn = document.getElementById('demo-next-btn');
    const finishBtn = document.getElementById('demo-finish-btn');

    if (exitBtn) exitBtn.addEventListener('click', exitDemo);
    if (prevBtn) prevBtn.addEventListener('click', () => showDemoStep(demoStep - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => showDemoStep(demoStep + 1));
    if (finishBtn) finishBtn.addEventListener('click', exitDemo);
}

function positionDemoHint(step) {
    const hint = document.getElementById('demo-hint');
    if (!hint) return;

    // Remove any old arrow
    const oldArrow = hint.querySelector('.demo-arrow');
    if (oldArrow) oldArrow.remove();

    if (!step.target || step.position === 'center') {
        // Center the hint on screen
        hint.style.top = '50%';
        hint.style.left = '50%';
        hint.style.transform = 'translate(-50%, -50%)';
        return;
    }

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
        // Fallback to center
        hint.style.top = '50%';
        hint.style.left = '50%';
        hint.style.transform = 'translate(-50%, -50%)';
        return;
    }

    // Highlight the target
    targetEl.classList.add('demo-highlight');

    // Scroll target into view
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Wait a tick for scroll to settle, then position
    requestAnimationFrame(() => {
        const rect = targetEl.getBoundingClientRect();
        const hintRect = hint.getBoundingClientRect();
        const margin = 16;

        hint.style.transform = '';
        let top, left;

        switch (step.position) {
            case 'bottom':
                top = rect.bottom + margin;
                left = rect.left + rect.width / 2 - hintRect.width / 2;
                break;
            case 'top':
                top = rect.top - hintRect.height - margin;
                left = rect.left + rect.width / 2 - hintRect.width / 2;
                break;
            case 'left':
                top = rect.top + rect.height / 2 - hintRect.height / 2;
                left = rect.left - hintRect.width - margin;
                break;
            case 'right':
                top = rect.top + rect.height / 2 - hintRect.height / 2;
                left = rect.right + margin;
                break;
            default:
                top = rect.bottom + margin;
                left = rect.left;
        }

        // Clamp to viewport
        left = Math.max(8, Math.min(left, window.innerWidth - hintRect.width - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - hintRect.height - 8));

        hint.style.top = top + 'px';
        hint.style.left = left + 'px';

        // Add arrow
        const arrow = document.createElement('div');
        arrow.className = 'demo-arrow';
        switch (step.position) {
            case 'bottom': arrow.classList.add('demo-arrow--bottom'); break;
            case 'top': arrow.classList.add('demo-arrow--top'); break;
            case 'left': arrow.classList.add('demo-arrow--left'); break;
            case 'right': arrow.classList.add('demo-arrow--right'); break;
        }
        hint.appendChild(arrow);
    });
}

function makeDemoHintDraggable(hint) {
    const handle = hint.querySelector('.demo-hint-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    function onPointerDown(e) {
        // Don't drag if clicking a button
        if (e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = hint.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        hint.style.transform = '';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        hint.style.left = (startLeft + dx) + 'px';
        hint.style.top = (startTop + dy) + 'px';
        // Remove arrow when user manually moves the hint
        const arrow = hint.querySelector('.demo-arrow');
        if (arrow) arrow.remove();
    }

    function onPointerUp() {
        isDragging = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    }

    handle.addEventListener('pointerdown', onPointerDown);
}

function enableDemoNextButton() {
    if (!demoMode || !demoWaitingForAction) return;
    demoWaitingForAction = false;
    // Auto-advance to the next step
    showDemoStep(demoStep + 1);
}

function exitDemo() {
    demoMode = false;
    demoStep = 0;
    demoWaitingForAction = false;
    removeDemoOverlay();
    resetAndGoHome();
}

// Wire up the "Try Demo" button when DOM is ready
(function initDemoButton() {
    function wireDemo() {
        const tryDemoBtn = document.getElementById('try-demo');
        if (tryDemoBtn) {
            tryDemoBtn.addEventListener('click', startDemo);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireDemo);
    } else {
        wireDemo();
    }
})();