export const store = {
  state: {
    sessionId: null,
    guestJudges: [],
    contestantJudges: [],
    pairs: null,
    round: 1,
    leads: [],
    follows: [],
    rounds: [],
    initialLeads: [],
    initialFollows: [],
    finished: false,
    leadVotes: {},
    followVotes: {},
  },
  listeners: new Set(),
  set(partial) {
    this.state = { ...this.state, ...partial };
    this.emit();
  },
  resetVotes() {
    this.state.leadVotes = {};
    this.state.followVotes = {};
    this.emit();
  },
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  emit() {
    for (const fn of this.listeners) fn(this.state);
  }
};