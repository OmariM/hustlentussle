// Cross-Device Session Management
class CrossDeviceManager {
    constructor() {
        this.socket = null;
        this.deviceId = this.generateDeviceId();
        this.isConnected = false;
        this.isJoinedDevice = false;
        this.shareData = null;
        this.syncIndicator = null;
        this.init();
    }

    generateDeviceId() {
        // Generate or retrieve device ID from localStorage
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    }

    init() {
        this.initializeSocketIO();
        this.setupEventListeners();
        this.createSyncIndicator();
        this.checkForJoinSession();
    }

    initializeSocketIO() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Connected to server for real-time sync');
                this.isConnected = true;
                this.updateSyncIndicator(true);
                this.joinSessionRoom();
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.isConnected = false;
                this.updateSyncIndicator(false);
            });

            this.socket.on('game_update', (data) => {
                this.handleGameUpdate(data);
            });

            this.socket.on('session_joined', (data) => {
                console.log('Joined session room:', data);
            });
        }
    }

    setupEventListeners() {
        // Share battle button
        const shareBattleBtn = document.getElementById('share-battle');
        if (shareBattleBtn) {
            shareBattleBtn.addEventListener('click', () => this.showShareModal());
        }

        // Join battle button
        const joinBattleBtn = document.getElementById('join-battle');
        if (joinBattleBtn) {
            joinBattleBtn.addEventListener('click', () => this.showJoinModal());
        }

        // Modal close buttons
        const closeShareModal = document.getElementById('close-share-modal');
        if (closeShareModal) {
            closeShareModal.addEventListener('click', () => this.hideShareModal());
        }

        const closeJoinModal = document.getElementById('close-join-modal');
        if (closeJoinModal) {
            closeJoinModal.addEventListener('click', () => this.hideJoinModal());
        }

        // Copy buttons
        const copyShareCode = document.getElementById('copy-share-code');
        if (copyShareCode) {
            copyShareCode.addEventListener('click', () => this.copyToClipboard('share-code'));
        }

        const copyShareUrl = document.getElementById('copy-share-url');
        if (copyShareUrl) {
            copyShareUrl.addEventListener('click', () => this.copyToClipboard('share-url'));
        }

        // Join session button
        const joinSessionBtn = document.getElementById('join-session-btn');
        if (joinSessionBtn) {
            joinSessionBtn.addEventListener('click', () => this.joinSession());
        }

        // Join code input
        const joinCodeInput = document.getElementById('join-code-input');
        if (joinCodeInput) {
            joinCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.joinSession();
                }
            });
            
            // Format input as user types
            joinCodeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            });
        }

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            const shareModal = document.getElementById('share-battle-modal');
            const joinModal = document.getElementById('join-session-modal');
            
            if (e.target === shareModal) {
                this.hideShareModal();
            }
            if (e.target === joinModal) {
                this.hideJoinModal();
            }
        });
    }

    createSyncIndicator() {
        this.syncIndicator = document.createElement('div');
        this.syncIndicator.className = 'sync-indicator disconnected';
        this.syncIndicator.textContent = 'Connecting...';
        document.body.appendChild(this.syncIndicator);
    }

    updateSyncIndicator(connected) {
        if (this.syncIndicator) {
            if (connected) {
                this.syncIndicator.className = 'sync-indicator';
                this.syncIndicator.textContent = this.isJoinedDevice ? 'Synced (Joined)' : 'Synced';
            } else {
                this.syncIndicator.className = 'sync-indicator disconnected';
                this.syncIndicator.textContent = 'Disconnected';
            }
        }
    }

    checkForJoinSession() {
        // Check URL parameters for join session
        const urlParams = new URLSearchParams(window.location.search);
        const joinSession = urlParams.get('join_session');
        
        if (joinSession) {
            // Auto-join session from URL
            this.autoJoinSession(joinSession);
        }
    }

    async autoJoinSession(shareCode) {
        try {
            const response = await fetch('/api/join_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    share_code: shareCode,
                    device_id: this.deviceId
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Successfully joined session
                this.handleJoinSuccess(data);
                
                // Clean up URL
                window.history.replaceState(null, null, window.location.pathname);
            } else {
                console.error('Failed to join session:', data.error);
                this.showError('Failed to join battle: ' + data.error);
            }
        } catch (error) {
            console.error('Error joining session:', error);
            this.showError('Connection error. Please try again.');
        }
    }

    async showShareModal() {
        if (!sessionId) {
            this.showError('No active battle session to share');
            return;
        }

        try {
            const response = await fetch('/api/create_share_code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    session_id: sessionId
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.shareData = data;
                this.displayShareData(data);
                document.getElementById('share-battle-modal').style.display = 'block';
            } else {
                this.showError('Failed to create share code: ' + data.error);
            }
        } catch (error) {
            console.error('Error creating share code:', error);
            this.showError('Failed to create share code. Please try again.');
        }
    }

    displayShareData(data) {
        document.getElementById('share-code').textContent = data.share_code;
        document.getElementById('qr-code-image').src = data.qr_code;
        document.getElementById('share-url').value = data.join_url;
    }

    showJoinModal() {
        document.getElementById('join-session-modal').style.display = 'block';
        document.getElementById('join-code-input').focus();
    }

    hideShareModal() {
        document.getElementById('share-battle-modal').style.display = 'none';
    }

    hideJoinModal() {
        document.getElementById('join-session-modal').style.display = 'none';
        document.getElementById('join-error').textContent = '';
        document.getElementById('join-code-input').value = '';
    }

    async joinSession() {
        const shareCode = document.getElementById('join-code-input').value.trim();
        const errorDiv = document.getElementById('join-error');

        errorDiv.textContent = '';

        if (!shareCode) {
            errorDiv.textContent = 'Please enter a share code';
            return;
        }

        if (shareCode.length !== 6) {
            errorDiv.textContent = 'Share code must be 6 characters';
            return;
        }

        try {
            const response = await fetch('/api/join_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    share_code: shareCode,
                    device_id: this.deviceId
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.handleJoinSuccess(data);
                this.hideJoinModal();
            } else {
                errorDiv.textContent = data.error || 'Failed to join battle';
            }
        } catch (error) {
            console.error('Error joining session:', error);
            errorDiv.textContent = 'Connection error. Please try again.';
        }
    }

    handleJoinSuccess(data) {
        // Set global session variables
        window.sessionId = data.session_id;
        sessionId = data.session_id;
        this.isJoinedDevice = true;
        
        // Store in localStorage
        localStorage.setItem('sessionId', data.session_id);
        localStorage.setItem('deviceId', data.device_id);

        // Update UI
        this.updateSyncIndicator(this.isConnected);
        updateSessionIdDisplay();

        // Navigate to battle screen and load game state
        this.loadGameState(data.game_state);
        
        // Join the socket room
        this.joinSessionRoom();

        this.showSuccess('Successfully joined battle session!');
    }

    loadGameState(gameState) {
        // Hide home screen and show battle screen
        showScreen('battle-screen');

        // Update round information
        if (document.getElementById('round-number')) {
            document.getElementById('round-number').textContent = gameState.round;
        }

        // Update matchups
        if (gameState.pair_1 && gameState.pair_2) {
            if (document.getElementById('lead1-name')) {
                document.getElementById('lead1-name').textContent = gameState.pair_1[0];
            }
            if (document.getElementById('follow1-name')) {
                document.getElementById('follow1-name').textContent = gameState.pair_1[1];
            }
            if (document.getElementById('lead2-name')) {
                document.getElementById('lead2-name').textContent = gameState.pair_2[0];
            }
            if (document.getElementById('follow2-name')) {
                document.getElementById('follow2-name').textContent = gameState.pair_2[1];
            }
        }

        // Set global variables
        guestJudges = gameState.guest_judges || [];
        initialLeads = gameState.initial_leads || [];
        initialFollows = gameState.initial_follows || [];

        // Update judges list if available
        this.updateJudgesList(gameState.contestant_judges, guestJudges);

        // Load scores
        this.loadScores();
    }

    updateJudgesList(contestantJudges, guestJudges) {
        const contestantJudgesList = document.getElementById('contestant-judges-list');
        const guestJudgesList = document.getElementById('guest-judges-list');

        if (contestantJudgesList && contestantJudges) {
            contestantJudgesList.innerHTML = contestantJudges.join(', ') || 'None';
        }

        if (guestJudgesList && guestJudges) {
            guestJudgesList.innerHTML = guestJudges.join(', ') || 'None';
        }
    }

    async loadScores() {
        if (!sessionId) return;

        try {
            const response = await fetch(`/api/get_scores?session_id=${sessionId}`);
            const data = await response.json();

            if (response.ok) {
                this.updateScoresDisplay(data);
            }
        } catch (error) {
            console.error('Error loading scores:', error);
        }
    }

    updateScoresDisplay(scores) {
        const currentLeadScores = document.getElementById('current-lead-scores');
        const currentFollowScores = document.getElementById('current-follow-scores');

        if (currentLeadScores && scores.leads) {
            currentLeadScores.innerHTML = scores.leads
                .sort((a, b) => b.points - a.points)
                .map(lead => `
                    <div class="contestant-score ${lead.is_winner ? 'winner' : ''}">
                        ${lead.is_winner ? '👑 ' : ''}${lead.name} (${lead.points} pts)
                    </div>
                `).join('');
        }

        if (currentFollowScores && scores.follows) {
            currentFollowScores.innerHTML = scores.follows
                .sort((a, b) => b.points - a.points)
                .map(follow => `
                    <div class="contestant-score ${follow.is_winner ? 'winner' : ''}">
                        ${follow.is_winner ? '👑 ' : ''}${follow.name} (${follow.points} pts)
                    </div>
                `).join('');
        }
    }

    joinSessionRoom() {
        if (this.socket && sessionId) {
            this.socket.emit('join_session_room', {
                session_id: sessionId,
                device_id: this.deviceId
            });
        }
    }

    handleGameUpdate(data) {
        console.log('Received game update:', data);

        switch (data.event_type) {
            case 'scores_update':
                this.updateScoresDisplay(data.data);
                break;

            case 'lead_votes_complete':
                this.handleVotingComplete('lead', data.data);
                break;

            case 'follow_votes_complete':
                this.handleVotingComplete('follow', data.data);
                break;

            case 'next_round':
                this.handleNextRound(data.data);
                break;

            case 'voting_state_sync':
                this.handleVotingStateSync(data.data);
                break;

            default:
                console.log('Unknown game update type:', data.event_type);
        }
    }

    handleVotingComplete(type, data) {
        // Update voting results in UI
        const resultsSection = document.getElementById(`${type}-results`);
        const winnerElement = document.getElementById(`${type}-winner`);
        const guestVotesElement = document.getElementById(`${type}-guest-votes`);
        const contestantVotesElement = document.getElementById(`${type}-contestant-votes`);

        if (winnerElement) {
            winnerElement.textContent = data.winner;
        }

        if (guestVotesElement) {
            guestVotesElement.textContent = data.guest_votes.join(', ') || 'None';
        }

        if (contestantVotesElement) {
            contestantVotesElement.textContent = data.contestant_votes.join(', ') || 'None';
        }

        if (resultsSection) {
            resultsSection.style.display = 'block';
        }

        // Show win messages if any
        if (data.win_messages && data.win_messages.length > 0) {
            this.showWinMessages(data.win_messages);
        }
    }

    handleNextRound(data) {
        // Update round information
        if (document.getElementById('round-number')) {
            document.getElementById('round-number').textContent = data.round;
        }

        // Update matchups
        if (data.pair_1 && data.pair_2) {
            if (document.getElementById('lead1-name')) {
                document.getElementById('lead1-name').textContent = data.pair_1[0];
            }
            if (document.getElementById('follow1-name')) {
                document.getElementById('follow1-name').textContent = data.pair_1[1];
            }
            if (document.getElementById('lead2-name')) {
                document.getElementById('lead2-name').textContent = data.pair_2[0];
            }
            if (document.getElementById('follow2-name')) {
                document.getElementById('follow2-name').textContent = data.pair_2[1];
            }
        }

        // Update contestant judges
        this.updateJudgesList(data.contestant_judges, guestJudges);

        // Reset voting UI
        this.resetVotingUI();
    }

    handleVotingStateSync(data) {
        // Sync voting state with other devices
        this.updateJudgesList(data.contestant_judges, data.guest_judges);
    }

    resetVotingUI() {
        // Hide voting results
        const leadResults = document.getElementById('lead-results');
        const followResults = document.getElementById('follow-results');
        
        if (leadResults) leadResults.style.display = 'none';
        if (followResults) followResults.style.display = 'none';

        // Clear voting forms
        leadVotes = {};
        followVotes = {};
        votingLocked = { lead: false, follow: false };

        // Reset vote preview
        updateVotePreview();
    }

    showWinMessages(messages) {
        const winMessagesElement = document.getElementById('win-messages');
        if (winMessagesElement) {
            winMessagesElement.innerHTML = messages.map(msg => `<p>${msg}</p>`).join('');
            winMessagesElement.style.display = 'block';
        }
    }

    async copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = elementId === 'share-code' ? element.textContent : element.value;

        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess('Copied to clipboard!');
        } catch (error) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showSuccess('Copied to clipboard!');
        }
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: ${type === 'success' ? '#28a745' : '#dc3545'};
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            z-index: 1001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

// Initialize cross-device manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.crossDeviceManager = new CrossDeviceManager();
});

// Export for global access
window.CrossDeviceManager = CrossDeviceManager;