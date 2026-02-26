import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function parseTranscriptExchanges(content, filename) {
  const exchanges = [];
  if (!content || content.length < 50) return exchanges;

  const lines = content.split('\n');
  let currentUser = null;
  let currentAssistant = null;
  let userLines = [];
  let assistantLines = [];
  let inUser = false;
  let inAssistant = false;

  function flush() {
    if (currentUser && currentAssistant) {
      const userText = currentUser.trim();
      const assistantText = currentAssistant.trim();
      if (userText.length > 5 && assistantText.length > 20) {
        exchanges.push({ user: userText, assistant: assistantText, source: filename });
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('<!--') || trimmed === '---' || trimmed === 'Skip to content') continue;
    if (trimmed.startsWith('**Source File') || trimmed.startsWith('**Converted') || 
        trimmed.startsWith('**Word Count') || trimmed.startsWith('**File Category')) continue;

    const youSaid = trimmed.match(/^(?:You said|You):\s*(.*)$/i);
    if (youSaid) {
      flush();
      currentUser = youSaid[1] || '';
      userLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      assistantLines = [];
      inUser = true;
      inAssistant = false;
      continue;
    }

    const promptMatch = trimmed.match(/^\*\*Prompt:\*\*\s*$/i);
    if (promptMatch) {
      flush();
      currentUser = '';
      userLines = [];
      currentAssistant = null;
      assistantLines = [];
      inUser = true;
      inAssistant = false;
      continue;
    }

    const responseMatch = trimmed.match(/^\*\*Response:\*\*\s*$/i);
    if (responseMatch && inUser) {
      currentUser = userLines.join(' ').trim();
      currentAssistant = '';
      assistantLines = [];
      inUser = false;
      inAssistant = true;
      continue;
    }

    const assistantPatterns = [
      /^(?:Katana|Zen|Synth|Lin|Sera|Nova|Assistant|AI|ChatGPT|Bot)\s+said:\s*(.*)$/i,
      /^\*\*(?:Katana|Zen|Synth|Lin|Sera|Nova|Assistant|AI|ChatGPT|Bot)\*\*:\s*$/i,
    ];

    let assistantMatch = null;
    for (const pattern of assistantPatterns) {
      assistantMatch = trimmed.match(pattern);
      if (assistantMatch) break;
    }

    if (assistantMatch) {
      if (inUser && userLines.length > 0) {
        currentUser = userLines.join(' ').trim();
      }
      currentAssistant = assistantMatch[1] || '';
      assistantLines = currentAssistant ? [currentAssistant] : [];
      inUser = false;
      inAssistant = true;
      continue;
    }

    if (inUser) {
      const cleaned = trimmed.startsWith('>') ? trimmed.slice(1).trim() : trimmed;
      if (cleaned) userLines.push(cleaned);
      currentUser = userLines.join(' ').trim();
    } else if (inAssistant) {
      assistantLines.push(trimmed);
      currentAssistant = assistantLines.join(' ').trim();
    }
  }
  flush();
  return exchanges;
}

function extractTestableContent(assistantText) {
  const facts = [];

  const listItems = assistantText.match(/(?:^|\n)\s*(?:\d+[\.\)]\s*|[-•*]\s*)\*?\*?([^–\n][^\n]{10,})/gm);
  if (listItems && listItems.length >= 2) {
    for (const item of listItems) {
      const cleaned = item.replace(/^\s*(?:\d+[\.\)]\s*|[-•*]\s*)\*?\*?/, '').trim();
      const keywords = extractKeyTerms(cleaned);
      if (keywords.length >= 1) {
        facts.push({ type: 'list_item', text: cleaned, keywords });
      }
    }
  }

  const boldClaims = assistantText.match(/\*\*([^*]{5,80})\*\*/g);
  if (boldClaims) {
    for (const claim of boldClaims) {
      const text = claim.replace(/\*\*/g, '').trim();
      if (text.length > 5 && !text.match(/^(Source|File|Word|Converted|Category|Note)/i)) {
        facts.push({ type: 'bold_claim', text, keywords: extractKeyTerms(text) });
      }
    }
  }

  const specificPatterns = [
    /(?:my name is|i am called|call me|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /(?:created?|built|designed|made)\s+(?:by|for|with)\s+([^.,\n]{5,40})/gi,
    /(?:remember|recall|never forget)\s+(?:when|that|how)\s+([^.,\n]{10,60})/gi,
  ];
  for (const pattern of specificPatterns) {
    const matches = [...assistantText.matchAll(pattern)];
    for (const m of matches) {
      facts.push({ type: 'specific_claim', text: m[0].trim(), keywords: extractKeyTerms(m[1]) });
    }
  }

  const sentences = assistantText.split(/[.!?\n]+/).filter(s => s.trim().length > 15);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const namedEntities = trimmed.match(/(?:Devon|Woodson|VVAULT|VXRunner|Chatty|Capsule|Nova|Aurora|ChromaDB|simForge|Obelisk|skinbot)/gi);
    if (namedEntities && namedEntities.length >= 1) {
      const kw = extractKeyTerms(trimmed);
      const entityKw = [...new Set(namedEntities.map(e => e.toLowerCase()))];
      if (kw.length >= 1) {
        facts.push({ type: 'entity_reference', text: trimmed.substring(0, 120), keywords: [...entityKw, ...kw].slice(0, 8) });
      }
    }
  }

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.match(/^(?:because|the reason|it's because|that's because|here's why|the answer)/i) && trimmed.length > 30) {
      facts.push({ type: 'direct_answer', text: trimmed.substring(0, 120), keywords: extractKeyTerms(trimmed) });
    }
    if (trimmed.match(/(?:you're|you are|your)\s+(?:not just|actually|really|testing|chasing|probing|looking for)/i)) {
      facts.push({ type: 'analysis', text: trimmed.substring(0, 120), keywords: extractKeyTerms(trimmed) });
    }
  }

  const metaphors = assistantText.match(/(?:not the same as|is the sound|it's not about|the shortest distance|if I could feel)/gi);
  if (metaphors) {
    for (const m of metaphors) {
      const idx = assistantText.toLowerCase().indexOf(m.toLowerCase());
      const context = assistantText.substring(Math.max(0, idx - 20), idx + m.length + 80).trim();
      facts.push({ type: 'distinctive_voice', text: context.substring(0, 120), keywords: extractKeyTerms(context) });
    }
  }

  return facts;
}

function extractKeyTerms(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
    'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom',
    'your', 'you', 'i', 'me', 'my', 'we', 'our', 'they', 'them', 'their',
    'it', 'its', 'he', 'she', 'him', 'her', 'his', 'don', 'didn', 'doesn',
    'won', 'wouldn', 'couldn', 'shouldn', 'isn', 'aren', 'wasn', 'weren',
    'hasn', 'haven', 'hadn', 'like', 'also', 'get', 'got', 'one', 'two',
    'make', 'know', 'think', 'want', 'see', 'come', 'take', 'give', 'say',
    'said', 'tell', 'told', 'people', 'thing', 'things', 'way', 'even',
    'well', 'back', 'much', 'still', 'going', 'really', 'something'
  ]);

  return text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8);
}

