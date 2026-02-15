import { onFCP, onLCP, onTTFB, onINP, type Metric } from 'web-vitals';

interface PerfEntry {
  name: string;
  value: number;
  rating: string;
  ts: number;
}

const entries: PerfEntry[] = [];

function record(metric: Metric) {
  entries.push({
    name: metric.name,
    value: Math.round(metric.value),
    rating: metric.rating,
    ts: Date.now(),
  });
  if (import.meta.env.DEV || localStorage.getItem('PERF_DEBUG') === '1') {
    console.log(`[perf] ${metric.name}: ${Math.round(metric.value)}ms (${metric.rating})`);
  }
}

export function initPerfMetrics() {
  onFCP(record);
  onLCP(record);
  onTTFB(record);
  onINP(record);
}

export function getPerfEntries(): PerfEntry[] {
  return [...entries];
}

export function measureAsync(label: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  return fn().then(() => {
    const dur = Math.round(performance.now() - start);
    entries.push({ name: label, value: dur, rating: dur < 200 ? 'good' : dur < 500 ? 'needs-improvement' : 'poor', ts: Date.now() });
    if (import.meta.env.DEV || localStorage.getItem('PERF_DEBUG') === '1') {
      console.log(`[perf] ${label}: ${dur}ms`);
    }
  });
}
