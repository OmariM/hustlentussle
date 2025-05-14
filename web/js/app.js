// Global variables
let sessionId = null;
let guestJudges = [];
let leadVotes = [];
let followVotes = [];

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
    leadVotes = [];
    followVotes = [];
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
    if (voteType === 'lead') {
        leadVotes.push([judge, decision]);
        
        // Check if all judges have voted
        const allJudges = guestJudges.length + contestantJudgesList.textContent.split(', ').length;
        if (leadVotes.length === allJudges) {
            submitLeadVotes();
        }
    } else {
        followVotes.push([judge, decision]);
        
        // Check if all judges have voted
        const allJudges = guestJudges.length + contestantJudgesList.textContent.split(', ').length;
        if (followVotes.length === allJudges) {
            submitFollowVotes();
        }
    }
}

async function submitLeadVotes() {
    try {
        const response = await fetch('/api/judge_leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                votes: leadVotes
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
    } catch (error) {
        console.error('Error submitting lead votes:', error);
        alert('Failed to submit lead votes. Please try again.');
    }
}

async function submitFollowVotes() {
    try {
        const response = await fetch('/api/judge_follows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                votes: followVotes
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
    } catch (error) {
        console.error('Error submitting follow votes:', error);
        alert('Failed to submit follow votes. Please try again.');
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
                                 <span>${lead.name}</span> 
                                 <span>${lead.points} points</span>`;
            leadsLeaderboard.appendChild(leadItem);
        });
        
        // Populate follow leaderboard
        data.follows.forEach(follow => {
            const followItem = document.createElement('li');
            followItem.innerHTML = `${follow.medal ? `<span class="medal">${follow.medal}</span>` : ''} 
                                   <span>${follow.name}</span> 
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
    leadVotes = [];
    followVotes = [];
    
    // Reset UI elements
    leadNamesInput.value = '';
    followNamesInput.value = '';
    judgeNamesInput.value = '';
    
    // Reset UI state
    nextRoundBtn.disabled = false;
    
    // Show setup screen
    showScreen(setupScreen);
} 