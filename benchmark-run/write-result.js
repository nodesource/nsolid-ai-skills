#!/usr/bin/env node
// write-result.js — writes benchmark JSON to .nsolid/benchmarks/ in the workspace root.
// Usage: node write-result.js '<json-string>'
// No external dependencies — plain Node.js only.

'use strict';

const fs = require('fs');
const path = require('path');

function findWorkspaceRoot(startDir) {
  let dir = startDir;

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.vscode', 'settings.json'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return startDir;
}

const json = process.argv[2];
if (!json) {
  console.error('Usage: node write-result.js \'<json-string>\'');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(json);
} catch (e) {
  console.error('Invalid JSON:', e.message);
  process.exit(1);
}

const workspaceRoot = findWorkspaceRoot(path.resolve(__dirname));
const outputDir = path.join(workspaceRoot, '.nsolid', 'benchmarks');

// Create .nsolid/benchmarks/ if it doesn't exist
fs.mkdirSync(outputDir, { recursive: true });

// Add .nsolid/ to .gitignore if not already present
const gitignorePath = path.join(workspaceRoot, '.gitignore');
const gitignoreEntry = '.nsolid/';
try {
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }
  const lines = content.split('\n').map(l => l.trim());
  if (!lines.includes(gitignoreEntry) && !lines.includes('.nsolid')) {
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(gitignorePath, `${separator}${gitignoreEntry}\n`);
  }
} catch (e) {
  // Non-fatal: .gitignore update failure shouldn't block result writing
}

// Derive filename from timestamp + functionName
const timestamp = Date.now();
const functionName = (data.functionName || 'unknown')
  .replace(/[^a-zA-Z0-9_-]/g, '_')
  .slice(0, 64);
const filename = `${timestamp}-${functionName}.json`;
const outputPath = path.join(outputDir, filename);

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
console.log(outputPath);
