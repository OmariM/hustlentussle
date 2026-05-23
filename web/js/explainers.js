'use strict';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makePill(name, role, state) {
    const el = document.createElement('span');
    el.className = ['viz-pill', role, state].filter(Boolean).join(' ');
    el.textContent = name;
    return el;
}

function makeOutcomeBadge(type) {
    const el = document.createElement('span');
    const labels = { tie: 'Tie', 'no-contest': 'No Contest', winner: 'Winner', tied: 'Tied' };
    el.className = 'viz-outcome-badge ' + type;
    el.textContent = labels[type] || type;
    return el;
}

// Shared controller for OutcomesExplainer sub-panels.
// Builds title + [‹ stageEl ›] + caption + step counter inside panel.
function makeAnimPanel(panel, title, steps, renderFn) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'viz-outcome-title';
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    const stageEl = document.createElement('div');
    stageEl.className = 'viz-outcome-stage';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'viz-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous step');
    prevBtn.textContent = '‹';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'viz-nav-btn';
    nextBtn.setAttribute('aria-label', 'Next step');
    nextBtn.textContent = '›';

    const navWrap = document.createElement('div');
    navWrap.className = 'viz-nav-wrap';
    navWrap.appendChild(prevBtn);
    navWrap.appendChild(stageEl);
    navWrap.appendChild(nextBtn);
    panel.appendChild(navWrap);

    const captionEl = document.createElement('p');
    captionEl.className = 'viz-caption';
    panel.appendChild(captionEl);

    const controls = document.createElement('div');
    controls.className = 'viz-controls';

    const counterEl = document.createElement('span');
    counterEl.className = 'viz-step-counter';
    controls.appendChild(counterEl);
    panel.appendChild(controls);

    let idx = 0;

    function render() {
        renderFn(stageEl, captionEl, steps[idx]);
        counterEl.textContent = (idx + 1) + ' / ' + steps.length;
    }

    prevBtn.addEventListener('click', () => { idx = (idx - 1 + steps.length) % steps.length; render(); });
    nextBtn.addEventListener('click', () => { idx = (idx + 1) % steps.length; render(); });

    render();
}

// ─── Tab switching ─────────────────────────────────────────────────────────

function setupExplainerTabs() {
    const tabs = document.querySelectorAll('.explainer-tab');
    const panels = document.querySelectorAll('.explainer-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.target);
            if (target) target.classList.add('active');
        });
    });
}

// ─── Animation 1: Queue System ─────────────────────────────────────────────

