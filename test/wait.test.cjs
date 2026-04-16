'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const WAIT_SCRIPTS = [
  path.join(ROOT, 'advanced-memory-leak-hunter', 'wait.js'),
  path.join(ROOT, 'analyze-cpu', 'wait.js'),
  path.join(ROOT, 'analyze-memory', 'wait.js'),
  path.join(ROOT, 'benchmark-run', 'wait.js'),
  path.join(ROOT, 'benchmark-validate', 'wait.js')
]

function run (script, args, timeout = 5_000) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf-8',
    timeout
  })
}

for (const script of WAIT_SCRIPTS) {
  const scriptLabel = path.relative(ROOT, script)

  test(`${scriptLabel} exits with usage when the duration is missing`, () => {
    const result = run(script, [])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Usage: node wait\.js <seconds>/)
  })

  test(`${scriptLabel} exits with usage when the duration is invalid`, () => {
    const result = run(script, ['0'])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Usage: node wait\.js <seconds>/)
  })

  test(`${scriptLabel} accepts a positive fractional duration`, () => {
    const result = run(script, ['0.05'], 2_000)
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
    assert.strictEqual(result.stderr, '')
  })
}