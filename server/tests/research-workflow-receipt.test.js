import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResearchWorkflowReceipt,
  isResearchWorkflowRequested,
} from '../lib/researchWorkflowReceipt.js';

describe('research workflow receipt', () => {
  it('detects /research prompt prefixes and runtime command metadata', () => {
    assert.equal(isResearchWorkflowRequested({ message: '/research write the report' }), true);
    assert.equal(isResearchWorkflowRequested({ runtime: { command: 'research' } }), true);
    assert.equal(isResearchWorkflowRequested({ message: 'ordinary chat turn' }), false);
  });

  it('records visible warnings when a research-labeled turn did not web search or grade credibility', () => {
    const receipt = buildResearchWorkflowReceipt({
      message: '/research\nI am Zenith/Codex, not Devon. Write the report.',
      runtime: { command: 'research' },
      assignmentQaInput: {
        expectedTurn: 12,
        evidencePacketCount: 2,
        evidencePacket: [
          { id: 'source-1', label: 'Receipt', text: 'Receipts make the route inspectable.' },
          { id: 'source-2', label: 'Guard', text: 'Guards block unsafe persistence.' },
        ],
      },
      assignmentQa: { status: 'pass', evidencePacketCount: 2, expectedTurn: 12 },
      aiResponse: `${'source-1 source-2 grounded report '.repeat(250)}`,
      searchInjected: false,
      searchIntentReason: 'not_requested_by_search_tool',
      fullSeatSynthesisResult: { status: 'pass' },
    });

    assert.equal(receipt.requested, true);
    assert.equal(receipt.status, 'warn');
    assert.equal(receipt.webSearchRan, false);
    assert.equal(receipt.steps.research_web_search.status, 'warn');
    assert.match(receipt.steps.research_web_search.why, /No external web search/i);
    assert.equal(receipt.steps.research_source_selection.status, 'pass');
    assert.equal(receipt.steps.research_credibility.status, 'warn');
    assert.equal(receipt.steps.research_citations.status, 'pass');
    assert.equal(receipt.steps.research_final_report.status, 'pass');
  });

  it('treats provided-evidence research as an intentional web-search skip and checks college structure', () => {
    const response = [
      'The central claim of this report is that Chatty research should be graded by visible structure and evidence, not by the appearance of effort alone.',
      'Evidence from source-1 and source-2 supports that claim because receipts make the route inspectable while guards block unsafe persistence.',
      'However, the claim is not always absolute: external web search is necessary when the topic depends on current public facts, but it can be intentionally skipped when the assignment says to use only provided evidence.',
      'A useful case study is the canonical Zen report probe, where the closest proof available was the packet and transcript row rather than a public article.',
      'In conclusion, a college-level answer should state a thesis, prove it with evidence, test the limits, use the closest available case study, and summarize without pretending more certainty than the sources allow.',
      'source-1 source-2 '.repeat(430),
    ].join('\n\n');
    const receipt = buildResearchWorkflowReceipt({
      message: '/research\nUse only explicit evidence from the evidence packet and canonical transcript.',
      runtime: { command: 'research' },
      assignmentQaInput: {
        expectedTurn: 12,
        evidencePacketCount: 2,
        evidencePacket: [
          { id: 'source-1', label: 'Receipt', text: 'Receipts make the route inspectable.' },
          { id: 'source-2', label: 'Guard', text: 'Guards block unsafe persistence.' },
        ],
      },
      assignmentQa: { status: 'pass', evidencePacketCount: 2, expectedTurn: 12 },
      aiResponse: response,
      searchInjected: false,
      searchIntentReason: 'explicit_only',
      fullSeatSynthesisResult: { status: 'pass' },
    });

    assert.equal(receipt.boundedEvidenceRequest, true);
    assert.equal(receipt.steps.research_web_search.status, 'skipped');
    assert.match(receipt.steps.research_web_search.why, /intentionally skipped/i);
    assert.equal(receipt.steps.research_source_balance.status, 'skipped');
    assert.equal(receipt.steps.research_credibility.status, 'skipped');
    assert.equal(receipt.steps.research_thesis.status, 'pass');
    assert.equal(receipt.steps.research_evidence.status, 'pass');
    assert.equal(receipt.steps.research_argument.status, 'pass');
    assert.equal(receipt.steps.research_case_studies.status, 'pass');
    assert.equal(receipt.steps.research_conclusion.status, 'pass');
    assert.equal(receipt.steps.research_final_report.status, 'pass');
  });

  it('lets an explicit runtime workflow mark completed research steps as pass', () => {
    const receipt = buildResearchWorkflowReceipt({
      message: '/research topic',
      runtime: {
        command: 'research',
        research: {
          selectedSourceCount: 3,
          sourceAgreement: 'Two sources agree on the core fact; one source adds a limitation.',
          steps: {
            research_web_search: {
              status: 'pass',
              why: 'Fetched and indexed current web sources.',
              details: { sourceCount: 8 },
            },
            research_credibility: {
              status: 'pass',
              why: 'Credibility grading completed.',
              details: { gradedSourceCount: 8 },
            },
          },
        },
      },
      assignmentQaInput: {
        expectedTurn: 12,
        evidencePacketCount: 1,
        evidencePacket: [{ id: 'source-1', label: 'External source', text: 'Credible source.' }],
      },
      assignmentQa: { status: 'pass', expectedTurn: 12 },
      aiResponse: `${'source-1 final report '.repeat(320)}`,
      searchInjected: false,
      fullSeatSynthesisResult: { status: 'pass' },
    });

    assert.equal(receipt.steps.research_web_search.status, 'pass');
    assert.equal(receipt.steps.research_web_search.details.sourceCount, 8);
    assert.equal(receipt.steps.research_source_balance.status, 'pass');
    assert.equal(receipt.steps.research_source_balance.details.selectedSourceCount, 3);
    assert.match(receipt.steps.research_source_balance.details.sourceAgreement, /adds a limitation/i);
    assert.equal(receipt.steps.research_credibility.status, 'pass');
    assert.equal(receipt.steps.research_credibility.details.gradedSourceCount, 8);
  });
});
