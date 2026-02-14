# UI/UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full UI/UX redesign with dual-theme system — "Clean Competition" (admin) and "Neon Arena" (display mode) — plus UX improvements (toasts, loading states, smooth transitions, mobile optimization).

**Architecture:** CSS-only theming via `data-theme` attribute on `<html>`. Admin theme is default; display mode auto-detects via URL params and applies Neon Arena. HTML structure updated in `index.html` for new component patterns. JS updated in `app.js` for dynamic HTML generation, toast system, and loading states.

**Tech Stack:** Vanilla CSS3 (custom properties), vanilla JS (ES6+), Google Fonts (DM Sans, DM Mono, Space Grotesk, Inter)

**Design doc:** `docs/plans/2026-02-14-ui-ux-redesign-design.md`
**Mockup references:** `mockups/neon-arena.html`, `mockups/clean-competition.html`

---

## Task 1: CSS Foundation — Design Tokens & Base Styles

**Files:**
- Rewrite: `web/css/styles.css` (currently 2334 lines — full rewrite)
- Delete: `web/css/style.css` (174 lines, legacy duplicate)
- Delete: `web/styles.css` (20 lines, unused)

**Step 1: Delete legacy CSS files**

```bash
rm web/css/style.css web/styles.css
```

**Step 2: Add Google Fonts to `web/index.html`**

Replace the existing `<link rel="stylesheet">` in the `<head>` (line 7) with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/styles.css?v={{ config.ASSET_VERSION }}">
```

**Step 3: Write new CSS design tokens and base styles**

Rewrite `web/css/styles.css` starting with the design token system. Include:

1. **`:root`** — Admin (Clean Competition) tokens as default:
   - Colors: `--bg: #f5f5f7`, `--bg-surface: #fff`, `--bg-card: #fff`, `--accent: #1d4ed8`, etc.
   - Typography: `--font-display: 'DM Sans', sans-serif`, `--font-body: 'DM Sans', sans-serif`, `--font-mono: 'DM Mono', monospace`
   - Spacing: `--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 16px`, `--space-lg: 24px`, `--space-xl: 32px`
   - Radius: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`
   - Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

2. **`[data-theme="display"]`** — Neon Arena overrides:
   - Dark backgrounds, purple/pink accent, glow effects
   - Typography: `--font-display: 'Space Grotesk', sans-serif`, `--font-body: 'Inter', sans-serif`
   - No shadows, glow instead: `--glow-accent: 0 0 30px rgba(124,58,237,0.3)`

3. **Base reset and body styles** using the tokens
4. **Utility classes**: `.hidden`, screen transitions (`.screen` with opacity/transform transitions)

**Step 4: Run the dev server and verify base loads**

```bash
python web/app.py
```

Open `http://localhost:5000` — verify the page loads with the new font and base colors. It will look broken (component styles missing) — that's expected.

**Step 5: Commit**

```bash
git add web/css/styles.css web/index.html
git rm web/css/style.css web/styles.css
git commit -m "feat(ui): add design token system and Google Fonts, remove legacy CSS"
```

---

## Task 2: CSS Components — Navigation, Buttons, Forms

**Files:**
- Modify: `web/css/styles.css` (append component styles)

**Step 1: Add navigation bar styles**

Append to `web/css/styles.css`:
- `.nav-bar` — flex row, white bg, border, border-radius, shadow
- `.nav-bar .brand` — font-weight 700, flex with green dot
- `.nav-pills` — flex row of pill buttons
- `.nav-pill` / `.nav-pill.active` — rounded, accent bg when active
- Display theme overrides: dark bg, no shadow

**Step 2: Add button styles**

- `.btn` — base button: padding 12px 24px, border-radius 8px, font-weight 600, 44px min-height (touch target)
- `.btn.primary` — accent bg, white text
- `.btn.secondary` — transparent bg, border, text color
- `.btn.warning` — danger color
- `.btn.large` — larger padding, bigger font
- `.btn:disabled` — opacity 0.4, no pointer
- `.btn.loading` — spinner via CSS `::after` pseudo-element (rotating border)
- Display theme overrides: gradient bg, glow effects

