'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SAVE_REPORT_SCRIPTS = [
  path.join(ROOT, 'ns-benchmark-run', 'save-report.cjs'),
  path.join(ROOT, 'ns-benchmark-validate', 'save-report.cjs')
]

function run (script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf-8',
    timeout: 10_000
  })
}

function outputOf (result) {
  return `${result.stdout}${result.stderr}`
}

function createWorkspace () {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'save-report-'))
  fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{"name":"save-report-workspace"}\n')
  return workspaceRoot
}

function readReportsIndex (workspaceRoot) {
  const indexPath = path.join(workspaceRoot, '.nsolid', 'assets', 'reports-index.json')
  if (!fs.existsSync(indexPath)) {
    return []
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

function withWorkspace (fn) {
  const workspaceRoot = createWorkspace()

  try {
    return fn(workspaceRoot)
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
  }
}

for (const script of SAVE_REPORT_SCRIPTS) {
  const scriptLabel = path.relative(ROOT, script)

  test(`${scriptLabel} exits with usage when required arguments are missing`, () => {
    const result = run(script, [])
    assert.strictEqual(result.status, 1)
  })

  test(`${scriptLabel} rejects unsupported report types`, () => {
    withWorkspace((workspaceRoot) => {
      const markdownPath = path.join(workspaceRoot, 'report.md')
      fs.writeFileSync(markdownPath, '# Report\n', 'utf-8')

      const result = run(script, ['memory-leak-hunt', 'Leak Report', markdownPath], { cwd: workspaceRoot })
      assert.strictEqual(result.status, 1, `output: ${outputOf(result)}`)
    })
  })

  test(`${scriptLabel} writes a benchmark markdown report and updates reports-index.json`, () => {
    withWorkspace((workspaceRoot) => {
      const markdownPath = path.join(workspaceRoot, 'benchmark-report.md')
      const content = [
        '# Benchmark Report — renderChart',
        '',
        '**Date**: 2026-05-07T12:00:00.000Z',
        '**Application**: explicit-app',
        '',
        '## Summary',
        'renderChart improved by 42%.',
        '',
        '## Results',
        '| Metric | Value |',
        '|--------|-------|',
        '| ops/sec | 12345 |'
      ].join('\n')
      fs.writeFileSync(markdownPath, content, 'utf-8')

      const result = run(script, ['benchmark', 'Benchmark Report — renderChart', markdownPath, 'explicit-app'], { cwd: workspaceRoot })
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

      const outputPath = result.stdout.trim()
      assert.strictEqual(path.dirname(outputPath), path.join(workspaceRoot, '.nsolid', 'assets'))
      assert.ok(fs.existsSync(outputPath), `Expected report file at ${outputPath}`)
      assert.strictEqual(fs.readFileSync(outputPath, 'utf-8'), content)

      const gitignorePath = path.join(workspaceRoot, '.nsolid', '.gitignore')
      assert.strictEqual(fs.readFileSync(gitignorePath, 'utf-8'), '*\n')

      const reports = readReportsIndex(workspaceRoot)
      assert.strictEqual(reports.length, 1)
      assert.strictEqual(reports[0].type, 'benchmark')
      assert.strictEqual(reports[0].title, 'Benchmark Report — renderChart')
      assert.strictEqual(reports[0].summary, 'renderChart improved by 42%.')
      assert.strictEqual(reports[0].appName, 'explicit-app')
      assert.match(reports[0].fileName, /^benchmark-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/)
    })
  })

  test(`${scriptLabel} falls back to the first non-heading line when no summary section exists`, () => {
    withWorkspace((workspaceRoot) => {
      const markdownPath = path.join(workspaceRoot, 'benchmark-report.md')
      const content = [
        '# Benchmark Report — renderChart',
        '',
        '**Date**: 2026-05-07T12:00:00.000Z',
        '',
        'This run captured the benchmark evidence.',
        '',
        '## Results',
        'done'
      ].join('\n')
      fs.writeFileSync(markdownPath, content, 'utf-8')

      const result = run(script, ['benchmark', 'Benchmark Report — renderChart', markdownPath], { cwd: workspaceRoot })
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

      const reports = readReportsIndex(workspaceRoot)
      assert.strictEqual(reports.length, 1)
      assert.strictEqual(reports[0].summary, 'This run captured the benchmark evidence.')
    })
  })

  test(`${scriptLabel} infers the app name from report markdown when no explicit app is passed`, () => {
    withWorkspace((workspaceRoot) => {
      const markdownPath = path.join(workspaceRoot, 'report.md')
      fs.writeFileSync(markdownPath, [
        '# Analysis Notes',
        '',
        '**Date**: 2026-05-07T12:00:00.000Z',
        '**Application**: inferred-app',
        '',
        '## Summary',
        'Heap growth is concentrated in the cache.'
      ].join('\n'), 'utf-8')

      const result = run(script, ['memory-analysis', 'Analysis Notes', markdownPath], { cwd: workspaceRoot })
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

      const reports = readReportsIndex(workspaceRoot)
      assert.strictEqual(reports.length, 1)
      assert.strictEqual(reports[0].appName, 'inferred-app')
    })
  })

  test(`${scriptLabel} resolves the caller workspace when installed under .agents/skills`, () => {
    withWorkspace((workspaceRoot) => {
      const installedDir = path.join(workspaceRoot, '.agents', 'skills', 'ns-benchmark-run')
      const installedScript = path.join(installedDir, 'save-report.cjs')
      const markdownPath = path.join(workspaceRoot, 'installed-report.md')

      fs.mkdirSync(installedDir, { recursive: true })
      fs.copyFileSync(script, installedScript)
      fs.writeFileSync(markdownPath, [
        '# Benchmark Report — installed',
        '',
        '## Summary',
        'Installed skill save path resolved correctly.'
      ].join('\n'), 'utf-8')

      const result = run(installedScript, ['benchmark', 'Benchmark Report — installed', markdownPath, 'installed-app'], {
        cwd: workspaceRoot,
        env: { INIT_CWD: workspaceRoot }
      })
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

      const outputPath = result.stdout.trim()
      assert.strictEqual(path.dirname(outputPath), path.join(workspaceRoot, '.nsolid', 'assets'))
      assert.ok(fs.existsSync(outputPath), `Expected report file at ${outputPath}`)

      const reports = readReportsIndex(workspaceRoot)
      assert.strictEqual(reports.length, 1)
      assert.strictEqual(reports[0].appName, 'installed-app')

      const nestedReportsDir = path.join(installedDir, '.nsolid', 'assets')
      assert.ok(!fs.existsSync(nestedReportsDir), `Installed skill dir should not get reports: ${nestedReportsDir}`)
    })
  })
}
