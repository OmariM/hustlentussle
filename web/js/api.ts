/**
 * Typed API client — the single place fetch calls to the Flask backend live.
 *
 * Response/request shapes come from types.ts (mirroring web/routes/*.py).
 * Non-2xx responses throw ApiError carrying the status and the parsed
 * `{error}` payload when present.
 */

import type { GameStateResponse, ResultsResponse, ScoreboardRow } from './types';

export class ApiError extends Error {
    status: number;
    payload: unknown;

    constructor(status: number, message: string, payload: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(url, init);
    let data: unknown = null;
    try {
        data = await resp.json();
    } catch {
        /* non-JSON body (or empty) */
    }
    if (!resp.ok) {
        const message =
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
                ? data.error
                : `Request failed: ${resp.status}`;
        throw new ApiError(resp.status, message, data);
    }
    return data as T;
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
    return apiFetch<T>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ---- Game lifecycle ----

export function getState(sessionId: string): Promise<GameStateResponse> {
    return apiFetch<GameStateResponse>(`/api/state?session_id=${encodeURIComponent(sessionId)}`);
}

export function getScores(sessionId: string): Promise<{ leads: ScoreboardRow[]; follows: ScoreboardRow[] }> {
    return apiFetch(`/api/get_scores?session_id=${encodeURIComponent(sessionId)}`);
}

export function getResults(sessionId: string): Promise<ResultsResponse> {
    return apiFetch<ResultsResponse>(`/api/results?session_id=${encodeURIComponent(sessionId)}`);
}