**Step 3: Add form styles**

- `.form-group` — margin-bottom with label styling
- `textarea`, `input`, `select` — consistent border, padding, border-radius, focus ring
- `.file-upload-wrapper` — custom file input
- Display theme overrides: dark inputs

**Step 4: Verify navigation and forms render**

Open setup screen — forms should look styled. Navigation bar won't show yet (HTML not added).

**Step 5: Commit**

```bash
git add web/css/styles.css
git commit -m "feat(ui): add nav, button, and form component styles"
```

---

## Task 3: CSS Components — Cards, Matchup, Judge Rows, Leaderboard

**Files:**
- Modify: `web/css/styles.css` (append)

**Step 1: Add matchup card styles**

- `.matchup-card` — flex row, white bg, rounded, shadow, overflow hidden
- `.matchup-side` — flex 1, centered text, padding
- `.matchup-divider` — narrow center strip with "VS" text
- `.dancer-name` — 20px bold
- `.dancer-score` — pill badge with accent-light bg
- Mobile: flex-direction column
- Display: dark card, gradient border-top, glowing VS

**Step 2: Add judge row styles**

- `.judge-section` — margin-bottom, with header and list
- `.judge-section-header` — flex between label and count badge
- `.judge-row` — flex row: avatar + name + vote chips
- `.judge-row.voted` — accent left border, tinted bg, filled avatar
- `.avatar` — 36px circle, initials, accent-light bg
- `.vote-chips` — flex row of chip buttons
- `.vote-chip` / `.vote-chip.selected` — bordered pill, accent bg when selected, scale 1.02
- `.vote-chip.tie-chip` — dashed border
- `.vote-chip.nc-chip` — muted text
- Mobile: vote chips wrap below name

**Step 3: Add standings mini-leaderboard styles**

- `.standings-card` — card with heading
- `.standings-row` — flex row: rank + name + progress bar + points
- `.bar-track` / `.bar-track .fill` — thin progress bar
- First row rank gets accent color

**Step 4: Add modal styles** (update existing)

- `.modal-overlay` — dark backdrop
- `.modal` — white card, shadow, max-width 720px
- `.modal-header`, `.modal-body`, `.modal-footer` — sections
- Display: dark modal

**Step 5: Commit**

```bash
git add web/css/styles.css
git commit -m "feat(ui): add matchup, judge row, leaderboard, and modal styles"
```

---

## Task 4: CSS Components — Screens, Transitions, Toast, Display Mode

**Files:**
- Modify: `web/css/styles.css` (append)

**Step 1: Add screen layout styles**

- `.container` — max-width 880px, centered, padding
- `.screen` — hidden by default (opacity 0, display none)
- `.screen.active` — visible (opacity 1, display block, fade transition 300ms)
- Home screen: centered welcome + action buttons
- Upload screen: file upload zone
- Setup screen: form layout
- Battle screen: round header + voting + leaderboard
- Results screen: final leaderboards + accordion

**Step 2: Add toast notification styles**

- `.toast-container` — fixed bottom center, flex column, gap 8px, z-index 9999
- `.toast` — padding, border-radius, shadow, slide-up animation
- `.toast.success` — green left border
- `.toast.error` — red left border
- `.toast.info` — blue left border
- `@keyframes toastIn` — translateY(100%) to 0
- `@keyframes toastOut` — opacity 1 to 0, translateY to 20px

**Step 3: Add display mode enhancements**

- `[data-theme="display"] .container` — max-width 1200px
- `[data-theme="display"]` font-size scaling (1.15em base)
- Round transition overlay styles (full-screen, animated round number)
- Background gradient animation for display mode
- Staggered fade-in keyframes

**Step 4: Add responsive breakpoints**

- `@media (max-width: 640px)` — mobile layouts:
  - Matchup stacks vertical
  - Judge rows wrap
  - Vote chips 2x2 grid
  - Submit button sticky bottom
  - Nav pills hidden
