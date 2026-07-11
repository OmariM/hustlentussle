/**
 * Shared API payload types — the single home for response/request shapes
 * exchanged with the Flask backend (see web/routes/*.py).
 *
 * Types only: this file must never emit runtime code. Consume it with
 * `import type { ... } from './types'` so esbuild erases the import.
 */

// ---- Year-to-date stats + admin (web/routes/admin_stats.py) ----

export interface AdminMeResponse {
    authenticated: boolean;
    email?: string | null;
}

export interface AdminLoginResponse {
    authenticated?: boolean;
    email?: string;
    error?: string;
}

export interface YtdStandingRow {
    dancer_id: string;
    display_name: string;
    total_points: number;
    crowns: number;
    battles_entered: number;
    round_wins: number;
}

export interface YtdStandingsResponse {
    year: number;
    leads: YtdStandingRow[];
    follows: YtdStandingRow[];
    error?: string;
}

export interface YtdYearsResponse {
    years: number[];
}

export interface BattleSummary {
    id: string;
    name: string;
    battle_date: string | null;
    created_at: string | null;
    source: 'live' | 'upload';
    result_count: number;
}

export interface BattlesResponse {
    battles: BattleSummary[];
}

export interface BattleDetail extends BattleSummary {
    raw_data: BattleExportV1;
}

export interface DancerSummary {
    id: string;
    display_name: string;
    aliases?: string[];
    battles_entered: number;
    result_count: number;
}

export interface DancersResponse {
    dancers: DancerSummary[];
    error?: string;
}

export interface NameResolutionProposal {
    name: string;
    suggested_dancer_id: string | null;
    suggested_display_name: string;
    is_new: boolean;
}

export interface NormalizedResultRow {
    name: string;
    role: 'lead' | 'follow';
    points: number;
    placement: number | null;
    is_champion: boolean;
    round_wins: number;
}

export interface IngestPreviewResponse {
    source: 'live' | 'upload';
    session_id: string | null;
    results: NormalizedResultRow[];
    names: NameResolutionProposal[];
    dancers: Array<Pick<DancerSummary, 'id' | 'display_name'>>;
    raw_payload: BattleExportV1;
    error?: string;
}

/** Maps a battle-file name to an existing dancer id or a new dancer name. */
export type NameResolutions = Record<string, { dancer_id: string } | { new_name: string }>;

export interface ApiErrorResponse {
    error: string;
}

// ---- Battle export file format (hustlentussle.battle v1) ----
// Mirrors build_battle_export() / parse_battle_json() in web/helpers.py.

export interface ChampionInfo {
    name: string | null;
    points: number | null;
    decided_by: 'threshold' | 'tiebreak' | 'points' | null;
}

export interface Champions {
    lead: ChampionInfo | null;
    follow: ChampionInfo | null;
}

export interface ExportParticipant {
    name: string;
    points: number;
    placement: number;
    is_champion: boolean;
    initial_order: number | null;
}

export interface RoundPairs {
    pair_1: { lead: string; follow: string };
    pair_2: { lead: string; follow: string };
}

export interface SongInfo {
    track_name?: string | null;
    artist_name?: string | null;
    spotify_url?: string | null;
    /** Set client-side when Spotify metadata enrichment runs (results/download). */
    title?: string | null;
    artist?: string | null;
    [key: string]: unknown;
}

export interface ExportRound {
    round_num: number;
    pairs: RoundPairs | null;
    lead_winner: string | null;
    follow_winner: string | null;
    lead_votes: Record<string, number> | null;
    follow_votes: Record<string, number> | null;
    judges: string[] | null;
    contestant_judges: string[] | null;
    song: SongInfo | null;
    tiebreak?: boolean;
    tiebreak_leads?: string[];
    tiebreak_follows?: string[];
}

export interface BattleExportV1 {
    format: 'hustlentussle.battle';
    version: 1;
    session_id: string | null;
    exported_at: string;
    metadata: {
        battle_date: string;
        total_rounds: number;
        win_threshold: number | null;
        finished: boolean;
        contestant_judging_enabled: boolean;
    };
    champions: Champions;
    participants: {
        leads: ExportParticipant[];
        follows: ExportParticipant[];
    };
    judges: { guest: string[] };
    rounds: ExportRound[];
}

// ---- Live game state (/api/state, web/helpers.py serialize_state) ----

export interface ScoreboardRow {
    name: string;
    points: number;
    is_winner: boolean;
}

