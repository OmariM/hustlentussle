from flask import Flask, render_template, request, jsonify
import sys
import os

# Add parent directory to path to import game_logic
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game, Contestant
from web.config import get_config

# Get configuration based on environment
config = get_config()

app = Flask(__name__, static_folder='.', static_url_path='')
app.config.from_object(config)
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
    
    # Filter out any empty names
    lead_names = [name.strip() for name in lead_names if name.strip()]
    follow_names = [name.strip() for name in follow_names if name.strip()]
    judge_names = [name.strip() for name in judge_names if name.strip()]
    
    # Validate equal counts of leads and follows
    if len(lead_names) != len(follow_names):
        return jsonify({
            'error': 'The number of leads must equal the number of follows.'
        }), 400
    
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

@app.route('/api/get_scores', methods=['GET'])
def get_scores():
    session_id = request.args.get('session_id')
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    
    # Create dictionaries to track unique contestants by name
    lead_dict = {}
    follow_dict = {}
    
    # Helper function to determine if a contestant has earned a crown
    def has_earned_crown(contestant, role):
        if role == "lead":
            # A lead earns a crown if they have reached the winning threshold
            return contestant.points >= game.total_num_leads - 1 and game.has_winning_lead
        else:  # role == "follow"
            # A follow earns a crown if they have reached the winning threshold
            return contestant.points >= game.total_num_follows - 1 and game.has_winning_follow
    
    # Add current pair contestants
    lead_dict[game.pair_1[0].name] = {
        'name': game.pair_1[0].name, 
        'points': game.pair_1[0].points,
        'is_winner': has_earned_crown(game.pair_1[0], "lead")
    }
    
    lead_dict[game.pair_2[0].name] = {
        'name': game.pair_2[0].name, 
        'points': game.pair_2[0].points,
        'is_winner': has_earned_crown(game.pair_2[0], "lead")
    }
    
    follow_dict[game.pair_1[1].name] = {
        'name': game.pair_1[1].name, 
        'points': game.pair_1[1].points,
        'is_winner': has_earned_crown(game.pair_1[1], "follow")
    }
    
    follow_dict[game.pair_2[1].name] = {
        'name': game.pair_2[1].name, 
        'points': game.pair_2[1].points,
        'is_winner': has_earned_crown(game.pair_2[1], "follow")
    }
    
    # Add contestants from the queue (only if not already added)
    for lead in game.leads:
        lead_dict[lead.name] = {
            'name': lead.name, 
            'points': lead.points,
            'is_winner': has_earned_crown(lead, "lead")
        }
    
    for follow in game.follows:
        follow_dict[follow.name] = {
            'name': follow.name, 
            'points': follow.points,
            'is_winner': has_earned_crown(follow, "follow")
        }
    
    # Check if we have winning lead/follow and add them if they exist and aren't already included
    if hasattr(game, 'winning_lead') and game.winning_lead:
        lead_dict[game.winning_lead.name] = {
            'name': game.winning_lead.name, 
            'points': game.winning_lead.points,
            'is_winner': has_earned_crown(game.winning_lead, "lead")
        }
    
    if hasattr(game, 'winning_follow') and game.winning_follow:
        follow_dict[game.winning_follow.name] = {
            'name': game.winning_follow.name, 
            'points': game.winning_follow.points,
            'is_winner': has_earned_crown(game.winning_follow, "follow")
        }
    
    # Convert dictionaries to lists for the response
    lead_list = list(lead_dict.values())
    follow_list = list(follow_dict.values())
    
    return jsonify({
        'leads': lead_list,
        'follows': follow_list
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
        is_winner = hasattr(game, 'last_lead_winner') and game.last_lead_winner == lead.name
        lead_results.append({
            'name': lead.name,
            'points': lead.points,
            'medal': medal,
            'is_winner': is_winner
        })
    
    follow_results = []
    for idx, follow in enumerate(follows):
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        is_winner = hasattr(game, 'last_follow_winner') and game.last_follow_winner == follow.name
        follow_results.append({
            'name': follow.name,
            'points': follow.points,
            'medal': medal,
            'is_winner': is_winner
        })
    
    return jsonify({
        'leads': lead_results,
        'follows': follow_results
    })

if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG) 