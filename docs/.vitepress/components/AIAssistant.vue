<template>
  <div class="ai-assistant">
    <!-- 悬浮按钮 -->
    <button 
      class="assistant-button" 
      @click="toggleChat"
      :title="isOpen ? '关闭助手' : '打开 AI 助手'"
    >
      <span v-if="!isOpen">💬</span>
      <span v-else>✕</span>
    </button>

    <!-- 聊天窗口 -->
    <transition name="chat-slide">
      <div v-if="isOpen" class="chat-window">
        <div class="chat-header">
          <h3>AI 助手</h3>
          <button @click="clearHistory" class="clear-btn" title="清空对话历史">
            🗑️
          </button>
        </div>

        <div class="chat-messages" ref="messagesContainer">
          <div 
            v-for="(msg, index) in messages" 
            :key="index"
            :class="['message', msg.role]"
          >
            <div class="message-content" v-html="formatMessage(msg.content)"></div>
          </div>
          <div v-if="loading" class="message assistant">
            <div class="message-content loading-dots">思考中...</div>
          </div>
        </div>

        <div class="chat-input">
          <textarea
            v-model="userInput"
            @keydown.enter.prevent="handleEnter"
            placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
            :disabled="loading"
          ></textarea>
          <button @click="sendMessage" :disabled="loading || !userInput.trim()">
            发送
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useData } from 'vitepress'
import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const { page } = useData()

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const isOpen = ref(false)
const userInput = ref('')
const messages = ref<Message[]>([])
const loading = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

// 窗口位置和大小
const windowPosition = ref({ x: 24, y: 90 })
const windowSize = ref({ width: 500, height: 600 })
const isDragging = ref(false)
const isResizing = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const resizeDirection = ref('')

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''
const BASE_URL = import.meta.env.VITE_OPENAI_BASE_URL || ''
const MODEL = import.meta.env.VITE_MODEL || 'qwen-plus'

// 配置 marked
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext'
    return hljs.highlight(code, { language }).value
  }
}))

marked.use(markedKatex({
  throwOnError: false,
  output: 'html'
}))

// 调试信息
if (!API_KEY || !BASE_URL) {
  console.warn('AI Assistant: 环境变量未正确配置')
  console.warn('API_KEY:', API_KEY ? '已设置' : '未设置')
  console.warn('BASE_URL:', BASE_URL || '未设置')
  console.warn('MODEL:', MODEL)
}

// 从 localStorage 加载历史和窗口状态
onMounted(() => {
  const saved = localStorage.getItem('ai-assistant-messages')
  if (saved) {
    try {
      messages.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to load chat history:', e)
    }
  }
  
  // 加载窗口位置和大小
  const savedWindowState = localStorage.getItem('ai-assistant-window-state')
  if (savedWindowState) {
    try {
      const state = JSON.parse(savedWindowState)
      windowPosition.value = state.position || windowPosition.value
      windowSize.value = state.size || windowSize.value
    } catch (e) {
      console.error('Failed to load window state:', e)
    }
  }
  
  // 添加全局事件监听
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
})

// 组件卸载时清理
onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})

// 保存到 localStorage
watch(messages, (newMessages) => {
  localStorage.setItem('ai-assistant-messages', JSON.stringify(newMessages))
}, { deep: true })

const toggleChat = () => {
  isOpen.value = !isOpen.value
}

const clearHistory = () => {
  if (confirm('确定要清空对话历史吗？')) {
    messages.value = []
    localStorage.removeItem('ai-assistant-messages')
  }
}

const getPageContext = () => {
  // 获取当前页面内容作为上下文
  const pageTitle = page.value.title || '未命名页面'
  const pagePath = page.value.relativePath || ''
  const pageContent = page.value.content || ''
  
  return `当前页面：${pageTitle}\n路径：${pagePath}\n\n页面内容：\n${pageContent}`
}

