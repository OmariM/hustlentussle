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
let roundNumber, lead1Name, lead2Name, follow1Name, follow2Name, contestantJudgesList;
let currentLeadScores, currentFollowScores;
let leadVotingSection, followVotingSection, leadJudgesContainer, followJudgesContainer;
let leadResults, followResults, leadWinner, followWinner;
let leadGuestVotes, leadContestantVotes, followGuestVotes, followContestantVotes;
let determineLeadWinnerBtn, determineFollowWinnerBtn;
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
    roundScreen = document.getElementById('round-screen');
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
    startCompetitionBtn = document.getElementById('start-competition');
    setupBackToHomeBtn = document.getElementById('setup-back-to-home');

// Round screen elements
    roundNumber = document.getElementById('round-number');
    lead1Name = document.getElementById('lead1-name');
    lead2Name = document.getElementById('lead2-name');
    follow1Name = document.getElementById('follow1-name');
    follow2Name = document.getElementById('follow2-name');
    contestantJudgesList = document.getElementById('contestant-judges-list');
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
    determineLeadWinnerBtn = document.getElementById('determine-lead-winner');
    determineFollowWinnerBtn = document.getElementById('determine-follow-winner');

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
    determineLeadWinnerBtn.addEventListener('click', submitLeadVotes);
    determineFollowWinnerBtn.addEventListener('click', submitFollowVotes);
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
        displayResults(data);
    } catch (error) {
        console.error('Error processing file:', error);
        showUploadError(`Failed to process the file: ${error.message}`);
    }
}

function showUploadError(message) {
    uploadError.textContent = message;
    uploadError.classList.add('visible');
}

async function startCompetition() {
    const leads = leadNamesInput.value.trim();
    const follows = followNamesInput.value.trim();
    const judges = judgeNamesInput.value.trim();
    
    if (!leads || !follows || !judges) {
        alert('Please enter names for leads, follows, and judges.');
        return;
    }
    
    // Count the number of leads and follows
    const leadCount = leads.split(',').filter(name => name.trim()).length;
    const followCount = follows.split(',').filter(name => name.trim()).length;
    
    // Validate equal counts of leads and follows
    if (leadCount !== followCount) {
        alert(`The number of leads (${leadCount}) must equal the number of follows (${followCount}). Please adjust your entries.`);
        return;
    }
    
    try {
        const response = await fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leads, follows, judges })
        });
        
        const data = await response.json();
        sessionId = data.session_id;
        localStorage.setItem('sessionId', data.session_id);  // Store in localStorage
        guestJudges = data.guest_judges;
        initialLeads = data.initial_leads;  // Store initial order
        initialFollows = data.initial_follows;  // Store initial order
        
        // Get initial scores
        await fetchScores();
        
        // Update UI with initial round data
        updateRoundUI(data);
        setupVotingUI();
        
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
            // Update score tables with new data
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
    
    // Update contestant judges
    contestantJudgesList.textContent = data.contestant_judges.join(', ');
    
    // Reset voting sections
    leadVotingSection.classList.remove('hidden');
    followVotingSection.classList.add('hidden');
    leadResults.classList.add('hidden');
    followResults.classList.add('hidden');
    roundResultsSection.classList.add('hidden');
    winMessages.innerHTML = '';
    
    // Reset collected votes
    leadVotes = {};
    followVotes = {};
    votingLocked = { lead: false, follow: false };
    
    // Reset determine winner buttons
    determineLeadWinnerBtn.disabled = false;
    determineFollowWinnerBtn.disabled = false;
    
    // Reset song input
    document.getElementById('song-input').value = '';
}

