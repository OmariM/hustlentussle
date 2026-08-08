# Battle Rules Test Suite

## Overview

This comprehensive test suite validates that all battle rules are properly enforced at every state of the game. The suite is designed to catch rule violations, state inconsistencies, and edge cases that could break the game logic.

## Test Suite Components

### 1. Core Framework (`battle_rules_test_suite.py`)

**Purpose**: Provides the core validation framework and comprehensive rule checking.

**Key Components**:
- `BattleRulesValidator`: Core validator that checks all rules against game state
- `GameStateSnapshot`: Captures complete game state for validation
- `BattleRulesTestSuite`: Main test suite for battle rules
- `StressTestSuite`: Tests with extreme configurations

**Rules Validated**:
- Pairing rules (correct lead/follow pairs, no duplicates)
- Queue management (contestant conservation, proper transitions)
- Judge selection (no competing contestants as judges)
- Point allocation (non-negative, reasonable bounds)
- Win conditions (proper thresholds, game completion)
- State consistency (tie handling, winner tracking)

### 2. Voting Rules Tests (`voting_rules_tests.py`)

**Purpose**: Specialized tests for voting mechanics and scenarios.

**Coverage**:
- Guest judge vote weights (2 points vs 1 for contestants)
- Tie scenarios (both guest judges vote 3)
- No contest scenarios (both guest judges vote 4)
- Split vote handling
- Vote counting accuracy
- Edge cases and invalid inputs

### 3. Pairing Rules Tests (`pairing_rules_tests.py`)

**Purpose**: Detailed testing of pairing and queue management.

**Coverage**:
- Initial pairing validity
- Queue replenishment when running low
- Prevention of consecutive same pairs
- Tie pair re-matching
- Winner queue management
- No contest queue placement
- Judge selection exclusion rules

### 4. Comprehensive Test Runner (`run_complete_test_suite.py`)

**Purpose**: Orchestrates all test suites and provides detailed reporting.

**Features**:
- Runs all test suites with timing and statistics
- Provides detailed failure analysis
- Validates sample game configurations
- Runs regression tests for known edge cases
- Generates comprehensive reports

## Running the Tests

### Quick Run
```bash
python3 battle_rules_test_suite.py
```

### Comprehensive Analysis
```bash
python3 run_complete_test_suite.py
```

### Individual Test Suites
```bash
python3 voting_rules_tests.py
python3 pairing_rules_tests.py
```

## Current Findings

The test suite has successfully identified several critical issues in the game logic:

### 🚨 Critical Issues Found

1. **Judge Selection Bug**
   - **Issue**: Competing contestants are being selected as judges
   - **Impact**: Violates fundamental rule that competitors cannot judge
   - **Detection**: Multiple test failures across all suites
   - **Example**: Lead1 and Follow1 competing but also selected as judges

2. **Queue Management Bug** 
   - **Issue**: No contest scenarios don't properly update queue sizes
   - **Impact**: Contestant accounting becomes inconsistent
   - **Detection**: Queue size assertions failing in no contest tests
   - **Example**: Expected 4 contestants in queue after no contest, found 3

3. **State Transition Issues**
   - **Issue**: Contestants appearing in wrong states during transitions
   - **Impact**: Rule violations during normal game flow
   - **Detection**: Validator finding contestants in both competing and queue states
   - **Example**: Lead2 both competing and in queue simultaneously

### ✅ Rules Successfully Validated

1. **Win Threshold Calculation**: Correctly calculated as `max(leads, follows) - 1`
2. **Tie Handling**: Tied contestants properly re-paired in next round
3. **Basic Pairing**: No contestant competes against themselves
4. **Point Conservation**: Points remain non-negative and bounded
5. **Game Completion**: Game properly finishes when both roles have winners

## Test Suite Architecture

### Validation Strategy

The test suite uses a multi-layered validation approach:

1. **State Snapshot Validation**: Captures complete game state and validates all rules
2. **Transition Testing**: Tests state changes during round transitions
3. **Property-Based Testing**: Validates invariants that should always hold
4. **Stress Testing**: Tests with various contestant configurations
5. **Integration Testing**: Full game simulations from start to finish

### Rule Categories

