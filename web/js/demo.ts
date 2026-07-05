/**
 * Guided demo mode: a step-by-step overlay walking through setup, voting,
 * and the battle graphic with pre-filled sample data.
 *
 * app.js calls initDemo() once the DOM is ready (passing the reset callback
 * the exit path needs) and notifies progress via demoActionCompleted() /
 * currentDemoAction(). Screen switching goes through window.showScreen.
 */

export type DemoAction = 'wait-for-start' | 'wait-for-lead-vote' | 'wait-for-follow-vote' | 'wait-for-submit';

interface DemoStep {
    title: string;
    content: string;
    screen?: 'setup' | 'battle' | 'results';
    target?: string;
    position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
    action?: DemoAction;
}

const DEMO_STEPS: DemoStep[] = [
    {
        title: "Welcome to Hustle n' Tussle!",
        content:
            "This guided demo will walk you through setting up and running a dance battle. We've pre-filled some sample data so you can try the full flow. Click Next to get started.",
        screen: 'setup',
        position: 'center',
    },
    {
        title: 'Lead & Follow Names',
        content:
            "Enter the names of your lead and follow dancers, separated by commas. We've filled in 4 of each for this demo.",
        screen: 'setup',
        target: '#lead-names',
        position: 'bottom',
    },
    {
        title: 'Guest Judges',
        content:
            "Guest judges award 2 points per vote and can vote Tie or No Contest. We've added 2 judges for this demo.",
        screen: 'setup',
        target: '#judge-names',
        position: 'bottom',
    },
    {
        title: 'Contestant Judging',
        content:
            'When enabled, non-competing dancers also judge (1 point each). Simple mode lets them vote as a single group. Try toggling these options!',
        screen: 'setup',
        target: '#simple-contestant-judges',
        position: 'bottom',
    },
    {
        title: 'Points to Win',
        content:
            "Set the threshold to win. Default is 7 points. Auto-calculate uses (contestants - 1). For this quick demo, we'll use a low value.",
        screen: 'setup',
        target: '#points-to-win-mode',
        position: 'bottom',
    },
    {
        title: 'Start the Competition',
        content: 'Everything looks good! Click "Start Competition" to begin the battle.',
        screen: 'setup',
        target: '#start-competition',
        position: 'top',
        action: 'wait-for-start',
    },
    {
        title: 'The Matchup',
        content:
            'Two pairs are competing. Pair 1 vs Pair 2 — each has a lead and a follow. Judges vote on leads and follows separately.',
        screen: 'battle',
        target: '#current-matchup',
        position: 'bottom',
    },
    {
        title: 'Cast Your Lead Votes',
        content:
            'Each judge votes for who danced better as a lead. Guest judges can also vote Tie or No Contest. Try casting a vote now!',
        screen: 'battle',
        target: '#lead-voting',
        position: 'bottom',
        action: 'wait-for-lead-vote',
    },
    {
        title: 'Cast Your Follow Votes',
        content:
            'Now vote for the follows. Same rules apply — guest judges get Tie/NC options, contestant judges must pick a winner.',
        screen: 'battle',
        target: '#follow-voting',
        position: 'top',
        action: 'wait-for-follow-vote',
    },
    {
        title: 'Submit Your Votes',
        content:
            'Once all judges have voted for both leads and follows, click "Confirm Votes" to submit. The round results will appear and the next round starts automatically.',
        screen: 'battle',
        target: '#submit-votes',
        position: 'top',
        action: 'wait-for-submit',
    },
    {
        title: 'Round 2 — Try the Mixed Vote',
        content:
            'Now try this: have one guest judge vote Tie or No Contest for a lead, while the other guest judge picks a winner. When you do, the "Mixed" button will appear on the contestant judge row — use it when contestants are split (not unanimously voting for one dancer).',
        screen: 'battle',
        target: '#lead-voting',
        position: 'bottom',
        action: 'wait-for-lead-vote',
    },
    {
        title: 'Finish Round 2 Follows',
        content: 'Cast the follow votes for round 2 as well.',
        screen: 'battle',
        target: '#follow-voting',
        position: 'top',
        action: 'wait-for-follow-vote',
    },
    {
        title: 'Submit Round 2',
        content: 'Submit your votes to see the results and battle graphic update.',
        screen: 'battle',
        target: '#submit-votes',
        position: 'top',
        action: 'wait-for-submit',
    },
    {
        title: 'The Battle Graphic',
        content:
            "The battle graphic shows each dancer's score progression across rounds. It updates in real-time as you submit votes. This is also visible in Display Mode for audiences.",
        screen: 'battle',
        target: '.scores-display',
        position: 'left',
    },
    {
        title: 'Demo Complete!',
        content:
            'You now know the basics of running a Hustle n\' Tussle battle. You can continue exploring this demo battle, or exit to start a real one. Have fun!',
        screen: 'battle',
        position: 'center',
    },
];

