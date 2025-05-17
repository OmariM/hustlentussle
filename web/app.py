from flask import Flask, render_template, request, jsonify, send_file
import sys
import os
import pandas as pd
import io
import datetime
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from werkzeug.utils import secure_filename

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
    
    # Collect round metadata
    rounds_data = []
    
    # Add all completed rounds
    for r in game.rounds:
        round_data = {
            'round_num': r.round_num,
            'pairs': r.pairs,
            'lead_votes': r.lead_votes,
            'follow_votes': r.follow_votes,
            'judges': r.judges,
            'contestant_judges': r.contestant_judges,
            'win_messages': r.win_messages,
            'lead_winner': r.lead_winner,
            'follow_winner': r.follow_winner
        }
        
        rounds_data.append(round_data)
    
    # Also include the current round if it exists and is not already in the rounds list
    if game.current_round and game.current_round not in game.rounds:
        current_round_data = {
            'round_num': game.current_round.round_num,
            'pairs': game.current_round.pairs,
            'lead_votes': game.current_round.lead_votes,
            'follow_votes': game.current_round.follow_votes,
            'judges': game.current_round.judges,
            'contestant_judges': game.current_round.contestant_judges,
            'win_messages': game.current_round.win_messages,
            'lead_winner': game.current_round.lead_winner,
            'follow_winner': game.current_round.follow_winner
        }
        
        rounds_data.append(current_round_data)
    
    return jsonify({
        'leads': lead_results,
        'follows': follow_results,
        'rounds': rounds_data
    })

