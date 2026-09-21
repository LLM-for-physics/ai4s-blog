<template>
  <div>
    <ol class="ck-steps" aria-label="提交进度">
      <li class="ck-step-done"><span>1</span>邮箱已验证</li>
      <li :class="{ 'ck-step-done': student?.submitted }"><span>2</span>提交公钥</li>
      <li :class="{ 'ck-step-done': student?.importStatus === 'installed' }"><span>3</span>公钥导入服务器</li>
    </ol>
    <p v-if="loading" class="ck-note" role="status">正在获取你的提交情况…</p>
    <div v-if="loadError" class="ck-alert ck-alert-error" role="alert"><p>{{ loadError }}</p><button class="ck-button" type="button" :disabled="loading" @click="refresh()">重新获取</button></div>
    <template v-if="student">
      <div class="ck-card">
        <div class="ck-student-header"><h2>{{ student.name }} · {{ student.studentId }}</h2><span class="ck-tag" :class="{ 'ck-tag-good': student.importStatus === 'installed', 'ck-tag-bad': student.importStatus === 'failed' }">{{ displayImportStatus }}</span></div>
        <dl class="ck-student-meta"><div><dt>学校邮箱</dt><dd>{{ student.email }}</dd></div><div><dt>服务器</dt><dd>{{ serverLabel(student.serverId) }}</dd></div><div><dt>登录用户名</dt><dd class="ck-mono">{{ student.username }}</dd></div><div><dt>账号准备情况</dt><dd>{{ accountLabels[student.accountStatus] || student.accountStatus }}</dd></div></dl>
        <p class="ck-muted">服务器由助教在名单中分配，登录用户名为 stu 加完整学号。实际开放和连接方式以课程通知为准。</p>
        <p v-if="student.accountStatus === 'missing'" class="ck-alert">服务器账号尚未创建，已提交的公钥会保留。账号准备完成后，等待中的自动导入会继续检查；助教也可手动导入，无需再次上传。</p>
        <p v-else-if="student.accountStatus === 'unauthorized'" class="ck-note">账号待管理员授权，公钥可先提交并保存。</p>
        <div v-if="student.autoImportBlocked || student.autoImport?.status" class="ck-alert" role="status">
          <strong>{{ student.autoImportBlocked ? '该学生的自动导入已暂停' : autoImportLabels[student.autoImport?.status || ''] }}</strong>
          <p v-if="student.autoImportBlocked">助教手动撤销了课程公钥。重新上传不会自动恢复，请联系助教；人工导入或恢复成功后才会解除暂停。</p>
          <p v-else>{{ student.autoImport?.message || autoImportMessages[student.autoImport?.status || ''] }}</p>
        </div>
        <p v-if="student.lastError" class="ck-error" role="status">最近一次导入：{{ student.lastError }}</p>
        <div v-if="student.latestKey" class="ck-key-summary">
          <h3>最近提交的公钥 <span class="ck-tag">第 {{ student.latestKey.version }} 版</span></h3>
          <p class="ck-muted">{{ student.latestKey.algorithm }} · {{ student.latestKey.bits }} 位 · {{ formatDate(student.latestKey.createdAt) }}</p>
          <p class="ck-mono">{{ student.latestKey.fingerprint }}</p>
          <details><summary>查看完整公钥</summary><code class="ck-key">{{ student.latestKey.publicKey }}</code><button class="ck-button" type="button" @click="copyKey(student.latestKey.publicKey)">复制公钥</button></details>
        </div>
        <div v-if="student.installedKey && student.latestKey?.id !== student.installedKey.id" class="ck-key-summary">
          <h3>服务器当前使用的课程公钥 <span class="ck-tag">第 {{ student.installedKey.version }} 版</span></h3>
          <p class="ck-mono">{{ student.installedKey.fingerprint }}</p><p class="ck-muted">新提交的公钥尚未替换此公钥，请以上方导入状态为准。</p>
          <details><summary>查看已安装公钥</summary><code class="ck-key">{{ student.installedKey.publicKey }}</code></details>
        </div>
        <p v-if="student.importStatus === 'installed'" class="ck-success">课程公钥已写入服务器。请使用这把公钥对应的本地私钥进行 SSH 登录验证。</p>
        <p v-if="student.importStatus === 'revoked'" class="ck-note">当前课程公钥已撤销。如需恢复使用，请联系助教。</p>
        <button class="ck-button ck-button-quiet" type="button" :disabled="loading || uploading" @click="refresh()">刷新状态</button>
      </div>
      <form class="ck-card" @submit.prevent="upload">
        <h2>{{ student.latestKey ? '提交新的公钥' : '上传你的公钥' }}</h2>
        <p class="ck-alert">请只上传公钥文件，例如 <code>id_ed25519.pub</code> 或 <code>id_rsa.pub</code>。不要上传不带 <code>.pub</code> 后缀的私钥文件。</p>
        <p v-if="student.latestKey" class="ck-muted">自动导入开启后，新提交和换钥都会自动处理；否则等待助教确认。已经安装的公钥在新版本导入成功前继续有效。</p>
        <label for="ck-key-file">选择 .pub 文件</label>
        <input id="ck-key-file" ref="fileInput" type="file" accept=".pub" :disabled="uploading || !enrollmentOpen || !!loadError" @change="chooseFile" />
        <p class="ck-muted">一份文件只包含一把公钥，最大 4 KiB。支持 Ed25519 或至少 3072 位的 RSA。</p>
        <p v-if="error" class="ck-error" role="alert">{{ error }}</p><p v-if="message" class="ck-success" role="status">{{ message }}</p>
        <div class="ck-actions"><button class="ck-button ck-button-primary" type="submit" :disabled="!file || uploading || !enrollmentOpen || !!loadError">{{ uploading ? '正在检查并提交…' : '提交公钥' }}</button><span v-if="!enrollmentOpen" class="ck-muted">当前暂不接受提交</span></div>
      </form>
      <p v-if="copyMessage" class="ck-note" role="status">{{ copyMessage }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
type Key = { id: string; version: number; algorithm: string; bits: number; publicKey: string; fingerprint: string; createdAt: string }
type AutoImport = { status: 'waiting' | 'queued' | 'blocked' | 'cancelled' | null; message: string | null }
type Student = { autoImport?: AutoImport; autoImportBlocked?: boolean; studentId: string; name: string; email: string; username: string; serverId: string; submitted: boolean; accountStatus: string; importStatus: string; lastError: string | null; latestKey: Key | null; installedKey: Key | null }
const props = defineProps<{ api: (path: string, options?: { method?: string; body?: unknown; download?: boolean }) => Promise<any>; enrollmentOpen: boolean; servers: { id: string; label: string }[] }>()
const student = ref<Student | null>(null), loading = ref(false), loadError = ref('')
const file = ref<File | null>(null), fileInput = ref<HTMLInputElement | null>(null), uploading = ref(false)
const error = ref(''), message = ref(''), copyMessage = ref('')
let pollTimer: ReturnType<typeof setTimeout> | undefined
let destroyed = false, refreshing = false, refreshVersion = 0
const importLabels: Record<string, string> = { not_submitted: '尚未提交', pending_review: '待助教审核', queued: '等待导入', running: '正在导入', installed: '已导入', failed: '导入失败', revoked: '已撤销' }
const accountLabels: Record<string, string> = { unchecked: '待助教检查', missing: '账号不存在，待创建', unauthorized: '待管理员授权', ready: '已就绪', error: '检查失败，待助教处理' }
const autoImportLabels: Record<string, string> = { waiting: '等待自动导入', queued: '已进入自动导入队列', blocked: '自动导入暂时受阻', cancelled: '自动导入已取消' }
const autoImportMessages: Record<string, string> = { waiting: '系统正在检查服务器账号与授权。账号准备好后会继续处理，无需重传。', queued: '后台正在处理，请等待状态更新。', blocked: '请联系助教查看账号准备或任务结果。', cancelled: '本次提交未继续自动导入，请等待助教处理。' }
const displayImportStatus = computed(() => {
  if (student.value?.autoImport?.status === 'waiting') return '等待自动导入'
  return importLabels[student.value?.importStatus || ''] || student.value?.importStatus || ''
})
function serverLabel(id: string) { return props.servers.find(server => server.id === id)?.label || `${id} 服务器` }
function formatDate(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  if (!destroyed && !document.hidden && !uploading.value && !loadError.value && student.value?.latestKey && !['installed', 'revoked'].includes(student.value.importStatus)) pollTimer = setTimeout(() => refresh(true), 3000)
}
async function refresh(quiet = false) {
  if (refreshing || uploading.value || destroyed || (quiet && document.hidden)) return
  const version = refreshVersion
  refreshing = true; loading.value = !quiet
  try {
    const result = await props.api('/me')
    if (!destroyed && version === refreshVersion) { student.value = result.student; loadError.value = '' }
  } catch (cause) { if (!destroyed && version === refreshVersion) loadError.value = cause instanceof Error ? cause.message : '无法获取提交情况。' }
  finally { refreshing = false; loading.value = false; schedulePoll() }
}
function visibilityChanged() {
  if (pollTimer) clearTimeout(pollTimer)
  if (!document.hidden) void refresh(true)
}
function chooseFile(event: Event) {
  error.value = ''; message.value = ''; file.value = null
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  if (!selected.name.toLowerCase().endsWith('.pub')) error.value = '请选择以 .pub 结尾的公钥文件。'
  else if (!selected.size || selected.size > 4096) error.value = '公钥文件不能为空，且不能超过 4 KiB。'
  else file.value = selected
}
async function upload() {
  if (!file.value || uploading.value || !props.enrollmentOpen || loadError.value) return
  uploading.value = true; refreshVersion++; if (pollTimer) clearTimeout(pollTimer); error.value = ''; message.value = ''
  try {
    const body = new FormData(); body.append('file', file.value)
    const result = await props.api('/me/key', { method: 'POST', body })
    student.value = result.student; file.value = null
    if (fileInput.value) fileInput.value.value = ''
    message.value = result.duplicate ? '这把公钥已提交，无需重复上传。' : result.student.autoImport?.status ? '公钥校验通过并已保存，请查看上方自动导入状态。' : '公钥校验通过并已保存，请等待助教审核导入。'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '提交失败，请重试。' }
  finally { uploading.value = false; schedulePoll() }
}
async function copyKey(value: string) {
  try { await navigator.clipboard.writeText(value); copyMessage.value = '公钥已复制。' }
  catch { copyMessage.value = '浏览器未允许复制，请展开完整公钥后手动选择复制。' }
}
onMounted(() => { document.addEventListener('visibilitychange', visibilityChanged); void refresh() })
onUnmounted(() => { destroyed = true; refreshVersion++; if (pollTimer) clearTimeout(pollTimer); document.removeEventListener('visibilitychange', visibilityChanged) })
</script>

<style scoped>
.ck-steps { display: flex; flex-wrap: wrap; gap: 14px 24px; padding: 0; margin: 24px 0; list-style: none; }
.ck-steps li { display: flex; gap: 8px; align-items: center; color: var(--vp-c-text-2); font-size: 12px; margin: 0; }
.ck-steps li span { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--vp-c-divider); border-radius: 50%; font-size: 11px; }
.ck-steps .ck-step-done { color: var(--ck-accent); }
.ck-step-done span { background: var(--ck-tint); border-color: var(--ck-accent) !important; }
.ck-student-header { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
.ck-student-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin: 12px 0 24px; }
.ck-student-meta dt { color: var(--vp-c-text-2); font-size: 12px; }
.ck-student-meta dd { margin: 4px 0 0; font-size: 14px; overflow-wrap: anywhere; }
.ck-key-summary { border-top: 1px solid var(--vp-c-divider); padding-top: 18px; margin: 20px 0; }
@media (max-width: 480px) { .ck-student-meta { grid-template-columns: 1fr; } }
</style>
