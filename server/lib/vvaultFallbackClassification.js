export function classifyVvaultRouteFallback({
  route,
  upstreamStatus = null,
  reason = null,
  source = null,
  canonical = false,
}) {
  return {
    route,
    canonical,
    upstream_status: upstreamStatus,
    fallback_reason: reason,
    fallback_source: source,
    fallback_explicit: true,
  };
}