class QueueExplainer {
    constructor(container) {
        this.container = container;
        this.stepIndex = 0;

        this._steps = [
            {
                label: 'Leads and follows line up in two separate queues. The first two from each queue compete each round.',
                leadsQueue: ['Alex', 'Jordan', 'Sam', 'Casey', 'Riley', 'Morgan'],
                followsQueue: ['Jamie', 'Taylor', 'Drew', 'Avery', 'Blake', 'Quinn'],
                couples: [],
                leadH: {}, followH: {}
            },
            {
                label: 'Round 1 — the first two leads and first two follows enter the battle.',
                leadsQueue: ['Sam', 'Casey', 'Riley', 'Morgan'],
                followsQueue: ['Drew', 'Avery', 'Blake', 'Quinn'],
                couples: [
                    { lead: 'Alex', follow: 'Jamie', num: 1 },
                    { lead: 'Jordan', follow: 'Taylor', num: 2 },
                ],
                leadH: {}, followH: {}
            },
            {
                label: 'Round 1 — Alex wins leads, Jamie wins follows.',
                leadsQueue: ['Sam', 'Casey', 'Riley', 'Morgan'],
                followsQueue: ['Drew', 'Avery', 'Blake', 'Quinn'],
                couples: [
                    { lead: 'Alex', follow: 'Jamie', num: 1 },
                    { lead: 'Jordan', follow: 'Taylor', num: 2 },
                ],
                leadH: { Alex: 'winner', Jordan: 'loser' },
                followH: { Jamie: 'winner', Taylor: 'loser' }
            },
            {
                label: 'Losers (Jordan, Taylor) cycle to the back of their queues. Winners stay on stage.',
                leadsQueue: ['Sam', 'Casey', 'Riley', 'Morgan', 'Jordan'],
                followsQueue: ['Drew', 'Avery', 'Blake', 'Quinn', 'Taylor'],
                couples: [
                    { lead: 'Alex', follow: 'Jamie', num: 1 },
                ],
                leadH: { Alex: 'winner' },
                followH: { Jamie: 'winner' }
            },
            {
                label: 'Round 2 — winners stay but get new partners. Alex faces Drew; Sam steps up to face Jamie.',
                leadsQueue: ['Casey', 'Riley', 'Morgan', 'Jordan'],
                followsQueue: ['Avery', 'Blake', 'Quinn', 'Taylor'],
                couples: [
                    { lead: 'Alex', follow: 'Drew', num: 1 },
                    { lead: 'Sam', follow: 'Jamie', num: 2 },
                ],
                leadH: {}, followH: {}
            },
            {
                label: 'Round 2 — Sam wins leads, Jamie wins follows.',
                leadsQueue: ['Casey', 'Riley', 'Morgan', 'Jordan'],
                followsQueue: ['Avery', 'Blake', 'Quinn', 'Taylor'],
                couples: [
                    { lead: 'Alex', follow: 'Drew', num: 1 },
                    { lead: 'Sam', follow: 'Jamie', num: 2 },
                ],
                leadH: { Sam: 'winner', Alex: 'loser' },
                followH: { Jamie: 'winner', Drew: 'loser' }
            },
            {
                label: 'Losers (Alex, Drew) cycle to the back. Sam and Jamie stay on stage.',
                leadsQueue: ['Casey', 'Riley', 'Morgan', 'Jordan', 'Alex'],
                followsQueue: ['Avery', 'Blake', 'Quinn', 'Taylor', 'Drew'],
                couples: [
                    { lead: 'Sam', follow: 'Jamie', num: 1 },
                ],
                leadH: { Sam: 'winner' },
                followH: { Jamie: 'winner' }
            },
            {
                label: 'Round 3 — winners stay, new partners step up. Sam faces Avery; Casey steps up to face Jamie.',
                leadsQueue: ['Riley', 'Morgan', 'Jordan', 'Alex'],
                followsQueue: ['Blake', 'Quinn', 'Taylor', 'Drew'],
                couples: [
                    { lead: 'Sam', follow: 'Avery', num: 1 },
                    { lead: 'Casey', follow: 'Jamie', num: 2 },
                ],
                leadH: {}, followH: {}
            },
            {
                label: 'Round 3 — Casey wins leads, Jamie wins follows.',
                leadsQueue: ['Riley', 'Morgan', 'Jordan', 'Alex'],
                followsQueue: ['Blake', 'Quinn', 'Taylor', 'Drew'],
                couples: [
                    { lead: 'Sam', follow: 'Avery', num: 1 },
                    { lead: 'Casey', follow: 'Jamie', num: 2 },
                ],
                leadH: { Casey: 'winner', Sam: 'loser' },
                followH: { Jamie: 'winner', Avery: 'loser' }
            },
        ];

        this._build();
    }

