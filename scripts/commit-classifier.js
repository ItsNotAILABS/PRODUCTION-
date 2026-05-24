#!/usr/bin/env node
/**
 * 🔄 COMMIT CLASSIFIER — Autonomous Commit Classification
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Classifies commits into categories for governance processing:
 *   - TRIVIAL: Auto-merge allowed (docs, comments, formatting)
 *   - SAFE: Auto-merge with verification (tests, configs)
 *   - NEEDS-REVIEW: Human review required (logic, API changes)
 *   - BLOCKED: Cannot proceed (security, secrets, governance violations)
 *
 * Usage:
 *   node scripts/commit-classifier.js --analyze
 *   node scripts/commit-classifier.js --file=path/to/file
 *   node scripts/commit-classifier.js --diff
 *
 * id: atlas://script/commit-classifier
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PHI = 1.618033988749895;

const REPO = path.resolve(__dirname, '..');

// ── Classification Rules ──────────────────────────────────────────────────────
const CLASSIFICATIONS = {
  TRIVIAL: {
    patterns: [
      /\.md$/,           // Markdown files
      /\.txt$/,          // Text files
      /\.css$/,          // Stylesheets (usually safe)
      /\/docs\//,        // Documentation directory
      /README/i,         // README files
      /CHANGELOG/i,      // Changelog
      /LICENSE/i,        // License files
      /\.gitignore$/,    // Git ignore
    ],
    contentPatterns: [
      /^[\s]*\/\//,      // Comment-only lines
      /^[\s]*\/\*/,      // Block comments
      /^[\s]*#/,         // Hash comments
      /^[\s]*\*/,        // Continued block comments
    ],
    maxRisk: 0.2,
  },
  
  SAFE: {
    patterns: [
      /\.test\.js$/,     // Test files
      /\.spec\.js$/,     // Spec files
      /\/test\//,        // Test directory
      /\.json$/,         // JSON configs (non-sensitive)
      /\.yml$/,          // YAML configs
      /\.yaml$/,         // YAML configs
      /\.csv$/,          // CSV data
    ],
    excludePatterns: [
      /package\.json$/,  // Package manifest needs review
      /secret/i,         // Anything with 'secret'
      /\.env/,           // Environment files
    ],
    maxRisk: 0.4,
  },
  
  NEEDS_REVIEW: {
    patterns: [
      /\.js$/,           // JavaScript
      /\.ts$/,           // TypeScript
      /\.tsx$/,          // TSX
      /\.jsx$/,          // JSX
      /\.py$/,           // Python
      /\.go$/,           // Go
      /package\.json$/,  // Package manifest
    ],
    maxRisk: 0.7,
  },
  
  BLOCKED: {
    patterns: [
      /\.env/,           // Environment files
      /secret/i,         // Secret files
      /\.pem$/,          // Certificates
      /\.key$/,          // Key files
      /credential/i,     // Credential files
    ],
    contentPatterns: [
      /API_KEY/i,        // API keys
      /SECRET/i,         // Secrets
      /PASSWORD/i,       // Passwords
      /TOKEN/i,          // Tokens
      /PRIVATE/i,        // Private keys
      /-----BEGIN/,      // PEM headers
    ],
    maxRisk: 1.0,
  },
};

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  analyze: process.argv.includes('--analyze'),
  file: process.argv.find(a => a.startsWith('--file='))?.split('=')[1],
  diff: process.argv.includes('--diff'),
  staged: process.argv.includes('--staged'),
};

// ── Get Changed Files ─────────────────────────────────────────────────────────
function getChangedFiles() {
  try {
    // Try git diff for staged changes
    let output;
    if (args.staged) {
      output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    } else {
      // Get files changed in the last commit
      output = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only', { encoding: 'utf8' });
    }
    return output.trim().split('\n').filter(Boolean);
  } catch (e) {
    // Fallback: check staging area
    const stagingDir = path.join(REPO, 'dist', 'agent-staging');
    if (fs.existsSync(stagingDir)) {
      return fs.readdirSync(stagingDir, { recursive: true })
        .filter(f => !fs.statSync(path.join(stagingDir, f)).isDirectory());
    }
    return [];
  }
}

