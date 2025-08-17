/**
 * VitePress 代码文件处理插件
 * 提供代码文件的预览和下载功能
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export function codeFilesPlugin() {
  return {
    name: 'code-files-plugin',
    configureServer(server) {
      // 处理代码文件预览请求
      server.middlewares.use('/api/code-preview', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const filePath = url.searchParams.get('file')
        
        if (!filePath) {
          res.statusCode = 400
          res.end('Missing file parameter')
          return
        }

        const fullPath = join(process.cwd(), 'docs/public', filePath)
        
        if (!existsSync(fullPath)) {
          res.statusCode = 404
          res.end('File not found')
          return
        }

        try {
          const content = readFileSync(fullPath, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            content,
            filename: filePath.split('/').pop(),
            path: filePath
          }))
        } catch (error) {
          res.statusCode = 500
          res.end('Error reading file')
        }
      })
    },
    
    // 在构建时处理静态文件
    generateBundle(options, bundle) {
      // 确保代码文件被正确处理为静态资源
      const codeFileExtensions = ['.py', '.txt', '.js', '.ts', '.json']
      
      Object.keys(bundle).forEach(fileName => {
        const asset = bundle[fileName]
        if (asset.type === 'asset') {
          const ext = fileName.substring(fileName.lastIndexOf('.'))
          if (codeFileExtensions.includes(ext)) {
            // 设置正确的 MIME 类型
            asset.needsCodeInject = false
          }
        }
      })
    }
  }
}

// 客户端代码文件处理工具
export const codeFileUtils = {
  /**
   * 获取代码文件内容
   */
  async getCodeContent(filePath) {
    try {
      const response = await fetch(`/api/code-preview?file=${encodeURIComponent(filePath)}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching code content:', error)
      return null
    }
  },

  /**
   * 下载代码文件
   */
  downloadFile(filePath, filename) {
    const link = document.createElement('a')
    link.href = filePath
    link.download = filename || filePath.split('/').pop()
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },

  /**
   * 复制代码到剪贴板
   */
  async copyToClipboard(content) {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      return false
    }
  }
}
