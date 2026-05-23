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
        this.paused = false;
        this._timer = null;

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
                label: 'Round 1 — judges vote. Alex wins leads, Jamie wins follows.',
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
                label: 'Losers (Jordan, Taylor) cycle to the back of their queues. Winners stay in.',
                leadsQueue: ['Sam', 'Casey', 'Riley', 'Morgan', 'Jordan'],
                followsQueue: ['Drew', 'Avery', 'Blake', 'Quinn', 'Taylor'],
                couples: [
                    { lead: 'Alex', follow: 'Jamie', num: 1 },
                ],
                leadH: { Alex: 'winner' },
                followH: { Jamie: 'winner' }
            },
            {
                label: 'Round 2 — winners stay. Sam and Drew arrive as new challengers.',
                leadsQueue: ['Casey', 'Riley', 'Morgan', 'Jordan'],
                followsQueue: ['Avery', 'Blake', 'Quinn', 'Taylor'],
                couples: [
                    { lead: 'Alex', follow: 'Jamie', num: 1 },
                    { lead: 'Sam', follow: 'Drew', num: 2 },
                ],
                leadH: {}, followH: {}
            },
            {
                label: 'Round 2 — Sam wins leads, Jamie wins follows. Losers go to the back.',
                leadsQueue: ['Casey', 'Riley', 'Morgan', 'Jordan', 'Alex'],
                followsQueue: ['Avery', 'Blake', 'Quinn', 'Taylor', 'Drew'],
                couples: [
                    { lead: 'Alex', follow: 'Jamie', num: 1 },
                    { lead: 'Sam', follow: 'Drew', num: 2 },
                ],
                leadH: { Sam: 'winner', Alex: 'loser' },
                followH: { Jamie: 'winner', Drew: 'loser' }
            },
            {
                label: 'Round 3 — lead vote is a TIE. No points; the same lead pair dances again next round.',
                leadsQueue: ['Riley', 'Morgan', 'Jordan', 'Alex'],
                followsQueue: ['Blake', 'Quinn', 'Taylor', 'Drew', 'Avery'],
                couples: [
                    { lead: 'Sam', follow: 'Jamie', num: 1 },
                    { lead: 'Casey', follow: 'Avery', num: 2 },
                ],
                leadH: { Sam: 'tied', Casey: 'tied' },
                followH: { Jamie: 'winner', Avery: 'loser' }
            },
            {
                label: 'Round 4 (re-match) — Sam breaks the tie. Casey returns to the back of the leads queue.',
                leadsQueue: ['Riley', 'Morgan', 'Jordan', 'Alex', 'Casey'],
                followsQueue: ['Quinn', 'Taylor', 'Drew', 'Avery', 'Blake'],
                couples: [
                    { lead: 'Sam', follow: 'Jamie', num: 1 },
                    { lead: 'Casey', follow: 'Blake', num: 2 },
                ],
                leadH: { Sam: 'winner', Casey: 'loser' },
                followH: { Jamie: 'winner', Blake: 'loser' }
            },
        ];

        this._build();
    }

    _build() {
        this.container.innerHTML = '';

        const desc = document.createElement('p');
        desc.className = 'explainer-desc';
        desc.textContent = 'Leads and follows are managed as two independent queues. The first two from each queue compete each round. Winners stay in; losers cycle to the back.';
        this.container.appendChild(desc);

        const arena = document.createElement('div');
        arena.className = 'viz-arena';

        // Leads queue column
        const leadsCol = document.createElement('div');
        leadsCol.className = 'viz-queue-col';
        const leadsLabel = document.createElement('div');
        leadsLabel.className = 'viz-queue-label';
        leadsLabel.textContent = 'Leads Queue';
        this._leadsListEl = document.createElement('div');
        this._leadsListEl.className = 'viz-queue-list';
        leadsCol.appendChild(leadsLabel);
        leadsCol.appendChild(this._leadsListEl);

        // Battle stage column
        const stageCol = document.createElement('div');
        stageCol.className = 'viz-stage';
        const stageLabel = document.createElement('div');
        stageLabel.className = 'viz-queue-label';
        stageLabel.textContent = 'Battle Stage';
        this._stageEl = document.createElement('div');
        this._stageEl.className = 'viz-stage-pairs';
        stageCol.appendChild(stageLabel);
        stageCol.appendChild(this._stageEl);

        // Follows queue column
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
        this.container.appendChild(arena);

        this._captionEl = document.createElement('p');
        this._captionEl.className = 'viz-caption';
        this.container.appendChild(this._captionEl);

        const controls = document.createElement('div');
        controls.className = 'viz-controls';
        this._playBtn = document.createElement('button');
        this._playBtn.className = 'viz-play-btn';
        this._playBtn.textContent = '⏸ Pause';
        this._playBtn.addEventListener('click', () => {
            this.paused = !this.paused;
            this._playBtn.textContent = this.paused ? '▶ Play' : '⏸ Pause';
        });
        controls.appendChild(this._playBtn);
        this.container.appendChild(controls);
    }

    _render() {
        const s = this._steps[this.stepIndex];
        this._captionEl.textContent = s.label;

        // Leads queue
        this._leadsListEl.innerHTML = '';
        s.leadsQueue.forEach(name => {
            const p = makePill(name, 'lead', s.leadH[name] || '');
            p.classList.add('anim-in');
            this._leadsListEl.appendChild(p);
        });

        // Follows queue
        this._followsListEl.innerHTML = '';
        s.followsQueue.forEach(name => {
            const p = makePill(name, 'follow', s.followH[name] || '');
            p.classList.add('anim-in');
            this._followsListEl.appendChild(p);
        });

        // Stage
        this._stageEl.innerHTML = '';
        if (s.couples.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'viz-stage-empty';
            empty.textContent = 'Waiting for round to start…';
            this._stageEl.appendChild(empty);
        } else {
            s.couples.forEach(c => {
                const card = document.createElement('div');
                card.className = 'viz-couple-card anim-in';

                if (s.leadH[c.lead] === 'tied') card.classList.add('viz-couple-tied');

                const numLabel = document.createElement('span');
                numLabel.className = 'viz-couple-num';
                numLabel.textContent = 'C' + c.num;
                card.appendChild(numLabel);

                card.appendChild(makePill(c.lead, 'lead', s.leadH[c.lead] || ''));

                const heart = document.createElement('span');
                heart.className = 'viz-heart';
                heart.textContent = '♡';
                card.appendChild(heart);

                card.appendChild(makePill(c.follow, 'follow', s.followH[c.follow] || ''));

                if (s.leadH[c.lead] === 'tied') {
                    card.appendChild(makeOutcomeBadge('tie'));
                }

                this._stageEl.appendChild(card);
            });
        }
    }

    start() {
        this._render();
        this._timer = setInterval(() => {
            if (!this.paused) {
                this.stepIndex = (this.stepIndex + 1) % this._steps.length;
                this._render();
            }
        }, 3000);
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
        this._runTiePanel(tiePanel);

        const ncPanel = document.createElement('div');
        ncPanel.className = 'viz-outcome-panel';
        grid.appendChild(ncPanel);
        this._runNcPanel(ncPanel);
    }

    _runTiePanel(panel) {
        const steps = [
            { label: 'Two dancers compete on stage.', badge: null, extra: null },
            { label: 'All judges vote — it\'s a TIE.', badge: 'tie', extra: null },
            { label: 'No points awarded. The same pair dances again next round. Queue unchanged.', badge: 'tie', extra: 'same' },
        ];
        let idx = 0;

        const titleEl = document.createElement('h3');
        titleEl.className = 'viz-outcome-title';
        titleEl.textContent = 'Tie';
        panel.appendChild(titleEl);

        const stageEl = document.createElement('div');
        stageEl.className = 'viz-outcome-stage';
        panel.appendChild(stageEl);

        const captionEl = document.createElement('p');
        captionEl.className = 'viz-caption';
        panel.appendChild(captionEl);

        const render = () => {
            const s = steps[idx];
            captionEl.textContent = s.label;
            stageEl.innerHTML = '';

            const card = document.createElement('div');
            card.className = 'viz-couple-card' + (s.badge === 'tie' ? ' viz-couple-tied' : '');
            card.appendChild(makePill('Sam', 'lead', s.badge === 'tie' ? 'tied' : ''));
            const heart = document.createElement('span');
            heart.className = 'viz-heart';
            heart.textContent = '♡';
            card.appendChild(heart);
            card.appendChild(makePill('Casey', 'follow', s.badge === 'tie' ? 'tied' : ''));
            if (s.badge) card.appendChild(makeOutcomeBadge(s.badge));
            stageEl.appendChild(card);

            if (s.extra === 'same') {
                const note = document.createElement('div');
                note.className = 'viz-outcome-note';
                note.textContent = '↩ Same matchup repeats';
                stageEl.appendChild(note);
            }
        };

        render();
        setInterval(() => { idx = (idx + 1) % steps.length; render(); }, 2200);
    }

    _runNcPanel(panel) {
        const steps = [
            { label: 'Two dancers compete on stage.', badge: null, showLeaving: false, showFresh: false },
            { label: 'All judges vote — NO CONTEST.', badge: 'no-contest', showLeaving: false, showFresh: false },
            { label: 'No points. Both dancers return to the back of their queues.', badge: 'no-contest', showLeaving: true, showFresh: false },
            { label: 'Fresh contestants arrive from the front of each queue.', badge: null, showLeaving: false, showFresh: true },
        ];
        let idx = 0;

        const titleEl = document.createElement('h3');
        titleEl.className = 'viz-outcome-title';
        titleEl.textContent = 'No Contest';
        panel.appendChild(titleEl);

        const stageEl = document.createElement('div');
        stageEl.className = 'viz-outcome-stage';
        panel.appendChild(stageEl);

        const captionEl = document.createElement('p');
        captionEl.className = 'viz-caption';
        panel.appendChild(captionEl);

        const render = () => {
            const s = steps[idx];
            captionEl.textContent = s.label;
            stageEl.innerHTML = '';

            if (!s.showFresh) {
                const card = document.createElement('div');
                card.className = 'viz-couple-card';
                card.appendChild(makePill('Jordan', 'lead', s.showLeaving ? 'loser' : ''));
                const heart = document.createElement('span');
                heart.className = 'viz-heart';
                heart.textContent = '♡';
                card.appendChild(heart);
                card.appendChild(makePill('Avery', 'follow', s.showLeaving ? 'loser' : ''));
                if (s.badge) card.appendChild(makeOutcomeBadge(s.badge));
                stageEl.appendChild(card);
            }

            if (s.showLeaving) {
                const note = document.createElement('div');
                note.className = 'viz-outcome-note';
                note.innerHTML = 'Jordan + Avery → <span style="color:var(--text-muted)">back of queue</span>';
                stageEl.appendChild(note);
            }

            if (s.showFresh) {
                const card = document.createElement('div');
                card.className = 'viz-couple-card anim-in';
                card.appendChild(makePill('Riley', 'lead', ''));
                const heart = document.createElement('span');
                heart.className = 'viz-heart';
                heart.textContent = '♡';
                card.appendChild(heart);
                card.appendChild(makePill('Blake', 'follow', ''));
                stageEl.appendChild(card);
                const note = document.createElement('div');
                note.className = 'viz-outcome-note';
                note.textContent = '↑ Fresh pair from front of queue';
                stageEl.appendChild(note);
            }
        };

        render();
        setInterval(() => { idx = (idx + 1) % steps.length; render(); }, 2200);
    }
}

