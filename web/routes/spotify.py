"""Optional Spotify integration: OAuth, playback control and playlist metadata."""

import base64
import json
import os
import threading
import time
import urllib.parse
from typing import Dict, Optional

import requests
from flask import Blueprint, jsonify, redirect, request

bp = Blueprint("spotify", __name__)

# In-memory user OAuth token store keyed by provided key (session_id or auth_key)
_spotify_user_tokens: Dict[str, dict] = {}
_spotify_user_tokens_lock = threading.RLock()


def _resolve_key(session_id: Optional[str], auth_key: Optional[str]) -> Optional[str]:
    return auth_key or session_id


def _get_redirect_uri() -> str:
    # Prefer explicit env var; else infer from request
    env_uri = os.getenv("SPOTIFY_REDIRECT_URI")
    if env_uri:
        return env_uri
    try:
        base = request.host_url.rstrip("/")
        return f"{base}/api/spotify/callback"
    except Exception:
        # Fallback localhost
        return "http://localhost:5000/api/spotify/callback"


def _now() -> float:
    return time.time()


def _store_user_tokens(key: str, access_token: str, refresh_token: Optional[str], expires_in: int) -> None:
    if not key:
        return
    with _spotify_user_tokens_lock:
        _spotify_user_tokens[key] = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": _now() + max(1, int(expires_in) - 30),  # refresh a bit early
        }


def _get_user_tokens(key: str) -> Optional[dict]:
    if not key:
        return None
    with _spotify_user_tokens_lock:
        return _spotify_user_tokens.get(key)


def _refresh_user_token(key: str) -> Optional[str]:
    tokens = _get_user_tokens(key)
    if not tokens or not tokens.get("refresh_token"):
        return None
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        auth=(client_id, client_secret),
        data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]},
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    access_token = data.get("access_token")
    expires_in = int(data.get("expires_in", 3600))
    # Spotify may or may not return a new refresh token
    refresh_token = data.get("refresh_token", tokens["refresh_token"])
    _store_user_tokens(key, access_token, refresh_token, expires_in)
    return access_token


def _ensure_user_access_token(key: str) -> Optional[str]:
    tokens = _get_user_tokens(key)
    if not tokens:
        return None
    if tokens.get("expires_at", 0) <= _now():
        return _refresh_user_token(key)
    return tokens.get("access_token")


