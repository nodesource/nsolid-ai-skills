'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { runCliScript } = require('./helpers/run-cli.cjs')

const ROOT = path.resolve(__dirname, '..')
const SCRIPT = path.join(ROOT, 'node-upgrade', 'fetch-node-releases.cjs')

function outputOf (result) {
  return `${result.stdout}${result.stderr}`
}

test('fetch-node-releases prints a markdown table for live data, sorted by major and filtered to non-EOL lines', { concurrency: false }, async () => {
  const result = await runCliScript(SCRIPT, {
    fetch: async () => ({
      ok: true,
      status: 200,
      async json () {
        return [
          { cycle: '20', lts: 'Iron', eol: '2027-04-30', support: '2024-10-22', latest: '20.19.1' },
          { cycle: '18', lts: 'Hydrogen', eol: '2025-04-30', support: '2023-10-18', latest: '18.20.7' },
          { cycle: '24', lts: false, eol: '2028-04-30', support: '2025-10-28', latest: '24.2.0' }
        ]
      }
    })
  })

  assert.strictEqual(result.status, 0, outputOf(result))

  const lines = result.stdout.trim().split('\n')
  assert.deepStrictEqual(lines.slice(0, 2), [
    '| Major | Status | Latest | Active Support End | EOL |',
    '|-------|--------|--------|--------------------|-----|'
  ])
  assert.ok(lines[2].startsWith('| 24 | Current | 24.2.0 |'))
  assert.ok(lines[3].startsWith('| 20 | LTS (Iron) | 20.19.1 |'))
  assert.ok(!result.stdout.includes('| 18 |'))
})

test('fetch-node-releases falls back to the embedded schedule when live fetch fails', { concurrency: false }, async () => {
  const result = await runCliScript(SCRIPT, {
    fetch: async () => {
      throw new Error('network unavailable')
    }
  })

  assert.strictEqual(result.status, 0, outputOf(result))
  assert.match(outputOf(result), /using embedded fallback/i)
  assert.match(result.stdout, /\| 24 \| Current \|/)
  assert.match(result.stdout, /\| 22 \| LTS \(Jod\) \|/)
})
