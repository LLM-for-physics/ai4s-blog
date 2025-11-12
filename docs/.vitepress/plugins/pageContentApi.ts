import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vite 插件：提供页面 Markdown 原始内容的 API
 * 用于 AI 助手获取当前页面的完整上下文
 */
export function pageContentApiPlugin(): Plugin {
  return {
    name: 'page-content-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // 拦截 /api/page-content 请求
        if (req.url?.startsWith('/api/page-content?')) {
          const url = new URL(req.url, `http://${req.headers.host}`)
          const pagePath = url.searchParams.get('path')
          
          if (!pagePath) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing path parameter' }))
            return
          }

          try {
            // 构建完整的文件路径
            // pagePath 格式例如: "computer-basic/overview.md"
            const docsRoot = path.resolve(__dirname, '../../')
            const fullPath = path.join(docsRoot, pagePath)
            
            // 安全检查：确保请求的路径在 docs 目录内
            const normalizedPath = path.normalize(fullPath)
            if (!normalizedPath.startsWith(docsRoot)) {
              res.statusCode = 403
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Access denied' }))
              return
            }

            // 检查文件是否存在
            if (!fs.existsSync(fullPath)) {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'File not found' }))
              return
            }

            // 读取文件内容
            const content = fs.readFileSync(fullPath, 'utf-8')
            
            // 返回内容
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ 
              path: pagePath,
              content: content 
            }))
          } catch (error) {
            console.error('Error reading page content:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ 
              error: 'Internal server error',
              message: error instanceof Error ? error.message : 'Unknown error'
            }))
          }
        } else {
          next()
        }
      })
    }
  }
}