@bp.route("/api/get_spotify_token", methods=["GET"])
def get_spotify_token():
    try:
        # Get client credentials from environment variables
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

        if not client_id or not client_secret:
            return jsonify({"error": "Spotify credentials not configured"}), 500

        # Request access token from Spotify
        auth_response = requests.post(
            "https://accounts.spotify.com/api/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
        )

        if auth_response.status_code != 200:
            return jsonify({"error": "Failed to get Spotify access token"}), 500

        return jsonify(auth_response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/spotify/callback", methods=["GET"])
def spotify_callback():
    """Spotify OAuth callback endpoint."""
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        return f"Authentication failed: {error}"

    if not code or not state:
        return "Authentication failed: Missing code or state."

    try:
        # Decode the state parameter
        decoded_state = urllib.parse.unquote(state)
        state_data = json.loads(base64.b64decode(decoded_state).decode("utf-8"))
        session_id = state_data.get("session_id")
        return_to = state_data.get("return_to")
        auth_key = state_data.get("auth_key")

        if not session_id:
            return "Authentication failed: Invalid state."

        # Exchange the authorization code for an access token
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        if not client_id or not client_secret:
            return "Spotify credentials not configured."

        token_resp = requests.post(
            "https://accounts.spotify.com/api/token",
            auth=(client_id, client_secret),
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": _get_redirect_uri()},
        )
        if token_resp.status_code != 200:
            return f"Failed to exchange code for token: {token_resp.status_code} - {token_resp.text}"

        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = int(tokens.get("expires_in", 3600))

        if not access_token:
            return "Authentication failed: No access token received."

        # Store tokens using the resolved key
        _store_user_tokens(_resolve_key(session_id, auth_key), access_token, refresh_token, expires_in)

        # Redirect to the return_to URL if provided, otherwise to the game page
        if return_to:
            return redirect(return_to)
        else:
            return redirect(f"{request.host_url}?session_id={session_id}")
    except Exception as e:
        return f"Authentication failed: {str(e)}"


@bp.route("/api/spotify/authorize", methods=["GET"])
def spotify_authorize():
    """Initiates Spotify OAuth flow."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    # Check if user is already authenticated for this session
    tokens = _get_user_tokens(_resolve_key(session_id, None))  # Pass None for auth_key
    if tokens and tokens.get("expires_at", 0) > _now():
        return jsonify({"message": "User already authenticated for this session."})

    redirect_uri = _get_redirect_uri()
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    if not client_id:
        return jsonify({"error": "Spotify client ID not configured"}), 500

    scopes = [
        "user-read-private",
        "user-read-email",
        "user-read-playback-state",
        "user-modify-playback-state",
        "streaming",
    ]
    scope_str = " ".join(scopes)

    # Encode state for redirect
    state_data = {
        "session_id": session_id,
        "return_to": request.args.get("return_to"),  # Optional: redirect back to a specific page
        "auth_key": request.args.get("auth_key"),  # Optional: a unique key for this auth attempt
    }
    encoded_state = base64.b64encode(json.dumps(state_data).encode("utf-8")).decode("utf-8")

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope_str,
        "state": encoded_state,
    }
    auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode(params)
    return redirect(auth_url)


@bp.route("/api/spotify/user_token", methods=["GET"])
def spotify_user_token():
    """Expose the current user's access token for the Web Playback SDK."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400
    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "Not authorized"}), 401
    tokens = _get_user_tokens(_resolve_key(session_id, None)) or {}  # Pass None for auth_key
    return jsonify(
        {
            "access_token": access_token,
            "expires_at": tokens.get("expires_at"),
        }
    )


def _currently_playing_response(access_token: str):
    """Fetch and shape the currently-playing payload for a valid token."""
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)
    return resp


def _shape_currently_playing(data: dict):
    item = data.get("item")
    if item:
        return jsonify(
            {
                "is_playing": data.get("is_playing"),
                "track_name": item.get("name"),
                "artist_name": ", ".join([a.get("name") for a in item.get("artists", []) if a]),
                "spotify_url": item.get("external_urls", {}).get("spotify"),
                "duration_ms": item.get("duration_ms"),
                "progress_ms": data.get("progress_ms"),
            }
        )
    return jsonify({"is_playing": False, "track_name": None, "artist_name": None})