const sendMessage = async () => {
  const input = userInput.value.trim()
  if (!input || loading.value) return

  // 添加用户消息
  messages.value.push({ role: 'user', content: input })
  userInput.value = ''
  loading.value = true

  await nextTick()
  scrollToBottom()

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的 AI 助手，擅长物理学、编程和技术问题，正在协助用户理解和学习课程内容。

当前页面上下文：
${getPageContext()}

回答要求：
1. 必须使用中文回答
2. 必须使用 Markdown 格式组织内容：
   - 使用标题（# ## ###）划分章节层次
   - 使用列表（- 或 1.）列举要点
   - 使用代码块（\`\`\`语言名）展示代码，务必标注语言（如 python, javascript, bash, typescript 等）
   - 使用行内代码（\`code\`）标注变量名、函数名、命令、文件路径等
   - 使用加粗（**文本**）和斜体（*文本*）强调重点
   - 使用引用块（> 文本）引用重要内容
   - 使用表格展示对比数据

3. **LaTeX 数学公式使用规则（重要）**：
   - **行内公式**：使用单个美元符号 $...$，写在文本行内
     * 示例：质能方程 $E = mc^2$ 是物理学的基石
     * 示例：边界条件为 $u(x, y) = g(x, y)$，其中 $(x, y) \\in \\partial\\Omega$
   - **块级公式**：使用双美元符号 $$...$$，独立成行，前后需要空行
     * 示例：
       
       $$\\frac{\\partial^2 \\psi}{\\partial t^2} = c^2 \\nabla^2 \\psi$$
       
     * 示例：
       
       $$u(x, y) = g(x, y), \\quad (x, y) \\in \\partial\\Omega$$
   - **注意**：不要在文本行内使用 $$...$$，这会导致渲染错误

4. 代码示例：
   \`\`\`python
   import numpy as np
   print("Hello World")
   \`\`\`
   
5. 命令示例：\`npm install\`、\`git clone\`

请基于当前页面上下文精准回答问题。对于物理问题，确保科学性和准确性；对于编程问题，提供清晰的代码示例和解释。如果问题与当前页面无关，也可以提供一般性帮助。`
          },
          ...messages.value
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }

    const data = await response.json()
    const assistantMessage = data.choices[0]?.message?.content || '抱歉，我没有收到回复。'

    messages.value.push({ role: 'assistant', content: assistantMessage })
    
    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('Error calling API:', error)
    messages.value.push({ 
      role: 'assistant', 
      content: '抱歉，发生了错误。请检查网络连接或稍后重试。' 
    })
  } finally {
    loading.value = false
  }
}

const handleEnter = (e: KeyboardEvent) => {
  if (e.shiftKey) {
    // Shift+Enter 换行，不做处理
    return
  }
  // Enter 发送消息
  sendMessage()
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const formatMessage = (content: string) => {
  try {
    // 使用 marked 解析 markdown
    const html = marked.parse(content) as string
    // 使用 DOMPurify 清理 HTML，防止 XSS 攻击
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['target', 'rel', 'class']
    })
  } catch (error) {
    console.error('Markdown parsing error:', error)
    // 降级处理：简单替换换行符
    return content.replace(/\n/g, '<br>')
  }
}

// 鼠标事件处理
const handleMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    const deltaX = e.clientX - dragStart.value.x
    const deltaY = e.clientY - dragStart.value.y
    windowPosition.value.x += deltaX
    windowPosition.value.y -= deltaY
    dragStart.value = { x: e.clientX, y: e.clientY }
    saveWindowState()
  } else if (isResizing.value) {
    handleResize(e)
  }
}

const handleMouseUp = () => {
  isDragging.value = false
  isResizing.value = false
  resizeDirection.value = ''
}

const handleResize = (e: MouseEvent) => {
  const direction = resizeDirection.value
  if (!direction) return

  if (direction.includes('e')) {
    windowSize.value.width = Math.max(300, e.clientX - (window.innerWidth - windowPosition.value.x - windowSize.value.width))
  }
  if (direction.includes('w')) {
    const newWidth = Math.max(300, windowSize.value.width + (window.innerWidth - windowPosition.value.x - windowSize.value.width - e.clientX))
    windowPosition.value.x -= newWidth - windowSize.value.width
    windowSize.value.width = newWidth
  }
  if (direction.includes('s')) {
    windowSize.value.height = Math.max(300, window.innerHeight - windowPosition.value.y - e.clientY)
  }
  if (direction.includes('n')) {
    const newHeight = Math.max(300, windowSize.value.height + (window.innerHeight - windowPosition.value.y - windowSize.value.height - e.clientY))
    windowPosition.value.y -= newHeight - windowSize.value.height
    windowSize.value.height = newHeight
  }
  
  saveWindowState()
}

