/**
 * Debug panel (Alt+Shift+D to enable, Alt+D to toggle): session inspection,
 * network logging, random-vote round simulation and auto-advance.
 *
 * No imports on purpose — this stays a classic script sharing global scope
 * with app.js until app.js itself is converted.
 */

interface NetworkLogEntry {
    url: string;
    method: string;
    timestamp: string;
    requestData?: BodyInit | null;
    duration?: number;
    status?: number;
    responseData?: unknown;
    error?: string;
}

interface StartGameDebugResponse {
    session_id: string;
    guest_judges: string[];
    initial_leads: string[];
    initial_follows: string[];
}

class DebugTools {
    isVisible: boolean;
    networkLogs: NetworkLogEntry[];
    autoAdvance: boolean;
    autoAdvanceInterval: number | null;
    autoAdvanceDelay: number;
    playlistId: string;
    panel!: HTMLDivElement;
    toggleButton!: HTMLButtonElement;

    constructor() {
        this.isVisible = false;
        this.networkLogs = [];
        this.autoAdvance = false;
        this.autoAdvanceInterval = null;
        this.autoAdvanceDelay = parseInt(localStorage.getItem('debug.autoAdvanceDelay') || '3000', 10);
        this.playlistId = localStorage.getItem('debug.playlistId') || '3S34wIELHX7T82ChgdU9NS';
        this.init();
        this.setupNetworkMonitoring();
        this.setupKeyboardShortcuts();
        this.restorePersistedToggles();
    }

