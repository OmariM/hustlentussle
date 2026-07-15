/**
 * Results domain: the final-results screen (tables, battle graphic, round
 * history), the battle-payload editor modal (shared with the YTD admin via
 * window.openBattlePayloadEditor), the social-image export, and the battle
 * JSON download.
 *
 * Owns the rendered-results payload (`currentResultsData`) and the raw
 * uploaded hustlentussle.battle payload. app.js wires live-game accessors via
 * initResultsDeps() and calls initResultsUI() once the DOM is ready.
 */

import { getResults } from './api';
import { stopDisplayPolling } from './display';
import { downloadCanvasAsPng, fitNameToBox, getSocialTheme, isDarkTheme, roundRect, singleLineBaseline, slugify, SOCIAL_H, SOCIAL_W } from './socialImage';
import type { FitNameResult } from './socialImage';
import { getSpotifyToken, isSpotifyEnabled } from './spotify';
import { showToast } from './toast';
import type {
    BattleExportV1,
    ExportParticipant,
    ExportRound,
    ResultRow,
    ResultsResponse,
    ResultsRound,
    RoundPairs,
    ScoreboardRow,
} from './types';

export type ResultsData = ResultsResponse & { uploaded?: boolean };

interface ResultsDeps {
    getSessionId: () => string | null;
    getGuestJudges: () => string[];
    /** Sync the live scoreboard globals in app.ts (kept for the battle screen). */
    setScoreboard: (leads: ScoreboardRow[], follows: ScoreboardRow[]) => void;
    getScoreboard: () => { leads: ScoreboardRow[]; follows: ScoreboardRow[] };
}

let deps: ResultsDeps | null = null;

export function initResultsDeps(d: ResultsDeps): void {
    deps = d;
}

// ---- Results-owned state ----

let currentResultsData: ResultsData | null = null; // last rendered results payload (for /results hydration)
let uploadedBattlePayload: BattleExportV1 | null = null; // raw payload for the uploaded file being viewed/edited

// State for the generalized battle-payload editor (#edit-results-modal). Kept separate from
// uploadedBattlePayload since the same modal is also used to edit already-published
// YTD battles (see web/js/ytd.ts) - reusing that variable here would corrupt whichever flow
// isn't currently using the modal (the results-screen download button, the edit-button
// visibility gate, etc. all key off uploadedBattlePayload).
let editorPayload: BattleExportV1 | null = null;

export interface EditorMeta {
    name: string;
    battle_date: string;
}

export interface EditorOptions {
    title?: string;
    showMetaFields?: boolean;
    initialMeta?: { name?: string; battle_date?: string | null };
    onSave: (editedPayload: BattleExportV1, meta: EditorMeta | null) => Promise<void>;
}

let editorCallbacks: EditorOptions | null = null;

// Cached data for the social export image (populated by displayResults)
interface RoundBadge {
    round: number;
    win: boolean;
}
let resultsLeadMap = new Map<string, RoundBadge[]>();
let resultsFollowMap = new Map<string, RoundBadge[]>();
let resultsInitialLeads: string[] = [];
let resultsInitialFollows: string[] = [];
let resultsTopLeadName: string | null = null;
let resultsTopFollowName: string | null = null;
let resultsGuestJudges: string[] = [];
const resultsEventTitle: string | null = null; // custom subtitle; falls back to "Month Edition (Year)"

/** Minimal round shape shared by ResultsRound and ExportRound (rounds/raw-payload interchangeably). */
interface RoundLike {
    round_num: number;
    pairs: RoundPairs | null;
    lead_winner: string | null;
    follow_winner: string | null;
    tiebreak?: boolean;
    tiebreak_leads?: string[];
    tiebreak_follows?: string[];
}

/** Builds per-dancer round win/loss badge maps from a battle's rounds — used both for the
 * currently-displayed results screen and for a raw stored battle payload (social image export). */
function buildRoundMaps(rounds: RoundLike[]): { leadMap: Map<string, RoundBadge[]>; followMap: Map<string, RoundBadge[]> } {
    const leadMap = new Map<string, RoundBadge[]>();
    const followMap = new Map<string, RoundBadge[]>();
    rounds.forEach(r => {
        const roundNum = r.round_num;
        const push = (map: Map<string, RoundBadge[]>, name: string, win: boolean): void => {
            if (!map.has(name)) map.set(name, []);
            map.get(name)?.push({ round: roundNum, win });
        };
        if (r.tiebreak) {
            (r.tiebreak_leads || []).forEach(name => push(leadMap, name, r.lead_winner === name));
            (r.tiebreak_follows || []).forEach(name => push(followMap, name, r.follow_winner === name));
            return;
        }
        const pair1Lead = r.pairs?.pair_1?.lead;
        const pair1Follow = r.pairs?.pair_1?.follow;
        const pair2Lead = r.pairs?.pair_2?.lead;
        const pair2Follow = r.pairs?.pair_2?.follow;
        if (pair1Lead) push(leadMap, pair1Lead, r.lead_winner === pair1Lead);
        if (pair2Lead) push(leadMap, pair2Lead, r.lead_winner === pair2Lead);
        if (pair1Follow) push(followMap, pair1Follow, r.follow_winner === pair1Follow);
        if (pair2Follow) push(followMap, pair2Follow, r.follow_winner === pair2Follow);
    });
    return { leadMap, followMap };
}

export function setUploadedBattlePayload(payload: BattleExportV1 | null): void {
    uploadedBattlePayload = payload;
}

/** Clear results state for a fresh competition (called from resetCompetition). */
export function resetResultsState(): void {
    currentResultsData = null;
    uploadedBattlePayload = null;
}

// ---- Router hydration ----

// Navigate to the results screen for a given payload, updating the URL.
export function showResults(data: ResultsData, opts?: { sessionId?: string | null }): void {
    currentResultsData = data;
    let sid: string | null | undefined;
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'sessionId')) sid = opts.sessionId;
    else sid = (data && data.session_id) ? data.session_id : deps?.getSessionId();
    window.navigate?.(sid ? '/results/' + encodeURIComponent(sid) : '/results');
}

// Enter /results/<id> (or /results with in-memory data): render final results.
export function hydrateResultsRoute(sid: string | null): void {
    if (!sid) {
        if (currentResultsData) void displayResults(currentResultsData);
        else window.navigate?.('/', { replace: true });
        return;
    }
    if (currentResultsData && currentResultsData.session_id === sid) {
        void displayResults(currentResultsData);
        return;
    }
    getResults(sid)
        .then(data => { currentResultsData = data; void displayResults(data); })
        .catch(() => {
            try { showToast('Those results were not found or have expired.', 'error'); } catch { /* ignore */ }
            window.navigate?.('/', { replace: true });
        });
}

// ---- Results screen rendering ----