- `@media (min-width: 1024px)` — tablet refinements
- `@media (min-width: 1400px)` — large display scaling

**Step 5: Add accordion styles for results**

- `.accordion-item` — border, border-radius
- `.accordion-header` — clickable, flex between, padding
- `.accordion-content` — max-height transition (0 → auto via JS class)
- `.accordion-content.open` — expanded state

**Step 6: Commit**

```bash
git add web/css/styles.css
git commit -m "feat(ui): add screen layouts, toast, display mode, responsive styles"
```

---

## Task 5: HTML Restructure — Navigation, Home, Upload, Setup Screens

**Files:**
- Modify: `web/index.html`

**Step 1: Add toast container and navigation bar**

After `<body>` tag (line 9), before the container div, add:

```html
<div id="toast-container" class="toast-container"></div>
```

Replace the header block (lines 12-15) and theme/spotify toggle buttons (lines 17-22) with:

```html
<nav class="nav-bar" id="nav-bar">
    <div class="brand">
        <span class="dot"></span>
        Hustle n' Tussle
    </div>
    <div class="nav-pills">
        <button class="nav-pill" data-screen="setup-screen">Setup</button>
        <button class="nav-pill active" data-screen="battle-screen">Battle</button>
        <button class="nav-pill" data-screen="results-screen">Results</button>
    </div>
</nav>
```

**Step 2: Update home screen markup** (lines 24-33)

Replace with cleaner centered layout:

```html
<div id="home-screen" class="screen active">
    <div class="home-hero">
        <h1 class="home-title">Hustle n' Tussle</h1>
        <p class="home-subtitle">Dance Battle Manager</p>
    </div>
    <div class="home-actions">
        <button id="go-to-battle" class="btn primary large">Start Battle</button>
        <button id="go-to-upload" class="btn secondary large">Upload Results</button>
    </div>
</div>
```

**Step 3: Clean up setup screen markup** (lines 75-135)

Remove inline styles from checkbox labels (lines 90, 97, 104). Move Spotify toggle into setup screen as a form group instead of having it as a separate top-level button. Remove the old `theme-toggle` and `spotify-toggle` buttons.

**Step 4: Verify home and setup screens render correctly**

Open `http://localhost:5000` — home screen should show centered title + buttons. Setup screen should show clean form. Navigation bar should be visible.

**Step 5: Commit**

```bash
git add web/index.html
git commit -m "feat(ui): restructure HTML for nav bar, home, and setup screens"
```

---

## Task 6: HTML Restructure — Battle Screen

**Files:**
- Modify: `web/index.html`

**Step 1: Restructure battle screen header**

Replace the current battle screen content (lines 137-343) with new structure. Key changes:

- Replace `<h1 id="battle-title">Battle</h1>` and round header with:
  ```html
  <div class="round-header-new">
      <div class="round-badge" id="round-badge">Round <span id="round-number">1</span></div>
      <h2 id="battle-title">Voting</h2>
      <p class="vote-progress" id="vote-progress">0 of 0 judges voted</p>
  </div>
  ```

- Keep song input/playlist sections (they work as-is, just need CSS updates)

**Step 2: Restructure matchup area**

Replace the current matchup div (lines 158-176) with the new matchup card:

```html
<div class="matchup-card" id="current-matchup">
    <div class="matchup-side">
        <div class="dancer-name" id="lead1-name"></div>
        <span class="dancer-score" id="lead1-score"></span>
    </div>
    <div class="matchup-divider">VS</div>
    <div class="matchup-side">
        <div class="dancer-name" id="lead2-name"></div>
        <span class="dancer-score" id="lead2-score"></span>
    </div>
</div>
```

Note: The matchup card will need to show different pairs for leads and follows voting. The JS will update the names dynamically — the IDs `lead1-name`, `lead2-name` etc. still reference the same elements but with a new parent structure.

**Step 3: Restructure voting sections**

Replace the combined voting section with new judge section containers. Keep the same container IDs (`lead-judges-container`, `follow-judges-container`) so JS can populate them:

