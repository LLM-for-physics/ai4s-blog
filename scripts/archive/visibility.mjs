import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const policies = JSON.parse(readFileSync(new URL('./visibility.json', import.meta.url), 'utf8'))
export function visibilityPolicy(term) {
  if (!term.publicRevision) return null
  const policy = policies[term.id]
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(term.publicRevision) || !policy || policy.publicRevision !== term.publicRevision) {
    throw new Error('Unknown archive visibility revision: ' + term.id)
  }
  return policy
}

// Only the extracted build copy is filtered; the Git baseline and original archive are retained.
export function applyVisibility(docs, term) {
  const policy = visibilityPolicy(term)
  if (!policy) return
  const root = path.resolve(docs)
  for (const relative of policy.excludedSources) {
    const target = path.resolve(root, relative)
    if (!target.startsWith(root + path.sep) || !existsSync(target)) {
      throw new Error('Archive exclusion no longer matches the baseline: ' + relative)
    }
    rmSync(target, { recursive: true, force: false })
  }
  const configPath = path.join(root, '.vitepress/config.ts')
  let config = readFileSync(configPath, 'utf8')
  for (const route of policy.hiddenRoutes) {
    const lines = config.split('\n')
    const matching = lines.filter(line => line.includes("link: '" + route))
    if (matching.length !== 1) throw new Error('Expected one archived sidebar link: ' + route)
    config = lines.filter(line => !matching.includes(line)).join('\n')
  }
  writeFileSync(configPath, config)
  const overviewPath = path.join(root, 'assignments/overview.md')
  const overview = readFileSync(overviewPath, 'utf8')
  const marker = '\n# 参考题解\n'
  const at = overview.indexOf(marker)
  if (at < 0 || !policy.hiddenRoutes.every(route => overview.slice(at).includes(path.basename(route)))) {
    throw new Error('Archived overview reference-answer section changed')
  }
  // The frozen source has exactly this final section, with only the two answer links.
  const section = overview.slice(at).trim().split('\n').filter(Boolean)
  if (section.length !== 3) throw new Error('Unexpected content after reference-answer heading')
  writeFileSync(overviewPath, overview.slice(0, at).trimEnd() + '\n')
}

