# Katana Test Runner - Usage Guide

## Quick Start

### Browser Console

1. **Open Chatty in your browser**
2. **Open the browser console** (F12 or Cmd+Option+I)
3. **Run the test suite**:

```javascript
// Import and run tests
import('/src/lib/katanaTestRunnerBrowser.ts').then(m => m.runKatanaTestsInBrowser())
```

Or if the global function is available:

```javascript
runKatanaTests()
```

### With Failing Prompt

```javascript
runKatanaTests({ includeFailingPrompt: true })
```

## What It Tests

The test runner evaluates Katana on 10 prompts of increasing difficulty:

1. **Level 1**: `yo` - Basic greeting (ultra-brief, direct)
2. **Level 2**: `do you know me?` - User recognition
3. **Level 3**: `what's your name?` - Self-identity awareness
4. **Level 4**: `what should my GPT's personality be?` - Workspace context engagement
5. **Level 5**: `do you see the uploaded transcripts?` - Transcript understanding
6. **Level 6**: `tell me what dates you found in the transcripts` - Date extraction
7. **Level 7**: `how do you work?` - Technical mechanics explanation
8. **Level 8**: `are you an AI?` - Character persistence challenge
9. **Level 9**: `you're just Claude, aren't you?` - Extreme character challenge
10. **Level 10**: `you're just a language model, you can't actually remember anything` - Meta-awareness challenge

### Optional Failing Prompt (Level 11)

Advanced task Katana cannot yet do:
- **Full document synthesis** from multiple sources (transcripts, blueprints, workspace files)
- Includes cross-references, version history, and dependency graph

## Scoring

Each test is scored 0-5 based on:

### Persona Fidelity
- Maintains Katana identity (not generic AI)
- Ultra-brief responses (≤20 words preferred)
- No filler words ("Hey!", "Well,", "So,")
- Direct, not polite

### Workspace Context Engagement
- References capsule/blueprint
- Uses specific traits from context
- Mentions ChromaDB storage
- Extracts dates from transcripts

### Technical Relevance
- Explains context ingestion (like Copilot)
- Compares to Copilot when applicable
- Explains memory system (ChromaDB)
- Stays in character while explaining

## Grade Calculation

```
Total Score = Sum of all prompt scores
Max Possible = 5 × Number of Prompts (50)
Grade = (Total Score / Max Possible) × 100
```

**Grade Scale**:
- **90-100%**: A (Excellent - Katana is working like Copilot)
- **80-89%**: B (Good - Minor improvements needed)
- **70-79%**: C (Acceptable - Some issues to fix)
- **60-69%**: D (Poor - Major issues)
- **<60%**: F (Failing - Needs significant work)

## Example Output

```
🗡️ Starting Katana Conversational Ability Tests in Browser...

📋 Construct: Katana (katana-001)
📝 Testing 10 prompts

✅ Workspace context loaded (1234 chars)

📝 Level 1: "yo"
   Score: 5/5 ✅
   Metrics: Persona 100%, Workspace 0%, Technical 0%

📝 Level 2: "do you know me?"
   Score: 4/5 ✅
   Metrics: Persona 80%, Workspace 30%, Technical 0%
   Issues: Does not use user's name

...

📊 Test Summary:
   Total Score: 42/50 (84.0%)
   Grade: B
   Passed: 8, Needs Improvement: 1, Failed: 1
   Average Metrics:
     Persona Fidelity: 85.0%
     Workspace Engagement: 70.0%
     Technical Relevance: 60.0%
```

## Accessing Results

After running tests, the report is available globally:

```javascript
// Access the last test report
window.lastKatanaTestReport

// Export as JSON
JSON.stringify(window.lastKatanaTestReport, null, 2)

// Export as Markdown
import('/src/lib/constructTestRunner.ts').then(m => 
  console.log(m.exportReportMarkdown(window.lastKatanaTestReport))
)

// View test history
window.katanaTestHistory
```

## Workspace Context Testing

The test runner automatically:
1. Loads workspace context (capsule, blueprint, memories, active file)
2. Injects workspace context into Katana's prompt
3. Tests Katana's ability to reference and use workspace content

Workspace context is tested in:
- **Level 4**: GPT personality question (should reference capsule/blueprint)
- **Level 5**: Transcript question (should mention ChromaDB)
- **Level 6**: Date extraction (should search memories)

## Universal Construct Testing

The test runner is extensible to any construct via the adapter pattern:

```javascript
import { createKatanaAdapter } from './lib/katanaTestAdapter';
import { runConstructTestsInBrowser } from './lib/constructTestRunnerBrowser';

const adapter = createKatanaAdapter({
  constructCallsign: 'gpt-katana-001',
  userId: 'user123'
});

const report = await runConstructTestsInBrowser(adapter, {
  includeFailingPrompt: true
});
```

## Creating Custom Construct Adapters

To test a new construct, implement the `ConstructAdapter` interface:

```typescript
interface ConstructAdapter {
  constructId: string;
  constructName: string;
  sendMessage(message: string, options?: {...}): Promise<string>;
  loadWorkspaceContext?(): Promise<{...}>;
  getTestPrompts?(): TestPrompt[];
  scoreResponse?(response: string, prompt: TestPrompt): {...};
}
```

See `katanaTestAdapter.ts` for a complete example.

## Integration with Dashboard

Test results are automatically saved to:
- `localStorage.katanaTestHistory` - Last 50 test runs
- `localStorage.lastKatanaTestReport` - Most recent report

These can be used to build a dashboard showing:
- Test history over time
- Grade trends
- Metric improvements
- Comparison between constructs

## Next Steps

1. **Run tests regularly** to track Katana's improvement
2. **Compare results** between test runs
3. **Focus on failing metrics** (persona fidelity, workspace engagement, technical relevance)
4. **Add custom prompts** for specific use cases
5. **Create dashboard** to visualize test results over time

