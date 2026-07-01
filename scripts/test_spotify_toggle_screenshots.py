import os
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
import requests


WORKSPACE = Path("/workspace")
BASE_URL = "http://127.0.0.1:5000"
OUT_DIR = WORKSPACE / "docs" / "screenshots" / "toggle_tests"


def wait_for_server(url: str, timeout_seconds: int = 60) -> None:
    start = time.time()
    while time.time() - start < timeout_seconds:
        try:
            resp = requests.get(url, timeout=2)
            if resp.status_code < 500:
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Server did not become ready at {url} within {timeout_seconds}s")


def expect_hidden(page, selector: str) -> None:
    # use computed style to handle inline/stylesheet display changes
    page.wait_for_function(
        "sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display === 'none'; }",
        arg=selector,
    )


def expect_visible(page, selector: str) -> None:
    page.wait_for_function(
        "sel => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none'; }",
        arg=selector,
    )


def run() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Start dev server
    env = os.environ.copy()
    env.pop("FLASK_ENV", None)  # ensure dev config (port 5000)
    server = subprocess.Popen(
        [sys.executable, str(WORKSPACE / "web" / "app.py")],
        cwd=str(WORKSPACE),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        wait_for_server(BASE_URL)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()

            # Home: enforce clean default state and verify default-off
            page.goto(BASE_URL, wait_until="networkidle")
            page.evaluate("() => { localStorage.clear(); }")
            page.reload(wait_until="networkidle")
            # default off implies no auth button
            assert page.locator("#spotify-auth-btn").count() == 0
            page.screenshot(path=str(OUT_DIR / "home_default_off.png"))

            # Navigate to setup and verify playlist URL field hidden
            page.click("#go-to-battle")
            page.wait_for_selector("#setup-screen.active")
            expect_hidden(page, "#playlist-url-group")
            page.screenshot(path=str(OUT_DIR / "setup_off.png"))

            # Fill minimal data and start competition
            page.fill("#lead-names", "A, B")
            page.fill("#follow-names", "C, D")
            page.fill("#judge-names", "J1")
            page.click("#start-competition")
            page.wait_for_selector("#battle-screen")
            # Round page: song input hidden when off
            expect_hidden(page, "#song-input-section")
            # And embed hidden as well
            expect_hidden(page, "#playlist-embed-section")
            page.screenshot(path=str(OUT_DIR / "round_off.png"))

            # Cast simple votes and show results for at least one round
            page.wait_for_selector("#lead-judges-container .judge-card")
            page.locator("#lead-judges-container .judge-card .vote-option-1").first.click()
            page.wait_for_selector("#follow-judges-container .judge-card")
            page.locator("#follow-judges-container .judge-card .vote-option-1").first.click()
            page.wait_for_function(
                "() => { const b = document.getElementById('submit-votes'); return b && !b.disabled; }"
            )
            prev_round = page.text_content("#round-number").strip()
            page.click("#submit-votes")
            page.wait_for_selector("#vote-confirm-modal:not(.hidden)")
            page.click("#vote-confirm-submit")
            # Wait for auto-advance (or for battle to finish and leave battle screen)
            page.wait_for_function(
                "(prev) => { const battle = document.getElementById('battle-screen'); if (!battle || !battle.classList.contains('active')) return true; const rn = document.getElementById('round-number'); return rn && rn.textContent.trim() !== prev; }",
                arg=prev_round,
            )

            # End battle and verify history renders while Spotify is off
            page.click("#end-battle")
            page.wait_for_selector("#results-screen")
            # Ensure the accordion populates
            page.wait_for_selector("#rounds-accordion .accordion-item")
            page.screenshot(path=str(OUT_DIR / "results_off_history_visible.png"))

            # Go back home and test dynamic toggle on -> setup shows playlist field
            page.click("#back-to-home-from-results")
            page.wait_for_selector("#home-screen.active")
            page.click("#spotify-toggle")  # enable
            page.wait_for_function(
                "() => document.getElementById('spotify-toggle')?.textContent?.includes('Disable Spotify Integration')"
            )
            page.screenshot(path=str(OUT_DIR / "home_on.png"))
            page.click("#go-to-battle")
            page.wait_for_selector("#setup-screen.active")
            expect_visible(page, "#playlist-url-group")
            page.screenshot(path=str(OUT_DIR / "setup_on.png"))

            # Toggle off again and expect hide without refresh
            page.click("#spotify-toggle")
            page.wait_for_function(
                "() => document.getElementById('spotify-toggle')?.textContent?.includes('Enable Spotify Integration')"
            )
            expect_hidden(page, "#playlist-url-group")
            page.screenshot(path=str(OUT_DIR / "setup_off_after_toggle.png"))

            context.close()
            browser.close()
    finally:
        try:
            server.terminate()
            server.wait(timeout=5)
        except Exception:
            try:
                server.kill()
            except Exception:
                pass


if __name__ == "__main__":
    run()
