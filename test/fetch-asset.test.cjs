'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync, spawn } = require('node:child_process')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const SCRIPT = path.resolve(__dirname, '..', 'fetch-asset.cjs')
const ROOT = path.resolve(__dirname, '..')
const ASSETS_DIR = path.join(ROOT, '.nsolid', 'assets')
const VSCODE_DIR = path.join(ROOT, '.vscode')
const SETTINGS_PATH = path.join(VSCODE_DIR, 'settings.json')

function run (args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf-8',
    timeout: 15_000
  })
}

// spawnSync blocks the Node.js event loop, which prevents an in-process HTTP
// server from responding. Use runAsync (spawn-based) for tests that need one.
function runAsync (args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], opts)
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('child process timed out'))
    }, 15_000)

    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ status: code, stdout, stderr })
    })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

// Temporarily write a settings.json, run fn, then restore original state.
async function withSettings (content, fn) {
  const existed = fs.existsSync(SETTINGS_PATH)
  const original = existed ? fs.readFileSync(SETTINGS_PATH, 'utf-8') : null
  fs.mkdirSync(VSCODE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, typeof content === 'string' ? content : JSON.stringify(content))
  try {
    return await fn()
  } finally {
    if (original !== null) {
      fs.writeFileSync(SETTINGS_PATH, original)
    } else {
      fs.rmSync(SETTINGS_PATH)
    }
  }
}

function readAssetIndex () {
  const indexPath = path.join(ASSETS_DIR, 'index.json')
  if (!fs.existsSync(indexPath)) {
    return []
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

async function withCleanAssets (fn) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })

  const beforeEntries = new Set(fs.readdirSync(ASSETS_DIR))
  const beforeIndexExisted = beforeEntries.has('index.json')
  const beforeIndex = beforeIndexExisted ? readAssetIndex() : null

  try {
    return await fn()
  } finally {
    for (const entry of fs.readdirSync(ASSETS_DIR)) {
      if (!beforeEntries.has(entry)) {
        fs.rmSync(path.join(ASSETS_DIR, entry), { recursive: true, force: true })
      }
    }

    const indexPath = path.join(ASSETS_DIR, 'index.json')
    if (beforeIndexExisted) {
      fs.writeFileSync(indexPath, JSON.stringify(beforeIndex, null, 2))
    } else if (fs.existsSync(indexPath)) {
      fs.rmSync(indexPath)
    }
  }
}

// Temporarily remove settings.json, run fn, then restore.
async function withoutSettings (fn) {
  const existed = fs.existsSync(SETTINGS_PATH)
  const original = existed ? fs.readFileSync(SETTINGS_PATH, 'utf-8') : null
  if (existed) fs.rmSync(SETTINGS_PATH)
  try {
    return await fn()
  } finally {
    if (original !== null) {
      fs.mkdirSync(VSCODE_DIR, { recursive: true })
      fs.writeFileSync(SETTINGS_PATH, original)
    }
  }
}

// Start an HTTP server, resolve with { server, port }, and let fn use it.
async function withServer (handler, fn) {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    return await fn(port)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('exits with usage message when no arguments provided', () => {
  const result = run([])
  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Usage:/)
})

test('exits with error for unknown asset type', () => {
  const result = run(['some-asset-id', 'badtype'])
  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Unknown asset type/)
})

test('exits with error when .vscode/settings.json is missing', async () => {
  await withoutSettings(() => {
    const result = run(['some-asset-id', 'cpuprofile'])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Cannot find .vscode\/settings\.json/)
  })
})

test('exits with error when nsolid.apiBaseUrl is missing from settings', async () => {
  await withSettings({ 'nsolid.authToken': 'token' }, () => {
    const result = run(['some-asset-id', 'cpuprofile'])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Missing "nsolid\.consoleUrl" or legacy "nsolid\.apiBaseUrl"/)
  })
})

test('exits with error when nsolid.authToken is missing from settings', async () => {
  await withSettings({ 'nsolid.apiBaseUrl': 'http://localhost:9000' }, () => {
    const result = run(['some-asset-id', 'cpuprofile'])
    assert.strictEqual(result.status, 1)
    assert.match(result.stderr, /Missing "nsolid\.serviceToken" or legacy "nsolid\.authToken"/)
  })
})

test('accepts modern settings keys and JSONC formatting', async () => {
  const assetId = 'test-settings-modern'
  const assetContent = '{"type":"cpuprofile","nodes":[]}'

  await withCleanAssets(async () => {
    await withServer(
      (req, res) => {
        if (req.url === `/api/v3/asset/${assetId}`) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(assetContent)
          return
        }

        res.writeHead(404)
        res.end()
      },
      async (port) => {
        await withSettings(`{
  // Preferred keys
  "nsolid.consoleUrl": "http://127.0.0.1:${port}",
  "nsolid.serviceToken": "test-token",
}`,
        async () => {
          const result = await runAsync([assetId, 'cpuprofile', 'modern/a'])
          assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
          assert.match(result.stdout, /Asset saved to:/)

          const entry = readAssetIndex().find(record => record.assetId === assetId)
          assert.ok(entry)
          assert.strictEqual(entry.app, 'modern/a')
          assert.strictEqual(entry.localPath, 'cpuprofile-modern_a-test-set.cpuprofile')
        })
      }
    )
  })
})