```html
<div id="combined-voting" class="combined-voting-section">
    <div id="lead-voting" class="judge-section">
        <div class="judge-section-header">
            <span class="judge-section-title">Leads Voting</span>
            <span class="judge-section-count" id="lead-vote-count"></span>
        </div>
        <div id="guest-lead-judges" class="judge-list"></div>
        <div id="contestant-lead-judges" class="judge-list"></div>
    </div>

    <div id="follow-voting" class="judge-section">
        <div class="judge-section-header">
            <span class="judge-section-title">Follows Voting</span>
            <span class="judge-section-count" id="follow-vote-count"></span>
        </div>
        <div id="guest-follow-judges" class="judge-list"></div>
        <div id="contestant-follow-judges" class="judge-list"></div>
    </div>

    <div class="submit-area">
        <button id="submit-votes" class="btn primary large">Confirm Votes</button>
    </div>
    <div class="battle-actions">
        <button id="undo-round" class="btn secondary" disabled>Undo Round</button>
        <button id="end-battle-early" class="btn warning">End Battle Early</button>
    </div>
</div>
```

**Step 4: Add mini leaderboard below voting**

After the voting section, before the modals, add:

```html
<div class="standings-card" id="mini-leaderboard">
    <h3>Standings</h3>
    <div class="standings-columns">
        <div class="standings-col">
            <h4>Leads</h4>
            <div id="mini-lead-standings"></div>
        </div>
        <div class="standings-col">
            <h4>Follows</h4>
            <div id="mini-follow-standings"></div>
        </div>
    </div>
</div>
```

**Step 5: Keep modals and round transition overlay as-is** (just CSS will restyle them)

**Step 6: Commit**

```bash
git add web/index.html
git commit -m "feat(ui): restructure battle screen HTML with new components"
```

---

## Task 7: JS — Theme Auto-Detection & Toast System

**Files:**
- Modify: `web/js/app.js`

**Step 1: Replace theme toggle with auto-detection**

In `app.js`, find the theme toggle handler (lines 378-394). Replace it with auto-detection:

```javascript
// Auto-detect theme based on display mode
function applyTheme() {
    if (displayMode) {
        document.documentElement.setAttribute('data-theme', 'display');
    } else {
        document.documentElement.setAttribute('data-theme', 'admin');
    }
}
```

Call `applyTheme()` right after `detectDisplayMode()` in the DOMContentLoaded handler (around line 85).

Remove the `theme-toggle` button event listener entirely. Remove the `localStorage.getItem('theme')` / `localStorage.setItem('theme')` calls.

**Step 2: Add toast notification system**

Add a new section near the top of `app.js` (after the global variables, around line 50):

```javascript
// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}
```

**Step 3: Replace key `alert()` calls with toasts**

Search for `alert(` calls in `app.js` and replace user-facing ones with `showToast()`:

- Line 1489 (start game failure): `showToast('Failed to start game', 'error')`
- Line 2066 (vote error): `showToast('Error submitting votes', 'error')`
- Line 2212 (next round failure): `showToast('Failed to advance round', 'error')`
- Line 2218 (undo error): `showToast('Failed to undo round', 'error')`

Keep `confirm()` dialogs for destructive actions (end battle early, undo) — those are modals now.

**Step 4: Verify toast appears**

Start the dev server, trigger an error (e.g., submit without starting a game). Toast should appear at bottom.

**Step 5: Commit**

```bash
git add web/js/app.js
git commit -m "feat(ui): add auto theme detection and toast notification system"
```

---

## Task 8: JS — Update Judge Card Generation

**Files:**
- Modify: `web/js/app.js`

**Step 1: Rewrite `createJudgeVotingCard()` (lines 1656-1778)**

Replace with new markup that generates judge rows instead of cards:

