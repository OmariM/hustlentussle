# Hustle n' Tussle - Web Interface

This is a modern web interface for the Hustle n' Tussle Dance Competition Manager, built using HTML, CSS, and JavaScript with a Flask backend.

## Features

- All the functionality of the CLI version in a user-friendly web interface
- Crown emoji (👑) highlights the first contestant to reach the winning threshold
- Responsive design works on desktop and mobile
- Real-time updates as judges vote
- Visual tables and leaderboards for tracking scores and final results
- Medal emojis (🥇, 🥈, 🥉) for top performers

## Setup and Installation

1. Make sure you have installed the required Python dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```

2. Run the Flask application:
   ```bash
   cd to/project/directory
   python web/app.py
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
   - Track scores in real-time in the header tables
   - For each judge, select their vote for leads
   - After all lead votes are submitted, select votes for follows
   - View the results of each voting round
   - See crown emojis (👑) next to winners when they reach the threshold
   - Choose to proceed to the next round or end the battle

3. **Results Screen**:
   - View the final leaderboards for leads and follows
   - See medal emojis (🥇, 🥈, 🥉) for top three contestants
   - Crown emojis (👑) highlight the first contestants to reach the winning threshold
   - Start a new competition if desired

## Technical Details

- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks)
- **Backend**: Flask API that interfaces with the original game_logic.py
- **Data Flow**: The web UI makes fetch API calls to the Flask backend, which manages the game state
- **Responsive Design**: Adapts to different screen sizes from desktop to mobile

## UI Components

- **Score Tables**: Real-time updated tables showing contestant points
- **Voting Cards**: Interactive cards for judges to cast their votes
- **Results Display**: Final leaderboards with medals and crown recognition
- **Responsive Layout**: Adapts to different screen sizes for optimal viewing

## Browser Compatibility

Tested and working on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest) 