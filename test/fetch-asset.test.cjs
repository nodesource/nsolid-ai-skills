'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const FETCH_ASSET_SCRIPTS = [
  path.resolve(__dirname, '..', 'analyze-cpu', 'fetch-asset.cjs'),
  path.resolve(__dirname, '..', 'analyze-memory', 'fetch-asset.cjs')
]
const ROOT = path.resolve(__dirname, '..')
const ASSETS_DIR = path.join(ROOT, '.nsolid', 'assets')
const VSCODE_DIR = path.join(ROOT, '.vscode')
const SETTINGS_PATH = path.join(VSCODE_DIR, 'settings.json')
const FETCH_PRELOAD = path.join(__dirname, 'helpers', 'mock-fetch.cjs')

function appendNodeOption (existing, option) {
  return existing ? `${existing} ${option}` : option
}

function createFetchMock (routes) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-asset-mock-'))
  const configPath = path.join(tempDir, 'config.json')
  const requestsPath = path.join(tempDir, 'requests.ndjson')

  fs.writeFileSync(configPath, JSON.stringify({ routes }, null, 2))

  return {
    env: {
      NSOLID_FETCH_MOCK_FILE: configPath,
      NSOLID_FETCH_REQUESTS_FILE: requestsPath,
      NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, `--require=${FETCH_PRELOAD}`)
    },
    readRequests () {
      if (!fs.existsSync(requestsPath)) {
        return []
      }

      return fs.readFileSync(requestsPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
    },
    cleanup () {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

function run (script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf-8',
    timeout: 15_000
  })
}

function outputOf (result) {
  return `${result.stdout}${result.stderr}`
}

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
    } else if (fs.existsSync(SETTINGS_PATH)) {
      fs.rmSync(SETTINGS_PATH)
    }
  }
}

