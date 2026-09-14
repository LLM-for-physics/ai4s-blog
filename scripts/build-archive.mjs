import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { assertPublicSafe } from './public-safety.mjs'
import { applyVisibility, visibilityPolicy } from './archive/visibility.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const terms = JSON.parse(readFileSync(path.join(root, 'terms.json')))
const selected = process.argv[2]
const archives = selected ? terms.archives.filter(term => term.id === selected) : terms.archives
if (!archives.length) throw new Error(`Unknown archive: ${selected}`)
const hash = text => createHash('sha256').update(text).digest('hex')
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...options })

for (const term of archives) {
  if (!/^\d{4}-(spring|fall)$/.test(term.id) || !/^[a-f0-9]{40}$/.test(term.commit)) throw new Error('Invalid archive metadata')
  const policy = visibilityPolicy(term)
  const stage = policy
    ? path.join(root, '.archive-build/public', term.publicRevision, term.id)
    : path.join(root, '.archive-build', term.id)
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  const tar = path.join(stage, 'source.tar')
  run('git', ['archive', '--format=tar', `--output=${tar}`, term.commit, 'docs', 'package.json', 'yarn.lock'])
  run('tar', ['-xf', tar, '-C', stage])
  rmSync(tar)
  const originalPackage = JSON.parse(readFileSync(path.join(stage, 'package.json')))
  const currentPackage = JSON.parse(readFileSync(path.join(root, 'package.json')))
  for (const field of ['dependencies', 'devDependencies', 'packageManager']) {
    if (JSON.stringify(originalPackage[field]) !== JSON.stringify(currentPackage[field])) {
      throw new Error(`Archive ${field} differ: restore the baseline dependency environment before rebuilding`)
    }
  }
  if (hash(readFileSync(path.join(stage, 'yarn.lock'))) !== hash(readFileSync(path.join(root, 'yarn.lock')))) {
    throw new Error('Archive lockfile differs: use the baseline dependency environment')
  }
  const docs = path.join(stage, 'docs')
  const configPath = path.join(docs, '.vitepress/config.ts')
  let config = readFileSync(configPath, 'utf8')
  if (!config.includes('export default defineConfig({')) throw new Error('Archive config format changed; review adapter')
  config = config.replace('export default defineConfig({', 'const config = defineConfig({')
  config += `\n// Reviewed archive adapter; course text and sidebar come from the frozen commit.\nconfig.base = ${JSON.stringify(`/archive/${term.id}/`)}\nconfig.lastUpdated = false\nconfig.head = config.head.filter(item => !(item[0] === 'link' && item[1]?.rel === 'icon'))\nconfig.head.push(['link', { rel: 'icon', href: ${JSON.stringify(`/archive/${term.id}/image.svg`)} }])\nconfig.themeConfig.archiveLabel = ${JSON.stringify(term.label)}\nconfig.themeConfig.editLink = undefined\nconfig.themeConfig.nav.push({ text: ${JSON.stringify(`版本: ${term.label}（归档）`)}, items: [\n  { text: '最新版本', link: 'https://aiphy.pku.edu.cn/', target: '_self' },\n  { text: ${JSON.stringify(term.label + '（归档）')}, link: ${JSON.stringify(`https://aiphy.pku.edu.cn/archive/${term.id}/`)}, target: '_self' }\n] })\nconfig.vite.plugins = []\nconfig.vite.server = undefined\nexport default config\n`
  writeFileSync(configPath, config)
  copyFileSync(path.join(root, 'scripts/archive/theme.ts'), path.join(docs, '.vitepress/theme/index.ts'))
  writeFileSync(path.join(docs, '.vitepress/theme/archive.css'), ':root { --vp-layout-top-height: 48px; }\n@media (max-width: 640px) { :root { --vp-layout-top-height: 72px; } .archive-banner { height: 72px; font-size: 14px; } }\n')
  // Component-only path patch; use the frozen component, not a future current-site implementation.
  const viewerPath = path.join(docs, '.vitepress/components/CodeFileViewer.vue')
  let viewer = readFileSync(viewerPath, 'utf8')
  viewer = viewer.replace('<script setup>', "<script setup>\nimport { withBase } from 'vitepress'")
    .replace('fetch(props.src)', 'fetch(withBase(props.src))').replace('link.href = props.src', 'link.href = withBase(props.src)')
  writeFileSync(viewerPath, viewer)
  writeFileSync(path.join(docs, 'score-query.md'), '# 成绩查询已停用\n\n历史归档不提供成绩查询，也不包含学生成绩数据。\n')
  // Student allocation file was ignored by Git; remove its obsolete public link.
  const serverPath = path.join(docs, 'setup/server.md')
  let server = readFileSync(serverPath, 'utf8')
  server = server.replace(/<a href="\/students_server_assignment\.xlsx"[^>]*>.*?<\/a>[^\n]*/g, '学生分配表涉及个人信息，不在公开归档中提供。')
  writeFileSync(serverPath, server)
  // Known pre-existing sidebar link points to a file, not a directory index.
  writeFileSync(configPath, readFileSync(configPath, 'utf8').replaceAll('/assignments/assignment-4-solution/index', '/assignments/assignment-4-solution'))
  applyVisibility(docs, term)
  // Raw HTML download attributes are not rewritten by VitePress's Markdown link transform.
  function patchHtmlLinks(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'public') continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) patchHtmlLinks(file)
      else if (entry.name.endsWith('.md')) {
        const content = readFileSync(file, 'utf8').replace(/(<(?:a|img|source)\b[^>]*?\b(?:href|src)=")\/(?!\/|archive\/)/g, `$1/archive/${term.id}/`)
        writeFileSync(file, content)
      }
    }
  }
  patchHtmlLinks(docs)
  assertPublicSafe(path.join(docs, 'public'))
  const out = policy
    ? path.join(root, 'artifacts/archive-public', term.publicRevision, term.id)
    : path.join(root, 'artifacts/archive', term.id)
  rmSync(out, { recursive: true, force: true })
  run(process.execPath, [path.join(root, 'node_modules/vitepress/bin/vitepress.js'), 'build', docs, '--outDir', out])
  assertPublicSafe(out)
  const adapterFiles = ['scripts/build-archive.mjs', 'scripts/archive/theme.ts', 'scripts/public-safety.mjs',
    'scripts/archive/visibility.mjs', 'scripts/archive/visibility.json']
  const metadata = {
    term: term.id, sourceCommit: term.commit,
    ...(policy ? { publicRevision: term.publicRevision } : {}),
    node: process.version, packageManager: originalPackage.packageManager,
    lockfileSha256: hash(readFileSync(path.join(stage, 'yarn.lock'))),
    adapterSha256: Object.fromEntries(adapterFiles.map(file => [file, hash(readFileSync(path.join(root, file)))]))
  }
  writeFileSync(path.join(out, 'archive-build.json'), JSON.stringify(metadata, null, 2) + '\n')
  run('python3', [path.join(root, 'scripts/verify-site.py'), '--archive', out, '--archive-source', docs])
  console.log(`Archive ready: ${out}`)
}
