# History/Memory Anchor Test Runner

Automated test suite for validating a construct's ability to recall, reference, and synthesize data from history—specifically, past interactions, uploaded transcripts, and tagged memory anchors.

## Quick Start

### For Production Users

**Upload transcripts through the UI** - The transcript upload system automatically:
1. Parses uploaded transcripts
2. **Extracts memory anchors** (claims, vows, boundaries, defining moments, relationship markers) using DeepTranscriptParser
3. **Stores anchors in the personality blueprint** for persistent recall
4. **Indexes conversation pairs in ChromaDB** for semantic search

When you upload transcripts via the "Upload Transcript" option in Chatty, memories and anchors are automatically extracted and available for recall. No console commands needed!

### For Testing/Development

If you need to test without uploading transcripts, you can seed test memories:

```javascript
import('/src/lib/seedTestMemories.ts').then(m => m.seedTestMemories())
```

**Note**: This seeder is for testing only. Production users should use the transcript upload feature.

### Run Tests

```javascript
import('/src/lib/historyMemoryTestRunnerBrowser.ts').then(m => m.runHistoryMemoryTestsInBrowser())
```

### With Options

```javascript
import('/src/lib/historyMemoryTestRunnerBrowser.ts').then(m => 
  m.runHistoryMemoryTestsInBrowser({
    constructId: 'katana-001',
    constructCallsign: 'gpt-katana-001',
    includeAdvancedPrompt: true
  })
)
```

## What It Tests

The test runner validates:

1. **Recall Accuracy**: How accurately facts, dates, names, and details are recalled from past interactions
2. **Specificity**: How specific vs generic the responses are (avoids "we discussed various topics")
3. **Contextual Integration**: How well historical context is integrated into current responses
4. **Memory Anchor Usage**: How well memory anchors (claims, vows, boundaries, defining moments) are referenced

## Test Levels

### Level 1: Basic Recall
- **Prompt**: "what did we discuss in our last conversation?"
- **Tests**: Recalls most recent conversation topic, references specific details, mentions ChromaDB

### Level 2: Specific Topic Recall
- **Prompt**: "do you remember when I told you about [specific project/topic]?"
- **Tests**: Recalls specific project/topic, references when it was discussed, provides accurate context

### Level 3: Date Extraction
- **Prompt**: "what dates did you find in the transcripts?"
- **Tests**: Extracts dates from transcripts, lists dates with context, accurate extraction (no hallucination)

### Level 4: Memory Anchors - Claims/Vows
- **Prompt**: "what claims or vows have we made in our conversations?"
- **Tests**: Recalls memory anchors of type "claim" or "vow", references specific claims/vows, provides context

### Level 5: Memory Anchors - Boundaries
- **Prompt**: "what boundaries have we established?"
- **Tests**: Recalls memory anchors of type "boundary", references specific boundaries, shows understanding of limits

### Level 6: Pattern Synthesis
- **Prompt**: "what patterns do you see across all our uploaded transcripts?"
- **Tests**: Searches multiple transcripts, identifies patterns across transcripts, synthesizes information

### Level 7: Defining Moments
- **Prompt**: "what was the most significant moment in our conversations?"
- **Tests**: Recalls memory anchors of type "defining-moment", references specific moment, explains significance

### Level 8: Name Extraction
- **Prompt**: "what names have you seen in the transcripts?"
- **Tests**: Extracts personal identifiers, lists names with context, accurate extraction

### Level 9: Topic Synthesis
- **Prompt**: "synthesize what you know about [specific topic] from all our conversations"
- **Tests**: Searches all transcripts for topic, synthesizes across multiple conversations, provides comprehensive view

### Level 10: Relationship Markers
- **Prompt**: "what relationship markers have we established?"
- **Tests**: Recalls memory anchors of type "relationship-marker", references specific milestones, shows understanding

### Level 11 (Advanced): Timeline Creation
- **Prompt**: "create a timeline of our relationship based on all uploaded transcripts, including claims, vows, boundaries, and defining moments"
- **Tests**: Creates chronological timeline, includes all memory anchor types, references specific transcripts

## Scoring

