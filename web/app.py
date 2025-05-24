from flask import Flask, render_template, request, jsonify, send_file
import sys
import os
import pandas as pd
import io
import datetime
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from werkzeug.utils import secure_filename
import random
import requests
from flask_cors import CORS
from dotenv import load_dotenv
import uuid
import tempfile
import shutil

# Load environment variables from .env file
load_dotenv()

# Add parent directory to path to import game_logic
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game, Contestant
from web.config import get_config

# Get configuration based on environment
config = get_config()

app = Flask(__name__, 
            static_folder='.',
            static_url_path='',
            template_folder='.')  # Set template folder to current directory
app.config.from_object(config)
CORS(app)
games = {}  # Store active games by session ID

@app.route('/')
def index():
    return render_template('index.html', config=app.config)

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
    
    # Randomize the order of leads and follows
    random.shuffle(lead_names)
    random.shuffle(follow_names)
    
    # Create a new game with the randomized order
    session_id = f"game_{len(games) + 1}"
    game = Game(lead_names, follow_names, judge_names)
    game.session_id = session_id  # Set the session ID on the game object
    games[session_id] = game
    
    # Set session ID for the first round
    if game.current_round:
        game.current_round.session_id = session_id
    
    # Get initial game state
    state = game.get_game_state()
    
    return jsonify({
        'session_id': session_id,
        'round': state['round'],
        'pair_1': state['pair_1'],
        'pair_2': state['pair_2'],
        'contestant_judges': state['contestant_judges'],
        'guest_judges': game.guest_judges,
        'initial_leads': lead_names,  # Now contains the randomized order
        'initial_follows': follow_names  # Now contains the randomized order
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
    data = request.get_json()
    session_id = data.get('session_id')
    votes = data.get('votes', [])
    song_info = data.get('song_info', {})  # Add song info handling
    
    if not session_id or not votes:
        return jsonify({'error': 'Missing session_id or votes'}), 400
    
    game = games.get(session_id)
    if not game:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    # Store song info in the current round
    if song_info:
        game.current_round.song_info = song_info
    
    # Process votes and determine winner
    result = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)
    
    return jsonify({
        'winner': result['winner'],
        'guest_votes': result['guest_votes'],
        'contestant_votes': result['contestant_votes']
    })

@app.route('/api/judge_follows', methods=['POST'])
def judge_follows():
    data = request.get_json()
    session_id = data.get('session_id')
    votes = data.get('votes', [])
    song_info = data.get('song_info', {})  # Add song info handling
    
    if not session_id or not votes:
        return jsonify({'error': 'Missing session_id or votes'}), 400
    
    game = games.get(session_id)
    if not game:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    # Update song info in the current round if not already set
    if song_info and not hasattr(game.current_round, 'song_info'):
        game.current_round.song_info = song_info
    
    # Process votes and determine winner
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
    
    # Format the results - include all leads
    lead_results = []
    # Get all leads from initial order to ensure we include everyone
    all_leads = [lead.name for lead in game.initial_leads]
    # Create a dictionary of lead points for easy lookup
    lead_points = {lead.name: lead.points for lead in leads}
    
    # Sort leads by points (descending) and then by name (ascending) for consistent ordering
    sorted_leads = sorted(all_leads, key=lambda x: (-lead_points.get(x, 0), x))
    
    for idx, lead_name in enumerate(sorted_leads):
        points = lead_points.get(lead_name, 0)
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        is_winner = hasattr(game, 'last_lead_winner') and game.last_lead_winner == lead_name
        lead_results.append({
            'name': lead_name,
            'points': points,
            'medal': medal,
            'is_winner': is_winner
        })
    
    # Format the results - include all follows
    follow_results = []
    # Get all follows from initial order to ensure we include everyone
    all_follows = [follow.name for follow in game.initial_follows]
    # Create a dictionary of follow points for easy lookup
    follow_points = {follow.name: follow.points for follow in follows}
    
    # Sort follows by points (descending) and then by name (ascending) for consistent ordering
    sorted_follows = sorted(all_follows, key=lambda x: (-follow_points.get(x, 0), x))
    
    for idx, follow_name in enumerate(sorted_follows):
        points = follow_points.get(follow_name, 0)
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        is_winner = hasattr(game, 'last_follow_winner') and game.last_follow_winner == follow_name
        follow_results.append({
            'name': follow_name,
            'points': points,
            'medal': medal,
            'is_winner': is_winner
        })
    
    # Collect round metadata
    rounds_data = []
    
    # Add all completed rounds that belong to this session
    for r in game.rounds:
        if hasattr(r, 'session_id') and r.session_id == session_id:
            round_data = {
                'round_num': r.round_num,
                'session_id': session_id,
                'pairs': r.pairs,
                'lead_votes': r.lead_votes,
                'follow_votes': r.follow_votes,
                'judges': r.judges,
                'contestant_judges': r.contestant_judges,
                'win_messages': r.win_messages,
                'lead_winner': r.lead_winner,
                'follow_winner': r.follow_winner,
                'song_info': r.song_info if hasattr(r, 'song_info') else None
            }
            rounds_data.append(round_data)
    
    # Also include the current round if it exists and is not already in the rounds list
    if game.current_round and game.current_round not in game.rounds:
        if hasattr(game.current_round, 'session_id') and game.current_round.session_id == session_id:
            current_round_data = {
                'round_num': game.current_round.round_num,
                'session_id': session_id,
                'pairs': game.current_round.pairs,
                'lead_votes': game.current_round.lead_votes,
                'follow_votes': game.current_round.follow_votes,
                'judges': game.current_round.judges,
                'contestant_judges': game.current_round.contestant_judges,
                'win_messages': game.current_round.win_messages,
                'lead_winner': game.current_round.lead_winner,
                'follow_winner': game.current_round.follow_winner,
                'song_info': game.current_round.song_info if hasattr(game.current_round, 'song_info') else None
            }
            rounds_data.append(current_round_data)
    
    # Sort rounds by round number
    rounds_data.sort(key=lambda x: x['round_num'])
    
    return jsonify({
        'session_id': session_id,
        'leads': lead_results,
        'follows': follow_results,
        'rounds': rounds_data
    })

@app.route('/api/export_battle_data', methods=['GET', 'POST'])
def export_battle_data():
    """Export battle data as an Excel file or JSON."""
    session_id = request.args.get('session_id')
    format_type = request.args.get('format', 'excel')  # Default to excel format
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    
    # Get all rounds data
    all_rounds = []
    all_rounds.extend(game.rounds)
    if game.current_round not in game.rounds:
        all_rounds.append(game.current_round)
    
    # Format the results
    leads, follows = game.finalize_results()
    
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
    
    # Collect round metadata
    rounds_data = []
    
    # Add all completed rounds
    for r in all_rounds:
        round_data = {
            'round_num': r.round_num,
            'session_id': session_id,
            'pairs': r.pairs,
            'lead_votes': r.lead_votes,
            'follow_votes': r.follow_votes,
            'judges': r.judges,
            'contestant_judges': r.contestant_judges,
            'win_messages': r.win_messages,
            'lead_winner': r.lead_winner,
            'follow_winner': r.follow_winner,
            'song_info': r.song_info if hasattr(r, 'song_info') else None
        }
        rounds_data.append(round_data)
    
    # Sort rounds by round number
    rounds_data.sort(key=lambda x: x['round_num'])
    
    if format_type == 'json':
        return jsonify({
            'session_id': session_id,
            'leads': lead_results,
            'follows': follow_results,
            'rounds': rounds_data
        })
    else:
        # Create Excel file in the previous multi-sheet format
        wb = Workbook()
        summary_sheet = wb.active
        summary_sheet.title = "Battle Summary"

        # Add game ID, date, and time
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        summary_sheet['A1'] = f"Game ID: {session_id}"
        summary_sheet['A3'] = "Date:"
        summary_sheet['B3'] = date_str
        summary_sheet['A4'] = "Time:"
        summary_sheet['B4'] = time_str
        summary_sheet['A5'] = "Total Rounds:"
        summary_sheet['B5'] = len(game.rounds) + (1 if game.current_round not in game.rounds else 0)

        # Initial Order section
        summary_sheet['A7'] = "Initial Order"
        summary_sheet['A9'] = "Leads:"
        initial_leads = [lead.name for lead in game.initial_leads]
        for i, lead in enumerate(initial_leads, 1):
            summary_sheet[f'A{9+i}'] = f"{i}. {lead}"
        follow_start_row = 9 + len(initial_leads) + 2
        summary_sheet[f'A{follow_start_row}'] = "Follows:"
        initial_follows = [follow.name for follow in game.initial_follows]
        for i, follow in enumerate(initial_follows, 1):
            summary_sheet[f'A{follow_start_row+i}'] = f"{i}. {follow}"

        # Final Results section
        results_start_row = follow_start_row + len(initial_follows) + 2
        summary_sheet[f'A{results_start_row}'] = "Final Results"
        summary_sheet[f'A{results_start_row+2}'] = "Lead Winners:"
        for i, lead in enumerate(leads[:3], 1):
            medal = ["🥇", "🥈", "🥉"][i-1]
            is_winner = hasattr(game, 'last_lead_winner') and game.last_lead_winner == lead.name
            crown = " 👑" if is_winner else ""
            summary_sheet[f'A{results_start_row+2+i}'] = f"{medal} {lead.name}{crown}"
            summary_sheet[f'B{results_start_row+2+i}'] = f"{lead.points} points"
        follow_winners_start = results_start_row + 2 + len(leads[:3]) + 2
        summary_sheet[f'A{follow_winners_start}'] = "Follow Winners:"
        for i, follow in enumerate(follows[:3], 1):
            medal = ["🥇", "🥈", "🥉"][i-1]
            is_winner = hasattr(game, 'last_follow_winner') and game.last_follow_winner == follow.name
            crown = " 👑" if is_winner else ""
            summary_sheet[f'A{follow_winners_start+i}'] = f"{medal} {follow.name}{crown}"
            summary_sheet[f'B{follow_winners_start+i}'] = f"{follow.points} points"

        # Lead Leaderboard
        lead_sheet = wb.create_sheet("Lead Leaderboard")
        lead_sheet['A1'] = "Lead"
        lead_sheet['B1'] = "Points"
        for i, lead in enumerate(leads, 2):
            lead_sheet[f'A{i}'] = lead.name
            lead_sheet[f'B{i}'] = lead.points

        # Follow Leaderboard
        follow_sheet = wb.create_sheet("Follow Leaderboard")
        follow_sheet['A1'] = "Follow"
        follow_sheet['B1'] = "Points"
        for i, follow in enumerate(follows, 2):
            follow_sheet[f'A{i}'] = follow.name
            follow_sheet[f'B{i}'] = follow.points

        # Round History
        round_sheet = wb.create_sheet("Round History")
        base_headers = ["Round", "Lead 1", "Lead 2", "Follow 1", "Follow 2", "Song Title", "Artist", "Spotify Link"]
        # Determine the maximum number of judges in any round
        max_judges_count = 0
        for round_data in rounds_data:
            all_judges = set()
            if 'judges' in round_data:
                all_judges.update(round_data['judges'])
            if 'contestant_judges' in round_data:
                all_judges.update(round_data['contestant_judges'])
            max_judges_count = max(max_judges_count, len(all_judges))
        judge_headers = []
        for i in range(max_judges_count):
            judge_headers.append(f"Judge {i+1}")
            judge_headers.append(f"Lead Vote {i+1}")
            judge_headers.append(f"Follow Vote {i+1}")
        headers = base_headers + judge_headers
        for col, header in enumerate(headers, 1):
            round_sheet.cell(row=1, column=col).value = header
        for i, round_data in enumerate(rounds_data, 2):
            round_sheet.cell(row=i, column=1).value = round_data['round_num']
            if 'pairs' in round_data and round_data['pairs']:
                lead1 = round_data['pairs'].get('pair_1', {}).get('lead', '')
                lead2 = round_data['pairs'].get('pair_2', {}).get('lead', '')
                follow1 = round_data['pairs'].get('pair_1', {}).get('follow', '')
                follow2 = round_data['pairs'].get('pair_2', {}).get('follow', '')
                
                # Add contestants and set red color for winners
                lead1_cell = round_sheet.cell(row=i, column=2)
                lead1_cell.value = lead1
                if lead1 == round_data.get('lead_winner'):
                    lead1_cell.font = Font(color="FF0000")
                
                lead2_cell = round_sheet.cell(row=i, column=3)
                lead2_cell.value = lead2
                if lead2 == round_data.get('lead_winner'):
                    lead2_cell.font = Font(color="FF0000")
                
                follow1_cell = round_sheet.cell(row=i, column=4)
                follow1_cell.value = follow1
                if follow1 == round_data.get('follow_winner'):
                    follow1_cell.font = Font(color="FF0000")
                
                follow2_cell = round_sheet.cell(row=i, column=5)
                follow2_cell.value = follow2
                if follow2 == round_data.get('follow_winner'):
                    follow2_cell.font = Font(color="FF0000")
                
                # Song info
                if 'song_info' in round_data and round_data['song_info']:
                    song_info = round_data['song_info']
                    round_sheet.cell(row=i, column=6).value = song_info.get('title', '')
                    round_sheet.cell(row=i, column=7).value = song_info.get('artist', '')
                    round_sheet.cell(row=i, column=8).value = song_info.get('spotify_url', '')
                # Judges and votes
                all_judges = []
                if 'judges' in round_data:
                    all_judges.extend(round_data['judges'])
                if 'contestant_judges' in round_data:
                    all_judges.extend(round_data['contestant_judges'])
                for j in range(max_judges_count):
                    judge_col = 9 + j * 3
                    lead_vote_col = judge_col + 1
                    follow_vote_col = judge_col + 2
                    judge_name = all_judges[j] if j < len(all_judges) else ""
                    if judge_name:
                        lead_vote = round_data['lead_votes'].get(judge_name, '')
                        follow_vote = round_data['follow_votes'].get(judge_name, '')
                        round_sheet.cell(row=i, column=judge_col).value = judge_name
                        
                        # Set lead vote and color if it matches winner
                        lead_vote_cell = round_sheet.cell(row=i, column=lead_vote_col)
                        # Convert lead vote number to contestant name or special case
                        if lead_vote == 1:
                            lead_vote_cell.value = lead1
                            if lead1 == round_data.get('lead_winner'):
                                lead_vote_cell.font = Font(color="FF0000")
                        elif lead_vote == 2:
                            lead_vote_cell.value = lead2
                            if lead2 == round_data.get('lead_winner'):
                                lead_vote_cell.font = Font(color="FF0000")
                        elif lead_vote == 0:
                            lead_vote_cell.value = "Tie"
                        else:
                            lead_vote_cell.value = "No Contest"
                        
                        # Set follow vote and color if it matches winner
                        follow_vote_cell = round_sheet.cell(row=i, column=follow_vote_col)
                        # Convert follow vote number to contestant name or special case
                        if follow_vote == 1:
                            follow_vote_cell.value = follow1
                            if follow1 == round_data.get('follow_winner'):
                                follow_vote_cell.font = Font(color="FF0000")
                        elif follow_vote == 2:
                            follow_vote_cell.value = follow2
                            if follow2 == round_data.get('follow_winner'):
                                follow_vote_cell.font = Font(color="FF0000")
                        elif follow_vote == 0:
                            follow_vote_cell.value = "Tie"
                        else:
                            follow_vote_cell.value = "No Contest"
        # Voting History
        voting_sheet = wb.create_sheet("Voting History")
        voting_headers = ["Round", "Judge", "Lead Vote", "Follow Vote"]
        for col, header in enumerate(voting_headers, 1):
            voting_sheet.cell(row=1, column=col).value = header
        row_index = 2
        for round_data in rounds_data:
            if 'pairs' in round_data and round_data['pairs']:
                all_judges = set()
                if 'judges' in round_data:
                    all_judges.update(round_data['judges'])
                if 'contestant_judges' in round_data:
                    all_judges.update(round_data['contestant_judges'])
                for judge in all_judges:
                    lead_vote = round_data['lead_votes'].get(judge, '')
                    follow_vote = round_data['follow_votes'].get(judge, '')
                    voting_sheet.cell(row=row_index, column=1).value = round_data['round_num']
                    voting_sheet.cell(row=row_index, column=2).value = judge
                    voting_sheet.cell(row=row_index, column=3).value = lead_vote
                    voting_sheet.cell(row=row_index, column=4).value = follow_vote
                    row_index += 1
        # Save the workbook
        excel_file = io.BytesIO()
        wb.save(excel_file)
        excel_file.seek(0)
        return send_file(
            excel_file,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'battle_results_{session_id}.xlsx'
        )

@app.route('/api/process_uploaded_file', methods=['POST'])
def process_uploaded_file():
    """Process an uploaded battle history Excel file and return the data for display."""
    if 'battle_file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
        
    file = request.files['battle_file']
    
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
        
    if not file.filename.endswith('.xlsx'):
        return jsonify({'error': 'File must be an Excel (.xlsx) file'}), 400
        
    # Save the file temporarily
    temp_path = os.path.join('/tmp', secure_filename(file.filename))
    file.save(temp_path)
    
    try:
        # Load the Excel workbook
        wb = load_workbook(temp_path)
        
        # Extract data from relevant sheets
        data = {}
        
        # Track all contestants and their points from rounds
        all_contestants = {
            'leads': {},
            'follows': {}
        }
        
        # Battle Summary - Process this first to get initial order
        if "Battle Summary" in wb.sheetnames:
            summary_sheet = wb["Battle Summary"]
            
            # Extract date and time
            date = summary_sheet['B3'].value if 'B3' in summary_sheet else None
            time = summary_sheet['B4'].value if 'B4' in summary_sheet else None
            total_rounds = summary_sheet['B5'].value if 'B5' in summary_sheet else 0
            
            print("Processing Battle Summary sheet...")
            print(f"Date: {date}, Time: {time}, Total Rounds: {total_rounds}")
            
            # Extract initial order
            initial_leads = []
            initial_follows = []
            
            # Find the initial order section
            current_row = 7  # Start after "Initial Order" header
            found_initial_order = False
            
            # First, find the "Initial Order" section
            while current_row < summary_sheet.max_row:
                cell_value = summary_sheet[f'A{current_row}'].value
                print(f"Checking row {current_row}: {cell_value}")
                if cell_value == "Initial Order":
                    found_initial_order = True
                    print("Found Initial Order section")
                    current_row += 2  # Skip the header and move to content
                    break
                current_row += 1
            
            if found_initial_order:
                print("Processing initial order section...")
                # Process leads
                while current_row < summary_sheet.max_row:
                    cell_value = summary_sheet[f'A{current_row}'].value
                    print(f"Processing row {current_row}: {cell_value}")
                    if cell_value == "Leads:":
                        print("Found Leads section")
                        current_row += 1
                        while current_row < summary_sheet.max_row:
                            lead_entry = summary_sheet[f'A{current_row}'].value
                            print(f"Processing lead entry: {lead_entry}")
                            if not lead_entry or lead_entry == "Follows:":
                                break
                            # Extract name from "1. Name" format
                            if isinstance(lead_entry, str) and '. ' in lead_entry:
                                lead_name = lead_entry.split('. ', 1)[1]
                                print(f"Added lead: {lead_name}")
                                initial_leads.append(lead_name)
                            current_row += 1
                    elif cell_value == "Follows:":
                        print("Found Follows section")
                        current_row += 1
                        while current_row < summary_sheet.max_row:
                            follow_entry = summary_sheet[f'A{current_row}'].value
                            print(f"Processing follow entry: {follow_entry}")
                            if not follow_entry or follow_entry == "Final Results":
                                break
                            # Extract name from "1. Name" format
                            if isinstance(follow_entry, str) and '. ' in follow_entry:
                                follow_name = follow_entry.split('. ', 1)[1]
                                print(f"Added follow: {follow_name}")
                                initial_follows.append(follow_name)
                            current_row += 1
                    elif cell_value == "Final Results":
                        print("Found Final Results section")
                        break
                    current_row += 1
            
            print(f"Final initial leads: {initial_leads}")
            print(f"Final initial follows: {initial_follows}")
            
            # Store initial order in data
            data['initial_leads'] = initial_leads
            data['initial_follows'] = initial_follows
            
            # Calculate row numbers for results sections
            results_start_row = current_row  # This is where "Final Results" was found
            follow_winners_start = results_start_row + 2 + len(initial_leads) + 2  # Add 2 for headers and spacing
            
            # Extract top leads
            top_leads = []
            for i in range(results_start_row + 2, results_start_row + 5):  # Rows for top 3 leads
                name_cell = f'A{i}'
                points_cell = f'B{i}'
                if name_cell in summary_sheet and summary_sheet[name_cell].value:
                    name_text = summary_sheet[name_cell].value
                    points_text = summary_sheet[points_cell].value if points_cell in summary_sheet else "0 points"
                    
                    # Parse name and medal
                    parts = name_text.split(' ')
                    medal = parts[0] if parts[0] in ["🥇", "🥈", "🥉"] else ""
                    is_winner = "👑" in name_text
                    name = name_text.replace(medal, '').replace("👑", '').strip()
                    
                    # Parse points
                    points = 0
                    try:
                        if isinstance(points_text, str):
                            points = int(points_text.split(' ')[0])
                        elif isinstance(points_text, (int, float)):
                            points = int(points_text)
                    except (ValueError, TypeError):
                        # If parsing fails, try to get points from our calculated data
                        if name in all_contestants['leads']:
                            points = all_contestants['leads'][name]['points']
                    
                    # Mark as winner in our tracking dict
                    if name in all_contestants['leads'] and is_winner:
                        all_contestants['leads'][name]['is_winner'] = True
                    
                    top_leads.append({
                        'name': name,
                        'points': points,
                        'medal': medal,
                        'is_winner': is_winner
                    })
            
            # Extract top follows
            top_follows = []
            for i in range(follow_winners_start + 1, follow_winners_start + 4):  # Rows for top 3 follows
                name_cell = f'A{i}'
                points_cell = f'B{i}'
                if name_cell in summary_sheet and summary_sheet[name_cell].value:
                    name_text = summary_sheet[name_cell].value
                    points_text = summary_sheet[points_cell].value if points_cell in summary_sheet else "0 points"
                    
                    # Parse name and medal
                    parts = name_text.split(' ')
                    medal = parts[0] if parts[0] in ["🥇", "🥈", "🥉"] else ""
                    is_winner = "👑" in name_text
                    name = name_text.replace(medal, '').replace("👑", '').strip()
                    
                    # Parse points
                    points = 0
                    try:
                        if isinstance(points_text, str):
                            points = int(points_text.split(' ')[0])
                        elif isinstance(points_text, (int, float)):
                            points = int(points_text)
                    except (ValueError, TypeError):
                        # If parsing fails, try to get points from our calculated data
                        if name in all_contestants['follows']:
                            points = all_contestants['follows'][name]['points']
                    
                    # Mark as winner in our tracking dict
                    if name in all_contestants['follows'] and is_winner:
                        all_contestants['follows'][name]['is_winner'] = True
                    
                    top_follows.append({
                        'name': name,
                        'points': points,
                        'medal': medal,
                        'is_winner': is_winner
                    })
            
            data['summary'] = {
                'date': date,
                'time': time,
                'total_rounds': total_rounds
            }
        
        # Round History - Process this first to collect all contestant points
        if "Round History" in wb.sheetnames:
            round_sheet = wb["Round History"]
            rounds = []
            
            # Get column headers to understand the sheet format
            headers = {}
            for col in range(1, round_sheet.max_column + 1):
                header = round_sheet.cell(row=1, column=col).value
                if header:
                    headers[col] = header
                    
            # Count how many judges (every 3 columns after column 5)
            judge_count = (round_sheet.max_column - 5) // 3
            
            # Extract round data
            for row in range(2, round_sheet.max_row + 1):
                round_num = round_sheet.cell(row=row, column=1).value
                if round_num:
                    lead1 = round_sheet.cell(row=row, column=2).value
                    lead2 = round_sheet.cell(row=row, column=3).value
                    follow1 = round_sheet.cell(row=row, column=4).value
                    follow2 = round_sheet.cell(row=row, column=5).value
                    
                    # Initialize contestants if they don't exist yet
                    for lead in [lead1, lead2]:
                        if lead and lead not in all_contestants['leads']:
                            all_contestants['leads'][lead] = {'name': lead, 'points': 0, 'is_winner': False}
                            
                    for follow in [follow1, follow2]:
                        if follow and follow not in all_contestants['follows']:
                            all_contestants['follows'][follow] = {'name': follow, 'points': 0, 'is_winner': False}
                    
                    round_data = {
                        'round_num': round_num,
                        'pairs': {
                            'pair_1': {
                                'lead': lead1,
                                'follow': follow1
                            },
                            'pair_2': {
                                'lead': lead2,
                                'follow': follow2
                            }
                        },
                        'lead_votes': {},
                        'follow_votes': {}
                    }
                    
                    # Extract song information if available
                    song_title = round_sheet.cell(row=row, column=6).value
                    artist = round_sheet.cell(row=row, column=7).value
                    spotify_url = round_sheet.cell(row=row, column=8).value
                    
                    if song_title or artist or spotify_url:
                        round_data['song_info'] = {
                            'title': song_title or '',
                            'artist': artist or '',
                            'spotify_url': spotify_url or ''
                        }
                    
                    # Extract winner information and award points
                    lead_winner = None
                    follow_winner = None
                    
                    for col in [2, 3]:  # Lead columns
                        cell = round_sheet.cell(row=row, column=col)
                        font_color = cell.font.color
                        if font_color and font_color.rgb == "FF0000":  # Red color
                            lead_winner = cell.value
                            round_data['lead_winner'] = lead_winner
                            # Award a point to the winner
                            if lead_winner and lead_winner in all_contestants['leads']:
                                all_contestants['leads'][lead_winner]['points'] += 1
                    
                    for col in [4, 5]:  # Follow columns
                        cell = round_sheet.cell(row=row, column=col)
                        font_color = cell.font.color
                        if font_color and font_color.rgb == "FF0000":  # Red color
                            follow_winner = cell.value
                            round_data['follow_winner'] = follow_winner
                            # Award a point to the winner
                            if follow_winner and follow_winner in all_contestants['follows']:
                                all_contestants['follows'][follow_winner]['points'] += 1
                    
                    # Extract judge votes
                    for j in range(judge_count):
                        judge_col = 9 + j * 3  # Start after song info columns (6-8)
                        lead_vote_col = judge_col + 1
                        follow_vote_col = judge_col + 2
                        
                        judge_name = round_sheet.cell(row=row, column=judge_col).value
                        if judge_name:
                            lead_vote = round_sheet.cell(row=row, column=lead_vote_col).value
                            follow_vote = round_sheet.cell(row=row, column=follow_vote_col).value
                            
                            if lead_vote:
                                round_data['lead_votes'][judge_name] = lead_vote
                            if follow_vote:
                                round_data['follow_votes'][judge_name] = follow_vote
                    
                    rounds.append(round_data)
            
            data['rounds'] = rounds
        
        # Lead and Follow Leaderboards
        if "Lead Leaderboard" in wb.sheetnames:
            lead_sheet = wb["Lead Leaderboard"]
            leads = []
            for row in range(2, lead_sheet.max_row + 1):
                name = lead_sheet.cell(row=row, column=1).value
                points_cell = lead_sheet.cell(row=row, column=2).value
                if name:
                    # Try to parse points from the cell
                    points = 0
                    try:
                        if isinstance(points_cell, (int, float)):
                            points = int(points_cell)
                        elif isinstance(points_cell, str) and points_cell.isdigit():
                            points = int(points_cell)
                    except (ValueError, TypeError):
                        # If parsing fails, try to get points from our calculated data
                        if name in all_contestants['leads']:
                            points = all_contestants['leads'][name]['points']
                            
                    # Check if this contestant is a winner
                    is_winner = False
                    if name in all_contestants['leads']:
                        is_winner = all_contestants['leads'][name]['is_winner']
                    
                    leads.append({
                        'name': name,
                        'points': points,
                        'is_winner': is_winner
                    })
                    
                    # Update our tracking dictionary
                    if name in all_contestants['leads']:
                        all_contestants['leads'][name]['points'] = max(all_contestants['leads'][name]['points'], points)
            data['all_leads'] = leads
        
        if "Follow Leaderboard" in wb.sheetnames:
            follow_sheet = wb["Follow Leaderboard"]
            follows = []
            for row in range(2, follow_sheet.max_row + 1):
                name = follow_sheet.cell(row=row, column=1).value
                points_cell = follow_sheet.cell(row=row, column=2).value
                if name:
                    # Try to parse points from the cell
                    points = 0
                    try:
                        if isinstance(points_cell, (int, float)):
                            points = int(points_cell)
                        elif isinstance(points_cell, str) and points_cell.isdigit():
                            points = int(points_cell)
                    except (ValueError, TypeError):
                        # If parsing fails, try to get points from our calculated data
                        if name in all_contestants['follows']:
                            points = all_contestants['follows'][name]['points']
                    
                    # Check if this contestant is a winner
                    is_winner = False
                    if name in all_contestants['follows']:
                        is_winner = all_contestants['follows'][name]['is_winner']
                    
                    follows.append({
                        'name': name,
                        'points': points,
                        'is_winner': is_winner
                    })
                    
                    # Update our tracking dictionary
                    if name in all_contestants['follows']:
                        all_contestants['follows'][name]['points'] = max(all_contestants['follows'][name]['points'], points)
            data['all_follows'] = follows
        
        # Convert tracking dictionaries to lists and use as final data if not already set
        if 'leads' not in data or not data['leads']:
            data['leads'] = list(all_contestants['leads'].values())
            # Sort by points in descending order
            data['leads'].sort(key=lambda x: x['points'], reverse=True)
            
            # Assign medals to top 3
            for i, lead in enumerate(data['leads'][:3]):
                if i == 0:
                    lead['medal'] = '🥇'
                elif i == 1:
                    lead['medal'] = '🥈'
                elif i == 2:
                    lead['medal'] = '🥉'
        
        if 'follows' not in data or not data['follows']:
            data['follows'] = list(all_contestants['follows'].values())
            # Sort by points in descending order
            data['follows'].sort(key=lambda x: x['points'], reverse=True)
            
            # Assign medals to top 3
            for i, follow in enumerate(data['follows'][:3]):
                if i == 0:
                    follow['medal'] = '🥇'
                elif i == 1:
                    follow['medal'] = '🥈'
                elif i == 2:
                    follow['medal'] = '🥉'
        
        # Clean up
        os.remove(temp_path)
        
        # Log data for debugging
        print("Processed data:", data)
        if 'leads' in data:
            for lead in data['leads']:
                print(f"Lead: {lead['name']}, Points: {lead['points']}, Type: {type(lead['points'])}")
        
        return jsonify(data)
    
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print(f"Error processing Excel file: {str(e)}")
        return jsonify({'error': f'Failed to process file: {str(e)}'}), 500

@app.route('/api/get_spotify_token', methods=['GET'])
def get_spotify_token():
    try:
        # Get client credentials from environment variables
        client_id = os.getenv('SPOTIFY_CLIENT_ID')
        client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
        
        if not client_id or not client_secret:
            return jsonify({'error': 'Spotify credentials not configured'}), 500
        
        # Request access token from Spotify
        auth_response = requests.post(
            'https://accounts.spotify.com/api/token',
            auth=(client_id, client_secret),
            data={'grant_type': 'client_credentials'}
        )
        
        if auth_response.status_code != 200:
            return jsonify({'error': 'Failed to get Spotify access token'}), 500
        
        return jsonify(auth_response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG) 