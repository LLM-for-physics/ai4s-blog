import test from 'node:test'
import assert from 'node:assert/strict'
import { consumeChatStream } from '../docs/.vitepress/lib/chat-stream.mjs'
const event = text => `data:${JSON.stringify({ choices: [{ delta: { content: text } }] })}\r\n\r\n`
const response = chunks => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() } }), { headers: { 'Content-Type': 'text/event-stream' } })
const encode = text => new TextEncoder().encode(text)
test('handles byte-sized UTF-8 chunks, CRLF, comments and DONE without trailing newline', async () => {
  const bytes = encode(': heartbeat\r\n\r\n' + event('物理') + event('学') + 'data: [DONE]')
  let result = ''
  await consumeChatStream(response([...bytes].map(byte => new Uint8Array([byte]))), delta => result += delta)
  assert.equal(result, '物理学')
})
test('delivers content before the response closes', async () => {
  let controller, received
  const first = new Promise(resolve => received = resolve)
  const body = new ReadableStream({ start(c) { controller = c; c.enqueue(encode(event('第一段'))) } })
  const consuming = consumeChatStream(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }), received)
  assert.equal(await first, '第一段')
  controller.enqueue(encode('data: [DONE]\n\n'))
  await consuming
})
test('reports truncation while preserving delivered content', async () => {
  let result = ''
  await assert.rejects(consumeChatStream(response([encode(event('部分内容'))]), delta => result += delta), /提前中断/)
  assert.equal(result, '部分内容')
})
test('rejects upstream errors, malformed events and non-SSE responses', async () => {
  for (const text of ['data: {"error":{"message":"private detail"}}\n\n', 'data: invalid\n\n']) {
    await assert.rejects(consumeChatStream(response([encode(text)]), () => {}), /错误|异常/)
  }
  await assert.rejects(consumeChatStream(new Response('{}'), () => {}), /未返回流式/)
  await assert.rejects(consumeChatStream(new Response('', { status: 429 }), () => {}), /429/)
})
