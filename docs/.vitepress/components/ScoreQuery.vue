<template>
  <div class="score-query">
    <div class="query-form">
      <h2>成绩查询</h2>
      <div class="input-group">
        <label class="input-label">
          <span class="label-text">请输入学号：</span>
          <input
            v-model="studentId"
            type="text"
            placeholder="例如：2401110097"
            @keyup.enter="queryScore"
            :disabled="loading"
          />
        </label>
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
      <h3>{{ studentName }} ({{ queriedStudentId }}) 的成绩信息</h3>
      
      <!-- 图书馆 agent 比赛项目提示框 -->
      <div v-if="agentProject" class="agent-project-banner">
        <div class="banner-icon">🎉</div>
        <div class="banner-content">
          <h4>图书馆 Agent 比赛项目</h4>
          <div class="project-info">
            <div class="info-item">
              <span class="info-label">项目得分：</span>
              <span class="info-value highlight">{{ agentProject.score }} 分</span>
              <span class="info-label"> （如果收到决赛通知，请联系助教可以有额外加分）</span>
            </div>
            <div class="info-item substitute-hint">
              <span class="info-label">📌 此分数可替代</span>
              <span class="info-value highlight">第 {{ agentProject.substituteHomework }} 次作业</span>
              <span class="info-label">的成绩</span>
            </div>
            <div class="info-item" v-if="agentProject.feedback">
              <span class="info-label">评语：</span>
              <span class="info-value">{{ agentProject.feedback }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="results-grid">
        <div 
          v-for="result in results" 
          :key="`${result.server}-${result.assignment}`"
          class="result-card"
        >
          <div v-if="result.status === '未提交'" class="warning-banner">
            ⚠️ 此作业尚未提交，请尽快完成提交
          </div>
          <div class="card-header">
            <div class="header-row">
              <h4>{{ getAssignmentTitle(result.assignment) }}</h4>
              <span :class="['status-badge', result.status === '已提交' ? 'submitted' : 'not-submitted']">
                {{ result.status }}
              </span>
              <div class="score-display">
                <span v-if="result.status === '未提交'" class="no-score">未提交</span>
                <span v-else-if="result.score !== null" class="score">{{ result.score }}/{{ getFullScore(result.assignment) }} 分</span>
                <span v-else class="no-score">未评分</span>
              </div>
            </div>
          </div>

          <div class="card-body">
            <div class="info-row">
              <span class="label">内容修改时间：</span>
              <span class="value">{{ result.submitTime || '未提交' }}</span>
            </div>
            <div class="info-row">
              <span class="label">检查时间：</span>
              <span class="value">{{ result.checkTime || '-' }}</span>
            </div>
          </div>

          <div class="card-footer">
            <div v-if="result.status === '未提交'" class="no-feedback-hint">
              暂无评语
            </div>
            <div v-else-if="result.feedback" class="feedback-section">
              <button 
                class="feedback-toggle"
                @click="toggleFeedback(result)"
              >
                <span>{{ result.showFeedback ? '收起评语' : '查看评语' }}</span>
                <svg 
                  class="toggle-icon"
                  :class="{ expanded: result.showFeedback }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div v-show="result.showFeedback" class="feedback-content">
                <pre>{{ result.feedback }}</pre>
              </div>
            </div>
            <div v-else class="no-feedback-hint">
              暂无评语
            </div>
          </div>
        </div>
      </div>

      <!-- 讲座课成绩板块 -->
      <div class="lecture-course-banner">
        <div class="banner-icon">📚</div>
        <div class="banner-content">
          <h4>其余的6次讲座课</h4>
          <div class="lecture-info">
            <div class="info-item">
              <span class="info-label">总分：</span>
              <span class="info-value highlight">30 分</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && !error && results.length === 0 && hasSearched" class="no-results">
      <p>未找到学号 "{{ queriedStudentId }}" 的成绩信息</p>
      <p>请检查学号是否正确，或联系助教确认。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import yaml from 'js-yaml'

const studentId = ref('')
const studentName = ref('')
const queriedStudentId = ref('')
const loading = ref(false)
const error = ref('')
const results = ref([])
const hasSearched = ref(false)

// 图书馆 agent 比赛项目信息
const agentProject = ref(null)

const servers = ['58', '132', '197']
const MAX_ASSIGNMENTS = 6

function getAssignmentTitle(assignmentNum) {
  if (assignmentNum === 5) {
    return '讲座课小作业：Monte Carlo 方法采样 Ising 模型'
  }
  if (assignmentNum === 6) {
    return '陈基老师课堂小测'
  }
  return `作业 ${assignmentNum}`
}

function getFullScore(assignmentNum) {
  if (assignmentNum === 5) {
    return 5
  }
  if (assignmentNum === 6) {
    return 5
  }
  return 10
}

async function fetchCSV(url) {
  try {
    const cacheBuster = Date.now()
    const urlWithCache = `${url}?v=${cacheBuster}`
    const response = await fetch(urlWithCache)
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
    const cacheBuster = Date.now()
    const urlWithCache = `${url}?v=${cacheBuster}`
    const response = await fetch(urlWithCache)
    if (!response.ok) {
      return null
    }
    return await response.text()
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, err)
    return null
  }
}