    _build() {
        this.container.innerHTML = '';

        const desc = document.createElement('p');
        desc.className = 'explainer-desc';
        desc.textContent = 'Leads and follows are managed as two independent queues. Each round, the first two from each queue compete. Winners stay on stage but dance with a new partner next round; losers cycle to the back of their queue.';
        this.container.appendChild(desc);

        // [‹] [arena] [›]
        const prevBtn = document.createElement('button');
        prevBtn.className = 'viz-nav-btn';
        prevBtn.setAttribute('aria-label', 'Previous step');
        prevBtn.textContent = '‹';
        prevBtn.addEventListener('click', () => this._stepBy(-1));

        const arena = document.createElement('div');
        arena.className = 'viz-arena';

        const leadsCol = document.createElement('div');
        leadsCol.className = 'viz-queue-col';
        const leadsLabel = document.createElement('div');
        leadsLabel.className = 'viz-queue-label';
        leadsLabel.textContent = 'Leads Queue';
        this._leadsListEl = document.createElement('div');
        this._leadsListEl.className = 'viz-queue-list';
        leadsCol.appendChild(leadsLabel);
        leadsCol.appendChild(this._leadsListEl);

        const stageCol = document.createElement('div');
        stageCol.className = 'viz-stage';
        const stageLabel = document.createElement('div');
        stageLabel.className = 'viz-queue-label';
        stageLabel.textContent = 'Battle Stage';
        this._stageEl = document.createElement('div');
        this._stageEl.className = 'viz-stage-pairs';
        stageCol.appendChild(stageLabel);
        stageCol.appendChild(this._stageEl);

        const followsCol = document.createElement('div');
        followsCol.className = 'viz-queue-col';
        const followsLabel = document.createElement('div');
        followsLabel.className = 'viz-queue-label';
        followsLabel.textContent = 'Follows Queue';
        this._followsListEl = document.createElement('div');
        this._followsListEl.className = 'viz-queue-list';
        followsCol.appendChild(followsLabel);
        followsCol.appendChild(this._followsListEl);

        arena.appendChild(leadsCol);
        arena.appendChild(stageCol);
        arena.appendChild(followsCol);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'viz-nav-btn';
        nextBtn.setAttribute('aria-label', 'Next step');
        nextBtn.textContent = '›';
        nextBtn.addEventListener('click', () => this._stepBy(1));

        const navWrap = document.createElement('div');
        navWrap.className = 'viz-nav-wrap';
        navWrap.appendChild(prevBtn);
        navWrap.appendChild(arena);
        navWrap.appendChild(nextBtn);
        this.container.appendChild(navWrap);

        this._captionEl = document.createElement('p');
        this._captionEl.className = 'viz-caption';
        this.container.appendChild(this._captionEl);

        const controls = document.createElement('div');
        controls.className = 'viz-controls';

        this._counterEl = document.createElement('span');
        this._counterEl.className = 'viz-step-counter';

        controls.appendChild(this._counterEl);
        this.container.appendChild(controls);
    }

    _updateCounter() {
        this._counterEl.textContent = (this.stepIndex + 1) + ' / ' + this._steps.length;
    }

    _stepBy(delta) {
        this.stepIndex = (this.stepIndex + delta + this._steps.length) % this._steps.length;
        this._render();
    }

    _render() {
        const s = this._steps[this.stepIndex];
        this._captionEl.textContent = s.label;
        this._updateCounter();

        // FLIP — snapshot every pill's screen position before we touch the DOM
        const oldRects = new Map();
        this.container.querySelectorAll('.viz-pill').forEach(el => {
            oldRects.set(el.textContent.trim(), el.getBoundingClientRect());
        });

        // Re-render queues (no anim-in — FLIP decides below)
        this._leadsListEl.innerHTML = '';
        s.leadsQueue.forEach(name => {
            this._leadsListEl.appendChild(makePill(name, 'lead', s.leadH[name] || ''));
        });

        this._followsListEl.innerHTML = '';
        s.followsQueue.forEach(name => {
            this._followsListEl.appendChild(makePill(name, 'follow', s.followH[name] || ''));
        });

        // Re-render stage
        this._stageEl.innerHTML = '';
        if (s.couples.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'viz-stage-empty';
            empty.textContent = 'Waiting for round to start…';
            this._stageEl.appendChild(empty);
        } else {
            s.couples.forEach(c => {
                const card = document.createElement('div');
                card.className = 'viz-couple-card';
                if (s.leadH[c.lead] === 'tied') card.classList.add('viz-couple-tied');

                const numLabel = document.createElement('span');
                numLabel.className = 'viz-couple-num';
                numLabel.textContent = 'C' + c.num;
                card.appendChild(numLabel);

                card.appendChild(makePill(c.lead, 'lead', s.leadH[c.lead] || ''));

                const heart = document.createElement('span');
                heart.className = 'viz-heart';
                heart.textContent = '+';
                card.appendChild(heart);

                card.appendChild(makePill(c.follow, 'follow', s.followH[c.follow] || ''));

                if (s.leadH[c.lead] === 'tied') card.appendChild(makeOutcomeBadge('tie'));

                this._stageEl.appendChild(card);
            });
        }

        // FLIP — for each new pill decide: fly from old position, or slide in fresh
        const toFlip = [];
        this.container.querySelectorAll('.viz-pill').forEach(el => {
            const name = el.textContent.trim();
            const old = oldRects.get(name);
            if (!old) {
                // Genuinely new contestant — slide in from the side
                el.classList.add('anim-in');
                return;
            }
            const newRect = el.getBoundingClientRect();
            const dx = Math.round(old.left - newRect.left);
            const dy = Math.round(old.top - newRect.top);
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                // Pin pill at its old screen position, then animate to natural position
                el.style.transition = 'none';
                el.style.transform = `translate(${dx}px, ${dy}px)`;
                toFlip.push(el);
            }
        });

