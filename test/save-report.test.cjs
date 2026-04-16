'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SCRIPT = path.resolve(__dirname, '..', 'save-report.cjs')
const ROOT = path.resolve(__dirname, '..')
const NSOLID_ASSETS = path.join(ROOT, '.nsolid', 'assets')

function run (args, opts = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
    ...opts
  })
}

function readIndex () {
  const indexPath = path.join(NSOLID_ASSETS, 'reports-index.json')
  if (!fs.existsSync(indexPath)) return []
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

// Snapshot assets dir state, run fn, then restore to that state.
async function withCleanAssets (fn) {
  fs.mkdirSync(NSOLID_ASSETS, { recursive: true })
  const beforeFiles = new Set(fs.readdirSync(NSOLID_ASSETS))
  const beforeIndex = readIndex()

  try {
    return await fn()
  } finally {
    for (const f of fs.readdirSync(NSOLID_ASSETS)) {
      if (!beforeFiles.has(f) && f !== 'reports-index.json') {
        fs.rmSync(path.join(NSOLID_ASSETS, f), { recursive: true, force: true })
      }
    }
    const indexPath = path.join(NSOLID_ASSETS, 'reports-index.json')
    if (beforeIndex.length === 0 && !beforeFiles.has('reports-index.json')) {
      if (fs.existsSync(indexPath)) fs.rmSync(indexPath)
    } else {
      fs.writeFileSync(indexPath, JSON.stringify(beforeIndex, null, 2))
    }
  }
}

test('exits with usage message when no arguments provided', () => {
  const result = run([])
  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Usage:/)
})

test('exits with error for invalid report type', () => {
  const result = run(['not-a-type', 'My Report', '/tmp/foo.md'])
  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Unknown type/)
})

test('exits with error when content file does not exist', () => {
  const result = run(['cpu-analysis', 'My Report', '/nonexistent/report.md'])
  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Content file not found/)
})

test('saves report file and creates index entry from a content file', async () => {
  const content = '# CPU Analysis\n\n## Summary\n\nHigh CPU usage in processData.\n'
  const tmpFile = path.join(os.tmpdir(), `test-report-${Date.now()}.md`)
  fs.writeFileSync(tmpFile, content)

  try {
    await withCleanAssets(() => {
      const result = run(['cpu-analysis', 'CPU Analysis Report', tmpFile])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
      assert.match(result.stdout, /Report saved to:/)

      const files = fs.readdirSync(NSOLID_ASSETS).filter(f => f.startsWith('cpu-analysis-') && f.endsWith('.md'))
      assert.strictEqual(files.length, 1, `Expected 1 report file, got ${files.length}`)
      assert.strictEqual(fs.readFileSync(path.join(NSOLID_ASSETS, files[0]), 'utf-8'), content)

      const entries = readIndex()
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].type, 'cpu-analysis')
      assert.strictEqual(entries[0].title, 'CPU Analysis Report')
      assert.match(entries[0].summary, /High CPU/)
      assert.strictEqual(entries[0].fileName, files[0])
    })
  } finally {
    fs.rmSync(tmpFile)
  }
})

test('saves report when content is piped via --stdin', async () => {
  const content = '# Memory Analysis\n\n## Summary\n\nHeap grew by 200MB over 10 minutes.\n'

  await withCleanAssets(() => {
    const result = run(['memory-analysis', 'Memory Report', '--stdin'], { input: content })
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
    assert.match(result.stdout, /Report saved to:/)

    const files = fs.readdirSync(NSOLID_ASSETS).filter(f => f.startsWith('memory-analysis-') && f.endsWith('.md'))
    assert.strictEqual(files.length, 1)
    assert.strictEqual(fs.readFileSync(path.join(NSOLID_ASSETS, files[0]), 'utf-8'), content)

    const entries = readIndex()
    assert.strictEqual(entries.length, 1)
    assert.match(entries[0].summary, /Heap grew/)
  })
})

test('creates .nsolid/.gitignore with wildcard if it does not exist', async () => {
  const gitignorePath = path.join(ROOT, '.nsolid', '.gitignore')
  const existed = fs.existsSync(gitignorePath)
  const original = existed ? fs.readFileSync(gitignorePath, 'utf-8') : null
  if (existed) fs.rmSync(gitignorePath)

  try {
    await withCleanAssets(() => {
      const result = run(['security-audit', 'Security Audit', '--stdin'], { input: '# Report\n' })
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
      assert.ok(fs.existsSync(gitignorePath), '.nsolid/.gitignore was not created')
      assert.strictEqual(fs.readFileSync(gitignorePath, 'utf-8'), '*\n')
    })
  } finally {
    if (original !== null) {
      fs.writeFileSync(gitignorePath, original)
    } else if (fs.existsSync(gitignorePath)) {
      fs.rmSync(gitignorePath)
    }
  }
})

test('appends entries to an existing index without overwriting prior reports', async () => {
  const tmpFile1 = path.join(os.tmpdir(), `r1-${Date.now()}.md`)
  const tmpFile2 = path.join(os.tmpdir(), `r2-${Date.now()}.md`)
  fs.writeFileSync(tmpFile1, '# Leak Hunt 1\n')
  fs.writeFileSync(tmpFile2, '# Leak Hunt 2\n')

  try {
    await withCleanAssets(() => {
      run(['memory-leak-hunt', 'Leak Hunt 1', tmpFile1])
      run(['memory-leak-hunt', 'Leak Hunt 2', tmpFile2])

      const entries = readIndex()
      assert.strictEqual(entries.length, 2)
      assert.strictEqual(entries[0].title, 'Leak Hunt 1')
      assert.strictEqual(entries[1].title, 'Leak Hunt 2')
    })
  } finally {
    fs.rmSync(tmpFile1)
    fs.rmSync(tmpFile2)
  }
})

test('report filename uses YYYY-MM-DDTHH-MM-SS date format', async () => {
  await withCleanAssets(() => {
    const result = run(['profile-analysis', 'Profile', '--stdin'], { input: '# Profile\n' })
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

    const files = fs.readdirSync(NSOLID_ASSETS).filter(f => f.startsWith('profile-analysis-'))
    assert.strictEqual(files.length, 1)
    // e.g. profile-analysis-2026-04-14T16-30-00.md
    assert.match(files[0], /^profile-analysis-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/)
  })
})
