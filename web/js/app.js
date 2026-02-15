// Global variables
let sessionId = null;
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

// Apply theme based on display mode and user preference
function applyTheme() {
    const saved = localStorage.getItem('theme-preference');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (displayMode) {
        document.documentElement.setAttribute('data-theme', 'display');
    } else {
        document.documentElement.setAttribute('data-theme', 'admin');
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = (current === 'admin') ? 'display' : 'admin';
    localStorage.setItem('theme-preference', next);
    document.documentElement.setAttribute('data-theme', next);
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
let backToHomeFromResultsBtn, downloadBattleDataBtn;
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
        showScreen(homeScreen);
    }
    
    function setupBackToHomeHandler() {
        console.log('Setup back to home clicked');
        showScreen(homeScreen);
    }
    
    // Home screen navigation
    goToBattleBtn.addEventListener('click', () => showScreen(setupScreen));
    goToUploadBtn.addEventListener('click', () => showScreen(uploadScreen));
    
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

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Nav pills are status indicators only — no click navigation
    document.querySelectorAll('.nav-pill').forEach(pill => {
        pill.style.pointerEvents = 'none';
        pill.style.cursor = 'default';
    });

		// Spotify integration UI gating
		const playlistUrlGroup = document.getElementById('playlist-url-group');
		if (localStorage.getItem('spotify.enabled') === null) {
			localStorage.setItem('spotify.enabled', 'false');
		}
		function applySpotifyEnabledUI() {
			const isOn = localStorage.getItem('spotify.enabled') === 'true';
			if (playlistUrlGroup) playlistUrlGroup.style.display = isOn ? '' : 'none';
			if (songInputSection) songInputSection.style.display = isOn ? '' : 'none';
			if (playlistEmbedSection) playlistEmbedSection.style.display = isOn && playlistModeEnabled ? '' : 'none';
			// Dynamically add/remove home auth button
			try {
				const home = document.getElementById('home-screen');
				const actions = home ? home.querySelector('.home-actions') : null;
				if (actions) {
					let btn = document.getElementById('spotify-auth-btn');
					if (isOn && !btn) {
						btn = document.createElement('button');
						btn.id = 'spotify-auth-btn';
						btn.className = 'btn secondary large';
						btn.textContent = 'Authenticate Spotify';
						btn.onclick = () => {
							if (localStorage.getItem('spotify.enabled') === 'true') {
								startSpotifyAuth(window.location.origin + window.location.pathname);
							}
						};
						actions.appendChild(btn);
					} else if (!isOn && btn) {
						actions.removeChild(btn);
					}
				}
			} catch (_) {}
		}
		applySpotifyEnabledUI();

    // Hide nav bar on home screen initially (showScreen isn't called on first load)
    const navBar = document.getElementById('nav-bar');
    if (navBar && !displayMode) {
        navBar.style.display = 'none';
    }

    // Initialize display mode if detected (this goes directly to battle screen)
    if (displayMode) {
        initDisplayMode();
    }
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
    homeScreen.classList.remove('active');
    uploadScreen.classList.remove('active');
    setupScreen.classList.remove('active');
    roundScreen.classList.remove('active');
    resultsScreen.classList.remove('active');

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

// Hide sections before overlay (so they're invisible during overlay)
function hideSectionsForTransition() {
    const roundContent = document.querySelector('.round-content');
    if (!roundContent) return;
    
    roundContent.classList.add('sections-transitioning');
}

function performStaggeredFadeIn(callback) {
    const roundContent = document.querySelector('.round-content');
    if (!roundContent) {
        if (callback) callback();
        return;
    }
    
    // Sections to animate in order (excluding battle graphic and participant order)
    const sections = [
        roundContent.querySelector('.round-info'),
        roundContent.querySelector('.matchups'),
        roundContent.querySelector('.judges')
    ].filter(Boolean);
    
    // Sections should already be hidden via sections-transitioning class
    // Apply staggered fade-in classes (animation starts at opacity:0 due to 'both' fill mode)
    sections.forEach((section, index) => {
        section.classList.add('section-fade-in', `stagger-${index + 1}`);
    });
    
    // Use double requestAnimationFrame to ensure animation classes have been painted
    // before removing the transitioning class (prevents flicker)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            roundContent.classList.remove('sections-transitioning');
        });
    });
    
    // Calculate total animation time and run callback after completion
    const totalAnimationTime = (sections.length - 1) * STAGGER_DELAY_MS + STAGGER_ANIMATION_MS + 50;
    setTimeout(() => {
        // Clean up animation classes
        sections.forEach((section, index) => {
            section.classList.remove('section-fade-in', `stagger-${index + 1}`);
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

function renderFromState(state) {
    if (!state || !state.round || !state.round.pairs) return;

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
        await displayResults(data);
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
        const baseUrl = window.location.origin + window.location.pathname;
        const displayUrl = `${baseUrl}?mode=display&session_id=${sessionId}`;
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
        
        // Show round screen
        showScreen(roundScreen);
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
    console.log('resetCompetition completed, showing home screen');
    showScreen(homeScreen);
    console.log('Home screen should now be visible');
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
    
    // Always use the initial order from the server response
    const initialLeadsData = data.initial_leads || [];
    const initialFollowsData = data.initial_follows || [];
    console.log('Using initial leads from server:', initialLeadsData);
    console.log('Using initial follows from server:', initialFollowsData);
    
    console.log('Lead results:', data.leads);
    console.log('Follow results:', data.follows);
    
    // Determine the single top-scoring lead and follow for crown display
    let topLeadName = null;
    if (Array.isArray(data.leads) && data.leads.length > 0) {
        const topLead = data.leads.reduce((best, contestant) => {
            const bestPoints = Number(best.points) || 0;
            const contestantPoints = Number(contestant.points) || 0;
            return contestantPoints > bestPoints ? contestant : best;
        }, data.leads[0]);
        topLeadName = topLead && topLead.name ? topLead.name : null;
    }
    
    let topFollowName = null;
    if (Array.isArray(data.follows) && data.follows.length > 0) {
        const topFollow = data.follows.reduce((best, contestant) => {
            const bestPoints = Number(best.points) || 0;
            const contestantPoints = Number(contestant.points) || 0;
            return contestantPoints > bestPoints ? contestant : best;
        }, data.follows[0]);
        topFollowName = topFollow && topFollow.name ? topFollow.name : null;
    }

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
            const pair1Lead = r.pairs?.pair_1?.lead;
            const pair1Follow = r.pairs?.pair_1?.follow;
            const pair2Lead = r.pairs?.pair_2?.lead;
            const pair2Follow = r.pairs?.pair_2?.follow;
            const leadWinner = r.lead_winner;
            const followWinner = r.follow_winner;
            const roundNum = r.round_num;
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
        accordionItem.className = 'accordion-item';
        
        // Create the header
        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.innerHTML = `<span>Round ${round.round_num}</span><span>+</span>`;
        
        // Add click handler for accordion functionality
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isOpen = content.classList.contains('open');

            // Toggle open state
            header.classList.toggle('active');
            content.classList.toggle('open');

            // Update the plus/minus symbol
            const symbol = header.querySelector('span:last-child');
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
        
        let participantsHTML = '<h4>Participants</h4>';
        
        if (round.pairs && Object.keys(round.pairs).length > 0) {
            // First pair
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
            
            // Add winners if available
            if (round.lead_winner) {
                participantsHTML += `<div class="winner">Lead Winner: ${round.lead_winner}</div>`;
            }
            
            if (round.follow_winner) {
                participantsHTML += `<div class="winner">Follow Winner: ${round.follow_winner}</div>`;
            }
        } else {
            participantsHTML += '<p>No participant data available for this round.</p>';
        }
        
        participants.innerHTML = participantsHTML;
        topRow.appendChild(participants);
        // Ensure the top row (participants + song) is above judge votes
        details.appendChild(topRow);

        // Add judge votes section
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

async function downloadBattleData() {
    if (!sessionId) {
        console.error('No active session to download data from.');
        return;
    }
    
    try {
        // First get the battle data to find all Spotify URLs
        const response = await fetch(`/api/export_battle_data?session_id=${sessionId}&format=json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch battle data: ${response.status}`);
        }
        
        // Get the battle data as JSON first
        const battleData = await response.json();
        
        // If Spotify integration is enabled, enrich with Spotify metadata
        const spotifyOn = localStorage.getItem('spotify.enabled') === 'true';
        let access_token = null;
        if (spotifyOn) {
            access_token = await getSpotifyToken();
        }
        
        // Fetch metadata for all rounds in parallel
        await Promise.all(battleData.rounds.map(async (round) => {
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
        
        // Now get the Excel file with the updated metadata
        const excelResponse = await fetch(`/api/export_battle_data?session_id=${sessionId}&format=excel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rounds: battleData.rounds
            })
        });
        
        if (!excelResponse.ok) {
            throw new Error(`Failed to generate Excel file: ${excelResponse.status}`);
        }
        
        // Download the Excel file
        const blob = await excelResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `battle_data_${sessionId}.xlsx`;
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
        
        // Ensure we have the initial order data
        if (!data.initial_leads || !data.initial_follows) {
            console.log('Using stored initial order data');
            data.initial_leads = initialLeads;
            data.initial_follows = initialFollows;
        }
        
        // Display final results
        displayResults(data);
    })
    .catch(error => {
        console.error('Error ending game:', error);
        showToast('Failed to end the competition', 'error');
    });
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