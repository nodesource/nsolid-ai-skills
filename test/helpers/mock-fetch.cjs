'use strict'

const fs = require('node:fs')

function readConfig () {
  const configPath = process.env.NSOLID_FETCH_MOCK_FILE
  if (!configPath) {
    return null
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

function normalizeHeaders (headers) {
  if (!headers) {
    return {}
  }

  if (typeof headers.entries === 'function') {
    return Object.fromEntries(Array.from(headers.entries(), ([key, value]) => [String(key).toLowerCase(), String(value)]))
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)])
  )
}

function recordRequest (request) {
  const requestsPath = process.env.NSOLID_FETCH_REQUESTS_FILE
  if (!requestsPath) {
    return
  }

  fs.appendFileSync(requestsPath, `${JSON.stringify(request)}\n`, 'utf-8')
}

const config = readConfig()
if (config) {
  global.fetch = async function fetchMock (url, options = {}) {
    const href = String(url)
    recordRequest({
      url: href,
      method: options.method || 'GET',
      headers: normalizeHeaders(options.headers)
    })

    const route = config.routes[href] || config.routes['*']
    if (!route) {
      throw new Error(`No mocked response configured for ${href}`)
    }

    if (route.error) {
      throw new Error(route.error)
    }

    const body = route.body == null ? '' : String(route.body)
    const status = route.status == null ? 200 : route.status
    const statusText = route.statusText || ''

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      async text () {
        return body
      },
      async json () {
        return JSON.parse(body)
      }
    }
  }
}
