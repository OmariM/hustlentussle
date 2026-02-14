PYTHON ?= python3

.PHONY: dev test test-unit test-battle test-pairing test-voting lint format check install install-dev clean help

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Run dev web server (localhost:5000)
	$(PYTHON) web/app.py

test: ## Run full test suite
	$(PYTHON) run_complete_test_suite.py

test-unit: ## Run unit tests
	$(PYTHON) unit_tests.py

test-battle: ## Run battle rules tests
	$(PYTHON) battle_rules_test_suite.py

test-pairing: ## Run pairing rules tests
	$(PYTHON) pairing_rules_tests.py

test-voting: ## Run voting rules tests
	$(PYTHON) voting_rules_tests.py

lint: ## Run ruff linter
	ruff check .

format: ## Run ruff formatter
	ruff format .

check: ## Dry-run format + lint (for CI)
	ruff format --check .
	ruff check .

install: ## Install dependencies
	pip install -r requirements.txt

install-dev: ## Install dependencies + ruff
	pip install -r requirements.txt
	pip install ruff

clean: ## Remove __pycache__, .pyc, .pyo files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