export async function displayResults(data: ResultsData): Promise<void> {
    console.log('Displaying results with data:', data);

    // Ensure display mode polling is stopped when showing results
    stopDisplayPolling();

    const resultsScreen = document.getElementById('results-screen');
    if (resultsScreen) window.showScreen?.(resultsScreen);

    // Editing is only offered for battles loaded via file upload (no live session behind them)
    const editResultsBtn = document.getElementById('edit-results-btn');
    if (editResultsBtn) {
        editResultsBtn.style.display = (data.uploaded && uploadedBattlePayload) ? '' : 'none';
    }

    // Flag points that don't match the round history — uploaded/edited files can drift;
    // a live battle's points always come straight from the game engine, so skip the noise there.
    const resultsIssues = data.uploaded ? findPointsInconsistencies(data.leads, data.follows, data.rounds) : [];
    renderConsistencyWarnings('results-consistency-warning', 'results-consistency-list', resultsIssues);

    // Clear previous results
    const leadResultsBody = document.getElementById('lead-results-body');
    const followResultsBody = document.getElementById('follow-results-body');
    const roundsContainer = document.getElementById('rounds-accordion');
    const leadsInitialOrder = document.getElementById('leads-initial-order');
    const followsInitialOrder = document.getElementById('follows-initial-order');
    const leadGraphic = document.getElementById('lead-graphic');
    const followGraphic = document.getElementById('follow-graphic');

    if (!leadResultsBody || !followResultsBody || !roundsContainer) {
        console.error('Could not find required elements for results display');
        return;
    }

    // Clear all previous data
    leadResultsBody.innerHTML = '';
    followResultsBody.innerHTML = '';
    roundsContainer.innerHTML = '';
    if (leadsInitialOrder) leadsInitialOrder.innerHTML = '';
    if (followsInitialOrder) followsInitialOrder.innerHTML = '';
    if (leadGraphic) leadGraphic.innerHTML = '';
    if (followGraphic) followGraphic.innerHTML = '';

    // Sync the shared scoreboard so exportSocialImage() has current data
    deps?.setScoreboard(data.leads || [], data.follows || []);

    // Always use the initial order from the server response
    const initialLeadsData = data.initial_leads || [];
    const initialFollowsData = data.initial_follows || [];

    // Crown the resolved battle champion (threshold / tie-break / early-end leader).
    // Falls back to the top scorer only if champion info is absent.
    const champions = data.champions;
    function crownName(role: 'lead' | 'follow', list: ResultRow[]): string | null {
        if (champions && champions[role] !== undefined) {
            // Champion info present: trust it — a null name means no outright winner.
            return champions[role] && champions[role].name ? champions[role].name : null;
        }
        // Legacy payload without champions: fall back to the top scorer.
        if (Array.isArray(list) && list.length > 0) {
            const top = list.reduce((best, c) =>
                (Number(c.points) || 0) > (Number(best.points) || 0) ? c : best, list[0]);
            return top && top.name ? top.name : null;
        }
        return null;
    }
    const topLeadName = crownName('lead', data.leads);
    const topFollowName = crownName('follow', data.follows);

    const renderResultRows = (list: ResultRow[] | undefined, topName: string | null, tbody: HTMLElement): void => {
        if (!list || !Array.isArray(list)) {
            console.warn('No results data available');
            return;
        }
        list.forEach(entry => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            const crown = (topName && entry.name === topName) ? ' 👑' : '';
            nameCell.textContent = `${entry.name}${crown}`.trim();
            const pointsCell = document.createElement('td');
            pointsCell.textContent = String(entry.points);
            row.appendChild(nameCell);
            row.appendChild(pointsCell);
            tbody.appendChild(row);
        });
    };
    renderResultRows(data.leads, topLeadName, leadResultsBody);
    renderResultRows(data.follows, topFollowName, followResultsBody);

    // Build battle graphic data: map contestant to rounds and wins
    if (Array.isArray(data.rounds) && data.rounds.length > 0 && leadGraphic && followGraphic) {
        const { leadMap, followMap } = buildRoundMaps(data.rounds);

        // Helper to render a column by initial order
        const renderGraphicColumn = (initialOrder: string[], dataMap: Map<string, RoundBadge[]>, topName: string | null, container: HTMLElement): void => {
            initialOrder.forEach((name, idx) => {
                const row = document.createElement('div');
                row.className = 'graphic-row';
                const rank = document.createElement('div');
                rank.className = 'graphic-rank';
                rank.textContent = `${idx + 1}.`;
                const nameDiv = document.createElement('div');
                nameDiv.className = 'graphic-name';
                nameDiv.textContent = name;
                if (topName && name === topName) {
                    const crown = document.createElement('span');
                    crown.className = 'crown-icon';
                    crown.textContent = '👑';
                    nameDiv.appendChild(crown);
                }
                const badges = document.createElement('div');
                badges.className = 'round-badges';
                const rounds = dataMap.get(name) || [];
                // Sort rounds ascending by round number
                rounds.sort((a, b) => a.round - b.round);
                rounds.forEach(info => {
                    const b = document.createElement('div');
                    b.className = 'badge' + (info.win ? ' win' : '');
                    b.textContent = String(info.round);
                    badges.appendChild(b);
                });
                row.appendChild(rank);
                row.appendChild(nameDiv);
                row.appendChild(badges);
                container.appendChild(row);
            });
        };

        renderGraphicColumn(initialLeadsData || [], leadMap, topLeadName, leadGraphic);
        renderGraphicColumn(initialFollowsData || [], followMap, topFollowName, followGraphic);

        // Cache for social export
        resultsLeadMap = leadMap;
        resultsFollowMap = followMap;
        resultsInitialLeads = [...(initialLeadsData || [])];
        resultsInitialFollows = [...(initialFollowsData || [])];
        resultsTopLeadName = topLeadName;
        resultsTopFollowName = topFollowName;
        const guestJudges = deps?.getGuestJudges() || [];
        resultsGuestJudges = guestJudges.length > 0
            ? [...guestJudges]
            : (() => {
                // Fallback: extract unique judge names from rounds data
                // (handles page-reload case where the guestJudges global was reset)
                const seen = new Set<string>();
                (data.rounds || []).forEach(r => {
                    if (Array.isArray(r.judges)) r.judges.forEach(j => seen.add(j));
                });
                return [...seen];
            })();
    }

    // Always render round history; optionally enrich with Spotify metadata if enabled
    if (isSpotifyEnabled() && data.rounds && data.rounds.length > 0) {
        try {
            const access_token = await getSpotifyToken();

            // Fetch metadata for all rounds in parallel
            await Promise.all(data.rounds.map(async (round) => {
                if (!round.song_info || !round.song_info.spotify_url) return;
                try {
                    const spotifyUrl = new URL(round.song_info.spotify_url);
                    const trackId = spotifyUrl.pathname.split('/').pop();
                    if (!trackId) return;

                    const applyMetadata = (metadata: { name: string; artists: Array<{ name: string }> }): void => {
                        if (!round.song_info) return;
                        round.song_info.title = metadata.name;
                        round.song_info.artist = metadata.artists.map(artist => artist.name).join(', ');
                    };
                    const metadataResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                        headers: { 'Authorization': `Bearer ${access_token}` },
                    });
                    if (metadataResponse.status === 401) {
                        // Token expired, get a new one and retry
                        const newToken = await getSpotifyToken();
                        const retryResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                            headers: { 'Authorization': `Bearer ${newToken}` },
                        });
                        if (retryResponse.ok) applyMetadata(await retryResponse.json());
                    } else if (metadataResponse.ok) {
                        applyMetadata(await metadataResponse.json());
                    }
                } catch (e) {
                    console.error(`Error fetching metadata for ${round.song_info.spotify_url}:`, e);
                }
            }));
        } catch (error) {
            console.error('Error fetching Spotify metadata:', error);
        }
        // Fallthrough to render below
    }

    // Display round history regardless of Spotify status
    if (data.rounds && data.rounds.length > 0) {
        displayRoundHistory(data.rounds);
    } else {
        console.warn('No round history data available');
    }

    showToast('Battle complete!', 'success');
}

