/**
 * Spotify integration: token/playlist access via the Flask proxy endpoints,
 * playlist-mode state, and the track-embed UI.
 *
 * All mutable playlist state lives on the exported `playlist` object so the
 * app.js call sites share a single source of truth while they migrate to
 * modules. DOM elements are queried lazily so this module has no load-order
 * dependency on DOMContentLoaded.
 */

import { apiFetch } from './api';
import { showToast } from './toast';

/** Track shape returned by /api/spotify/playlist_tracks (server pre-joins artists). */
export interface SpotifyTrack {
    id: string;
    name?: string;
    artists?: string;
}

export interface PlaylistState {
    modeEnabled: boolean;
    url: string;
    id: string;
    tracks: SpotifyTrack[];
    usedTrackIds: Set<string>;
    currentRoundTrack: SpotifyTrack | null;
    lastPreparedSongRoundNumber: number | null;
    /** Playlist URL captured at game start, applied on the next state render. */
    pendingUrl: string | null;
}

export const playlist: PlaylistState = {
    modeEnabled: false,
    url: '',
    id: '',
    tracks: [],
    usedTrackIds: new Set(),
    currentRoundTrack: null,
    lastPreparedSongRoundNumber: null,
    pendingUrl: null,
};

// Ensure the Spotify integration default is persisted as off on first load
try {
    if (localStorage.getItem('spotify.enabled') === null) {
        localStorage.setItem('spotify.enabled', 'false');
    }
} catch {
    /* storage unavailable */
}

export function isSpotifyEnabled(): boolean {
    return localStorage.getItem('spotify.enabled') === 'true';
}

function songInputSection(): HTMLElement | null {
    return document.getElementById('song-input-section');
}

function playlistEmbedSection(): HTMLElement | null {
    return document.getElementById('playlist-embed-section');
}

function playlistEmbedContainer(): HTMLElement | null {
    return document.getElementById('playlist-embed');
}

/**
 * Apply the standard visibility gating for the manual song input vs. the
 * playlist embed: the embed shows only in playlist mode, the manual input
 * only outside it, and both hide when the integration is off.
 */
export function syncPlaylistUI(): void {
    const on = isSpotifyEnabled();
    const input = songInputSection();
    const embed = playlistEmbedSection();
    if (input) input.style.display = on && !playlist.modeEnabled ? '' : 'none';
    if (embed) embed.style.display = on && playlist.modeEnabled ? '' : 'none';
}

export async function getSpotifyToken(): Promise<string> {
    try {
        const data = await apiFetch<{ access_token: string }>('/api/get_spotify_token');
        return data.access_token;
    } catch (error) {
        console.error('Error getting Spotify token:', error);
        throw error;
    }
}

async function fetchPlaylistTracks(): Promise<void> {
    // Use the server proxy to avoid client-side CORS and centralize token handling
    const data = await apiFetch<{ tracks?: SpotifyTrack[] }>(
        `/api/spotify/playlist_tracks?playlist_id=${encodeURIComponent(playlist.id)}`,
    );
    const newTracks = Array.isArray(data.tracks) ? data.tracks : [];
    const existingIds = new Set(playlist.tracks.map((t) => t.id));
    for (const t of newTracks) {
        if (t && t.id && !existingIds.has(t.id)) playlist.tracks.push(t);
    }
}

function pickNextUnusedTrack(): SpotifyTrack | null {
    const unused = playlist.tracks.filter((t) => t && t.id && !playlist.usedTrackIds.has(t.id));
    if (unused.length === 0) return null;
    return unused[Math.floor(Math.random() * unused.length)];
}

function renderPlaylistEmbed(track: SpotifyTrack | null): void {
    const container = playlistEmbedContainer();
    if (!container) return;
    container.innerHTML = '';
    if (!track || !track.id) return;
    const iframe = document.createElement('iframe');
    iframe.src = `https://open.spotify.com/embed/track/${track.id}`;
    iframe.width = '100%';
    iframe.height = '80';
    iframe.frameBorder = '0';
    iframe.allow = 'encrypted-media';
    iframe.className = 'spotify-embed';
    container.appendChild(iframe);
}

export async function preparePlaylistSongForRound(roundNum: number): Promise<void> {
    try {
        if (!isSpotifyEnabled() || !playlist.modeEnabled || !playlist.id) return;
        if (playlist.tracks.length === 0) await fetchPlaylistTracks();
        let track = pickNextUnusedTrack();
        if (!track) {
            // Try refreshing tracks in case the playlist changed since the initial fetch
            playlist.tracks = [];
            await fetchPlaylistTracks();
            track = pickNextUnusedTrack();
        }
        if (!track) {
            console.warn('No available unused tracks in playlist. Disabling playlist mode.');
            renderPlaylistEmbed(null);
            playlist.currentRoundTrack = null;
            disablePlaylistMode('No more unused tracks available.');
            if (isSpotifyEnabled()) {
                try {
                    showToast(
                        'No more unused tracks left in the playlist. Please enter a song URL manually for remaining rounds.',
                        'error',
                        5000,
                    );
                } catch {
                    /* ignore */
                }
            }
            return;
        }
        playlist.currentRoundTrack = track;
        playlist.lastPreparedSongRoundNumber = roundNum;
        renderPlaylistEmbed(track);
        // Do not auto-start full playback; the embed offers a preview instead
    } catch (e) {
        console.warn('preparePlaylistSongForRound error:', e);
        disablePlaylistMode('Error preparing playlist track.');
    }
}

