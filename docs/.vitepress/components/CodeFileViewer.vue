<template>
  <div class="code-file-viewer">
    <div class="file-header">
      <div class="file-info">
        <span class="file-icon">📄</span>
        <span class="file-name">{{ filename }}</span>
        <span class="file-size" v-if="fileSize">{{ fileSize }}</span>
      </div>
      <div class="file-actions">
        <button 
          @click="togglePreview" 
          class="action-btn preview-btn"
          :class="{ active: showPreview }"
        >
          <span class="icon">👁️</span>
          {{ showPreview ? '隐藏预览' : '预览代码' }}
        </button>
        <button @click="copyCode" class="action-btn copy-btn" v-if="showPreview">
          <span class="icon">📋</span>
          {{ copied ? '已复制!' : '复制代码' }}
        </button>
        <button @click="downloadFile" class="action-btn download-btn">
          <span class="icon">⬇️</span>
          下载文件
        </button>
      </div>
    </div>
    
    <div v-if="showPreview" class="code-preview">
      <div v-if="loading" class="loading">
        <span class="loading-spinner">⏳</span>
        正在加载代码...
      </div>
      <div v-else-if="error" class="error">
        <span class="error-icon">❌</span>
        {{ error }}
      </div>
      <div v-else class="code-container">
        <pre><code :class="`language-${language}`" v-html="highlightedCode"></code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'python'
  }
})

const showPreview = ref(false)
const loading = ref(false)
const error = ref('')
const codeContent = ref('')
const copied = ref(false)
const fileSize = ref('')

const computedFilename = computed(() => {
  return props.filename || props.src.split('/').pop()
})

const highlightedCode = computed(() => {
  if (!codeContent.value) return ''
  // 简单的语法高亮，实际项目中可以使用 Prism.js 或其他库
  return escapeHtml(codeContent.value)
})

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

async function togglePreview() {
  if (!showPreview.value) {
    await loadCode()
  }
  showPreview.value = !showPreview.value
}

async function loadCode() {
  loading.value = true
  error.value = ''
  
  try {
    const response = await fetch(withBase(props.src))
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    codeContent.value = await response.text()
    
    // 获取文件大小
    const contentLength = response.headers.get('content-length')
    if (contentLength) {
      const bytes = parseInt(contentLength)
      fileSize.value = formatFileSize(bytes)
    }
  } catch (err) {
    error.value = `加载失败: ${err.message}`
  } finally {
    loading.value = false
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

async function copyCode() {
  try {
    // 检查是否支持现代剪贴板 API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(codeContent.value)
    } else {
      // 降级到传统方法
      await fallbackCopyTextToClipboard(codeContent.value)
    }
    
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
    // 显示用户友好的错误提示
    showCopyError()
  }
}

// 降级复制方法
function fallbackCopyTextToClipboard(text) {
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea')
    textArea.value = text
    
    // 避免在 iOS 上出现缩放
    textArea.style.top = '0'
    textArea.style.left = '0'
    textArea.style.position = 'fixed'
    textArea.style.width = '2em'
    textArea.style.height = '2em'
    textArea.style.padding = '0'
    textArea.style.border = 'none'
    textArea.style.outline = 'none'
    textArea.style.boxShadow = 'none'
    textArea.style.background = 'transparent'
    
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    
    try {
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      if (successful) {
        resolve()
      } else {
        reject(new Error('execCommand failed'))
      }
    } catch (err) {
      document.body.removeChild(textArea)
      reject(err)
    }
  })
}

// 显示复制错误提示
function showCopyError() {
  // 可以在这里添加更友好的错误提示
  alert('复制失败，请手动选择并复制代码内容')
}

function downloadFile() {
  const link = document.createElement('a')
  link.href = withBase(props.src)
  link.download = computedFilename.value
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<style scoped>
.code-file-viewer {
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  margin: 16px 0;
  overflow: hidden;
}

.file-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  font-size: 16px;
}

.file-name {
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.file-size {
  font-size: 12px;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-default-soft);
  padding: 2px 6px;
  border-radius: 4px;
}

.file-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background-color: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: var(--vp-c-bg-soft);
  border-color: var(--vp-c-brand);
}

.action-btn.active {
  background-color: var(--vp-c-brand);
  color: var(--vp-c-bg);
  border-color: var(--vp-c-brand);
}

.icon {
  font-size: 14px;
}

.code-preview {
  background-color: var(--vp-c-bg);
}

.loading, .error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--vp-c-text-2);
}

.loading-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error {
  color: var(--vp-c-danger);
}

.code-container {
  max-height: 500px;
  overflow-y: auto;
}

.code-container pre {
  margin: 0;
  padding: 16px;
  background-color: var(--vp-code-block-bg);
  overflow-x: auto;
}

.code-container code {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .file-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .file-actions {
    justify-content: center;
  }
  
  .action-btn {
    flex: 1;
    justify-content: center;
  }
}
</style>