async function fetchExtraYaml() {
  try {
    const cacheBuster = Date.now()
    const url = `/score/extra.yaml?v=${cacheBuster}`
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }
    const text = await response.text()
    return yaml.load(text)
  } catch (err) {
    console.warn('Failed to fetch extra.yaml:', err)
    return null
  }
}

function checkAgentProject(extraData, studentIdValue) {
  if (!extraData || !extraData['图书馆 agent 比赛']) {
    return null
  }
  
  const agentData = extraData['图书馆 agent 比赛']
  const studentKey = `stu${studentIdValue}`
  
  if (agentData[studentKey]) {
    return {
      score: agentData[studentKey].score,
      feedback: agentData[studentKey].feedback,
      substituteHomework: agentData[studentKey].substitute_homework
    }
  }
  
  return null
}

function toggleFeedback(result) {
  result.showFeedback = !result.showFeedback
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
  queriedStudentId.value = studentId.value
  agentProject.value = null

  try {
    // 查询图书馆 agent 比赛项目信息
    const extraData = await fetchExtraYaml()
    agentProject.value = checkAgentProject(extraData, studentId.value)

    const allResults = []

    for (const server of servers) {
      for (let assignmentNum = 1; assignmentNum <= MAX_ASSIGNMENTS; assignmentNum++) {
        const csvUrl = `/score/${server}/assignment${assignmentNum}_update_log.csv`
        const csvData = await fetchCSV(csvUrl)
        
        const studentRecord = csvData.find(row => row['学号'] === studentId.value)
        
        if (studentRecord) {
          if (!studentName.value) {
            studentName.value = studentRecord['姓名']
          }

          // 尝试两种文件命名格式：横线和下划线
          const scoreUrl1 = `/score/${server}/stu${studentId.value}/${assignmentNum}-score.txt`
          const scoreUrl2 = `/score/${server}/stu${studentId.value}/${assignmentNum}_score.txt`
          const feedbackUrl1 = `/score/${server}/stu${studentId.value}/${assignmentNum}-feedback.txt`
          const feedbackUrl2 = `/score/${server}/stu${studentId.value}/${assignmentNum}_feedback.txt`
          
          // 先尝试横线格式，失败则尝试下划线格式
          let scoreText = await fetchTextFile(scoreUrl1)
          if (!scoreText) {
            scoreText = await fetchTextFile(scoreUrl2)
          }
          
          let feedbackText = await fetchTextFile(feedbackUrl1)
          if (!feedbackText) {
            feedbackText = await fetchTextFile(feedbackUrl2)
          }

          const result = {
            server,
            assignment: assignmentNum,
            status: studentRecord['作业状态'],
            submitTime: studentRecord['最后修改时间'],
            checkTime: studentRecord['检查时间'],
            score: scoreText ? parseFloat(scoreText.trim()) : null,
            feedback: feedbackText ? feedbackText.trim() : null,
            showFeedback: false
          }

          allResults.push(result)
        }
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
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.query-form {
  background: var(--vp-c-bg-soft);
  padding: 24px;
  border-radius: 8px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
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

.input-group .input-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group .label-text {
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
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-group input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.input-group button {
  padding: 12px 24px;
  background: var(--vp-c-brand-1);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.input-group button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  transform: translateY(-1px);
}

.input-group button:active:not(:disabled) {
  transform: translateY(0);
}

.input-group button:disabled {
  background: var(--vp-c-gray-2);
  cursor: not-allowed;
  opacity: 0.6;
}

.error-message {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 24px;
  border-left: 4px solid var(--vp-c-danger-1);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
}

.results h3 {
  margin-bottom: 24px;
  color: var(--vp-c-text-1);
  font-size: 20px;
}

/* 图书馆 agent 比赛项目提示框样式 */
.agent-project-banner {
  display: flex;
  gap: 16px;
  padding: 20px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--vp-c-success-soft) 0%, rgba(16, 185, 129, 0.1) 100%);
  border: 1px solid var(--vp-c-success-1);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
}

.banner-icon {
  font-size: 36px;
  line-height: 1;
  flex-shrink: 0;
}

.banner-content {
  flex: 1;
}

.banner-content h4 {
  margin: 0 0 12px 0;
  color: var(--vp-c-success-1);
  font-size: 18px;
  font-weight: 600;
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-info .info-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 14px;
}

.project-info .info-label {
  color: var(--vp-c-text-2);
}

.project-info .info-value {
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.project-info .info-value.highlight {
  color: var(--vp-c-success-1);
  font-weight: 600;
  font-size: 15px;
}

.project-info .substitute-hint {
  background: rgba(16, 185, 129, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .agent-project-banner {
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  
  .banner-icon {
    font-size: 28px;
  }
  
  .banner-content h4 {
    font-size: 16px;
  }
}

/* 讲座课成绩板块样式 */
.lecture-course-banner {
  display: flex;
  gap: 16px;
  padding: 20px;
  margin-top: 24px;
  background: linear-gradient(135deg, var(--vp-c-indigo-soft) 0%, rgba(99, 102, 241, 0.1) 100%);
  border: 1px solid var(--vp-c-indigo-1);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.lecture-course-banner .banner-content h4 {
  margin: 0 0 12px 0;
  color: var(--vp-c-indigo-1);
  font-size: 18px;
  font-weight: 600;
}

.lecture-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lecture-info .info-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 14px;
}

.lecture-info .info-label {
  color: var(--vp-c-text-2);
}

.lecture-info .info-value {
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.lecture-info .info-value.highlight {
  color: var(--vp-c-indigo-1);
  font-weight: 600;
  font-size: 15px;
}

.lecture-info .lecture-hint {
  background: rgba(99, 102, 241, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .lecture-course-banner {
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  
  .lecture-course-banner .banner-content h4 {
    font-size: 16px;
  }
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.result-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;
}

.result-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.warning-banner {
  padding: 10px 12px;
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  border-bottom: 2px solid var(--vp-c-warning-1);
}

.card-header {
  padding: 10px 12px;
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.header-row h4 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 14px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.submitted {
  background: var(--vp-c-success-soft);
  color: var(--vp-c-success-1);
}

.status-badge.not-submitted {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}

.score-display {
  text-align: right;
  flex-shrink: 0;
  min-width: 60px;
}

.score-display .score {
  font-size: 18px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  line-height: 1;
}

.score-display .no-score {
  font-size: 13px;
  color: var(--vp-c-text-3);
  font-style: italic;
}

.card-body {
  padding: 8px 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 0;
  gap: 8px;
}

.info-row .label {
  color: var(--vp-c-text-2);
  font-size: 13px;
  flex-shrink: 0;
}

.info-row .value {
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.card-footer {
  padding: 8px 12px;
  background: var(--vp-c-bg);
  border-top: 1px solid var(--vp-c-divider);
}

.no-feedback-hint {
  text-align: center;
  color: var(--vp-c-text-3);
  font-size: 13px;
  font-style: italic;
  padding: 4px 0;
}

.feedback-section {
  width: 100%;
}

.feedback-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.feedback-toggle:hover {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
}

.toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.2s;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

.feedback-content {
  margin-top: 8px;
  padding: 10px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.feedback-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
}

.no-results {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

.no-results p {
  margin: 8px 0;
}

@media (max-width: 768px) {
  .results-grid {
    grid-template-columns: 1fr;
  }
  
  .header-row {
    flex-wrap: wrap;
  }
  
  .score-display {
    flex-basis: 100%;
    text-align: left;
    margin-top: 4px;
  }
  
  .score-display .score {
    font-size: 20px;
  }
}

/* 滚动条样式 */
.feedback-content::-webkit-scrollbar {
  width: 8px;
}

.feedback-content::-webkit-scrollbar-track {
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
}

.feedback-content::-webkit-scrollbar-thumb {
  background: var(--vp-c-divider);
  border-radius: 4px;
}

.feedback-content::-webkit-scrollbar-thumb:hover {
  background: var(--vp-c-text-3);
}
</style>
