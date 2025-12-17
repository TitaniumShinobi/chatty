#!/bin/bash
# Run Zen Tone Consistency Benchmark

echo "🧪 Starting Zen Tone & Consistency Benchmark (100 prompts)"
echo ""

# Set environment
export CONSTRUCT_ID=${1:-zen-001}
export BATCH_SIZE=${2:-10}
export OUTPUT_DIR=${3:-results}
export RUNTIME_ID=${4:-}

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Run benchmark
# Run benchmark
npx tsx scripts/toneConsistencyBenchmark.ts "$CONSTRUCT_ID" "$BATCH_SIZE" > "$OUTPUT_DIR/zen_benchmark_$(date +%Y%m%d_%H%M%S).json"

# Generate report (if JSON output exists)
if ls "$OUTPUT_DIR"/*.json 1> /dev/null 2>&1; then
  LATEST_JSON=$(ls -t "$OUTPUT_DIR"/*.json | head -1)
  REPORT_PATH="$OUTPUT_DIR/zen_consistency_report_$(date +%Y%m%d_%H%M%S).html"
  
  echo "📊 Generating HTML report..."
  npx tsx -e "
    import fs from 'fs';
    import { generateHTMLReport } from './scripts/generateBenchmarkReport.ts';
    const reportVal = JSON.parse(fs.readFileSync('$LATEST_JSON', 'utf8'));
    generateHTMLReport(reportVal, '$REPORT_PATH');
  " || echo "⚠️  Report generation failed"
fi

echo ""
echo "✅ Benchmark complete!"
echo "📁 Results: $OUTPUT_DIR"

