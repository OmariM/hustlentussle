# UI/UX Redesign Design Document

**Date:** 2026-02-14
**Status:** Approved

## Summary

Full UI/UX redesign of Hustle n' Tussle with dual-theme system: "Clean Competition" (light) for admin/MC and "Neon Arena" (dark) for audience display mode. Addresses visual identity, missing feedback, clunky flow, and mobile experience.

## Theme Architecture

Two visual themes, automatically applied via CSS `data-theme` attribute on `<html>`:

- **`data-theme="admin"`** — Clean Competition (light, card-based, sports-app aesthetic)
- **`data-theme="display"`** — Neon Arena (dark, high-energy, event-grade aesthetic)

Auto-detected: display mode (`?display=1`) gets Neon Arena, everything else gets Clean Competition. No manual toggle.

### Design Tokens

| Token | Admin (Clean) | Display (Neon) |
|---|---|---|
| `--bg` | `#f5f5f7` | `#0a0a12` |
| `--bg-surface` | `#ffffff` | `#12121f` |
| `--bg-card` | `#ffffff` | `#1a1a2e` |
| `--bg-card-hover` | `#f8faff` | `#222240` |
| `--accent` | `#1d4ed8` | `#7c3aed` |
| `--accent-hover` | `#1e40af` | `#6d28d9` |
| `--accent-hot` | `#dc2626` | `#f43f5e` |
| `--accent-gold` | `#b45309` | `#eab308` |
| `--accent-cyan` | — | `#06b6d4` |
| `--text-primary` | `#0f172a` | `#f1f5f9` |
| `--text-secondary` | `#475569` | `#94a3b8` |
| `--text-muted` | `#94a3b8` | `#64748b` |
| `--border` | `#e2e8f0` | `rgba(148,163,184,0.1)` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | none |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` | none |
| `--glow-accent` | none | `0 0 30px rgba(124,58,237,0.3)` |
| `--font-display` | DM Sans 700 | Space Grotesk 700 |
| `--font-body` | DM Sans 400/500 | Inter 400/500 |

### Typography

**Admin:** DM Sans (Google Fonts) — clean, modern sans-serif
**Display:** Space Grotesk (headings) + Inter (body) — techy, distinctive

Both use DM Mono for monospaced numbers (round numbers, scores).

## Component Redesign

### Navigation Bar (admin only)
- Top bar with brand name + green "live" dot
- Screen pills: Setup | Battle | Results
- Active pill gets accent background

### Matchup Card
- Side-by-side dancer names with VS divider
- Score badges below each name (e.g., "3 / 7 pts")
- Admin: white card with shadow, gray divider
- Display: dark card with gradient top border, glowing VS text
- Mobile: stacks vertically

### Judge Rows
- Replace current card grid with stacked rows
- Each row: avatar initials | name | vote chips aligned right
- Voted state: accent left border + subtle bg tint, avatar fills with accent color
- Guest judges get Tie + NC chips (dashed/dotted borders)
- Contestant judges get only two dancer chips

### Vote Progress
- Section header with label + "X / Y voted" count badge
- Progress bar under round number (admin)
- Subtitle text (display)

### Standings Mini-Leaderboard
- Always visible below voting area
- Rows: rank | name | progress bar | points
- Bar width = points / win_threshold as percentage
- #1 rank gets accent color highlight

### Submit Button
- Centered, prominent
- Disabled state: reduced opacity, no pointer
- Loading state: spinner replaces text during API call
- Admin: solid accent background, medium shadow
- Display: gradient background (purple → pink), glow shadow

### Toast Notifications
- Fixed bottom-center, auto-dismiss after 3 seconds
- Types: success (green), error (red), info (blue)
- Slide-up animation on appear, fade-out on dismiss
- Messages: "Votes submitted", "Round X started", "Battle complete!", error messages

## Screen-by-Screen Changes

### Home Screen
- Centered layout with app title and tagline
- Two primary action buttons: "Start New Battle" + "Upload Results"
- Admin: clean white card layout
- Display: not shown (display mode starts from battle screen)

### Upload Screen
- File upload area with drag-and-drop zone
- Upload button + file name preview
- Status messages for parsing results

### Setup Screen
- Form sections: Contestants (leads/follows), Judges, Scoring Rules
- Input fields with proper labels and validation
- Add/remove contestant buttons
- Points-to-win selector
- Start Battle button (disabled until valid config)

### Battle Screen (Voting)
- Round badge/number at top
- Matchup card
- Judge voting sections (guest + contestant, separated)
- Submit button
- Mini leaderboard
- Undo button (visible, with confirmation modal)

### Results Screen
- Final leaderboard with crown icons for winners
- Round history accordion (collapsible)
- Export button (Excel download)
- "New Battle" button to return to home

## User Flow Improvements

### Screen Transitions
- Smooth fade/slide between screens (CSS transitions, 300ms)
- Current: instant class swap. New: opacity + transform transition

### Voting Flow
- After vote submission: brief winner announcement card (2s) showing who won
- Auto-advance: leads voting → follows voting → next round
- Smoother than current abrupt transition

### Undo
- Visible "Undo Last Round" button in battle screen
- Confirmation modal before executing

### Loading States
- Submit button shows spinner during API call
- All interaction disabled during submission
- Button debouncing: ignore clicks within 500ms of last click

### Empty States
- No judges added: "Add judges to start voting"
- No contestants: "Add at least 2 leads and 2 follows"
- Helpful, non-blocking messages

## Mobile Improvements

- Vote buttons: 2x2 grid on screens < 640px
- Submit button: sticky bottom on mobile (always visible)
- Touch targets: minimum 44px height on all interactive elements
- Judge rows: wrap vote chips below name on narrow screens
- Matchup card: stack vertically on mobile

## Technical Scope

### Files Changed
- `web/css/styles.css` — full rewrite with new design token system
- `web/css/style.css` — delete (merge any needed styles into main file)
- `web/styles.css` — delete (unused)
- `web/index.html` — update component markup (nav, matchup, judge rows, toasts)
- `web/js/app.js` — update HTML generation (judge cards, leaderboard), add theme detection, toast system, loading states, button debouncing

### Files NOT Changed
- `web/js/main.js` — entry point stays the same
- `web/js/components/DebugTools.js` — debug tools stay as-is
- `web/config.py` — no backend config changes
- `web/app.py` — no API changes
- All Python backend files — untouched

### New Dependencies
- Google Fonts: DM Sans, DM Mono, Space Grotesk, Inter (loaded via `<link>`)
- No npm packages, no build tools

## Mockup References

Visual mockups saved in `mockups/` directory:
- `neon-arena.html` / `.png` — Display theme reference
- `clean-competition.html` / `.png` — Admin theme reference
