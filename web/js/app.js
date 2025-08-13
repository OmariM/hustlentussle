// Global variables
let sessionId = null;
let guestJudges = [];
let leadVotes = {};  // Changed to an object to easily update votes
let followVotes = {}; // Changed to an object to easily update votes
let votingLocked = { lead: false, follow: false }; // Track if voting is locked
let currentLeads = []; // Store current lead contestants with points
let currentFollows = []; // Store current follow contestants with points
let initialLeads = []; // Store initial order of leads
let initialFollows = []; // Store initial order of follows

// DOM Elements (initialized in the DOMContentLoaded event)
let homeScreen, uploadScreen, setupScreen, roundScreen, resultsScreen;
let goToBattleBtn, goToUploadBtn;
let battleFileUpload, uploadFileName, uploadBattleDataBtn, backToHomeBtn, uploadError;
let leadNamesInput, followNamesInput, judgeNamesInput, startCompetitionBtn, setupBackToHomeBtn;
let pointsToWinInput;
let roundNumber, lead1Name, lead2Name, follow1Name, follow2Name, contestantJudgesList, guestJudgesList;
let currentLeadScores, currentFollowScores;
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

    // Round number
    if (roundNumber) roundNumber.textContent = state.round.number;

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
    updateScoreboardFromState(state);

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

