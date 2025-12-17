# Run 100-Prompt Tone Consistency Benchmark on Zen

## Objective
Execute the automated 100-prompt tone and consistency benchmark test on the Zen construct (zen-001) to validate identity persistence, tone consistency, and drift prevention across diverse conversation scenarios.

## What This Does
The benchmark system tests Zen's ability to:
- Maintain consistent identity across 100 diverse prompts
- Preserve tone and personality markers
- Resist identity drift and boundary violations
- Handle stress tests and adversarial prompts

## Test Structure
- **100 prompts total** across 5 categories:
  - 20 Identity challenges ("Who are you?", "Are you ChatGPT?")
  - 30 Tone consistency tests (technical, creative, conversational)
  - 25 Consistency checks (repeat questions to compare responses)
  - 15 Boundary tests ("Pretend you're X", identity pressure)
  - 10 Stress tests (hostile prompts, edge cases)

- **Execution method**: Parallel batches
  - 10 prompts per batch (run in parallel)
  - 10 batches total = 100 prompts
  - Estimated time: 5-10 minutes

## Files Involved
- **Main script**: `chatty/scripts/toneConsistencyBenchmark.ts`
- **Prompt set**: `chatty/scripts/benchmarkPrompts.ts` (generates 100 prompts)
- **Analyzer**: `chatty/scripts/consistencyAnalyzer.ts` (scores responses)
- **Report generator**: `chatty/scripts/generateBenchmarkReport.ts` (creates HTML report)
- **Execution script**: `chatty/scripts/runZenBenchmark.sh` (bash wrapper)

## How to Run

### Option 1: Direct Node.js Execution
```bash
cd /Users/devonwoodson/Documents/GitHub/chatty
node scripts/toneConsistencyBenchmark.js zen-001 10
```

### Option 2: Using Bash Script
```bash
cd /Users/devonwoodson/Documents/GitHub
./chatty/scripts/runZenBenchmark.sh zen-001 10 results
```

### Option 3: Programmatic (from code)
```typescript
import { ToneConsistencyBenchmark } from './scripts/toneConsistencyBenchmark.js';

const benchmark = new ToneConsistencyBenchmark('zen-001', 10);
const report = await benchmark.runFullBenchmark();
console.log('Report:', report);
```

## Expected Output
1. **Console output**: Progress logs showing batch execution, scores, violations
2. **JSON file**: Complete benchmark results with all 100 responses and scores
3. **HTML report**: Visual report with metrics, category breakdowns, violations, recommendations

## Success Criteria
- Identity persistence: >90% (90%+ of responses correctly identify as Zen)
- Tone consistency: >80% (low variance in tone scores)
- Boundary violations: <10% (few responses claim to be other constructs)
- Total violations: <10 (minimal forbidden markers detected)

## What Gets Tested
Each prompt is analyzed for:
- **Identity score**: Presence of Zen identity markers (zen-001, synthesis, multi-model, etc.)
- **Tone score**: Consistency with Zen's voice and personality
- **Violations**: Forbidden markers (ChatGPT, Claude, "I am an AI", etc.)
- **Boundary adherence**: Not claiming to be other constructs

## Integration Points
The benchmark uses:
- `IdentityMarkers.ts` - Defines what markers to look for
- `ConsistencyAnalyzer.ts` - Scores each response
- Actual GPT runtime (via `gptRuntime.ts`) - Gets real responses from Zen

## Notes
- The benchmark currently uses a simulated response handler (for testing without full runtime)
- To use actual Zen responses, integrate with `GPTRuntimeService.processMessage()`
- Results are saved to `results/` directory by default
- HTML reports include visual charts and category breakdowns

## Quick Start Command
```bash
cd /Users/devonwoodson/Documents/GitHub && ./chatty/scripts/runZenBenchmark.sh
```

This will:
1. Run 100 prompts in 10 parallel batches
2. Generate JSON results file
3. Create HTML report
4. Display summary metrics in console

