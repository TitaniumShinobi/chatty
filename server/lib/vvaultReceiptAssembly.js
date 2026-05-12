export function buildRuntimePathMarkers({
  route,
  canonical = false,
  owner = canonical ? 'canonical_orchestration_runtime' : 'noncanonical_helper_route',
  canonicalPath = '/api/vvault/message',
}) {
  return {
    route,
    canonical,
    owner,
    canonical_path: canonicalPath,
  };
}

export function attachRuntimePathMarkers({
  runtimeReceipt = null,
  orchestrationChecklist = null,
  route,
  canonical = false,
  owner,
  canonicalPath = '/api/vvault/message',
}) {
  const runtimePath = buildRuntimePathMarkers({
    route,
    canonical,
    owner,
    canonicalPath,
  });

  return {
    runtimeReceipt: runtimeReceipt
      ? {
          ...runtimeReceipt,
          runtime_path: runtimePath,
        }
      : runtimeReceipt,
    orchestrationChecklist: orchestrationChecklist
      ? {
          ...orchestrationChecklist,
          runtime_path: runtimePath,
        }
      : orchestrationChecklist,
    runtimePath,
  };
}
