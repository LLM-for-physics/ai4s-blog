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
      <div v-if="isOpen" class="chat-window" :style="windowStyle">
        <div class="chat-header" @mousedown="startDrag">
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
            <div class="message-content">
              <div class="vue-markdown-wrapper">
                <VueMarkdownRenderer
                  :source="msg.content"
                  :theme="isDark ? 'github-dark' : 'github-light'"
                  :remark-plugins="[remarkMath]"
                  :rehype-plugins="[rehypeKatex]"
                />
              </div>
            </div>
          </div>
          <div v-if="loading" class="message assistant">
            <div class="message-content loading-dots">思考中...</div>
          </div>
          <!-- 对话长度警告 -->
          <div v-if="isConversationTooLong" class="conversation-warning">
            <div class="warning-icon">⚠️</div>
            <div class="warning-text">
              <strong>对话过长提示</strong>
              <p>当前对话已超过 20 条消息，为保证回复质量，请点击右上角 🗑️ 按钮清空对话历史后继续。</p>
            </div>
          </div>
        </div>

        <div class="chat-input">
          <textarea
            v-model="userInput"
            @keydown.enter.prevent="handleEnter"
            :placeholder="isConversationTooLong ? '对话过长，请清空历史后继续' : '输入消息... (Enter 发送，Shift+Enter 换行)'"
            :disabled="loading || isConversationTooLong"
          ></textarea>
          <button @click="sendMessage" :disabled="loading || !userInput.trim() || isConversationTooLong">
            发送
          </button>
        </div>
        
        <!-- 调整大小手柄 -->
        <div class="resize-handle" @mousedown.stop="startResize"></div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useData } from 'vitepress'
import { VueMarkdownRenderer } from 'vue-mdr'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

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

// 窗口位置和大小（初始值不依赖 window 对象，避免 SSR 错误）
const windowPosition = ref({ x: 0, y: 90 })
const windowSize = ref({ width: 380, height: 500 })
const isDragging = ref(false)
const isResizing = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// 深色模式检测
const isDark = ref(false)

// 对话长度限制
const MAX_MESSAGES = 20
const isConversationTooLong = computed(() => messages.value.length >= MAX_MESSAGES)

// 计算窗口样式
const windowStyle = computed(() => ({
  left: `${windowPosition.value.x}px`,
  top: `${windowPosition.value.y}px`,
  width: `${windowSize.value.width}px`,
  height: `${windowSize.value.height}px`
}))

// API 配置：使用相对路径调用本站的反向代理
// API Key 保存在服务器端的 Nginx 配置中，不暴露给客户端
const BASE_URL = '/api/llm'
const MODEL = import.meta.env.VITE_MODEL || 'qwen3-max'

// 更新深色模式状态
const updateDarkMode = () => {
  isDark.value = document.documentElement.classList.contains('dark')
}

