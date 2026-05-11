import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const routeSource = await fs.readFile(
  new URL("../routes/vvault.js", import.meta.url),
  "utf8",
);
const aiServiceSource = await fs.readFile(
  new URL("../../src/lib/aiService.ts", import.meta.url),
  "utf8",
);

function extractVvaultAppendRoute() {
  const start = routeSource.indexOf('router.post("/conversations/:sessionId/messages"');
  assert.notEqual(start, -1, "VVAULT append route was not found");
  const nextRoute = routeSource.indexOf('\nrouter.post("/construct/:constructId/ledger/generate"', start);
  assert.notEqual(nextRoute, -1, "VVAULT append route end marker was not found");
  return routeSource.slice(start, nextRoute);
}

describe("VVAULT chat route auth contract", () => {
  it("keeps active transcript hydration available under preferred auth without forcing a shared-auth Supabase gate", () => {
    const routeMatch = routeSource.match(
      /router\.get\(["']\/chat\/:sessionId["'],\s*([A-Za-z0-9_]+)/,
    );

    assert.equal(routeMatch?.[1], "requirePreferredAuth");
    assert.match(
      routeSource,
      /router\.get\(["']\/chat\/:sessionId["'],[\s\S]*?resolveRequestUserForVvault\(res,\s*req\)/,
    );
  });

  it("keeps conversation index hydration available under preferred auth without forcing a shared-auth Supabase gate", () => {
    const routeMatch = routeSource.match(
      /router\.get\(["']\/conversations\/index["'],\s*([A-Za-z0-9_]+)/,
    );

    assert.equal(routeMatch?.[1], "requirePreferredAuth");
    assert.match(
      routeSource,
      /router\.get\(["']\/conversations\/index["'],[\s\S]*?resolveRequestUserForVvault\(res,\s*req\)/,
    );
  });

  it("keeps the conversation index no-candidate branch as a degraded hydration response instead of a 401", () => {
    assert.match(
      routeSource,
      /if \(lookupCandidates\.length === 0\) \{[\s\S]*?res\.json\(\{[\s\S]*?buildConversationIndexHydrationPayload\(/,
    );
  });

  it("forces canonical Zen chat and transcript routes into strict VVAULT-only resolution", () => {
    assert.match(routeSource, /function isCanonicalZenSession\(sessionId\)/);
    assert.match(routeSource, /const strictVvaultOnly = isCanonicalZenSession\(sessionId\)/);
    assert.match(routeSource, /allowDegradedFallback: strictVvaultOnly \? false : true/);
    assert.match(routeSource, /vvaultOnly: strictVvaultOnly/);
    assert.match(routeSource, /readLocalDeferredConversations: strictVvaultOnly \? null : readLocalDeferredConversations/);
    assert.match(routeSource, /readConversationIndexFromSupabase: strictVvaultOnly \? null : readConversationIndexFromSupabase/);
  });

  it("clears both conversation read caches after canonical transcript writes", () => {
    assert.match(routeSource, /function clearConversationReadCaches\(\) \{[\s\S]*?indexCache\.clear\(\);[\s\S]*?summaryCache\.clear\(\);[\s\S]*?\}/);
    assert.match(routeSource, /clearConversationReadCaches\(\);[\s\S]*?const canonicalReadbackRows = await readConversations\(/);
    assert.match(routeSource, /allowLocalFallback: false/);
    assert.match(routeSource, /stripChattyMetadataComment\(readbackAssistantTail\.content\)/);
    assert.match(routeSource, /TRANSCRIPT_READBACK_MISMATCH/);
  });

  it("keeps browser transcript append as a verified VVAULT-body role-only write", () => {
    const appendRoute = extractVvaultAppendRoute();

    assert.match(appendRoute, /normalizeAppendRole\(role\)/);
    assert.match(appendRoute, /performTranscriptWriteWithRecovery\(/);
    assert.match(appendRoute, /requireVvaultBodySuccess:\s*true/);
    assert.match(appendRoute, /allowLocalFallback:\s*false/);
    assert.match(appendRoute, /clearConversationReadCaches\(\)/);
    assert.match(appendRoute, /findAppendMessageMatches\(/);
    assert.match(appendRoute, /readbackMatches\.length !== 1/);
    assert.match(appendRoute, /buildAppendPersistenceReceipt\(/);
    assert.doesNotMatch(appendRoute, /getGPTRuntimeBridge/);
    assert.doesNotMatch(appendRoute, /processMessage\(/);
    assert.doesNotMatch(appendRoute, /handleConstructInference/);
  });

  it("keeps active UI inference requests on skipPersistence true", () => {
    const vvaultMessagePayloads = [...aiServiceSource.matchAll(/fetchWithDevAuthRetry\(\s*'\/api\/vvault\/message'[\s\S]*?body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/g)];

    assert.equal(vvaultMessagePayloads.length, 2);
    for (const [, payload] of vvaultMessagePayloads) {
      assert.match(payload, /skipPersistence:\s*true/);
    }
  });
});
