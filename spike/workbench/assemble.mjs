import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`)
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function relativeInside(root, candidate) {
  const relative = path.relative(root, candidate)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('path_escape', candidate)
  }
  return relative
}

async function filesBelow(root, current = root) {
  const files = []
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const absolute = path.join(current, entry.name)
    const metadata = await lstat(absolute)
    if (metadata.isSymbolicLink()) fail('symlink_not_allowed', absolute)
    if (metadata.isDirectory()) files.push(...(await filesBelow(root, absolute)))
    else if (metadata.isFile()) files.push(absolute)
    else fail('unsupported_file', absolute)
  }
  return files.sort((left, right) =>
    compareText(relativeInside(root, left), relativeInside(root, right)),
  )
}

export async function hashTree(root) {
  const hash = createHash('sha256')
  for (const absolute of await filesBelow(root)) {
    const relative = relativeInside(root, absolute).split(path.sep).join('/')
    const bytes = await readFile(absolute)
    hash.update(relative)
    hash.update('\0')
    hash.update(String(bytes.length))
    hash.update('\0')
    hash.update(bytes)
  }
  return `sha256:${hash.digest('hex')}`
}

function validateComponent(component) {
  const requiredStrings = [
    'id',
    'displayName',
    'description',
    'package',
    'version',
    'source',
    'commit',
    'profileRole',
    'sourcePath',
    'license',
    'noticeSource',
  ]
  if (
    requiredStrings.some(
      (key) => typeof component[key] !== 'string' || component[key].trim() === '',
    )
  ) {
    fail('invalid_component', component.id ?? 'unknown')
  }
  if (!Array.isArray(component.include) || component.include.length === 0) {
    fail('invalid_component', component.id)
  }
  if (
    !Array.isArray(component.profiles) ||
    component.profiles.length === 0 ||
    component.profiles.some((profile) => !['web', 'tui', 'catalog'].includes(profile)) ||
    !component.profiles.includes(component.profileRole)
  ) {
    fail('invalid_component', component.id)
  }
  if (!/^[0-9a-f]{40}$/u.test(component.commit)) {
    fail('invalid_component', component.id)
  }
  if (
    !Array.isArray(component.supportedDsh) ||
    component.supportedDsh.length === 0 ||
    component.supportedDsh.some(
      (version) =>
        typeof version !== 'string' ||
        !/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/u.test(version),
    )
  ) {
    fail('invalid_component', component.id)
  }
  if (!['web', 'tui', 'catalog'].includes(component.profileRole)) {
    fail('invalid_component', component.id)
  }
  if (
    !Array.isArray(component.runtimeDependencies) ||
    component.runtimeDependencies.some(
      (name) =>
        typeof name !== 'string' ||
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name),
    )
  ) {
    fail('invalid_component', component.id)
  }
  if (!Array.isArray(component.bundleEntrypoints) || component.bundleEntrypoints.length === 0) {
    fail('invalid_component', component.id)
  }
  if (!Array.isArray(component.conflictGroups) || !Array.isArray(component.permissions)) {
    fail('invalid_component', component.id)
  }
  if (
    typeof component.defaultEnabled !== 'boolean' ||
    typeof component.required !== 'boolean' ||
    typeof component.safeMode !== 'boolean'
  ) {
    fail('invalid_component', component.id)
  }
}

async function copyAllowed(sourceRoot, targetRoot, includes) {
  await mkdir(targetRoot, { recursive: true })
  for (const include of includes) {
    const source = path.resolve(sourceRoot, include)
    relativeInside(sourceRoot, source)
    const metadata = await lstat(source)
    if (metadata.isSymbolicLink()) fail('symlink_not_allowed', source)
    const target = path.join(targetRoot, include)
    await mkdir(path.dirname(target), { recursive: true })
    await cp(source, target, {
      recursive: metadata.isDirectory(),
      errorOnExist: true,
      force: false,
      dereference: false,
    })
  }
  await hashTree(targetRoot)
}

function runtimePaths(packageJson) {
  const exports = packageJson.exports
  const exported =
    typeof exports === 'string'
      ? [exports]
      : exports !== null && typeof exports === 'object'
        ? Object.values(exports)
        : []
  return [...exported, packageJson.dsh?.bundle?.patch].filter(
    (value) =>
      typeof value === 'string' && value.startsWith('./') && !value.includes('*'),
  )
}

export async function assemble({ sourceFile, outputDir }) {
  const sourceRoot = path.dirname(sourceFile)
  const source = JSON.parse(await readFile(sourceFile, 'utf8'))
  if (source.schemaVersion !== 1 || !Array.isArray(source.components)) {
    fail('invalid_manifest', sourceFile)
  }
  const workspaceRoot =
    source.workspaceRoot === undefined
      ? sourceRoot
      : path.resolve(sourceRoot, source.workspaceRoot)
  relativeInside(workspaceRoot, sourceRoot)

  const stage = `${outputDir}.stage`
  await rm(stage, { recursive: true, force: true })
  await mkdir(path.join(stage, 'plugins'), { recursive: true })
  await mkdir(path.join(stage, 'notices'), { recursive: true })

  const ids = new Set()
  const packages = new Set()
  const locked = []
  for (const component of source.components) {
    validateComponent(component)
    if (ids.has(component.id) || packages.has(component.package)) {
      fail('duplicate_component', component.id)
    }
    ids.add(component.id)
    packages.add(component.package)

    const sourcePath = path.resolve(sourceRoot, component.sourcePath)
    relativeInside(workspaceRoot, sourcePath)
    const sourceMetadata = await lstat(sourcePath)
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory()) {
      fail('invalid_source_path', component.id)
    }

    const artifactPath = `plugins/${component.package}`
    const targetPath = path.join(stage, artifactPath)
    await copyAllowed(sourcePath, targetPath, component.include)

    const packageJson = JSON.parse(await readFile(path.join(targetPath, 'package.json'), 'utf8'))
    if (packageJson.name !== component.package || packageJson.version !== component.version) {
      fail('package_identity_mismatch', component.id)
    }
    for (const runtimePath of runtimePaths(packageJson)) {
      const runtimeFile = path.resolve(targetPath, runtimePath)
      relativeInside(targetPath, runtimeFile)
      const metadata = await lstat(runtimeFile)
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        fail('missing_runtime_entrypoint', runtimePath)
      }
    }

    const noticeName = `${component.id}.txt`
    const noticeSource = path.resolve(sourceRoot, component.noticeSource)
    relativeInside(workspaceRoot, noticeSource)
    const noticeMetadata = await lstat(noticeSource)
    if (noticeMetadata.isSymbolicLink() || !noticeMetadata.isFile()) {
      fail('invalid_notice', component.id)
    }
    await cp(noticeSource, path.join(stage, 'notices', noticeName), {
      errorOnExist: true,
      force: false,
    })

    locked.push({
      id: component.id,
      displayName: component.displayName,
      description: component.description,
      package: component.package,
      version: component.version,
      source: component.source,
      commit: component.commit,
      supportedDsh: component.supportedDsh,
      profileRole: component.profileRole,
      runtimeDependencies: component.runtimeDependencies,
      artifactPath,
      artifactSha256: await hashTree(targetPath),
      license: component.license,
      notice: `notices/${noticeName}`,
      profiles: component.profiles,
      bundleEntrypoints: component.bundleEntrypoints,
      defaultEnabled: component.defaultEnabled,
      required: component.required,
      safeMode: component.safeMode,
      conflictGroups: component.conflictGroups,
      permissions: component.permissions,
    })
  }

  const generation = createHash('sha256').update(JSON.stringify(locked)).digest('hex')
  const lock = { schemaVersion: 1, generation, components: locked }
  await writeFile(path.join(stage, 'workbench.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  await rm(outputDir, { recursive: true, force: true })
  await cp(stage, outputDir, { recursive: true, errorOnExist: true, force: false })
  await rm(stage, { recursive: true, force: true })
  return lock
}

const invoked =
  process.argv[1] === undefined ? '' : pathToFileURL(path.resolve(process.argv[1])).href
if (import.meta.url === invoked) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  await assemble({
    sourceFile: path.join(here, 'workbench.source.json'),
    outputDir: path.join(here, 'dist'),
  })
}