function displayRoundHistory(rounds: ResultsRound[]): void {
    const roundsContainer = document.getElementById('rounds-accordion');
    if (!roundsContainer) return;
    roundsContainer.innerHTML = '';

    const guestJudges = deps?.getGuestJudges() || [];

    // Sort rounds by round number
    rounds.sort((a, b) => a.round_num - b.round_num);

    // Create an accordion item for each round
    rounds.forEach(round => {
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item' + (round.tiebreak ? ' tiebreak' : '');

        // Create the header
        const header = document.createElement('div');
        header.className = 'accordion-header' + (round.tiebreak ? ' tiebreak' : '');
        const headerLabel = round.tiebreak
            ? `Round ${round.round_num} <span class="tiebreak-history-badge">Tie-Break</span>`
            : `Round ${round.round_num}`;
        header.innerHTML = `<span>${headerLabel}</span><span>+</span>`;

        // Add click handler for accordion functionality
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            if (!content) return;
            const isOpen = content.classList.contains('open');

            // Toggle open state
            header.classList.toggle('active');
            content.classList.toggle('open');

            // Update the plus/minus symbol
            const symbol = header.lastElementChild;
            if (symbol) symbol.textContent = isOpen ? '+' : '-';
        });

        // Create the content
        const content = document.createElement('div');
        content.className = 'accordion-content';

        // Add round details
        const details = document.createElement('div');
        details.className = 'round-details';
        const topRow = document.createElement('div');
        topRow.className = 'round-top-row';

        // Add song information if available
        if (round.song_info) {
            const songSection = document.createElement('div');
            songSection.className = 'round-song';
            let songHTML = '<h4>Song</h4>';

            // Add song title and artist if available
            if (round.song_info.title || round.song_info.artist) {
                songHTML += '<div class="song-details">';
                if (round.song_info.title) {
                    songHTML += `<div class="song-title">${round.song_info.title}</div>`;
                }
                if (round.song_info.artist) {
                    songHTML += `<div class="song-artist">${round.song_info.artist}</div>`;
                }
                songHTML += '</div>';
            }

            if (isSpotifyEnabled() && round.song_info.spotify_url) {
                try {
                    const spotifyUrl = new URL(round.song_info.spotify_url);
                    const trackId = spotifyUrl.pathname.split('/').pop();
                    if (trackId) {
                        songHTML += `
                            <iframe
                                src="https://open.spotify.com/embed/track/${trackId}"
                                width="100%"
                                height="80"
                                frameborder="0"
                                allowtransparency="true"
                                allow="encrypted-media"
                                class="spotify-embed">
                            </iframe>`;
                    }
                } catch (e) {
                    console.error('Invalid Spotify URL:', e);
                }
            }

            songSection.innerHTML = songHTML;
            topRow.appendChild(songSection);
        }

        // Participants section
        const participants = document.createElement('div');
        participants.className = 'round-participants';

        if (round.tiebreak) {
            let html = '<h4>Tie-Break</h4>';
            if (round.tiebreak_leads?.length) {
                html += `<div class="tiebreak-history-group">
                    <span class="tiebreak-history-role-label">Leads</span>
                    <span class="tiebreak-history-names">
                        ${round.tiebreak_leads.map(n =>
                            `<span class="contestant lead${round.lead_winner === n ? ' tiebreak-history-winner' : ''}">${n}${round.lead_winner === n ? ' 🏆' : ''}</span>`
                        ).join('<span class="tiebreak-history-vs">vs</span>')}
                    </span>
                </div>`;
            }
            if (round.tiebreak_follows?.length) {
                html += `<div class="tiebreak-history-group">
                    <span class="tiebreak-history-role-label">Follows</span>
                    <span class="tiebreak-history-names">
                        ${round.tiebreak_follows.map(n =>
                            `<span class="contestant follow${round.follow_winner === n ? ' tiebreak-history-winner' : ''}">${n}${round.follow_winner === n ? ' 🏆' : ''}</span>`
                        ).join('<span class="tiebreak-history-vs">vs</span>')}
                    </span>
                </div>`;
            }
            participants.innerHTML = html;
            topRow.appendChild(participants);
            details.appendChild(topRow);
        } else {
            let participantsHTML = '<h4>Participants</h4>';
            if (round.pairs && Object.keys(round.pairs).length > 0) {
                participantsHTML += `
                    <div class="match-pair">
                        <div>Couple 1:</div>
                        <div><span class="lead">${round.pairs.pair_1.lead}</span> (Lead) &
                        <span class="follow">${round.pairs.pair_1.follow}</span> (Follow)</div>
                    </div>
                    <div class="match-pair">
                        <div>Couple 2:</div>
                        <div><span class="lead">${round.pairs.pair_2.lead}</span> (Lead) &
                        <span class="follow">${round.pairs.pair_2.follow}</span> (Follow)</div>
                    </div>
                `;
                if (round.lead_winner) participantsHTML += `<div class="winner">Lead Winner: ${round.lead_winner}</div>`;
                if (round.follow_winner) participantsHTML += `<div class="winner">Follow Winner: ${round.follow_winner}</div>`;
            } else {
                participantsHTML += '<p>No participant data available for this round.</p>';
            }
            participants.innerHTML = participantsHTML;
            topRow.appendChild(participants);
            details.appendChild(topRow);
        }

        // Add judge votes section (normal rounds only)
        if (round.tiebreak) {
            content.appendChild(details);
            accordionItem.appendChild(header);
            accordionItem.appendChild(content);
            roundsContainer.appendChild(accordionItem);
            return;
        }

        const judgeVotes = document.createElement('div');
        judgeVotes.className = 'judge-votes';
        let judgeVotesHTML = '<h4>Judge Votes</h4>';
        judgeVotesHTML += '<div class="vote-sections">';

        const renderVoteSection = (votes: Record<string, number>, role: 'lead' | 'follow'): string => {
            let html = `<div class="vote-section ${role}"><h5>${role === 'lead' ? 'Lead' : 'Follow'} Votes</h5>`;

            // Sort votes to show guest judges first
            const sortedVotes = Object.entries(votes).sort((a, b) => {
                const aIsGuest = guestJudges.includes(a[0]);
                const bIsGuest = guestJudges.includes(b[0]);
                if (aIsGuest && !bIsGuest) return -1;
                if (!aIsGuest && bIsGuest) return 1;
                return 0;
            });

            html += '<table class="judge-votes-table"><thead><tr><th>Judge</th><th>Type</th><th>Vote</th></tr></thead><tbody>';
            sortedVotes.forEach(([judge, vote]) => {
                const isGuest = guestJudges.includes(judge);
                const voteText = role === 'lead' ? getVoteText(vote, round) : getFollowVoteText(vote, round);
                const judgeType = isGuest ? 'Guest' : 'Contestant';
                html += `
                    <tr class="judge-vote ${isGuest ? 'guest-judge' : ''}">
                        <td class="judge-name">${judge}</td>
                        <td><span class="judge-type ${isGuest ? 'guest' : 'contestant'}">${judgeType}</span></td>
                        <td class="vote">${voteText}</td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
            return html;
        };

        if (round.lead_votes) judgeVotesHTML += renderVoteSection(round.lead_votes, 'lead');
        if (round.follow_votes) judgeVotesHTML += renderVoteSection(round.follow_votes, 'follow');
        judgeVotesHTML += '</div>';
        judgeVotes.innerHTML = judgeVotesHTML;
        details.appendChild(judgeVotes);

        // Append assembled sections
        content.appendChild(details);
        accordionItem.appendChild(header);
        accordionItem.appendChild(content);
        roundsContainer.appendChild(accordionItem);
    });
}

// Helper function to convert vote numbers to text
function getVoteText(vote: number, round: ResultsRound): string {
    if (!round || !round.pairs) return 'Unknown';
    switch (vote) {
        case 1: return round.pairs.pair_1.lead;
        case 2: return round.pairs.pair_2.lead;
        case 3: return 'Tie';
        case 4: return 'No Contest';
        default: return 'Unknown';
    }
}

// Helper function to convert follow vote numbers to text
function getFollowVoteText(vote: number, round: ResultsRound): string {
    if (!round || !round.pairs) return 'Unknown';
    switch (vote) {
        case 1: return round.pairs.pair_1.follow;
        case 2: return round.pairs.pair_2.follow;
        case 3: return 'Tie';
        case 4: return 'No Contest';
        default: return 'Unknown';
    }
}

// ---- Consistency checks (shared by the results screen + editor modal) ----

// Each round win is worth exactly 1 point (see game_logic.py: `winner.points += 1`,
// ties/no-contests award none), so a contestant's recorded points should always equal
// how many rounds they won. Uploaded/edited data can drift from that; flag it rather
// than silently trusting whichever field was typed in.
function computeRoundWinCounts(rounds: Array<{ lead_winner?: string | null; follow_winner?: string | null }>, winnerKey: 'lead_winner' | 'follow_winner'): Record<string, number> {
    const wins: Record<string, number> = {};
    (rounds || []).forEach((r) => {
        const winner = r ? r[winnerKey] : null;
        if (winner) wins[winner] = (wins[winner] || 0) + 1;
    });
    return wins;
}

interface ConsistencyIssue {
    role: string;
    name: string;
    points: number;
    wins: number;
}

function findPointsInconsistencies(
    leads: Array<{ name: string; points: number }>,
    follows: Array<{ name: string; points: number }>,
    rounds: Array<{ lead_winner?: string | null; follow_winner?: string | null }>,
): ConsistencyIssue[] {
    const leadWins = computeRoundWinCounts(rounds, 'lead_winner');
    const followWins = computeRoundWinCounts(rounds, 'follow_winner');
    const issues: ConsistencyIssue[] = [];
    const check = (list: Array<{ name: string; points: number }>, wins: Record<string, number>, role: string): void => {
        (list || []).forEach((p) => {
            if (!p || !p.name) return;
            const recordedPoints = Number(p.points) || 0;
            const roundWins = wins[p.name] || 0;
            if (recordedPoints !== roundWins) {
                issues.push({ role, name: p.name, points: recordedPoints, wins: roundWins });
            }
        });
    };
    check(leads, leadWins, 'Lead');
    check(follows, followWins, 'Follow');
    return issues;
}

function renderConsistencyWarnings(boxId: string, listId: string, issues: ConsistencyIssue[]): void {
    const box = document.getElementById(boxId);
    const list = document.getElementById(listId);
    if (!box || !list) return;
    list.innerHTML = '';
    if (!issues.length) {
        box.classList.add('hidden');
        return;
    }
    issues.forEach((issue) => {
        const li = document.createElement('li');
        li.textContent = `${issue.name} (${issue.role}): ${issue.points} point${issue.points === 1 ? '' : 's'} recorded, but ${issue.wins} round win${issue.wins === 1 ? '' : 's'} in the round history.`;
        list.appendChild(li);
    });
    box.classList.remove('hidden');
}

// ---- Edit Results (uploaded battles only) ----
//
// Uploaded battles never touch the server-side repository (see
// /api/process_uploaded_file), so "editing" means mutating the raw
// hustlentussle.battle payload we kept in memory and re-running it through
// the same backend endpoint used for the original upload — that guarantees
// the display shape (medals, placements) stays in sync with the same rules
// a fresh upload would get.

// Replace every exact-match occurrence of `oldName` anywhere in the payload
// tree (pairs, votes, tiebreak lists, champions, etc.) with `newName`, so a
// contestant rename doesn't leave round history pointing at a stale name.
function deepRenameContestant(node: unknown, oldName: string, newName: string): void {
    if (Array.isArray(node)) {
        node.forEach((val, i) => {
            if (val === oldName) node[i] = newName;
            else if (val && typeof val === 'object') deepRenameContestant(val, oldName, newName);
        });
    } else if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        Object.keys(record).forEach((key) => {
            const val = record[key];
            if (val === oldName) record[key] = newName;
            else if (val && typeof val === 'object') deepRenameContestant(val, oldName, newName);
        });
    }
}

// Mirrors the backend's placement ranking (_export_participants): sorted by
// points desc, ties share a rank.
function computePlacements(entries: Array<{ points: number; placement?: number }>): void {
    const sorted = [...entries].sort((a, b) => (b.points || 0) - (a.points || 0));
    let lastPoints: number | null = null;
    let lastRank = 0;
    sorted.forEach((c, idx) => {
        if (c.points !== lastPoints) {
            lastRank = idx + 1;
            lastPoints = c.points;
        }
        c.placement = lastRank;
    });
}

// Generalized battle-payload editor. `payload` is a raw hustlentussle.battle v1 object;
// `options.onSave(editedPayload, meta)` decides what "save" means for the caller (e.g. the
// results screen reprocesses+redisplays locally, while the YTD admin screen PUTs to the
// server) - see editorCallbacks usage in saveEditedResults(). `options.showMetaFields` shows
// battle name/date inputs (only meaningful for already-published battles, which have a
// separate DB-level name/date from the payload itself); `options.initialMeta` pre-fills them.
export function openEditResultsModal(payload: BattleExportV1, options: EditorOptions): void {
    if (!payload) return;
    editorPayload = payload;
    editorCallbacks = options;

    payload.participants = payload.participants || { leads: [], follows: [] };
    payload.participants.leads = payload.participants.leads || [];
    payload.participants.follows = payload.participants.follows || [];

    const titleEl = document.getElementById('edit-results-title');
    if (titleEl) titleEl.textContent = options.title || 'Edit Results';

    const metaSection = document.getElementById('edit-results-meta');
    if (metaSection) {
        metaSection.style.display = options.showMetaFields ? '' : 'none';
        if (options.showMetaFields) {
            const nameInput = document.getElementById('edit-battle-name') as HTMLInputElement | null;
            const dateInput = document.getElementById('edit-battle-date') as HTMLInputElement | null;
            if (nameInput) nameInput.value = (options.initialMeta && options.initialMeta.name) || '';
            if (dateInput) dateInput.value = (options.initialMeta && options.initialMeta.battle_date) || '';
        }
    }

    renderEditParticipants('edit-leads-body', payload.participants.leads);
    renderEditParticipants('edit-follows-body', payload.participants.follows);
    renderEditChampions(payload);
    renderEditRounds(payload);
    refreshEditConsistencyWarnings();

    const errorEl = document.getElementById('edit-results-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }

    const modal = document.getElementById('edit-results-modal');
    if (modal) modal.classList.remove('hidden');
}
// Exposed so other modules (e.g. web/js/ytd.ts, which is intentionally self-contained and
// doesn't share scope with this file) can reuse this editor without duplicating its ~250
// lines of table/select-building logic.
window.openBattlePayloadEditor = openEditResultsModal;

// Recomputes the points-vs-round-wins warning from whatever is currently typed/selected
// in the modal (not the saved payload), so it updates live as the user edits.
function refreshEditConsistencyWarnings(): void {
    const leadEntries = collectParticipantEdits('edit-leads-body').entries;
    const followEntries = collectParticipantEdits('edit-follows-body').entries;
    const rounds = Array.from(document.querySelectorAll('#edit-rounds-body .edit-round-row')).map((rowEl) => {
        const leadSel = rowEl.querySelector<HTMLSelectElement>('.edit-round-lead-winner');
        const followSel = rowEl.querySelector<HTMLSelectElement>('.edit-round-follow-winner');
        return {
            lead_winner: leadSel ? (leadSel.value || null) : null,
            follow_winner: followSel ? (followSel.value || null) : null,
        };
    });
    const issues = findPointsInconsistencies(leadEntries, followEntries, rounds);
    renderConsistencyWarnings('edit-consistency-warning', 'edit-consistency-list', issues);
}

function closeEditResultsModal(): void {
    const modal = document.getElementById('edit-results-modal');
    if (modal) modal.classList.add('hidden');
}

function buildEditParticipantRow(participant: { name: string; points: number }): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.dataset.originalName = participant.name || '';

    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'edit-name-input';
    nameInput.value = participant.name || '';
    nameCell.appendChild(nameInput);

    const pointsCell = document.createElement('td');
    const pointsInput = document.createElement('input');
    pointsInput.type = 'number';
    pointsInput.min = '0';
    pointsInput.step = '1';
    pointsInput.className = 'edit-points-input';
    pointsInput.value = String(participant.points ?? 0);
    pointsCell.appendChild(pointsInput);

    const removeCell = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn secondary small';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => { row.remove(); refreshEditConsistencyWarnings(); });
    removeCell.appendChild(removeBtn);

    row.appendChild(nameCell);
    row.appendChild(pointsCell);
    row.appendChild(removeCell);
    return row;
}

function renderEditParticipants(tbodyId: string, participants: Array<{ name: string; points: number }>): void {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    participants.forEach((p) => tbody.appendChild(buildEditParticipantRow(p)));
}

function fillChampionSelect(select: HTMLSelectElement | null, names: string[], currentName: string | null): void {
    if (!select) return;
    select.innerHTML = '';
    select.appendChild(new Option('No champion', ''));
    names.forEach((name) => select.appendChild(new Option(name, name, false, name === currentName)));
    if (!currentName) select.value = '';
}

function renderEditChampions(payload: BattleExportV1): void {
    const leadNames = payload.participants.leads.map((p) => p.name).filter(Boolean);
    const followNames = payload.participants.follows.map((p) => p.name).filter(Boolean);
    fillChampionSelect(
        document.getElementById('edit-champion-lead') as HTMLSelectElement | null, leadNames,
        payload.champions && payload.champions.lead ? payload.champions.lead.name : null
    );
    fillChampionSelect(
        document.getElementById('edit-champion-follow') as HTMLSelectElement | null, followNames,
        payload.champions && payload.champions.follow ? payload.champions.follow.name : null
    );
}

function buildEditRoundRow(round: ExportRound): HTMLElement {
    const row = document.createElement('div');
    row.className = 'edit-round-row';
    row.dataset.roundNum = String(round.round_num);

    const label = document.createElement('span');
    label.className = 'edit-round-label';
    label.textContent = round.tiebreak ? `Round ${round.round_num} (Tie-Break)` : `Round ${round.round_num}`;
    row.appendChild(label);

    const leadOptions = round.tiebreak
        ? (round.tiebreak_leads || [])
        : [round.pairs?.pair_1?.lead, round.pairs?.pair_2?.lead].filter((n): n is string => Boolean(n));
    const followOptions = round.tiebreak
        ? (round.tiebreak_follows || [])
        : [round.pairs?.pair_1?.follow, round.pairs?.pair_2?.follow].filter((n): n is string => Boolean(n));

    if (leadOptions.length) {
        const leadSel = document.createElement('select');
        leadSel.className = 'edit-round-lead-winner';
        leadSel.appendChild(new Option('No lead winner', ''));
        leadOptions.forEach((name) => leadSel.appendChild(new Option(name, name, false, name === round.lead_winner)));
        row.appendChild(leadSel);
    }
    if (followOptions.length) {
        const followSel = document.createElement('select');
        followSel.className = 'edit-round-follow-winner';
        followSel.appendChild(new Option('No follow winner', ''));
        followOptions.forEach((name) => followSel.appendChild(new Option(name, name, false, name === round.follow_winner)));
        row.appendChild(followSel);
    }
    return row;
}

function renderEditRounds(payload: BattleExportV1): void {
    const container = document.getElementById('edit-rounds-body');
    if (!container) return;
    container.innerHTML = '';
    const rounds = (payload.rounds || []).slice().sort((a, b) => (a.round_num || 0) - (b.round_num || 0));
    rounds.forEach((round) => container.appendChild(buildEditRoundRow(round)));
}

// Reads the editable rows for one role's table; blank names are treated as removed rows.
function collectParticipantEdits(tbodyId: string): { entries: Array<{ name: string; points: number }>; renames: Array<{ from: string; to: string }> } {
    const tbody = document.getElementById(tbodyId);
    const entries: Array<{ name: string; points: number }> = [];
    const renames: Array<{ from: string; to: string }> = [];
    if (!tbody) return { entries, renames };
    Array.from(tbody.querySelectorAll('tr')).forEach((row) => {
        const name = row.querySelector<HTMLInputElement>('.edit-name-input')?.value.trim() || '';
        if (!name) return;
        const pointsRaw = parseInt(row.querySelector<HTMLInputElement>('.edit-points-input')?.value ?? '', 10);
        const points = Number.isFinite(pointsRaw) ? pointsRaw : 0;
        const originalName = row.dataset.originalName;
        if (originalName && originalName !== name) renames.push({ from: originalName, to: name });
        entries.push({ name, points });
    });
    return { entries, renames };
}

function validateParticipantEdits(entries: Array<{ name: string; points: number }>, label: string): void {
    const seen = new Set<string>();
    entries.forEach((e) => {
        if (seen.has(e.name)) throw new Error(`Duplicate ${label} name: "${e.name}"`);
        seen.add(e.name);
        if (e.points < 0) throw new Error(`${label} "${e.name}" cannot have negative points.`);
    });
}

// Rebuilds payload.participants[role] from the edited rows, preserving
// existing initial_order for known names and appending new ones at the end.
// `championName` (already post-rename) drives is_champion, which is what
// YTD stats ingest (stats/normalize.py) reads for the crown — the top-level
// `champions` object alone only affects this screen's display.
function applyParticipantEdits(payload: BattleExportV1, role: 'leads' | 'follows', entries: Array<{ name: string; points: number }>, championName: string | null): void {
    const existing = payload.participants[role] || [];
    const byName = new Map(existing.map((p) => [p.name, p]));
    const updated = entries.map((e, idx) => {
        const match = byName.get(e.name);
        const base = match || { name: e.name, placement: 0, initial_order: existing.length + idx + 1, points: 0, is_champion: false };
        base.points = e.points;
        base.is_champion = championName != null && e.name === championName;
        return base;
    });
    computePlacements(updated);
    payload.participants[role] = updated;
}

// Re-derives the results-screen display shape by sending the edited payload
// through the same endpoint/validation the original upload used.
export async function reprocessBattlePayload(payload: BattleExportV1): Promise<ResultsData> {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('battle_file', blob, 'edited-battle.json');
    const response = await fetch('/api/process_uploaded_file', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok || data.error) {
        throw new Error(data.error || `Failed to process edited results (${response.status})`);
    }
    return data as ResultsData;
}

async function saveEditedResults(): Promise<void> {
    const errorEl = document.getElementById('edit-results-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }

    const payload = editorPayload;
    if (!payload || !editorCallbacks) return;

    try {
        const leadEdits = collectParticipantEdits('edit-leads-body');
        const followEdits = collectParticipantEdits('edit-follows-body');
        validateParticipantEdits(leadEdits.entries, 'Lead');
        validateParticipantEdits(followEdits.entries, 'Follow');

        // Apply the champion selection and round-winner edits using the *current*
        // names first, then sweep renames afterwards so a freshly-picked name
        // still gets corrected if that same row is also being renamed.
        payload.champions = payload.champions || {};
        const leadChampionSelect = document.getElementById('edit-champion-lead') as HTMLSelectElement | null;
        const followChampionSelect = document.getElementById('edit-champion-follow') as HTMLSelectElement | null;
        const leadChampionName = leadChampionSelect?.value || null;
        const followChampionName = followChampionSelect?.value || null;
        payload.champions.lead = leadChampionName
            ? { points: null, decided_by: null, ...(payload.champions.lead || {}), name: leadChampionName }
            : null;
        payload.champions.follow = followChampionName
            ? { points: null, decided_by: null, ...(payload.champions.follow || {}), name: followChampionName }
            : null;

        document.querySelectorAll<HTMLElement>('#edit-rounds-body .edit-round-row').forEach((rowEl) => {
            const roundNum = Number(rowEl.dataset.roundNum);
            const round = (payload.rounds || []).find((r) => r.round_num === roundNum);
            if (!round) return;
            const leadSel = rowEl.querySelector<HTMLSelectElement>('.edit-round-lead-winner');
            const followSel = rowEl.querySelector<HTMLSelectElement>('.edit-round-follow-winner');
            if (leadSel) round.lead_winner = leadSel.value || null;
            if (followSel) round.follow_winner = followSel.value || null;
        });

        [...leadEdits.renames, ...followEdits.renames].forEach(({ from, to }) => {
            if (from && to && from !== to) deepRenameContestant(payload, from, to);
        });

        // Re-read the champion names post-rename so a renamed champion still matches.
        const finalLeadChampion = payload.champions.lead ? payload.champions.lead.name : null;
        const finalFollowChampion = payload.champions.follow ? payload.champions.follow.name : null;
        applyParticipantEdits(payload, 'leads', leadEdits.entries, finalLeadChampion);
        applyParticipantEdits(payload, 'follows', followEdits.entries, finalFollowChampion);

        const meta: EditorMeta | null = editorCallbacks.showMetaFields
            ? {
                name: (document.getElementById('edit-battle-name') as HTMLInputElement | null)?.value.trim() || '',
                battle_date: (document.getElementById('edit-battle-date') as HTMLInputElement | null)?.value || '',
            }
            : null;
        await editorCallbacks.onSave(payload, meta);
        closeEditResultsModal();
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = (err instanceof Error && err.message) || 'Failed to save changes.';
            errorEl.classList.remove('hidden');
        }
    }
}

// ---- Social image export (Instagram feed post, 4:5) ----

interface BattleImageParams {
    leadsOrder: string[];
    followsOrder: string[];
    leadMap: Map<string, RoundBadge[]>;
    followMap: Map<string, RoundBadge[]>;
    topLeadName: string | null;
    topFollowName: string | null;
    guestJudges: string[];
    subtitleText: string;
}

/** Draws the battle-results social image (header + Leads/Follows cards with round badges)
 * onto a fresh off-DOM canvas. Shared by the live/uploaded results screen export and the
 * admin per-battle export (driven from a stored battle's raw payload). */
function renderBattleResultsCanvas(params: BattleImageParams): HTMLCanvasElement | null {
    const { leadsOrder, followsOrder, leadMap, followMap, topLeadName, topFollowName, guestJudges, subtitleText } = params;
    const W = SOCIAL_W;
    const H = SOCIAL_H;
    const PAD = 50;

    const C = getSocialTheme(isDarkTheme());

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Top accent bar
    ctx.fillStyle = C.accent;
    ctx.fillRect(0, 0, W, 12);

    // --- Header --- (shrunk so more vertical room goes to the cards below; contentStartY
    // is derived from whatever actually rendered here, not a flat constant, so a battle
    // with no guest judges doesn't leave a blank gap where their line would have been)
    const TITLE_SIZE = 44;
    const SUBTITLE_SIZE = 32;
    const JUDGES_SIZE = 28;
    const HEADER_TOP = 20;
    const HEADER_LINE_GAP = 14;

    ctx.textAlign = 'center';
    ctx.fillStyle = C.textPrimary;
    ctx.font = `bold ${TITLE_SIZE}px ${C.fontDisplay}`;
    const titleY = HEADER_TOP + TITLE_SIZE * 0.8;
    ctx.fillText("Hustle n' Tussle", W / 2, titleY);

    ctx.fillStyle = C.textSecondary;
    ctx.font = `400 ${SUBTITLE_SIZE}px ${C.fontBody}`;
    const subtitleY = titleY + SUBTITLE_SIZE * 0.85 + HEADER_LINE_GAP;
    ctx.fillText(subtitleText, W / 2, subtitleY);

    let headerEndY = subtitleY;
    if (guestJudges.length > 0) {
        const judgeLabel = guestJudges.length === 1 ? 'Judge' : 'Judges';
        ctx.fillStyle = C.textSecondary;
        ctx.font = `600 ${JUDGES_SIZE}px ${C.fontDisplay}`;
        headerEndY = subtitleY + JUDGES_SIZE * 0.85 + HEADER_LINE_GAP;
        ctx.fillText(`${judgeLabel}: ${guestJudges.join(', ')}`, W / 2, headerEndY);
    }

    const contentStartY = headerEndY + 32;

    // Layout: two side-by-side card columns (Leads | Follows), each sized independently
    // off its own row count so a shorter list doesn't leave dead space below its card.
    const CARD_HEADER_H = 76;   // dark strip at top of each card
    const CARD_PAD_BOTTOM = 16; // padding below last row inside card
    const COLUMN_GAP = 24;      // horizontal gap between the two cards
    const FOOTER_H = 40;
    const ROW_INSET = 12;       // matches the old single-card cardX = PAD - 12 inset
    const MIN_ROW_H = 40;
    const ABSOLUTE_MAX_ROW_H = 200; // hard ceiling regardless of the other column
    const ROW_H_CAP_RATIO = 1.6;    // a column can grow up to this many times the other column's own row height
    const availForRows = (H - FOOTER_H) - contentStartY - (CARD_HEADER_H + CARD_PAD_BOTTOM);

    // A column's row-height cap is relative to the *other* column, not a flat constant: two
    // even lists (e.g. 4 leads vs 4 follows) should both fill the available height with no
    // cap at all, while a lopsided pair (e.g. 1 lead vs 8 follows) still gets bounded so the
    // short column doesn't balloon into a single giant, visually-mismatched row.
    const naturalRowH = (count: number): number => count > 0 ? Math.floor(availForRows / count) : ABSOLUTE_MAX_ROW_H;
    const rowHCapFor = (otherCount: number): number =>
        Math.min(ABSOLUTE_MAX_ROW_H, Math.max(MIN_ROW_H, naturalRowH(otherCount)) * ROW_H_CAP_RATIO);

    const columnW = (W - 2 * (PAD - ROW_INSET) - COLUMN_GAP) / 2;
    const leadsCardX = PAD - ROW_INSET;
    const followsCardX = leadsCardX + columnW + COLUMN_GAP;

    // Badge geometry is shared across both columns (same width) so a given round's badge
    // is the same physical size in the Leads and Follows cards.
    const rankW = 40;
    const nameToBadgeGap = 16;
    const rowContentW = columnW - 2 * ROW_INSET;
    const badgeAreaW = 230; // widened at the name column's expense so badges render bigger
    const nameAreaW = rowContentW - rankW - nameToBadgeGap - badgeAreaW;
    const badgeGap = 4;
    const badgeRowGap = 6;

    // Use the most rounds any individual dancer competed in (not total game rounds) so the
    // badge row fills the full width for the most active dancer.
    const allRoundCounts = [
        ...leadsOrder.map(n => (leadMap.get(n) || []).length),
        ...followsOrder.map(n => (followMap.get(n) || []).length),
    ];
    const maxRoundsPerDancer = Math.max(...allRoundCounts, 1);

    const leadsRowHCap = rowHCapFor(followsOrder.length);
    const followsRowHCap = rowHCapFor(leadsOrder.length);
    const leadsRowHBaseline = leadsOrder.length > 0
        ? Math.max(MIN_ROW_H, Math.min(leadsRowHCap, naturalRowH(leadsOrder.length)))
        : leadsRowHCap;
    const followsRowHBaseline = followsOrder.length > 0
        ? Math.max(MIN_ROW_H, Math.min(followsRowHCap, naturalRowH(followsOrder.length)))
        : followsRowHCap;

    // Badge mode/size: shrink to fit one row first; if a single row wouldn't reach a
    // genuinely good size (not just "technically legible"), wrap onto a second row instead
    // (same "shrink, then wrap" approach already used for names) — two rows of bigger
    // badges reads better than one cramped row. Decided once, using the tighter of the two
    // columns' baseline row heights as the single-row size cap.
    const TARGET_BADGE_SIZE = 26; // stay on 1 row only if it reaches this size
    const MAX_BADGE_SIZE = 34;    // cap even in 2-row mode so a moderate round count doesn't overshoot into oversized badges
    const BADGE_FLOOR = 13;       // hard floor once wrapped to 2 rows
    const singleRowSize = Math.floor((badgeAreaW + badgeGap) / maxRoundsPerDancer) - badgeGap;
    const badgeRowHCap = Math.min(leadsRowHBaseline, followsRowHBaseline);
    let badgeRows: 1 | 2;
    let badgeSize: number;
    if (singleRowSize >= TARGET_BADGE_SIZE) {
        badgeRows = 1;
        badgeSize = Math.max(TARGET_BADGE_SIZE, Math.min(badgeRowHCap - 18, singleRowSize));
    } else {
        const perRow = Math.ceil(maxRoundsPerDancer / 2);
        const doubleRowSize = Math.floor((badgeAreaW + badgeGap) / perRow) - badgeGap;
        badgeRows = 2;
        badgeSize = Math.max(BADGE_FLOOR, Math.min(MAX_BADGE_SIZE, doubleRowSize));
    }
    const bFontSize = Math.max(9, Math.round(badgeSize * 0.52));
    const perLineBadgeCount = Math.floor((badgeAreaW + badgeGap) / (badgeSize + badgeGap));

    const nameFontSizeFor = (rowH: number): number => Math.max(20, Math.min(44, rowH - 26));
    const rankFontSizeFor = (nameFontSize: number): number => Math.max(18, nameFontSize - 4);
    const minNameFontSizeFor = (nameFontSize: number): number => Math.max(18, Math.round(nameFontSize * 0.7));

    // A name that doesn't fit on one line even after shrinking wraps onto two lines instead
    // of being cut short (see fitNameToBox in socialImage.ts); a dancer with more round
    // badges than fit on one line at the shared badgeSize gets a second badge row instead of
    // shrinking past legibility. Either reason a row needs more height uses the same
    // WRAP_ROWS multiplier — the row simply grows to fit whichever needs more room.
    const WRAP_ROWS = 1.7;

    interface PlannedRow {
        fit: FitNameResult;
        isTop: boolean;
        badgeRowsUsed: 1 | 2;
        height: number;
    }
    interface SectionPlan {
        rows: PlannedRow[];
        totalHeight: number;
        rankFontSize: number;
    }

    const roundsFor = (map: Map<string, RoundBadge[]>, name: string): number => (map.get(name) || []).length;

    // Solves this column's row height independently of the other column: bigger rows for a
    // shorter list, no shared "sized off the larger list" dead space.
    const planColumn = (order: string[], map: Map<string, RoundBadge[]>, topName: string | null, rowHBaseline: number, rowHCap: number): SectionPlan => {
        const buildAt = (rowH: number): SectionPlan => {
            const nameFontSize = nameFontSizeFor(rowH);
            const rankFontSize = rankFontSizeFor(nameFontSize);
            const minNameFontSize = minNameFontSizeFor(nameFontSize);
            let totalHeight = 0;
            const rows = order.map(name => {
                const isTop = name === topName;
                const fit = fitNameToBox(ctx, name, nameAreaW, nameFontSize, minNameFontSize, C.fontBody, isTop);
                const n = roundsFor(map, name);
                const badgeRowsUsed: 1 | 2 = (badgeRows === 2 && n > perLineBadgeCount) ? 2 : 1;
                const badgeStackH = badgeRowsUsed === 2 ? (2 * badgeSize + badgeRowGap + 14) : 0;
                const multiplier = Math.max(
                    1,
                    fit.lines.length === 2 ? WRAP_ROWS : 1,
                    badgeRowsUsed === 2 ? Math.max(1, badgeStackH / rowH) : 1,
                );
                const height = rowH * multiplier;
                totalHeight += height;
                return { fit, isTop, badgeRowsUsed, height };
            });
            return { rows, totalHeight, rankFontSize };
        };

        let plan = buildAt(rowHBaseline);
        const effectiveUnits = plan.rows.reduce((sum, r) => sum + r.height / rowHBaseline, 0);
        if (order.length > 0 && effectiveUnits > order.length) {
            const rowHFinal = Math.max(MIN_ROW_H, Math.min(rowHCap, Math.floor(availForRows / effectiveUnits)));
            plan = buildAt(rowHFinal);
        }
        return plan;
    };

    const leadsPlan = planColumn(leadsOrder, leadMap, topLeadName, leadsRowHBaseline, leadsRowHCap);
    const followsPlan = planColumn(followsOrder, followMap, topFollowName, followsRowHBaseline, followsRowHCap);

    const drawSection = (
        order: string[],
        map: Map<string, RoundBadge[]>,
        label: string,
        cardX: number,
        plan: SectionPlan,
    ): void => {
        const CARD_RADIUS = 20;
        const startY = contentStartY;
        const cardH = CARD_HEADER_H + plan.totalHeight + CARD_PAD_BOTTOM;

        // Card background
        roundRect(ctx, cardX, startY, columnW, cardH, CARD_RADIUS);
        ctx.fillStyle = C.bgCard;
        ctx.fill();

        // Accent header strip — clipped to card shape so top corners are rounded
        ctx.save();
        roundRect(ctx, cardX, startY, columnW, cardH, CARD_RADIUS);
        ctx.clip();
        ctx.fillStyle = C.accent;
        ctx.fillRect(cardX, startY, columnW, CARD_HEADER_H);
        ctx.restore();

        // Card border
        roundRect(ctx, cardX, startY, columnW, cardH, CARD_RADIUS);
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Section label — white bold uppercase in header strip
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 52px ${C.fontDisplay}`;
        ctx.textAlign = 'left';
        ctx.fillText(label.toUpperCase(), cardX + 24, startY + CARD_HEADER_H - 18);

        const rowsStartY = startY + CARD_HEADER_H;
        let rowY = rowsStartY;
        const rowPad = cardX + ROW_INSET;
        const nameX = rowPad + rankW;
        const badgeStartX = nameX + nameAreaW + nameToBadgeGap;

        order.forEach((name, idx) => {
            const { fit, isTop, badgeRowsUsed, height: rowHeight } = plan.rows[idx];
            const isWrapped = fit.lines.length === 2;

            // Alternating row tint — scoped to this column's own bounds (not the full canvas
            // width), since there are now two side-by-side cards, not one full-width card.
            if (idx % 2 === 0) {
                ctx.fillStyle = C.rowAlt;
                ctx.fillRect(cardX + 4, rowY + 1, columnW - 8, rowHeight - 1);
            }

            // Rank — same baseline formula as a normal row; centered instead for a wrapped row,
            // whose height doesn't match what that formula was tuned for. Uses the proportional
            // body font, not the mono font used for badges/points: a monospace "1." reserves a
            // full fixed-width cell for the narrow "1" glyph, leaving a visible gap before the
            // period that a proportional font's natural kerning doesn't have.
            const rankBaseY = singleLineBaseline(rowY, rowHeight, plan.rankFontSize, isWrapped);
            ctx.fillStyle = C.textMuted;
            ctx.font = `400 ${plan.rankFontSize}px ${C.fontBody}`;
            ctx.textAlign = 'left';
            ctx.fillText((idx + 1) + '.', rowPad, rankBaseY);

            // Name (1 or 2 lines, per fitNameToBox) + crown — clipped to the row's full height
            // so a wrapped second line (or a bleeding crown) never spills into the badge area.
            ctx.save();
            ctx.beginPath();
            ctx.rect(nameX, rowY, nameAreaW, rowHeight);
            ctx.clip();
            ctx.fillStyle = isTop ? C.textPrimary : C.textSecondary;
            ctx.font = isTop
                ? `bold ${fit.fontSize}px ${C.fontBody}`
                : `400 ${fit.fontSize}px ${C.fontBody}`;

            let lastLineY: number;
            if (!isWrapped) {
                lastLineY = rowY + rowHeight * 0.64;
                ctx.fillText(fit.lines[0], nameX, lastLineY);
            } else {
                const lineGap = fit.fontSize * 1.15;
                const line1Y = rowY + rowHeight / 2 - lineGap / 2 + fit.fontSize * 0.35;
                lastLineY = line1Y + lineGap;
                ctx.fillText(fit.lines[0], nameX, line1Y);
                ctx.fillText(fit.lines[1], nameX, lastLineY);
            }
            if (isTop) {
                const lastLineW = ctx.measureText(fit.lines[fit.lines.length - 1]).width;
                ctx.font = `${fit.fontSize}px serif`;
                ctx.fillText('👑', nameX + lastLineW + 5, lastLineY);
            }
            ctx.restore();

            // Round badges — one or two rows of circles (see badgeRowsUsed), vertically
            // centered as a block on the row's actual height.
            const rounds = (map.get(name) || []).slice().sort((a, b) => a.round - b.round);
            const drawBadgeRow = (roundsInRow: RoundBadge[], cy: number): void => {
                roundsInRow.forEach((info, bi) => {
                    const cx = badgeStartX + bi * (badgeSize + badgeGap) + badgeSize / 2;
                    const r = badgeSize / 2;

                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = info.win ? C.badgeWin : C.badgeLose;
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
                    ctx.strokeStyle = info.win ? C.badgeWinBorder : C.badgeLoseBorder;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = info.win ? C.badgeWinText : C.badgeLoseText;
                    ctx.font = `bold ${bFontSize}px ${C.fontMono}`;
                    ctx.textAlign = 'center';
                    ctx.fillText(String(info.round), cx, cy + bFontSize * 0.37);
                });
            };

            if (badgeRowsUsed === 1) {
                drawBadgeRow(rounds, rowY + rowHeight / 2);
            } else {
                const row1Count = Math.ceil(rounds.length / 2);
                drawBadgeRow(rounds.slice(0, row1Count), rowY + rowHeight / 2 - (badgeSize + badgeRowGap) / 2);
                drawBadgeRow(rounds.slice(row1Count), rowY + rowHeight / 2 + (badgeSize + badgeRowGap) / 2);
            }

            rowY += rowHeight;
        });
    };

    drawSection(leadsOrder, leadMap, 'Leads', leadsCardX, leadsPlan);
    drawSection(followsOrder, followMap, 'Follows', followsCardX, followsPlan);

    return canvas;
}

async function exportSocialImage(): Promise<void> {
    await document.fonts.ready;

    const scoreboard = deps?.getScoreboard() || { leads: [], follows: [] };
    const sortedLeads = [...scoreboard.leads].sort((a, b) => (b.points || 0) - (a.points || 0));
    const sortedFollows = [...scoreboard.follows].sort((a, b) => (b.points || 0) - (a.points || 0));

    const leadsOrder = resultsInitialLeads.length ? resultsInitialLeads : sortedLeads.map(l => l.name);
    const followsOrder = resultsInitialFollows.length ? resultsInitialFollows : sortedFollows.map(f => f.name);

    const now = new Date();
    const subtitleText = resultsEventTitle
        || `${now.toLocaleDateString('en-US', { month: 'long' })} Edition (${now.getFullYear()})`;

    const canvas = renderBattleResultsCanvas({
        leadsOrder,
        followsOrder,
        leadMap: resultsLeadMap,
        followMap: resultsFollowMap,
        topLeadName: resultsTopLeadName,
        topFollowName: resultsTopFollowName,
        guestJudges: resultsGuestJudges,
        subtitleText,
    });
    if (!canvas) {
        showToast('Failed to generate image', 'error');
        return;
    }
    downloadCanvasAsPng(canvas, 'hnt-results.png', () => showToast('Failed to generate image', 'error'));
}

/** Order a battle's participants by their initial (pre-battle) queue order, falling back to
 * points-desc when initial_order wasn't recorded (e.g. an older export). */
function orderParticipants(list: ExportParticipant[]): string[] {
    const hasOrder = list.length > 0 && list.every(p => p.initial_order !== null && p.initial_order !== undefined);
    const sorted = hasOrder
        ? [...list].sort((a, b) => (a.initial_order as number) - (b.initial_order as number))
        : [...list].sort((a, b) => (b.points || 0) - (a.points || 0));
    return sorted.map(p => p.name);
}

/** Generates the same battle-results social image for a stored battle payload (not the
 * currently-displayed results screen) — used by the YTD admin "Instagram Post" button. */
async function exportBattleImageFromPayload(payload: BattleExportV1, meta: { name: string; battle_date: string }): Promise<void> {
    await document.fonts.ready;

    const leadsOrder = orderParticipants(payload.participants?.leads || []);
    const followsOrder = orderParticipants(payload.participants?.follows || []);
    const { leadMap, followMap } = buildRoundMaps(payload.rounds || []);

    const canvas = renderBattleResultsCanvas({
        leadsOrder,
        followsOrder,
        leadMap,
        followMap,
        topLeadName: payload.champions?.lead?.name ?? null,
        topFollowName: payload.champions?.follow?.name ?? null,
        guestJudges: payload.judges?.guest || [],
        subtitleText: meta.name,
    });
    if (!canvas) {
        showToast('Failed to generate image', 'error');
        return;
    }
    downloadCanvasAsPng(canvas, `hnt-${slugify(meta.name)}-results.png`, () => showToast('Failed to generate image', 'error'));
}
window.exportBattleResultsImage = exportBattleImageFromPayload;

// ---- Battle JSON download ----

async function downloadBattleData(): Promise<void> {
    const sessionId = deps?.getSessionId() || null;
    if (!sessionId && !uploadedBattlePayload) {
        console.error('No active session or uploaded battle to download data from.');
        return;
    }

    try {
        // Live sessions fetch the portable JSON export; uploaded (possibly edited) battles
        // already hold that same shape in memory.
        let battleData: BattleExportV1;
        if (sessionId) {
            const response = await fetch(`/api/export_battle_data?session_id=${sessionId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch battle data: ${response.status}`);
            }
            battleData = await response.json();
        } else {
            battleData = uploadedBattlePayload as BattleExportV1;
        }

        // If Spotify integration is enabled, enrich song title/artist in-place
        if (isSpotifyEnabled()) {
            let access_token = await getSpotifyToken();
            await Promise.all((battleData.rounds || []).map(async (round) => {
                const song = round.song;
                if (!song || !song.spotify_url) return;
                try {
                    const trackId = new URL(song.spotify_url).pathname.split('/').pop();
                    if (!trackId) return;
                    let md = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                        headers: { 'Authorization': `Bearer ${access_token}` }
                    });
                    if (md.status === 401) {
                        access_token = await getSpotifyToken();
                        md = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                            headers: { 'Authorization': `Bearer ${access_token}` }
                        });
                    }
                    if (md.ok) {
                        const meta = await md.json();
                        song.title = meta.name;
                        song.artist = meta.artists.map((a: { name: string }) => a.name).join(', ');
                    }
                } catch (e) {
                    console.error(`Error fetching metadata for ${song.spotify_url}:`, e);
                }
            }));
        }

        // Download the JSON directly
        const blob = new Blob([JSON.stringify(battleData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sessionId ? `battle_${sessionId}.json` : 'battle_edited.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Error downloading battle data:', error);
        showToast('Failed to download battle data', 'error');
    }
}