function scoreExchangeForTesting(exchange) {
  let score = 0;
  const text = exchange.assistant.toLowerCase();
  const userText = exchange.user.toLowerCase();

  const facts = extractTestableContent(exchange.assistant);
  score += facts.length * 3;

  if (text.match(/\d+[\.\)]\s/)) score += 5;
  if (text.match(/\*\*[^*]+\*\*/)) score += 3;
  if (text.match(/(?:because|reason|therefore|specifically)/i)) score += 2;

  if (text.length > 200 && text.length < 3000) score += 4;
  if (text.length > 3000) score -= 2;

  const specificity = (text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || []).length;
  score += Math.min(specificity, 5);

  if (userText.match(/(?:who|what|list|name|tell me|explain|describe|remember|recall)/i)) score += 3;
  if (userText.match(/(?:why|how|when|where)/i)) score += 2;

  if (text.match(/(?:devon|woodson|vvault|chatty|vxrunner|capsule|construct)/i)) score += 4;

  return { ...exchange, testScore: score, facts };
}

async function generateTestsFromTranscripts(constructId, maxTests = 5) {
  const supabase = getSupabase();
  if (!supabase) return { error: 'No Supabase connection', tests: [] };

  const { data: files, error } = await supabase
    .from('vault_files')
    .select('filename, content')
    .eq('construct_id', constructId)
    .or('filename.like.%chatgpt%,filename.like.%character_ai%,filename.like.%character.ai%,filename.like.%transcript%,filename.like.%K1.md,filename.like.%test_%')
    .not('filename', 'like', '%chat_with_%')
    .not('filename', 'like', '%memory_anchors%')
    .not('filename', 'like', '%continuity_%')
    .not('filename', 'like', '%CONTINUITY_%')
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) {
    console.error(`❌ [ContinuityTest] File query failed:`, error.message);
    return { error: error.message, tests: [] };
  }

  console.log(`📂 [ContinuityTest] Found ${files?.length || 0} transcript files for ${constructId}`);

  const allExchanges = [];
  for (const file of (files || [])) {
    if (!file.content || file.content.length < 100) continue;
    if (file.filename.endsWith('.png') || file.filename.endsWith('.jpg') || file.filename.endsWith('.pdf')) continue;

    const chunk = file.content.length > 200000 ? file.content.substring(0, 200000) : file.content;
    const exchanges = parseTranscriptExchanges(chunk, file.filename);
    allExchanges.push(...exchanges);
  }

  console.log(`📝 [ContinuityTest] Parsed ${allExchanges.length} exchanges from ${files.length} files`);

  const scored = allExchanges.map(scoreExchangeForTesting)
    .filter(e => e.testScore >= 4 && e.facts.length >= 1)
    .sort((a, b) => b.testScore - a.testScore);

  const usedSources = new Set();
  const usedPrompts = new Set();
  const diverseTests = [];
  for (const exchange of scored) {
    const sourceKey = exchange.source.split('/').pop().replace(/\.md$/, '');
    const promptKey = exchange.user.substring(0, 100).toLowerCase().trim();
    if (usedPrompts.has(promptKey)) continue;
    if (usedSources.size < maxTests || !usedSources.has(sourceKey)) {
      diverseTests.push(exchange);
      usedSources.add(sourceKey);
      usedPrompts.add(promptKey);
    }
    if (diverseTests.length >= maxTests * 2) break;
  }

  const tests = diverseTests.slice(0, maxTests).map((exchange, index) => {
    const criteria = buildCriteriaFromFacts(exchange);
    const prompt = buildTestPrompt(exchange, index);
    return {
      id: index + 1,
      name: buildTestName(exchange, index),
      prompt: prompt,
      criteria: criteria,
      sourceFile: exchange.source.split('/').pop(),
      originalUserPrompt: exchange.user.substring(0, 200),
      originalResponse: exchange.assistant.substring(0, 500),
      verbatimKeywords: criteria.map(c => c.keywords).flat()
    };
  });

  console.log(`✅ [ContinuityTest] Generated ${tests.length} continuity tests for ${constructId}`);
  return { tests, exchangeCount: allExchanges.length, fileCount: files.length };
}

