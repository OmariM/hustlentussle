#!/usr/bin/env python3
"""
Browser-level smoke test of the core battle flow, driven through the real UI.

Flow: setup -> start battle -> vote + submit two rounds -> undo -> re-vote ->
end battle early -> results screen. Fails on any JS page error, console error
or missing screen transition.

Usage:
    .venv-dev/bin/python scripts/smoke_ui.py [--base-url http://127.0.0.1:8091]

Requires playwright + chromium (see requirements-dev.txt;
`playwright install chromium-headless-shell` and, once per host,
`sudo playwright install-deps chromium`).
"""

import argparse
import sys

from playwright.sync_api import sync_playwright


def vote_all_judges(page, targets: dict) -> None:
    """Vote for a fixed dancer per role with every judge.

    Voting for the same dancer each round (round winners stay in) produces a
    unique points leader, so end-early resolves without a tie-break. On the
    first call, targets is filled with each role's option-1 dancer name.
    """
    for role, container in (("lead", "#lead-judges-container"), ("follow", "#follow-judges-container")):
        rows = page.locator(f"{container} .judge-row")
        if role not in targets:
            targets[role] = rows.first.locator(".vote-chip:visible").first.inner_text().strip()
        for i in range(rows.count()):
            chips = rows.nth(i).locator(".vote-chip:visible")
            target_chip = chips.get_by_text(targets[role], exact=True)
            if target_chip.count() > 0:
                target_chip.first.click()
            else:
                chips.first.click()


def submit_votes(page) -> None:
    page.click("#submit-votes")
    page.wait_for_selector("#vote-confirm-modal:not(.hidden)", timeout=5000)
    page.click("#vote-confirm-submit")
    page.wait_for_selector("#vote-confirm-modal.hidden", state="attached", timeout=5000)


def read_round_number(page) -> int:
    return int(page.locator("#round-number").inner_text().strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8091")
    parser.add_argument("--headed", action="store_true", help="run with a visible browser")
    args = parser.parse_args()

    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        page = browser.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        # 503 resource logs are expected when optional features are disabled
        # (e.g. the stats API without DATABASE_URL); everything else is a failure.
        page.on(
            "console",
            lambda m: (
                errors.append(f"console.error: {m.text}")
                if m.type == "error" and "status of 503" not in m.text
                else None
            ),
        )

        print(f"1. Setup screen at {args.base_url}/setup")
        page.goto(f"{args.base_url}/setup", wait_until="networkidle")
        assert page.locator("#setup-screen").is_visible(), "setup screen not visible"

        page.fill("#lead-names", "Ada, Boris, Cleo, Dmitri")
        page.fill("#follow-names", "Elena, Felix, Grace, Hugo")
        page.fill("#judge-names", "JudgeOne, JudgeTwo")

        print("2. Start battle")
        page.click("#start-competition")
        page.wait_for_selector("#battle-screen.active", timeout=8000)
        assert "/battle/" in page.url, f"expected /battle/<id> url, got {page.url}"
        assert read_round_number(page) == 1
        targets: dict = {}

        print("3. Vote + submit round 1")
        vote_all_judges(page, targets)
        submit_votes(page)
        page.wait_for_function("document.querySelector('#round-number').textContent.trim() === '2'", timeout=8000)

        print("4. Vote + submit round 2")
        vote_all_judges(page, targets)
        submit_votes(page)
        page.wait_for_function("document.querySelector('#round-number').textContent.trim() === '3'", timeout=8000)

        print("5. Undo round")
        page.click("#undo-round")
        page.wait_for_function("document.querySelector('#round-number').textContent.trim() === '2'", timeout=8000)

        print("6. Re-vote round 2")
        vote_all_judges(page, targets)
        submit_votes(page)
        page.wait_for_function("document.querySelector('#round-number').textContent.trim() === '3'", timeout=8000)

        print("7. End battle early")
        page.click("#end-battle-early")
        page.wait_for_selector("#end-early-modal:not(.hidden)", timeout=5000)
        page.click("#end-early-confirm")
        page.wait_for_selector("#results-screen.active", timeout=8000)
        assert "/results/" in page.url, f"expected /results/<id> url, got {page.url}"

        print("8. Results render")
        assert page.locator("#lead-results-body tr").count() > 0, "lead results table empty"
        assert page.locator("#follow-results-body tr").count() > 0, "follow results table empty"
        assert page.locator("#rounds-accordion").is_visible(), "rounds accordion not visible"

        print("9. Stats screen (ytd)")
        page.goto(f"{args.base_url}/stats", wait_until="networkidle")
        page.wait_for_selector("#stats-screen.active", timeout=8000)
        assert page.locator("#ytd-year-select option").count() > 0, "year selector empty"

        browser.close()

    if errors:
        print("\nJS ERRORS DURING SMOKE:")
        for e in errors:
            print(" -", e)
        return 1
    print("\nUI SMOKE PASSED (start / 2 rounds / undo / re-vote / end-early / results, zero JS errors)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