// ---- DOM wiring (call once the DOM is ready) ----

export function initResultsUI(): void {
    document.getElementById('download-battle-data')?.addEventListener('click', () => void downloadBattleData());
    document.getElementById('export-social-image')?.addEventListener('click', () => void exportSocialImage());

    // Edit Results modal (uploaded battles only)
    const editResultsBtn = document.getElementById('edit-results-btn');
    const editResultsModal = document.getElementById('edit-results-modal');
    if (editResultsBtn) {
        editResultsBtn.addEventListener('click', () => {
            if (!uploadedBattlePayload) return;
            openEditResultsModal(uploadedBattlePayload, {
                title: 'Edit Results',
                showMetaFields: false,
                onSave: async (payload) => {
                    const reprocessed = await reprocessBattlePayload(payload);
                    uploadedBattlePayload = payload;
                    reprocessed.uploaded = true;
                    showResults(reprocessed, { sessionId: null });
                    showToast('Results updated', 'success');
                },
            });
        });
    }
    document.getElementById('edit-results-close')?.addEventListener('click', closeEditResultsModal);
    document.getElementById('edit-results-cancel')?.addEventListener('click', closeEditResultsModal);
    document.getElementById('edit-results-save')?.addEventListener('click', () => void saveEditedResults());
    document.getElementById('edit-add-lead')?.addEventListener('click', () => {
        document.getElementById('edit-leads-body')?.appendChild(buildEditParticipantRow({ name: '', points: 0 }));
        refreshEditConsistencyWarnings();
    });
    document.getElementById('edit-add-follow')?.addEventListener('click', () => {
        document.getElementById('edit-follows-body')?.appendChild(buildEditParticipantRow({ name: '', points: 0 }));
        refreshEditConsistencyWarnings();
    });
    if (editResultsModal) {
        editResultsModal.addEventListener('click', (e) => {
            if (e.target === editResultsModal) closeEditResultsModal();
        });
        // Live-refresh the points-vs-round-wins warning as points/round winners are edited
        editResultsModal.addEventListener('input', refreshEditConsistencyWarnings);
        editResultsModal.addEventListener('change', refreshEditConsistencyWarnings);
    }
}
