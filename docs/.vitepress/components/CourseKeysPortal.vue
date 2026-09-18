<template>
  <section class="course-keys" :aria-label="isAdmin ? '公钥管理' : '公钥提交'">
    <div class="ck-heading">
      <span class="ck-eyebrow">AI × PHYSICS · SSH</span>
      <h1>{{ isAdmin ? '课程公钥管理' : '连接课程服务器' }}</h1>
      <p>{{ isAdmin ? '核对选课名单，管理自动导入与公钥操作。' : '验证学校邮箱并提交公钥，页面显示已导入后即可使用 SSH 登录。' }}</p>
    </div>
    <p v-if="booting" class="ck-note" role="status">正在连接公钥服务…</p>
    <div v-else-if="bootError" class="ck-alert ck-alert-error" role="alert"><p>{{ bootError }}</p><button type="button" class="ck-button" @click="initialize">重新连接</button></div>
    <template v-else>
      <div v-if="health.enrollmentMode === 'closed'" class="ck-alert" role="status">学生公钥提交暂未开放。助教可登录管理页面完成准备工作，开放时间以课程通知为准。</div>
      <div v-else-if="health.enrollmentMode === 'pilot'" class="ck-alert" role="status">当前仅向指定测试学生开放，其他同学请等待课程通知。</div>
      <div v-if="!health.mailConfigured" class="ck-alert" role="status">邮件服务尚未就绪，暂时无法发送登录验证码。请稍后重试或联系课程助教。</div>
      <div v-if="session.user" class="ck-session">
        <span>已登录：<strong>{{ session.user.email }}</strong><span class="ck-tag">{{ session.user.role === 'admin' ? '助教' : '学生' }}</span></span>
        <button type="button" class="ck-button ck-button-quiet" :disabled="authBusy" @click="logout">退出登录</button>
      </div>
      <div v-if="session.user && session.user.role !== mode" class="ck-alert">当前为{{ session.user.role === 'admin' ? '助教' : '学生' }}身份，请退出后以{{ isAdmin ? '助教邮箱' : '学生学号' }}登录此页面。</div>
      <form v-if="(!session.user || reauth) && (isAdmin || health.enrollmentOpen)" class="ck-card ck-login" @submit.prevent="challengeId ? verifyCode() : requestCode()">
        <h2>{{ reauth ? '重新验证助教身份' : (isAdmin ? '助教登录' : '验证你的学校邮箱') }}</h2>
        <p v-if="reauth" class="ck-muted">执行公钥、名单或自动导入设置操作前需要最近十分钟内的身份验证。之前的选择已保留，验证后请检查待确认内容并再次确认。</p>
        <p v-else class="ck-muted">{{ isAdmin ? '仅预先登记的管理员邮箱可以登录。' : '验证码将发送到学号对应的学校邮箱，只有选课名单中的学生可以提交。' }}</p>
        <label :for="isAdmin ? 'ck-admin-email' : 'ck-student-id'">{{ isAdmin ? '管理员邮箱' : '学号' }}</label>
        <input v-if="isAdmin" id="ck-admin-email" v-model.trim="identity" type="email" autocomplete="username" required :disabled="authBusy || !!challengeId" placeholder="请输入登记的管理员邮箱" />
        <input v-else id="ck-student-id" v-model.trim="identity" type="text" inputmode="numeric" pattern="[0-9]+" autocomplete="username" required :disabled="authBusy || !!challengeId" placeholder="请输入完整学号" />
        <p v-if="!isAdmin && identity" class="ck-muted ck-email">{{ identity }}@stu.pku.edu.cn</p>
        <template v-if="challengeId">
          <label for="ck-login-code">邮箱验证码</label>
          <input id="ck-login-code" v-model.trim="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required :disabled="authBusy" placeholder="6 位数字" />
          <p class="ck-muted">验证码十分钟内有效。未收到时请检查垃圾邮件；名单或邮箱有误请联系助教。</p>
        </template>
        <p v-if="authMessage" class="ck-success" role="status">{{ authMessage }}</p><p v-if="authError" class="ck-error" role="alert">{{ authError }}</p>
        <div class="ck-actions">
          <button class="ck-button ck-button-primary" type="submit" :disabled="authBusy || !health.mailConfigured">{{ authBusy ? '处理中…' : (challengeId ? '验证并登录' : '发送验证码') }}</button>
          <button v-if="challengeId" class="ck-button" type="button" :disabled="authBusy || resendSeconds > 0" @click="requestCode">{{ resendSeconds > 0 ? `${resendSeconds} 秒后可重发` : '重新发送' }}</button>
          <button v-if="challengeId && !reauth" class="ck-button ck-button-quiet" type="button" :disabled="authBusy" @click="resetIdentity">修改{{ isAdmin ? '邮箱' : '学号' }}</button>
          <button v-if="reauth" class="ck-button ck-button-quiet" type="button" :disabled="authBusy" @click="cancelReauth">暂不操作，返回名单</button>
        </div>
      </form>
      <CourseKeysStudent v-if="session.user?.role === 'student' && !isAdmin" :api="api" :enrollment-open="health.enrollmentOpen" :servers="health.servers" />
      <CourseKeysAdmin v-if="session.user?.role === 'admin' && isAdmin" v-show="!reauth" :api="api" :servers="health.servers" :active="!reauth" />
    </template>
    <div class="ck-footer-links"><a href="/course/ssh-keys-guide">学生操作指南</a><a v-if="!isAdmin" href="/course/ssh-keys-admin">助教管理入口</a><a v-else href="/course/ssh-keys-admin-guide">助教操作说明</a></div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import CourseKeysStudent from './CourseKeysStudent.vue'
