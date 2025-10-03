<template>
  <div class="score-query">
    <div class="query-form">
      <h2>成绩查询</h2>
      <div class="input-group">
        <label for="student-id">请输入学号：</label>
        <input
          id="student-id"
          v-model="studentId"
          type="text"
          placeholder="例如：2401110097"
          @keyup.enter="queryScore"
          :disabled="loading"
        />
        <button @click="queryScore" :disabled="loading || !studentId.trim()">
          {{ loading ? '查询中...' : '查询成绩' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-message">
      <p>{{ error }}</p>
    </div>

    <div v-if="loading" class="loading">
      <p>正在查询成绩信息...</p>
    </div>

    <div v-if="results.length > 0" class="results">
      <h3>{{ studentName }} ({{ studentId }}) 的成绩信息</h3>
      <div class="results-table">
        <table>
          <thead>
            <tr>
              <th>作业编号</th>
              <th>作业状态</th>
              <th>收取时间</th>
              <th>检查时间</th>
              <th>分数</th>
              <th>评语</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="result in results" :key="`${result.server}-${result.assignment}`">
              <td>作业{{ result.assignment }}</td>
              <td>
                <span :class="['status', result.status === '已提交' ? 'submitted' : 'not-submitted']">
                  {{ result.status }}
                </span>
              </td>
              <td>{{ result.submitTime || '未提交' }}</td>
              <td>{{ result.checkTime || '-' }}</td>
              <td>
                <span v-if="result.status === '未提交'" class="no-score">无</span>
                <span v-else-if="result.score !== null" class="score">{{ result.score }}</span>
                <span v-else class="no-score">未评分</span>
              </td>
              <td>
                <span v-if="result.status === '未提交'" class="no-feedback">无</span>
                <div v-else-if="result.feedback" class="feedback">
                  <details>
                    <summary>查看评语</summary>
                    <pre>{{ result.feedback }}</pre>
                  </details>
                </div>
                <span v-else class="no-feedback">暂无评语</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="!loading && !error && results.length === 0 && hasSearched" class="no-results">
      <p>未找到学号 "{{ studentId }}" 的成绩信息</p>
      <p>请检查学号是否正确，或联系助教确认。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

const studentId = ref('')
const studentName = ref('')
const loading = ref(false)
const error = ref('')
const results = ref([])
const hasSearched = ref(false)

const servers = ['58', '132', '213']

async function fetchCSV(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const text = await response.text()
    return parseCSV(text)
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, err)
    return []
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',')
  const data = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row = {}
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || ''
    })
    data.push(row)
  }
  
  return data
}

async function fetchTextFile(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    return await response.text()
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, err)
    return null
  }
}

async function queryScore() {
  if (!studentId.value.trim()) {
    error.value = '请输入学号'
    return
  }

  loading.value = true
  error.value = ''
  results.value = []
  hasSearched.value = true
  studentName.value = ''

  try {
    const allResults = []

    for (const server of servers) {
      // 获取作业1的信息
      const csvUrl = `/score/${server}/assignment1_update_log.csv`
      const csvData = await fetchCSV(csvUrl)
      
      // 查找学生信息
      const studentRecord = csvData.find(row => row['学号'] === studentId.value)
      
      if (studentRecord) {
        if (!studentName.value) {
          studentName.value = studentRecord['姓名']
        }

        // 获取分数和评语
        const scoreUrl = `/score/${server}/stu${studentId.value}/1-score.txt`
        const feedbackUrl = `/score/${server}/stu${studentId.value}/1-feedback.txt`
        
        const [scoreText, feedbackText] = await Promise.all([
          fetchTextFile(scoreUrl),
          fetchTextFile(feedbackUrl)
        ])

        const result = {
          server,
          assignment: 1,
          status: studentRecord['作业状态'],
          submitTime: studentRecord['最后修改时间'],
          checkTime: studentRecord['检查时间'],
          score: scoreText ? parseFloat(scoreText.trim()) : null,
          feedback: feedbackText ? feedbackText.trim() : null
        }

        allResults.push(result)
      }
    }

    results.value = allResults.sort((a, b) => a.assignment - b.assignment)

    if (results.value.length === 0) {
      error.value = `未找到学号 "${studentId.value}" 的成绩信息`
    }

  } catch (err) {
    console.error('Query error:', err)
    error.value = '查询过程中发生错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.score-query {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.query-form {
  background: var(--vp-c-bg-soft);
  padding: 24px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.query-form h2 {
  margin: 0 0 20px 0;
  color: var(--vp-c-text-1);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group label {
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.input-group input {
  padding: 12px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  font-size: 16px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.input-group input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.input-group button {
  padding: 12px 24px;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.input-group button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.input-group button:disabled {
  background: var(--vp-c-gray-2);
  cursor: not-allowed;
}

.error-message {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 24px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
}

.results h3 {
  margin-bottom: 20px;
  color: var(--vp-c-text-1);
}

.results-table {
  overflow-x: auto;
}

.results-table table {
  width: 100%;
  border-collapse: collapse;
  background: var(--vp-c-bg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.results-table th,
.results-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
}

.results-table th {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.results-table td {
  color: var(--vp-c-text-2);
}

.status.submitted {
  color: var(--vp-c-success-1);
  font-weight: 500;
}

.status.not-submitted {
  color: var(--vp-c-danger-1);
  font-weight: 500;
}

.score {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  font-size: 16px;
}

.no-score,
.no-feedback {
  color: var(--vp-c-text-3);
  font-style: italic;
}

.feedback details {
  cursor: pointer;
}

.feedback summary {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.feedback pre {
  margin-top: 8px;
  padding: 12px;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.5;
}

.no-results {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

@media (max-width: 768px) {
  .input-group {
    gap: 16px;
  }
  
  .results-table {
    font-size: 14px;
  }
  
  .results-table th,
  .results-table td {
    padding: 8px;
  }
}
</style>