        // Force a synchronous layout so the browser registers the pinned positions,
        // then start the transition to the natural (zero-transform) position
        if (toFlip.length) {
            void document.body.offsetHeight;
            toFlip.forEach(el => {
                el.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                el.style.transform = '';
                el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
            });
        }
    }

    start() {
        this._render();
    }
}

// ─── Animation 2: Special Outcomes ─────────────────────────────────────────

class OutcomesExplainer {
    constructor(container) {
        this.container = container;
        this._build();
    }

    _build() {
        this.container.innerHTML = '';

        const desc = document.createElement('p');
        desc.className = 'explainer-desc';
        desc.textContent = 'Two special outcomes can occur during judging, each with different consequences for the queue.';
        this.container.appendChild(desc);

        const grid = document.createElement('div');
        grid.className = 'viz-outcomes-grid';
        this.container.appendChild(grid);

        const tiePanel = document.createElement('div');
        tiePanel.className = 'viz-outcome-panel';
        grid.appendChild(tiePanel);

        const ncPanel = document.createElement('div');
        ncPanel.className = 'viz-outcome-panel';
        grid.appendChild(ncPanel);

        this._buildTiePanel(tiePanel);
        this._buildNcPanel(ncPanel);
    }

    // Shared render for both outcome panels.
    // All steps use the same 3-column grid (leads | + | follows) so pills stay in
    // their columns across every frame. The header row shows a badge over the
    // affected role on result steps, and is empty on all other steps.
    _renderOutcomeStep(stageEl, captionEl, s) {
        captionEl.textContent = s.label;
        stageEl.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'viz-outcome-col-grid';

        // Header row
        if (s.phase === 'result') {
            const badge = makeOutcomeBadge(s.badgeType);
            const badgeCell = document.createElement('div');
            badgeCell.appendChild(badge);
            if (s.badgeSpan === 'leads') {
                grid.appendChild(badgeCell);
                grid.appendChild(document.createElement('div'));
                grid.appendChild(document.createElement('div'));
            } else { // 'follows'
                grid.appendChild(document.createElement('div'));
                grid.appendChild(document.createElement('div'));
                grid.appendChild(badgeCell);
            }
        } else {
            grid.appendChild(document.createElement('div'));
            grid.appendChild(document.createElement('div'));
            grid.appendChild(document.createElement('div'));
        }

        // Data rows — one grid row per couple
        s.couples.forEach(c => {
            const leadPill = makePill(c.lead, 'lead', c.leadState || '');
            if (c.leadNew) leadPill.classList.add('anim-in');
            grid.appendChild(leadPill);

            const sep = document.createElement('span');
            sep.className = 'viz-heart';
            sep.textContent = '+';
            grid.appendChild(sep);

            const followPill = makePill(c.follow, 'follow', c.followState || '');
            if (c.followNew) followPill.classList.add('anim-in');
            grid.appendChild(followPill);
        });

        stageEl.appendChild(grid);

        if (s.note) {
            const note = document.createElement('div');
            note.className = 'viz-outcome-note';
            note.textContent = s.note;
            stageEl.appendChild(note);
        }
    }

