# Hustle n' Tussle - Dance Competition CLI

A colorful and interactive command-line app to run a **partner dance competition**!

Participants are split into **Leads** and **Follows**, with **Guest Judges** and **Contestant Judges** voting each round.
The game automatically tracks scores, matchups, and produces a leaderboard with medals! 🥇🥈🥉

---

## 🕺 Features

- ✅ Random matchups between Leads and Follows.
- ✅ Color-coded round displays and voting prompts.
- ✅ Guest Judges can select Tie/No Contest; Contestant Judges must pick a contestant.
- ✅ Tracks points for every contestant individually.
- ✅ Round-by-round progression until final winners are crowned.
- ✅ Polished final leaderboard display with medals and rankings.

---

## 🚀 How to Run

1. Clone or download the project folder.

2. (Optional but recommended) Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate    # (Mac/Linux)
   venv\Scripts\activate     # (Windows)
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the game:
   ```bash
   python main.py
   ```

---

## 🎯 Project Structure

```
hustlentussle/
├── main.py             # Interactive CLI frontend
├── game_logic.py        # Backend game logic
├── requirements.txt     # Project dependencies
├── .gitignore           # Ignored files/folders
└── README.md            # This file
```

---

## 📋 Example Round Input

You will first enter the contestants:

```
Enter lead names (comma-separated): Logan, Ian, Rob
Enter follow names (comma-separated): Emma, Tati, Reina
Enter guest judge names (comma-separated): Kenji, Diane
```

**Then the system will display the matchups:**

```
===== Round 1 =====
Matchup 1: Logan (0 pts) (Lead) & Emma (0 pts) (Follow)
Matchup 2: Ian (0 pts) (Lead) & Tati (0 pts) (Follow)
Contestant Judges: Rob, Reina

Voting for Leads:
Kenji vote:
 [1] Logan
 [2] Ian
 [3] Tie
 [4] No Contest
Choice: 1
Diane vote:
 [1] Logan
 [2] Ian
 [3] Tie
 [4] No Contest
Choice: 2
Rob vote:
 [1] Logan
 [2] Ian
Choice: 1
Reina vote:
 [1] Logan
 [2] Ian
Choice: 2

Winner: Logan beat Ian 4-2
```

---

## 🛠 Requirements

- Python 3.8+
- `colorama` (installed via `requirements.txt`)

---

## 🏆 Final Results Example

```
🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦
Top Leads:
🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦
🥇 Logan (5)
🥈 Ian (3)
🥉 Rob (2)

🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪
Top Follows:
🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪🟪
🥇 Reina (4)
🥈 Tati (2)
🥉 Emma (1)
```

---

## 📢 Notes

- Guest Judges can vote for Tie/No Contest.
- Contestant Judges must vote for one contestant.
- Points are awarded per win.
- Contestant Judges are randomly chosen each round.

---

## ✨ Future Enhancements

- Web frontend for online voting.
- Save/load tournament mid-game.
- Animated bracket visualization.
- Different scoring rules for large competitions.

---