const saveWindowState = () => {
  localStorage.setItem('ai-assistant-window-state', JSON.stringify({
    position: windowPosition.value,
    size: windowSize.value
  }))
}
</script>

<style scoped>
.ai-assistant {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}

.assistant-button {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.assistant-button:hover {
  background: var(--vp-c-brand-2);
  transform: scale(1.05);
}

.chat-window {
  position: fixed;
  bottom: 90px;
  right: 24px;
  width: 380px;
  height: 500px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 16px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.clear-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.clear-btn:hover {
  background: var(--vp-c-default-soft);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  animation: fadeIn 0.3s ease;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.message-content {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  word-wrap: break-word;
  line-height: 1.5;
}

.message.user .message-content {
  background: var(--vp-c-brand-1);
  color: white;
}

.message.assistant .message-content {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}

/* Markdown 渲染样式 */
.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.3;
}

.message-content :deep(h1) { font-size: 1.5em; }
.message-content :deep(h2) { font-size: 1.3em; }
.message-content :deep(h3) { font-size: 1.1em; }
.message-content :deep(h4) { font-size: 1em; }

.message-content :deep(h1:first-child),
.message-content :deep(h2:first-child),
.message-content :deep(h3:first-child) {
  margin-top: 0;
}

/* 代码样式 */
.message-content :deep(code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9em;
}

.message-content :deep(pre) {
  margin: 12px 0;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  background: var(--vp-code-block-bg, #1e1e1e);
  line-height: 1.4;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  color: inherit;
  font-size: 0.9em;
}

/* 列表样式 */
.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.message-content :deep(li) {
  margin: 4px 0;
}

.message-content :deep(ul ul),
.message-content :deep(ol ol),
.message-content :deep(ul ol),
.message-content :deep(ol ul) {
  margin: 2px 0;
}

/* 引用块样式 */
.message-content :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
}

.message-content :deep(blockquote p) {
  margin: 4px 0;
}

/* 表格样式 */
.message-content :deep(table) {
  margin: 12px 0;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9em;
}

.message-content :deep(th),
.message-content :deep(td) {
  border: 1px solid var(--vp-c-divider);
  padding: 6px 12px;
  text-align: left;
}

.message-content :deep(th) {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
}

.message-content :deep(tr:nth-child(even)) {
  background: var(--vp-c-bg-soft);
}

/* 链接样式 */
.message-content :deep(a) {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.message-content :deep(a:hover) {
  text-decoration: underline;
}

/* 段落和间距 */
.message-content :deep(p) {
  margin: 8px 0;
}

.message-content :deep(p:first-child) {
  margin-top: 0;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* 水平线 */
.message-content :deep(hr) {
  margin: 16px 0;
  border: none;
  border-top: 1px solid var(--vp-c-divider);
}

/* KaTeX 数学公式样式 */
.message-content :deep(.katex) {
  font-size: 1.05em;
}

.message-content :deep(.katex-display) {
  margin: 16px 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
}

.message-content :deep(.katex-display > .katex) {
  text-align: left;
  display: inline-block;
}

/* 强调样式 */
.message-content :deep(strong) {
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.message-content :deep(em) {
  font-style: italic;
}

/* 图片样式 */
.message-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

.loading-dots {
  opacity: 0.7;
}

.chat-input {
  padding: 12px;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
  display: flex;
  gap: 8px;
}

.chat-input textarea {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  resize: none;
  font-family: inherit;
  font-size: 14px;
  min-height: 44px;
  max-height: 100px;
}

.chat-input textarea:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.chat-input button {
  padding: 0 20px;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.chat-input button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.chat-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-slide-enter-active,
.chat-slide-leave-active {
  transition: all 0.3s ease;
}

.chat-slide-enter-from,
.chat-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .chat-window {
    width: calc(100vw - 32px);
    height: calc(100vh - 140px);
    right: 16px;
    bottom: 76px;
  }
  
  .assistant-button {
    right: 16px;
    bottom: 16px;
  }
}
</style>