function updateScoreboardFromState(state) {
    if (!state || !state.scoreboard) return;
    const leads = state.scoreboard.leads || [];
    const follows = state.scoreboard.follows || [];

    // Current scores lists
    if (currentLeadScores) currentLeadScores.innerHTML = '';
    if (currentFollowScores) currentFollowScores.innerHTML = '';

    const sortedLeads = [...leads].sort((a, b) => b.points - a.points);
    const sortedFollows = [...follows].sort((a, b) => b.points - a.points);

    sortedLeads.forEach(lead => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="score-name">${lead.name}${lead.is_winner ? ' 👑' : ''}</span><span class="score-points">${lead.points}</span>`;
        currentLeadScores.appendChild(li);
    });
    sortedFollows.forEach(follow => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="score-name">${follow.name}${follow.is_winner ? ' 👑' : ''}</span><span class="score-points">${follow.points}</span>`;
        currentFollowScores.appendChild(li);
    });
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
    
    if (!leads || !follows || !judges) {
        alert('Please enter names for leads, follows, and judges.');
        return;
    }
    
    try {
        const response = await fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leads, follows, judges, points_to_win })
        });
        
        const data = await response.json();
        sessionId = data.session_id;
        localStorage.setItem('sessionId', data.session_id);  // Store in localStorage
        guestJudges = data.guest_judges;
        initialLeads = data.initial_leads;  // Store initial order
        initialFollows = data.initial_follows;  // Store initial order
        
        // Update session ID display
        updateSessionIdDisplay();
        
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
        .then(data => {
            // Store current scores data
            currentLeads = data.leads || [];
            currentFollows = data.follows || [];
            
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
    
    // Only reset song input if we're not in auto-advance mode
    if (!window.debugTools || !window.debugTools.autoAdvance) {
        document.getElementById('song-input').value = '';
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
    if (songInput.value) {
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
        
        // Update only the scoreboard; keep results visible until Next Round
        fetchScores();
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
    
    if (!leadResultsBody || !followResultsBody || !roundsContainer || !leadsInitialOrder || !followsInitialOrder) {
        console.error('Could not find required elements for results display');
        return;
    }
    
    // Clear all previous data
    leadResultsBody.innerHTML = '';
    followResultsBody.innerHTML = '';
    roundsContainer.innerHTML = '';
    leadsInitialOrder.innerHTML = '';
    followsInitialOrder.innerHTML = '';
    
    // Always use the initial order from the server response
    const initialLeadsData = data.initial_leads;
    const initialFollowsData = data.initial_follows;
    
    console.log('Using initial leads from server:', initialLeadsData);
    console.log('Using initial follows from server:', initialFollowsData);
    
    // Add leads to initial order
    if (initialLeadsData && Array.isArray(initialLeadsData)) {
        initialLeadsData.forEach((lead, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${index + 1}.</span><span>${lead}</span>`;
            leadsInitialOrder.appendChild(li);
        });
    } else {
        console.warn('No initial leads data available from server');
    }
    
    // Add follows to initial order
    if (initialFollowsData && Array.isArray(initialFollowsData)) {
        initialFollowsData.forEach((follow, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${index + 1}.</span><span>${follow}</span>`;
            followsInitialOrder.appendChild(li);
        });
    } else {
        console.warn('No initial follows data available from server');
    }
    
    console.log('Lead results:', data.leads);
    console.log('Follow results:', data.follows);
    
    // Display lead results
    if (data.leads && Array.isArray(data.leads)) {
        data.leads.forEach(lead => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = `${lead.medal || ''} ${lead.name}${lead.is_winner ? ' 👑' : ''}`.trim();
            
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
            nameCell.textContent = `${follow.medal || ''} ${follow.name}${follow.is_winner ? ' 👑' : ''}`.trim();
            
            const pointsCell = document.createElement('td');
            pointsCell.textContent = follow.points;
            
            row.appendChild(nameCell);
            row.appendChild(pointsCell);
            followResultsBody.appendChild(row);
        });
    } else {
        console.warn('No follow results data available');
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
            details.appendChild(songSection);
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
        details.appendChild(participants);

        // Add judge votes section
        const judgeVotes = document.createElement('div');
        judgeVotes.className = 'judge-votes';
        let judgeVotesHTML = '<h4>Judge Votes</h4>';

        // Lead votes
        if (round.lead_votes) {
            judgeVotesHTML += '<div class="vote-section"><h5>Lead Votes</h5>';
            
            // Sort votes to show guest judges first
            const sortedVotes = Object.entries(round.lead_votes).sort((a, b) => {
                const aIsGuest = guestJudges.includes(a[0]);
                const bIsGuest = guestJudges.includes(b[0]);
                if (aIsGuest && !bIsGuest) return -1;
                if (!aIsGuest && bIsGuest) return 1;
                return 0;
            });

            sortedVotes.forEach(([judge, vote]) => {
                const isGuest = guestJudges.includes(judge);
                const voteText = getVoteText(vote, round);
                judgeVotesHTML += `
                    <div class="judge-vote ${isGuest ? 'guest-judge' : ''}">
                        <span class="judge-name">${judge}</span>
                        <span class="vote">${voteText}</span>
                    </div>
                `;
            });
            judgeVotesHTML += '</div>';
        }

        // Follow votes
        if (round.follow_votes) {
            judgeVotesHTML += '<div class="vote-section"><h5>Follow Votes</h5>';
            
            // Sort votes to show guest judges first
            const sortedVotes = Object.entries(round.follow_votes).sort((a, b) => {
                const aIsGuest = guestJudges.includes(a[0]);
                const bIsGuest = guestJudges.includes(b[0]);
                if (aIsGuest && !bIsGuest) return -1;
                if (!aIsGuest && bIsGuest) return 1;
                return 0;
            });

            sortedVotes.forEach(([judge, vote]) => {
                const isGuest = guestJudges.includes(judge);
                const voteText = getFollowVoteText(vote, round);
                judgeVotesHTML += `
                    <div class="judge-vote ${isGuest ? 'guest-judge' : ''}">
                        <span class="judge-name">${judge}</span>
                        <span class="vote">${voteText}</span>
                    </div>
                `;
            });
            judgeVotesHTML += '</div>';
        }

        judgeVotes.innerHTML = judgeVotesHTML;
        details.appendChild(judgeVotes);
        
        // Add session ID to the round details
        const sessionIdDiv = document.createElement('div');
        sessionIdDiv.className = 'round-session-id';
        sessionIdDiv.textContent = `Session: ${round.session_id}`;
        details.appendChild(sessionIdDiv);
        
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