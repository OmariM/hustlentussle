import os
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import List
import requests
from PIL import Image
# Use Playwright sync API
from playwright.sync_api import sync_playwright
import random


WORKSPACE = Path('/workspace')
BASE_URL = 'http://127.0.0.1:5000'
SCREEN_DIR = WORKSPACE / 'docs' / 'screenshots'


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


def pil_from_bytes(png_bytes: bytes) -> Image.Image:
	return Image.open(BytesIO(png_bytes)).convert('RGB')


def save_gif(frames: List[Image.Image], out_path: Path, duration_ms: int = 250) -> None:
	if not frames:
		raise ValueError('No frames provided for GIF')
	frames[0].save(
		str(out_path),
		save_all=True,
		append_images=frames[1:],
		loop=0,
		duration=duration_ms,
		optimize=True,
	)


def generate_screenshots() -> None:
	SCREEN_DIR.mkdir(parents=True, exist_ok=True)

	# Start dev server
	env = os.environ.copy()
	env.pop('FLASK_ENV', None)  # ensure dev config (port 5000)
	server = subprocess.Popen(
		[sys.executable, str(WORKSPACE / 'web' / 'app.py')],
		cwd=str(WORKSPACE),
		env=env,
		stdout=subprocess.PIPE,
		stderr=subprocess.STDOUT,
	)
	try:
		wait_for_server(BASE_URL)

		with sync_playwright() as p:
			browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])  # for containers
			context = browser.new_context(viewport={"width": 1280, "height": 900})
			page = context.new_page()

			# Go to Home
			page.goto(BASE_URL, wait_until='networkidle')

			# Go to Setup
			page.click('#go-to-battle')
			page.wait_for_selector('#setup-screen.active')

			# Fill sample data: 5 leads, 5 follows, 2 guests; set high points-to-win to avoid early finish
			page.fill('#lead-names', 'John, Michael, David, James, Robert')
			page.fill('#follow-names', 'Emma, Olivia, Sophia, Isabella, Ava')
			page.fill('#judge-names', 'Alex, Jordan')
			page.fill('#points-to-win', '10')

			# Capture setup screen
			setup_el = page.locator('#setup-screen')
			setup_el.screenshot(path=str(SCREEN_DIR / 'setup-screen.png'))

			# Start competition
			page.click('#start-competition')
			page.wait_for_selector('#battle-screen')
			# Wait for judge voting UI to render
			page.wait_for_selector('#lead-judges-container .judge-card')
			page.wait_for_selector('#follow-judges-container .judge-card')

			# Prepare frames for GIF across first 5 rounds
			frames: List[Image.Image] = []
			for round_index in range(1, 6):
				# Initial round view
				frames.append(pil_from_bytes(page.screenshot(full_page=True)))

				# Randomize votes for leads (choose between option-1 and option-2)
				lead_judges = page.locator('#lead-judges-container .judge-card')
				lead_count = lead_judges.count()
				for i in range(lead_count):
					card = lead_judges.nth(i)
					if random.random() < 0.5:
						card.locator('.vote-option-1').click()
					else:
						card.locator('.vote-option-2').click()
					time.sleep(0.1)

				# Randomize votes for follows (choose between option-1 and option-2)
				follow_judges = page.locator('#follow-judges-container .judge-card')
				follow_count = follow_judges.count()
				for i in range(follow_count):
					card = follow_judges.nth(i)
					if random.random() < 0.5:
						card.locator('.vote-option-1').click()
					else:
						card.locator('.vote-option-2').click()
					time.sleep(0.1)

				# Confirm -> modal -> submit (auto-advances)
				page.wait_for_function("document.getElementById('submit-votes') && !document.getElementById('submit-votes').disabled")
				prev_round = page.text_content('#round-number').strip()
				page.click('#submit-votes')
				page.wait_for_selector('#vote-confirm-modal:not(.hidden)')
				time.sleep(0.15)
				# Capture the confirmation step
				frames.append(pil_from_bytes(page.screenshot(full_page=True)))
				page.click('#vote-confirm-submit')

				# Wait for round to advance (or for next UI to render)
				if round_index < 5:
					page.wait_for_function(
						"(prev) => { const rn = document.getElementById('round-number'); return rn && rn.textContent.trim() !== prev; }",
						arg=prev_round,
					)
					page.wait_for_selector('#lead-judges-container .judge-card')
					time.sleep(0.2)

			# Save GIF
			save_gif(frames, SCREEN_DIR / 'voting-screen.gif', duration_ms=250)

			# End battle -> Results screenshot
			page.click('#end-battle')
			page.wait_for_selector('#results-screen')
			# Give a moment for tables to fill
			time.sleep(0.5)
			results_el = page.locator('#results-screen')
			results_el.screenshot(path=str(SCREEN_DIR / 'results-screen.png'))

			context.close()
			browser.close()
	finally:
		# Terminate server
		try:
			server.terminate()
			server.wait(timeout=5)
		except Exception:
			try:
				server.kill()
			except Exception:
				pass


if __name__ == '__main__':
	generate_screenshots()