    init(): void {
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
            width: 300px;
            max-width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        `;

        // Add a simple draggable header
        const headerBar = document.createElement('div');
        headerBar.textContent = 'Debug Tools';
        headerBar.style.cssText = `
            cursor: move;
            font-weight: bold;
            margin: -5px -5px 10px -5px;
            padding: 5px 8px;
            background: rgba(255,255,255,0.08);
            border-radius: 4px 4px 0 0;
        `;
        this.panel.appendChild(headerBar);

        this.makeDraggable(this.panel, headerBar);

        // Add resize handle (bottom-right corner)
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = `
            position: absolute;
            width: 12px;
            height: 12px;
            right: 6px;
            bottom: 6px;
            cursor: se-resize;
            border-right: 2px solid var(--primary-color);
            border-bottom: 2px solid var(--primary-color);
            opacity: 0.8;
        `;
        this.panel.appendChild(resizeHandle);
        this.makeResizable(this.panel, resizeHandle);

        // Restore saved position and size if available
        this.restorePanelPositionAndSize();

        // Create toggle button
        this.toggleButton = document.createElement('button');
        this.toggleButton.textContent = '🔧 Debug';
        this.toggleButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            padding: 8px 15px;
            background: var(--primary-color);
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

    setupNetworkMonitoring(): void {
        // Store original fetch
        const originalFetch = window.fetch;

        // Override fetch
        window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
            // Only monitor our API calls
            const url = args[0];
            if (typeof url === 'string' && url.startsWith('/api/')) {
                const startTime = Date.now();
                const request: NetworkLogEntry = {
                    url: url,
                    method: args[1]?.method || 'GET',
                    timestamp: new Date().toISOString(),
                    requestData: args[1]?.body,
                };

                try {
                    const response = await originalFetch(...args);
                    const endTime = Date.now();

                    // Clone response to read body
                    const clone = response.clone();
                    let responseData: unknown;
                    try {
                        responseData = await clone.json();
                    } catch {
                        try {
                            responseData = await clone.text();
                        } catch {
                            responseData = 'Could not read response body';
                        }
                    }

                    const logEntry: NetworkLogEntry = {
                        ...request,
                        duration: endTime - startTime,
                        status: response.status,
                        responseData,
                    };

                    this.networkLogs.push(logEntry);
                    console.log('Network Request:', logEntry);

                    return response;
                } catch (error) {
                    const logEntry: NetworkLogEntry = {
                        ...request,
                        error: (error as Error).message,
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

    addDebugTools(): void {
        // Session Info
        this.addSection('Session Info');
        this.addButton('Show Current Session', () => {
            const sessionId = localStorage.getItem('sessionId');
            const globalSession = window.sessionId || null;
            alert(`Current Session ID: ${sessionId || 'None'}\nGlobal: ${globalSession || 'None'}`);
        });

        this.addButton('Refresh Canonical State (console)', async () => {
            try {
                const sid = localStorage.getItem('sessionId');
                if (!sid) throw new Error('No sessionId');
                const resp = await fetch(`/api/state?session_id=${sid}`);
                const json = await resp.json();
                console.log('Canonical State:', json);
                alert('Canonical state logged to console');
            } catch (e) {
                alert(`Failed: ${(e as Error).message}`);
            }
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

        this.addButton('Copy Network Logs to Clipboard', async () => {
            try {
                await navigator.clipboard.writeText(JSON.stringify(this.networkLogs, null, 2));
                alert('Copied network logs to clipboard');
            } catch {
                alert('Clipboard copy failed');
            }
        });

        this.addButton('Download Network Logs (.json)', () => {
            const blob = new Blob([JSON.stringify(this.networkLogs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `network_logs_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            a.remove();
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
        // Simulate N Rounds controls
        const simulateContainer = document.createElement('div');
        simulateContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        `;
        const simulateLabel = document.createElement('span');
        simulateLabel.textContent = 'Simulate rounds:';
        simulateLabel.style.cssText = 'color: white; font-size: 12px;';
        const simulateInput = document.createElement('input');
        simulateInput.type = 'number';
        simulateInput.min = '1';
        simulateInput.max = '100';
        simulateInput.value = localStorage.getItem('debug.simRounds') || '5';
        simulateInput.style.cssText = `
            width: 60px;
            padding: 2px 4px;
            background: #444;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
        `;
        simulateInput.onchange = () => {
            const v = Math.max(1, Math.min(100, parseInt(simulateInput.value) || 1));
            simulateInput.value = String(v);
            localStorage.setItem('debug.simRounds', String(v));
        };

        // Checkbox: end game after simulation
        const endAfterContainer = document.createElement('label');
        endAfterContainer.style.cssText = 'display:flex; align-items:center; gap:6px; color:white; font-size:12px;';
        const endAfterChk = document.createElement('input');
        endAfterChk.type = 'checkbox';
        endAfterChk.checked = (localStorage.getItem('debug.simEndAfter') || 'false') === 'true';
        endAfterChk.onchange = () => localStorage.setItem('debug.simEndAfter', endAfterChk.checked ? 'true' : 'false');
        const endAfterLbl = document.createElement('span');
        endAfterLbl.textContent = 'end after';
        endAfterContainer.appendChild(endAfterChk);
        endAfterContainer.appendChild(endAfterLbl);

        const simulateBtn = document.createElement('button');
        simulateBtn.textContent = 'Run';
        simulateBtn.style.cssText = `
            padding: 4px 8px;
            background: #333;
            color: white;
            border: 1px solid var(--primary-color);
            border-radius: 3px;
            cursor: pointer;
        `;
        simulateBtn.onclick = async () => {
            const count = Math.max(1, Math.min(100, parseInt(simulateInput.value) || 1));
            await this.simulateNRounds(count);
            if (endAfterChk.checked) {
                await this.tryEndGame();
            }
        };
        simulateContainer.appendChild(simulateLabel);
        simulateContainer.appendChild(simulateInput);
        simulateContainer.appendChild(endAfterContainer);
        simulateContainer.appendChild(simulateBtn);
        this.panel.appendChild(simulateContainer);

        // Add Auto-Advance Toggle and Interval Setting
        const autoAdvanceContainer = document.createElement('div');
        autoAdvanceContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 5px;
            margin: 5px 0;
            padding: 5px;
            background: #333;
            border: 1px solid var(--primary-color);
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
            localStorage.setItem('debug.autoAdvance', this.autoAdvance ? 'true' : 'false');
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
        intervalInput.value = String(this.autoAdvanceDelay / 1000);
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
            intervalInput.value = String(newValue);
            localStorage.setItem('debug.autoAdvanceDelay', String(this.autoAdvanceDelay));

            // Restart auto-advance with new interval if it's running
            if (this.autoAdvance) {
                this.startAutoAdvance();
            }
        };

        intervalContainer.appendChild(intervalLabel);
        intervalContainer.appendChild(intervalInput);

        // Playlist input
        const playlistContainer = document.createElement('div');
        playlistContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 6px;
        `;
        const playlistLabel = document.createElement('span');
        playlistLabel.textContent = 'Spotify Playlist ID:';
        playlistLabel.style.cssText = 'color: white;';
        const playlistInput = document.createElement('input');
        playlistInput.type = 'text';
        playlistInput.value = this.playlistId;
        playlistInput.placeholder = 'e.g. 3S34w...';
        playlistInput.style.cssText = `
            width: 160px;
            padding: 2px 4px;
            background: #444;
            color: white;
            border: 1px solid #666;
            border-radius: 3px;
        `;
        playlistInput.onchange = () => {
            this.playlistId = (playlistInput.value || '').trim();
            localStorage.setItem('debug.playlistId', this.playlistId);
        };
        playlistContainer.appendChild(playlistLabel);
        playlistContainer.appendChild(playlistInput);

        autoAdvanceContainer.appendChild(toggleContainer);
        autoAdvanceContainer.appendChild(intervalContainer);
        autoAdvanceContainer.appendChild(playlistContainer);
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

    // Generate random names, ensuring uniqueness against a shared used set
    generateRandomNames(count: number, useGender: 'male' | 'female' | 'neutral', usedNamesGlobal: Set<string>): string[] {
        const maleFirstNames = ['James', 'Michael', 'David', 'John', 'Robert', 'William', 'Thomas', 'Daniel', 'Paul', 'Mark'];
        const femaleFirstNames = ['Sarah', 'Emily', 'Jessica', 'Jennifer', 'Elizabeth', 'Lauren', 'Michelle', 'Nicole', 'Amanda', 'Rachel'];
        const genderNeutralNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey'];

        const used = usedNamesGlobal instanceof Set ? usedNamesGlobal : new Set<string>();
        const sourceList = useGender === 'male' ? maleFirstNames : useGender === 'female' ? femaleFirstNames : genderNeutralNames;
        const available = sourceList.filter((n) => !used.has(n));
        if (available.length < count) {
            throw new Error('Not enough unique names available to satisfy request');
        }
        const selected: string[] = [];
        const pool = [...available];
        for (let i = 0; i < count; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            const name = pool.splice(idx, 1)[0];
            selected.push(name);
            used.add(name);
        }
        return selected;
    }

    // Fill the setup form with random names
    fillSetupForm(): void {
        const leadsInput = document.getElementById('lead-names') as HTMLInputElement | null;
        const followsInput = document.getElementById('follow-names') as HTMLInputElement | null;
        const judgesInput = document.getElementById('judge-names') as HTMLInputElement | null;

        if (!leadsInput || !followsInput || !judgesInput) {
            alert('Setup form not found. Make sure you are on the home screen.');
            return;
        }

        // Generate unique names across all groups
        const used = new Set<string>();
        const selectedLeads = this.generateRandomNames(8, 'male', used);
        const selectedFollows = this.generateRandomNames(8, 'female', used);
        const selectedJudges = this.generateRandomNames(2, 'neutral', used);

        // Fill inputs
        leadsInput.value = selectedLeads.join(', ');
        followsInput.value = selectedFollows.join(', ');
        judgesInput.value = selectedJudges.join(', ');

        console.log('Filled setup form with:', {
            leads: selectedLeads,
            follows: selectedFollows,
            judges: selectedJudges,
        });
    }

    // Helper method to shuffle an array
    shuffleArray<T>(array: T[]): T[] {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    // Start a battle with random names
    async startWithRandomNames(): Promise<void> {
        // Generate random names
        const used = new Set<string>();
        const leads = this.generateRandomNames(8, 'male', used);
        const follows = this.generateRandomNames(8, 'female', used);
        const judges = this.generateRandomNames(2, 'neutral', used);

        console.log('Generated names:', { leads, follows, judges });

        try {
            // Fill the setup form first
            const leadsInput = document.getElementById('lead-names') as HTMLInputElement | null;
            const followsInput = document.getElementById('follow-names') as HTMLInputElement | null;
            const judgesInput = document.getElementById('judge-names') as HTMLInputElement | null;

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
                    judges: judges.join(', '),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to start game');
            }

            const data = (await response.json()) as StartGameDebugResponse;
            console.log('Game started:', data);

            // Store the session ID
            localStorage.setItem('sessionId', data.session_id);
            // Set both the non-window global (app.js's top-level `let`, shared
            // classic-script scope) and the window fallback
            try {
                sessionId = data.session_id;
            } catch {
                /* app.js not loaded */
            }
            window.sessionId = data.session_id;
            if (typeof window.updateSessionIdDisplay === 'function') {
                window.updateSessionIdDisplay();
            }

            // Store other game data
            window.guestJudges = data.guest_judges;
            window.initialLeads = data.initial_leads;
            window.initialFollows = data.initial_follows;

            // Show battle screen and render canonical state reliably
            if (typeof window.showScreen === 'function') {
                const battleEl = document.getElementById('battle-screen');
                if (battleEl) window.showScreen(battleEl);
            } else {
                const setupEl = document.getElementById('setup-screen');
                const battleEl = document.getElementById('battle-screen');
                if (setupEl) setupEl.classList.remove('active');
                if (battleEl) battleEl.classList.add('active');
            }

            // Prefer direct state fetch to avoid relying on external globals
            try {
                const stateResp = await fetch(`/api/state?session_id=${data.session_id}`);
                if (stateResp.ok) {
                    const stateJson = await stateResp.json();
                    if (typeof window.renderFromState === 'function') {
                        window.renderFromState(stateJson);
                    }
                } else if (typeof window.refreshCanonicalState === 'function') {
                    await window.refreshCanonicalState();
                }
            } catch {
                if (typeof window.refreshCanonicalState === 'function') {
                    await window.refreshCanonicalState();
                }
            }

            console.log('Battle started with random names');
        } catch (error) {
            console.error('Error starting battle:', error);
            alert(`Failed to start battle: ${(error as Error).message}`);
        }
    }

    // Helper method to record votes
    recordVote(judge: string, decision: number, voteType: 'lead' | 'follow'): void {
        if (!window.leadVotes) window.leadVotes = {};
        if (!window.followVotes) window.followVotes = {};

        if (voteType === 'lead') {
            window.leadVotes[judge] = decision;
        } else {
            window.followVotes[judge] = decision;
        }
    }

    // Generate random votes for leads or follows
    async randomVotes(isLead: boolean): Promise<boolean | undefined> {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session. Please start a battle first.');
            return;
        }

        try {
            // Get current game state
            const effectiveSessionId = window.sessionId || sessionId || localStorage.getItem('sessionId');
            const response = await fetch(`/api/get_scores?session_id=${effectiveSessionId}`);
            if (!response.ok) {
                throw new Error('Failed to get game state');
            }

            const data = await response.json();
            console.log('Game state:', data);

            // Check if we're on the round screen
            const roundScreen = document.getElementById('battle-screen');
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

            // Get all judge rows
            const judgeCards = Array.from(container.querySelectorAll('.judge-row'));
            if (judgeCards.length === 0) {
                alert('No judge rows found.');
                return;
            }

            console.log(`Found ${judgeCards.length} judge rows for ${isLead ? 'leads' : 'follows'}`);

            // Initialize vote tracking if needed
            if (!window.leadVotes) window.leadVotes = {};
            if (!window.followVotes) window.followVotes = {};
            if (!window.votingLocked) window.votingLocked = { lead: false, follow: false };

            // Process each judge card sequentially
            for (let i = 0; i < judgeCards.length; i++) {
                const card = judgeCards[i];
                try {
                    const judgeName = (card.querySelector('.judge-name')?.textContent || '').replace(' (Guest)', '');
                    console.log(`Processing judge ${i + 1}/${judgeCards.length}: ${judgeName}`);

                    const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('.vote-chip'));
                    console.log(`Found ${buttons.length} buttons for judge ${judgeName}`);

                    if (buttons.length > 0) {
                        // For guest judges, we can click any button (1-4)
                        // For contestant judges, we can only click buttons 1-2
                        // In simple contestant judges mode, the proxy "Contestant Judges" has 3 options (1, Mixed, 2)
                        const isGuest = (card.querySelector('.judge-name')?.textContent || '').includes('(Guest)');
                        const isProxyContestantJudges = !isGuest && judgeName.trim() === 'Contestant Judges';
                        let validButtons = isGuest ? buttons : isProxyContestantJudges ? buttons.slice(0, 3) : buttons.slice(0, 2);
                        // Filter out disabled buttons - only pick from enabled options
                        validButtons = validButtons.filter((btn) => !btn.disabled && !btn.classList.contains('disabled'));
                        console.log(`Valid buttons for ${judgeName}: ${validButtons.length} (isGuest: ${isGuest})`);

                        if (validButtons.length === 0) {
                            console.warn(`No enabled buttons available for judge ${judgeName}, skipping`);
                            continue;
                        }

                        // Get a random button from the valid options
                        const randomButton = validButtons[Math.floor(Math.random() * validButtons.length)];
                        console.log(`Selected random button for ${judgeName}:`, randomButton.textContent);

                        // Get the vote value based on the button's class and text content
                        let voteValue: number;
                        const classMatch = randomButton.className.match(/vote-option-(\d+)/);
                        if (classMatch) {
                            voteValue = parseInt(classMatch[1]);
                        } else if (randomButton.className.includes('vote-option-mixed')) {
                            voteValue = 5;
                        } else {
                            // Fallback: determine vote value based on button text
                            const buttonText = (randomButton.textContent || '').trim();
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
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    } else {
                        console.warn(`No buttons found for judge ${judgeName}`);
                    }
                } catch (error) {
                    console.error(`Error processing judge card ${i + 1}/${judgeCards.length}:`, error);
                }
            }

            console.log(`Completed processing all ${judgeCards.length} judges`);

            // Find and click the determine winner button
            const determineButton = document.getElementById(
                `determine-${isLead ? 'lead' : 'follow'}-winner`,
            ) as HTMLButtonElement | null;
            console.log('Looking for determine winner button:', {
                id: `determine-${isLead ? 'lead' : 'follow'}-winner`,
                found: !!determineButton,
                classes: determineButton ? determineButton.className : 'not found',
                disabled: determineButton ? determineButton.disabled : 'not found',
                visible: determineButton && !determineButton.classList.contains('hidden'),
            });

            if (determineButton && !determineButton.classList.contains('hidden') && !determineButton.disabled) {
                console.log(`Clicking determine ${isLead ? 'lead' : 'follow'} winner button`);
                determineButton.click();

                // Wait for the voting to be processed
                let attempts = 0;
                const maxAttempts = 50; // 5 seconds total
                while (attempts < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
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
            alert(`Failed to generate random votes: ${(error as Error).message}`);
            return false;
        }
    }

    // Navigate to next round
    async nextRound(): Promise<void> {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session. Please start a battle first.');
            return;
        }

        try {
            // Get a random song from the playlist
            const songUrl = await this.getRandomSongFromPlaylist();
            if (songUrl) {
                const songInput = document.getElementById('song-input') as HTMLInputElement | null;
                if (songInput) songInput.value = songUrl;
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

            // Confirm + submit votes via modal (new flow auto-advances)
            const confirmBtn = document.getElementById('submit-votes') as HTMLButtonElement | null;
            if (confirmBtn && !confirmBtn.disabled) {
                console.log('Confirming votes...');
                const prevRound = (document.getElementById('round-number')?.textContent || '').trim();
                confirmBtn.click();

                // Wait for modal to appear
                await this.waitFor(() => {
                    const m = document.getElementById('vote-confirm-modal');
                    return !!m && !m.classList.contains('hidden');
                }, 5000);

                const modalSubmit = document.getElementById('vote-confirm-submit');
                if (modalSubmit) {
                    console.log('Submitting votes (modal)...');
                    modalSubmit.click();
                } else {
                    console.warn('Modal submit button not found');
                }

                // Wait for round to advance (or game to end)
                await this.waitFor(() => {
                    const rn = (document.getElementById('round-number')?.textContent || '').trim();
                    const battleActive = document.getElementById('battle-screen')?.classList.contains('active');
                    return !battleActive || !!(prevRound && rn && rn !== prevRound);
                }, 12000);
            } else {
                console.warn('Confirm button not available or disabled');
            }
        } catch (error) {
            console.error('Error in next round process:', error);
            alert(`Failed to complete next round process: ${(error as Error).message}`);
        }
    }

    // Determine if advancing to next round is possible from current UI state
    async canAdvance(): Promise<boolean> {
        const nextRoundButton = document.getElementById('next-round') as HTMLButtonElement | null;
        const submitBtn = document.getElementById('submit-votes') as HTMLButtonElement | null;
        // If neither submit nor next-round controls are present, likely finished or not on battle screen
        if (!submitBtn && !nextRoundButton) return false;
        // If next round button exists but is disabled and no submit button, we're likely finished
        if (nextRoundButton && nextRoundButton.disabled && !submitBtn) return false;
        return true;
    }

    async tryEndGame(): Promise<void> {
        try {
            if (typeof window.endGame === 'function') {
                window.endGame();
                return;
            }
        } catch {
            /* fall through to the API path */
        }
        try {
            const sid = window.sessionId || localStorage.getItem('sessionId');
            if (!sid) return;
            await fetch('/api/end_game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sid }),
            });
        } catch (e) {
            console.warn('Failed to end game via API:', e);
        }
    }

    // Simulate at most N rounds; stop early if game ends, and end the game explicitly
    async simulateNRounds(n: number): Promise<void> {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session. Please start a battle first.');
            return;
        }
        const total = Math.max(1, Math.min(100, n | 0));
        for (let i = 0; i < total; i++) {
            // If cannot advance, end the game
            if (!(await this.canAdvance())) {
                console.log('Game appears finished before reaching target rounds. Ending game.');
                await this.tryEndGame();
                break;
            }
            console.log(`Simulating round ${i + 1} of ${total}...`);
            await this.nextRound();
            // Small pause to allow UI/state to settle
            await new Promise((r) => setTimeout(r, 300));
            // If after running this round we cannot advance further, end game and stop
            if (!(await this.canAdvance())) {
                console.log('Game finished early during simulation. Ending game.');
                await this.tryEndGame();
                break;
            }
        }
    }

