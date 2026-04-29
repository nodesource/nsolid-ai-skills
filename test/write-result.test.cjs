'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const BENCHMARKS_DIR = path.join(ROOT, '.nsolid', 'benchmarks')
const GITIGNORE_PATH = path.join(ROOT, '.gitignore')
const WRITE_RESULT_SCRIPTS = [
  path.join(ROOT, 'benchmark-run', 'write-result.js'),
  path.join(ROOT, 'benchmark-validate', 'write-result.js')
]

function run (script, args, cwd = ROOT) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 10_000
  })
}

function outputOf (result) {
  return `${result.stdout}${result.stderr}`
}

function newBenchmarkFiles (beforeEntries) {
  if (!fs.existsSync(BENCHMARKS_DIR)) {
    return []
  }

  return fs.readdirSync(BENCHMARKS_DIR)
    .filter(entry => !beforeEntries.has(entry))
    .map(entry => path.join(BENCHMARKS_DIR, entry))
}

async function withBenchmarkState (fn) {
  const benchmarksExisted = fs.existsSync(BENCHMARKS_DIR)
  const beforeBenchmarks = benchmarksExisted ? fs.readdirSync(BENCHMARKS_DIR) : null
  const gitignoreExisted = fs.existsSync(GITIGNORE_PATH)
  const beforeGitignore = gitignoreExisted ? fs.readFileSync(GITIGNORE_PATH, 'utf-8') : null

  try {
    return await fn()
  } finally {
    if (benchmarksExisted) {
      fs.mkdirSync(BENCHMARKS_DIR, { recursive: true })
      const allowed = new Set(beforeBenchmarks)
      for (const entry of fs.readdirSync(BENCHMARKS_DIR)) {
        if (!allowed.has(entry)) {
          fs.rmSync(path.join(BENCHMARKS_DIR, entry), { force: true, recursive: true })
        }
      }
    } else if (fs.existsSync(BENCHMARKS_DIR)) {
      fs.rmSync(BENCHMARKS_DIR, { recursive: true, force: true })
    }

    if (gitignoreExisted) {
      fs.writeFileSync(GITIGNORE_PATH, beforeGitignore)
    } else if (fs.existsSync(GITIGNORE_PATH)) {
      fs.rmSync(GITIGNORE_PATH)
    }
  }
}

for (const script of WRITE_RESULT_SCRIPTS) {
  const scriptLabel = path.relative(ROOT, script)
  const scriptName = path.basename(script)

  test(`${scriptLabel} exits with usage when no JSON is provided`, () => {
    const result = run(script, [])
    assert.strictEqual(result.status, 1)
  })

  test(`${scriptLabel} exits with error for invalid JSON`, () => {
    const result = run(script, ['{bad json}'])
    assert.strictEqual(result.status, 1)
  })

  test(`${scriptLabel} writes a benchmark result file and updates .gitignore`, async () => {
    await withBenchmarkState(() => {
      const beforeEntries = fs.existsSync(BENCHMARKS_DIR)
        ? new Set(fs.readdirSync(BENCHMARKS_DIR))
        : new Set()

      if (fs.existsSync(GITIGNORE_PATH)) {
        fs.rmSync(GITIGNORE_PATH)
      }

      const payload = JSON.stringify({
        functionName: 'render chart()',
        result: { opsSec: 12345 }
      })

      const result = run(script, [payload])
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

      const createdFiles = newBenchmarkFiles(beforeEntries)
      assert.strictEqual(createdFiles.length, 1, `Expected one new benchmark file, found ${createdFiles.length}`)
      const outputPath = createdFiles[0]
      assert.ok(fs.existsSync(outputPath))
      assert.match(path.basename(outputPath), /^\d+-render_chart__\.json$/)

      const fileContent = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
      assert.deepStrictEqual(fileContent, {
        functionName: 'render chart()',
        result: { opsSec: 12345 }
      })

      assert.strictEqual(fs.readFileSync(GITIGNORE_PATH, 'utf-8'), '.nsolid/\n')
    })
  })

  test(`${scriptLabel} falls back to unknown when functionName is missing`, async () => {
    await withBenchmarkState(() => {
      const beforeEntries = fs.existsSync(BENCHMARKS_DIR)
        ? new Set(fs.readdirSync(BENCHMARKS_DIR))
        : new Set()

      const result = run(script, [JSON.stringify({ result: { opsSec: 7 } })])
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

      const createdFiles = newBenchmarkFiles(beforeEntries)
      assert.strictEqual(createdFiles.length, 1, `Expected one new benchmark file, found ${createdFiles.length}`)
      const outputPath = createdFiles[0]
      assert.match(path.basename(outputPath), /^\d+-unknown\.json$/)
    })
  })
}