    _buildTiePanel(panel) {
        const steps = [
            {
                label: 'Two couples compete on stage.',
                couples: [
                    { lead: 'Alex', follow: 'Jamie' },
                    { lead: 'Sam', follow: 'Taylor' },
                ],
            },
            {
                label: 'The leads TIE — no points. Same leads face off again next round.',
                phase: 'result',
                badgeType: 'tie',
                badgeSpan: 'leads',
                couples: [
                    { lead: 'Alex', follow: 'Jamie', leadState: 'tied' },
                    { lead: 'Sam', follow: 'Taylor', leadState: 'tied' },
                ],
            },
            {
                label: 'Re-match: same leads, but Jamie (follow winner) rotates to face Sam. Drew steps up as Alex\'s new follow.',
                couples: [
                    { lead: 'Alex', follow: 'Drew', followNew: true },
                    { lead: 'Sam', follow: 'Jamie' },
                ],
                note: '↩ Same leads return; Jamie rotates to the lead she hasn\'t faced',
            },
        ];

        makeAnimPanel(panel, 'Tie', steps,
            (stageEl, captionEl, s) => this._renderOutcomeStep(stageEl, captionEl, s));
    }

    _buildNcPanel(panel) {
        const steps = [
            {
                label: 'Two couples compete on stage.',
                couples: [
                    { lead: 'Alex', follow: 'Jamie' },
                    { lead: 'Sam', follow: 'Taylor' },
                ],
            },
            {
                label: 'Follows get NO CONTEST — no points for follows. Both follows cycle to the back of the queue. Leads are judged normally.',
                phase: 'result',
                badgeType: 'no-contest',
                badgeSpan: 'follows',
                couples: [
                    { lead: 'Alex', follow: 'Jamie', leadState: 'winner', followState: 'loser' },
                    { lead: 'Sam', follow: 'Taylor', leadState: 'loser', followState: 'loser' },
                ],
            },
            {
                label: 'Alex (lead winner) stays. Casey steps up as the new lead. Fresh follows arrive from the queue.',
                couples: [
                    { lead: 'Alex', follow: 'Drew', followNew: true },
                    { lead: 'Casey', follow: 'Avery', leadNew: true, followNew: true },
                ],
                note: '↑ Fresh follows step up; Sam cycles to the back of the leads queue',
            },
        ];

        makeAnimPanel(panel, 'No Contest', steps,
            (stageEl, captionEl, s) => this._renderOutcomeStep(stageEl, captionEl, s));
    }

    start() {}
}

// ─── Animation 3: Tie-Break ─────────────────────────────────────────────────

class TiebreakExplainer {
    constructor(container) {
        this.container = container;
        this.stepIndex = 0;

        this._steps = [
            {
                label: 'The battle ends early — three leads are tied at 5 points each.',
                phase: 'scoreboard',
                scores: [
                    { name: 'Alex', pts: 5, tied: true },
                    { name: 'Sam', pts: 5, tied: true },
                    { name: 'Jordan', pts: 5, tied: true },
                    { name: 'Casey', pts: 3, tied: false },
                    { name: 'Riley', pts: 2, tied: false },
                ]
            },
            {
                label: 'Tied leads each pick a follow to dance with in the tie-break.',
                phase: 'partner-select',
                picks: [
                    { lead: 'Alex', follow: 'Jamie' },
                    { lead: 'Sam', follow: 'Taylor' },
                    { lead: 'Jordan', follow: 'Drew' },
                ]
            },
            {
                label: 'Sub-Round 1 — each tied lead dances with their chosen partner.',
                phase: 'pairings',
                pairings: [
                    { lead: 'Alex', follow: 'Jamie' },
                    { lead: 'Sam', follow: 'Taylor' },
                    { lead: 'Jordan', follow: 'Drew' },
                ]
            },
            {
                label: 'Sub-Round 2 — partners rotate so each lead dances with a different follow.',
                phase: 'pairings',
                pairings: [
                    { lead: 'Alex', follow: 'Taylor' },
                    { lead: 'Sam', follow: 'Drew' },
                    { lead: 'Jordan', follow: 'Jamie' },
                ]
            },
            {
                label: 'Final vote — guest and contestant judges each cast their vote.',
                phase: 'vote',
                tallies: [
                    { name: 'Alex',   guestVotes: 0, contestantVotes: 1 },
                    { name: 'Sam',    guestVotes: 1, contestantVotes: 2 },
                    { name: 'Jordan', guestVotes: 1, contestantVotes: 0 },
                ]
            },
            {
                label: 'Sam wins the tie-break!',
                phase: 'winner',
                winner: 'Sam',
                others: ['Alex', 'Jordan'],
            },
        ];

        this._build();
    }

