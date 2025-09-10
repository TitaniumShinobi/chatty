#!/bin/bash

# Pre-commit script to prevent helper prose regressions
set -e

echo "🔍 Running pre-commit checks..."

# Check for assistant prose literals
echo "Checking for assistant prose literals..."
if grep -n 'content:\s*"' src/**/*.ts | grep -v 'role:\s*"user"'; then
    echo "❌ Found assistant prose literals!"
    echo "Please remove any 'content: \"...\"' for assistant messages"
    exit 1
fi

# Check for helper prose patterns
echo "Checking for helper prose patterns..."
if grep -n "Welcome|What would you like|I'll help you|starter|seed|suggestion" src/**/*.ts; then
    echo "❌ Found helper prose patterns!"
    echo "Please remove any helper text and use opcodes instead"
    exit 1
fi

# Run tests
echo "Running tests..."
npm test --silent

echo "✅ All pre-commit checks passed!"
