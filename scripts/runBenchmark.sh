#!/bin/bash
# Run Tone Consistency Benchmark

CONSTRUCT_ID=${1:-zen-001}
BATCH_SIZE=${2:-10}
OUTPUT_DIR=${3:-results}
RUNTIME_ID=${4:-} # Optional: Attach runtime

echo "🧪 Starting Tone & Consistency Benchmark for $CONSTRUCT_ID"
echo "   Batch Size: $BATCH_SIZE"
if [ -n "$RUNTIME_ID" ]; then
    echo "   Runtime ID: $RUNTIME_ID"
fi
echo ""

mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_JSON="$OUTPUT_DIR/${CONSTRUCT_ID}_benchmark_${TIMESTAMP}.json"
REPORT_HTML="$OUTPUT_DIR/${CONSTRUCT_ID}_consistency_report_${TIMESTAMP}.html"

# Run benchmark
if [ -n "$RUNTIME_ID" ]; then
    npx tsx scripts/toneConsistencyBenchmark.ts "$CONSTRUCT_ID" "$BATCH_SIZE" "$RUNTIME_ID" > "$OUTPUT_JSON"
else
    npx tsx scripts/toneConsistencyBenchmark.ts "$CONSTRUCT_ID" "$BATCH_SIZE" > "$OUTPUT_JSON"
fi

# Check if JSON was created (and is not empty/error)
if [ -s "$OUTPUT_JSON" ]; then
  echo "📊 Generating HTML report..."
  npx tsx -e "
    import fs from 'fs';
    import { generateHTMLReport } from './scripts/generateBenchmarkReport.ts';
    try {
        const reportVal = JSON.parse(fs.readFileSync('$OUTPUT_JSON', 'utf8'));
        generateHTMLReport(reportVal, '$REPORT_HTML');
        console.log('Report generated at: $REPORT_HTML');
    } catch (e) {
        console.error('Failed to parse JSON result:', e);
        process.exit(1);
    }
  " || echo "⚠️  Report generation failed"
else
  echo "⚠️  Benchmark failed to produce output."
  cat "$OUTPUT_JSON" # Show what might have been output (error message?)
fi

echo ""
echo "✅ Benchmark run complete!"
echo "📁 Results: $OUTPUT_DIR"