export async function maybeEnablePlaylistMode(url: string, sessionId?: string | null): Promise<void> {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'open.spotify.com') return;
        const parts = parsed.pathname.split('/').filter(Boolean);
        // Accept /playlist/{id} and legacy /user/{userId}/playlist/{id}
        let id = '';
        if (parts[0] === 'playlist' && parts[1]) {
            id = parts[1];
        } else if (parts[0] === 'user' && parts[2] === 'playlist' && parts[3]) {
            id = parts[3];
        } else {
            return;
        }
        playlist.id = id;
        playlist.url = url;
        playlist.modeEnabled = true;
        // Reset trackers for the new session
        playlist.usedTrackIds = new Set();
        playlist.currentRoundTrack = null;
        playlist.lastPreparedSongRoundNumber = null;
        syncPlaylistUI();
        // Preload tracks (may fetch multiple pages)
        await fetchPlaylistTracks();
        // Persist the playlist URL for the session
        if (sessionId) {
            try {
                localStorage.setItem(`playlist:url:${sessionId}`, playlist.url);
            } catch (e) {
                console.warn('Failed to persist playlist URL:', e);
            }
        }
    } catch (e) {
        console.warn('Failed to enable playlist mode:', e);
        disablePlaylistMode('Could not fetch playlist tracks. Falling back to manual song input.');
        try {
            showToast('Could not load Spotify playlist. Falling back to manual song input.', 'error');
        } catch {
            /* ignore */
        }
    }
}

export function disablePlaylistMode(reason?: string): void {
    playlist.modeEnabled = false;
    playlist.url = '';
    playlist.id = '';
    playlist.tracks = [];
    playlist.currentRoundTrack = null;
    playlist.lastPreparedSongRoundNumber = null;
    syncPlaylistUI();
    if (reason) console.warn('Playlist mode disabled:', reason);
}

/** After a successful vote submit, mark the prepared track as used and persist. */
export function markCurrentRoundTrackUsed(sessionId: string | null): void {
    if (!playlist.modeEnabled || !playlist.currentRoundTrack || !playlist.currentRoundTrack.id) return;
    playlist.usedTrackIds.add(playlist.currentRoundTrack.id);
    if (sessionId) {
        try {
            localStorage.setItem(`usedTracks:${sessionId}`, JSON.stringify(Array.from(playlist.usedTrackIds)));
        } catch {
            /* ignore */
        }
    }
}

/** Full reset for a new competition, clearing per-session persistence. */
export function resetPlaylistState(): void {
    playlist.modeEnabled = false;
    playlist.url = '';
    playlist.id = '';
    playlist.tracks = [];
    playlist.usedTrackIds = new Set();
    playlist.currentRoundTrack = null;
    playlist.lastPreparedSongRoundNumber = null;
    try {
        const sid = localStorage.getItem('sessionId');
        if (sid) {
            localStorage.removeItem(`usedTracks:${sid}`);
            localStorage.removeItem(`playlist:url:${sid}`);
        }
    } catch {
        /* ignore */
    }
    syncPlaylistUI();
}

/** Restore used tracks and playlist mode from localStorage for the current session. */
export function hydratePlaylistFromStorage(): void {
    try {
        const sid = localStorage.getItem('sessionId');
        if (!sid) return;
        const stored = localStorage.getItem(`usedTracks:${sid}`);
        if (stored) playlist.usedTrackIds = new Set(JSON.parse(stored) as string[]);
        const storedPlaylistUrl = localStorage.getItem(`playlist:url:${sid}`);
        if (storedPlaylistUrl && isSpotifyEnabled()) {
            playlist.pendingUrl = storedPlaylistUrl;
            maybeEnablePlaylistMode(storedPlaylistUrl, sid).catch(() => {});
            playlist.pendingUrl = null;
        }
    } catch (e) {
        console.warn('Failed to hydrate used tracks/playlist', e);
    }
}

/** Kick off the Spotify OAuth flow, returning to `returnToUrl` afterwards. */
export function startSpotifyAuth(returnToUrl: string, sessionId?: string | null, authKey = ''): void {
    const url = new URL(window.location.href);
    const sid = sessionId || url.searchParams.get('session_id') || '';
    const params = new URLSearchParams();
    params.set('session_id', sid || 'preauth');
    if (returnToUrl) params.set('return_to', returnToUrl);
    if (authKey) params.set('auth_key', authKey);
    window.location.href = `/api/spotify/authorize?${params.toString()}`;
}