    _build() {
        this.container.innerHTML = '';

        const desc = document.createElement('p');
        desc.className = 'explainer-desc';
        desc.textContent = 'When the battle ends early and contestants are tied on points, a tie-break mini-tournament runs: each tied contestant picks a partner, dances two sub-rounds, then judges vote to pick a winner.';
        this.container.appendChild(desc);

        // [‹] [phase content] [›]
        const prevBtn = document.createElement('button');
        prevBtn.className = 'viz-nav-btn';
        prevBtn.setAttribute('aria-label', 'Previous step');
        prevBtn.textContent = '‹';
        prevBtn.addEventListener('click', () => this._stepBy(-1));

        this._phaseEl = document.createElement('div');
        this._phaseEl.className = 'viz-tiebreak-phase';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'viz-nav-btn';
        nextBtn.setAttribute('aria-label', 'Next step');
        nextBtn.textContent = '›';
        nextBtn.addEventListener('click', () => this._stepBy(1));

        const navWrap = document.createElement('div');
        navWrap.className = 'viz-nav-wrap';
        navWrap.appendChild(prevBtn);
        navWrap.appendChild(this._phaseEl);
        navWrap.appendChild(nextBtn);
        this.container.appendChild(navWrap);

        this._captionEl = document.createElement('p');
        this._captionEl.className = 'viz-caption';
        this.container.appendChild(this._captionEl);

        const controls = document.createElement('div');
        controls.className = 'viz-controls';

        this._counterEl = document.createElement('span');
        this._counterEl.className = 'viz-step-counter';

        controls.appendChild(this._counterEl);
        this.container.appendChild(controls);
    }

    _updateCounter() {
        this._counterEl.textContent = (this.stepIndex + 1) + ' / ' + this._steps.length;
    }

    _stepBy(delta) {
        this.stepIndex = (this.stepIndex + delta + this._steps.length) % this._steps.length;
        this._render();
    }