// 从 localStorage 加载历史和窗口状态
onMounted(() => {
  // 设置默认位置（在客户端访问 window 对象）
  windowPosition.value.x = window.innerWidth - 404
  
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
  
  // 初始化深色模式
  updateDarkMode()
  
  // 监听深色模式变化
  const observer = new MutationObserver(updateDarkMode)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
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
  
  // 从 DOM 中提取页面主体内容
  let content = ''
  try {
    // VitePress 的主内容区域通常在这些选择器中
    const contentElement = document.querySelector('.vp-doc') || 
                          document.querySelector('.VPDoc') ||
                          document.querySelector('main .content') ||
                          document.querySelector('article')
    
    if (contentElement) {
      // 获取文本内容，自动处理换行和空格
      content = contentElement.textContent?.trim() || ''
      
      // 限制内容长度，避免上下文过长（保留前 3000 字符）
      if (content.length > 3000) {
        content = content.substring(0, 3000) + '\n\n...(内容过长，已截断)'
      }
    }
  } catch (error) {
    console.error('Failed to extract page content:', error)
  }
  
  return `当前页面信息：\n\n页面标题：${pageTitle}\n文件路径：${pagePath}\n页面内容：${content ? '\n' + content : '（为空）'}`
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

  // 创建一个空的 assistant 消息用于流式更新
  const assistantMsgIndex = messages.value.length
  messages.value.push({ role: 'assistant', content: '' })

  try {
    // 获取页面上下文
    const contextInfo = await getPageContext()
    
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `角色设定：你是一个专业的 AI 助手，擅长物理学、编程和技术问题，正在担任物理与人工智能课的助教，协助用户理解和学习课程内容（课程内容涉及的编程语言主要是 Python）。

当前上下文如下：

${contextInfo}

回答要求：
1. 必须使用中文回答
2. 必须使用 Markdown 格式组织内容：
   - 使用标题（# ## ###）划分章节层次
   - 使用列表（- 或 1.）列举要点
   - 使用代码块（\`\`\`语言名）展示代码，务必标注语言（如 python, bash 等）
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
          ...messages.value.slice(0, assistantMsgIndex)
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: true  // 启用流式响应
      })
    })

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }

    // 处理流式响应
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices[0]?.delta?.content
            if (content) {
              messages.value[assistantMsgIndex].content += content
              await nextTick()
              scrollToBottom()
            }
          } catch (e) {
            // 忽略 JSON 解析错误
            console.debug('JSON parse error:', e)
          }
        }
      }
    }

    // 如果消息为空，添加默认错误消息
    if (!messages.value[assistantMsgIndex].content) {
      messages.value[assistantMsgIndex].content = '抱歉，我没有收到回复。'
    }
  } catch (error) {
    console.error('Error calling API:', error)
    messages.value[assistantMsgIndex].content = '抱歉，发生了错误。请检查网络连接或稍后重试。'
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

// 开始拖拽
const startDrag = (e: MouseEvent) => {
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  e.preventDefault()
}

// 开始调整大小
const startResize = (e: MouseEvent) => {
  isResizing.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  e.preventDefault()
}

// 鼠标移动处理
const handleMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    const deltaX = e.clientX - dragStart.value.x
    const deltaY = e.clientY - dragStart.value.y
    windowPosition.value.x += deltaX
    windowPosition.value.y += deltaY
    dragStart.value = { x: e.clientX, y: e.clientY }
    saveWindowState()
  } else if (isResizing.value) {
    const deltaX = e.clientX - dragStart.value.x
    const deltaY = e.clientY - dragStart.value.y
    windowSize.value.width = Math.max(300, windowSize.value.width + deltaX)
    windowSize.value.height = Math.max(300, windowSize.value.height + deltaY)
    dragStart.value = { x: e.clientX, y: e.clientY }
    saveWindowState()
  }
}

const handleMouseUp = () => {
  isDragging.value = false
  isResizing.value = false
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
  cursor: move;
  user-select: none;
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

/* 流式渲染动画 */
.vue-markdown-wrapper > *,
.vue-markdown-wrapper :deep(.text-segmenter) {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Vue Markdown Renderer 样式覆盖 */
.vue-markdown-wrapper :deep(h1),
.vue-markdown-wrapper :deep(h2),
.vue-markdown-wrapper :deep(h3),
.vue-markdown-wrapper :deep(h4) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.3;
}

.vue-markdown-wrapper :deep(h1) { font-size: 1.5em; }
.vue-markdown-wrapper :deep(h2) { font-size: 1.3em; }
.vue-markdown-wrapper :deep(h3) { font-size: 1.1em; }
.vue-markdown-wrapper :deep(h4) { font-size: 1em; }

.vue-markdown-wrapper :deep(h1:first-child),
.vue-markdown-wrapper :deep(h2:first-child),
.vue-markdown-wrapper :deep(h3:first-child) {
  margin-top: 0;
}

.vue-markdown-wrapper :deep(p) {
  margin: 8px 0;
}

.vue-markdown-wrapper :deep(p:first-child) {
  margin-top: 0;
}

.vue-markdown-wrapper :deep(p:last-child) {
  margin-bottom: 0;
}

.vue-markdown-wrapper :deep(code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9em;
}

.vue-markdown-wrapper :deep(pre) {
  margin: 12px 0;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}

.vue-markdown-wrapper :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.9em;
}

.vue-markdown-wrapper :deep(ul),
.vue-markdown-wrapper :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.vue-markdown-wrapper :deep(li) {
  margin: 4px 0;
}

.vue-markdown-wrapper :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
}

.vue-markdown-wrapper :deep(table) {
  margin: 12px 0;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9em;
}

.vue-markdown-wrapper :deep(th),
.vue-markdown-wrapper :deep(td) {
  border: 1px solid var(--vp-c-divider);
  padding: 6px 12px;
  text-align: left;
}

.vue-markdown-wrapper :deep(th) {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
}

.vue-markdown-wrapper :deep(a) {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.vue-markdown-wrapper :deep(a:hover) {
  text-decoration: underline;
}

.vue-markdown-wrapper :deep(hr) {
  margin: 16px 0;
  border: none;
  border-top: 1px solid var(--vp-c-divider);
}

.vue-markdown-wrapper :deep(strong) {
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.vue-markdown-wrapper :deep(em) {
  font-style: italic;
}

.vue-markdown-wrapper :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

/* KaTeX 样式 */
.vue-markdown-wrapper :deep(.katex) {
  font-size: 1.05em;
}

.vue-markdown-wrapper :deep(.katex-display) {
  margin: 16px 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* 对话长度警告样式 */
.conversation-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin: 8px 0;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  animation: slideIn 0.3s ease;
}

.dark .conversation-warning {
  background: rgba(255, 193, 7, 0.15);
  border-color: rgba(255, 193, 7, 0.3);
}

.conversation-warning .warning-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.conversation-warning .warning-text {
  flex: 1;
  font-size: 14px;
  color: var(--vp-c-text-1);
}

.conversation-warning .warning-text strong {
  display: block;
  margin-bottom: 4px;
  color: #856404;
  font-size: 15px;
}

.dark .conversation-warning .warning-text strong {
  color: #ffc107;
}

.conversation-warning .warning-text p {
  margin: 0;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

/* 调整大小手柄 */
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 0%, transparent 40%, var(--vp-c-divider) 40%, var(--vp-c-divider) 60%, transparent 60%);
}

.resize-handle:hover {
  background: linear-gradient(135deg, transparent 0%, transparent 40%, var(--vp-c-brand-1) 40%, var(--vp-c-brand-1) 60%, transparent 60%);
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

/* 响应式设计 */
@media (max-width: 768px) {
  .chat-window {
    width: calc(100vw - 32px) !important;
    height: calc(100vh - 140px) !important;
    right: 16px !important;
    bottom: 76px !important;
  }
  
  .assistant-button {
    right: 16px;
    bottom: 16px;
  }
}
</style>
