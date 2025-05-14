# Hustle n' Tussle - Web Interface

This is a web interface for the Hustle n' Tussle Dance Competition Manager, built using HTML, CSS, and JavaScript with a Flask backend.

## Features

- All the functionality of the CLI version in a user-friendly web interface
- Responsive design works on desktop and mobile
- Real-time updates as judges vote
- Visual leaderboards for final results

## Setup and Installation

1. Make sure you have installed the required Python dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```

2. Run the Flask application:
   ```bash
   cd web
   python app.py
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

## How to Use

1. **Setup Screen**:
   - Enter lead names (comma-separated)
   - Enter follow names (comma-separated)
   - Enter guest judge names (comma-separated)
   - Click "Start Competition"

2. **Round Screen**:
   - View the current matchups
   - For each judge, select their vote for leads
   - After all lead votes are submitted, select votes for follows
   - View the results of each voting round
   - Choose to proceed to the next round or end the battle

3. **Results Screen**:
   - View the final leaderboards for leads and follows
   - Start a new competition if desired

## Technical Details

- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks)
- **Backend**: Flask API that interfaces with the original game_logic.py
- **Data Flow**: The web UI makes AJAX calls to the Flask API, which manages the game state 