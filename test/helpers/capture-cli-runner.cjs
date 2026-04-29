'use strict'

const fs = require('node:fs')

class ExitSignal extends Error {
  constructor (code) {
    super(`Process exited with code ${code}`)
    this.code = code
  }
}

async function main () {
  const [, , scriptPath, outputPath, ...args] = process.argv
  const originalArgv = process.argv
  const originalExit = process.exit
  const originalStdoutWrite = process.stdout.write
  const originalStderrWrite = process.stderr.write

  let stdout = ''
  let stderr = ''
  let status = 0

  process.argv = [process.execPath, scriptPath, ...args]
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

  delete require.cache[require.resolve(scriptPath)]

  try {
    require(scriptPath)
  } catch (error) {
    if (error instanceof ExitSignal) {
      status = error.code
    } else {
      status = 1
      stderr += `${error.stack || error.message}\n`
    }
  }

  await Promise.resolve()
  await new Promise(resolve => setImmediate(resolve))

  process.argv = originalArgv
  process.exit = originalExit
  process.stdout.write = originalStdoutWrite
  process.stderr.write = originalStderrWrite

  fs.writeFileSync(outputPath, JSON.stringify({ status, stdout, stderr }, null, 2))
}

main().catch((error) => {
  const outputPath = process.argv[3]
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify({
      status: 1,
      stdout: '',
      stderr: error.stack || error.message
    }, null, 2))
  }
  process.exitCode = 0
})