**Structural Rules**:
- Pairing validity (correct roles, no duplicates)
- Queue management (contestant conservation)
- Judge selection (exclusion of competitors)

**Game Logic Rules**:
- Voting mechanics (weights, tie handling, no contest)
- Point allocation (winner gets +1, reasonable bounds)
- Win conditions (threshold calculation, game completion)

**State Consistency Rules**:
- Contestant accounting (all contestants tracked)
- Transition validity (proper state changes)
- Winner tracking (consistent winner status)

## Usage Examples

### Basic Validation
```python
from battle_rules_test_suite import BattleRulesValidator
from game_logic import Game

# Create game
game = Game(["L1", "L2", "L3", "L4"], ["F1", "F2", "F3", "F4"], ["J1", "J2"])

# Validate current state
validator = BattleRulesValidator(game)
violations = validator.validate_all_rules(validator.capture_state())

if violations:
    print("Rule violations found:")
    for violation in violations:
        print(f"  - {violation}")
else:
    print("All rules properly enforced!")
```

### Custom Test Creation
```python
import unittest
from battle_rules_test_suite import BattleRulesValidator


class MyCustomTests(unittest.TestCase):
    def test_my_scenario(self):
        # Create specific game scenario
        game = create_my_scenario()

        # Validate rules
        validator = BattleRulesValidator(game)
        violations = validator.validate_all_rules(validator.capture_state())

        # Assert no violations
        self.assertEqual(violations, [], f"Rule violations: {violations}")
```

## Configuration Testing

The suite tests various contestant configurations:

- **Standard**: 4 leads, 4 follows
- **Unbalanced**: 2 leads, 5 follows / 5 leads, 2 follows
- **Large**: 20 leads, 20 follows  
- **Minimal**: 2 leads, 2 follows

Each configuration validates:
- Proper pairing formation
- Correct judge selection
- Appropriate win thresholds
- Valid queue management

## Integration with Existing Tests

The battle rules test suite complements the existing `unit_tests.py`:

**Existing Tests**: Focus on specific game mechanics and web API functionality
**Battle Rules Suite**: Focuses on comprehensive rule enforcement and state validation

Both test suites should be run to ensure complete coverage:
```bash
# Run existing tests
python3 unit_tests.py

# Run battle rules tests
python3 run_complete_test_suite.py
```

## Contributing

### Adding New Tests

1. **Identify Rule**: Determine which battle rule needs testing
2. **Choose Suite**: Add to appropriate test file based on rule category
3. **Create Test**: Use `BattleRulesValidator` for comprehensive validation
4. **Document**: Add test description and expected behavior

### Adding New Rules

1. **Update Validator**: Add new validation logic to `BattleRulesValidator`
2. **Create Tests**: Add tests that validate the new rule
3. **Update Documentation**: Document the new rule and its validation

### Example New Test
```python
def test_new_rule(self):
    """Test that my new rule is properly enforced"""
    game = self.create_game()
    
    # Set up scenario that should trigger rule
    setup_rule_scenario(game)
    
    # Validate rules
    violations = self.validate_game_state(game)
    
    # Check that rule is enforced
    self.assertEqual(violations, [], f"New rule violations: {violations}")
```

## Performance Considerations

The test suite is designed for thoroughness over speed:

- **Total Tests**: ~31 tests across 4 suites
- **Execution Time**: < 1 second for full suite
- **Memory Usage**: Minimal (creates temporary game instances)
- **Scalability**: Tests with up to 40 contestants (20v20)

For faster development cycles, run individual test suites or specific tests.

## Conclusion

This battle rules test suite provides comprehensive validation that the game properly enforces all rules at every state. While it has identified several critical bugs in the current implementation, it also validates that the core game logic is sound.

**Key Benefits**:
- ✅ Comprehensive rule validation
- ✅ Catches edge cases and state inconsistencies  
- ✅ Validates all voting scenarios
- ✅ Tests various contestant configurations
- ✅ Provides detailed failure analysis
- ✅ Easy to extend with new rules and tests

**Next Steps**:
1. Fix identified bugs in game logic
2. Re-run tests to validate fixes
3. Add additional edge case tests as needed
4. Integrate into CI/CD pipeline for continuous validation

The test suite ensures that the battle game maintains its integrity and fairness regardless of game state, contestant configuration, or voting scenario.