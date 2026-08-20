import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const presetsRoot = join(root, 'presets')
const expectedIds = [
  'preset-cloud-ascent',
  'preset-gothic-void-crusade',
  'preset-inspiration-universe',
  'preset-milky-way',
  'preset-sunrise-coast',
  'preset-sunset-voyage',
]

const audit = JSON.parse(await readFile(join(root, 'asset-audit.json'), 'utf8'))
const notice = await readFile(join(root, 'NOTICE.md'), 'utf8')
const directories = (await readdir(presetsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

assert(JSON.stringify(directories) === JSON.stringify(expectedIds), '必须且只能包含六套固定预设')
assert(audit.schemaVersion === 1 && audit.presets.length === 6, 'asset-audit.json 无效')

for (const id of expectedIds) {
  const dir = join(presetsRoot, id)
  const manifest = JSON.parse(await readFile(join(dir, 'theme.json'), 'utf8'))
  const background = await readFile(join(dir, 'background.webp'))
  const thumbnail = await readFile(join(dir, 'thumbnail.webp'))
  const license = await readFile(join(dir, 'LICENSE.txt'), 'utf8')
  const record = audit.presets.find((candidate) => candidate.id === id)

  assert(record !== undefined, `${id} 缺少审计记录`)
  assert(manifest.schemaVersion === 1 && manifest.id === id, `${id} 清单标识无效`)
  assert(manifest.image === 'background.webp', `${id} 图片文件名无效`)
  assert(['auto', 'light', 'dark'].includes(manifest.appearance), `${id} 外观无效`)
  assert(/^#[0-9a-fA-F]{6}$/.test(manifest.colors?.accent ?? ''), `${id} 强调色无效`)
  assert(inRange(manifest.art?.focusX, 0, 1) && inRange(manifest.art?.focusY, 0, 1), `${id} 焦点无效`)
  assert(inRange(manifest.effects?.brightness, 0.35, 1.2), `${id} 亮度无效`)
  assert(inRange(manifest.effects?.panelOpacity, 0.4, 0.96), `${id} 面板透明度无效`)
  assert(Number.isInteger(manifest.effects?.blur) && inRange(manifest.effects.blur, 0, 32), `${id} 模糊无效`)
  assert(manifest.attribution?.author === record.author, `${id} 作者不一致`)
  assert(manifest.attribution?.license === record.license, `${id} 许可不一致`)
  assert(['MIT', 'CC BY 4.0'].includes(record.license), `${id} 许可不在白名单`)
  assert(isWebP(background) && isWebP(thumbnail), `${id} 资源不是 WebP`)

  const backgroundHash = sha256(background)
  const thumbnailHash = sha256(thumbnail)
  assert(backgroundHash === record.normalizedSha256, `${id} 背景哈希与审计记录不一致`)
  assert(backgroundHash === manifest.attribution.checksum, `${id} 清单哈希不一致`)
  assert(thumbnailHash === record.thumbnailSha256, `${id} 缩略图哈希不一致`)
  const licenseMarker = record.license === 'MIT'
    ? 'MIT License'
    : 'Creative Commons Attribution 4.0 International'
  assert(license.includes(licenseMarker) && license.includes(record.author), `${id} LICENSE 不完整`)
  assert(notice.includes(id.replace('preset-', '').replaceAll('-', ' ')) || notice.includes(manifest.name), `${id} NOTICE 缺少主题名`)
  assert(notice.includes(record.author) && notice.includes(record.normalizedSha256), `${id} NOTICE 归属不完整`)
}

console.log(`Verified ${expectedIds.length} bundled themes with checksums and attribution.`)

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isWebP(bytes) {
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
}

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
