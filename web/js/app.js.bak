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
let simpleContestantJudgesCheckbox; let simpleContestantJudgesEnabled = false; const CONTESTANT_PROXY_NAME = 'Contestant Judges';

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
    simpleContestantJudgesCheckbox = document.getElementById('simple-contestant-judges');

    // Restore simple judges preference if saved
    try {
        const savedSimple = localStorage.getItem('simpleContestantJudges');
        if (simpleContestantJudgesCheckbox && (savedSimple === '1' || savedSimple === 'true')) {
            simpleContestantJudgesCheckbox.checked = true;
        }
    } catch (e) {}

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