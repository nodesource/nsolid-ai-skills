'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { runCliScript } = require('./helpers/run-cli.cjs')

const ROOT = path.resolve(__dirname, '..')
const SCRIPT = path.join(ROOT, 'ns-analyze-cpu', 'workspace-delta.cjs')

async function withTempWorkspace (fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-delta-'))
  try {
    return await fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function runScriptWithInput (input, cwd) {
  const inputPath = path.join(cwd, 'workspace-delta-input.json')
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2))
  return runCliScript(SCRIPT, {
    args: [inputPath],
    cwd
  })
}

test('workspace-delta handles help, validation, app mismatch, and runtime path mapping', async () => {
  const helpResult = await runCliScript(SCRIPT, { args: ['--help'] })
  assert.strictEqual(helpResult.status, 0, helpResult.stderr)
  assert.match(helpResult.stdout, /Usage:/)
  assert.match(helpResult.stdout, /runtimeCode: string/)

  await withTempWorkspace(async (workspaceRoot) => {
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'sample-app' }, null, 2))

    const result = await runScriptWithInput({
      workspaceRoot,
      targetAppName: 'sample-app'
    }, workspaceRoot)

    assert.strictEqual(result.status, 0, result.stderr)

    const payload = JSON.parse(result.stdout)
    assert.strictEqual(payload.ok, false)
    assert.match(payload.error, /runtimeCode/)
    assert.match(payload.comparisonSkippedReason, /Runtime code is required/)
  })

  await withTempWorkspace(async (workspaceRoot) => {
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'actual-app' }, null, 2))
    fs.mkdirSync(path.join(workspaceRoot, 'src'))
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.js'), 'module.exports = 1\n')

    const result = await runScriptWithInput({
      workspaceRoot,
      targetAppName: 'other-app',
      runtimePath: '/usr/src/app/src/index.js',
      runtimeCode: 'module.exports = 1',
      startLine: 1,
      endLine: 1
    }, workspaceRoot)

    assert.strictEqual(result.status, 0, result.stderr)

    const payload = JSON.parse(result.stdout)
    assert.strictEqual(payload.ok, true)
    assert.strictEqual(payload.workspaceMatchesTargetApp, false)
    assert.match(payload.comparisonSkippedReason, /Workspace does not match profiled app/)
    assert.strictEqual(payload.resolvedWorkspacePath, null)
  })

  await withTempWorkspace(async (workspaceRoot) => {
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'my-app' }, null, 2))
    fs.mkdirSync(path.join(workspaceRoot, 'src'))
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.js'), [
      'function hotPath () {',
      '  return 2',
      '}'
    ].join('\n'))

    const result = await runScriptWithInput({
      workspaceRoot,
      targetAppName: 'my-app',
      runtimePath: '/usr/src/app/src/index.js',
      runtimeCode: [
        'function hotPath () {',
        '  return 1',
        '}'
      ].join('\n'),
      startLine: 1,
      endLine: 3
    }, workspaceRoot)

    assert.strictEqual(result.status, 0, result.stderr)

    const payload = JSON.parse(result.stdout)
    assert.strictEqual(payload.ok, true)
    assert.strictEqual(payload.workspaceMatchesTargetApp, true)
    assert.strictEqual(payload.resolvedWorkspacePath, 'src/index.js')
    assert.strictEqual(payload.pathMappingStrategy, 'runtimePath:usr/src/app/')
    assert.strictEqual(payload.comparisonMode, 'lineRange')
    assert.strictEqual(payload.inSync, false)
    assert.match(payload.diff, /-  return 1/)
    assert.match(payload.diff, /\+  return 2/)
  })
})
