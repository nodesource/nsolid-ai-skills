'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
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

  test(`${scriptLabel} exits with usage when no JSON is provided`, () => {
    const result = run(script, [])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Usage: node write-result\.js/)
  })

  test(`${scriptLabel} exits with error for invalid JSON`, () => {
    const result = run(script, ['{bad json}'])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Invalid JSON:/)
  })

  test(`${scriptLabel} writes a benchmark result file and updates .gitignore`, async () => {
    await withBenchmarkState(() => {
      if (fs.existsSync(GITIGNORE_PATH)) {
        fs.rmSync(GITIGNORE_PATH)
      }

      const payload = JSON.stringify({
        functionName: 'render chart()',
        result: { opsSec: 12345 }
      })

      const result = run(script, [payload])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      const outputPath = result.stdout.trim()
      assert.ok(outputPath.startsWith(BENCHMARKS_DIR + path.sep), `Unexpected output path: ${outputPath}`)
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
      const result = run(script, [JSON.stringify({ result: { opsSec: 7 } })])
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      const outputPath = result.stdout.trim()
      assert.match(path.basename(outputPath), /^\d+-unknown\.json$/)
    })
  })

  test(`${scriptLabel} writes to the project root even when invoked from a nested directory`, async () => {
    await withBenchmarkState(() => {
      const nestedCwd = path.dirname(script)
      const payload = JSON.stringify({
        functionName: 'nested cwd',
        result: { opsSec: 99 }
      })

      const result = run(script, [payload], nestedCwd)
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      const outputPath = result.stdout.trim()
      assert.ok(outputPath.startsWith(BENCHMARKS_DIR + path.sep), `Unexpected output path: ${outputPath}`)
      assert.ok(fs.existsSync(outputPath))

      const nestedBenchmarksDir = path.join(nestedCwd, '.nsolid', 'benchmarks')
      assert.ok(!fs.existsSync(nestedBenchmarksDir), `Nested .nsolid directory should not exist: ${nestedBenchmarksDir}`)
    })
  })

  test(`${scriptLabel} prefers the caller workspace when installed under .agents/skills`, () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'write-result-installed-'))
    const installedDir = path.join(projectRoot, '.agents', 'skills', path.basename(path.dirname(script)))
    const installedScript = path.join(installedDir, path.basename(script))

    try {
      fs.mkdirSync(installedDir, { recursive: true })
      fs.copyFileSync(script, installedScript)
      fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"consumer-workspace"}\n')
      fs.writeFileSync(path.join(projectRoot, '.agents', 'skills', 'package.json'), '{"name":"installed-skills"}\n')

      const payload = JSON.stringify({
        functionName: 'installed worker',
        result: { opsSec: 42 }
      })

      const result = run(installedScript, [payload], projectRoot)
      assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

      const outputPath = result.stdout.trim()
      const expectedDir = path.join(projectRoot, '.nsolid', 'benchmarks')
      assert.ok(outputPath.startsWith(expectedDir + path.sep), `Unexpected output path: ${outputPath}`)
      assert.ok(fs.existsSync(outputPath))

      const nestedBenchmarksDir = path.join(projectRoot, '.agents', 'skills', '.nsolid', 'benchmarks')
      assert.ok(!fs.existsSync(nestedBenchmarksDir), `Installed skill dir should not get benchmarks: ${nestedBenchmarksDir}`)
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })
}