// ─── Animation 3: Tie-Break ─────────────────────────────────────────────────

class TiebreakExplainer {
    constructor(container) {
        this.container = container;
        this.stepIndex = 0;
        this.paused = false;
        this._timer = null;

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
                label: 'Final vote — judges score each tied lead across both sub-rounds.',
                phase: 'vote',
                tallies: [
                    { name: 'Alex', pct: 28 },
                    { name: 'Sam', pct: 62 },
                    { name: 'Jordan', pct: 40 },
                ]
            },
            {
                label: 'Sam wins the tie-break! 🏆',
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

        this._phaseEl = document.createElement('div');
        this._phaseEl.className = 'viz-tiebreak-phase';
        this.container.appendChild(this._phaseEl);

        this._captionEl = document.createElement('p');
        this._captionEl.className = 'viz-caption';
        this.container.appendChild(this._captionEl);

        const controls = document.createElement('div');
        controls.className = 'viz-controls';
        this._playBtn = document.createElement('button');
        this._playBtn.className = 'viz-play-btn';
        this._playBtn.textContent = '⏸ Pause';
        this._playBtn.addEventListener('click', () => {
            this.paused = !this.paused;
            this._playBtn.textContent = this.paused ? '▶ Play' : '⏸ Pause';
        });
        controls.appendChild(this._playBtn);
        this.container.appendChild(controls);
    }

