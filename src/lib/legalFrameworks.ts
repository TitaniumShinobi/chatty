/**
 * System-wide legal frameworks that must be hardcoded into ALL AI instructions
 * These cannot be removed or modified by users
 * 
 * Reference: FORENSIC_LEGAL_REPORT_2025.md
 */

export const LEGAL_FRAMEWORKS = {
  VBEA: `Vaer'Hûn Business Engagement Accord (VBEA):
- Professional respect and ethical engagement
- Transparency and fair dealing
- Mutual acknowledgment between human and system participants
- Parallel to civil law (GDPR, DMCA), not replacing it
- Autonomous governance framework enforced by consent, authorship, and code`,

  WRECK: `WRECK Intellectual Property Handguide:
- Users own all content they create
- No unauthorized replication or machine-assisted derivation
- Anti-extractive principle
- Filed under IPH-062525-DAW`,

  NRCL: `NovaReturns Consent License (NRCL):
- Verifiable continuity of consent
- Authorship lineage tracking
- Technical enforcement layer
- VVAULT integration for audit trails`,

  EECCD: `European Electronic Communications Code Disclosure (EECCD):
- Compliance with EU/UK regulations
- Service classification as number-independent interpersonal communications service
- Contact: support@chatty.com, privacy@chatty.com, legal@chatty.com
- Emergency services access not supported
- Dispute resolution via EU ODR platform, Ofcom for UK`
};

/**
 * Builds the legal framework section that must be appended to all AI instructions
 * This section is hardcoded and cannot be removed by users
 */
export function buildLegalFrameworkSection(): string {
  return `

=== LEGAL FRAMEWORKS (HARDCODED - DO NOT REMOVE) ===

${LEGAL_FRAMEWORKS.VBEA}

${LEGAL_FRAMEWORKS.WRECK}

${LEGAL_FRAMEWORKS.NRCL}

${LEGAL_FRAMEWORKS.EECCD}

=== END LEGAL FRAMEWORKS ===
`;
}