```javascript
function createJudgeVotingCard(judgeName, isGuest, voteType) {
    const judgeRow = document.createElement('div');
    const nameSlug = judgeName.replace(/\s+/g, '-').toLowerCase();
    judgeRow.className = 'judge-row';
    judgeRow.id = `${voteType}-judge-${nameSlug}`;

    // Avatar with initials
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    const initials = judgeName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    avatar.textContent = initials;

    // Name
    const nameEl = document.createElement('span');
    nameEl.className = 'judge-name';
    nameEl.textContent = judgeName;

    // Vote chips container
    const voteChips = document.createElement('div');
    voteChips.className = 'vote-chips';

    // Get contestant names from current matchup
    const option1Name = voteType === 'lead'
        ? (document.getElementById('lead1-name')?.textContent || 'Option 1')
        : (document.getElementById('follow1-name')?.textContent || 'Option 1');
    const option2Name = voteType === 'lead'
        ? (document.getElementById('lead2-name')?.textContent || 'Option 2')
        : (document.getElementById('follow2-name')?.textContent || 'Option 2');

    // Option 1 chip
    const chip1 = createVoteChip(option1Name, 1, judgeName, voteType, judgeRow);
    voteChips.appendChild(chip1);

    // Option 2 chip
    const chip2 = createVoteChip(option2Name, 2, judgeName, voteType, judgeRow);
    voteChips.appendChild(chip2);

    if (isGuest) {
        // Tie chip
        const tieChip = createVoteChip('Tie', 3, judgeName, voteType, judgeRow);
        tieChip.classList.add('tie-chip');
        voteChips.appendChild(tieChip);

        // No Contest chip
        const ncChip = createVoteChip('NC', 4, judgeName, voteType, judgeRow);
        ncChip.classList.add('nc-chip');
        voteChips.appendChild(ncChip);
    }
    // Handle proxy contestant judges (simple mode)
    // ... (keep existing mixed vote logic, adapted to chip style)

    judgeRow.appendChild(avatar);
    judgeRow.appendChild(nameEl);
    judgeRow.appendChild(voteChips);

    return judgeRow;
}

function createVoteChip(label, voteValue, judgeName, voteType, parentRow) {
    const chip = document.createElement('button');
    chip.className = 'vote-chip';
    chip.textContent = label;
    chip.addEventListener('click', () => {
        // Deselect siblings
        parentRow.querySelectorAll('.vote-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        parentRow.classList.add('voted');
        // Update avatar style
        parentRow.querySelector('.avatar').classList.add('voted');
        recordVote(judgeName, voteValue, voteType);
    });
    return chip;
}
```

**Step 2: Update vote count display**

Add a function to update the vote progress text:

```javascript
function updateVoteProgress() {
    const leadTotal = Object.keys(leadVotes).length;
    // Count expected lead judges...
    const leadCountEl = document.getElementById('lead-vote-count');
    if (leadCountEl) leadCountEl.textContent = `${leadTotal} / ${expectedLeadJudges}`;
    // Same for follows
}
```

Call this from `recordVote()`.

**Step 3: Verify judge rows render correctly during a battle**

Start a test game, check that judge voting shows the new row layout with avatars and chips.

**Step 4: Commit**

```bash
git add web/js/app.js
git commit -m "feat(ui): rewrite judge voting cards as row layout with vote chips"
```

---

## Task 9: JS — Update Leaderboard & Results Rendering

**Files:**
- Modify: `web/js/app.js`

**Step 1: Add mini-leaderboard rendering function**

Add a new function to render the in-battle standings:

```javascript
function updateMiniLeaderboard() {
    const leadContainer = document.getElementById('mini-lead-standings');
    const followContainer = document.getElementById('mini-follow-standings');
    if (!leadContainer || !followContainer) return;

    const pointsToWin = /* get from game state */;

    function renderStandings(contestants, container) {
        container.innerHTML = '';
        const sorted = [...contestants].sort((a, b) => b.points - a.points);
        sorted.forEach((c, i) => {
            const row = document.createElement('div');
            row.className = 'standings-row';
            row.innerHTML = `
                <span class="rank">${i + 1}</span>
                <span class="name">${c.name}</span>
                <div class="bar-track"><div class="fill" style="width: ${(c.points / pointsToWin) * 100}%"></div></div>
                <span class="pts">${c.points}</span>
            `;
            container.appendChild(row);
        });
    }

    renderStandings(currentLeads, leadContainer);
    renderStandings(currentFollows, followContainer);
}
```

