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
const NESTED_DIR = path.join(ROOT, 'analyze-asset')

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

test('exits with error when report file does not exist', () => {
  const result = run(['cpu-analysis', 'My Report', '/nonexistent/report.md'])
  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Report file not found/)
})

test('exits with error when report file is outside .nsolid/assets', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-report-${Date.now()}.md`)
  fs.writeFileSync(tmpFile, '# Report\n')

  try {
    const result = run(['cpu-analysis', 'CPU Analysis Report', tmpFile])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Report file must be inside/)
  } finally {
    fs.rmSync(tmpFile)
  }
})

test('registers an existing report file and creates an index entry', async () => {
  const content = '# CPU Analysis\n\n## Summary\n\nHigh CPU usage in processData.\n'
  const reportPath = path.join(NSOLID_ASSETS, `cpu-analysis-test-${Date.now()}.md`)

  try {
    await withCleanAssets(() => {
      fs.writeFileSync(reportPath, content)

      const result = run(['cpu-analysis', 'CPU Analysis Report', reportPath])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
      assert.match(result.stdout, /Report registered:/)

      assert.ok(fs.existsSync(reportPath))
      assert.strictEqual(fs.readFileSync(reportPath, 'utf-8'), content)

      const entries = readIndex()
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].type, 'cpu-analysis')
      assert.strictEqual(entries[0].title, 'CPU Analysis Report')
      assert.match(entries[0].summary, /High CPU/)
      assert.strictEqual(entries[0].fileName, path.basename(reportPath))
    })
  } finally {
    fs.rmSync(reportPath, { force: true })
  }
})

test('resolves relative report paths from the project root', async () => {
  const fileName = `memory-analysis-test-${Date.now()}.md`
  const reportPath = path.join(NSOLID_ASSETS, fileName)
  const content = '# Memory Analysis\n\n## Summary\n\nHeap grew by 200MB over 10 minutes.\n'

  try {
    await withCleanAssets(() => {
      fs.writeFileSync(reportPath, content)

      const result = run(['memory-analysis', 'Memory Report', path.join('.nsolid', 'assets', fileName)], {
        cwd: NESTED_DIR
      })
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      const entries = readIndex()
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].fileName, fileName)
      assert.match(entries[0].summary, /Heap grew/)
    })
  } finally {
    fs.rmSync(reportPath, { force: true })
  }
})

test('creates .nsolid/.gitignore with wildcard if it does not exist', async () => {
  const gitignorePath = path.join(ROOT, '.nsolid', '.gitignore')
  const existed = fs.existsSync(gitignorePath)
  const original = existed ? fs.readFileSync(gitignorePath, 'utf-8') : null
  if (existed) fs.rmSync(gitignorePath)
  const reportPath = path.join(NSOLID_ASSETS, `security-audit-test-${Date.now()}.md`)

  try {
    await withCleanAssets(() => {
      fs.writeFileSync(reportPath, '# Report\n')

      const result = run(['security-audit', 'Security Audit', reportPath])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
      assert.ok(fs.existsSync(gitignorePath), '.nsolid/.gitignore was not created')
      assert.strictEqual(fs.readFileSync(gitignorePath, 'utf-8'), '*\n')
    })
  } finally {
    fs.rmSync(reportPath, { force: true })
    if (original !== null) {
      fs.writeFileSync(gitignorePath, original)
    } else if (fs.existsSync(gitignorePath)) {
      fs.rmSync(gitignorePath)
    }
  }
})

test('appends entries to an existing index without overwriting prior reports', async () => {
  const reportPath1 = path.join(NSOLID_ASSETS, `r1-${Date.now()}.md`)
  const reportPath2 = path.join(NSOLID_ASSETS, `r2-${Date.now()}.md`)

  try {
    await withCleanAssets(() => {
      fs.writeFileSync(reportPath1, '# Leak Hunt 1\n')
      fs.writeFileSync(reportPath2, '# Leak Hunt 2\n')

      run(['memory-leak-hunt', 'Leak Hunt 1', reportPath1])
      run(['memory-leak-hunt', 'Leak Hunt 2', reportPath2])

      const entries = readIndex()
      assert.strictEqual(entries.length, 2)
      assert.strictEqual(entries[0].title, 'Leak Hunt 1')
      assert.strictEqual(entries[1].title, 'Leak Hunt 2')
    })
  } finally {
    fs.rmSync(reportPath1, { force: true })
    fs.rmSync(reportPath2, { force: true })
  }
})

test('re-registering the same file updates the index entry instead of duplicating it', async () => {
  const fileName = `profile-analysis-test-${Date.now()}.md`
  const reportPath = path.join(NSOLID_ASSETS, fileName)

  try {
    await withCleanAssets(() => {
      fs.writeFileSync(reportPath, '# Profile\n\n## Summary\n\nOriginal summary.\n')

      let result = run(['profile-analysis', 'Profile', reportPath])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      fs.writeFileSync(reportPath, '# Profile\n\n## Summary\n\nUpdated summary.\n')
      result = run(['profile-analysis', 'Updated Profile', reportPath])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      const entries = readIndex()
      assert.strictEqual(entries.length, 1)
      assert.strictEqual(entries[0].title, 'Updated Profile')
      assert.match(entries[0].summary, /Updated summary/)
      assert.strictEqual(entries[0].fileName, fileName)
    })
  } finally {
    fs.rmSync(reportPath, { force: true })
  }
})

test('rejects non-markdown files', async () => {
  const reportPath = path.join(NSOLID_ASSETS, `profile-analysis-test-${Date.now()}.txt`)

  try {
    await withCleanAssets(() => {
      fs.writeFileSync(reportPath, 'not markdown')

      const result = run(['profile-analysis', 'Profile', reportPath])
      assert.strictEqual(result.status, 1)
      assert.match(result.stderr, /Report file must be a markdown file/)
    })
  } finally {
    fs.rmSync(reportPath, { force: true })
  }
})

test('preserves the existing report filename instead of generating a new one', async () => {
  const fileName = `profile-analysis-test-${Date.now()}.md`
  const reportPath = path.join(NSOLID_ASSETS, fileName)

  await withCleanAssets(() => {
    fs.writeFileSync(reportPath, '# Profile\n')

    const result = run(['profile-analysis', 'Profile', reportPath])
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

    const entries = readIndex()
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(entries[0].fileName, fileName)
    assert.ok(fs.existsSync(reportPath))
  })
})