export interface GameStateResponse {
    session_id: string;
    round: {
        number: number;
        pairs: RoundPairs;
        judges: {
            guest: string[];
            contestant: string[];
            simple_contestant_judges: boolean;
            contestant_judging_enabled: boolean;
            num_contestant_judges: number;
            expected_contestant_judges: number;
        };
    };
    scoreboard: { leads: ScoreboardRow[]; follows: ScoreboardRow[] };
    rounds: Array<{
        round_num: number;
        pairs: RoundPairs | null;
        lead_winner: string | null;
        follow_winner: string | null;
    }>;
    thresholds: { win: number; auto_win: number };
    flags: { has_winning_lead: boolean; has_winning_follow: boolean; finished: boolean };
    winners: { lead: string | null; follow: string | null };
    initial_order: { leads: string[]; follows: string[] };
    queue_order: { leads: string[]; follows: string[] };
    tiebreak: {
        active: boolean;
        sub_round: number;
        lead_needed: boolean;
        follow_needed: boolean;
        tied_leads: string[];
        tied_follows: string[];
        sr1_pairings: Array<[string, string]>;
        sr2_pairings: Array<[string, string]>;
        lead_winner: string | null;
        follow_winner: string | null;
    };
}

// ---- Results (/api/results, /api/end_game — web/helpers.py format_end_game_results) ----

export interface ResultRow {
    name: string;
    points: number;
    medal: string;
    is_winner: boolean;
}

export interface ResultsRound {
    round_num: number;
    session_id?: string;
    pairs: RoundPairs | null;
    lead_votes: Record<string, number> | null;
    follow_votes: Record<string, number> | null;
    judges: string[] | null;
    contestant_judges: string[] | null;
    win_messages: string[] | null;
    lead_winner: string | null;
    follow_winner: string | null;
    song_info: SongInfo | null;
    tiebreak?: boolean;
    tiebreak_leads?: string[];
    tiebreak_follows?: string[];
}

export interface ResultsResponse {
    session_id: string;
    leads: ResultRow[];
    follows: ResultRow[];
    rounds: ResultsRound[];
    initial_leads: string[];
    initial_follows: string[];
    champions: Champions;
    tiebreak_winners?: { lead: string | null; follow: string | null };
}

// ---- Prelims (/api/prelims/*, web/routes/game.py) ----

/** One rotation is a list of [leadName, followName] pairs. */
export type PrelimRotation = [string, string][];

export interface PrelimHeat {
    leads: string[];
    follows: string[];
    rotations: PrelimRotation[];
}

export interface PrelimStateResponse {
    session_id: string;
    config: {
        group_size: number;
        num_rotations: number;
        rotation_seconds: number;
        lead_spots: number;
        follow_spots: number;
        lead_needs_cut: boolean;
        follow_needs_cut: boolean;
        num_leads: number;
        num_follows: number;
        break_seconds: number;
        intermission_after: number;
        playlist_url: string;
    };
    num_heats: number;
    current_heat_index: number;
    current_rotation_index: number;
    running: boolean;
    phase: 'dancing' | 'break' | 'intermission';
    paused: boolean;
    show_timer: boolean;
    auto_advance: boolean;
    confirmed: boolean;
    rotation_remaining: number;
    heats_complete: boolean;
    heats: PrelimHeat[];
    numbers: { leads: Record<string, string>; follows: Record<string, string> };
    eligible: { leads: string[]; follows: string[] };
    selection: { leads: string[]; follows: string[] };
    complete: boolean;
}

// ---- Tie-break flow (/api/end_game + /api/tiebreak/*, web/routes/game.py) ----

/** /api/end_game response when a tie-break is required. */
export interface TiebreakStartData {
    tiebreak_required: true;
    lead_needed: boolean;
    follow_needed: boolean;
    tied_leads: string[];
    tied_follows: string[];
    lead_max_points: number;
    follow_max_points: number;
    all_leads: string[];
    all_follows: string[];
    guest_judges: string[];
    contestant_judges: string[];
}

export interface TiebreakSetPartnersResponse {
    sub_round: number;
    sr1_pairings: Array<[string, string]>;
    sr2_pairings: Array<[string, string]>;
}

export interface TiebreakAdvanceResponse {
    sub_round: number;
}

export interface TiebreakRoleResult {
    resolved: boolean;
    winner: string | null;
    vote_tally: Record<string, number>;
    still_tied?: string[];
}

export interface TiebreakVoteResponse {
    lead_result: TiebreakRoleResult | null;
    follow_result: TiebreakRoleResult | null;
    needs_another_round: boolean;
    tied_leads: string[];
    tied_follows: string[];
}