    _render() {
        const s = this._steps[this.stepIndex];
        this._captionEl.textContent = s.label;
        this._updateCounter();
        this._phaseEl.innerHTML = '';

        if (s.phase === 'scoreboard') {
            const list = document.createElement('div');
            list.className = 'viz-score-list';
            s.scores.forEach(row => {
                const r = document.createElement('div');
                r.className = 'viz-score-row' + (row.tied ? ' tied' : '');

                const name = makePill(row.name, 'lead', row.tied ? 'tied' : '');
                const bar = document.createElement('div');
                bar.className = 'viz-score-bar';
                const fill = document.createElement('div');
                fill.className = 'viz-score-fill' + (row.tied ? ' tied' : '');
                fill.style.width = Math.round(row.pts / 7 * 100) + '%';
                bar.appendChild(fill);

                const pts = document.createElement('span');
                pts.className = 'viz-score-pts';
                pts.textContent = row.pts + ' pts';

                r.appendChild(name);
                r.appendChild(bar);
                r.appendChild(pts);
                if (row.tied) r.appendChild(makeOutcomeBadge('tied'));
                list.appendChild(r);
            });
            this._phaseEl.appendChild(list);
        }

        else if (s.phase === 'partner-select') {
            const list = document.createElement('div');
            list.className = 'viz-picks-list';
            s.picks.forEach(pick => {
                const row = document.createElement('div');
                row.className = 'viz-pick-row anim-in';
                row.appendChild(makePill(pick.lead, 'lead', ''));
                const arrow = document.createElement('span');
                arrow.className = 'viz-arrow';
                arrow.textContent = '→ picks →';
                row.appendChild(arrow);
                row.appendChild(makePill(pick.follow, 'follow', ''));
                list.appendChild(row);
            });
            this._phaseEl.appendChild(list);
        }

        else if (s.phase === 'pairings') {
            const list = document.createElement('div');
            list.className = 'viz-stage-pairs';
            s.pairings.forEach(p => {
                const card = document.createElement('div');
                card.className = 'viz-couple-card anim-in';
                card.appendChild(makePill(p.lead, 'lead', ''));
                const heart = document.createElement('span');
                heart.className = 'viz-heart';
                heart.textContent = '+';
                card.appendChild(heart);
                card.appendChild(makePill(p.follow, 'follow', ''));
                list.appendChild(card);
            });
            this._phaseEl.appendChild(list);
        }

        else if (s.phase === 'vote') {
            const grid = document.createElement('div');
            grid.className = 'viz-vote-grid';

            // Header row
            grid.appendChild(document.createElement('div'));
            const h1 = document.createElement('span');
            h1.className = 'viz-vote-col-label';
            h1.textContent = 'Guest Judges';
            grid.appendChild(h1);
            const h2 = document.createElement('span');
            h2.className = 'viz-vote-col-label';
            h2.textContent = 'Contestant Judges';
            grid.appendChild(h2);

            s.tallies.forEach(t => {
                grid.appendChild(makePill(t.name, 'lead', ''));

                const g = document.createElement('span');
                g.className = 'viz-vote-count';
                g.textContent = t.guestVotes + ' vote' + (t.guestVotes === 1 ? '' : 's');
                grid.appendChild(g);

                const c = document.createElement('span');
                c.className = 'viz-vote-count';
                c.textContent = t.contestantVotes + ' vote' + (t.contestantVotes === 1 ? '' : 's');
                grid.appendChild(c);
            });

            this._phaseEl.appendChild(grid);
        }

        else if (s.phase === 'winner') {
            const banner = document.createElement('div');
            banner.className = 'viz-winner-banner';

            const crown = document.createElement('div');
            crown.className = 'viz-winner-crown';
            crown.textContent = '🏆';
            banner.appendChild(crown);

            const winnerPill = makePill(s.winner, 'lead', 'winner');
            winnerPill.classList.add('viz-winner-pill');
            banner.appendChild(winnerPill);

            const winnerLabel = document.createElement('div');
            winnerLabel.className = 'viz-winner-label';
            winnerLabel.textContent = 'Tie-Break Winner';
            banner.appendChild(winnerLabel);

            this._phaseEl.appendChild(banner);

            if (s.others.length) {
                const others = document.createElement('div');
                others.className = 'viz-others';
                const otherLabel = document.createElement('span');
                otherLabel.textContent = 'Also competed: ';
                otherLabel.style.color = 'var(--text-muted)';
                otherLabel.style.fontSize = '13px';
                others.appendChild(otherLabel);
                s.others.forEach(name => {
                    others.appendChild(makePill(name, 'lead', 'loser'));
                });
                this._phaseEl.appendChild(others);
            }
        }
    }

    start() {
        this._render();
    }
}

// ─── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    setupExplainerTabs();
    const qEl = document.getElementById('explainer-queue');
    const oEl = document.getElementById('explainer-outcomes');
    const tEl = document.getElementById('explainer-tiebreak');
    if (qEl) new QueueExplainer(qEl).start();
    if (oEl) new OutcomesExplainer(oEl).start();
    if (tEl) new TiebreakExplainer(tEl).start();
});
