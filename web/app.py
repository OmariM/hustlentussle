from flask import Flask, render_template, request, jsonify
import sys
import os

# Add parent directory to path to import game_logic
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game, Contestant

app = Flask(__name__, static_folder='.', static_url_path='')
games = {}  # Store active games by session ID

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/start_game', methods=['POST'])
def start_game():
    data = request.json
    lead_names = data.get('leads', '').split(',')
    follow_names = data.get('follows', '').split(',')
    judge_names = data.get('judges', '').split(',')
    
    # Create a new game
    session_id = f"game_{len(games) + 1}"
    games[session_id] = Game(lead_names, follow_names, judge_names)
    
    # Get initial game state
    game = games[session_id]
    state = game.get_game_state()
    
    return jsonify({
        'session_id': session_id,
        'round': state['round'],
        'pair_1': state['pair_1'],
        'pair_2': state['pair_2'],
        'contestant_judges': state['contestant_judges'],
        'guest_judges': game.guest_judges
    })

@app.route('/api/judge_leads', methods=['POST'])
def judge_leads():
    data = request.json
    session_id = data.get('session_id')
    votes = data.get('votes', [])
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    result = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)
    
    return jsonify({
        'winner': result['winner'],
        'guest_votes': result['guest_votes'],
        'contestant_votes': result['contestant_votes']
    })

@app.route('/api/judge_follows', methods=['POST'])
def judge_follows():
    data = request.json
    session_id = data.get('session_id')
    votes = data.get('votes', [])
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    result = game.judge_round(game.pair_1[1], game.pair_2[1], "follow", votes)
    
    # Check for win condition
    win_messages = game.check_for_win() or []
    
    return jsonify({
        'winner': result['winner'],
        'guest_votes': result['guest_votes'],
        'contestant_votes': result['contestant_votes'],
        'win_messages': win_messages,
        'game_finished': game.is_finished()
    })

@app.route('/api/next_round', methods=['POST'])
def next_round():
    data = request.json
    session_id = data.get('session_id')
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    game.next_round()
    state = game.get_game_state()
    
    return jsonify({
        'round': state['round'],
        'pair_1': state['pair_1'],
        'pair_2': state['pair_2'],
        'contestant_judges': state['contestant_judges']
    })

@app.route('/api/end_game', methods=['POST'])
def end_game():
    data = request.json
    session_id = data.get('session_id')
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    leads, follows = game.finalize_results()
    
    # Format the results
    lead_results = []
    for idx, lead in enumerate(leads):
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        lead_results.append({
            'name': lead.name,
            'points': lead.points,
            'medal': medal
        })
    
    follow_results = []
    for idx, follow in enumerate(follows):
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        follow_results.append({
            'name': follow.name,
            'points': follow.points,
            'medal': medal
        })
    
    return jsonify({
        'leads': lead_results,
        'follows': follow_results
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000) 