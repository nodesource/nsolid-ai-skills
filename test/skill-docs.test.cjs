'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SKILL_DIRS = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(ROOT, entry.name, 'SKILL.md')))
  .map(entry => entry.name)
  .sort()

function readSkill (dirName) {
  return fs.readFileSync(path.join(ROOT, dirName, 'SKILL.md'), 'utf-8')
}

function parseFrontMatter (content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(match, 'Missing front matter block')
  return match[1]
}

test('every SKILL.md has front matter with a matching name and a description', () => {
  for (const dirName of SKILL_DIRS) {
    const frontMatter = parseFrontMatter(readSkill(dirName))
    const nameMatch = frontMatter.match(/^name:\s+(.+)$/m)

    assert.ok(nameMatch, `${dirName}/SKILL.md is missing "name"`)
    assert.strictEqual(nameMatch[1].trim(), dirName, `${dirName}/SKILL.md name does not match directory`)
    assert.match(frontMatter, /^description:\s+/m, `${dirName}/SKILL.md is missing "description"`)
  }
})

test('same-directory helper commands in SKILL.md files point to real files', () => {
  const commandPattern = /node "<skill-dir>\/([^"\n]+)"/g

  for (const dirName of SKILL_DIRS) {
    const content = readSkill(dirName)
    const skillDir = path.join(ROOT, dirName)

    for (const match of content.matchAll(commandPattern)) {
      const relativeHelper = match[1]
      if (relativeHelper.includes('..')) {
        continue
      }

      const helperPath = path.join(skillDir, relativeHelper)
      assert.ok(fs.existsSync(helperPath), `${dirName}/SKILL.md references missing helper ${relativeHelper}`)
    }
  }
})
