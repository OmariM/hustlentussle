#!/usr/bin/env python3
"""
Comprehensive Battle Rules Test Suite Runner

This script runs all test suites and provides detailed analysis of the battle rule validation.
It includes:
1. Basic battle rules validation
2. Voting rules testing
3. Pairing and queue management testing
4. Stress testing with various configurations
5. Integration testing with complete game simulations
"""

import unittest
import sys
import time
from typing import Dict, List

# Import all test suites
from battle_rules_test_suite import BattleRulesTestSuite, StressTestSuite, BattleRulesValidator
from voting_rules_tests import VotingRulesTestSuite
from pairing_rules_tests import PairingRulesTestSuite
from tiebreak_tests import (
    TestDetectTiebreakNeeds,
    TestStartTiebreak,
    TestPartnerSelections,
    TestAdvanceTiebreakSubRound,
    TestJudgeTiebreak,
    TestFinalizeTiebreakResults,
    TestEndToEndTiebreakFlow,
)
from persistence_serialization_tests import TestGameSerialization
from game_logic import Game


class TestSuiteRunner:
    """Comprehensive test suite runner with detailed reporting"""

    def __init__(self):
        self.results = {}
        self.total_tests = 0
        self.total_failures = 0
        self.total_errors = 0
        self.start_time = None

    def run_all_suites(self) -> Dict[str, any]:
        """Run all test suites and collect results"""
        self.start_time = time.time()

        # Define all test suites
        test_suites = [
            ("Core Battle Rules", BattleRulesTestSuite),
            ("Voting Rules", VotingRulesTestSuite),
            ("Pairing Rules", PairingRulesTestSuite),
            ("Stress Tests", StressTestSuite),
            ("Tie-Break: Detection", TestDetectTiebreakNeeds),
            ("Tie-Break: Start", TestStartTiebreak),
            ("Tie-Break: Partner Selections", TestPartnerSelections),
            ("Tie-Break: Sub-Round Advance", TestAdvanceTiebreakSubRound),
            ("Tie-Break: Judge Voting", TestJudgeTiebreak),
            ("Tie-Break: Finalize", TestFinalizeTiebreakResults),
            ("Tie-Break: End-to-End", TestEndToEndTiebreakFlow),
            ("Persistence: Serialization", TestGameSerialization),
        ]

        print("=" * 60)
        print("COMPREHENSIVE BATTLE RULES TEST SUITE")
        print("=" * 60)
        print(f"Running {len(test_suites)} test suites...\n")

        for suite_name, suite_class in test_suites:
            print(f"Running {suite_name}...")
            result = self.run_test_suite(suite_class)
            self.results[suite_name] = result
            self.total_tests += result["tests_run"]
            self.total_failures += result["failures"]
            self.total_errors += result["errors"]
            print(f"  ✓ {result['tests_run']} tests, {result['failures']} failures, {result['errors']} errors\n")

        return self.results

    def run_test_suite(self, suite_class) -> Dict[str, any]:
        """Run a single test suite and return results"""
        loader = unittest.TestLoader()
        suite = loader.loadTestsFromTestCase(suite_class)

        # Create a test result collector
        result = unittest.TestResult()
        suite.run(result)

        return {
            "tests_run": result.testsRun,
            "failures": len(result.failures),
            "errors": len(result.errors),
            "failure_details": result.failures,
            "error_details": result.errors,
            "success_rate": ((result.testsRun - len(result.failures) - len(result.errors)) / max(1, result.testsRun))
            * 100,
        }

    def generate_report(self) -> str:
        """Generate a comprehensive test report"""
        elapsed_time = time.time() - self.start_time
        overall_success_rate = (
            (self.total_tests - self.total_failures - self.total_errors) / max(1, self.total_tests)
        ) * 100

        report = []
        report.append("=" * 60)
        report.append("BATTLE RULES TEST SUITE COMPREHENSIVE REPORT")
        report.append("=" * 60)
        report.append(f"Execution time: {elapsed_time:.2f} seconds")
        report.append(f"Total tests: {self.total_tests}")
        report.append(f"Total failures: {self.total_failures}")
        report.append(f"Total errors: {self.total_errors}")
        report.append(f"Overall success rate: {overall_success_rate:.1f}%")
        report.append("")

        # Suite-by-suite breakdown
        report.append("SUITE BREAKDOWN:")
        report.append("-" * 40)
        for suite_name, result in self.results.items():
            status = "✓" if result["failures"] == 0 and result["errors"] == 0 else "✗"
            report.append(
                f"{status} {suite_name}: {result['success_rate']:.1f}% "
                f"({result['tests_run']} tests, {result['failures']} failures, {result['errors']} errors)"
            )

        report.append("")

        # Failure analysis
        if self.total_failures > 0 or self.total_errors > 0:
            report.append("FAILURE ANALYSIS:")
            report.append("-" * 40)

            for suite_name, result in self.results.items():
                if result["failures"] > 0 or result["errors"] > 0:
                    report.append(f"\n{suite_name}:")

                    for test, traceback_str in result["failure_details"]:
                        report.append(f"  FAIL: {test}")
                        # Extract just the assertion message
                        lines = traceback_str.strip().split("\n")
                        for line in lines:
                            if "AssertionError:" in line:
                                report.append(f"    {line.strip()}")
                                break

                    for test, traceback_str in result["error_details"]:
                        report.append(f"  ERROR: {test}")
                        lines = traceback_str.strip().split("\n")
                        for line in lines:
                            if "Error:" in line or "Exception:" in line:
                                report.append(f"    {line.strip()}")
                                break

        return "\n".join(report)

    def validate_sample_games(self) -> Dict[str, List[str]]:
        """Run validation on sample game configurations"""
        print("Running additional validation on sample game configurations...")

        validation_results = {}

        # Test different configurations
        configs = [
            ("Standard 4v4", ["L1", "L2", "L3", "L4"], ["F1", "F2", "F3", "F4"]),
            ("Unbalanced 2v5", ["L1", "L2"], ["F1", "F2", "F3", "F4", "F5"]),
            ("Unbalanced 5v2", ["L1", "L2", "L3", "L4", "L5"], ["F1", "F2"]),
            ("Large 8v8", [f"L{i}" for i in range(1, 9)], [f"F{i}" for i in range(1, 9)]),
        ]

        for config_name, leads, follows in configs:
            try:
                game = Game(leads, follows, ["Judge1", "Judge2"], points_to_win=7)
                validator = BattleRulesValidator(game)
                state = validator.capture_state()
                violations = validator.validate_all_rules(state)
                validation_results[config_name] = violations

                status = "✓" if not violations else "✗"
                print(f"  {status} {config_name}: {len(violations)} violations")

            except Exception as e:
                validation_results[config_name] = [f"Exception: {str(e)}"]
                print(f"  ✗ {config_name}: Exception - {str(e)}")

        return validation_results

    def run_rule_regression_tests(self) -> List[str]:
        """Run specific regression tests for known rule edge cases"""
        print("Running rule regression tests...")

        issues = []

        # Test 1: Judge selection consistency
        try:
            game = Game(["L1", "L2", "L3", "L4"], ["F1", "F2", "F3", "F4"], ["J1", "J2"], points_to_win=7)
            competing = {game.pair_1[0].name, game.pair_1[1].name, game.pair_2[0].name, game.pair_2[1].name}
            judging = {judge.name for judge in game.contestant_judges}

            if competing.intersection(judging):
                issues.append("Judge selection allows competing contestants as judges")
        except Exception as e:
            issues.append(f"Judge selection test failed: {e}")

        # Test 2: Queue state after no contest
        try:
            game = Game(["L1", "L2", "L3", "L4"], ["F1", "F2", "F3", "F4"], ["J1", "J2"], points_to_win=7)
            initial_queue_size = len(game.leads)

            # Simulate no contest
            lead_pair = (game.pair_1[0], game.pair_2[0])
            game.judge_round(lead_pair[0], lead_pair[1], "lead", [("J1", 4), ("J2", 4)])

            if len(game.leads) != initial_queue_size + 2:
                issues.append("No contest doesn't properly add contestants to queue")
        except Exception as e:
            issues.append(f"No contest test failed: {e}")

        # Test 3: Auto win threshold calculation (auto_win_threshold is always computed)
        try:
            configs_to_test = [
                (["L1", "L2"], ["F1", "F2", "F3", "F4"], 3),  # max(2,4) - 1 = 3
                (["L1", "L2", "L3", "L4"], ["F1", "F2"], 3),  # max(4,2) - 1 = 3
                (["L1", "L2", "L3"], ["F1", "F2", "F3"], 2),  # max(3,3) - 1 = 2
            ]

            for leads, follows, expected_threshold in configs_to_test:
                game = Game(leads, follows, ["J1", "J2"])
                if game.auto_win_threshold != expected_threshold:
                    issues.append(
                        f"Auto win threshold calculation error: expected {expected_threshold}, got {game.auto_win_threshold}"
                    )
                # Default win_threshold should be 7 when no points_to_win provided
                if game.win_threshold != 7:
                    issues.append(f"Default win threshold error: expected 7, got {game.win_threshold}")
        except Exception as e:
            issues.append(f"Win threshold test failed: {e}")

        print(f"  Found {len(issues)} regression issues")
        return issues


def main():
    """Main test runner"""
    runner = TestSuiteRunner()

    # Run all test suites
    runner.run_all_suites()

    # Run additional validations
    validation_results = runner.validate_sample_games()
    regression_issues = runner.run_rule_regression_tests()

    # Generate and print report
    report = runner.generate_report()
    print(report)

    # Additional validation results
    if any(validation_results.values()) or regression_issues:
        print("\nADDITIONAL VALIDATION ISSUES:")
        print("-" * 40)

        for config, violations in validation_results.items():
            if violations:
                print(f"{config}:")
                for violation in violations:
                    print(f"  - {violation}")

        if regression_issues:
            print("\nRegression Issues:")
            for issue in regression_issues:
                print(f"  - {issue}")

    # Return exit code based on results
    if runner.total_failures == 0 and runner.total_errors == 0:
        print("\n🎉 ALL TESTS PASSED! Battle rules are properly enforced.")
        return 0
    else:
        print(f"\n❌ {runner.total_failures + runner.total_errors} test issues found.")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