// ── Classify Single File ──────────────────────────────────────────────────────
function classifyFile(filePath) {
  let classification = 'NEEDS_REVIEW';
  let reasons = [];
  let riskScore = 0.5;
  
  // Check BLOCKED patterns first
  for (const pattern of CLASSIFICATIONS.BLOCKED.patterns) {
    if (pattern.test(filePath)) {
      return {
        file: filePath,
        classification: 'BLOCKED',
        riskScore: 1.0,
        reasons: [`File matches blocked pattern: ${pattern}`],
      };
    }
  }
  
  // Check content for secrets if file exists
  const fullPath = path.join(REPO, filePath);
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of CLASSIFICATIONS.BLOCKED.contentPatterns || []) {
        if (pattern.test(content)) {
          return {
            file: filePath,
            classification: 'BLOCKED',
            riskScore: 1.0,
            reasons: [`File contains blocked content pattern: ${pattern}`],
          };
        }
      }
    } catch (e) {
      // Binary file or unreadable
    }
  }
  
  // Check TRIVIAL patterns
  for (const pattern of CLASSIFICATIONS.TRIVIAL.patterns) {
    if (pattern.test(filePath)) {
      classification = 'TRIVIAL';
      riskScore = 0.1;
      reasons.push(`Matches trivial pattern: ${pattern}`);
      break;
    }
  }
  
  // Check SAFE patterns (if not already trivial)
  if (classification !== 'TRIVIAL') {
    for (const pattern of CLASSIFICATIONS.SAFE.patterns) {
      if (pattern.test(filePath)) {
        // Check excludes
        const excluded = CLASSIFICATIONS.SAFE.excludePatterns?.some(p => p.test(filePath));
        if (!excluded) {
          classification = 'SAFE';
          riskScore = 0.3;
          reasons.push(`Matches safe pattern: ${pattern}`);
          break;
        }
      }
    }
  }
  
  // Check NEEDS_REVIEW patterns
  if (classification === 'NEEDS_REVIEW') {
    for (const pattern of CLASSIFICATIONS.NEEDS_REVIEW.patterns) {
      if (pattern.test(filePath)) {
        riskScore = 0.5;
        reasons.push(`Matches review-required pattern: ${pattern}`);
        break;
      }
    }
  }
  
  return {
    file: filePath,
    classification,
    riskScore,
    reasons,
  };
}

// ── Analyze All Changes ───────────────────────────────────────────────────────
function analyzeChanges() {
  const files = getChangedFiles();
  
  if (files.length === 0) {
    return {
      classification: 'TRIVIAL',
      riskScore: 0.0,
      files: [],
      summary: 'No changes detected',
    };
  }
  
  const results = files.map(f => classifyFile(f));
  
  // Overall classification is the highest risk level
  const classificationOrder = ['TRIVIAL', 'SAFE', 'NEEDS_REVIEW', 'BLOCKED'];
  let overallClassification = 'TRIVIAL';
  let maxRisk = 0;
  
  for (const result of results) {
    const currentIndex = classificationOrder.indexOf(result.classification);
    const overallIndex = classificationOrder.indexOf(overallClassification);
    
    if (currentIndex > overallIndex) {
      overallClassification = result.classification;
    }
    
    if (result.riskScore > maxRisk) {
      maxRisk = result.riskScore;
    }
  }
  
  // Apply phi-weighted risk aggregation
  const avgRisk = results.reduce((sum, r) => sum + r.riskScore, 0) / results.length;
  const phiWeightedRisk = (maxRisk + avgRisk * PHI) / (1 + PHI);
  
  return {
    classification: overallClassification.toLowerCase().replace('_', '-'),
    riskScore: Math.round(phiWeightedRisk * 1000) / 1000,
    fileCount: files.length,
    files: results,
    summary: `${files.length} file(s) analyzed`,
    breakdown: {
      trivial: results.filter(r => r.classification === 'TRIVIAL').length,
      safe: results.filter(r => r.classification === 'SAFE').length,
      needsReview: results.filter(r => r.classification === 'NEEDS_REVIEW').length,
      blocked: results.filter(r => r.classification === 'BLOCKED').length,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.analyze) {
  const result = analyzeChanges();
  console.log(JSON.stringify(result, null, 2));
} else if (args.file) {
  const result = classifyFile(args.file);
  console.log(JSON.stringify(result, null, 2));
} else if (args.diff) {
  const files = getChangedFiles();
  console.log('Changed files:');
  files.forEach(f => console.log(`  ${f}`));
} else {
  console.log(`
🔄 Commit Classifier

Usage:
  --analyze           Analyze all changed files
  --file=<path>       Classify a specific file
  --diff              List changed files
  --staged            Use staged changes only

Output:
  JSON with classification (trivial|safe|needs-review|blocked) and riskScore

Example:
  node commit-classifier.js --analyze
`);
}

module.exports = {
  CLASSIFICATIONS,
  classifyFile,
  analyzeChanges,
  getChangedFiles,
};
