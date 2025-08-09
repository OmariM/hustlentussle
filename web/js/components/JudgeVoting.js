import { store } from '../store.js';

function createJudgeVotingCard(judgeName, isGuest, role, option1Name, option2Name) {
  const judgeCard = document.createElement('div');
  judgeCard.className = 'judge-card';
  judgeCard.id = `${role}-judge-${judgeName.replace(/\s+/g, '-').toLowerCase()}`;

  const judgeNameEl = document.createElement('div');
  judgeNameEl.className = 'judge-name';
  judgeNameEl.textContent = judgeName + (isGuest ? ' (Guest)' : '');

  const voteOptions = document.createElement('div');
  voteOptions.className = 'vote-options';

  const mkBtn = (label, className, value) => {
    const btn = document.createElement('button');
    btn.className = `vote-btn ${className}`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      const voting = role === 'lead' ? store.state.leadVotes : store.state.followVotes;
      // Clear previous selection visuals
      voteOptions.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      voting[judgeName] = value;
      store.emit();
    });
    return btn;
  };

  const option1Btn = mkBtn(option1Name, 'vote-option-1', 1);
  const option2Btn = mkBtn(option2Name, 'vote-option-2', 2);
  voteOptions.appendChild(option1Btn);
  voteOptions.appendChild(option2Btn);

  if (isGuest) {
    voteOptions.appendChild(mkBtn('Tie', 'vote-option-tie', 3));
    voteOptions.appendChild(mkBtn('No Contest', 'vote-option-nocontest', 4));
  }

  judgeCard.appendChild(judgeNameEl);
  judgeCard.appendChild(voteOptions);
  return judgeCard;
}

export function renderJudgeVoting(role) {
  const container = document.getElementById(`${role}-judges-container`);
  if (!container) return;
  container.innerHTML = '';

  const option1Name = role === 'lead' ? (document.getElementById('lead1-name')?.textContent || '')
                                      : (document.getElementById('follow1-name')?.textContent || '');
  const option2Name = role === 'lead' ? (document.getElementById('lead2-name')?.textContent || '')
                                      : (document.getElementById('follow2-name')?.textContent || '');

  const allJudges = [...store.state.guestJudges, ...store.state.contestantJudges];
  for (const judge of allJudges) {
    const isGuest = store.state.guestJudges.includes(judge);
    container.appendChild(createJudgeVotingCard(judge, isGuest, role, option1Name, option2Name));
  }
}

export function votesArrayFromStore(role) {
  const votes = role === 'lead' ? store.state.leadVotes : store.state.followVotes;
  const allJudges = [...store.state.guestJudges, ...store.state.contestantJudges];
  const arr = [];
  for (const judge of allJudges) {
    if (votes[judge]) arr.push([judge, votes[judge]]);
  }
  return arr;
}