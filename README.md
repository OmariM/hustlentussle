# Hustle n’ Tussle - Dance Competition CLI

A command‑line application to manage a partner dance competition between **Leads** and **Follows**. The game randomly pairs dancers, uses **Guest Judges** and **Contestant Judges** to vote each round, supports **Ties** and **No Contest**, tracks individual points, and displays final leaderboards.

---

## 🔧 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hustle-n-tussle.git
   cd hustle-n-tussle
   ```
2. (Optional) Create a virtual environment and activate it:
   ```bash
   python3 -m venv venv
   source venv/bin/activate   # Mac/Linux
   venv\\Scripts\\activate    # Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## 🚀 Usage

### Run the Interactive CLI

```bash
python main.py
```

- **Enter** lead names, follow names, and guest judge names (comma‑separated).
- **Vote** each round for Leads (with Tie/No Contest options for guests) and for Follows.
- **Results** and points update automatically until winners are determined.

### Run Automated Tests

```bash
python test_simulation.py
```

- Validates tie handling, no contest logic, split votes, sweeps, and queue behavior.
- Outputs a PASS/FAIL summary for 7 test scenarios.

### Run Simple Simulation

```bash
python simulate_test.py
```

- Walks through 3 rounds of simulated winners to demonstrate pairing logic.

---

## ⚙️ Features

- **Random Pairing**: Each round pairs one Lead with one Follow.
- **Guest & Contestant Judges**: Guests can choose Tie or No Contest; contestants must pick a winner.
- **Tie Handling**: Both tied dancers gain +1 point and continue to the next round with fresh opponents.
- **No Contest**: No points awarded; previous dancers return to the end of the queue and fresh opponents are selected.
- **Scoring**: Points awarded per win; tracked individually and sorted.
- **Final Leaderboards**: Displays separate Top Leads and Top Follows sorted by points.

---

## 📂 Project Structure

```
hustle-n-tussle/
├── game_logic.py         # Core game engine
├── main.py               # CLI frontend
├── test_simulation.py    # Automated unit‑style tests
├── simulate_test.py      # Simple round simulation script
├── requirements.txt      # External dependencies (colorama)
├── .gitignore
└── README.md             # This file
```

---

## 📝 Customization

- **Scoring Rules**: Adjust point values in `judge_round`.
- **Judge Counts**: Change `num_contestant_judges` in `Game` class.
- **Tie/No Contest Options**: Extend or modify in `main.py` voting prompts.

---

## 🤝 Contributing

Feel free to submit pull requests or open issues on GitHub. All enhancements and bug fixes are welcome!

---

*Enjoy running your dance competition!*