function setupVotingUI() {
    // Clear previous voting UI
    leadJudgesContainer.innerHTML = '';
    followJudgesContainer.innerHTML = '';
    
    const allJudges = [...guestJudges];
    
    // Get contestant judges from the text content and split by comma
    const contestantJudges = contestantJudgesList.textContent.split(', ');
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

function recordVote(judge, decision, voteType) {
    // Store the vote in the appropriate object
    if (voteType === 'lead') {
        leadVotes[judge] = decision;
    } else {
        followVotes[judge] = decision;
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

async function submitLeadVotes() {
    const allJudges = [...guestJudges, ...contestantJudgesList.textContent.split(', ')];
    const votesArray = [];
    
    // Check if all judges have voted
    const missingVotes = allJudges.filter(judge => !leadVotes[judge]);
    if (missingVotes.length > 0) {
        alert(`Waiting for votes from ${missingVotes.length} judge(s).`);
        return;
    }
    
    // Convert votes object to array format for API
    for (const judge in leadVotes) {
        votesArray.push([judge, leadVotes[judge]]);
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
    determineLeadWinnerBtn.disabled = true;
    
    try {
        const response = await fetch('/api/judge_leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                votes: votesArray,
                song_info: songInfo
            })
        });
        
        const data = await response.json();
        
        // Update results UI
        leadWinner.textContent = data.winner;
        leadGuestVotes.textContent = data.guest_votes.join(', ') || 'None';
        leadContestantVotes.textContent = data.contestant_votes.join(', ') || 'None';
        
        leadResults.classList.remove('hidden');
        
        // Show follow voting section
        followVotingSection.classList.remove('hidden');
        
        // Update scores after voting
        await fetchScores();
    } catch (error) {
        console.error('Error submitting lead votes:', error);
        alert('Failed to submit lead votes. Please try again.');
        votingLocked.lead = false; // Unlock voting if there's an error
        determineLeadWinnerBtn.disabled = false;
    }
}

async function submitFollowVotes() {
    const allJudges = [...guestJudges, ...contestantJudgesList.textContent.split(', ')];
    const votesArray = [];
    
    // Check if all judges have voted
    const missingVotes = allJudges.filter(judge => !followVotes[judge]);
    if (missingVotes.length > 0) {
        alert(`Waiting for votes from ${missingVotes.length} judge(s).`);
        return;
    }
    
    // Convert votes object to array format for API
    for (const judge in followVotes) {
        votesArray.push([judge, followVotes[judge]]);
    }
    
    // Lock voting and disable the button to prevent further changes
    lockVoting('follow');
    determineFollowWinnerBtn.disabled = true;
    
    try {
        const response = await fetch('/api/judge_follows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                votes: votesArray
            })
        });
        
        const data = await response.json();
        
        // Update results UI
        followWinner.textContent = data.winner;
        followGuestVotes.textContent = data.guest_votes.join(', ') || 'None';
        followContestantVotes.textContent = data.contestant_votes.join(', ') || 'None';
        
        followResults.classList.remove('hidden');
        
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
        
        // Update scores after voting
        await fetchScores();
    } catch (error) {
        console.error('Error submitting follow votes:', error);
        alert('Failed to submit follow votes. Please try again.');
        votingLocked.follow = false; // Unlock voting if there's an error
        determineFollowWinnerBtn.disabled = false;
    }
}

