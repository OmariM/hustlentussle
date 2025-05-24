class DebugTools {
    constructor() {
        this.isVisible = false;
        this.networkLogs = [];
        this.autoAdvance = false;
        this.autoAdvanceInterval = null;
        this.autoAdvanceDelay = 3000; // Default to 3 seconds
        this.playlistId = '3S34wIELHX7T82ChgdU9NS'; // Your playlist ID
        this.init();
        this.setupNetworkMonitoring();
    }

    init() {
        // Create debug panel
        this.panel = document.createElement('div');
        this.panel.id = 'debug-panel';
        this.panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 9999;
            display: none;
            max-width: 300px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        // Create toggle button
        this.toggleButton = document.createElement('button');
        this.toggleButton.textContent = '🔧 Debug';
        this.toggleButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            padding: 8px 15px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
        this.toggleButton.onclick = () => this.togglePanel();

        // Add debug tools
        this.addDebugTools();

        // Add elements to page
        document.body.appendChild(this.panel);
        document.body.appendChild(this.toggleButton);
    }

    setupNetworkMonitoring() {
        // Store original fetch
        const originalFetch = window.fetch;
        
        // Override fetch
        window.fetch = async (...args) => {
            // Only monitor our API calls
            const url = args[0];
            if (typeof url === 'string' && url.startsWith('/api/')) {
                const startTime = Date.now();
                const request = {
                    url: url,
                    method: args[1]?.method || 'GET',
                    timestamp: new Date().toISOString(),
                    requestData: args[1]?.body
                };

                try {
                    const response = await originalFetch(...args);
                    const endTime = Date.now();
                    
                    // Clone response to read body
                    const clone = response.clone();
                    let responseData;
                    try {
                        responseData = await clone.json();
                    } catch {
                        try {
                            responseData = await clone.text();
                        } catch {
                            responseData = 'Could not read response body';
                        }
                    }

                    const logEntry = {
                        ...request,
                        duration: endTime - startTime,
                        status: response.status,
                        responseData
                    };

                    this.networkLogs.push(logEntry);
                    console.log('Network Request:', logEntry);
                    
                    return response;
                } catch (error) {
                    const logEntry = {
                        ...request,
                        error: error.message
                    };
                    this.networkLogs.push(logEntry);
                    console.error('Network Request Failed:', logEntry);
                    throw error;
                }
            }
            
            // For non-API calls, just pass through
            return originalFetch(...args);
        };
    }

    addDebugTools() {
        // Session Info
        this.addSection('Session Info');
        this.addButton('Show Current Session', () => {
            const sessionId = localStorage.getItem('sessionId');
            alert(`Current Session ID: ${sessionId || 'None'}`);
        });

        // Game State
        this.addSection('Game State');
        this.addButton('Show Game State', () => {
            const gameState = localStorage.getItem('gameState');
            console.log('Game State:', JSON.parse(gameState || '{}'));
            alert('Game state logged to console');
        });

        // Network Monitoring
        this.addSection('Network Monitoring');
        this.addButton('Show Network Logs', () => {
            console.table(this.networkLogs);
            alert('Network logs displayed in console');
        });
        this.addButton('Clear Network Logs', () => {
            this.networkLogs = [];
            alert('Network logs cleared');
        });

        // Setup Helpers
        this.addSection('Setup Helpers');
        this.addButton('Fill Setup Form', () => this.fillSetupForm());
        this.addButton('Start with Random Names', () => this.startWithRandomNames());
        
        // Voting Helpers
        this.addSection('Voting Helpers');
        this.addButton('Random Lead Votes', () => this.randomVotes(true));
        this.addButton('Random Follow Votes', () => this.randomVotes(false));

        // Round Navigation
        this.addSection('Round Navigation');
        this.addButton('Next Round', () => this.nextRound());
        
        // Add Auto-Advance Toggle and Interval Setting
        const autoAdvanceContainer = document.createElement('div');
        autoAdvanceContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 5px;
            margin: 5px 0;
            padding: 5px;
            background: #333;
            border: 1px solid #4CAF50;
            border-radius: 3px;
        `;
        
        // Toggle Switch
        const toggleContainer = document.createElement('div');
        toggleContainer.style.cssText = `
            display: flex;
            align-items: center;
        `;
        
        const toggleLabel = document.createElement('span');
        toggleLabel.textContent = 'Auto-Advance: ';
        toggleLabel.style.cssText = `
            color: white;
            margin-right: 10px;
        `;
        
        const toggleSwitch = document.createElement('input');
        toggleSwitch.type = 'checkbox';
        toggleSwitch.style.cssText = `
            width: 20px;
            height: 20px;
            margin: 0;
        `;
        toggleSwitch.checked = this.autoAdvance;
        
        toggleSwitch.onchange = () => {
            this.autoAdvance = toggleSwitch.checked;
            if (this.autoAdvance) {
                this.startAutoAdvance();
            } else {
                this.stopAutoAdvance();
            }
        };
        
        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggleSwitch);
        
        // Interval Setting
        const intervalContainer = document.createElement('div');
        intervalContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        const intervalLabel = document.createElement('span');
        intervalLabel.textContent = 'Interval (seconds): ';
        intervalLabel.style.cssText = `
            color: white;
        `;
        
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.min = '1';
        intervalInput.max = '60';
        intervalInput.value = this.autoAdvanceDelay / 1000;
        intervalInput.style.cssText = `
            width: 60px;
            padding: 2px;
            background: #444;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
        `;
        
        intervalInput.onchange = () => {
            const newValue = Math.max(1, Math.min(60, parseInt(intervalInput.value) || 3));
            this.autoAdvanceDelay = newValue * 1000;
            intervalInput.value = newValue;
            
            // Restart auto-advance with new interval if it's running
            if (this.autoAdvance) {
                this.startAutoAdvance();
            }
        };
        
        intervalContainer.appendChild(intervalLabel);
        intervalContainer.appendChild(intervalInput);
        
        autoAdvanceContainer.appendChild(toggleContainer);
        autoAdvanceContainer.appendChild(intervalContainer);
        this.panel.appendChild(autoAdvanceContainer);

        // Clear Data
        this.addSection('Data Management');
        this.addButton('Clear All Data', () => {
            if (confirm('Are you sure you want to clear all data?')) {
                localStorage.clear();
                location.reload();
            }
        });

        // Test Functions
        this.addSection('Test Functions');
        this.addButton('Test Spotify API', () => this.testSpotifyAPI());
        this.addButton('Test Export', () => this.testExport());
    }

    // Generate random names
    generateRandomNames(count, useGender) {
        const maleFirstNames = ['James', 'Michael', 'David', 'John', 'Robert', 'William', 'Thomas', 'Daniel', 'Paul', 'Mark'];
        
        const femaleFirstNames = ['Sarah', 'Emily', 'Jessica', 'Jennifer', 'Elizabeth', 'Lauren', 'Michelle', 'Nicole', 'Amanda', 'Rachel'];
        
        const genderNeutralNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey'];
        
        // Keep track of used names to ensure uniqueness
        const usedNames = new Set();
        
        const getRandomName = (nameList) => {
            let name;
            do {
                name = nameList[Math.floor(Math.random() * nameList.length)];
            } while (usedNames.has(name));
            
            usedNames.add(name);
            return name;
        };

        if (useGender === 'male') {
            // Generate male names
            return Array(count).fill().map(() => getRandomName(maleFirstNames));
        } else if (useGender === 'female') {
            // Generate female names
            return Array(count).fill().map(() => getRandomName(femaleFirstNames));
        } else {
            // Generate gender-neutral names
            return Array(count).fill().map(() => getRandomName(genderNeutralNames));
        }
    }

    // Fill the setup form with random names
    fillSetupForm() {
        const leadsInput = document.getElementById('lead-names');
        const followsInput = document.getElementById('follow-names');
        const judgesInput = document.getElementById('judge-names');
        
        if (!leadsInput || !followsInput || !judgesInput) {
            alert('Setup form not found. Make sure you are on the home screen.');
            return;
        }
        
        // Generate all possible names
        const allLeads = this.generateRandomNames(10, 'male');
        const allFollows = this.generateRandomNames(10, 'female');
        const allJudges = this.generateRandomNames(5);
        
        // Randomly select 8 leads, 8 follows, and 2 judges
        const selectedLeads = this.shuffleArray(allLeads).slice(0, 8);
        const selectedFollows = this.shuffleArray(allFollows).slice(0, 8);
        const selectedJudges = this.shuffleArray(allJudges).slice(0, 2);
        
        // Fill inputs
        leadsInput.value = selectedLeads.join(', ');
        followsInput.value = selectedFollows.join(', ');
        judgesInput.value = selectedJudges.join(', ');
        
        console.log('Filled setup form with:', { 
            leads: selectedLeads, 
            follows: selectedFollows, 
            judges: selectedJudges 
        });
    }

    // Helper method to shuffle an array
    shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
    
    // Start a battle with random names
    async startWithRandomNames() {
        // Generate random names
        const leads = this.generateRandomNames(10, 'male');
        const follows = this.generateRandomNames(10, 'female');
        const judges = this.generateRandomNames(5);
        
        console.log('Generated names:', { leads, follows, judges });
        
        try {
            // Fill the setup form first
            const leadsInput = document.getElementById('lead-names');
            const followsInput = document.getElementById('follow-names');
            const judgesInput = document.getElementById('judge-names');
            
            if (!leadsInput || !followsInput || !judgesInput) {
                alert('Setup form not found. Make sure you are on the setup screen.');
                return;
            }
            
            // Fill the inputs
            leadsInput.value = leads.join(', ');
            followsInput.value = follows.join(', ');
            judgesInput.value = judges.join(', ');
            
            // Start the game by making the API call directly
            const response = await fetch('/api/start_game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leads: leads.join(', '),
                    follows: follows.join(', '),
                    judges: judges.join(', ')
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to start game');
            }
            
            const data = await response.json();
            console.log('Game started:', data);
            
            // Store the session ID in both localStorage and the global variable
            localStorage.setItem('sessionId', data.session_id);
            window.sessionId = data.session_id;  // Set the global variable
            
            // Store other game data
            window.guestJudges = data.guest_judges;
            window.initialLeads = data.initial_leads;
            window.initialFollows = data.initial_follows;
            
            // Update UI for the first round
            const roundNumber = document.getElementById('round-number');
            const lead1Name = document.getElementById('lead1-name');
            const follow1Name = document.getElementById('follow1-name');
            const lead2Name = document.getElementById('lead2-name');
            const follow2Name = document.getElementById('follow2-name');
            const contestantJudgesList = document.getElementById('contestant-judges-list');
            
            if (roundNumber) roundNumber.textContent = data.round;
            if (lead1Name) lead1Name.textContent = data.pair_1[0];
            if (follow1Name) follow1Name.textContent = data.pair_1[1];
            if (lead2Name) lead2Name.textContent = data.pair_2[0];
            if (follow2Name) follow2Name.textContent = data.pair_2[1];
            if (contestantJudgesList) contestantJudgesList.textContent = data.contestant_judges.join(', ');
            
            // Show the round screen
            document.getElementById('setup-screen').classList.remove('active');
            document.getElementById('round-screen').classList.add('active');
            
            // Setup voting UI
            this.setupVotingUI();
            
            console.log('Battle started with random names');
        } catch (error) {
            console.error('Error starting battle:', error);
            alert(`Failed to start battle: ${error.message}`);
        }
    }
    
    // Helper method to setup voting UI
    setupVotingUI() {
        // Clear previous voting UI
        const leadJudgesContainer = document.getElementById('lead-judges-container');
        const followJudgesContainer = document.getElementById('follow-judges-container');
        
        if (leadJudgesContainer) leadJudgesContainer.innerHTML = '';
        if (followJudgesContainer) followJudgesContainer.innerHTML = '';
        
        const allJudges = [...window.guestJudges];
        
        // Get contestant judges from the text content and split by comma
        const contestantJudges = document.getElementById('contestant-judges-list').textContent.split(', ');
        allJudges.push(...contestantJudges);
        
        // Create lead voting UI
        allJudges.forEach(judge => {
            const isGuest = window.guestJudges.includes(judge);
            const judgeCard = this.createJudgeVotingCard(judge, isGuest, 'lead');
            if (leadJudgesContainer) leadJudgesContainer.appendChild(judgeCard);
        });
        
        // Create follow voting UI
        allJudges.forEach(judge => {
            const isGuest = window.guestJudges.includes(judge);
            const judgeCard = this.createJudgeVotingCard(judge, isGuest, 'follow');
            if (followJudgesContainer) followJudgesContainer.appendChild(judgeCard);
        });
    }
    
    // Helper method to create judge voting card
    createJudgeVotingCard(judgeName, isGuest, voteType) {
        const judgeCard = document.createElement('div');
        judgeCard.className = 'judge-card';
        judgeCard.id = `${voteType}-judge-${judgeName.replace(/\s+/g, '-').toLowerCase()}`;
        
        const judgeNameEl = document.createElement('div');
        judgeNameEl.className = 'judge-name';
        judgeNameEl.textContent = judgeName + (isGuest ? ' (Guest)' : '');
        
        const voteOptions = document.createElement('div');
        voteOptions.className = 'vote-options';
        
        const option1Name = voteType === 'lead' ? 
            document.getElementById('lead1-name').textContent : 
            document.getElementById('follow1-name').textContent;
        const option2Name = voteType === 'lead' ? 
            document.getElementById('lead2-name').textContent : 
            document.getElementById('follow2-name').textContent;
        
        // Option 1 button
        const option1Btn = document.createElement('button');
        option1Btn.className = 'vote-btn vote-option-1';
        option1Btn.textContent = option1Name;
        option1Btn.addEventListener('click', () => {
            if (window.votingLocked && window.votingLocked[voteType]) return;
            
            voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            option1Btn.classList.add('selected');
            this.recordVote(judgeName, 1, voteType);
            judgeCard.classList.add('voted');
        });
        
        // Option 2 button
        const option2Btn = document.createElement('button');
        option2Btn.className = 'vote-btn vote-option-2';
        option2Btn.textContent = option2Name;
        option2Btn.addEventListener('click', () => {
            if (window.votingLocked && window.votingLocked[voteType]) return;
            
            voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            option2Btn.classList.add('selected');
            this.recordVote(judgeName, 2, voteType);
            judgeCard.classList.add('voted');
        });
        
        // Add guest judge options if applicable
        if (isGuest) {
            // Tie button
            const tieBtn = document.createElement('button');
            tieBtn.className = 'vote-btn vote-option-3';
            tieBtn.textContent = 'Tie';
            tieBtn.addEventListener('click', () => {
                if (window.votingLocked && window.votingLocked[voteType]) return;
                
                voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
                    btn.classList.remove('selected');
                });
                tieBtn.classList.add('selected');
                this.recordVote(judgeName, 3, voteType);
                judgeCard.classList.add('voted');
            });
            
            // No Contest button
            const noContestBtn = document.createElement('button');
            noContestBtn.className = 'vote-btn vote-option-4';
            noContestBtn.textContent = 'No Contest';
            noContestBtn.addEventListener('click', () => {
                if (window.votingLocked && window.votingLocked[voteType]) return;
                
                voteOptions.querySelectorAll('.vote-btn').forEach(btn => {
                    btn.classList.remove('selected');
                });
                noContestBtn.classList.add('selected');
                this.recordVote(judgeName, 4, voteType);
                judgeCard.classList.add('voted');
            });
            
            voteOptions.appendChild(tieBtn);
            voteOptions.appendChild(noContestBtn);
        }
        
        voteOptions.appendChild(option1Btn);
        voteOptions.appendChild(option2Btn);
        
        judgeCard.appendChild(judgeNameEl);
        judgeCard.appendChild(voteOptions);
        
        return judgeCard;
    }
    
    // Helper method to record votes
    recordVote(judge, decision, voteType) {
        if (!window.leadVotes) window.leadVotes = {};
        if (!window.followVotes) window.followVotes = {};
        
        if (voteType === 'lead') {
            window.leadVotes[judge] = decision;
        } else {
            window.followVotes[judge] = decision;
        }
    }

    // Generate random votes for leads or follows
    async randomVotes(isLead) {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session. Please start a battle first.');
            return;
        }
        
        try {
            // Get current game state
            const response = await fetch(`/api/get_scores?session_id=${sessionId}`);
            if (!response.ok) {
                throw new Error('Failed to get game state');
            }
            
            const data = await response.json();
            console.log('Game state:', data);
            
            // Check if we're on the round screen
            const roundScreen = document.getElementById('round-screen');
            if (!roundScreen || !roundScreen.classList.contains('active')) {
                alert('Please navigate to the round screen first.');
                return;
            }
            
            // Get the voting container
            const container = document.getElementById(`${isLead ? 'lead' : 'follow'}-judges-container`);
            if (!container) {
                alert(`${isLead ? 'Lead' : 'Follow'} judges container not found.`);
                return;
            }
            
            // Get all judge cards
            const judgeCards = Array.from(container.querySelectorAll('.judge-card'));
            if (judgeCards.length === 0) {
                alert('No judge cards found.');
                return;
            }
            
            console.log(`Found ${judgeCards.length} judge cards for ${isLead ? 'leads' : 'follows'}`);
            
            // Initialize vote tracking if needed
            if (!window.leadVotes) window.leadVotes = {};
            if (!window.followVotes) window.followVotes = {};
            if (!window.votingLocked) window.votingLocked = { lead: false, follow: false };
            
            // Process each judge card sequentially
            for (let i = 0; i < judgeCards.length; i++) {
                const card = judgeCards[i];
                try {
                    const judgeName = card.querySelector('.judge-name').textContent.replace(' (Guest)', '');
                    console.log(`Processing judge ${i + 1}/${judgeCards.length}: ${judgeName}`);
                    
                    const buttons = Array.from(card.querySelectorAll('.vote-btn'));
                    console.log(`Found ${buttons.length} buttons for judge ${judgeName}`);
                    
                    if (buttons.length > 0) {
                        // For guest judges, we can click any button (1-4)
                        // For contestant judges, we can only click buttons 1-2
                        const isGuest = card.querySelector('.judge-name').textContent.includes('(Guest)');
                        const validButtons = isGuest ? buttons : buttons.slice(0, 2);
                        console.log(`Valid buttons for ${judgeName}: ${validButtons.length} (isGuest: ${isGuest})`);
                        
                        // Get a random button from the valid options
                        const randomButton = validButtons[Math.floor(Math.random() * validButtons.length)];
                        console.log(`Selected random button for ${judgeName}:`, randomButton.textContent);
                        
                        // Get the vote value based on the button's class and text content
                        let voteValue;
                        const classMatch = randomButton.className.match(/vote-option-(\d+)/);
                        if (classMatch) {
                            voteValue = parseInt(classMatch[1]);
                        } else {
                            // Fallback: determine vote value based on button text
                            const buttonText = randomButton.textContent.trim();
                            if (buttonText === 'Tie') {
                                voteValue = 3;
                            } else if (buttonText === 'No Contest') {
                                voteValue = 4;
                            } else {
                                // For contestant buttons, determine based on position
                                const buttonIndex = validButtons.indexOf(randomButton);
                                voteValue = buttonIndex + 1;
                            }
                        }
                        
                        console.log(`Determined vote value for ${judgeName}: ${voteValue}`);
                        
                        // Record the vote
                        if (isLead) {
                            window.leadVotes[judgeName] = voteValue;
                        } else {
                            window.followVotes[judgeName] = voteValue;
                        }
                        
                        // Update UI
                        randomButton.click();
                        console.log(`Clicked random vote for judge: ${judgeName} with value: ${voteValue}`);
                        
                        // Add a small delay between clicks to ensure proper UI updates
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } else {
                        console.warn(`No buttons found for judge ${judgeName}`);
                    }
                } catch (error) {
                    console.error(`Error processing judge card ${i + 1}/${judgeCards.length}:`, error);
                }
            }
            
            console.log(`Completed processing all ${judgeCards.length} judges`);
            
            // Find and click the determine winner button
            const determineButton = document.getElementById(`determine-${isLead ? 'lead' : 'follow'}-winner`);
            console.log('Looking for determine winner button:', {
                id: `determine-${isLead ? 'lead' : 'follow'}-winner`,
                found: !!determineButton,
                classes: determineButton ? determineButton.className : 'not found',
                disabled: determineButton ? determineButton.disabled : 'not found',
                visible: determineButton && !determineButton.classList.contains('hidden')
            });
            
            if (determineButton && !determineButton.classList.contains('hidden') && !determineButton.disabled) {
                console.log(`Clicking determine ${isLead ? 'lead' : 'follow'} winner button`);
                determineButton.click();
                
                // Wait for the voting to be processed
                let attempts = 0;
                const maxAttempts = 50; // 5 seconds total
                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (determineButton.classList.contains('hidden') || determineButton.disabled) {
                        console.log('Determine winner button hidden or disabled, voting processed successfully');
                        return true;
                    }
                    attempts++;
                }
                console.warn('Determine winner button still active after clicking. Voting may not have been processed.');
                return false;
            } else {
                console.log(`No determine winner button found or it's already processed for ${isLead ? 'leads' : 'follows'}`);
                return true;
            }
        } catch (error) {
            console.error(`Error randomly voting for ${isLead ? 'leads' : 'follows'}:`, error);
            alert(`Failed to generate random votes: ${error.message}`);
            return false;
        }
    }
    
    // Navigate to next round
    async nextRound() {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session. Please start a battle first.');
            return;
        }
        
        try {
            // Get a random song from the playlist
            const songUrl = await this.getRandomSongFromPlaylist();
            if (songUrl) {
                document.getElementById('song-input').value = songUrl;
            }

            // First, handle lead votes
            console.log('Handling lead votes...');
            const leadVotesProcessed = await this.randomVotes(true);
            if (!leadVotesProcessed) {
                console.warn('Lead votes may not have been processed completely');
                return;
            }
            
            // Then, handle follow votes
            console.log('Handling follow votes...');
            const followVotesProcessed = await this.randomVotes(false);
            if (!followVotesProcessed) {
                console.warn('Follow votes may not have been processed completely');
                return;
            }
            
            // Find and click the Next Round button
            const nextRoundButton = document.getElementById('next-round');
            if (nextRoundButton) {
                console.log('Clicking Next Round button...');
                nextRoundButton.click();
            } else {
                console.warn('Next Round button not found');
            }
        } catch (error) {
            console.error('Error in next round process:', error);
            alert(`Failed to complete next round process: ${error.message}`);
        }
    }

    addSection(title) {
        const section = document.createElement('div');
        section.style.marginBottom = '10px';
        
        const header = document.createElement('h3');
        header.textContent = title;
        header.style.cssText = `
            margin: 0 0 5px 0;
            font-size: 14px;
            color: #4CAF50;
        `;
        
        section.appendChild(header);
        this.panel.appendChild(section);
    }

    addButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            display: block;
            width: 100%;
            margin: 5px 0;
            padding: 5px;
            background: #333;
            color: white;
            border: 1px solid #4CAF50;
            border-radius: 3px;
            cursor: pointer;
        `;
        button.onclick = onClick;
        this.panel.appendChild(button);
    }

    togglePanel() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
        
        // Stop auto-advance when panel is hidden
        if (!this.isVisible) {
            this.stopAutoAdvance();
        }
    }

    async testSpotifyAPI() {
        try {
            const response = await fetch('/api/get_spotify_token');
            const data = await response.json();
            console.log('Spotify API Response:', data);
            alert('Spotify API test completed. Check console for details.');
        } catch (error) {
            console.error('Spotify API Test Error:', error);
            alert('Error testing Spotify API. Check console for details.');
        }
    }

    async testExport() {
        try {
            const sessionId = localStorage.getItem('sessionId');
            if (!sessionId) {
                alert('No active session found');
                return;
            }

            const response = await fetch(`/api/export_battle_data?session_id=${sessionId}&format=json`);
            const data = await response.json();
            console.log('Export Test Response:', data);
            alert('Export test completed. Check console for details.');
        } catch (error) {
            console.error('Export Test Error:', error);
            alert('Error testing export. Check console for details.');
        }
    }

    // Add auto-advance methods
    async getRandomSongFromPlaylist() {
        try {
            // Get Spotify access token
            const tokenResponse = await fetch('/api/get_spotify_token');
            const tokenData = await tokenResponse.json();
            const accessToken = tokenData.access_token;

            // Get playlist tracks
            const response = await fetch(`https://api.spotify.com/v1/playlists/${this.playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch playlist tracks');
            }

            const data = await response.json();
            const tracks = data.items;

            if (!tracks || tracks.length === 0) {
                throw new Error('No tracks found in playlist');
            }

            // Get a random track
            const randomTrack = tracks[Math.floor(Math.random() * tracks.length)].track;
            return `https://open.spotify.com/track/${randomTrack.id}`;
        } catch (error) {
            console.error('Error getting random song:', error);
            return null;
        }
    }

    async startAutoAdvance() {
        if (this.autoAdvanceInterval) {
            clearInterval(this.autoAdvanceInterval);
        }
        
        this.autoAdvanceInterval = setInterval(async () => {
            const nextRoundButton = document.getElementById('next-round');
            if (nextRoundButton && !nextRoundButton.disabled) {
                console.log('Auto-advancing to next round...');
                await this.nextRound();
            } else {
                console.log('Next round button not available or game finished');
                this.stopAutoAdvance();
            }
        }, this.autoAdvanceDelay);
    }

    stopAutoAdvance() {
        if (this.autoAdvanceInterval) {
            clearInterval(this.autoAdvanceInterval);
            this.autoAdvanceInterval = null;
        }
        this.autoAdvance = false;
    }
}

// Only initialize debug tools if enabled
if (window.ENABLE_DEBUG_TOOLS) {
    window.debugTools = new DebugTools();
} 