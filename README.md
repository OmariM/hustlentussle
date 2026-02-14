# Hustle n' Tussle - Dance Competition Application

A comprehensive application to manage a partner dance competition between **Leads** and **Follows**. The game randomly pairs dancers, uses **Guest Judges** and **Contestant Judges** to vote each round, supports **Ties** and **No Contest**, tracks individual points, and displays final leaderboards.

Now available with both a CLI and Web interface!

## 📸 Interface Screenshots

### Setup Screen
![Setup Screen](docs/screenshots/setup-screen.png)
*Competition setup with fields for lead, follow, and judge names*

### Voting Screen
![Voting Screen](docs/screenshots/voting-screen.gif)
*Voting interface showing matchups, current scores with crown emojis, and judge voting*

### Results Screen
![Results Screen](docs/screenshots/results-screen.png)
*Final results showing leaderboards with medals and crown emojis for winners*

---

## 🔧 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hustle-n-tussle.git
   cd hustle-n-tussle
   ```
2. (Optional) Create a virtual environment and activate it:
   ```bash
   python3 -m venv venv
   source venv/bin/activate   # Mac/Linux
   venv\Scripts\activate    # Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## 🚀 Usage

### Run the Web Interface (Recommended)

```bash
python web/app.py
```

Then open your browser to http://localhost:5000

- Home: Start a new battle or upload a previously saved results file
- Setup: Enter lead names, follow names, and guest judge names; optionally set a points-to-win override (default 7, auto-calculate, or custom). Advanced options include randomizing order, toggling contestant judging, and setting contestant judge count
- Voting: Cast votes for Leads and Follows (combined view) and Submit All Votes; live battle graphic updates. Use Undo Round to revert the last round if needed
- Song: Optionally paste a Spotify track URL or connect a Spotify playlist for automatic track selection each round
- Results: View leaderboards, round history, and Download Battle Data (Excel or JSON)
- Upload: Upload a previously downloaded .xlsx results file to visualize battle summaries and leaderboards
- Display Mode: Share a spectator-only view via `?mode=display&session_id=SESSION_ID` with live polling and animated queue transitions. A QR code is generated in the header for easy sharing
- UI: Toggle Theme (light/dark) from the header
- Debug (optional): Enable debug tools via env, query `?debug=1`, or hotkey Alt+Shift+D

### Run the Interactive CLI

```bash
python main.py
```

- Enter lead names, follow names, and guest judge names (comma-separated).
- Vote each round for Leads (with Tie/No Contest options for guests) and for Follows.
- Results and points update automatically until winners are determined, or you end the battle early.

### Run Automated Tests

```bash
python run_complete_test_suite.py
```

- Runs core battle rules, voting rules, pairing rules, stress tests, and integration simulations.
- Outputs a concise PASS/FAIL summary and a breakdown report.

### Run Simple Simulation

```bash
python simulate_test.py
```

- Walks through several rounds of simulated winners to demonstrate pairing logic.

---

## 🌐 Deployment

### Deploying to Render

Hustle n' Tussle can be easily deployed to [Render](https://render.com) using the included configuration files:

1. **Push your code to GitHub**:
   Make sure your code is in a GitHub repository.

2. **Create a Render account**:
   Sign up at [render.com](https://render.com).

3. **Create a new Web Service**:
   - Click "New" and select "Web Service"
   - Connect your GitHub repository
   - Select the repository with Hustle n' Tussle

4. **Configure the service**:
   - Render will automatically detect the Python application
   - Set the following:
     - Name: hustlentussle (or your preferred name)
     - Build Command: `pip install -r requirements.prod.txt`
     - Start Command: `gunicorn wsgi:application`

5. **Environment variables**:
   - `FLASK_ENV`: `production`
   - `SECRET_KEY`: Generate a secure random string
   - Optional (for Spotify metadata on results and round history):
     - `SPOTIFY_CLIENT_ID`: your client ID
     - `SPOTIFY_CLIENT_SECRET`: your client secret

6. **Deploy the service**:
   - Click "Create Web Service"
   - Wait for the build and deployment to complete

7. **Connect your custom domain**:
   - In your service dashboard, go to "Settings"
   - Scroll to "Custom Domains"
   - Click "Add Custom Domain"
   - Follow the instructions to configure your domain

For more details, see the [Render documentation](https://render.com/docs).

---

## ⚙️ Features

- Random Pairing: Each round pairs one Lead with one Follow
- Guest & Contestant Judges: Guests can choose Tie or No Contest; contestants must pick a winner
- Tie Handling: No points awarded; tied dancers face each other again in the next round
- No Contest: No points awarded; previous dancers return to the end of the queue and fresh opponents are selected
- Undo Round: Revert the last round and restore the previous queue state
- Winner Recognition: Crown emoji (👑) highlights the first contestant to reach the winning threshold
- Scoring & Leaderboards: Points tracked individually and sorted for Leads and Follows; default win threshold is 7 points (configurable via auto-calculate or custom value)
- Multiple Interfaces: Choose between CLI or Web interface
- Display Mode: Spectator-only view with live polling, animated queue transitions, and QR code sharing
- Download Battle Data: Export to multi-sheet Excel or JSON, including round history and votes
- Upload Results Viewer: Upload a previous .xlsx export to visualize summary, leaderboards, and rounds
- Spotify Integration (optional): Paste a track URL for metadata, or connect a playlist for automatic track selection each round with full playback controls
- Advanced Game Config: Randomize contestant order, toggle contestant judging, set contestant judge count, choose points-to-win mode (default/auto/custom)
- Theme Toggle: Light/dark theming from the header
- Debug Tools (dev): Optional utilities for simulation and auto-advance
- Persistence: PostgreSQL for production with automatic in-memory fallback; games auto-expire after 6 hours

---

## 📂 Project Structure

```
hustle-n-tussle/
├── game_logic.py                 # Core game engine
├── main.py                       # CLI frontend
├── simulate_test.py              # Simple round simulation script
├── run_complete_test_suite.py    # Runs all rule and integration tests
├── unit_tests.py                 # Extensive unit and API tests
├── battle_rules_test_suite.py    # Core battle rules tests
├── pairing_rules_tests.py        # Pairing and queue tests
├── voting_rules_tests.py         # Voting rules tests
├── requirements.txt              # Dev dependencies
├── requirements.prod.txt         # Production dependencies
├── wsgi.py                       # WSGI entrypoint for prod
├── render.yaml                   # Render deployment config
├── web/                          # Web interface files
│   ├── app.py                    # Flask backend + API
│   ├── index.html                # Web UI
│   ├── config.py                 # Env-aware configuration
│   ├── css/                      # Stylesheets
│   ├── js/                       # JavaScript and components
│   └── README.md                 # Web interface documentation
├── persistence/                  # Database abstraction layer
│   ├── interfaces.py             # Repository interface
│   ├── memory_repository.py      # In-memory storage (dev/fallback)
│   ├── postgres_repository.py    # PostgreSQL persistence
│   ├── factory.py                # Factory, fallback, and cleanup scheduler
│   └── serializers.py            # Game state serialization
├── docs/
│   ├── render-deployment.md      # Detailed Render guide
│   └── screenshots/              # UI screenshots and guidance
├── .gitignore
└── README.md                     # Project documentation
```

---

## 🤝 Contributing

Feel free to submit pull requests or open issues on GitHub. All enhancements and bug fixes are welcome!

---

## 📝 Future Enhancements

1. Quality of life features:
   - Implement save and load states
   - Allow results to be exported to CSV/PDF
   - Battle history page on website
   - Authentication for judges
   - Mobile application

---

*Enjoy running your dance competition!*
