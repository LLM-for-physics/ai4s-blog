import { existsSync, readdirSync, lstatSync, cpSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// Both source and artifact checks deliberately reject private data, even if ignored by Git.
export function assertPublicSafe(root) {
  if (!existsSync(root)) return
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name)
      if (/^(score|feedback|2025秋归档)$/i.test(name) || /\.(xlsx?|jsonl)$/i.test(name) || /^feedback-.*\.json$/i.test(name)) {
        throw new Error(`Private data must stay outside the public site: ${file}`)
      }
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error(`Public source may not contain symlinks: ${file}`)
      if (stat.isDirectory()) walk(file)
    }
  }
  walk(root)
}

// A public example may have local virtualenv/cache files; they are never deployable assets.
export function preparePublic(source, target) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(source, target, { recursive: true, filter: file => {
    const relative = path.relative(source, file)
    return !relative.split(path.sep).some(part => part.startsWith('.') || ['__pycache__', 'node_modules'].includes(part))
  } })
  assertPublicSafe(target)
  return target
}
