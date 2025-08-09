import { store } from '../store.js';
import { renderJudgeVoting } from '../components/JudgeVoting.js';

function el(id) { return document.getElementById(id); }

export function render(state) {
  // Update session display
  const sessionIdDisplay = el('session-id-display');
  if (sessionIdDisplay) sessionIdDisplay.textContent = state.sessionId ? `Session: ${state.sessionId}` : '';

  // Round and pairs
  if (state.pairs) {
    el('round-number').textContent = String(state.round);
    el('lead1-name').textContent = state.pairs.pair_1.lead;
    el('follow1-name').textContent = state.pairs.pair_1.follow;
    el('lead2-name').textContent = state.pairs.pair_2.lead;
    el('follow2-name').textContent = state.pairs.pair_2.follow;
  }

  // Judges lists
  const guestList = el('guest-judges-list');
  if (guestList) {
    guestList.innerHTML = '';
    if (state.guestJudges.length === 0) {
      const div = document.createElement('div');
      div.className = 'judge-item';
      div.textContent = 'No guest judges assigned';
      guestList.appendChild(div);
    } else {
      for (const j of state.guestJudges) {
        const div = document.createElement('div');
        div.className = 'judge-item guest';
        div.textContent = j;
        guestList.appendChild(div);
      }
    }
  }

  const contestantList = el('contestant-judges-list');
  if (contestantList) {
    contestantList.innerHTML = '';
    if (!state.contestantJudges || state.contestantJudges.length === 0) {
      const div = document.createElement('div');
      div.className = 'judge-item';
      div.textContent = 'No contestant judges assigned';
      contestantList.appendChild(div);
    } else {
      for (const j of state.contestantJudges) {
        const div = document.createElement('div');
        div.className = 'judge-item contestant';
        div.textContent = j;
        contestantList.appendChild(div);
      }
    }
  }

  // Scores
  const leadScores = el('current-lead-scores');
  const followScores = el('current-follow-scores');
  if (leadScores && followScores) {
    leadScores.innerHTML = '';
    for (const lead of state.leads) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="score-name">${lead.name}${lead.is_winner ? ' 👑' : ''}</span><span class="score-points">${lead.points}</span>`;
      leadScores.appendChild(li);
    }
    followScores.innerHTML = '';
    for (const f of state.follows) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="score-name">${f.name}${f.is_winner ? ' 👑' : ''}</span><span class="score-points">${f.points}</span>`;
      followScores.appendChild(li);
    }
  }

  // Voting UI
  renderJudgeVoting('lead');
  renderJudgeVoting('follow');

  // Results screen sections are rendered elsewhere when needed
}

// Auto-subscribe default renderer
store.subscribe(render);