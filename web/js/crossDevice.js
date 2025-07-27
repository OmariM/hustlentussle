// Cross-Device Session Management
class CrossDeviceManager {
    constructor() {
        this.socket = null;
        this.deviceId = this.generateDeviceId();
        this.isConnected = false;
        this.isJoinedDevice = false;
        this.shareData = null;
        this.syncIndicator = null;
        this.pollingInterval = null;
        this.lastSyncTime = null;
        this.init();
    }

    generateDeviceId() {
        // Generate a unique device ID for this tab (don't reuse from localStorage)
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const tabId = Math.random().toString(36).substr(2, 6); // Add tab-specific component
        return `device_${timestamp}${random}_${tabId}`;
    }

    init() {
        this.initializeSocketIO();
        this.setupEventListeners();
        this.createSyncIndicator();
        this.checkForJoinSession();
    }

    initializeSocketIO() {
        if (typeof io !== 'undefined') {
            try {
                this.socket = io({
                    transports: ['polling', 'websocket'],
                    timeout: 20000,
                    forceNew: true
                });
                
                this.socket.on('connect', () => {
                    console.log('Connected to server for real-time sync');
                    this.isConnected = true;
                    this.updateSyncIndicator(true);
                    // Only join session room if we have a session ID
                    if (sessionId) {
                        this.joinSessionRoom();
                    }
                });

                this.socket.on('disconnect', () => {
                    console.log('Disconnected from server');
                    this.isConnected = false;
                    this.updateSyncIndicator(false);
                });

                this.socket.on('connect_error', (error) => {
                    console.log('Socket.IO connection error:', error);
                    this.isConnected = false;
                    this.updateSyncIndicator(false);
                    // Show a notification that real-time sync is not available
                    this.showNotification('Real-time sync not available. Using polling-based sync instead.', 'warning');
                    // Start polling-based sync as fallback
                    this.startPollingSync();
                });

                this.socket.on('game_update', (data) => {
                    console.log('Received game update:', data);
                    console.log('Current sessionId:', sessionId, 'Device ID:', this.deviceId);
                    this.handleGameUpdate(data);
                });

                this.socket.on('session_joined', (data) => {
                    console.log('Joined session room:', data);
                });

                this.socket.on('device_joined', (data) => {
                    console.log('Device joined:', data);
                    this.updateConnectedDevicesList(data.connected_devices);
                });

                this.socket.on('device_left', (data) => {
                    console.log('Device left:', data);
                    this.updateConnectedDevicesList(data.connected_devices);
                });
            } catch (error) {
                console.log('Failed to initialize Socket.IO:', error);
                this.isConnected = false;
                this.updateSyncIndicator(false);
                this.showNotification('Real-time sync not available. Using polling-based sync instead.', 'warning');
                this.startPollingSync();
            }
        } else {
            console.log('Socket.IO not available');
            this.isConnected = false;
            this.updateSyncIndicator(false);
            this.showNotification('Real-time sync not available. Using polling-based sync instead.', 'warning');
            this.startPollingSync();
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

        // Refresh devices button
        const refreshDevices = document.getElementById('refresh-devices');
        if (refreshDevices) {
            refreshDevices.addEventListener('click', () => this.loadConnectedDevices());
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
                
                // Load current connected devices
                this.loadConnectedDevices();
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
        console.log('Join success! Data received:', data);
        
        // Set global session variables
        window.sessionId = data.session_id;
        sessionId = data.session_id;
        this.isJoinedDevice = true;
        
        // Store session ID in localStorage (but not device ID - each tab should be unique)
        localStorage.setItem('sessionId', data.session_id);

        // Update UI
        this.updateSyncIndicator(this.isConnected);
        if (typeof updateSessionIdDisplay === 'function') {
            updateSessionIdDisplay();
        }

        // Navigate to battle screen and load game state
        this.loadGameState(data.game_state);
        
        // Join the socket room
        this.joinSessionRoom();

        // Start polling if real-time sync is not available
        if (!this.isConnected) {
            this.startPollingSync();
        }

        this.showSuccess('Successfully joined battle session!');
    }

    loadGameState(gameState) {
        console.log('Loading game state:', gameState);
        
        // Set global variables first (these are used by the main app)
        window.guestJudges = gameState.guest_judges || [];
        window.initialLeads = gameState.initial_leads || [];
        window.initialFollows = gameState.initial_follows || [];
        
        // Also set the local variables
        guestJudges = gameState.guest_judges || [];
        initialLeads = gameState.initial_leads || [];
        initialFollows = gameState.initial_follows || [];

        // Hide home screen and show battle screen
        this.showBattleScreen();

        // Wait a moment for the screen to load, then update UI
        setTimeout(() => {
            this.updateBattleUI(gameState);
        }, 100);
    }

    showBattleScreen() {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show the battle screen
        const battleScreen = document.getElementById('battle-screen');
        if (battleScreen) {
            battleScreen.classList.add('active');
        } else {
            console.error('Battle screen element not found');
        }
    }

    updateBattleUI(gameState) {
        console.log('Updating battle UI with:', gameState);
        
        // Update round information
        const roundNumber = document.getElementById('round-number');
        if (roundNumber) {
            roundNumber.textContent = gameState.round;
        }

        // Update matchups
        if (gameState.pair_1 && gameState.pair_2) {
            const lead1Name = document.getElementById('lead1-name');
            const follow1Name = document.getElementById('follow1-name');
            const lead2Name = document.getElementById('lead2-name');
            const follow2Name = document.getElementById('follow2-name');

            if (lead1Name) lead1Name.textContent = gameState.pair_1[0];
            if (follow1Name) follow1Name.textContent = gameState.pair_1[1];
            if (lead2Name) lead2Name.textContent = gameState.pair_2[0];
            if (follow2Name) follow2Name.textContent = gameState.pair_2[1];
        }

        // Update judges list
        this.updateJudgesList(gameState.contestant_judges, guestJudges);

        // Setup voting UI (this creates all the voting elements)
        if (typeof setupVotingUI === 'function') {
            setupVotingUI();
        }

        // Load and display scores
        this.loadScores();
        
        // Update session ID display
        if (typeof updateSessionIdDisplay === 'function') {
            updateSessionIdDisplay();
        }
        
        // Force a refresh of the scores display to ensure everything shows up
        setTimeout(() => {
            this.loadScores();
        }, 200);
    }

    updateJudgesList(contestantJudges, guestJudges) {
        const contestantJudgesList = document.getElementById('contestant-judges-list');
        const guestJudgesList = document.getElementById('guest-judges-list');

        // Update contestant judges with proper DOM structure
        if (contestantJudgesList && contestantJudges) {
            contestantJudgesList.innerHTML = '';
            if (contestantJudges.length > 0) {
                contestantJudges.forEach(judge => {
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

        // Update guest judges (keep as simple text for display)
        if (guestJudgesList && guestJudges) {
            guestJudgesList.innerHTML = guestJudges.join(', ') || 'None';
        }
    }

    updateConnectedDevicesList(deviceIds) {
        const connectedDevicesList = document.getElementById('connected-devices-list');
        if (!connectedDevicesList) return;

        // Clear existing list
        connectedDevicesList.innerHTML = '';

        // Add host device
        const hostDevice = document.createElement('span');
        hostDevice.className = 'device-status';
        hostDevice.textContent = 'This device (host)';
        connectedDevicesList.appendChild(hostDevice);

        // Add joined devices
        deviceIds.forEach(deviceId => {
            if (deviceId !== this.deviceId) { // Don't show this device twice
                const deviceElement = document.createElement('span');
                deviceElement.className = 'device-status';
                deviceElement.textContent = `Device ${deviceId.substring(0, 8)}...`;
                connectedDevicesList.appendChild(deviceElement);
            }
        });
    }

    async loadConnectedDevices() {
        if (!sessionId) return;

        try {
            const response = await fetch(`/api/connected_devices/${sessionId}`);
            const data = await response.json();

            if (response.ok) {
                console.log('Loaded connected devices:', data);
                this.updateConnectedDevicesList(data.connected_devices);
            }
        } catch (error) {
            console.error('Error loading connected devices:', error);
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
        console.log('Updating scores display:', scores);
        
        const currentLeadScores = document.getElementById('current-lead-scores');
        const currentFollowScores = document.getElementById('current-follow-scores');

        console.log('Found currentLeadScores element:', currentLeadScores);
        console.log('Found currentFollowScores element:', currentFollowScores);

        if (currentLeadScores && scores.leads) {
            // Clear existing content
            currentLeadScores.innerHTML = '';
            console.log('Cleared currentLeadScores, adding', scores.leads.length, 'leads');
            
            // Sort by points (highest first)
            const sortedLeads = [...scores.leads].sort((a, b) => b.points - a.points);
            console.log('Sorted leads:', sortedLeads);
            
            // Add each lead as a list item (matching the main app format)
            sortedLeads.forEach(lead => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="score-name">${lead.name}${lead.is_winner ? ' 👑' : ''}</span><span class="score-points">${lead.points}</span>`;
                currentLeadScores.appendChild(li);
                console.log('Added lead:', lead.name, 'with', lead.points, 'points');
            });
        } else {
            console.log('currentLeadScores not found or no leads data');
        }

        if (currentFollowScores && scores.follows) {
            // Clear existing content
            currentFollowScores.innerHTML = '';
            console.log('Cleared currentFollowScores, adding', scores.follows.length, 'follows');
            
            // Sort by points (highest first)
            const sortedFollows = [...scores.follows].sort((a, b) => b.points - a.points);
            console.log('Sorted follows:', sortedFollows);
            
            // Add each follow as a list item (matching the main app format)
            sortedFollows.forEach(follow => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="score-name">${follow.name}${follow.is_winner ? ' 👑' : ''}</span><span class="score-points">${follow.points}</span>`;
                currentFollowScores.appendChild(li);
                console.log('Added follow:', follow.name, 'with', follow.points, 'points');
            });
        } else {
            console.log('currentFollowScores not found or no follows data');
        }
        
        // Also update the global variables that the main app uses
        if (scores.leads) {
            window.currentLeads = scores.leads;
            // Also set the local variable if it exists
            if (typeof currentLeads !== 'undefined') {
                currentLeads = scores.leads;
            }
            console.log('Updated global currentLeads:', window.currentLeads);
        }
        if (scores.follows) {
            window.currentFollows = scores.follows;
            // Also set the local variable if it exists
            if (typeof currentFollows !== 'undefined') {
                currentFollows = scores.follows;
            }
            console.log('Updated global currentFollows:', window.currentFollows);
        }
        
        // Debug: Check if the scores are actually visible in the DOM
        setTimeout(() => {
            console.log('Final currentLeadScores HTML:', currentLeadScores ? currentLeadScores.innerHTML : 'null');
            console.log('Final currentFollowScores HTML:', currentFollowScores ? currentFollowScores.innerHTML : 'null');
            
            // Check if the scores section is visible
            const scoresSection = document.querySelector('.scores-section');
            if (scoresSection) {
                console.log('Scores section display style:', scoresSection.style.display);
                console.log('Scores section visibility:', scoresSection.style.visibility);
                console.log('Scores section computed display:', window.getComputedStyle(scoresSection).display);
            } else {
                console.log('Scores section not found');
            }
        }, 100);
    }

    joinSessionRoom() {
        if (this.socket && this.isConnected && sessionId) {
            console.log('Joining session room:', sessionId);
            this.socket.emit('join_session_room', {
                session_id: sessionId,
                device_id: this.deviceId
            });
        } else {
            console.log('Cannot join session room - Socket.IO not available or not connected');
        }
    }

    handleGameUpdate(data) {
        console.log('Received game update:', data);

        switch (data.event_type) {
            case 'scores_update':
                console.log('Processing scores_update event');
                // Use the main app's updateScoresDisplay function instead of our own
                if (typeof updateScoresDisplay === 'function') {
                    // Update the global variables first
                    window.currentLeads = data.data.leads;
                    window.currentFollows = data.data.follows;
                    if (typeof currentLeads !== 'undefined') currentLeads = data.data.leads;
                    if (typeof currentFollows !== 'undefined') currentFollows = data.data.follows;
                    // Then call the main app's function
                    updateScoresDisplay();
                } else {
                    // Fallback to our own implementation
                    this.updateScoresDisplay(data.data);
                }
                break;

            case 'lead_votes_complete':
                console.log('Processing lead_votes_complete event');
                this.handleVotingComplete('lead', data.data);
                break;

            case 'follow_votes_complete':
                console.log('Processing follow_votes_complete event');
                this.handleVotingComplete('follow', data.data);
                break;

            case 'next_round':
                console.log('Processing next_round event');
                this.handleNextRound(data.data);
                break;

            case 'voting_state_sync':
                console.log('Processing voting_state_sync event');
                this.handleVotingStateSync(data.data);
                break;

            case 'voting_results':
                console.log('Processing voting_results event');
                this.handleVotingResults(data.data);
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
        console.log('handleNextRound called with data:', data);
        
        // Update round information
        const roundNumber = document.getElementById('round-number');
        if (roundNumber) {
            roundNumber.textContent = data.round;
            console.log('Updated round number to:', data.round);
        } else {
            console.log('round-number element not found');
        }

        // Update matchups
        if (data.pair_1 && data.pair_2) {
            const lead1Name = document.getElementById('lead1-name');
            const follow1Name = document.getElementById('follow1-name');
            const lead2Name = document.getElementById('lead2-name');
            const follow2Name = document.getElementById('follow2-name');
            
            if (lead1Name) {
                lead1Name.textContent = data.pair_1[0];
                console.log('Updated lead1-name to:', data.pair_1[0]);
            } else {
                console.log('lead1-name element not found');
            }
            
            if (follow1Name) {
                follow1Name.textContent = data.pair_1[1];
                console.log('Updated follow1-name to:', data.pair_1[1]);
            } else {
                console.log('follow1-name element not found');
            }
            
            if (lead2Name) {
                lead2Name.textContent = data.pair_2[0];
                console.log('Updated lead2-name to:', data.pair_2[0]);
            } else {
                console.log('lead2-name element not found');
            }
            
            if (follow2Name) {
                follow2Name.textContent = data.pair_2[1];
                console.log('Updated follow2-name to:', data.pair_2[1]);
            } else {
                console.log('follow2-name element not found');
            }
        }

        // Update contestant judges
        this.updateJudgesList(data.contestant_judges, guestJudges);

        // Reset voting UI
        this.resetVotingUI();
    }

    handleVotingStateSync(data) {
        console.log('Processing voting_state_sync event with data:', data);
        
        // Update round information
        const roundNumber = document.getElementById('round-number');
        if (roundNumber) {
            roundNumber.textContent = data.round;
        }

        // Update matchups FIRST (before setting up voting UI)
        if (data.pair_1 && data.pair_2) {
            const lead1Name = document.getElementById('lead1-name');
            const follow1Name = document.getElementById('follow1-name');
            const lead2Name = document.getElementById('lead2-name');
            const follow2Name = document.getElementById('follow2-name');
            
            if (lead1Name) lead1Name.textContent = data.pair_1[0];
            if (follow1Name) follow1Name.textContent = data.pair_1[1];
            if (lead2Name) lead2Name.textContent = data.pair_2[0];
            if (follow2Name) follow2Name.textContent = data.pair_2[1];
            
            console.log('Updated matchups:', {
                lead1: data.pair_1[0],
                follow1: data.pair_1[1],
                lead2: data.pair_2[0],
                follow2: data.pair_2[1]
            });
        }

        // Update judges list
        this.updateJudgesList(data.contestant_judges, data.guest_judges);
        console.log('Updated judges list:', {
            contestant: data.contestant_judges,
            guest: data.guest_judges
        });

        // Check if voting UI exists and if contestant names have changed
        const leadJudgesContainer = document.getElementById('lead-judges-container');
        const followJudgesContainer = document.getElementById('follow-judges-container');
        const lead1Name = document.getElementById('lead1-name');
        const follow1Name = document.getElementById('follow1-name');
        const lead2Name = document.getElementById('lead2-name');
        const follow2Name = document.getElementById('follow2-name');
        
        // Check if we need to recreate voting UI (either missing or contestant names changed)
        const needsVotingUI = (!leadJudgesContainer || leadJudgesContainer.children.length === 0) || 
                             (!followJudgesContainer || followJudgesContainer.children.length === 0);
        
        // Check if contestant names have changed (for existing voting UI)
        // We need to compare against the actual voting button text, not the DOM elements
        // since the DOM elements may have already been updated by handleNextRound
        const leadVotingButtons = leadJudgesContainer ? leadJudgesContainer.querySelectorAll('.vote-btn') : [];
        const followVotingButtons = followJudgesContainer ? followJudgesContainer.querySelectorAll('.vote-btn') : [];
        
        let contestantNamesChanged = false;
        
        if (leadVotingButtons.length > 0 && followVotingButtons.length > 0) {
            // Get the first two unique button texts from lead voting (should be the contestant names)
            const leadButtonTexts = Array.from(leadVotingButtons)
                .map(btn => btn.textContent)
                .filter((text, index, arr) => arr.indexOf(text) === index)
                .slice(0, 2);
            
            // Get the first two unique button texts from follow voting (should be the contestant names)
            const followButtonTexts = Array.from(followVotingButtons)
                .map(btn => btn.textContent)
                .filter((text, index, arr) => arr.indexOf(text) === index)
                .slice(0, 2);
            
            // Compare with the new data
            contestantNamesChanged = (leadButtonTexts[0] !== data.pair_1[0] || 
                                     leadButtonTexts[1] !== data.pair_2[0] ||
                                     followButtonTexts[0] !== data.pair_1[1] || 
                                     followButtonTexts[1] !== data.pair_2[1]);
            
            console.log('Contestant name comparison:', {
                currentLeadButtons: leadButtonTexts,
                currentFollowButtons: followButtonTexts,
                new: { lead1: data.pair_1[0], lead2: data.pair_2[0], follow1: data.pair_1[1], follow2: data.pair_2[1] },
                changed: contestantNamesChanged
            });
        }
        
        // Check if voting results are currently visible
        const votingResults = document.getElementById('voting-results');
        const votingResultsVisible = votingResults && !votingResults.classList.contains('hidden');
        
        // Check if this is a new round (round number changed)
        const roundNumberElement = document.getElementById('round-number');
        const currentRound = roundNumberElement ? parseInt(roundNumberElement.textContent) : 0;
        const newRound = data.round;
        const isNewRound = currentRound !== newRound;
        
        // Always recreate voting UI for new rounds, or if contestant names have changed
        // For same round, only recreate if voting results are not visible or names changed
        if (isNewRound || contestantNamesChanged || !votingResultsVisible) {
            console.log('CrossDevice: About to call setupVotingUI. isNewRound:', isNewRound, 'votingResultsVisible:', votingResultsVisible);
            console.log('CrossDevice: Lead names before setupVotingUI:', lead1Name?.textContent, lead2Name?.textContent);
            console.log('CrossDevice: Follow names before setupVotingUI:', follow1Name?.textContent, follow2Name?.textContent);
            
            if (typeof window.setupVotingUI === 'function') {
                window.setupVotingUI();
                console.log('Setup voting UI called from voting_state_sync', 
                           isNewRound ? '(new round)' : '(voting state updated)');
            } else {
                console.log('setupVotingUI function not available on window object');
            }
        } else {
            console.log('Voting results are visible and same round, skipping voting UI setup to preserve results');
        }

        // For joined devices, we don't need to reset voting state since they're just joining
        // The voting state will be empty anyway
        if (this.isJoinedDevice) {
            console.log('Joined device - skipping vote reset');
        } else {
            // For host device (shouldn't happen now, but just in case)
            console.log('Host device - resetting voting state');
            this.resetVotingUI();
        }
    }

    resetVotingUI() {
        // Hide voting results
        const leadResults = document.getElementById('lead-results');
        const followResults = document.getElementById('follow-results');
        
        if (leadResults) leadResults.style.display = 'none';
        if (followResults) followResults.style.display = 'none';

        // Clear voting forms using global variables
        if (typeof window.leadVotes !== 'undefined') window.leadVotes = {};
        if (typeof window.followVotes !== 'undefined') window.followVotes = {};
        if (typeof window.votingLocked !== 'undefined') window.votingLocked = { lead: false, follow: false };

        // Reset vote preview
        if (typeof updateVotePreview === 'function') {
            updateVotePreview();
        }
    }

    handleVotingResults(data) {
        console.log('Handling voting results:', data);
        
        // Show voting results section
        const votingResults = document.getElementById('voting-results');
        if (votingResults) {
            votingResults.classList.remove('hidden');
        }
        
        // Update lead results
        const leadResults = document.getElementById('lead-results');
        const leadWinner = document.getElementById('lead-winner');
        const leadGuestVotes = document.getElementById('lead-guest-votes');
        const leadContestantVotes = document.getElementById('lead-contestant-votes');
        
        if (leadWinner) leadWinner.textContent = data.lead_winner;
        if (leadGuestVotes) leadGuestVotes.textContent = data.lead_guest_votes.join(', ') || 'None';
        if (leadContestantVotes) leadContestantVotes.textContent = data.lead_contestant_votes.join(', ') || 'None';
        if (leadResults) leadResults.style.display = 'block';
        
        // Update follow results
        const followResults = document.getElementById('follow-results');
        const followWinner = document.getElementById('follow-winner');
        const followGuestVotes = document.getElementById('follow-guest-votes');
        const followContestantVotes = document.getElementById('follow-contestant-votes');
        
        if (followWinner) followWinner.textContent = data.follow_winner;
        if (followGuestVotes) followGuestVotes.textContent = data.follow_guest_votes.join(', ') || 'None';
        if (followContestantVotes) followContestantVotes.textContent = data.follow_contestant_votes.join(', ') || 'None';
        if (followResults) followResults.style.display = 'block';
        
        // Show win messages if any
        if (data.win_messages && data.win_messages.length > 0) {
            this.showWinMessages(data.win_messages);
        }
        
        // Show round results section
        const roundResultsSection = document.getElementById('round-results-section');
        if (roundResultsSection) {
            roundResultsSection.classList.remove('hidden');
        }
        
        // Disable next round button if game is finished
        if (data.game_finished) {
            const nextRoundBtn = document.getElementById('next-round-btn');
            if (nextRoundBtn) {
                nextRoundBtn.disabled = true;
            }
        }
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
            background-color: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ff9800' : '#dc3545'};
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

    // Polling-based sync methods
    startPollingSync() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        console.log('Starting polling-based sync');
        this.pollingInterval = setInterval(() => {
            this.pollForUpdates();
        }, 3000); // Poll every 3 seconds
    }

    stopPollingSync() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('Stopped polling-based sync');
        }
    }

    async pollForUpdates() {
        if (!sessionId) return;

        try {
            // Get current game state
            const response = await fetch(`/api/get_scores?session_id=${sessionId}`);
            if (!response.ok) return;
            
            const currentState = await response.json();
            
            // Get session status to check for updates
            const statusResponse = await fetch(`/api/session_status/${sessionId}`);
            if (!statusResponse.ok) return;
            
            const status = await statusResponse.json();
            
            // Check if there are updates since last sync
            if (this.lastSyncTime && status.last_updated && new Date(status.last_updated) <= new Date(this.lastSyncTime)) {
                return; // No updates
            }
            
            console.log('Polling detected updates, syncing...');
            this.lastSyncTime = new Date().toISOString();
            
            // Update the UI with new state
            this.updateGameStateFromPolling(currentState, status);
            
        } catch (error) {
            console.log('Polling sync error:', error);
        }
    }

    updateGameStateFromPolling(gameState, status) {
        // Update scores
        if (gameState.scores) {
            this.updateScoresDisplay(gameState.scores);
        }
        
        // Update round information
        if (gameState.current_round) {
            this.updateRoundInfo(gameState.current_round);
        }
        
        // Update voting state if needed
        if (status.voting_state) {
            this.updateVotingStateFromPolling(status.voting_state);
        }
        
        // Update connected devices
        if (status.connected_devices) {
            this.updateConnectedDevicesList(status.connected_devices);
        }
        
        // Show sync indicator
        this.updateSyncIndicator(true);
        setTimeout(() => this.updateSyncIndicator(false), 1000);
    }

    updateRoundInfo(roundData) {
        const roundNumberElement = document.getElementById('round-number');
        if (roundNumberElement && roundData.round_number) {
            roundNumberElement.textContent = roundData.round_number;
        }
        
        // Update matchup names
        if (roundData.leads && roundData.leads.length >= 2) {
            const lead1Name = document.getElementById('lead1-name');
            const lead2Name = document.getElementById('lead2-name');
            if (lead1Name) lead1Name.textContent = roundData.leads[0];
            if (lead2Name) lead2Name.textContent = roundData.leads[1];
        }
        
        if (roundData.follows && roundData.follows.length >= 2) {
            const follow1Name = document.getElementById('follow1-name');
            const follow2Name = document.getElementById('follow2-name');
            if (follow1Name) follow1Name.textContent = roundData.follows[0];
            if (follow2Name) follow2Name.textContent = roundData.follows[1];
        }
    }

    updateVotingStateFromPolling(votingState) {
        // Update voting UI based on polling data
        if (votingState.is_voting_active) {
            // Ensure voting UI is set up
            if (typeof window.setupVotingUI === 'function') {
                window.setupVotingUI();
            }
        }
        
        // Update voting results if available
        if (votingState.results) {
            this.handleVotingResults(votingState.results);
        }
    }
}

// Initialize cross-device manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.crossDeviceManager = new CrossDeviceManager();
});

// Export for global access
window.CrossDeviceManager = CrossDeviceManager;