import CourseKeysAdmin from './CourseKeysAdmin.vue'
const props = withDefaults(defineProps<{ mode?: 'student' | 'admin' }>(), { mode: 'student' })
const isAdmin = props.mode === 'admin'
const booting = ref(true)
const bootError = ref('')
const health = reactive({ enrollmentOpen: false, enrollmentMode: 'closed' as 'closed' | 'pilot' | 'open', mailConfigured: false, servers: [] as { id: string; label: string }[] })
const session = reactive<{ user: null | { role: string; email: string; studentId?: string }; csrfToken: string | null; verifiedAt: string | null }>({ user: null, csrfToken: null, verifiedAt: null })
const identity = ref(''), challengeId = ref(''), code = ref('')
const reauth = ref(false), authBusy = ref(false), authMessage = ref(''), authError = ref(''), resendSeconds = ref(0)
let countdown: ReturnType<typeof setInterval> | undefined
async function api(path: string, options: { method?: string; body?: unknown; download?: boolean } = {}) {
  const method = options.method || 'GET'
  const headers: Record<string, string> = { Accept: options.download ? 'application/octet-stream' : 'application/json' }
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && session.csrfToken) headers['x-csrf-token'] = session.csrfToken
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  let response: Response
  try {
    response = await fetch(`/api/course-keys${path}`, { method, headers, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, body: options.body === undefined ? undefined : isForm ? options.body as FormData : JSON.stringify(options.body) })
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'AbortError' ? '请求超时。操作结果可能尚未返回，请刷新状态后再重试。' : '暂时无法连接服务，请检查网络后重试。')
  } finally { clearTimeout(timeout) }
  if (response.ok && options.download) return response.blob()
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error?.message || `请求失败（${response.status}），请稍后重试。`) as Error & { code?: string; status?: number }
    error.code = data?.error?.code; error.status = response.status
    if (error.code === 'REAUTH_REQUIRED' && isAdmin) {
      identity.value = session.user?.email || identity.value; reauth.value = true
      challengeId.value = ''; code.value = ''; authError.value = ''; authMessage.value = ''
    } else if (response.status === 401 && session.user && !path.startsWith('/auth/')) {
      session.user = null; session.csrfToken = null; authError.value = '登录已过期，请重新验证邮箱。'
    }
    throw error
  }
  if (data === null && response.status !== 204) throw new Error('服务返回了无法识别的结果，请刷新后重试。')
  return data
}
async function initialize() {
  booting.value = true; bootError.value = ''
  try {
    const [status, current] = await Promise.all([api('/health'), api('/auth/session')])
    if (!status?.ok) throw new Error('公钥服务正在维护，请稍后重试。')
    Object.assign(health, status, { enrollmentMode: status.enrollmentMode || (status.enrollmentOpen ? 'open' : 'closed') }); Object.assign(session, current)
    if (isAdmin && current.user?.role === 'admin') identity.value = current.user.email
  } catch (error) { bootError.value = error instanceof Error ? error.message : '无法连接公钥服务。' }
  finally { booting.value = false }
}
async function requestCode() {
  if (authBusy.value || resendSeconds.value > 0) return
  authBusy.value = true; authError.value = ''; authMessage.value = ''
  try {
    const result = await api('/auth/request-code', { method: 'POST', body: isAdmin ? { role: 'admin', email: identity.value } : { role: 'student', studentId: identity.value } })
    challengeId.value = result.challengeId; code.value = ''; authMessage.value = result.message || '如身份信息有效，验证码已发送，请检查邮箱。'
    resendSeconds.value = 60
    if (countdown) clearInterval(countdown)
    countdown = setInterval(() => { if (resendSeconds.value > 0) resendSeconds.value--; else if (countdown) clearInterval(countdown) }, 1000)
  } catch (error) { authError.value = error instanceof Error ? error.message : '发送失败，请重试。' }
  finally { authBusy.value = false }
}
async function verifyCode() {
  if (authBusy.value) return
  authBusy.value = true; authError.value = ''
  try {
    const current = await api('/auth/verify', { method: 'POST', body: { challengeId: challengeId.value, code: code.value } })
    Object.assign(session, current); reauth.value = false; challengeId.value = ''; code.value = ''; authMessage.value = ''
  } catch (error) { authError.value = error instanceof Error ? error.message : '验证失败，请重试。' }
  finally { authBusy.value = false }
}
function resetIdentity() { challengeId.value = ''; code.value = ''; authError.value = ''; authMessage.value = ''; resendSeconds.value = 0; if (countdown) clearInterval(countdown) }
function cancelReauth() { reauth.value = false; resetIdentity() }
async function logout() {
  authBusy.value = true; authError.value = ''
  try { await api('/auth/logout', { method: 'POST', body: {} }); session.user = null; session.csrfToken = null; session.verifiedAt = null; reauth.value = false; resetIdentity() }
  catch (error) { bootError.value = error instanceof Error ? error.message : '退出失败，请重试。' }
  finally { authBusy.value = false }
}
onMounted(initialize)
onUnmounted(() => { if (countdown) clearInterval(countdown) })
</script>

