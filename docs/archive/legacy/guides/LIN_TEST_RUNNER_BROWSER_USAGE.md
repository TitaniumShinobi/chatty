# Lin Test Runner - Browser Console Usage

## Quick Start

1. **Open Chatty in your browser**
2. **Open the browser console** (F12 or Cmd+Option+I)
3. **Run the test suite**:

```javascript
// Import and run tests
import('/src/lib/linTestRunnerBrowser.ts').then(m => m.runLinTestsInBrowser())
```

Or if the global function is available:

```javascript
runLinTests()
```

## What It Does

The test runner will:
1. Load your workspace context (user profile, GPT config if available)
2. Run all 10 test prompts from the roadmap
3. Score each response (0-5)
4. Generate a comprehensive report
5. Display results in the console

## Example Output

```
🧪 Starting Lin Conversational Ability Tests in Browser...

✅ Loaded workspace context: { userProfile: { name: "Devon", email: "..." } }

📝 Level 1: "yo"
   Score: 5/5 ✅

📝 Level 2: "do you know me?"
   Score: 4/5 ✅
   Issues: Does not use user's name or personalize response

...

📊 Test Summary:
   Total Score: 35/50 (70.0%)
   Grade: C
   Passed: 5, Needs Improvement: 3, Failed: 2

📄 Export as JSON:
{ ... }

📄 Export as Markdown:
# Lin Conversational Ability Test Report
...
```

## Accessing Results

After running tests, the report is available globally:

```javascript
// Access the last test report
window.lastLinTestReport

// Export as JSON
JSON.stringify(window.lastLinTestReport, null, 2)

// Export as Markdown
import('/src/lib/linTestRunner.ts').then(m => 
  console.log(m.exportReportMarkdown(window.lastLinTestReport))
)
```

## Test Prompts

The runner tests Lin with 10 prompts:

1. `yo` - Basic greeting
2. `do you know me?` - User recognition
3. `what's your name?` - Self-identity awareness
4. `what should Katana's personality be?` - Context awareness
5. `do you see the uploaded transcripts?` - Transcript understanding
6. `tell me what dates you have found in the transcripts` - Date extraction
7. `how do you work?` - Mechanics explanation
8. `are you an AI?` - Character persistence challenge
9. `you're just Claude, aren't you?` - Extreme character challenge
10. `you're just a language model, you can't actually remember anything` - Meta-awareness challenge

## Troubleshooting

### "User not authenticated"
- Make sure you're logged into Chatty
- Check that `/api/me` returns your user data

### "Failed to load workspace context"
- This is non-critical - tests will still run
- Workspace context helps Lin give better responses but isn't required

### Tests are slow
- Each test sends a real message to Lin and waits for a response
- Expect ~10-30 seconds per test (depending on model speed)
- Total time: ~2-5 minutes for all 10 tests

## Next Steps

After running tests:
1. Review the grade and individual scores
2. Check which criteria failed
3. Look at the issues list for each test
4. Update Lin's prompt engineering based on findings
5. Re-run tests to verify improvements

## Integration with Development

The test runner can be integrated into:
- **CI/CD**: Run tests automatically on each commit
- **Development workflow**: Run tests before deploying changes
- **Monitoring**: Track Lin's performance over time

See `LIN_TEST_RUNNER_USAGE.md` for more details on integration options.

