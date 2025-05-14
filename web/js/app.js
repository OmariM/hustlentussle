// Global variables
let sessionId = null;
let guestJudges = [];
let leadVotes = {};  // Changed to an object to easily update votes
let followVotes = {}; // Changed to an object to easily update votes
let votingLocked = { lead: false, follow: false }; // Track if voting is locked
let currentLeads = []; // Store current lead contestants with points
let currentFollows = []; // Store current follow contestants with points

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const roundScreen = document.getElementById('round-screen');
const resultsScreen = document.getElementById('results-screen');

// Setup screen elements
const leadNamesInput = document.getElementById('lead-names');
const followNamesInput = document.getElementById('follow-names');
const judgeNamesInput = document.getElementById('judge-names');
const startCompetitionBtn = document.getElementById('start-competition');

// Round screen elements
const roundNumber = document.getElementById('round-number');
const lead1Name = document.getElementById('lead1-name');
const lead2Name = document.getElementById('lead2-name');
const follow1Name = document.getElementById('follow1-name');
const follow2Name = document.getElementById('follow2-name');
const contestantJudgesList = document.getElementById('contestant-judges-list');
const currentLeadScores = document.getElementById('current-lead-scores');
const currentFollowScores = document.getElementById('current-follow-scores');

// Voting elements
const leadVotingSection = document.getElementById('lead-voting');
const followVotingSection = document.getElementById('follow-voting');
const leadJudgesContainer = document.getElementById('lead-judges-container');
const followJudgesContainer = document.getElementById('follow-judges-container');
const leadResults = document.getElementById('lead-results');
const followResults = document.getElementById('follow-results');
const leadWinner = document.getElementById('lead-winner');
const followWinner = document.getElementById('follow-winner');
const leadGuestVotes = document.getElementById('lead-guest-votes');
const leadContestantVotes = document.getElementById('lead-contestant-votes');
const followGuestVotes = document.getElementById('follow-guest-votes');
const followContestantVotes = document.getElementById('follow-contestant-votes');
const determineLeadWinnerBtn = document.getElementById('determine-lead-winner');
const determineFollowWinnerBtn = document.getElementById('determine-follow-winner');

// Results elements
const roundResultsSection = document.getElementById('round-results');
const winMessages = document.getElementById('win-messages');
const nextRoundBtn = document.getElementById('next-round');
const endBattleBtn = document.getElementById('end-battle');
const leadsLeaderboard = document.getElementById('leads-leaderboard');
const followsLeaderboard = document.getElementById('follows-leaderboard');
const newCompetitionBtn = document.getElementById('new-competition');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    startCompetitionBtn.addEventListener('click', startCompetition);
    determineLeadWinnerBtn.addEventListener('click', submitLeadVotes);
    determineFollowWinnerBtn.addEventListener('click', submitFollowVotes);
    nextRoundBtn.addEventListener('click', goToNextRound);
    endBattleBtn.addEventListener('click', endCompetition);
    newCompetitionBtn.addEventListener('click', resetCompetition);
});

// Functions
function showScreen(screen) {
    setupScreen.classList.remove('active');
    roundScreen.classList.remove('active');
    resultsScreen.classList.remove('active');
    
    screen.classList.add('active');
}

async function startCompetition() {
    const leads = leadNamesInput.value.trim();
    const follows = followNamesInput.value.trim();
    const judges = judgeNamesInput.value.trim();
    
    if (!leads || !follows || !judges) {
        alert('Please enter names for leads, follows, and judges.');
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
        guestJudges = data.guest_judges;
        
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
    
    // Lock voting and disable the button to prevent further changes
    lockVoting('lead');
    determineLeadWinnerBtn.disabled = true;
    
    try {
        const response = await fetch('/api/judge_leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                votes: votesArray
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
    try {
        const response = await fetch('/api/end_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();
        
        // Clear previous leaderboards
        leadsLeaderboard.innerHTML = '';
        followsLeaderboard.innerHTML = '';
        
        // Populate lead leaderboard
        data.leads.forEach(lead => {
            const leadItem = document.createElement('li');
            leadItem.innerHTML = `${lead.medal ? `<span class="medal">${lead.medal}</span>` : ''} 
                                 <span>${lead.name}${lead.is_winner ? ' 👑' : ''}</span> 
                                 <span>${lead.points} points</span>`;
            leadsLeaderboard.appendChild(leadItem);
        });
        
        // Populate follow leaderboard
        data.follows.forEach(follow => {
            const followItem = document.createElement('li');
            followItem.innerHTML = `${follow.medal ? `<span class="medal">${follow.medal}</span>` : ''} 
                                   <span>${follow.name}${follow.is_winner ? ' 👑' : ''}</span> 
                                   <span>${follow.points} points</span>`;
            followsLeaderboard.appendChild(followItem);
        });
        
        // Show results screen
        showScreen(resultsScreen);
    } catch (error) {
        console.error('Error ending game:', error);
        alert('Failed to end the competition. Please try again.');
    }
}

function resetCompetition() {
    // Reset all game state
    sessionId = null;
    guestJudges = [];
    leadVotes = {};
    followVotes = {};
    votingLocked = { lead: false, follow: false };
    
    // Reset UI elements
    leadNamesInput.value = '';
    followNamesInput.value = '';
    judgeNamesInput.value = '';
    
    // Reset UI state
    nextRoundBtn.disabled = false;
    determineLeadWinnerBtn.disabled = false;
    determineFollowWinnerBtn.disabled = false;
    
    // Show setup screen
    showScreen(setupScreen);
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
    // Hide the round screen and show the results screen
    document.getElementById('round-screen').style.display = 'none';
    document.getElementById('results-screen').style.display = 'block';

    // Display lead results
    const leadResultsBody = document.getElementById('lead-results-body');
    leadResultsBody.innerHTML = '';
    data.leads.forEach(lead => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = `${lead.medal} ${lead.name}${lead.is_winner ? ' 👑' : ''}`;
        const pointsCell = document.createElement('td');
        pointsCell.textContent = lead.points;
        row.appendChild(nameCell);
        row.appendChild(pointsCell);
        leadResultsBody.appendChild(row);
    });

    // Display follow results
    const followResultsBody = document.getElementById('follow-results-body');
    followResultsBody.innerHTML = '';
    data.follows.forEach(follow => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = `${follow.medal} ${follow.name}${follow.is_winner ? ' 👑' : ''}`;
        const pointsCell = document.createElement('td');
        pointsCell.textContent = follow.points;
        row.appendChild(nameCell);
        row.appendChild(pointsCell);
        followResultsBody.appendChild(row);
    });
}

// End game function
function endGame() {
    // Disable voting buttons
    document.querySelectorAll('.vote-button').forEach(button => {
        button.disabled = true;
    });
    
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
        // Display final results
        displayResults(data);
    })
    .catch(error => {
        console.error('Error ending game:', error);
    });
} 