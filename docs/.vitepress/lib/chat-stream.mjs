/** Decode SSE across arbitrary network chunks, including split UTF-8 characters. */
export async function consumeChatStream(response, onContent) {
  if (!response.ok) throw new Error(`请求失败（${response.status}），请稍后重试。`)
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('服务未返回流式响应，请检查模型和代理配置。')
  }
  if (!response.body) throw new Error('浏览器无法读取响应流。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', data = [], finished = false
  const dispatch = () => {
    if (!data.length) return
    const payload = data.join('\n')
    data = []
    if (payload.trim() === '[DONE]') { finished = true; return }
    let event
    try { event = JSON.parse(payload) } catch { throw new Error('响应流格式异常，请重试。') }
    if (event.error) throw new Error('模型服务返回错误，请稍后重试。')
    const content = event.choices?.[0]?.delta?.content
    if (typeof content === 'string') onContent(content)
  }
  const line = (value) => {
    if (!value) dispatch()
    else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''))
  }
  try {
    while (!finished) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let match
      while (!finished && (match = /\r\n|\r|\n/.exec(buffer))) {
        // A CR at the chunk boundary may belong to a CRLF pair.
        if (!done && match[0] === '\r' && match.index === buffer.length - 1) break
        line(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
      }
      if (done) {
        if (buffer) line(buffer)
        dispatch()
        if (!finished) throw new Error('连接提前中断，可重试获取完整回复。')
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
