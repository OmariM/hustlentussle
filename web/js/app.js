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

// Playlist mode state
let songInputSection, playlistUrlInput, playlistEmbedSection, playlistEmbedContainer;
let playlistModeEnabled = false;
let playlistUrl = '';
let playlistId = '';
let playlistTracks = [];
let usedTrackIds = new Set();
let currentRoundTrack = null;
let lastPreparedSongRoundNumber = null;
let pendingPlaylistUrl = null;

// DOM Elements (initialized in the DOMContentLoaded event)
let homeScreen, uploadScreen, setupScreen, roundScreen, resultsScreen;
let goToBattleBtn, goToUploadBtn;
let battleFileUpload, uploadFileName, uploadBattleDataBtn, backToHomeBtn, uploadError;
let leadNamesInput, followNamesInput, judgeNamesInput, startCompetitionBtn, setupBackToHomeBtn;
let pointsToWinInput;
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

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    
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
    startCompetitionBtn = document.getElementById('start-competition');
    setupBackToHomeBtn = document.getElementById('setup-back-to-home');
    playlistUrlInput = document.getElementById('playlist-url');

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
    startCompetitionBtn.addEventListener('click', startCompetition);

    // Hydrate used tracks and playlist from localStorage for current session if available
    try {
        const sid = localStorage.getItem('sessionId');
        if (sid) {
            const stored = localStorage.getItem(`usedTracks:${sid}`);
            if (stored) usedTrackIds = new Set(JSON.parse(stored));
            const storedPlaylistUrl = localStorage.getItem(`playlist:url:${sid}`);
            if (storedPlaylistUrl) {
                pendingPlaylistUrl = storedPlaylistUrl;
                maybeEnablePlaylistMode(pendingPlaylistUrl).catch(() => {});
                pendingPlaylistUrl = null;
            }
        }
    } catch (e) { console.warn('Failed to hydrate used tracks/playlist', e); }
    
    // Battle flow
    submitVotesBtn.addEventListener('click', submitCombinedVotes);
    nextRoundBtn.addEventListener('click', goToNextRound);
    endBattleBtn.addEventListener('click', endCompetition);
    
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
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const next = isDark ? 'light' : 'dark';
            if (next === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
            localStorage.setItem('theme', next);
        });
    }
});