    addSection(title: string): void {
        const section = document.createElement('div');
        section.style.marginBottom = '10px';

        const header = document.createElement('h3');
        header.textContent = title;
        header.style.cssText = `
            margin: 0 0 5px 0;
            font-size: 14px;
            color: var(--primary-color);
        `;

        section.appendChild(header);
        this.panel.appendChild(section);
    }

    addButton(text: string, onClick: () => void): void {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            display: block;
            width: 100%;
            margin: 5px 0;
            padding: 5px;
            background: #333;
            color: white;
            border: 1px solid var(--primary-color);
            border-radius: 3px;
            cursor: pointer;
        `;
        button.onclick = onClick;
        this.panel.appendChild(button);
    }

    togglePanel(): void {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';

        // Stop auto-advance when panel is hidden
        if (!this.isVisible) {
            this.stopAutoAdvance();
        }
    }

    async testSpotifyAPI(): Promise<void> {
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

    async testExport(): Promise<void> {
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
    async getRandomSongFromPlaylist(): Promise<string | null> {
        try {
            // Get Spotify access token
            const tokenResponse = await fetch('/api/get_spotify_token');
            const tokenData = (await tokenResponse.json()) as { access_token?: string };
            const accessToken = tokenData.access_token;

            // Get playlist tracks
            const response = await fetch(`https://api.spotify.com/v1/playlists/${this.playlistId}/tracks`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch playlist tracks');
            }

