export async function resolveVvaultConstructContext({
  req,
  constructId,
  threadId,
  sessionId,
  transcriptPath,
  projectName,
  userId,
  dataOwnerUserId,
  dataOwnerSource,
  authReceipt,
  resolveCanonicalConstructDataOwner,
  applyCanonicalOwnerResolution,
  resolveCanonicalRouteUserEmail,
}) {
  const canonicalOwnerResolution = resolveCanonicalConstructDataOwner({
    constructId,
    threadId,
    sessionId,
    transcriptPath,
    projectName,
    requestedDataOwnerUserId: dataOwnerUserId,
    requestedDataOwnerSource: dataOwnerSource,
    authenticatedUserId: userId,
  });
  const ownerResolution = applyCanonicalOwnerResolution({
    canonicalOwnerResolution,
    authReceipt,
    dataOwnerUserId,
    dataOwnerSource,
    userId,
  });

  const nextAuthReceipt = { ...ownerResolution.authReceipt };
  const effectiveRequestUserEmail = await resolveCanonicalRouteUserEmail({
    req,
    authenticatedUserId: userId,
    dataOwnerUserId: ownerResolution.dataOwnerUserId,
    preferredEmail: canonicalOwnerResolution.receipt?.canonicalOwnerEmail || null,
    ignoreRequestEmail: canonicalOwnerResolution.applied === true,
  });

  return {
    canonicalOwnerResolution,
    ownerResolution,
    dataOwnerUserId: ownerResolution.dataOwnerUserId,
    dataOwnerSource: ownerResolution.dataOwnerSource,
    authReceipt: nextAuthReceipt,
    effectiveRequestUserEmail,
  };
}
