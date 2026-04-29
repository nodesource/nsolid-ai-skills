'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SCRIPT = path.join(ROOT, 'audit-dependencies', 'collect-dependencies.cjs')
const CAPTURE_RUNNER = path.join(__dirname, 'helpers', 'capture-cli-runner.cjs')

async function withTempProject (fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-deps-'))
  try {
    return await fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function runCollectDependencies (dir) {
  const outputPath = path.join(dir, 'collect-dependencies-output.json')
  const result = spawnSync(process.execPath, [CAPTURE_RUNNER, SCRIPT, outputPath, '--dir', dir], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 10_000
  })

  assert.strictEqual(result.status, 0, result.stderr)

  const captured = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
  assert.strictEqual(captured.status, 0, captured.stderr)
  return JSON.parse(captured.stdout)
}

test('collect-dependencies covers npm, yarn, pnpm, and package.json fallback scenarios', async () => {
  await withTempProject(async (dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'npm-project',
      dependencies: {
        express: '^4.21.0',
        '@scope/pkg': '^2.0.0'
      }
    }, null, 2))
    fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({
      name: 'npm-project',
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': { version: '4.21.2' },
        'node_modules/express/node_modules/debug': { version: '4.3.7' },
        'node_modules/@scope/pkg': { version: '2.4.0' }
      }
    }, null, 2))

    const output = await runCollectDependencies(dir)
    const deps = output.batches.flat()

    assert.strictEqual(output.packageManager, 'npm')
    assert.strictEqual(output.direct, 2)
    assert.strictEqual(output.transitive, 1)
    assert.deepStrictEqual(
      deps.map(dep => `${dep.name}@${dep.version}:${dep.isDirect}`).sort(),
      [
        '@scope/pkg@2.4.0:true',
        'debug@4.3.7:false',
        'express@4.21.2:true'
      ]
    )
  })

  await withTempProject(async (dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'yarn-project',
      dependencies: {
        'left-pad': '^1.3.0'
      },
      devDependencies: {
        chalk: '^5.0.0'
      }
    }, null, 2))
    fs.writeFileSync(path.join(dir, 'yarn.lock'), [
      'left-pad@^1.3.0:',
      '  version "1.3.0"',
      '',
      'chalk@^5.0.0, chalk@^5.1.0:',
      '  version "5.2.0"',
      '',
      'ansi-styles@^6.0.0:',
      '  version "6.2.1"',
      ''
    ].join('\n'))

    const output = await runCollectDependencies(dir)
    const deps = output.batches.flat()

    assert.strictEqual(output.packageManager, 'yarn')
    assert.strictEqual(output.direct, 2)
    assert.strictEqual(output.transitive, 1)
    assert.deepStrictEqual(
      deps.map(dep => `${dep.name}@${dep.version}:${dep.isDirect}`).sort(),
      [
        'ansi-styles@6.2.1:false',
        'chalk@5.2.0:true',
        'left-pad@1.3.0:true'
      ]
    )
  })

  await withTempProject(async (dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'pnpm-project',
      dependencies: {
        'left-pad': '^1.3.0',
        '@scope/pkg': '^2.0.0'
      }
    }, null, 2))
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), [
      'lockfileVersion: "9.0"',
      'packages:',
      '  left-pad@1.3.0:',
      '    resolution: {integrity: sha512-a}',
      '  chalk@5.2.0:',
      '    resolution: {integrity: sha512-b}',
      '  "@scope/pkg@2.0.0":',
      '    resolution: {integrity: sha512-c}',
      ''
    ].join('\n'))

    const output = await runCollectDependencies(dir)
    const deps = output.batches.flat()

    assert.strictEqual(output.packageManager, 'pnpm')
    assert.strictEqual(output.direct, 2)
    assert.strictEqual(output.transitive, 1)
    assert.deepStrictEqual(
      deps.map(dep => `${dep.name}@${dep.version}:${dep.isDirect}`).sort(),
      [
        '@scope/pkg@2.0.0:true',
        'chalk@5.2.0:false',
        'left-pad@1.3.0:true'
      ]
    )
  })

  await withTempProject(async (dir) => {
    const dependencies = {}
    for (let index = 0; index < 101; index++) {
      dependencies[`pkg-${index}`] = '^1.0.0'
    }

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'fallback-project',
      dependencies
    }, null, 2))

    const output = await runCollectDependencies(dir)

    assert.strictEqual(output.packageManager, 'npm')
    assert.strictEqual(output.direct, 101)
    assert.strictEqual(output.transitive, 0)
    assert.strictEqual(output.batches.length, 2)
    assert.strictEqual(output.batches[0].length, 100)
    assert.strictEqual(output.batches[1].length, 1)
    assert.strictEqual(output.batches[0][0].version, '1.0.0')
  })
})
