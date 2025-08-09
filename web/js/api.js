export async function startGame({ leads, follows, judges }) {
  const resp = await fetch('/api/start_game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads, follows, judges })
  });
  if (!resp.ok) throw new Error('Failed to start game');
  return await resp.json();
}

export async function fetchState(sessionId) {
  const resp = await fetch(`/api/games/${encodeURIComponent(sessionId)}/state`);
  if (!resp.ok) throw new Error('Failed to fetch state');
  return await resp.json();
}

export async function submitCombinedVotes(sessionId, leadVotesArray, followVotesArray, songInfo) {
  const resp = await fetch('/api/judge_combined', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      lead_votes: leadVotesArray,
      follow_votes: followVotesArray,
      song_info: songInfo || {}
    })
  });
  if (!resp.ok) throw new Error('Failed to submit votes');
  return await resp.json();
}

export async function nextRound(sessionId) {
  const resp = await fetch('/api/next_round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  if (!resp.ok) throw new Error('Failed to start next round');
  return await resp.json();
}

export async function endGame(sessionId) {
  const resp = await fetch('/api/end_game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId })
  });
  if (!resp.ok) throw new Error('Failed to end game');
  return await resp.json();
}

export async function getSpotifyToken() {
  const resp = await fetch('/api/get_spotify_token');
  if (!resp.ok) throw new Error('Failed to get Spotify token');
  return await resp.json();
}