#!/usr/bin/env node

// save-report.cjs — Registers an existing markdown report under
// .nsolid/assets/ and appends metadata to .nsolid/assets/reports-index.json so
// the N|Solid VS Code
// extension can discover and display it in the Reports History sidebar.
//
// Usage:
//   node save-report.cjs <type> <title> <report-file>
//
// Arguments:
//   type         — Report type (see VALID_TYPES below)
//   title        — Human-readable title shown in the sidebar
//   report-file  — Path to an existing .md report file under the project-root
//                  .nsolid/assets/ directory
//
// The script finds the workspace root by walking up from its own location,
// looking for .vscode/settings.json or package.json (same strategy as
// fetch-asset.cjs).
//
// Output:
//   .nsolid/assets/<type>-<YYYY-MM-DDTHH-MM-SS>.md   — the report file
//   .nsolid/assets/reports-index.json                 — updated metadata index
//
// Intended usage:
//   Skills should create the report markdown directly inside the project-root
//   .nsolid/assets/ directory, then call this helper to register the entry in
//   reports-index.json. The helper does not copy files from temp locations.

'use strict'

const fs = require('fs')
const path = require('path')

const VALID_TYPES = [
  'cpu-analysis',
  'memory-analysis',
  'memory-leak-hunt',
  'security-audit',
  'lockfile-analysis',
  'package-check',
  'profile-analysis',
  'asset-analysis',
  'event-analysis'
]

function findWorkspaceRoot (startDir) {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.vscode', 'settings.json'))) {
      return dir
    }
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return startDir
}

// Mirrors ReportsHistoryService.extractSummary() from the VS Code extension
function extractSummary (content) {
  const summaryMatch = content.match(/## Summary\s*\n([\s\S]*?)(?=\n---|\n##|$)/)
  if (summaryMatch && summaryMatch[1]) {
    return summaryMatch[1].trim().slice(0, 200)
  }

  // Fallback: first non-empty, non-heading line
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('**Date')) {
      return trimmed.slice(0, 200)
    }
  }

  return ''
}

function isInsideDirectory (parentDir, targetPath) {
  const relativePath = path.relative(parentDir, targetPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

async function main () {
  const [,, type, title, reportArg] = process.argv

  if (!type || !title || !reportArg) {
    console.error('Usage: node save-report.cjs <type> <title> <report-file>')
    console.error('  type: ' + VALID_TYPES.join(' | '))
    process.exit(1)
  }

  if (!VALID_TYPES.includes(type)) {
    console.error(`Unknown type: "${type}". Valid types: ${VALID_TYPES.join(', ')}`)
    process.exit(1)
  }

  const workspaceRoot = findWorkspaceRoot(path.resolve(__dirname))
  const nsolidDir = path.join(workspaceRoot, '.nsolid')
  const assetsDir = path.join(nsolidDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  const reportPath = path.isAbsolute(reportArg)
    ? reportArg
    : path.resolve(workspaceRoot, reportArg)

  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`)
    process.exit(1)
  }

  if (!isInsideDirectory(assetsDir, reportPath)) {
    console.error(`Report file must be inside ${assetsDir}: ${reportPath}`)
    process.exit(1)
  }

  if (path.extname(reportPath).toLowerCase() !== '.md') {
    console.error(`Report file must be a markdown file: ${reportPath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(reportPath, 'utf-8')

  // Add .gitignore to .nsolid/ if it doesn't already exist
  const gitignorePath = path.join(nsolidDir, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n', 'utf-8')
  }

  const now = new Date()
  const id = `${type}-${now.getTime()}`
  const fileName = path.basename(reportPath)

  const summary = extractSummary(content)
  const metadata = {
    id,
    title,
    type,
    timestamp: now.toISOString(),
    fileName,
    summary
  }

  // Append to reports-index.json (create if missing)
  const indexPath = path.join(assetsDir, 'reports-index.json')
  let reports = []
  try {
    if (fs.existsSync(indexPath)) {
      reports = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    }
  } catch {
    reports = []
  }

  const existingIndex = reports.findIndex(report => report.fileName === fileName)
  if (existingIndex >= 0) {
    reports[existingIndex] = metadata
  } else {
    reports.push(metadata)
  }
  fs.writeFileSync(indexPath, JSON.stringify(reports, null, 2), 'utf-8')

  console.log(`Report registered: ${reportPath}`)
}

main().catch(err => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
