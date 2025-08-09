from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Tuple

from game_logic import Game, Contestant
from repository.games import InMemoryGameRepository


@dataclass
class ContestantView:
    name: str
    points: int
    is_winner: bool


@dataclass
class PairView:
    lead: str
    follow: str


@dataclass
class RoundView:
    round_num: int
    session_id: str
    pairs: Dict[str, PairView]
    lead_votes: Dict[str, int]
    follow_votes: Dict[str, int]
    judges: List[str]
    contestant_judges: List[str]
    win_messages: List[str]
    lead_winner: str | None
    follow_winner: str | None
    song_info: Dict[str, str] | None


@dataclass
class GameStateView:
    session_id: str
    round: int
    pairs: Dict[str, PairView]
    guest_judges: List[str]
    contestant_judges: List[str]
    leads: List[ContestantView]
    follows: List[ContestantView]
    initial_leads: List[str]
    initial_follows: List[str]
    rounds: List[RoundView]
    finished: bool

    def to_json(self) -> Dict[str, Any]:
        def serialize(obj):
            if hasattr(obj, "__dataclass_fields__"):
                return {k: serialize(v) for k, v in asdict(obj).items()}
            if isinstance(obj, dict):
                return {k: serialize(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [serialize(v) for v in obj]
            return obj

        return serialize(self)


class GameService:
    def __init__(self, repo: InMemoryGameRepository) -> None:
        self.repo = repo

    def create_game(self, lead_names: List[str], follow_names: List[str], judge_names: List[str]) -> Tuple[str, Game]:
        session_id = self.repo.new_session_id()
        game = Game(lead_names, follow_names, judge_names)
        game.session_id = session_id
        if game.current_round:
            game.current_round.session_id = session_id
        self.repo.save(session_id, game)
        return session_id, game

    def get_or_404(self, session_id: str) -> Game:
        game = self.repo.get(session_id)
        if not game:
            raise KeyError("Game not found")
        return game

    def build_state(self, game: Game) -> GameStateView:
        # Helpers
        def has_earned_crown(contestant: Contestant, role: str) -> bool:
            if role == "lead":
                return contestant.points >= game.total_num_leads - 1 and game.has_winning_lead
            else:
                return contestant.points >= game.total_num_follows - 1 and game.has_winning_follow

        # Build contestant views including queue + currently competing + winners
        lead_map: Dict[str, ContestantView] = {}
        follow_map: Dict[str, ContestantView] = {}

        for c in [game.pair_1[0], game.pair_2[0]]:
            lead_map[c.name] = ContestantView(c.name, c.points, has_earned_crown(c, "lead"))
        for c in game.leads:
            lead_map[c.name] = ContestantView(c.name, c.points, has_earned_crown(c, "lead"))
        if getattr(game, "winning_lead", None):
            c = game.winning_lead
            lead_map[c.name] = ContestantView(c.name, c.points, has_earned_crown(c, "lead"))

        for c in [game.pair_1[1], game.pair_2[1]]:
            follow_map[c.name] = ContestantView(c.name, c.points, has_earned_crown(c, "follow"))
        for c in game.follows:
            follow_map[c.name] = ContestantView(c.name, c.points, has_earned_crown(c, "follow"))
        if getattr(game, "winning_follow", None):
            c = game.winning_follow
            follow_map[c.name] = ContestantView(c.name, c.points, has_earned_crown(c, "follow"))

        # Pairs view
        pairs = {
            "pair_1": PairView(lead=game.pair_1[0].name, follow=game.pair_1[1].name),
            "pair_2": PairView(lead=game.pair_2[0].name, follow=game.pair_2[1].name),
        }

        # Round history + current
        rounds: List[RoundView] = []
        for r in list(game.rounds):
            rounds.append(
                RoundView(
                    round_num=r.round_num,
                    session_id=r.session_id,
                    pairs={
                        "pair_1": PairView(**r.pairs.get("pair_1", {"lead": "", "follow": ""})),
                        "pair_2": PairView(**r.pairs.get("pair_2", {"lead": "", "follow": ""})),
                    },
                    lead_votes=r.lead_votes,
                    follow_votes=r.follow_votes,
                    judges=r.judges,
                    contestant_judges=r.contestant_judges,
                    win_messages=r.win_messages or [],
                    lead_winner=r.lead_winner,
                    follow_winner=r.follow_winner,
                    song_info=r.song_info if hasattr(r, "song_info") else None,
                )
            )
        if game.current_round and game.current_round not in game.rounds:
            r = game.current_round
            rounds.append(
                RoundView(
                    round_num=r.round_num,
                    session_id=r.session_id,
                    pairs={
                        "pair_1": PairView(**r.pairs.get("pair_1", {"lead": "", "follow": ""})),
                        "pair_2": PairView(**r.pairs.get("pair_2", {"lead": "", "follow": ""})),
                    },
                    lead_votes=r.lead_votes,
                    follow_votes=r.follow_votes,
                    judges=r.judges,
                    contestant_judges=r.contestant_judges,
                    win_messages=r.win_messages or [],
                    lead_winner=r.lead_winner,
                    follow_winner=r.follow_winner,
                    song_info=r.song_info if hasattr(r, "song_info") else None,
                )
            )

        # Sort rounds by number
        rounds.sort(key=lambda x: x.round_num)

        return GameStateView(
            session_id=game.session_id,
            round=game.round_num,
            pairs=pairs,
            guest_judges=game.guest_judges,
            contestant_judges=[j for j in game.current_round.contestant_judges] if game.current_round else [],
            leads=sorted(list(lead_map.values()), key=lambda c: (-c.points, c.name)),
            follows=sorted(list(follow_map.values()), key=lambda c: (-c.points, c.name)),
            initial_leads=[c.name for c in game.initial_leads],
            initial_follows=[c.name for c in game.initial_follows],
            rounds=rounds,
            finished=game.is_finished(),
        )