@app.route('/api/export_battle_data', methods=['GET'])
def export_battle_data():
    """Export battle data as an Excel file."""
    session_id = request.args.get('session_id')
    
    if session_id not in games:
        return jsonify({'error': 'Game not found'}), 404
    
    game = games[session_id]
    
    # Create an in-memory output file
    output = io.BytesIO()
    
    # Create the workbook
    wb = Workbook()
    
    # Add battle summary sheet
    summary_sheet = wb.active
    summary_sheet.title = "Battle Summary"
    
    # Set fixed column widths for all sheets to avoid MergedCell issues
    standard_widths = {
        "A": 15,  # First column (names, rounds, etc.)
        "B": 20,  # Second column (points, contestants, etc.)
        "C": 20,  # Third column
        "D": 20,  # Fourth column
        "E": 20,  # Fifth column
        "F": 20,  # Sixth column
        "G": 20,  # Seventh column
        "H": 20,  # Eighth column
        "I": 20,  # Ninth column
        "J": 20,  # Tenth column
        "K": 20,  # Eleventh column
        "L": 20,  # Twelfth column
        "M": 20,  # Thirteenth column
        "N": 20,  # Fourteenth column
        "O": 20,  # Fifteenth column
    }
    
    for sheet in wb.worksheets:
        # Apply standard widths to each column
        for col_letter, width in standard_widths.items():
            if col_letter in sheet.column_dimensions:
                sheet.column_dimensions[col_letter].width = width
    
    # Add battle information
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    
    # Create title with styling
    title_cell = summary_sheet['A1'] 
    title_cell.value = "Hustle n' Tussle Battle Report"
    title_cell.font = Font(size=16, bold=True)
    summary_sheet.merge_cells('A1:B1')
    title_cell.alignment = Alignment(horizontal='center')
    
    # Add battle metadata
    summary_sheet['A3'] = "Date:"
    summary_sheet['B3'] = date_str
    summary_sheet['A4'] = "Time:"
    summary_sheet['B4'] = time_str
    summary_sheet['A5'] = "Total Rounds:"
    summary_sheet['B5'] = len(game.rounds) + (1 if game.current_round not in game.rounds else 0)
    
    # Add winner information
    summary_sheet['A7'] = "Final Results"
    summary_sheet['A7'].font = Font(bold=True)
    
    # Lead winners
    summary_sheet['A9'] = "Lead Winners:"
    summary_sheet['A9'].font = Font(bold=True)
    
    leads, follows = game.finalize_results()
    
    for i, lead in enumerate(leads[:3], 1):
        medal = ["🥇", "🥈", "🥉"][i-1]
        is_winner = hasattr(game, 'last_lead_winner') and game.last_lead_winner == lead.name
        crown = " 👑" if is_winner else ""
        summary_sheet[f'A{9+i}'] = f"{medal} {lead.name}{crown}"
        summary_sheet[f'B{9+i}'] = f"{lead.points} points"
    
    # Follow winners
    summary_sheet['A14'] = "Follow Winners:"
    summary_sheet['A14'].font = Font(bold=True)
    
    for i, follow in enumerate(follows[:3], 1):
        medal = ["🥇", "🥈", "🥉"][i-1]
        is_winner = hasattr(game, 'last_follow_winner') and game.last_follow_winner == follow.name
        crown = " 👑" if is_winner else ""
        summary_sheet[f'A{14+i}'] = f"{medal} {follow.name}{crown}"
        summary_sheet[f'B{14+i}'] = f"{follow.points} points"
    
    # Create lead leaderboard sheet
    lead_sheet = wb.create_sheet("Lead Leaderboard")
    lead_sheet['A1'] = "Lead"
    lead_sheet['B1'] = "Points"
    lead_sheet['A1'].font = Font(bold=True)
    lead_sheet['B1'].font = Font(bold=True)
    
    for i, lead in enumerate(leads, 2):
        lead_sheet[f'A{i}'] = lead.name
        lead_sheet[f'B{i}'] = lead.points
    
    # Create follow leaderboard sheet
    follow_sheet = wb.create_sheet("Follow Leaderboard")
    follow_sheet['A1'] = "Follow"
    follow_sheet['B1'] = "Points"
    follow_sheet['A1'].font = Font(bold=True)
    follow_sheet['B1'].font = Font(bold=True)
    
    for i, follow in enumerate(follows, 2):
        follow_sheet[f'A{i}'] = follow.name
        follow_sheet[f'B{i}'] = follow.points
    
    # Create round history sheet
    round_sheet = wb.create_sheet("Round History")
    
    # Set column headers - updated with new column layout
    # We'll have the round number, followed by contestants, then judges' votes
    base_headers = ["Round", "Lead 1", "Lead 2", "Follow 1", "Follow 2"]
    
    # Fill round data to determine the max number of judges in any round
    all_rounds = []
    all_rounds.extend(game.rounds)
    
    if game.current_round not in game.rounds:
        all_rounds.append(game.current_round)
    
    # Determine the maximum number of judges in any round
    max_judges_count = 0
    for round_data in all_rounds:
        all_judges = set()
        if hasattr(round_data, 'judges'):
            all_judges.update(round_data.judges)
        if hasattr(round_data, 'contestant_judges'):
            all_judges.update(round_data.contestant_judges)
        max_judges_count = max(max_judges_count, len(all_judges))
    
    # Set specific column widths for the Round History sheet after determining max_judges_count
    def set_round_history_widths(sheet):
        sheet.column_dimensions["A"].width = 10  # Round number column
        sheet.column_dimensions["B"].width = 15  # Lead 1
        sheet.column_dimensions["C"].width = 15  # Lead 2
        sheet.column_dimensions["D"].width = 15  # Follow 1
        sheet.column_dimensions["E"].width = 15  # Follow 2
        
        # Judge columns and votes
        for i in range(max_judges_count):
            # Calculate column letters for judge columns
            judge_col = chr(ord('F') + i * 3)
            lead_vote_col = chr(ord('F') + i * 3 + 1)
            follow_vote_col = chr(ord('F') + i * 3 + 2)
            
            # Set widths if these columns exist
            if judge_col in sheet.column_dimensions:
                sheet.column_dimensions[judge_col].width = 15  # Judge name
            if lead_vote_col in sheet.column_dimensions:
                sheet.column_dimensions[lead_vote_col].width = 18  # Lead vote
            if follow_vote_col in sheet.column_dimensions:
                sheet.column_dimensions[follow_vote_col].width = 18  # Follow vote
    
    # Create headers for judges columns
    judge_headers = []
    for i in range(max_judges_count):
        judge_headers.append(f"Judge {i+1}")
        judge_headers.append(f"Lead Vote {i+1}")
        judge_headers.append(f"Follow Vote {i+1}")
    
    # Combine headers
    headers = base_headers + judge_headers
    
    # Add headers to sheet
    for col, header in enumerate(headers, 1):
        round_sheet.cell(row=1, column=col).value = header
        round_sheet.cell(row=1, column=col).font = Font(bold=True)
    
    # Fill data row by row
    for i, round_data in enumerate(all_rounds, 2):
        # Add round number
        round_sheet.cell(row=i, column=1).value = round_data.round_num
        
        # Add contestants data (columns 2-5)
        if hasattr(round_data, 'pairs') and round_data.pairs:
            lead1 = round_data.pairs.get('pair_1', {}).get('lead', '')
            lead2 = round_data.pairs.get('pair_2', {}).get('lead', '')
            follow1 = round_data.pairs.get('pair_1', {}).get('follow', '')
            follow2 = round_data.pairs.get('pair_2', {}).get('follow', '')
            
            # Add contestants with winner highlighting
            lead_winner = round_data.lead_winner if hasattr(round_data, 'lead_winner') else ''
            follow_winner = round_data.follow_winner if hasattr(round_data, 'follow_winner') else ''
            
            # Add lead 1
            lead1_cell = round_sheet.cell(row=i, column=2, value=lead1)
            if lead1 == lead_winner:
                lead1_cell.font = Font(color="FF0000")  # Red text for winner
            
            # Add lead 2
            lead2_cell = round_sheet.cell(row=i, column=3, value=lead2)
            if lead2 == lead_winner:
                lead2_cell.font = Font(color="FF0000")  # Red text for winner
            
            # Add follow 1
            follow1_cell = round_sheet.cell(row=i, column=4, value=follow1)
            if follow1 == follow_winner:
                follow1_cell.font = Font(color="FF0000")  # Red text for winner
            
            # Add follow 2
            follow2_cell = round_sheet.cell(row=i, column=5, value=follow2)
            if follow2 == follow_winner:
                follow2_cell.font = Font(color="FF0000")  # Red text for winner
            
            # Get all judges from the round
            all_judges = list()
            if hasattr(round_data, 'judges'):
                all_judges.extend(round_data.judges)
            if hasattr(round_data, 'contestant_judges'):
                all_judges.extend(round_data.contestant_judges)
            
            # Add judge data
            for j, judge in enumerate(all_judges):
                # Calculate column indices for this judge
                judge_col = 6 + j * 3
                lead_vote_col = judge_col + 1
                follow_vote_col = judge_col + 2
                
                # Add judge name
                round_sheet.cell(row=i, column=judge_col).value = judge
                
                # Add lead vote
                lead_vote = round_data.lead_votes.get(judge, '')
                if lead_vote:
                    if lead_vote == 1:
                        vote_text = lead1
                    elif lead_vote == 2:
                        vote_text = lead2
                    elif lead_vote == 3:
                        vote_text = "Tie"
                    elif lead_vote == 4:
                        vote_text = "No Contest"
                    else:
                        vote_text = str(lead_vote)
                    round_sheet.cell(row=i, column=lead_vote_col).value = vote_text
                
                # Add follow vote
                follow_vote = round_data.follow_votes.get(judge, '')
                if follow_vote:
                    if follow_vote == 1:
                        vote_text = follow1
                    elif follow_vote == 2:
                        vote_text = follow2
                    elif follow_vote == 3:
                        vote_text = "Tie"
                    elif follow_vote == 4:
                        vote_text = "No Contest"
                    else:
                        vote_text = str(follow_vote)
                    round_sheet.cell(row=i, column=follow_vote_col).value = vote_text
    
    # Add the specific column widths for Round History sheet
    set_round_history_widths(round_sheet)
    
    # Create voting history sheet
    voting_sheet = wb.create_sheet("Voting History")
    
    # Set column headers for voting
    voting_headers = ["Round", "Judge", "Lead Vote", "Follow Vote"]
    
    for col, header in enumerate(voting_headers, 1):
        voting_sheet.cell(row=1, column=col).value = header
        voting_sheet.cell(row=1, column=col).font = Font(bold=True)
    
    # Fill voting data
    row_index = 2
    for round_data in all_rounds:
        if hasattr(round_data, 'pairs') and round_data.pairs:
            lead1 = round_data.pairs.get('pair_1', {}).get('lead', '')
            lead2 = round_data.pairs.get('pair_2', {}).get('lead', '')
            follow1 = round_data.pairs.get('pair_1', {}).get('follow', '')
            follow2 = round_data.pairs.get('pair_2', {}).get('follow', '')
            
            # Get all judges from the round
            all_judges = set()
            all_judges.update(round_data.judges)
            all_judges.update(round_data.contestant_judges)
            
            for judge in all_judges:
                lead_vote = round_data.lead_votes.get(judge, '')
                follow_vote = round_data.follow_votes.get(judge, '')
                
                # Convert vote numbers to contestant names
                if lead_vote:
                    if lead_vote == 1:
                        lead_vote = lead1
                    elif lead_vote == 2:
                        lead_vote = lead2
                    elif lead_vote == 3:
                        lead_vote = "Tie"
                    elif lead_vote == 4:
                        lead_vote = "No Contest"
                
                if follow_vote:
                    if follow_vote == 1:
                        follow_vote = follow1
                    elif follow_vote == 2:
                        follow_vote = follow2
                    elif follow_vote == 3:
                        follow_vote = "Tie"
                    elif follow_vote == 4:
                        follow_vote = "No Contest"
                
                # Add row to sheet
                voting_sheet.cell(row=row_index, column=1).value = round_data.round_num
                voting_sheet.cell(row=row_index, column=2).value = judge
                voting_sheet.cell(row=row_index, column=3).value = lead_vote
                voting_sheet.cell(row=row_index, column=4).value = follow_vote
                
                row_index += 1
    
    # Save the workbook to the BytesIO object
    wb.save(output)
    output.seek(0)
    
    # Generate a filename with the current date and time
    filename = f"hustle_n_tussle_battle_{date_str.replace('-', '')}.xlsx"
    
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename
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
                        judge_col = 6 + j * 3
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
        
        # Battle Summary
        if "Battle Summary" in wb.sheetnames:
            summary_sheet = wb["Battle Summary"]
            
            # Extract date and time
            date = summary_sheet['B3'].value if 'B3' in summary_sheet else None
            time = summary_sheet['B4'].value if 'B4' in summary_sheet else None
            total_rounds = summary_sheet['B5'].value if 'B5' in summary_sheet else 0
            
            # Extract top leads
            top_leads = []
            for i in range(10, 13):  # Rows 10-12 for top 3 leads
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
            for i in range(15, 18):  # Rows 15-17 for top 3 follows
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

if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG) 