<style>
.course-keys { --ck-accent: #087a6c; --ck-tint: #087a6c0d; color: var(--vp-c-text-1); margin: 8px auto 40px; }
.dark .course-keys { --ck-accent: #65d5c0; --ck-tint: #65d5c00d; }
.course-keys .ck-heading { margin-bottom: 28px; }
.course-keys .ck-eyebrow { color: var(--ck-accent); font-size: 11px; letter-spacing: .17em; font-weight: 700; }
.course-keys h1 { margin: 12px 0; font-size: clamp(28px, 4vw, 38px); line-height: 1.2; letter-spacing: -.035em; }
.course-keys .ck-heading p { margin: 0; color: var(--vp-c-text-2); line-height: 1.8; }
.course-keys h2 { margin: 0 0 16px; padding: 0; border: 0; font-size: 20px; line-height: 1.5; }
.course-keys h3 { margin: 0 0 12px; font-size: 16px; }
.course-keys p { line-height: 1.7; }
.course-keys .ck-card { border: 1px solid var(--vp-c-divider); border-radius: 14px; padding: 24px; margin: 20px 0; background: var(--vp-c-bg); }
.course-keys .ck-login { max-width: 530px; border-top: 3px solid var(--ck-accent); }
.course-keys label { display: block; font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
.course-keys input:not([type=checkbox]), .course-keys select { display: block; border: 1px solid var(--vp-c-divider); border-radius: 7px; padding: 10px 12px; width: 100%; max-width: 100%; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; font-size: 14px; }
.course-keys input[type=file] { padding: 12px; }
.course-keys input[type=checkbox] { accent-color: var(--ck-accent); width: 16px; height: 16px; cursor: pointer; }
.course-keys input:focus-visible, .course-keys select:focus-visible, .course-keys button:focus-visible, .course-keys summary:focus-visible, .course-keys a:focus-visible { outline: 2px solid var(--ck-accent); outline-offset: 3px; }
.course-keys .ck-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 18px; }
.course-keys .ck-button { display: inline-flex; justify-content: center; align-items: center; gap: 5px; min-height: 36px; border-radius: 7px; border: 1px solid var(--vp-c-divider); padding: 7px 13px; color: var(--vp-c-text-1); background: var(--vp-c-bg); font-size: 13px; line-height: 1.45; font-weight: 600; cursor: pointer; text-decoration: none; }
.course-keys .ck-button:hover:not(:disabled) { border-color: var(--ck-accent); color: var(--ck-accent); }
.course-keys .ck-button-primary { background: var(--ck-accent); color: var(--vp-c-bg); border-color: var(--ck-accent); }
.course-keys .ck-button-primary:hover:not(:disabled) { background: var(--ck-accent); color: var(--vp-c-bg); filter: brightness(.92); }
.course-keys .ck-button-quiet { border-color: transparent; background: transparent; }
.course-keys .ck-button-danger { color: var(--vp-c-danger-1); }
.course-keys button:disabled, .course-keys input:disabled, .course-keys select:disabled { opacity: .48; cursor: not-allowed; }
.course-keys .ck-muted, .course-keys .ck-note { color: var(--vp-c-text-2); font-size: 13px; }
.course-keys .ck-email { margin-top: 5px; overflow-wrap: anywhere; }
.course-keys .ck-alert { padding: 14px 18px; margin: 16px 0; border: 1px solid var(--vp-c-divider); border-left: 3px solid var(--ck-accent); border-radius: 7px; background: var(--ck-tint); font-size: 14px; line-height: 1.7; }
.course-keys .ck-alert p { margin: 0 0 8px; }
.course-keys .ck-alert-error { border-left-color: var(--vp-c-danger-1); }
.course-keys .ck-error { color: var(--vp-c-danger-1); font-size: 13px; overflow-wrap: anywhere; }
.course-keys .ck-success { color: var(--ck-accent); font-size: 13px; }
.course-keys .ck-session { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--vp-c-divider); padding: 8px 0 16px; font-size: 13px; overflow-wrap: anywhere; }
.course-keys .ck-tag { display: inline-block; margin: 3px 0 3px 8px; padding: 2px 7px; border-radius: 4px; background: var(--vp-c-bg-soft); font-size: 11px; white-space: nowrap; }
.course-keys .ck-tag-good { color: var(--ck-accent); background: var(--ck-tint); }
.course-keys .ck-tag-bad { color: var(--vp-c-danger-1); }
.course-keys .ck-footer-links { display: flex; gap: 20px; margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--vp-c-divider); font-size: 13px; }
.course-keys .ck-table-wrap { width: 100%; overflow-x: auto; margin-top: 16px; }
.course-keys table { display: table; width: 100%; margin: 0; font-size: 12px; border-collapse: collapse; }
.course-keys tr { background: none; border: 0; }
.course-keys tr:nth-child(2n) { background: none; }
.course-keys th, .course-keys td { border: 0; border-bottom: 1px solid var(--vp-c-divider); padding: 12px 10px; text-align: left; vertical-align: top; }
.course-keys th { background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); font-size: 11px; font-weight: 600; white-space: nowrap; }
.course-keys td .ck-muted { font-size: 11px; }
.course-keys .ck-mono { font-family: var(--vp-font-family-mono); font-size: 12px; overflow-wrap: anywhere; }
.course-keys .ck-key { display: block; white-space: pre-wrap; word-break: break-all; margin: 8px 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-soft); font-family: var(--vp-font-family-mono); font-size: 11px; line-height: 1.8; max-height: 160px; overflow-y: auto; }
.course-keys summary { cursor: pointer; font-size: 13px; color: var(--ck-accent); }
.course-keys details { margin: 8px 0; }
.course-keys .ck-empty { padding: 36px 16px; text-align: center; color: var(--vp-c-text-2); font-size: 14px; }
@media (max-width: 640px) { .course-keys .ck-card { padding: 18px 14px; } .course-keys .ck-session { align-items: flex-start; } .course-keys th, .course-keys td { padding: 10px 7px; } }
</style>
