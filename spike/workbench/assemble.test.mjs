import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { assemble, hashTree } from './assemble.mjs'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-workbench-'))
  const plugin = path.join(root, 'plugin-a')
  await mkdir(path.join(plugin, 'lib'), { recursive: true })
  await writeFile(
    path.join(plugin, 'package.json'),
    '{"name":"plugin-a","version":"1.0.0","exports":{".":"./lib/index.js"},"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}\n',
  )
  await writeFile(path.join(plugin, 'cordis.patch.yml'), '- insert: []\n')
  await writeFile(path.join(plugin, 'lib/index.js'), 'export function apply() {}\n')
  await writeFile(path.join(plugin, 'ignored.txt'), 'must not ship\n')
  await writeFile(path.join(root, 'LICENSE'), 'MIT\n')

  const source = {
    schemaVersion: 1,
    components: [
      {
        id: 'plugin-a',
        displayName: 'Plugin A',
        description: 'Fixture plugin',
        package: 'plugin-a',
        version: '1.0.0',
        source: 'workspace:plugin-a',
        sourcePath: 'plugin-a',
        include: ['package.json', 'cordis.patch.yml', 'lib'],
        license: 'MIT',
        noticeSource: 'LICENSE',
        profiles: ['web'],
        bundleEntrypoints: ['plugin-a'],
        defaultEnabled: true,
        required: false,
        safeMode: false,
        conflictGroups: [],
        permissions: ['workspace-read'],
      },
    ],
  }
  const sourceFile = path.join(root, 'workbench.source.json')
  await writeFile(sourceFile, JSON.stringify(source))
  return { root, plugin, sourceFile, outputDir: path.join(root, 'dist') }
}

test('copies only allowlisted runtime files and writes matching digest', async () => {
  const f = await fixture()
  const lock = await assemble(f)
  assert.equal(
    lock.components[0].artifactSha256,
    await hashTree(path.join(f.outputDir, 'plugins/plugin-a')),
  )
  await assert.rejects(readFile(path.join(f.outputDir, 'plugins/plugin-a/ignored.txt')))
  assert.equal(await readFile(path.join(f.outputDir, 'notices/plugin-a.txt'), 'utf8'), 'MIT\n')
})

test('same tree produces the same lock generation', async () => {
  const f = await fixture()
  assert.deepEqual(await assemble(f), await assemble(f))
})

test('hashTree rejects symlinks', async () => {
  const f = await fixture()
  await symlink(path.join(f.root, 'LICENSE'), path.join(f.plugin, 'lib/escape'))
  await assert.rejects(hashTree(f.plugin), /symlink_not_allowed/)
})

test('missing provenance fails assembly', async () => {
  const f = await fixture()
  const source = JSON.parse(await readFile(f.sourceFile, 'utf8'))
  delete source.components[0].license
  await writeFile(f.sourceFile, JSON.stringify(source))
  await assert.rejects(assemble(f), /invalid_component/)
})