    _render() {
        const s = this._steps[this.stepIndex];
        this._captionEl.textContent = s.label;
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
                heart.textContent = '♡';
                card.appendChild(heart);
                card.appendChild(makePill(p.follow, 'follow', ''));
                list.appendChild(card);
            });
            this._phaseEl.appendChild(list);
        }

        else if (s.phase === 'vote') {
            const list = document.createElement('div');
            list.className = 'viz-score-list';
            s.tallies.forEach(t => {
                const r = document.createElement('div');
                r.className = 'viz-score-row';
                r.appendChild(makePill(t.name, 'lead', ''));
                const bar = document.createElement('div');
                bar.className = 'viz-score-bar';
                const fill = document.createElement('div');
                fill.className = 'viz-score-fill';
                fill.style.width = '0%';
                bar.appendChild(fill);
                const pts = document.createElement('span');
                pts.className = 'viz-score-pts';
                pts.textContent = t.pct + '%';
                r.appendChild(bar);
                r.appendChild(pts);
                list.appendChild(r);
                setTimeout(() => { fill.style.width = t.pct + '%'; }, 80);
            });
            this._phaseEl.appendChild(list);
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
        this._timer = setInterval(() => {
            if (!this.paused) {
                this.stepIndex = (this.stepIndex + 1) % this._steps.length;
                this._render();
            }
        }, 3200);
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
