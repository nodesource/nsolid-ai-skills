#!/usr/bin/env node

// save-report.cjs — Writes a markdown report to .nsolid/assets/ and appends
// metadata to .nsolid/assets/reports-index.json so the N|Solid VS Code
// extension can discover and display it in the Reports History sidebar.
//
// Usage:
//   node save-report.cjs <type> <title> <content-file>
//   node save-report.cjs <type> <title> --stdin < report.md
//
// Arguments:
//   type         — Report type (see VALID_TYPES below)
//   title        — Human-readable title shown in the sidebar
//   content-file — Path to a temp .md file with the report content,
//                  OR --stdin to read from standard input
//
// The script finds the workspace root by walking up from its own location,
// looking for .vscode/settings.json or package.json (same strategy as
// fetch-asset.cjs).
//
// Output:
//   .nsolid/assets/<type>-<YYYY-MM-DDTHH-MM-SS>.md   — the report file
//   .nsolid/assets/reports-index.json                 — updated metadata index

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

async function readStdin () {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

async function main () {
  const [,, type, title, contentArg] = process.argv

  if (!type || !title || !contentArg) {
    console.error('Usage: node save-report.cjs <type> <title> <content-file>')
    console.error('       node save-report.cjs <type> <title> --stdin < report.md')
    console.error('  type: ' + VALID_TYPES.join(' | '))
    process.exit(1)
  }

  if (!VALID_TYPES.includes(type)) {
    console.error(`Unknown type: "${type}". Valid types: ${VALID_TYPES.join(', ')}`)
    process.exit(1)
  }

  let content
  if (contentArg === '--stdin') {
    content = await readStdin()
  } else {
    const absPath = path.resolve(contentArg)
    if (!fs.existsSync(absPath)) {
      console.error(`Content file not found: ${absPath}`)
      process.exit(1)
    }
    content = fs.readFileSync(absPath, 'utf-8')
  }

  const workspaceRoot = findWorkspaceRoot(path.resolve(__dirname))

  const nsolidDir = path.join(workspaceRoot, '.nsolid')
  const assetsDir = path.join(nsolidDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  // Add .gitignore to .nsolid/ if it doesn't already exist
  const gitignorePath = path.join(nsolidDir, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n', 'utf-8')
  }

  const now = new Date()
  const id = `${type}-${now.getTime()}`
  // Matches Minwoo's dateStr format: YYYY-MM-DDTHH-MM-SS
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `${type}-${dateStr}.md`
  const filePath = path.join(assetsDir, fileName)

  fs.writeFileSync(filePath, content, 'utf-8')

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

  reports.push(metadata)
  fs.writeFileSync(indexPath, JSON.stringify(reports, null, 2), 'utf-8')

  console.log(`Report saved to: ${filePath}`)
}

main().catch(err => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