            const data = (await response.json()) as { items?: Array<{ track: { id: string } }> };
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

    async startAutoAdvance(): Promise<void> {
        if (this.autoAdvanceInterval) {
            clearInterval(this.autoAdvanceInterval);
        }

        this.autoAdvanceInterval = window.setInterval(async () => {
            const nextRoundButton = document.getElementById('next-round');
            const submitBtn = document.getElementById('submit-votes');
            // Only attempt if UI seems ready for a new iteration
            if (nextRoundButton && submitBtn) {
                console.log('Auto-advancing to next round...');
                await this.nextRound();
            } else {
                console.log('Controls not available or game finished');
                this.stopAutoAdvance();
            }
        }, this.autoAdvanceDelay);
    }

    stopAutoAdvance(): void {
        if (this.autoAdvanceInterval) {
            clearInterval(this.autoAdvanceInterval);
            this.autoAdvanceInterval = null;
        }
        this.autoAdvance = false;
    }

    // Utility: wait for a condition with timeout
    async waitFor(conditionFn: () => boolean, timeoutMs = 5000, pollMs = 100): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                if (conditionFn()) return true;
            } catch {
                /* condition not ready yet */
            }
            await new Promise((r) => setTimeout(r, pollMs));
        }
        return false;
    }

    // Persisted settings on load
    restorePersistedToggles(): void {
        const savedAuto = localStorage.getItem('debug.autoAdvance');
        if (savedAuto === 'true') {
            this.autoAdvance = true;
            setTimeout(() => this.startAutoAdvance(), 100);
        }
    }

    // Simple draggable behavior
    makeDraggable(element: HTMLElement, handle: HTMLElement): void {
        let isDragging = false;
        let startX = 0,
            startY = 0,
            startLeft = 0,
            startTop = 0;
        const onMouseDown = (e: MouseEvent) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${startLeft + dx}px`;
            element.style.top = `${startTop + dy}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            element.style.position = 'fixed';
        };
        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Persist position
            try {
                const rect = element.getBoundingClientRect();
                localStorage.setItem('debug.panel.left', String(rect.left));
                localStorage.setItem('debug.panel.top', String(rect.top));
            } catch {
                /* private mode */
            }
        };
        handle.addEventListener('mousedown', onMouseDown);
    }

    makeResizable(element: HTMLElement, handle: HTMLElement): void {
        let isResizing = false;
        let startX = 0,
            startY = 0,
            startWidth = 0,
            startHeight = 0;
        const onMouseDown = (e: MouseEvent) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newWidth = Math.max(220, Math.min(window.innerWidth * 0.95, startWidth + dx));
            const newHeight = Math.max(160, Math.min(window.innerHeight * 0.9, startHeight + dy));
            element.style.width = `${newWidth}px`;
            element.style.maxWidth = `${Math.ceil(window.innerWidth * 0.95)}px`;
            element.style.height = `${newHeight}px`;
            element.style.maxHeight = `${Math.ceil(window.innerHeight * 0.9)}px`;
        };
        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Persist size
            try {
                const rect = element.getBoundingClientRect();
                localStorage.setItem('debug.panel.width', String(rect.width));
                localStorage.setItem('debug.panel.height', String(rect.height));
            } catch {
                /* private mode */
            }
        };
        handle.addEventListener('mousedown', onMouseDown);
    }

    restorePanelPositionAndSize(): void {
        try {
            const left = parseFloat(localStorage.getItem('debug.panel.left') || '');
            const top = parseFloat(localStorage.getItem('debug.panel.top') || '');
            const width = parseFloat(localStorage.getItem('debug.panel.width') || '');
            const height = parseFloat(localStorage.getItem('debug.panel.height') || '');
            if (!Number.isNaN(left) && !Number.isNaN(top)) {
                this.panel.style.left = `${left}px`;
                this.panel.style.top = `${top}px`;
                this.panel.style.right = 'auto';
                this.panel.style.bottom = 'auto';
                this.panel.style.position = 'fixed';
            }
            if (!Number.isNaN(width)) {
                this.panel.style.width = `${width}px`;
            }
            if (!Number.isNaN(height)) {
                this.panel.style.height = `${height}px`;
            }
        } catch {
            /* private mode */
        }
    }

    // Keyboard shortcuts for convenience
    setupKeyboardShortcuts(): void {
        window.addEventListener('keydown', async (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea') return;
            if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                this.togglePanel();
            }
            if (e.altKey && (e.key === 'a' || e.key === 'A')) {
                this.autoAdvance = !this.autoAdvance;
                localStorage.setItem('debug.autoAdvance', this.autoAdvance ? 'true' : 'false');
                if (this.autoAdvance) this.startAutoAdvance();
                else this.stopAutoAdvance();
            }
            if (e.altKey && (e.key === 'n' || e.key === 'N')) {
                await this.nextRound();
            }
        });
    }
}

// Only initialize debug tools if enabled
if (window.ENABLE_DEBUG_TOOLS) {
    window.debugTools = new DebugTools();
}

// Expose class on window for runtime enabling
window.DebugTools = window.DebugTools || DebugTools;
