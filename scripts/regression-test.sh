#!/bin/bash

# 🧪 Transcript Integration Regression Test Suite
# Ensures zero false positives and 100% genuine responses

set -e

echo "🔍 TRANSCRIPT INTEGRATION REGRESSION TEST"
echo "🎯 Goal: Maintain 5/5 genuine responses with zero false positives"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to chatty directory
cd "$(dirname "$0")/.."

echo "📍 Working directory: $(pwd)"
echo ""

# Check if required files exist
if [ ! -f "test-api-strict-validation.js" ]; then
    echo -e "${RED}❌ ERROR: test-api-strict-validation.js not found${NC}"
    exit 1
fi

if [ ! -f "force-capsule-reload.js" ]; then
    echo -e "${RED}❌ ERROR: force-capsule-reload.js not found${NC}"
    exit 1
fi

echo "🔄 Step 1: Clearing capsule cache..."
node force-capsule-reload.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Capsule cache cleared successfully${NC}"
else
    echo -e "${RED}❌ Failed to clear capsule cache${NC}"
    exit 1
fi

echo ""
echo "🧪 Step 2: Running strict validation test..."
echo ""

# Run the test and capture output
TEST_OUTPUT=$(node test-api-strict-validation.js 2>&1)
TEST_EXIT_CODE=$?

# Check if test ran successfully
if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}❌ Test execution failed${NC}"
    echo "$TEST_OUTPUT"
    exit 1
fi

# Extract key metrics from output
GENUINE_COUNT=$(echo "$TEST_OUTPUT" | grep -o "✅ GENUINE:" | wc -l | tr -d ' ')
FAILED_COUNT=$(echo "$TEST_OUTPUT" | grep -o "❌ FAILED:" | wc -l | tr -d ' ')
ACCURACY=$(echo "$TEST_OUTPUT" | grep -o "Current (strict validation): [0-9]*/5 genuine ([0-9.]*% accuracy)" | grep -o "([0-9.]*% accuracy)" | grep -o "[0-9.]*")

echo "📊 TEST RESULTS:"
echo "   - Genuine responses: $GENUINE_COUNT/5"
echo "   - Failed responses: $FAILED_COUNT/5"
echo "   - Accuracy: ${ACCURACY}%"
echo ""

# Validate results
if [ "$GENUINE_COUNT" -eq 5 ] && [ "$FAILED_COUNT" -eq 0 ]; then
    echo -e "${GREEN}🎉 REGRESSION TEST PASSED${NC}"
    echo -e "${GREEN}✅ Perfect transcript integration maintained${NC}"
    echo -e "${GREEN}✅ Zero false positives confirmed${NC}"
    
    # Extract validation breakdown
    GENUINE_TRANSCRIPT=$(echo "$TEST_OUTPUT" | grep -o "✅ GENUINE_TRANSCRIPT: [0-9]*" | grep -o "[0-9]*")
    GENERIC_FALLBACK=$(echo "$TEST_OUTPUT" | grep -o "❌ GENERIC_FALLBACK: [0-9]*" | grep -o "[0-9]*")
    MISSING_REQUIRED=$(echo "$TEST_OUTPUT" | grep -o "❌ MISSING_REQUIRED: [0-9]*" | grep -o "[0-9]*")
    
    echo ""
    echo "📋 Validation Breakdown:"
    echo "   - Genuine transcript responses: $GENUINE_TRANSCRIPT"
    echo "   - Generic fallbacks: $GENERIC_FALLBACK"
    echo "   - Missing required elements: $MISSING_REQUIRED"
    
    exit 0
else
    echo -e "${RED}❌ REGRESSION TEST FAILED${NC}"
    echo -e "${RED}⚠️ Transcript integration degraded${NC}"
    echo ""
    echo "🔍 Failure Analysis:"
    
    # Show failed questions
    echo "$TEST_OUTPUT" | grep -A 2 "❌ FAILED:" | while read line; do
        if [[ $line == *"❌ FAILED:"* ]]; then
            echo -e "${RED}   $line${NC}"
        elif [[ $line == *"Response:"* ]]; then
            echo "   $line"
        elif [[ $line == *"Generic:"* ]]; then
            echo "   $line"
        fi
    done
    
    echo ""
    echo -e "${YELLOW}💡 Troubleshooting Steps:${NC}"
    echo "   1. Check if new transcript files were added without updating validation bank"
    echo "   2. Verify entity patterns include all required concepts"
    echo "   3. Ensure stop words don't contain domain-specific terms"
    echo "   4. Check for punctuation issues in search terms"
    echo "   5. Review conversation index structure"
    
    exit 1
fi