test('downloads asset and saves to flat asset path with index metadata', async () => {
  const ASSET_ID = 'test-asset-abc123'
  const ASSET_CONTENT = '{"type":"cpuprofile","nodes":[]}'
  const savedPath = path.join(ASSETS_DIR, 'cpuprofile-myapp-test-ass.cpuprofile')

  await withCleanAssets(async () => {
    await withServer(
      (req, res) => {
        if (req.url === `/api/v3/asset/${ASSET_ID}`) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(ASSET_CONTENT)
        } else {
          res.writeHead(404)
          res.end()
        }
      },
      async (port) => {
        await withSettings(
          { 'nsolid.apiBaseUrl': `http://127.0.0.1:${port}`, 'nsolid.authToken': 'test-token' },
          async () => {
            const result = await runAsync([ASSET_ID, 'cpuprofile', 'myapp'])
            assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
            assert.match(result.stdout, /Asset saved to:/)

            assert.ok(fs.existsSync(savedPath), `Expected file not found: ${savedPath}`)
            assert.strictEqual(fs.readFileSync(savedPath, 'utf-8'), ASSET_CONTENT)

            const entry = readAssetIndex().find(record => record.assetId === ASSET_ID)
            assert.ok(entry)
            assert.strictEqual(entry.name, 'cpuprofile-myapp-test-ass')
            assert.strictEqual(entry.type, 'cpu-profile')
            assert.strictEqual(entry.app, 'myapp')
            assert.strictEqual(entry.localPath, 'cpuprofile-myapp-test-ass.cpuprofile')
            assert.strictEqual(entry.fileSize, Buffer.byteLength(ASSET_CONTENT))
            assert.match(entry.downloadedAt, /^\d{4}-\d{2}-\d{2}T/)
          }
        )
      }
    )
  })
})

test('uses "unknown" as default app name when omitted', async () => {
  const ASSET_ID = 'test-asset-default'
  const ASSET_CONTENT = '{}'
  const savedPath = path.join(ASSETS_DIR, 'heapprofile-unknown-test-ass.heapprofile')

  await withCleanAssets(async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200)
        res.end(ASSET_CONTENT)
      },
      async (port) => {
        await withSettings(
          { 'nsolid.apiBaseUrl': `http://127.0.0.1:${port}`, 'nsolid.authToken': 'test-token' },
          async () => {
            const result = await runAsync([ASSET_ID, 'heapprofile'])
            assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)

            assert.ok(fs.existsSync(savedPath))

            const entry = readAssetIndex().find(record => record.assetId === ASSET_ID)
            assert.ok(entry)
            assert.strictEqual(entry.app, 'unknown')
            assert.strictEqual(entry.localPath, 'heapprofile-unknown-test-ass.heapprofile')
          }
        )
      }
    )
  })
})

test('migrates a legacy nested asset into the flat layout', async () => {
  const assetId = 'legacy-asset-123456'
  const legacyDir = path.join(ASSETS_DIR, 'legacyapp')
  const legacyPath = path.join(legacyDir, `${assetId}.cpuprofile`)
  const flatPath = path.join(ASSETS_DIR, 'cpuprofile-legacyapp-legacy-a.cpuprofile')

  await withCleanAssets(async () => {
    fs.mkdirSync(legacyDir, { recursive: true })
    fs.writeFileSync(legacyPath, '{"legacy":true}')

    await withSettings(
      { 'nsolid.apiBaseUrl': 'http://127.0.0.1:65535', 'nsolid.authToken': 'unused-token' },
      async () => {
        const result = await runAsync([assetId, 'cpuprofile', 'legacyapp'])
        assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`)
        assert.match(result.stdout, /Asset already existed and was moved to:/)

        assert.ok(fs.existsSync(flatPath))
        assert.ok(!fs.existsSync(legacyPath))
        assert.ok(!fs.existsSync(legacyDir))

        const entry = readAssetIndex().find(record => record.assetId === assetId)
        assert.ok(entry)
        assert.strictEqual(entry.localPath, 'cpuprofile-legacyapp-legacy-a.cpuprofile')
      }
    )
  })
})

test('exits with error when console returns non-200 status', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(401)
      res.end('Unauthorized')
    },
    async (port) => {
      await withSettings(
        { 'nsolid.apiBaseUrl': `http://127.0.0.1:${port}`, 'nsolid.authToken': 'bad-token' },
        async () => {
          const result = await runAsync(['some-asset-id', 'heapsnapshot'])
          assert.strictEqual(result.status, 1)
          assert.match(result.stderr, /Console returned 401/)
        }
      )
    }
  )
})
