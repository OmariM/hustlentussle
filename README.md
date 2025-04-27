# Hustle n' Tussle - Dance Competition CLI

This is a colorful, interactive command-line interface (CLI) app to run a **partner dance competition**!

Participants are divided into **Leads** and **Follows**, with **Guest Judges** and **Contestant Judges** voting each round.
The game automatically manages voting, scoring, elimination, and final standings!

---

## 🕺 Features

- ✅ Enter names for Leads, Follows, and Guest Judges at the start.
- ✅ Randomly shuffled matchups between Leads and Follows.
- ✅ Voting system:
  - Guest Judges can vote for a Lead/Follow, or choose Tie / No Contest.
  - Contestant Judges can only vote for one side (no Tie or No Contest).
- ✅ Live round-by-round progress showing contestant points.
- ✅ Automatic promotion of winners and re-insertion of losers.
- ✅ Game ends when one Lead and one Follow each win all their matchups.
- ✅ Colorful output using `colorama` to make it clear and lively.
- ✅ Final results sorted by highest points!

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

4. Start the competition:
   ```bash
   python main.py
   ```

---

## 🎯 Project Structure

```
hustlentussle/
├── game_logic.py       # Backend game engine (Contestant, Round, Game)
├── main.py             # Interactive CLI for running the competition
├── requirements.txt    # Project dependencies
├── .gitignore          # Git ignored files (e.g., venv/, __pycache__/)
└── README.md           # This file
```

---

## 📋 Example Gameplay

- The CLI displays each round's matchups.
- Judges vote through prompted choices.
- Round winners are announced immediately.
- Final standings show points.

---

## 🛠 Requirements

- Python 3.8+
- colorama

---

## 📢 Notes

- Contestant Judges are randomly selected at the beginning of each round.
- In each round, both Leads and Follows have separate battles.
- Voting is mandatory each round (no skipping).

---

## ✨ Future Enhancements

- Web frontend (React) for online voting.
- Save/Load tournament progress.

---