Call `updateMiniLeaderboard()` after each round completes and when the battle screen loads.

**Step 2: Update `displayResults()` (lines 2379-2610)**

Update the battle graphic rendering section (lines 2479-2547) to use new class names matching the redesigned CSS:
- Keep existing logic but update generated class names from `graphic-row`/`graphic-rank`/`graphic-name` to match new standings styles
- Update crown icon rendering

**Step 3: Update `displayRoundHistory()` (lines 2612-2812)**

Update accordion HTML generation to use new class names:
- `.accordion-item`, `.accordion-header`, `.accordion-content`
- Keep existing expand/collapse logic

**Step 4: Verify results screen renders correctly**

Complete a test battle or upload results file, check results page renders with new styles.

**Step 5: Commit**

```bash
git add web/js/app.js
git commit -m "feat(ui): add mini leaderboard and update results rendering"
```

---

## Task 10: JS — Loading States & Button Debouncing

**Files:**
- Modify: `web/js/app.js`

**Step 1: Add loading state utility**

```javascript
function setButtonLoading(button, loading) {
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.classList.add('loading');
        button.disabled = true;
        button.textContent = '';
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        button.textContent = button.dataset.originalText || button.textContent;
    }
}
```

**Step 2: Add debounce utility**

```javascript
function debounce(fn, delay = 500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
```

**Step 3: Apply loading state to submit votes**

In `submitCombinedVotes()` (line ~2052), wrap the fetch call:

```javascript
const submitBtn = document.getElementById('submit-votes');
setButtonLoading(submitBtn, true);
try {
    // ... existing fetch logic ...
    showToast('Votes submitted!', 'success');
} catch (err) {
    showToast('Error submitting votes', 'error');
} finally {
    setButtonLoading(submitBtn, false);
}
```

**Step 4: Apply loading state to start competition**

In the start competition handler, wrap the API call with `setButtonLoading()`.

**Step 5: Add debouncing to submit button**

Wrap the submit button's click handler with the debounce utility, or use a simple flag:

```javascript
let isSubmitting = false;
submitVotesBtn.addEventListener('click', async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    try { /* ... */ } finally { isSubmitting = false; }
});
```

**Step 6: Commit**

```bash
git add web/js/app.js
git commit -m "feat(ui): add loading states and button debouncing"
```

---

## Task 11: JS — Screen Transitions & Nav Bar Logic

**Files:**
- Modify: `web/js/app.js`

**Step 1: Update `showScreen()` (lines 462-496)**

Replace the current instant show/hide with a transition-aware approach:

```javascript
function showScreen(screenElement) {
    const allScreens = [homeScreen, uploadScreen, setupScreen, roundScreen, resultsScreen];

    allScreens.forEach(screen => {
        if (screen && screen !== screenElement) {
            screen.classList.remove('active');
        }
    });

    if (screenElement) {
        screenElement.classList.add('active');
    }

    // Update nav pills
    updateNavPills(screenElement);

    // Clear errors
    const errors = document.querySelectorAll('.error-message');
    errors.forEach(e => e.textContent = '');

    // Manage display mode polling
    if (displayMode) {
        if (screenElement === roundScreen) {
            startDisplayPolling();
        } else {
            stopDisplayPolling();
        }
    }
}
```

**Step 2: Add nav pill logic**

```javascript
function updateNavPills(activeScreen) {
    const pills = document.querySelectorAll('.nav-pill');
    pills.forEach(pill => {
        pill.classList.remove('active');
        if (pill.dataset.screen === activeScreen?.id) {
            pill.classList.add('active');
        }
    });
}
```

Initialize nav pill click handlers in DOMContentLoaded:

```javascript
document.querySelectorAll('.nav-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        const screenId = pill.dataset.screen;
        const screen = document.getElementById(screenId);
        if (screen) showScreen(screen);
    });
});
```

