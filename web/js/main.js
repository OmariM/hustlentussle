function startCompetition() {
    const leads = document.getElementById('lead-names').value.split(',').map(name => name.trim());
    const follows = document.getElementById('follow-names').value.split(',').map(name => name.trim());
    const judges = document.getElementById('judge-names').value.split(',').map(name => name.trim());

    // Clear any existing battle history
    document.getElementById('rounds-accordion').innerHTML = '';
    document.getElementById('lead-results-body').innerHTML = '';
    document.getElementById('follow-results-body').innerHTML = '';
    document.getElementById('leads-initial-order').innerHTML = '';
    document.getElementById('follows-initial-order').innerHTML = '';

    // Reset all global variables
    window.sessionId = null;
    window.guestJudges = [];
    window.leadVotes = {};
    window.followVotes = {};
    window.votingLocked = { lead: false, follow: false };
    window.currentLeads = [];
    window.currentFollows = [];
    window.initialLeads = [];
    window.initialFollows = [];

    // Initialize the competition
    competition = {
        leads: leads,
        follows: follows,
        judges: judges,
        currentRound: 1,
        scores: {
            leads: {},
            follows: {}
        },
        roundHistory: []
    };

    // Initialize scores
    leads.forEach(lead => {
        competition.scores.leads[lead] = 0;
    });
    follows.forEach(follow => {
        competition.scores.follows[follow] = 0;
    });

    // Show the round screen
    showScreen('round-screen');
    updateRoundDisplay();
}

function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show the requested screen
    document.getElementById(screenId).classList.add('active');
    
    // If returning to home screen, clear any existing battle data
    if (screenId === 'home-screen') {
        competition = null;
        document.getElementById('rounds-accordion').innerHTML = '';
        document.getElementById('lead-results-body').innerHTML = '';
        document.getElementById('follow-results-body').innerHTML = '';
        document.getElementById('leads-initial-order').innerHTML = '';
        document.getElementById('follows-initial-order').innerHTML = '';
    }
} 