@bp.route("/api/spotify/current_track", methods=["GET"])
def spotify_current_track():
    """Gets the currently playing track from the user's Spotify account."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        resp = _currently_playing_response(access_token)
        if resp.status_code == 200:
            return _shape_currently_playing(resp.json())
        elif resp.status_code == 401:
            # Token might be expired, try to refresh
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            resp = _currently_playing_response(access_token)
            if resp.status_code == 200:
                return _shape_currently_playing(resp.json())
            else:
                return jsonify(
                    {
                        "error": "Failed to fetch currently playing track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify(
                {"error": "Failed to fetch currently playing track", "status": resp.status_code, "details": resp.json()}
            ), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/spotify/play_track", methods=["POST"])
def spotify_play_track():
    """Plays a track on the user's Spotify account."""
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    session_id = data.get("session_id")
    track_uri = data.get("track_uri")
    device_id = data.get("device_id")

    if not session_id or not track_uri:
        return jsonify({"error": "Missing session_id or track_uri"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/play"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.put(url, headers=headers, json={"uris": [track_uri]})
        if resp.status_code == 204:
            return jsonify({"message": "Track started successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.put(url, headers=headers, json={"uris": [track_uri]})
            if resp.status_code == 204:
                return jsonify({"message": "Track started successfully after refresh."})
            else:
                return jsonify(
                    {
                        "error": "Failed to start track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify({"error": "Failed to start track", "status": resp.status_code, "details": resp.json()}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/spotify/pause_track", methods=["POST"])
def spotify_pause_track():
    """Pauses the user's Spotify account."""
    session_id = request.args.get("session_id")
    device_id = request.args.get("device_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/pause"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.put(url, headers=headers)
        if resp.status_code == 204:
            return jsonify({"message": "Track paused successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.put(url, headers=headers)
            if resp.status_code == 204:
                return jsonify({"message": "Track paused successfully after refresh."})
            else:
                return jsonify(
                    {
                        "error": "Failed to pause track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify({"error": "Failed to pause track", "status": resp.status_code, "details": resp.json()}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/spotify/next_track", methods=["POST"])
def spotify_next_track():
    """Skips to the next track on the user's Spotify account."""
    session_id = request.args.get("session_id")
    device_id = request.args.get("device_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/next"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.post(url, headers=headers)
        if resp.status_code == 204:
            return jsonify({"message": "Track skipped successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.post(url, headers=headers)
            if resp.status_code == 204:
                return jsonify({"message": "Track skipped successfully after refresh."})
            else:
                return jsonify(
                    {"error": "Failed to skip track after refresh.", "status": resp.status_code, "details": resp.json()}
                ), 502
        else:
            return jsonify({"error": "Failed to skip track", "status": resp.status_code, "details": resp.json()}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/spotify/previous_track", methods=["POST"])
def spotify_previous_track():
    """Goes back to the previous track on the user's Spotify account."""
    session_id = request.args.get("session_id")
    device_id = request.args.get("device_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/previous"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.post(url, headers=headers)
        if resp.status_code == 204:
            return jsonify({"message": "Track went back successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.post(url, headers=headers)
            if resp.status_code == 204:
                return jsonify({"message": "Track went back successfully after refresh."})
            else:
                return jsonify(
                    {
                        "error": "Failed to go back track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify(
                {"error": "Failed to go back track", "status": resp.status_code, "details": resp.json()}
            ), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/spotify/playlist_tracks", methods=["GET"])
def spotify_playlist_tracks():
    """Server-side proxy to fetch all tracks for a public Spotify playlist.
    Returns a simplified JSON structure: { tracks: [ { id, name, artists } ] }
    """
    try:
        playlist_id = request.args.get("playlist_id")
        if not playlist_id:
            return jsonify({"error": "Missing playlist_id"}), 400

        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        if not client_id or not client_secret:
            return jsonify({"error": "Spotify credentials not configured"}), 500

        # Get access token
        token_resp = requests.post(
            "https://accounts.spotify.com/api/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
        )
        if token_resp.status_code != 200:
            return jsonify({"error": "Failed to get Spotify access token"}), 500
        access_token = token_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {access_token}"}

        # Fetch tracks (paginate)
        url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit=100"
        tracks = []
        visited = set()
        while url and url not in visited:
            visited.add(url)
            resp = requests.get(url, headers=headers)
            if resp.status_code == 401:
                # Try to refresh token once
                token_resp = requests.post(
                    "https://accounts.spotify.com/api/token",
                    auth=(client_id, client_secret),
                    data={"grant_type": "client_credentials"},
                )
                if token_resp.status_code != 200:
                    return jsonify({"error": "Failed to refresh Spotify token"}), 500
                access_token = token_resp.json().get("access_token")
                headers = {"Authorization": f"Bearer {access_token}"}
                resp = requests.get(url, headers=headers)
            if resp.status_code != 200:
                try:
                    return jsonify(
                        {"error": "Failed to fetch playlist tracks", "status": resp.status_code, "details": resp.json()}
                    ), 502
                except Exception:
                    return jsonify({"error": "Failed to fetch playlist tracks", "status": resp.status_code}), 502
            data = resp.json()
            items = data.get("items", [])
            for item in items:
                t = (item or {}).get("track") or {}
                tid = t.get("id")
                if not tid:
                    continue
                tracks.append(
                    {
                        "id": tid,
                        "name": t.get("name", ""),
                        "artists": ", ".join([a.get("name", "") for a in t.get("artists", []) if a]),
                    }
                )
            url = data.get("next")

        # Deduplicate by id
        unique = []
        seen = set()
        for t in tracks:
            if t["id"] in seen:
                continue
            seen.add(t["id"])
            unique.append(t)

        return jsonify({"tracks": unique})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