let demoMode = false;
let demoStep = 0;
let demoOverlay: HTMLElement | null = null;
let demoWaitingForAction = false; // True when waiting for user interaction before enabling Next
let resetAndGoHomeFn: (() => void) | null = null;

export function isDemoActive(): boolean {
    return demoMode;
}

/** The action the current demo step is waiting on, or null when not applicable. */
export function currentDemoAction(): DemoAction | null {
    if (!demoMode) return null;
    return DEMO_STEPS[demoStep]?.action ?? null;
}

/** Notify the demo that a waited-on action happened; advances if it matches. */
export function demoActionCompleted(action: DemoAction): void {
    if (currentDemoAction() === action) enableDemoNextButton();
}

function byId(id: string): HTMLElement | null {
    return document.getElementById(id);
}

function setInputValue(id: string, value: string): void {
    const el = byId(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (el) el.value = value;
}

function startDemo(): void {
    demoMode = true;
    demoStep = 0;

    // Pre-fill setup form with sample data
    const setupScreen = byId('setup-screen');
    if (setupScreen) window.showScreen?.(setupScreen);
    setInputValue('lead-names', 'Alex, Blake, Casey, Dana');
    setInputValue('follow-names', 'Jordan, Morgan, Riley, Skyler');
    setInputValue('judge-names', 'Sam, Pat');
    const contestantJudgingToggle = byId('contestant-judging-toggle') as HTMLInputElement | null;
    if (contestantJudgingToggle) contestantJudgingToggle.checked = true;
    const simpleContestantJudges = byId('simple-contestant-judges') as HTMLInputElement | null;
    if (simpleContestantJudges) {
        simpleContestantJudges.checked = true;
        simpleContestantJudges.disabled = false;
    }
    // Set points to win to custom low value for quick demo
    const pointsToWinModeSelect = byId('points-to-win-mode') as HTMLSelectElement | null;
    if (pointsToWinModeSelect) {
        pointsToWinModeSelect.value = 'custom';
        const customPointsContainer = byId('custom-points-container');
        if (customPointsContainer) customPointsContainer.style.display = '';
        setInputValue('points-to-win', '3');
        const helper = byId('points-to-win-helper');
        if (helper) helper.textContent = 'First contestant to reach 3 points wins.';
    }

    createDemoOverlay();
    showDemoStep(0);
}

function createDemoOverlay(): void {
    // Remove existing if any
    removeDemoOverlay();

    demoOverlay = document.createElement('div');
    demoOverlay.id = 'demo-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'demo-backdrop';
    backdrop.addEventListener('click', (e) => e.stopPropagation());
    demoOverlay.appendChild(backdrop);

    const hint = document.createElement('div');
    hint.className = 'demo-hint';
    hint.id = 'demo-hint';
    demoOverlay.appendChild(hint);

    document.body.appendChild(demoOverlay);
}

function removeDemoOverlay(): void {
    if (demoOverlay) {
        demoOverlay.remove();
        demoOverlay = null;
    }
    // Clean up any highlights
    document.querySelectorAll('.demo-highlight').forEach((el) => el.classList.remove('demo-highlight'));
}

function showDemoStep(index: number): void {
    demoStep = index;
    const step = DEMO_STEPS[index];
    if (!step) return;

    // Switch to the correct screen if needed
    if (step.screen) {
        const screenIds = { setup: 'setup-screen', battle: 'battle-screen', results: 'results-screen' };
        const targetScreen = byId(screenIds[step.screen]);
        if (targetScreen) {
            const activeScreen = document.querySelector('.screen.active');
            if (activeScreen !== targetScreen) {
                window.showScreen?.(targetScreen);
            }
        }
    }

    const hint = byId('demo-hint');
    if (!hint) return;

    // Clear old highlights
    document.querySelectorAll('.demo-highlight').forEach((el) => el.classList.remove('demo-highlight'));

    // Check if this step has a wait-for action
    const isInteractive = !!step.action;
    demoWaitingForAction = isInteractive;

    // Show/hide backdrop: hide on interactive steps so user can interact with the page
    const backdrop = demoOverlay ? demoOverlay.querySelector<HTMLElement>('.demo-backdrop') : null;
    if (backdrop) {
        backdrop.style.display = isInteractive ? 'none' : '';
    }

    // Build hint content
    const totalSteps = DEMO_STEPS.length;
    const isFirst = index === 0;
    const isLast = index === totalSteps - 1;

    hint.innerHTML = `
        <div class="demo-hint-drag-handle">
            <div class="demo-hint-step">Step ${index + 1} of ${totalSteps}</div>
            <span class="demo-drag-icon">⠿</span>
        </div>
        <h4>${step.title}</h4>
        <p>${step.content}</p>
        <div class="demo-hint-actions">
            <button class="btn secondary" id="demo-exit-btn">Exit Demo</button>
            ${!isFirst ? '<button class="btn secondary" id="demo-prev-btn">Previous</button>' : ''}
            ${isLast
                ? '<button class="btn primary" id="demo-finish-btn">Finish</button>'
                : (isInteractive ? '' : '<button class="btn primary" id="demo-next-btn">Next</button>')
            }
        </div>
    `;

    // Position the hint
    positionDemoHint(step);

    // Make hint draggable
    makeDemoHintDraggable(hint);

    // Wire up buttons
    const exitBtn = byId('demo-exit-btn');
    const prevBtn = byId('demo-prev-btn');
    const nextBtn = byId('demo-next-btn');
    const finishBtn = byId('demo-finish-btn');

    if (exitBtn) exitBtn.addEventListener('click', exitDemo);
    if (prevBtn) prevBtn.addEventListener('click', () => showDemoStep(demoStep - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => showDemoStep(demoStep + 1));
    if (finishBtn) finishBtn.addEventListener('click', exitDemo);
}

function positionDemoHint(step: DemoStep): void {
    const hint = byId('demo-hint');
    if (!hint) return;

    // Remove any old arrow
    const oldArrow = hint.querySelector('.demo-arrow');
    if (oldArrow) oldArrow.remove();

    if (!step.target || step.position === 'center') {
        // Center the hint on screen
        hint.style.top = '50%';
        hint.style.left = '50%';
        hint.style.transform = 'translate(-50%, -50%)';
        return;
    }

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
        // Fallback to center
        hint.style.top = '50%';
        hint.style.left = '50%';
        hint.style.transform = 'translate(-50%, -50%)';
        return;
    }

    // Highlight the target
    targetEl.classList.add('demo-highlight');

    // Scroll target into view
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Wait a tick for scroll to settle, then position
    requestAnimationFrame(() => {
        const rect = targetEl.getBoundingClientRect();
        const hintRect = hint.getBoundingClientRect();
        const margin = 16;

        hint.style.transform = '';
        let top: number, left: number;

        switch (step.position) {
            case 'bottom':
                top = rect.bottom + margin;
                left = rect.left + rect.width / 2 - hintRect.width / 2;
                break;
            case 'top':
                top = rect.top - hintRect.height - margin;
                left = rect.left + rect.width / 2 - hintRect.width / 2;
                break;
            case 'left':
                top = rect.top + rect.height / 2 - hintRect.height / 2;
                left = rect.left - hintRect.width - margin;
                break;
            case 'right':
                top = rect.top + rect.height / 2 - hintRect.height / 2;
                left = rect.right + margin;
                break;
            default:
                top = rect.bottom + margin;
                left = rect.left;
        }

        // Clamp to viewport
        left = Math.max(8, Math.min(left, window.innerWidth - hintRect.width - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - hintRect.height - 8));

        hint.style.top = top + 'px';
        hint.style.left = left + 'px';

        // Add arrow
        const arrow = document.createElement('div');
        arrow.className = 'demo-arrow';
        switch (step.position) {
            case 'bottom': arrow.classList.add('demo-arrow--bottom'); break;
            case 'top': arrow.classList.add('demo-arrow--top'); break;
            case 'left': arrow.classList.add('demo-arrow--left'); break;
            case 'right': arrow.classList.add('demo-arrow--right'); break;
        }
        hint.appendChild(arrow);
    });
}

function makeDemoHintDraggable(hint: HTMLElement): void {
    const handle = hint.querySelector<HTMLElement>('.demo-hint-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function onPointerDown(e: PointerEvent): void {
        // Don't drag if clicking a button
        if (e.target instanceof Element && e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = hint.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        hint.style.transform = '';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        e.preventDefault();
    }

    function onPointerMove(e: PointerEvent): void {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        hint.style.left = (startLeft + dx) + 'px';
        hint.style.top = (startTop + dy) + 'px';
        // Remove arrow when user manually moves the hint
        const arrow = hint.querySelector('.demo-arrow');
        if (arrow) arrow.remove();
    }

    function onPointerUp(): void {
        isDragging = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    }

    handle.addEventListener('pointerdown', onPointerDown);
}

function enableDemoNextButton(): void {
    if (!demoMode || !demoWaitingForAction) return;
    demoWaitingForAction = false;
    // Auto-advance to the next step
    showDemoStep(demoStep + 1);
}

function exitDemo(): void {
    demoMode = false;
    demoStep = 0;
    demoWaitingForAction = false;
    removeDemoOverlay();
    resetAndGoHomeFn?.();
}

/** Wire the "Try Demo" button; call once the DOM is ready. */
export function initDemo(deps: { resetAndGoHome: () => void }): void {
    resetAndGoHomeFn = deps.resetAndGoHome;
    const tryDemoBtn = byId('try-demo');
    if (tryDemoBtn) {
        tryDemoBtn.addEventListener('click', startDemo);
    }
}