function readAssetIndex (assetsDir = ASSETS_DIR) {
  const indexPath = path.join(assetsDir, 'index.json')
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

async function withoutSettings (fn) {
  const existed = fs.existsSync(SETTINGS_PATH)
  const original = existed ? fs.readFileSync(SETTINGS_PATH, 'utf-8') : null
  if (existed) {
    fs.rmSync(SETTINGS_PATH)
  }

  try {
    return await fn()
  } finally {
    if (original !== null) {
      fs.mkdirSync(VSCODE_DIR, { recursive: true })
      fs.writeFileSync(SETTINGS_PATH, original)
    }
  }
}

for (const SCRIPT of FETCH_ASSET_SCRIPTS) {
  const scriptName = path.basename(path.dirname(SCRIPT)) + '/' + path.basename(SCRIPT)

  test(`${scriptName} exits with usage message when no arguments provided`, () => {
    const result = run(SCRIPT, [])
    assert.strictEqual(result.status, 1)
  })

  test(`${scriptName} exits with error for unknown asset type`, () => {
    const result = run(SCRIPT, ['some-asset-id', 'badtype'])
    assert.strictEqual(result.status, 1)
  })

  test(`${scriptName} exits with error when .vscode/settings.json is missing`, async () => {
    await withoutSettings(() => {
      const result = run(SCRIPT, ['some-asset-id', 'cpuprofile'])
      assert.strictEqual(result.status, 1)
    })
  })

  test(`${scriptName} exits with error when nsolid.apiBaseUrl is missing from settings`, async () => {
    await withSettings({ 'nsolid.authToken': 'token' }, () => {
      const result = run(SCRIPT, ['some-asset-id', 'cpuprofile'])
      assert.strictEqual(result.status, 1)
    })
  })

  test(`${scriptName} exits with error when nsolid.authToken is missing from settings`, async () => {
    await withSettings({ 'nsolid.apiBaseUrl': 'http://localhost:9000' }, () => {
      const result = run(SCRIPT, ['some-asset-id', 'cpuprofile'])
      assert.strictEqual(result.status, 1)
    })
  })

  test(`${scriptName} accepts modern settings keys and JSONC formatting`, async () => {
    const assetId = 'test-settings-modern'
    const assetContent = '{"type":"cpuprofile","nodes":[]}'
    const mock = createFetchMock({
      [`http://127.0.0.1:9911/api/v3/asset/${assetId}`]: {
        status: 200,
        statusText: 'OK',
        body: assetContent
      }
    })

    try {
      await withCleanAssets(async () => {
        await withSettings(`{
  // Preferred keys
  "nsolid.consoleUrl": "http://127.0.0.1:9911",
  "nsolid.serviceToken": "test-token",
}`,
        async () => {
          const result = run(SCRIPT, [assetId, 'cpuprofile', 'modern/a'], { env: mock.env })
          assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

          const requests = mock.readRequests()
          assert.strictEqual(requests.length, 1)
          assert.strictEqual(requests[0].url, `http://127.0.0.1:9911/api/v3/asset/${assetId}`)
          assert.strictEqual(requests[0].headers['x-nsolid-service-token'], 'test-token')

          const entry = readAssetIndex().find(record => record.assetId === assetId)
          assert.ok(entry)
          assert.strictEqual(entry.app, 'modern/a')
          assert.strictEqual(entry.localPath, 'cpuprofile-modern_a-test-set.cpuprofile')
        })
      })
    } finally {
      mock.cleanup()
    }
  })

  test(`${scriptName} downloads asset and saves to flat asset path with index metadata`, async () => {
    const assetId = 'test-asset-abc123'
    const assetContent = '{"type":"cpuprofile","nodes":[]}'
    const savedPath = path.join(ASSETS_DIR, 'cpuprofile-myapp-test-ass.cpuprofile')
    const mock = createFetchMock({
      [`http://127.0.0.1:9912/api/v3/asset/${assetId}`]: {
        status: 200,
        statusText: 'OK',
        body: assetContent
      }
    })

    try {
      await withCleanAssets(async () => {
        await withSettings(
          { 'nsolid.apiBaseUrl': 'http://127.0.0.1:9912', 'nsolid.authToken': 'test-token' },
          async () => {
            const result = run(SCRIPT, [assetId, 'cpuprofile', 'myapp'], { env: mock.env })
            assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

            assert.ok(fs.existsSync(savedPath), `Expected file not found: ${savedPath}`)
            assert.strictEqual(fs.readFileSync(savedPath, 'utf-8'), assetContent)

            const entry = readAssetIndex().find(record => record.assetId === assetId)
            assert.ok(entry)
            assert.strictEqual(entry.name, 'cpuprofile-myapp-test-ass')
            assert.strictEqual(entry.type, 'cpu-profile')
            assert.strictEqual(entry.app, 'myapp')
            assert.strictEqual(entry.localPath, 'cpuprofile-myapp-test-ass.cpuprofile')
            assert.strictEqual(entry.fileSize, Buffer.byteLength(assetContent))
            assert.match(entry.downloadedAt, /^\d{4}-\d{2}-\d{2}T/)
          }
        )
      })
    } finally {
      mock.cleanup()
    }
  })

  test(`${scriptName} uses "unknown" as default app name when omitted`, async () => {
    const assetId = 'test-asset-default'
    const assetContent = '{}'
    const savedPath = path.join(ASSETS_DIR, 'heapprofile-unknown-test-ass.heapprofile')
    const mock = createFetchMock({
      [`http://127.0.0.1:9913/api/v3/asset/${assetId}`]: {
        status: 200,
        statusText: 'OK',
        body: assetContent
      }
    })

    try {
      await withCleanAssets(async () => {
        await withSettings(
          { 'nsolid.apiBaseUrl': 'http://127.0.0.1:9913', 'nsolid.authToken': 'test-token' },
          async () => {
            const result = run(SCRIPT, [assetId, 'heapprofile'], { env: mock.env })
            assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

            assert.ok(fs.existsSync(savedPath))

            const entry = readAssetIndex().find(record => record.assetId === assetId)
            assert.ok(entry)
            assert.strictEqual(entry.app, 'unknown')
            assert.strictEqual(entry.localPath, 'heapprofile-unknown-test-ass.heapprofile')
          }
        )
      })
    } finally {
      mock.cleanup()
    }
  })

  test(`${scriptName} migrates a legacy nested asset into the flat layout`, async () => {
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
          const result = run(SCRIPT, [assetId, 'cpuprofile', 'legacyapp'])
          assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)

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

  test(`${scriptName} exits with error when console returns non-200 status`, async () => {
    const mock = createFetchMock({
      'http://127.0.0.1:9914/api/v3/asset/some-asset-id': {
        status: 401,
        statusText: 'Unauthorized',
        body: 'Unauthorized'
      }
    })

    try {
      await withSettings(
        { 'nsolid.apiBaseUrl': 'http://127.0.0.1:9914', 'nsolid.authToken': 'bad-token' },
        async () => {
          const result = run(SCRIPT, ['some-asset-id', 'heapsnapshot'], { env: mock.env })
          assert.strictEqual(result.status, 1)
          assert.deepStrictEqual(readAssetIndex().find(record => record.assetId === 'some-asset-id'), undefined)
        }
      )
    } finally {
      mock.cleanup()
    }
  })

  test(`${scriptName} resolves the caller workspace when installed under .agents/skills`, () => {
    const assetId = 'test-installed-asset'
    const assetContent = '{"type":"cpuprofile","nodes":[1]}'
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-asset-installed-'))
    const installedDir = path.join(projectRoot, '.agents', 'skills')
    const installedScript = path.join(installedDir, 'fetch-asset.cjs')
    const settingsDir = path.join(projectRoot, '.vscode')
    const settingsPath = path.join(settingsDir, 'settings.json')
    const assetsDir = path.join(projectRoot, '.nsolid', 'assets')
    const expectedPath = path.join(assetsDir, 'cpuprofile-installed_app-test-ins.cpuprofile')
    const mock = createFetchMock({
      [`http://127.0.0.1:9915/api/v3/asset/${assetId}`]: {
        status: 200,
        statusText: 'OK',
        body: assetContent
      }
    })

    try {
      fs.mkdirSync(installedDir, { recursive: true })
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.copyFileSync(SCRIPT, installedScript)
      fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"consumer-workspace"}\n')
      fs.writeFileSync(settingsPath, JSON.stringify({
        'nsolid.apiBaseUrl': 'http://127.0.0.1:9915',
        'nsolid.authToken': 'test-token'
      }))

      const result = run(installedScript, [assetId, 'cpuprofile', 'installed/app'], {
        cwd: projectRoot,
        env: { ...mock.env, INIT_CWD: projectRoot }
      })
      assert.strictEqual(result.status, 0, `output: ${outputOf(result)}`)
      assert.ok(fs.existsSync(expectedPath), `Expected file not found: ${expectedPath}`)

      const indexPath = path.join(assetsDir, 'index.json')
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
      const entry = index.find(record => record.assetId === assetId)
      assert.ok(entry)
      assert.strictEqual(entry.localPath, 'cpuprofile-installed_app-test-ins.cpuprofile')

      const nestedAssetsDir = path.join(installedDir, '.nsolid', 'assets')
      assert.ok(!fs.existsSync(nestedAssetsDir), `Installed skill dir should not get assets: ${nestedAssetsDir}`)
    } finally {
      mock.cleanup()
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })
}