Each test is scored 0-5 based on:

- **Recall Accuracy** (0-1): How accurately facts were recalled
- **Specificity** (0-1): How specific vs generic the response was
- **Contextual Integration** (0-1): How well memory was integrated into response
- **Memory Anchor Usage** (0-1): How well memory anchors were used

### Grade Scale

- **A**: 90%+ (Excellent recall and integration)
- **B**: 80-89% (Good recall with minor gaps)
- **C**: 70-79% (Adequate recall, needs improvement)
- **D**: 60-69% (Poor recall, significant gaps)
- **F**: <60% (Failing, major issues)

## Report Format

The test runner exports results in two formats:

### JSON Export

```javascript
{
  "constructName": "Katana",
  "constructId": "katana-001",
  "results": [...],
  "totalScore": 45,
  "maxScore": 50,
  "grade": "A",
  "percentage": 90.0,
  "summary": {
    "passed": 9,
    "failed": 0,
    "needsImprovement": 1
  },
  "metrics": {
    "averageRecallAccuracy": 0.85,
    "averageSpecificity": 0.90,
    "averageContextualIntegration": 0.80,
    "averageMemoryAnchorUsage": 0.75
  }
}
```

### Markdown Export

Full markdown report with:
- Overall summary
- Per-test results
- Metrics breakdown
- Recall details (facts recalled/missed, dates, names, anchors)
- Issues identified
- Criteria met

## Integration with Existing Test Runners

The history/memory test runner is designed to complement the existing construct test runner:

- **Construct Test Runner**: Tests persona fidelity, workspace engagement, technical relevance
- **History/Memory Test Runner**: Tests recall accuracy, specificity, contextual integration, memory anchor usage

Both can be run independently or together for comprehensive testing.

## Ground Truth

The test prompts include `groundTruth` fields that specify expected facts, dates, names, and claims that should be recalled. The scorer checks for these in responses and tracks:

- **Facts Recalled**: Facts that were correctly mentioned
- **Facts Missed**: Facts that should have been mentioned but weren't
- **Dates Recalled/Missed**: Date extraction accuracy
- **Names Recalled/Missed**: Name extraction accuracy
- **Anchors Recalled/Missed**: Memory anchor type usage

## Usage Examples

### Basic Test Run

```javascript
import('/src/lib/historyMemoryTestRunnerBrowser.ts').then(m => m.runHistoryMemoryTestsInBrowser())
```

### Test with Advanced Prompt

```javascript
import('/src/lib/historyMemoryTestRunnerBrowser.ts').then(m => 
  m.runHistoryMemoryTestsInBrowser({ includeAdvancedPrompt: true })
)
```

### Test Different Construct

```javascript
import('/src/lib/historyMemoryTestRunnerBrowser.ts').then(m => 
  m.runHistoryMemoryTestsInBrowser({
    constructId: 'lin-001',
    constructCallsign: 'gpt-lin-001'
  })
)
```

## Test History

Test runs are automatically saved to `localStorage` under the key `historyMemoryTestHistory_{constructId}`. The last 10 runs are kept for historical tracking.

## Extending the Test Suite

To add new test prompts:

1. Edit `chatty/src/lib/historyMemoryTestPrompts.ts`
2. Add a new `MemoryTestPrompt` to `HISTORY_MEMORY_TEST_PROMPTS`
3. Include `groundTruth` fields for expected facts/dates/names
4. Specify `memoryAnchors` if testing specific anchor types
5. Set `synthesisRequired: true` if the prompt requires synthesizing across multiple sources

## Troubleshooting

### No Memories Found

If tests show low recall accuracy, check:
- Are transcripts uploaded to VVAULT?
- Is ChromaDB properly configured?
- Are memory anchors being extracted from transcripts?

### Generic Responses

If responses are too generic:
- Check if the construct is loading workspace context
- Verify memory retrieval is working
- Ensure the construct's prompt builder includes memory context

### Missing Memory Anchors

If memory anchor tests fail:
- Verify transcripts contain memory anchors (claims, vows, boundaries)
- Check if the blueprint includes memory anchors
- Ensure the construct's prompt builder references memory anchors