async function goToNextRound() {
    try {
        const response = await fetch('/api/next_round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();
        
        // Update UI with new round data
        updateRoundUI(data);
        setupVotingUI();
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
    const leadScoreBody = document.getElementById('lead-score-body');
    const followScoreBody = document.getElementById('follow-score-body');
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

function displayResults(data) {
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
    
    // Display round history if available
    if (data.rounds && data.rounds.length > 0) {
        displayRoundHistory(data.rounds);
    } else {
        console.warn('No round history data available');
    }
}

// Function to display round history
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
        
        // Voting section
        const voting = document.createElement('div');
        voting.className = 'round-voting';
        
        let votingHTML = '<h4>Voting Results</h4>';
        
        // Lead votes
        votingHTML += `<div class="votes-section">
            <h5>Lead Votes</h5>
        `;
        
        if (round.lead_votes && Object.keys(round.lead_votes).length > 0) {
            votingHTML += '<ul class="votes-list">';
            for (const judge in round.lead_votes) {
                const voteValue = round.lead_votes[judge];
                let voteText = '';
                
                // Get the contestant names from the pairs
                const lead1 = round.pairs?.pair_1?.lead;
                const lead2 = round.pairs?.pair_2?.lead;
                
                // Convert numeric vote to meaningful text
                if (parseInt(voteValue) === 1) {
                    voteText = lead1 || 'Contestant 1';
                } else if (parseInt(voteValue) === 2) {
                    voteText = lead2 || 'Contestant 2';
                } else if (parseInt(voteValue) === 3) {
                    voteText = 'Tie';
                } else if (parseInt(voteValue) === 4) {
                    voteText = 'No Contest';
                } else {
                    voteText = voteValue;
                }
                
                votingHTML += `<li><span class="judge-name">${judge}</span>: ${voteText}</li>`;
            }
            votingHTML += '</ul>';
        } else {
            votingHTML += '<p>No lead voting data available.</p>';
        }
        
        // Follow votes
        votingHTML += `</div><div class="votes-section">
            <h5>Follow Votes</h5>
        `;
        
        if (round.follow_votes && Object.keys(round.follow_votes).length > 0) {
            votingHTML += '<ul class="votes-list">';
            for (const judge in round.follow_votes) {
                const voteValue = round.follow_votes[judge];
                let voteText = '';
                
                // Get the contestant names from the pairs
                const follow1 = round.pairs?.pair_1?.follow;
                const follow2 = round.pairs?.pair_2?.follow;
                
                // Convert numeric vote to meaningful text
                if (parseInt(voteValue) === 1) {
                    voteText = follow1 || 'Contestant 1';
                } else if (parseInt(voteValue) === 2) {
                    voteText = follow2 || 'Contestant 2';
                } else if (parseInt(voteValue) === 3) {
                    voteText = 'Tie';
                } else if (parseInt(voteValue) === 4) {
                    voteText = 'No Contest';
                } else {
                    voteText = voteValue;
                }
                
                votingHTML += `<li><span class="judge-name">${judge}</span>: ${voteText}</li>`;
            }
            votingHTML += '</ul>';
        } else {
            votingHTML += '<p>No follow voting data available.</p>';
        }
        
        votingHTML += '</div>';
        
        // Win messages
        if (round.win_messages && round.win_messages.length > 0) {
            votingHTML += '<div class="win-message">';
            round.win_messages.forEach(message => {
                votingHTML += `<p>${message}</p>`;
            });
            votingHTML += '</div>';
        }
        
        voting.innerHTML = votingHTML;
        
        // Add the sections to the details
        details.appendChild(participants);
        details.appendChild(voting);
        
        // Add the details to the content
        content.appendChild(details);
        
        // Add event listener to the header to toggle the content
        header.addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            content.classList.toggle('active');
            this.querySelector('span:last-child').textContent = 
                this.classList.contains('active') ? '-' : '+';
        });
        
        // Add header and content to the accordion item
        accordionItem.appendChild(header);
        accordionItem.appendChild(content);
        
        // Add the accordion item to the container
        roundsContainer.appendChild(accordionItem);
    });
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
        const tokenResponse = await fetch('/api/get_spotify_token');
        if (!tokenResponse.ok) {
            throw new Error('Failed to get Spotify access token');
        }
        const { access_token } = await tokenResponse.json();
        
        // Fetch metadata for all Spotify URLs
        const rounds = battleData.rounds || [];
        for (const round of rounds) {
            if (round.song_info && round.song_info.spotify_url) {
                try {
                    // Extract track ID from Spotify URL
                    const spotifyUrl = new URL(round.song_info.spotify_url);
                    const trackId = spotifyUrl.pathname.split('/').pop();
                    
                    if (trackId) {
                        // Use the Spotify Web API to get track details
                        const metadataResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                            headers: {
                                'Authorization': `Bearer ${access_token}`
                            }
                        });
                        if (metadataResponse.ok) {
                            const metadata = await metadataResponse.json();
                            // Update song info with data from the Web API
                            round.song_info.title = metadata.name;
                            round.song_info.artist = metadata.artists.map(artist => artist.name).join(', ');
                            console.log('Updated song info:', round.song_info); // Debug log
                        } else {
                            console.error(`Failed to fetch metadata for ${round.song_info.spotify_url}: ${metadataResponse.status}`);
                        }
                    }
                } catch (e) {
                    console.error(`Error fetching metadata for ${round.song_info.spotify_url}:`, e);
                }
            }
        }
        
        // Now get the Excel file with updated metadata
        const excelResponse = await fetch(`/api/export_battle_data?session_id=${sessionId}&format=excel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rounds: rounds
            })
        });
        
        if (!excelResponse.ok) {
            throw new Error(`Failed to fetch Excel file: ${excelResponse.status}`);
        }
        
        // Check if the response is actually an Excel file
        const contentType = excelResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
            throw new Error('Invalid response format from server');
        }
        
        // Get the filename from the Content-Disposition header or use a default
        const contentDisposition = excelResponse.headers.get('content-disposition');
        let filename = 'battle_data.xlsx';
        if (contentDisposition) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
            if (matches != null && matches[1]) {
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        
        // Create a temporary link element
        const blob = await excelResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const tempLink = document.createElement('a');
        tempLink.href = url;
        tempLink.setAttribute('download', filename);
        
        // Trigger the download
        document.body.appendChild(tempLink);
        tempLink.click();
        
        // Clean up
        document.body.removeChild(tempLink);
        window.URL.revokeObjectURL(url);
        
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