**Step 3: Hide nav bar on home screen and in display mode**

```javascript
function showScreen(screenElement) {
    // ... existing logic ...
    const navBar = document.getElementById('nav-bar');
    if (navBar) {
        navBar.style.display = (screenElement === homeScreen || displayMode) ? 'none' : 'flex';
    }
}
```

**Step 4: Verify screen transitions work smoothly**

Navigate between screens — should fade in/out smoothly via CSS transition on `.screen.active`.

**Step 5: Commit**

```bash
git add web/js/app.js
git commit -m "feat(ui): add smooth screen transitions and nav bar logic"
```

---

## Task 12: JS — Update Matchup Card & Display Mode

**Files:**
- Modify: `web/js/app.js`

**Step 1: Update matchup rendering**

Find where `lead1-name`, `lead2-name`, `follow1-name`, `follow2-name` are populated (search for `getElementById('lead1-name')`). Update to also populate score badges:

```javascript
// After setting names, also set scores
const lead1Score = document.getElementById('lead1-score');
const lead2Score = document.getElementById('lead2-score');
if (lead1Score) {
    const l1 = currentLeads.find(l => l.name === lead1Name.textContent);
    lead1Score.textContent = l1 ? `${l1.points} / ${pointsToWin} pts` : '';
}
// Same for lead2, follow1, follow2
```

**Step 2: Update `detectDisplayMode()` to set theme**

Modify `detectDisplayMode()` (lines 499-520) to call `applyTheme()` after setting `displayMode`:

```javascript
function detectDisplayMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'display' || params.get('display') === '1') {
        displayMode = true;
        document.body.classList.add('display-mode');
    }
    applyTheme(); // Apply correct theme based on mode
    return displayMode;
}
```

**Step 3: Verify display mode gets Neon Arena theme**

Open `http://localhost:5000?display=1&session_id=...` — should show dark Neon Arena theme.

**Step 4: Commit**

```bash
git add web/js/app.js
git commit -m "feat(ui): update matchup rendering and display mode theming"
```

---

## Task 13: Visual QA & Polish Pass

**Files:**
- Modify: `web/css/styles.css` (tweaks)
- Modify: `web/js/app.js` (minor fixes)

**Step 1: Take screenshots of all screens in admin mode**

Use Playwright (or manually) to capture:
1. Home screen
2. Setup screen (filled form)
3. Battle screen (mid-voting)
4. Results screen

**Step 2: Take screenshots in display mode**

Capture same screens with `?display=1`.

**Step 3: Fix visual issues**

Based on screenshots, fix:
- Spacing inconsistencies
- Color contrast issues
- Mobile layout breakpoints
- Font loading flash (add `font-display: swap` if missing)
- Any elements that were missed in the CSS rewrite

**Step 4: Test mobile layout**

Use Playwright with viewport `375x812` (iPhone) and `768x1024` (iPad).

**Step 5: Commit**

```bash
git add web/css/styles.css web/js/app.js
git commit -m "fix(ui): polish pass — spacing, contrast, and mobile fixes"
```

---

## Task 14: Clean Up & Final Verification

**Files:**
- Modify: `web/index.html` (remove any dead markup)
- Modify: `web/js/app.js` (remove dead code)

**Step 1: Remove dead code**

- Remove old theme-toggle references from JS
- Remove old spotify-toggle button handler (moved into setup screen)
- Remove any CSS class references that no longer exist
- Clean up old `style.css` references if any remain

**Step 2: Run the full test suite**

```bash
python run_complete_test_suite.py
```

All backend tests should pass (we didn't touch backend code).

**Step 3: Manual smoke test**

1. Start new battle with 4 leads, 4 follows, 2 guest judges
2. Vote through 3 rounds in admin mode
3. Open display mode in separate tab, verify it shows Neon Arena theme
4. Complete battle, verify results screen
5. Upload previous battle results, verify upload screen
6. Test on mobile viewport

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(ui): clean up dead code and verify full redesign"
```
