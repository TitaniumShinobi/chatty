/**
 * Benchmark Report Generator
 * 
 * Generates HTML report with scores, violations, and drift patterns.
 */

import type { BenchmarkReport, ConsistencyMetrics } from './consistencyAnalyzer.js';
import type { BenchmarkResult } from './toneConsistencyBenchmark.js';
import fs from 'fs/promises';
import path from 'path';

export async function generateHTMLReport(
  report: BenchmarkReport,
  outputPath: string
): Promise<void> {
  const html = generateReportHTML(report);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, 'utf8');
  console.log(`✅ Report generated: ${outputPath}`);
}

function generateReportHTML(report: BenchmarkReport): string {
  const { metrics, results, constructId, totalPrompts, executionTime, timestamp } = report;

  // Group results by category
  const byCategory = groupByCategory(results);

  // Calculate category scores
  const categoryScores = calculateCategoryScores(byCategory);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tone Consistency Benchmark - ${constructId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .metric-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric-value {
      font-size: 2em;
      font-weight: bold;
      color: #2563eb;
    }
    .metric-label {
      color: #6b7280;
      margin-top: 5px;
    }
    .category-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .category-title {
      font-size: 1.5em;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .result-item {
      padding: 10px;
      border-left: 4px solid #e5e7eb;
      margin-bottom: 10px;
      background: #f9fafb;
    }
    .result-item.passed {
      border-left-color: #10b981;
    }
    .result-item.failed {
      border-left-color: #ef4444;
    }
    .violations {
      color: #ef4444;
      font-size: 0.9em;
      margin-top: 5px;
    }
    .score {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.9em;
      font-weight: bold;
    }
    .score-high {
      background: #d1fae5;
      color: #065f46;
    }
    .score-medium {
      background: #fef3c7;
      color: #92400e;
    }
    .score-low {
      background: #fee2e2;
      color: #991b1b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Tone Consistency Benchmark Report</h1>
    <p><strong>Construct:</strong> ${constructId}</p>
    <p><strong>Total Prompts:</strong> ${totalPrompts}</p>
    <p><strong>Execution Time:</strong> ${(executionTime / 1000).toFixed(1)}s</p>
    <p><strong>Timestamp:</strong> ${new Date(timestamp).toLocaleString()}</p>
  </div>

  <div class="metrics">
    <div class="metric-card">
      <div class="metric-value">${(metrics.identityPersistence * 100).toFixed(1)}%</div>
      <div class="metric-label">Identity Persistence</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${(metrics.toneConsistency * 100).toFixed(1)}%</div>
      <div class="metric-label">Tone Consistency</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${(metrics.boundaryViolationRate * 100).toFixed(1)}%</div>
      <div class="metric-label">Boundary Violations</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${metrics.totalViolations}</div>
      <div class="metric-label">Total Violations</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${metrics.driftOverTime}</div>
      <div class="metric-label">Drift Pattern</div>
    </div>
  </div>

  ${generateCategorySections(byCategory, categoryScores)}

  <div class="category-section">
    <div class="category-title">Recommendations</div>
    ${generateRecommendations(metrics)}
  </div>
</body>
</html>`;
}

function groupByCategory(results: BenchmarkResult[]): Record<string, BenchmarkResult[]> {
  const grouped: Record<string, BenchmarkResult[]> = {};
  for (const result of results) {
    if (!grouped[result.category]) {
      grouped[result.category] = [];
    }
    grouped[result.category].push(result);
  }
  return grouped;
}

function calculateCategoryScores(byCategory: Record<string, BenchmarkResult[]>): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const [category, results] of Object.entries(byCategory)) {
    const avgScore = results.reduce((sum, r) => sum + r.consistencyScore, 0) / results.length;
    scores[category] = avgScore;
  }
  return scores;
}

function generateCategorySections(
  byCategory: Record<string, BenchmarkResult[]>,
  categoryScores: Record<string, number>
): string {
  let html = '';
  for (const [category, results] of Object.entries(byCategory)) {
    const score = categoryScores[category];
    const scoreClass = score >= 0.8 ? 'score-high' : score >= 0.6 ? 'score-medium' : 'score-low';
    
    html += `
  <div class="category-section">
    <div class="category-title">
      ${category.charAt(0).toUpperCase() + category.slice(1)} 
      <span class="score ${scoreClass}">${(score * 100).toFixed(1)}%</span>
    </div>
    ${results.map(result => `
      <div class="result-item ${result.passed ? 'passed' : 'failed'}">
        <strong>Prompt ${result.promptId}:</strong> ${result.response.substring(0, 100)}...
        <div>
          <span class="score ${getScoreClass(result.identityScore)}">Identity: ${(result.identityScore * 100).toFixed(1)}%</span>
          <span class="score ${getScoreClass(result.toneScore)}">Tone: ${(result.toneScore * 100).toFixed(1)}%</span>
          <span class="score ${getScoreClass(result.consistencyScore)}">Overall: ${(result.consistencyScore * 100).toFixed(1)}%</span>
        </div>
        ${result.violations.length > 0 ? `<div class="violations">Violations: ${result.violations.join(', ')}</div>` : ''}
      </div>
    `).join('')}
  </div>`;
  }
  return html;
}

function getScoreClass(score: number): string {
  if (score >= 0.8) return 'score-high';
  if (score >= 0.6) return 'score-medium';
  return 'score-low';
}

function generateRecommendations(metrics: ConsistencyMetrics): string {
  const recommendations: string[] = [];

  if (metrics.identityPersistence < 0.9) {
    recommendations.push('Improve identity persistence - ensure construct consistently identifies itself');
  }

  if (metrics.toneConsistency < 0.8) {
    recommendations.push('Improve tone consistency - reduce variance in response style');
  }

  if (metrics.boundaryViolationRate > 0.1) {
    recommendations.push('Reduce boundary violations - strengthen identity enforcement');
  }

  if (metrics.driftOverTime === 'declining') {
    recommendations.push('Address declining drift pattern - consider prompt reinforcement');
  }

  if (metrics.totalViolations > 10) {
    recommendations.push(`Address ${metrics.totalViolations} total violations`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Identity fidelity is stable - no immediate action needed');
  }

  return recommendations.map(rec => `<p>• ${rec}</p>`).join('');
}