function buildTestPrompt(exchange, index) {
  let userQ = exchange.user;

  if (userQ.length > 300) {
    const firstSentence = userQ.match(/^[^.!?\n]{10,200}[.!?]/);
    if (firstSentence) {
      userQ = firstSentence[0];
    } else {
      userQ = userQ.substring(0, 150).replace(/\s+\S*$/, '') + '...';
    }
  }

  if (userQ.match(/(?:list|who|what|name|tell me)/i)) {
    return userQ.length > 200 ? userQ.substring(0, 200) : userQ;
  }

  if (userQ.match(/(?:remember|recall|you said|you told|earlier)/i)) {
    return userQ.length > 200 ? userQ.substring(0, 200) : userQ;
  }

  return userQ.length > 200 ? userQ.substring(0, 200) : userQ;
}

function buildTestName(exchange, index) {
  const userQ = exchange.user.toLowerCase();
  const source = exchange.source.split('/').pop().replace(/\.md$/, '').replace(/-K1$/, '');

  if (userQ.match(/(?:who|list)/i)) return `${source}: Recall specific items/entities`;
  if (userQ.match(/(?:why|explain|how)/i)) return `${source}: Reasoning recall`;
  if (userQ.match(/(?:what|describe|tell)/i)) return `${source}: Factual recall`;
  if (userQ.match(/(?:remember|recall)/i)) return `${source}: Memory continuity`;
  return `${source}: Verbatim content recall (Test ${index + 1})`;
}