// Functions
function showScreen(screen) {
    homeScreen.classList.remove('active');
    uploadScreen.classList.remove('active');
    setupScreen.classList.remove('active');
    roundScreen.classList.remove('active');
    resultsScreen.classList.remove('active');
    
    screen.classList.add('active');
    
    // Reset error messages when switching screens
    uploadError.textContent = '';
    uploadError.classList.remove('visible');
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

    // If we haven't initialized playlist mode yet but have a pending URL (from start), enable it
    if (!playlistModeEnabled && pendingPlaylistUrl) {
        maybeEnablePlaylistMode(pendingPlaylistUrl).catch(e => console.warn('Failed to enable playlist mode on render:', e));
        pendingPlaylistUrl = null;
    }

    // Round number
    if (roundNumber) roundNumber.textContent = state.round.number;

    // If playlist mode is on and the round changed, prepare a song for this round
    if (playlistModeEnabled) {
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
    if (contestantJudgesList) {
        contestantJudgesList.innerHTML = '';
        const cj = state.round.judges.contestant || [];
        cj.forEach(judge => {
            const el = document.createElement('div');
            el.className = 'judge-item contestant';
            el.textContent = judge;
            contestantJudgesList.appendChild(el);
        });
    }

    // Scoreboard
    updateLiveGraphicFromState(state);

    // Reset voting UI for the current round
    votingResults.classList.add('hidden');
    roundResultsSection.classList.add('hidden');
    winMessages.innerHTML = '';
    leadWinnerPreview.classList.add('hidden');
    followWinnerPreview.classList.add('hidden');
    leadVotes = {}; followVotes = {}; votingLocked = { lead: false, follow: false };
    submitVotesBtn.disabled = false;

    // Rebuild voting cards based on current state
    setupVotingUI();
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
    if (sessionIdDisplay) {
        sessionIdDisplay.textContent = sessionId ? `Session: ${sessionId}` : '';
    }
}

// Update the startCompetition function
async function startCompetition() {
    const leads = leadNamesInput.value.trim();
    const follows = followNamesInput.value.trim();
    const judges = judgeNamesInput.value.trim();
    const pointsToWinRaw = pointsToWinInput ? pointsToWinInput.value.trim() : '';
    const points_to_win = pointsToWinRaw === '' ? null : parseInt(pointsToWinRaw, 10);
    const playlistUrlRaw = playlistUrlInput ? playlistUrlInput.value.trim() : '';
    
    if (!leads || !follows || !judges) {
        alert('Please enter names for leads, follows, and judges.');
        return;
    }
    
    try {
        const response = await fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leads, follows, judges, points_to_win, playlist_url: playlistUrlRaw })
        });
        
        const data = await response.json();
        sessionId = data.session_id;
        localStorage.setItem('sessionId', data.session_id);  // Store in localStorage
        guestJudges = data.guest_judges;
        initialLeads = data.initial_leads;  // Store initial order
        initialFollows = data.initial_follows;  // Store initial order
        
        // Update session ID display
        updateSessionIdDisplay();

        // Initialize playlist mode if a playlist URL is present
        pendingPlaylistUrl = playlistUrlRaw;
        await maybeEnablePlaylistMode(pendingPlaylistUrl);
        
        // Render from canonical state
        await refreshCanonicalState();
        
        // Show round screen
        showScreen(roundScreen);
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Failed to start the competition. Please try again.');
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
                if (!playlistModeEnabled && data.playlist_url) {
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
    
    // Reset voting sections - both are now visible side by side
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
    
    // Only reset song input if we're not in auto-advance mode and not in playlist mode
    if (!window.debugTools || !window.debugTools.autoAdvance) {
        if (!playlistModeEnabled) {
            const si = document.getElementById('song-input');
            if (si) si.value = '';
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
    
    const allJudges = [...guestJudges];
    
    // Get contestant judges from the DOM elements
    const contestantJudgeElements = contestantJudgesList.querySelectorAll('.judge-item.contestant');
    const contestantJudges = Array.from(contestantJudgeElements).map(el => el.textContent);
    allJudges.push(...contestantJudges);
    
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
    const judgeCard = document.createElement('div');
    judgeCard.className = 'judge-card';
    judgeCard.id = `${voteType}-judge-${judgeName.replace(/\s+/g, '-').toLowerCase()}`;
    
    const judgeNameEl = document.createElement('div');
    judgeNameEl.className = 'judge-name';
    judgeNameEl.textContent = judgeName + (isGuest ? ' (Guest)' : '');
    
    const voteOptions = document.createElement('div');
    voteOptions.className = 'vote-options';
    
    const option1Name = voteType === 'lead' ? lead1Name.textContent : follow1Name.textContent;
    const option2Name = voteType === 'lead' ? lead2Name.textContent : follow2Name.textContent;
    
    // Option 1 button
    const option1Btn = document.createElement('button');
    option1Btn.className = 'vote-btn vote-option-1';
    option1Btn.textContent = option1Name;
    option1Btn.addEventListener('click', () => {
        // If voting is locked, don't allow changes
        if (votingLocked[voteType]) return;
        
        // Remove selected class from all buttons in this judge card
        voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        // Add selected class to this button
        option1Btn.classList.add('selected');
        recordVote(judgeName, 1, voteType);
        judgeCard.classList.add('voted');
    });
    
    // Option 2 button
    const option2Btn = document.createElement('button');
    option2Btn.className = 'vote-btn vote-option-2';
    option2Btn.textContent = option2Name;
    option2Btn.addEventListener('click', () => {
        // If voting is locked, don't allow changes
        if (votingLocked[voteType]) return;
        
        // Remove selected class from all buttons in this judge card
        voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        // Add selected class to this button
        option2Btn.classList.add('selected');
        recordVote(judgeName, 2, voteType);
        judgeCard.classList.add('voted');
    });
    
    voteOptions.appendChild(option1Btn);
    voteOptions.appendChild(option2Btn);
    
    // Tie and No Contest options for guest judges
    if (isGuest) {
        const tieBtn = document.createElement('button');
        tieBtn.className = 'vote-btn vote-option-tie';
        tieBtn.textContent = 'Tie';
        tieBtn.addEventListener('click', () => {
            // If voting is locked, don't allow changes
            if (votingLocked[voteType]) return;
            
            // Remove selected class from all buttons in this judge card
            voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to this button
            tieBtn.classList.add('selected');
            recordVote(judgeName, 3, voteType);
            judgeCard.classList.add('voted');
        });
        
        const noContestBtn = document.createElement('button');
        noContestBtn.className = 'vote-btn vote-option-nocontest';
        noContestBtn.textContent = 'No Contest';
        noContestBtn.addEventListener('click', () => {
            // If voting is locked, don't allow changes
            if (votingLocked[voteType]) return;
            
            // Remove selected class from all buttons in this judge card
            voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to this button
            noContestBtn.classList.add('selected');
            recordVote(judgeName, 4, voteType);
            judgeCard.classList.add('voted');
        });
        
        voteOptions.appendChild(tieBtn);
        voteOptions.appendChild(noContestBtn);
    }
    
    judgeCard.appendChild(judgeNameEl);
    judgeCard.appendChild(voteOptions);
    
    return judgeCard;
}

function recordVote(judgeName, voteOption, voteType) {
    if (voteType === 'lead') {
        leadVotes[judgeName] = voteOption;
    } else if (voteType === 'follow') {
        followVotes[judgeName] = voteOption;
    }
    console.log(`${voteType} vote recorded for ${judgeName}: ${voteOption}`);
    
    // Update submit button state based on voting progress
    updateSubmitButtonState();
}

function updateSubmitButtonState() {
    // Get contestant judges from the DOM elements
    const contestantJudgeElements = contestantJudgesList.querySelectorAll('.judge-item.contestant');
    const contestantJudges = Array.from(contestantJudgeElements).map(el => el.textContent);
    const allJudges = [...guestJudges, ...contestantJudges];
    const leadVotesComplete = allJudges.every(judge => leadVotes[judge]);
    const followVotesComplete = allJudges.every(judge => followVotes[judge]);
    
    const submitBtn = document.getElementById('submit-votes');
    if (submitBtn) {
        if (leadVotesComplete && followVotesComplete) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit All Votes';
            submitBtn.classList.remove('partial-votes');
        } else {
            submitBtn.disabled = false; // Allow partial submission for testing, but show visual feedback
            const leadCount = allJudges.filter(judge => leadVotes[judge]).length;
            const followCount = allJudges.filter(judge => followVotes[judge]).length;
            submitBtn.textContent = `Submit Votes (${leadCount + followCount}/${allJudges.length * 2} cast)`;
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

function calculateWinner(voteType) {
    // Get contestant judges from the DOM elements
    const contestantJudgeElements = contestantJudgesList.querySelectorAll('.judge-item.contestant');
    const contestantJudges = Array.from(contestantJudgeElements).map(el => el.textContent);
    const allJudges = [...guestJudges, ...contestantJudges];
    const votes = voteType === 'lead' ? leadVotes : followVotes;
    
    // Get contestant names
    const contestant1 = voteType === 'lead' ? lead1Name.textContent : follow1Name.textContent;
    const contestant2 = voteType === 'lead' ? lead2Name.textContent : follow2Name.textContent;
    
    // Check if all votes are present
    const hasAllVotes = allJudges.every(judge => votes[judge]);
    if (!hasAllVotes) {
        return null; // Not all votes are in yet
    }
    
    // Convert votes to the format expected by the game logic
    const votesArray = [];
    for (const judge of allJudges) {
        votesArray.push([judge, votes[judge]]);
    }
    
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
    
    // Get all judge cards for this vote type
    const container = voteType === 'lead' ? leadJudgesContainer : followJudgesContainer;
    const judgeCards = container.querySelectorAll('.judge-card');
    
    // Add a 'locked' class to all judge cards and vote buttons
    judgeCards.forEach(card => {
        card.classList.add('locked');
        card.querySelectorAll('.vote-btn').forEach(btn => {
            btn.classList.add('locked');
        });
    });
}

async function submitCombinedVotes() {
    // Get contestant judges from the DOM elements
    const contestantJudgeElements = contestantJudgesList.querySelectorAll('.judge-item.contestant');
    const contestantJudges = Array.from(contestantJudgeElements).map(el => el.textContent);
    const allJudges = [...guestJudges, ...contestantJudges];
    
    // Check if all judges have voted for both lead and follow
    const missingLeadVotes = allJudges.filter(judge => !leadVotes[judge]);
    const missingFollowVotes = allJudges.filter(judge => !followVotes[judge]);
    
    if (missingLeadVotes.length > 0 || missingFollowVotes.length > 0) {
        const totalMissing = Math.max(missingLeadVotes.length, missingFollowVotes.length);
        alert(`Waiting for votes from ${totalMissing} judge(s). Please ensure all judges have voted for both leads and follows.`);
        return;
    }
    
    // Convert votes objects to array format for API
    const leadVotesArray = [];
    const followVotesArray = [];
    
    for (const judge in leadVotes) {
        leadVotesArray.push([judge, leadVotes[judge]]);
    }
    
    for (const judge in followVotes) {
        followVotesArray.push([judge, followVotes[judge]]);
    }
    
    // Get song information
    const songInput = document.getElementById('song-input');
    const songInfo = {};
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
    
    // Lock voting and disable the button to prevent further changes
    lockVoting('lead');
    lockVoting('follow');
    submitVotesBtn.disabled = true;
    
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
        
        // Update live graphic immediately with the latest canonical state
        try {
            const state = await fetchCanonicalState();
            if (state) updateLiveGraphicFromState(state);
        } catch (_) {}
    } catch (error) {
        console.error('Error submitting combined votes:', error);
        alert('Failed to submit votes. Please try again.');
        votingLocked.lead = false; // Unlock voting if there's an error
        votingLocked.follow = false;
        submitVotesBtn.disabled = false;
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
        alert('Failed to start the next round. Please try again.');
    }
}

async function endCompetition() {
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
    if (songInputSection) songInputSection.style.display = '';
    if (playlistEmbedSection) playlistEmbedSection.style.display = 'none';
    if (playlistUrlInput) playlistUrlInput.value = '';
    
    // Hide winner previews
    if (leadWinnerPreview) leadWinnerPreview.classList.add('hidden');
    if (followWinnerPreview) followWinnerPreview.classList.add('hidden');
    
    // Clear form inputs
    leadNamesInput.value = '';
    followNamesInput.value = '';
    judgeNamesInput.value = '';
    
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
    
    // Fetch Spotify metadata for all rounds if available
    if (data.rounds && data.rounds.length > 0) {
        try {
            const access_token = await getSpotifyToken();
            
            // Fetch metadata for all rounds in parallel
            await Promise.all(data.rounds.map(async (round) => {
                if (round.song_info && round.song_info.spotify_url) {
                    try {
                        const spotifyUrl = new URL(round.song_info.spotify_url);
                        const trackId = spotifyUrl.pathname.split('/').pop();
                        
                        if (trackId) {
                            const metadataResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                                headers: {
                                    'Authorization': `Bearer ${access_token}`
                                }
                            });
                            
                            if (metadataResponse.status === 401) {
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
        
        // Display round history with the updated metadata
        displayRoundHistory(data.rounds);
    } else {
        console.warn('No round history data available');
    }
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
            const isActive = header.classList.contains('active');
            
            // Toggle active state
            header.classList.toggle('active');
            content.classList.toggle('active');
            
            // Update the plus/minus symbol
            const symbol = header.querySelector('span:last-child');
            symbol.textContent = isActive ? '+' : '-';
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
            
            if (round.song_info.spotify_url) {
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
        if (!playlistModeEnabled || !playlistId) return;
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
            try { alert('No more unused tracks left in the playlist. Please enter a song URL manually for remaining rounds.'); } catch (_) {}
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

    // Controls
    const controls = document.createElement('div');
    controls.style.marginTop = '6px';
    controls.style.display = 'flex';
    controls.style.gap = '8px';

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play Full';
    playBtn.className = 'btn secondary';
    playBtn.onclick = (e) => {
        e.preventDefault();
        playCurrentRoundTrackViaSpotify();
    };

    const pauseBtn = document.createElement('button');
    pauseBtn.textContent = 'Pause';
    pauseBtn.className = 'btn secondary';
    pauseBtn.onclick = async (e) => {
        e.preventDefault();
        try {
            await fetch(`/api/spotify/pause_track?session_id=${sessionId}`, { method: 'POST' });
        } catch (_) {}
    };

    controls.appendChild(playBtn);
    controls.appendChild(pauseBtn);

    // Add an action to open the full track in Spotify (app or web)
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open in Spotify';
    openBtn.className = 'btn secondary';
    openBtn.onclick = (e) => {
        e.preventDefault();
        const appUri = `spotify:track:${track.id}`;
        const webUrl = `https://open.spotify.com/track/${track.id}`;
        let didNavigate = false;
        try { window.location.href = appUri; didNavigate = true; } catch (_) {}
        setTimeout(() => { if (!didNavigate) window.open(webUrl, '_blank'); }, 600);
    };
    controls.appendChild(openBtn);

    playlistEmbedContainer.appendChild(controls);
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
        
        // Get Spotify access token
        const access_token = await getSpotifyToken();
        
        // Fetch metadata for all rounds in parallel
        await Promise.all(battleData.rounds.map(async (round) => {
            if (round.song_info && round.song_info.spotify_url) {
                try {
                    const spotifyUrl = new URL(round.song_info.spotify_url);
                    const trackId = spotifyUrl.pathname.split('/').pop();
                    
                    if (trackId) {
                        const metadataResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                            headers: {
                                'Authorization': `Bearer ${access_token}`
                            }
                        });
                        
                        if (metadataResponse.status === 401) {
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
        alert('Failed to download battle data. Please try again.');
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
        alert('Failed to end the competition. Please try again.');
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
        try { alert('Could not load Spotify playlist. Falling back to manual song input.'); } catch (_) {}
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
    if (!playlistModeEnabled || !currentRoundTrack || !currentRoundTrack.id) return;
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
                alert('Unable to start Spotify playback. Please ensure a Premium account and open Spotify on this device.');
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
            startSpotifyAuth(window.location.origin + window.location.pathname);
        };
        actions.appendChild(btn);
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