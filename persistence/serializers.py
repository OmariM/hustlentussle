"""
JSON serialization/deserialization for Game objects.

This module provides custom serialization logic to convert Game instances
and their nested objects (Contestant, Round) to/from JSON format for
database storage.
"""

import json
from typing import Any, Dict, List, Optional
import sys
import os

# Add parent directory to path to import game_logic
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game, Contestant, Round, ContestantQueueProxy


class GameSerializer:
    """
    Handles serialization and deserialization of Game objects to/from JSON.
    
    The serializer captures all game state needed to fully reconstruct
    a Game instance, including contestants, rounds, queues, and flags.
    """
    
    @staticmethod
    def serialize_contestant(contestant: Contestant) -> Dict[str, Any]:
        """Serialize a Contestant to a dictionary."""
        return {
            'name': contestant.name,
            'points': contestant.points,
        }
    
    @staticmethod
    def deserialize_contestant(data: Dict[str, Any]) -> Contestant:
        """Deserialize a dictionary to a Contestant."""
        contestant = Contestant(data['name'])
        contestant.points = data.get('points', 0)
        return contestant
    
    @staticmethod
    def serialize_round(round_obj: Round) -> Dict[str, Any]:
        """Serialize a Round to a dictionary."""
        return {
            'round_num': round_obj.round_num,
            'lead_votes': round_obj.lead_votes,
            'follow_votes': round_obj.follow_votes,
            'judges': round_obj.judges,
            'contestant_judges': round_obj.contestant_judges,
            'win_messages': round_obj.win_messages,
            'pairs': round_obj.pairs,
            'lead_winner': round_obj.lead_winner,
            'follow_winner': round_obj.follow_winner,
            'song_info': round_obj.song_info,
            'session_id': round_obj.session_id,
            'contestant_judging_enabled': getattr(round_obj, 'contestant_judging_enabled', True),
            'simple_contestant_judges': getattr(round_obj, 'simple_contestant_judges', False),
        }
    
    @staticmethod
    def deserialize_round(data: Dict[str, Any]) -> Round:
        """Deserialize a dictionary to a Round."""
        round_obj = Round(
            round_num=data['round_num'],
            lead_votes=data.get('lead_votes', {}),
            follow_votes=data.get('follow_votes', {}),
            judges=data.get('judges', []),
            contestant_judges=data.get('contestant_judges', []),
            session_id=data.get('session_id'),
            contestant_judging_enabled=data.get('contestant_judging_enabled', True),
            simple_contestant_judges=data.get('simple_contestant_judges', False),
        )
        round_obj.win_messages = data.get('win_messages')
        round_obj.pairs = data.get('pairs', {})
        round_obj.lead_winner = data.get('lead_winner')
        round_obj.follow_winner = data.get('follow_winner')
        round_obj.song_info = data.get('song_info')
        return round_obj
    
    @classmethod
    def serialize(cls, game: Game) -> str:
        """
        Serialize a Game instance to a JSON string.
        
        Args:
            game: The Game instance to serialize
            
        Returns:
            JSON string representation of the game state
        """
        # Build contestant lookup for references
        all_contestants = {}
        
        # Serialize leads (from backing list)
        leads_data = []
        for contestant in game._leads:
            contestant_data = cls.serialize_contestant(contestant)
            leads_data.append(contestant_data)
            all_contestants[contestant.name] = contestant
        
        # Serialize follows (from backing list)
        follows_data = []
        for contestant in game._follows:
            contestant_data = cls.serialize_contestant(contestant)
            follows_data.append(contestant_data)
            all_contestants[contestant.name] = contestant
        
        # Serialize initial order (these reference the same objects)
        initial_leads_data = [cls.serialize_contestant(c) for c in game.initial_leads]
        initial_follows_data = [cls.serialize_contestant(c) for c in game.initial_follows]
        
        # Serialize current pairs (store by name for reconstruction)
        pair_1_data = None
        if game.pair_1:
            pair_1_data = {
                'lead_name': game.pair_1[0].name,
                'follow_name': game.pair_1[1].name,
            }
        
        pair_2_data = None
        if game.pair_2:
            pair_2_data = {
                'lead_name': game.pair_2[0].name,
                'follow_name': game.pair_2[1].name,
            }
        
        # Serialize contestant judges (by name)
        contestant_judges_names = [j.name for j in game.contestant_judges]
        
        # Serialize rounds
        rounds_data = [cls.serialize_round(r) for r in game.rounds]
        
        # Serialize current round
        current_round_data = None
        if game.current_round:
            current_round_data = cls.serialize_round(game.current_round)
        
        # Serialize pending queue updates
        pending_leads = [cls.serialize_contestant(c) for c in game._pending_leads_enqueue]
        pending_follows = [cls.serialize_contestant(c) for c in game._pending_follows_enqueue]
        
        # Serialize tie pairs (by name)
        tie_lead_pair_data = None
        if game.tie_lead_pair:
            tie_lead_pair_data = [game.tie_lead_pair[0].name, game.tie_lead_pair[1].name]
        
        tie_follow_pair_data = None
        if game.tie_follow_pair:
            tie_follow_pair_data = [game.tie_follow_pair[0].name, game.tie_follow_pair[1].name]
        
        # Serialize winning contestants (by name)
        winning_lead_name = game.winning_lead.name if game.winning_lead else None
        winning_follow_name = game.winning_follow.name if game.winning_follow else None
        
        # Serialize carryover winners (by name)
        carryover_lead_name = game.carryover_lead_winner.name if game.carryover_lead_winner else None
        carryover_follow_name = game.carryover_follow_winner.name if game.carryover_follow_winner else None
        
        game_data = {
            # Version for future migrations
            'version': 1,
            
            # Session info
            'session_id': game.session_id,
            
            # Contestant lists
            'leads': leads_data,
            'follows': follows_data,
            'initial_leads': initial_leads_data,
            'initial_follows': initial_follows_data,
            
            # Judges
            'guest_judges': game.guest_judges,
            'contestant_judges_names': contestant_judges_names,
            
            # Game state
            'state': game.state,
            'round_num': game.round_num,
            
            # Current pairs
            'pair_1': pair_1_data,
            'pair_2': pair_2_data,
            
            # Round history
            'rounds': rounds_data,
            'current_round': current_round_data,
            
            # Winning state
            'winning_lead_name': winning_lead_name,
            'winning_follow_name': winning_follow_name,
            'has_winning_lead': game.has_winning_lead,
            'has_winning_follow': game.has_winning_follow,
            'last_lead_winner': game.last_lead_winner,
            'last_follow_winner': game.last_follow_winner,
            
            # Tie state
            'tie_lead_pair': tie_lead_pair_data,
            'tie_follow_pair': tie_follow_pair_data,
            
            # Pending updates
            'pending_leads_enqueue': pending_leads,
            'pending_follows_enqueue': pending_follows,
            'no_contest_pending': game.no_contest_pending,
            
            # Carryover winners
            'carryover_lead_winner_name': carryover_lead_name,
            'carryover_follow_winner_name': carryover_follow_name,
            
            # Previous pairs tracking
            'previous_pairs': list(game.previous_pairs.keys()),
            
            # Configuration
            'total_num_leads': game.total_num_leads,
            'total_num_follows': game.total_num_follows,
            'win_threshold': game.win_threshold,
            'num_contestant_judges': game.num_contestant_judges,
            
            # Contestant judging settings
            'contestant_judging_enabled': getattr(game, 'contestant_judging_enabled', True),
            'simple_contestant_judges': getattr(game, 'simple_contestant_judges', False),
        }
        
        return json.dumps(game_data)
    
    @classmethod
    def deserialize(cls, json_str: str) -> Game:
        """
        Deserialize a JSON string to a Game instance.
        
        Args:
            json_str: JSON string representation of game state
            
        Returns:
            Reconstructed Game instance
        """
        data = json.loads(json_str)
        
        # Handle versioning for future migrations
        version = data.get('version', 1)
        if version != 1:
            raise ValueError(f"Unsupported game data version: {version}")
        
        # Create contestant objects and build lookup
        lead_contestants = {}
        follow_contestants = {}
        
        # Recreate initial order contestants first (these are the canonical objects)
        initial_leads = []
        for c_data in data.get('initial_leads', []):
            contestant = cls.deserialize_contestant(c_data)
            initial_leads.append(contestant)
            lead_contestants[contestant.name] = contestant
        
        initial_follows = []
        for c_data in data.get('initial_follows', []):
            contestant = cls.deserialize_contestant(c_data)
            initial_follows.append(contestant)
            follow_contestants[contestant.name] = contestant
        
        # Build queue lists using the same contestant objects
        leads_queue = []
        for c_data in data.get('leads', []):
            name = c_data['name']
            if name in lead_contestants:
                # Use existing object, but update points
                lead_contestants[name].points = c_data.get('points', 0)
                leads_queue.append(lead_contestants[name])
            else:
                contestant = cls.deserialize_contestant(c_data)
                leads_queue.append(contestant)
                lead_contestants[name] = contestant
        
        follows_queue = []
        for c_data in data.get('follows', []):
            name = c_data['name']
            if name in follow_contestants:
                # Use existing object, but update points
                follow_contestants[name].points = c_data.get('points', 0)
                follows_queue.append(follow_contestants[name])
            else:
                contestant = cls.deserialize_contestant(c_data)
                follows_queue.append(contestant)
                follow_contestants[name] = contestant
        
        # Create a minimal game object and manually reconstruct state
        # We need to bypass the normal __init__ which does setup
        game = object.__new__(Game)
        
        # Set session ID
        game.session_id = data.get('session_id')
        
        # Set backing lists
        game._leads = leads_queue
        game._follows = follows_queue
        
        # Create queue proxies
        game.leads = ContestantQueueProxy(game, 'lead')
        game.follows = ContestantQueueProxy(game, 'follow')
        
        # Set initial order
        game.initial_leads = initial_leads
        game.initial_follows = initial_follows
        
        # Set judges
        game.guest_judges = data.get('guest_judges', [])
        
        # Reconstruct contestant judges from names
        contestant_judges_names = data.get('contestant_judges_names', [])
        game.contestant_judges = []
        all_contestants = {**lead_contestants, **follow_contestants}
        for name in contestant_judges_names:
            if name in all_contestants:
                game.contestant_judges.append(all_contestants[name])
        
        # Set game state
        game.state = data.get('state', 0)
        game.round_num = data.get('round_num', 1)
        
        # Reconstruct pairs
        pair_1_data = data.get('pair_1')
        if pair_1_data:
            lead = lead_contestants.get(pair_1_data['lead_name'])
            follow = follow_contestants.get(pair_1_data['follow_name'])
            game.pair_1 = (lead, follow) if lead and follow else None
        else:
            game.pair_1 = None
        
        pair_2_data = data.get('pair_2')
        if pair_2_data:
            lead = lead_contestants.get(pair_2_data['lead_name'])
            follow = follow_contestants.get(pair_2_data['follow_name'])
            game.pair_2 = (lead, follow) if lead and follow else None
        else:
            game.pair_2 = None
        
        # Reconstruct rounds
        game.rounds = [cls.deserialize_round(r_data) for r_data in data.get('rounds', [])]
        
        # Reconstruct current round
        current_round_data = data.get('current_round')
        if current_round_data:
            game.current_round = cls.deserialize_round(current_round_data)
        else:
            game.current_round = None
        
        # Set winning state
        winning_lead_name = data.get('winning_lead_name')
        game.winning_lead = lead_contestants.get(winning_lead_name) if winning_lead_name else None
        
        winning_follow_name = data.get('winning_follow_name')
        game.winning_follow = follow_contestants.get(winning_follow_name) if winning_follow_name else None
        
        game.has_winning_lead = data.get('has_winning_lead', False)
        game.has_winning_follow = data.get('has_winning_follow', False)
        game.last_lead_winner = data.get('last_lead_winner')
        game.last_follow_winner = data.get('last_follow_winner')
        
        # Reconstruct tie pairs
        tie_lead_pair_data = data.get('tie_lead_pair')
        if tie_lead_pair_data and len(tie_lead_pair_data) == 2:
            l1 = lead_contestants.get(tie_lead_pair_data[0])
            l2 = lead_contestants.get(tie_lead_pair_data[1])
            game.tie_lead_pair = (l1, l2) if l1 and l2 else None
        else:
            game.tie_lead_pair = None
        
        tie_follow_pair_data = data.get('tie_follow_pair')
        if tie_follow_pair_data and len(tie_follow_pair_data) == 2:
            f1 = follow_contestants.get(tie_follow_pair_data[0])
            f2 = follow_contestants.get(tie_follow_pair_data[1])
            game.tie_follow_pair = (f1, f2) if f1 and f2 else None
        else:
            game.tie_follow_pair = None
        
        # Reconstruct pending queue updates
        game._pending_leads_enqueue = []
        for c_data in data.get('pending_leads_enqueue', []):
            name = c_data['name']
            if name in lead_contestants:
                game._pending_leads_enqueue.append(lead_contestants[name])
        
        game._pending_follows_enqueue = []
        for c_data in data.get('pending_follows_enqueue', []):
            name = c_data['name']
            if name in follow_contestants:
                game._pending_follows_enqueue.append(follow_contestants[name])
        
        game.no_contest_pending = data.get('no_contest_pending', False)
        
        # Reconstruct carryover winners
        carryover_lead_name = data.get('carryover_lead_winner_name')
        game.carryover_lead_winner = lead_contestants.get(carryover_lead_name) if carryover_lead_name else None
        
        carryover_follow_name = data.get('carryover_follow_winner_name')
        game.carryover_follow_winner = follow_contestants.get(carryover_follow_name) if carryover_follow_name else None
        
        # Reconstruct previous pairs
        game.previous_pairs = {}
        for pair_key in data.get('previous_pairs', []):
            if isinstance(pair_key, (list, tuple)) and len(pair_key) == 2:
                game.previous_pairs[tuple(pair_key)] = True
        
        # Set configuration
        game.total_num_leads = data.get('total_num_leads', len(initial_leads))
        game.total_num_follows = data.get('total_num_follows', len(initial_follows))
        game.win_threshold = data.get('win_threshold', max(game.total_num_leads, game.total_num_follows) - 1)
        game.num_contestant_judges = data.get('num_contestant_judges', 0)
        
        # Set contestant judging settings
        # Enforce constraint: simple_contestant_judges must be False if contestant_judging_enabled is False
        game.contestant_judging_enabled = data.get('contestant_judging_enabled', True)
        simple_flag = data.get('simple_contestant_judges', False)
        game.simple_contestant_judges = bool(simple_flag) if game.contestant_judging_enabled else False
        
        return game
    
    @classmethod
    def to_dict(cls, game: Game) -> Dict[str, Any]:
        """
        Serialize a Game instance to a dictionary (for JSONB storage).
        
        Args:
            game: The Game instance to serialize
            
        Returns:
            Dictionary representation of the game state
        """
        return json.loads(cls.serialize(game))
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Game:
        """
        Deserialize a dictionary to a Game instance.
        
        Args:
            data: Dictionary representation of game state
            
        Returns:
            Reconstructed Game instance
        """
        return cls.deserialize(json.dumps(data))

