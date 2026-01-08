<template>
  <div v-if="showSurvey" class="feedback-survey-overlay">
    <div class="feedback-survey-modal" @click.stop>
      <button class="close-button" @click="closeSurvey" title="关闭">×</button>

      <div class="survey-header">
        <h2>课程反馈问卷</h2>
        <p>感谢您使用本课程网站！我们希望收集您的宝贵意见以改进课程质量。</p>
      </div>

      <form @submit.prevent="submitSurvey" class="survey-form">
        <div class="form-group">
          <label for="satisfaction">
            1. 您对课程内容的整体满意度如何？
            <span class="required">*</span>
          </label>
          <div class="radio-group">
            <label v-for="option in satisfactionOptions" :key="option.value">
              <input
                type="radio"
                v-model="formData.satisfaction"
                :value="option.value"
                required
              />
              {{ option.label }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="difficulty">
            2. 您认为课程难度如何？
            <span class="required">*</span>
          </label>
          <div class="radio-group">
            <label v-for="option in difficultyOptions" :key="option.value">
              <input
                type="radio"
                v-model="formData.difficulty"
                :value="option.value"
                required
              />
              {{ option.label }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="mostHelpful">
            3. 您觉得哪部分内容最有帮助？
            <span class="required">*</span>
          </label>
          <div class="checkbox-group">
            <label v-for="option in helpfulOptions" :key="option.value">
              <input
                type="checkbox"
                v-model="formData.mostHelpful"
                :value="option.value"
              />
              {{ option.label }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="suggestions">
            4. 您对课程有什么建议或意见？
          </label>
          <textarea
            v-model="formData.suggestions"
            id="suggestions"
            rows="4"
            placeholder="请输入您的建议..."
          ></textarea>
        </div>

        <div class="form-group">
          <label for="contact">
            5. 如果您愿意，可以留下联系方式（可选）
          </label>
          <input
            type="text"
            v-model="formData.contact"
            id="contact"
            placeholder="邮箱或其他联系方式"
          />
        </div>

        <div class="form-actions">
          <button type="submit" class="submit-button" :disabled="isSubmitting">
            {{ isSubmitting ? '提交中...' : '提交反馈' }}
          </button>
          <button type="button" class="skip-button" @click="skipSurvey">
            暂不填写
          </button>
        </div>

        <div v-if="submitMessage" class="submit-message" :class="submitStatus">
          {{ submitMessage }}
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const SURVEY_STORAGE_KEY = 'ai4s_survey_completed'
const SURVEY_VERSION = 'v1' // 如果需要重新收集反馈，可以更新版本号

const showSurvey = ref(false)
const isSubmitting = ref(false)
const submitMessage = ref('')
const submitStatus = ref<'success' | 'error' | ''>('')

const formData = ref({
  satisfaction: '',
  difficulty: '',
  mostHelpful: [] as string[],
  suggestions: '',
  contact: ''
})

const satisfactionOptions = [
  { value: '5', label: '非常满意' },
  { value: '4', label: '满意' },
  { value: '3', label: '一般' },
  { value: '2', label: '不满意' },
  { value: '1', label: '非常不满意' }
]

const difficultyOptions = [
  { value: 'too_easy', label: '太简单' },
  { value: 'appropriate', label: '适中' },
  { value: 'challenging', label: '有挑战性' },
  { value: 'too_hard', label: '太难' }
]

const helpfulOptions = [
  { value: 'llm_agent', label: 'LLM Agent 技术文档' },
  { value: 'assignments', label: '作业指南' },
  { value: 'setup', label: '环境配置说明' },
  { value: 'computer_basic', label: '计算机基础知识' },
  { value: 'ai_basic', label: 'AI 基础知识' },
  { value: 'code_examples', label: '代码示例' }
]

onMounted(() => {
  // 检查用户是否已经完成过问卷
  const surveyCompleted = localStorage.getItem(SURVEY_STORAGE_KEY)

  // 如果没有完成过，或者版本不匹配，则显示问卷
  if (surveyCompleted !== SURVEY_VERSION) {
    // 延迟3秒后显示问卷，避免影响用户体验
    setTimeout(() => {
      showSurvey.value = true
    }, 3000)
  }
})

const closeSurvey = () => {
  showSurvey.value = false
}

const skipSurvey = () => {
  // 标记为已完成，下次不再显示
  localStorage.setItem(SURVEY_STORAGE_KEY, SURVEY_VERSION)
  closeSurvey()
}

const submitSurvey = async () => {
  if (!formData.value.satisfaction || !formData.value.difficulty) {
    submitMessage.value = '请填写必填项'
    submitStatus.value = 'error'
    setTimeout(() => {
      submitMessage.value = ''
    }, 3000)
    return
  }

  if (formData.value.mostHelpful.length === 0) {
    submitMessage.value = '请至少选择一个有帮助的内容'
    submitStatus.value = 'error'
    setTimeout(() => {
      submitMessage.value = ''
    }, 3000)
    return
  }

  isSubmitting.value = true
  submitMessage.value = ''

  try {
    // 准备提交数据
    const submitData = {
      ...formData.value,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      surveyVersion: SURVEY_VERSION
    }

    // 发送到后端 API
    const response = await fetch('/api/feedback/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(submitData)
    })

    if (response.ok) {
      submitMessage.value = '感谢您的反馈！'
      submitStatus.value = 'success'

      // 标记为已完成
      localStorage.setItem(SURVEY_STORAGE_KEY, SURVEY_VERSION)

      // 2秒后关闭问卷
      setTimeout(() => {
        closeSurvey()
      }, 2000)
    } else {
      throw new Error('提交失败')
    }
  } catch (error) {
    console.error('提交反馈时出错:', error)
    submitMessage.value = '提交失败，请稍后重试'
    submitStatus.value = 'error'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.feedback-survey-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  padding: 20px;
  overflow-y: auto;
}

.feedback-survey-modal {
  background: var(--vp-c-bg);
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  position: relative;
  padding: 30px;
}

.close-button {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--vp-c-text-2);
  line-height: 1;
  padding: 5px 10px;
  transition: color 0.2s;
}

.close-button:hover {
  color: var(--vp-c-text-1);
}

.survey-header {
  margin-bottom: 25px;
}

.survey-header h2 {
  margin: 0 0 10px 0;
  color: var(--vp-c-text-1);
  font-size: 24px;
}

.survey-header p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}

.survey-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-group label {
  font-weight: 500;
  color: var(--vp-c-text-1);
  font-size: 15px;
}

.required {
  color: #ef4444;
  margin-left: 2px;
}

.radio-group,
.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 10px;
}

.radio-group label,
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: normal;
  padding: 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.radio-group label:hover,
.checkbox-group label:hover {
  background: var(--vp-c-bg-soft);
}

input[type="radio"],
input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

textarea,
input[type="text"] {
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  transition: border-color 0.2s;
}

textarea:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--vp-c-brand);
}

textarea {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}

.submit-button,
.skip-button {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.submit-button {
  background: var(--vp-c-brand);
  color: white;
  flex: 1;
}

.submit-button:hover:not(:disabled) {
  background: var(--vp-c-brand-dark);
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.skip-button {
  background: transparent;
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
}

.skip-button:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.submit-message {
  padding: 12px;
  border-radius: 6px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
}

.submit-message.success {
  background: #10b98133;
  color: #10b981;
}

.submit-message.error {
  background: #ef444433;
  color: #ef4444;
}

@media (max-width: 768px) {
  .feedback-survey-modal {
    padding: 20px;
    margin: 10px;
  }

  .survey-header h2 {
    font-size: 20px;
  }

  .form-actions {
    flex-direction: column;
  }

  .skip-button {
    order: -1;
  }
}
</style>
