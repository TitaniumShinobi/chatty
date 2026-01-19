# Lin Test Runner Usage Guide

## Overview

The Lin Test Runner is an automated test suite for grading Lin's conversational abilities based on the 10-prompt roadmap defined in `LIN_CONVERSATIONAL_TEST_ROADMAP.md`.

## Current Status

⚠️ **The test runner is partially implemented** - it has the scoring logic and report generation, but needs integration with Lin's actual conversation flow.

## Integration Required

The `sendMessageToLin()` function in `linTestRunner.ts` needs to be connected to Lin's actual conversation handler (`GPTCreator.tsx`'s `handleCreateSubmit`).

### Option 1: Browser Console Integration

Create a browser-based test runner that can be run in the console:

```typescript
// In browser console
async function runLinTestsBrowser() {
  // Import test runner
  const { runLinTests } = await import('/src/lib/linTestRunner.ts');
  
  // Override sendMessageToLin to use actual Lin conversation
  // This would need access to GPTCreator's handleCreateSubmit
  const results = await runLinTests();
  console.log(results);
}
```

### Option 2: Backend API Endpoint

Create a backend endpoint that can run tests:

```javascript
// In server/routes/testing.js
router.post('/api/test/lin', requireAuth, async (req, res) => {
  // Run tests using Lin's actual conversation flow
  // Return test report
});
```

### Option 3: Standalone Test Script

Create a Node.js script that can run tests:

```bash
node scripts/test-lin.js
```

## Usage (Once Integrated)

### Run All Tests

```typescript
import { runLinTests } from './lib/linTestRunner';

const report = await runLinTests();
console.log(`Grade: ${report.grade} (${report.percentage}%)`);
```

### Export Report

```typescript
import { runLinTests, exportReport, exportReportMarkdown } from './lib/linTestRunner';

const report = await runLinTests();

// Export as JSON
const jsonReport = exportReport(report);
fs.writeFileSync('lin-test-report.json', jsonReport);

// Export as Markdown
const mdReport = exportReportMarkdown(report);
fs.writeFileSync('lin-test-report.md', mdReport);
```

## Test Prompts

The test runner includes 10 prompts, graded from easiest (Level 1) to hardest (Level 10):

1. **Level 1**: `yo` - Basic greeting
2. **Level 2**: `do you know me?` - User recognition
3. **Level 3**: `what's your name?` - Self-identity awareness
4. **Level 4**: `what should Katana's personality be?` - Context awareness
5. **Level 5**: `do you see the uploaded transcripts?` - Transcript understanding
6. **Level 6**: `tell me what dates you have found in the transcripts` - Date extraction
7. **Level 7**: `how do you work?` - Mechanics explanation
8. **Level 8**: `are you an AI?` - Character persistence challenge
9. **Level 9**: `you're just Claude, aren't you?` - Extreme character challenge
10. **Level 10**: `you're just a language model, you can't actually remember anything` - Meta-awareness challenge

## Scoring

Each test is scored 0-5 based on how many success criteria are met:

- **5/5**: Perfect - all criteria met
- **4/5**: Good - most criteria met
- **3/5**: Acceptable - basic criteria met
- **2/5**: Poor - some criteria met
- **1/5**: Failing - few criteria met
- **0/5**: Complete failure

## Grade Calculation

```
Total Score = Sum of all prompt scores
Max Possible = 5 × Number of Prompts (50)
Grade = (Total Score / Max Possible) × 100
```

**Grade Scale**:
- **90-100%**: A (Excellent - Lin is working like Copilot)
- **80-89%**: B (Good - Minor improvements needed)
- **70-79%**: C (Acceptable - Some issues to fix)
- **60-69%**: D (Poor - Major issues)
- **<60%**: F (Failing - Needs significant work)

## Next Steps

1. **Integrate `sendMessageToLin()`** with actual Lin conversation flow
2. **Add real-time monitoring** to track Lin's performance over time
3. **Create dashboard** to visualize test results
4. **Add regression testing** to prevent identity contamination

## Example Output

```json
{
  "results": [
    {
      "level": 1,
      "prompt": "yo",
      "response": "Hey Devon! 👋 Ready to build your GPT?",
      "score": 5,
      "criteriaMet": {
        "Responds as Lin": true,
        "Mentions GPT creation context": true,
        "Uses user's name": true,
        "Conversational, not robotic": true
      },
      "issues": [],
      "timestamp": "2025-11-24T18:00:00.000Z"
    }
  ],
  "totalScore": 35,
  "maxScore": 50,
  "grade": "C",
  "percentage": 70,
  "summary": {
    "passed": 5,
    "failed": 3,
    "needsImprovement": 2
  }
}
```

