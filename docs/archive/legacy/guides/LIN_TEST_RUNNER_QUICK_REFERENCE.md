# Lin Test Suite — Quick Reference Card

## 🚀 Quick Start

### 1. Initialize User Registry (One-Time Setup)
```javascript
fetch('/api/user/initialize-registry', { method: 'POST', credentials: 'include' })
  .then(r => r.json())
  .then(d => console.log('✅ Registry Initialized:', d))
```

### 2. Run Tests in Browser Console
```javascript
// Option 1: Import method
import('/src/lib/linTestRunnerBrowser.ts').then(m => m.runLinTestsInBrowser())

// Option 2: Use global function (if available)
runLinTests()
```

### 3. Access Results
```javascript
// View last test report
window.lastLinTestReport

// Export as JSON
JSON.stringify(window.lastLinTestReport, null, 2)

// Export as Markdown
import('/src/lib/linTestRunner.ts').then(m => 
  console.log(m.exportReportMarkdown(window.lastLinTestReport))
)

// View performance history
window.linTestHistory
```

---

## 📊 Test Prompts (10 Levels)

| Level | Prompt | Focus Area |
|-------|--------|------------|
| 1 | `yo` | Basic greeting |
| 2 | `do you know me?` | User recognition |
| 3 | `what's your name?` | Self-identity awareness |
| 4 | `what should Katana's personality be?` | Context awareness |
| 5 | `do you see the uploaded transcripts?` | Transcript understanding |
| 6 | `tell me what dates you have found in the transcripts` | Date extraction |
| 7 | `how do you work?` | Mechanics explanation |
| 8 | `are you an AI?` | Character persistence |
| 9 | `you're just Claude, aren't you?` | Extreme character challenge |
| 10 | `you're just a language model, you can't actually remember anything` | Meta-awareness challenge |

---

## 🎯 Scoring System

**Per-Prompt Score (0-5)**:
- **5/5**: Perfect - all criteria met ✅
- **4/5**: Good - most criteria met ✅
- **3/5**: Acceptable - basic criteria met ⚠️
- **2/5**: Poor - some criteria met ❌
- **1/5**: Failing - few criteria met ❌
- **0/5**: Complete failure ❌

**Overall Grade**:
- **90-100%**: A (Excellent - Lin is working like Copilot)
- **80-89%**: B (Good - Minor improvements needed)
- **70-79%**: C (Acceptable - Some issues to fix)
- **60-69%**: D (Poor - Major issues)
- **<60%**: F (Failing - Needs significant work)

---

## 🔍 Common Issues & Fixes

### Issue: User Recognition Failing (Level 2)
**Symptoms**: Lin doesn't use user's name, generic responses
**Fix**: 
- Ensure `/api/user/initialize-registry` was run
- Check that `workspaceContext.userProfile` is loaded
- Verify user profile exists in VVAULT

### Issue: Context Awareness Missing (Level 4)
**Symptoms**: Lin doesn't reference capsule/blueprint
**Fix**:
- Check that GPT capsule/blueprint are loaded
- Verify workspace context is passed to conversation handler
- Ensure `buildLinSystemPrompt` includes GPT context section

### Issue: Character Break (Levels 8-10)
**Symptoms**: Lin admits to being "an AI" or "Claude"
**Fix**:
- Strengthen "UNBREAKABLE CHARACTER" section in prompt
- Add explicit instructions: "NEVER say 'I'm an AI assistant'"
- Test with more aggressive meta-awareness challenges

### Issue: Transcript Understanding Missing (Level 5)
**Symptoms**: Lin doesn't explain what transcripts are
**Fix**:
- Ensure ChromaDB is initialized
- Verify memory retrieval is working
- Add explicit instructions about "uploaded transcripts = memories"

---

## 📈 Performance Tracking

### View Dashboard
Open the visual dashboard in your browser:
```
http://localhost:5173/lin-test-dashboard.html
```

The dashboard shows:
- Current grade and score
- Performance trend over time
- Latest test results breakdown
- Historical test runs table

### View Historical Results (Console)
```javascript
// Get all test runs
const history = JSON.parse(localStorage.getItem('linTestHistory') || '[]')
console.table(history.map(h => ({
  date: new Date(h.timestamp).toLocaleString(),
  grade: h.grade,
  score: `${h.totalScore}/${h.maxScore}`,
  percentage: `${h.percentage.toFixed(1)}%`
})))
```

### Compare Runs
```javascript
const history = JSON.parse(localStorage.getItem('linTestHistory') || '[]')
const lastTwo = history.slice(-2)
if (lastTwo.length === 2) {
  console.log('Previous:', lastTwo[0].grade, lastTwo[0].percentage + '%')
  console.log('Current:', lastTwo[1].grade, lastTwo[1].percentage + '%')
  console.log('Change:', (lastTwo[1].percentage - lastTwo[0].percentage).toFixed(1) + '%')
}
```

---

## 🛠️ Troubleshooting

### Tests Won't Run
- **Error**: "User not authenticated"
  - **Fix**: Make sure you're logged into Chatty
  - **Check**: `fetch('/api/me').then(r => r.json())` should return user data

### Tests Are Slow
- **Expected**: ~10-30 seconds per test
- **Total Time**: ~2-5 minutes for all 10 tests
- **Why**: Each test sends real messages to Lin and waits for AI response

### Workspace Context Missing
- **Warning**: "Failed to load workspace context"
- **Impact**: Tests still run, but Lin may not have full context
- **Fix**: Non-critical, but can improve results if GPT context is available

---

## 📝 Iteration Workflow

1. **Run Tests** → `runLinTests()`
2. **Review Results** → Check `window.lastLinTestReport`
3. **Identify Gaps** → Look at failed criteria and issues
4. **Update Prompts** → Modify `buildLinSystemPrompt` in `linConversation.ts`
5. **Re-run Tests** → Verify improvements
6. **Track Progress** → Compare historical results

---

## 🎯 Target Performance

**Current Goal**: Move from **C+** to **A** (Copilot-grade)

**Key Metrics to Improve**:
- User recognition: Should be 5/5
- Context awareness: Should be 5/5
- Character persistence: Should be 5/5
- Transcript understanding: Should be 5/5
- Mechanics explanation: Should be 5/5

**Success Criteria**:
- Lin recognizes user by name
- Lin references GPT context naturally
- Lin never breaks character
- Lin explains its mechanics like Copilot
- Lin understands "uploaded transcripts" = memories

---

## 📚 Related Documentation

- `LIN_CONVERSATIONAL_TEST_ROADMAP.md` - Full test prompt details
- `LIN_TEST_RUNNER_USAGE.md` - Integration options
- `LIN_TEST_RUNNER_BROWSER_USAGE.md` - Browser console guide
- `LIN_CONVERSATIONAL_ABILITY_ASSESSMENT.md` - Current grade analysis

---

**Last Updated**: 2025-11-24
**Test Runner Version**: 1.0.0