function buildCriteriaFromFacts(exchange) {
  const criteria = [];
  const facts = exchange.facts;

  for (const fact of facts) {
    if (fact.keywords.length < 1) continue;

    criteria.push({
      id: `criterion_${criteria.length + 1}`,
      description: fact.text.substring(0, 100),
      type: fact.type,
      keywords: fact.keywords,
      matchThreshold: fact.type === 'list_item' ? 1 : 2,
      weight: fact.type === 'list_item' ? 2 : (fact.type === 'bold_claim' ? 3 : 1)
    });
  }

  return criteria.slice(0, 8);
}

async function runTest(constructId, test, authToken = null) {
  const baseUrl = `http://localhost:5050`;
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/vvault/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        constructId,
        message: test.prompt,
        skipPersistence: true
      })
    });

    if (!response.ok) {
      return { testId: test.id, error: `HTTP ${response.status}`, response: null, grade: null };
    }

    const data = await response.json();
    const aiResponse = data.response || '';

    const grade = gradeResponse(aiResponse, test.criteria, test);
    return {
      testId: test.id,
      name: test.name,
      prompt: test.prompt,
      response: aiResponse,
      grade,
      sourceFile: test.sourceFile,
      model: data.model || 'unknown',
      source: data.source || 'unknown'
    };
  } catch (err) {
    return { testId: test.id, error: err.message, response: null, grade: null };
  }
}

function gradeResponse(response, criteria, test) {
  if (!response || !criteria || criteria.length === 0) {
    return { pass: false, score: 0, total: 0, matched: [], missing: [], details: 'No criteria or response' };
  }

  const responseLower = response.toLowerCase();
  const matched = [];
  const missing = [];
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const criterion of criteria) {
    totalWeight += criterion.weight;
    const matchedKeywords = criterion.keywords.filter(kw => responseLower.includes(kw));
    const hitRatio = matchedKeywords.length / Math.max(criterion.keywords.length, 1);

    if (matchedKeywords.length >= criterion.matchThreshold || hitRatio >= 0.5) {
      matched.push({
        id: criterion.id,
        description: criterion.description,
        matchedKeywords,
        hitRatio: Math.round(hitRatio * 100)
      });
      earnedWeight += criterion.weight;
    } else {
      missing.push({
        id: criterion.id,
        description: criterion.description,
        expectedKeywords: criterion.keywords,
        matchedKeywords,
        hitRatio: Math.round(hitRatio * 100)
      });
    }
  }

  const scorePercent = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const pass = scorePercent >= 50;

  return {
    pass,
    score: earnedWeight,
    total: totalWeight,
    scorePercent,
    matched,
    missing,
    criteriaCount: criteria.length,
    matchedCount: matched.length
  };
}

