import type { Plugin } from 'vite'
import fs from 'fs/promises'
import path from 'path'

export function feedbackApiPlugin(): Plugin {
  return {
    name: 'feedback-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // 只处理 /api/feedback/submit 的 POST 请求
        if (req.url === '/api/feedback/submit' && req.method === 'POST') {
          try {
            // 读取请求体
            let body = ''
            req.on('data', chunk => {
              body += chunk.toString()
            })

            req.on('end', async () => {
              try {
                const feedbackData = JSON.parse(body)

                // 保存反馈到本地文件
                const feedbackDir = path.join(process.cwd(), 'docs/public/feedback')
                await fs.mkdir(feedbackDir, { recursive: true })

                // 使用时间戳作为文件名
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
                const filename = `feedback-${timestamp}.json`
                const filepath = path.join(feedbackDir, filename)

                // 格式化数据
                const formattedData = {
                  ...feedbackData,
                  submittedAt: new Date().toISOString()
                }

                // 写入文件
                await fs.writeFile(
                  filepath,
                  JSON.stringify(formattedData, null, 2),
                  'utf-8'
                )

                // 同时追加到汇总文件
                const summaryFile = path.join(feedbackDir, 'feedback-summary.jsonl')
                await fs.appendFile(
                  summaryFile,
                  JSON.stringify(formattedData) + '\n',
                  'utf-8'
                )

                console.log(`✅ 反馈已保存: ${filename}`)

                // 返回成功响应
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true, message: '感谢您的反馈！' }))
              } catch (error) {
                console.error('处理反馈数据时出错:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: '服务器错误' }))
              }
            })
          } catch (error) {
            console.error('读取请求时出错:', error)
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: '请求格式错误' }))
          }
        } else {
          next()
        }
      })
    }
  }
}
