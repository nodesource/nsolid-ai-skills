'use strict'

class ExitSignal extends Error {
  constructor (code) {
    super(`Process exited with code ${code}`)
    this.code = code
  }
}

async function runCliScript (scriptPath, options = {}) {
  const args = options.args || []
  const cwd = options.cwd
  const env = options.env || {}
  const fetchImpl = options.fetch

  const originalArgv = process.argv
  const originalCwd = process.cwd
  const originalExit = process.exit
  const originalStdoutWrite = process.stdout.write
  const originalStderrWrite = process.stderr.write
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  let stdout = ''
  let stderr = ''
  let status = 0

  process.argv = [process.execPath, scriptPath, ...args]
  process.cwd = () => cwd || originalCwd()
  process.exit = (code = 0) => {
    throw new ExitSignal(code)
  }
  process.stdout.write = function writeStdout (chunk, encoding, callback) {
    stdout += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
    if (typeof encoding === 'function') encoding()
    if (typeof callback === 'function') callback()
    return true
  }
  process.stderr.write = function writeStderr (chunk, encoding, callback) {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
    if (typeof encoding === 'function') encoding()
    if (typeof callback === 'function') callback()
    return true
  }

  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv, env)

  if (fetchImpl !== undefined) {
    global.fetch = fetchImpl
  }

  delete require.cache[require.resolve(scriptPath)]

  try {
    require(scriptPath)
  } catch (error) {
    if (error instanceof ExitSignal) {
      status = error.code
    } else {
      throw error
    }
  }

  await Promise.resolve()
  await new Promise(resolve => setImmediate(resolve))

  process.argv = originalArgv
  process.cwd = originalCwd
  process.exit = originalExit
  process.stdout.write = originalStdoutWrite
  process.stderr.write = originalStderrWrite

  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)

  if (fetchImpl !== undefined) {
    global.fetch = originalFetch
  }

  delete require.cache[require.resolve(scriptPath)]

  return { status, stdout, stderr }
}

module.exports = {
  runCliScript
}