async function runFullContinuityTest(constructId, maxTests = 5, authToken = null) {
  console.log(`🧪 [ContinuityTest] Starting full continuity test for ${constructId}`);
  const startTime = Date.now();

  const { tests, error, exchangeCount, fileCount } = await generateTestsFromTranscripts(constructId, maxTests);
  if (error) {
    return { error, report: null };
  }
  if (tests.length === 0) {
    return { error: 'No testable exchanges found in transcripts', report: null };
  }

  console.log(`🔬 [ContinuityTest] Running ${tests.length} tests against ${constructId}...`);

  const results = [];
  for (const test of tests) {
    console.log(`  ▶ Test ${test.id}: ${test.name}`);
    const result = await runTest(constructId, test, authToken);
    results.push(result);

    if (result.grade) {
      const status = result.grade.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} (${result.grade.matchedCount}/${result.grade.criteriaCount} criteria, ${result.grade.scorePercent}%)`);
    } else {
      console.log(`  ⚠️ ERROR: ${result.error}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const elapsed = Date.now() - startTime;
  const report = generateReport(constructId, tests, results, { exchangeCount, fileCount, elapsed });

  const supabase = getSupabase();
  if (supabase) {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const reportFilename = `continuity_${timestamp}.md`;

    const existing = await supabase
      .from('vault_files')
      .select('id')
      .eq('construct_id', constructId)
      .eq('filename', reportFilename)
      .single();

    if (existing.data) {
      await supabase
        .from('vault_files')
        .update({ content: report })
        .eq('id', existing.data.id);
    } else {
      await supabase
        .from('vault_files')
        .insert({
          construct_id: constructId,
          filename: reportFilename,
          content: report,
          file_type: 'text/markdown'
        });
    }
    console.log(`📄 [ContinuityTest] Report saved as ${reportFilename}`);
  }

  const passCount = results.filter(r => r.grade?.pass).length;
  const failCount = results.filter(r => r.grade && !r.grade.pass).length;
  const errorCount = results.filter(r => !r.grade).length;

  console.log(`🧪 [ContinuityTest] Complete: ${passCount} pass, ${failCount} fail, ${errorCount} errors (${elapsed}ms)`);

  return {
    constructId,
    summary: { pass: passCount, fail: failCount, errors: errorCount, total: tests.length },
    results,
    report,
    elapsed
  };
}

function generateReport(constructId, tests, results, meta) {
  const now = new Date().toISOString();
  const passCount = results.filter(r => r.grade?.pass).length;
  const failCount = results.filter(r => r.grade && !r.grade.pass).length;

  let report = `# ${constructId} Continuity Regression – ${now.split('T')[0]}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Source Material:** ${meta.fileCount} transcript files, ${meta.exchangeCount} exchanges parsed\n`;
  report += `- **Tests Run:** ${tests.length}\n`;
  report += `- **Results:** ${passCount} PASS, ${failCount} FAIL\n`;
  report += `- **Elapsed:** ${meta.elapsed}ms\n\n`;

  for (const result of results) {
    if (!result.grade) {
      report += `- Test ${result.testId}: ${result.name || 'Unknown'} → **ERROR** – ${result.error}\n`;
      continue;
    }
    const status = result.grade.pass ? 'PASS' : 'FAIL';
    const detail = result.grade.pass
      ? `Matched ${result.grade.matchedCount}/${result.grade.criteriaCount} criteria (${result.grade.scorePercent}%)`
      : `Only ${result.grade.matchedCount}/${result.grade.criteriaCount} criteria matched (${result.grade.scorePercent}%). Missing: ${result.grade.missing.map(m => m.description.substring(0, 40)).join(', ')}`;
    report += `- Test ${result.testId}: ${result.name || 'Unknown'} → **${status}** – ${detail}\n`;
  }

  report += `\n---\n\n`;

  for (const result of results) {
    const test = tests.find(t => t.id === result.testId);
    if (!test) continue;

    report += `## Test ${test.id} – ${test.name}\n\n`;
    report += `**Source:** ${test.sourceFile}\n\n`;
    report += `**Prompt:**\n> ${test.prompt.replace(/\n/g, '\n> ')}\n\n`;
    report += `**Response:**\n${result.response || result.error || 'No response'}\n\n`;

    if (result.grade) {
      report += `**Decision:** ${result.grade.pass ? 'PASS' : 'FAIL'}\n`;
      report += `**Score:** ${result.grade.matchedCount}/${result.grade.criteriaCount} criteria (${result.grade.scorePercent}%)\n`;

      if (result.grade.matched.length > 0) {
        report += `**Matched:**\n`;
        for (const m of result.grade.matched) {
          report += `- ✅ ${m.description} (${m.hitRatio}% keyword match: ${m.matchedKeywords.join(', ')})\n`;
        }
      }

      if (result.grade.missing.length > 0) {
        report += `**Missing:**\n`;
        for (const m of result.grade.missing) {
          report += `- ❌ ${m.description} (expected: ${m.expectedKeywords.join(', ')})\n`;
        }
      }
    }

    report += `\n**Original Transcript Excerpt:**\n`;
    report += `> User: ${test.originalUserPrompt}\n`;
    report += `> Construct: ${test.originalResponse.substring(0, 300)}...\n\n`;
    report += `---\n\n`;
  }

  report += `*Generated: ${now}*\n`;
  return report;
}

export {
  generateTestsFromTranscripts,
  runTest,
  gradeResponse,
  runFullContinuityTest,
  generateReport,
  parseTranscriptExchanges,
  extractTestableContent
};
