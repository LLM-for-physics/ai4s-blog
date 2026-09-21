<template>
  <div class="ck-admin">
    <div class="ck-stats" aria-label="提交统计">
      <div v-for="stat in statCards" :key="stat.label"><span>{{ stat.label }}</span><strong>{{ loaded ? stat.value : '—' }}</strong></div>
    </div>
    <div class="ck-server-stats" aria-label="在册学生服务器分配人数">
      <div v-for="server in serverCards" :key="server.id"><span>{{ server.label }}</span><strong>{{ loaded ? server.count : '—' }}<small> 人</small></strong></div>
    </div>
    <p class="ck-muted">分配人数按在册名单统计，仅用于核对；系统不会自动重新分配服务器。已移除 {{ stats.removed }} 人。</p>
    <p v-if="message" class="ck-success" role="status">{{ message }}</p>
    <p v-if="error" class="ck-error" role="alert">{{ error }}</p>
    <div v-if="loadError" class="ck-alert ck-alert-error" role="alert"><p>{{ loadError }} 刷新成功前暂停名单操作。</p><button class="ck-button" type="button" :disabled="busy" @click="refresh">重新加载</button></div>

    <section class="ck-card ck-auto-import" aria-labelledby="ck-auto-import-title">
      <div class="ck-section-heading"><h2 id="ck-auto-import-title">自动导入公钥</h2><span class="ck-tag" :class="{ 'ck-tag-good': autoImport?.enabled }">{{ autoImport ? (autoImport.enabled ? '已开启' : '已关闭') : '状态待确认' }}</span></div>
      <p class="ck-muted">默认关闭。开启后，允许提交的学生首次上传与后续换钥都会自动导入；新公钥导入成功后替换原课程公钥。此开关不改变学生入口的开放范围。</p>
      <p class="ck-muted">仅处理开关开启后新提交的公钥，已有提交仍需人工导入。目标账号必须已存在并通过 root 管理员授权；缺少账号或授权时保留公钥，后台会继续检查，无需学生重传。</p>
      <p v-if="autoImport?.updatedAt" class="ck-muted">最近设置：{{ formatDate(autoImport.updatedAt) }}<span v-if="autoImport.updatedBy"> · {{ autoImport.updatedBy }}</span></p>
      <p v-if="autoImportError" class="ck-error" role="alert">{{ autoImportError }}</p>
      <div v-if="autoImportConfirm" class="ck-alert" role="group" aria-labelledby="ck-auto-import-confirm-title">
        <strong id="ck-auto-import-confirm-title">{{ autoImportConfirm.enabled ? '确认启动自动导入公钥' : '确认停止自动导入' }}</strong>
        <p>{{ autoImportConfirm.enabled ? '确认后，新提交的首次公钥和替换公钥将按上述规则自动处理。请先核对服务器账号与 root 授权准备情况。' : '停止后将取消尚未批准的自动导入候选；已进入导入队列的任务会继续完成。之后的新提交等待助教人工导入。' }}</p>
        <div class="ck-actions"><button class="ck-button ck-button-primary" type="button" :disabled="busy || autoImportLoading || !!autoImportError" @click="confirmAutoImport">{{ busy ? '处理中…' : (autoImportConfirm.enabled ? '确认启动自动导入' : '确认停止自动导入') }}</button><button class="ck-button" type="button" :disabled="busy" @click="autoImportConfirm = null">取消</button></div>
      </div>
      <div v-else class="ck-actions"><button v-if="autoImport" class="ck-button" :class="autoImport.enabled ? 'ck-button-danger' : 'ck-button-primary'" type="button" :disabled="busy || autoImportLoading || !!autoImportError" @click="prepareAutoImport">{{ autoImport.enabled ? '停止自动导入' : '启动自动导入公钥' }}</button><button class="ck-button ck-button-quiet" type="button" :disabled="busy || autoImportLoading" @click="reloadAutoImport">刷新自动导入设置</button></div>
    </section>

    <section ref="previewPanel" v-if="review" class="ck-card ck-review" aria-labelledby="ck-review-title">
      <div class="ck-section-heading"><h2 id="ck-review-title">{{ reviewTitle }}</h2><span class="ck-tag">操作预览</span></div>
      <p class="ck-muted">请核对学生与目标账号{{ isRosterReview ? '' : '及公钥指纹' }}。本次确认只处理下列标记为“可执行”的项目。预览有效期至 {{ formatDate(review.expiresAt) }}。</p>
      <p v-if="reviewKind === 'roster-remove'" class="ck-alert">从在册名单移除后，该学生不能继续登录或提交。Linux 账号、公钥历史及操作记录会保留。若仍有已安装公钥，请先手动撤销；未完成或结果不确定的任务也需先处理。</p>
      <p v-else-if="reviewKind === 'roster-restore'" class="ck-alert">恢复名单只重新允许学生验证邮箱和提交，不会自动安装任何公钥。学生需要重新验证邮箱。</p>
      <p v-if="reviewAction === 'revoke'" class="ck-alert">撤销后，这把课程公钥将不能用于登录，并暂停该学生的自动导入；重新上传不会解除暂停。只有人工导入或恢复成功后才会解除。服务器上另行配置的授权公钥不受此操作影响。</p>
      <p v-else-if="reviewAction === 'restore'" class="ck-alert">恢复所选历史公钥会替换当前课程公钥，成功后解除该学生的自动导入暂停。请确认学生仍持有对应的私钥。</p>
      <div class="ck-table-wrap"><table><thead><tr><th>学生</th><th>目标账号</th><th v-if="!isRosterReview">公钥指纹</th><th>检查结果</th></tr></thead><tbody>
        <tr v-for="item in review.items" :key="item.studentId"><td>{{ item.studentId }}<br>{{ item.name }}</td><td><span class="ck-mono">{{ item.username }}</span><br><span class="ck-muted">{{ serverLabel(item.serverId) }}</span></td><td v-if="!isRosterReview" class="ck-mono">{{ item.fingerprint || '撤销当前课程公钥' }}</td><td><span :class="item.eligible ? 'ck-success' : 'ck-error'">{{ item.eligible ? '可执行' : '暂不可执行' }}</span><div class="ck-muted">{{ item.reason }}</div></td></tr>
      </tbody></table></div>
      <div class="ck-actions"><button class="ck-button ck-button-primary" type="button" :disabled="busy || !!loadError || !eligibleCount" @click="confirmReview">{{ busy ? '处理中…' : `确认${reviewVerb} ${eligibleCount} 人` }}</button><button class="ck-button" type="button" :disabled="busy" @click="clearReview">取消预览</button></div>
    </section>

    <section class="ck-card">
      <details class="ck-roster-details"><summary>导入或更新选课名单</summary>
        <p class="ck-muted">名单需要“学号、姓名、服务器号”三列，服务器号必填 132、190 或 197。邮箱为学号@stu.pku.edu.cn，用户名为 stu 加完整学号。导入不会创建 Linux 账号，也不会恢复已移除的学生。</p>
        <div class="ck-actions"><button class="ck-button" type="button" :disabled="busy" @click="download('/admin/roster/template?format=xlsx', '课程选课名单模板.xlsx')">下载 Excel 模板</button><button class="ck-button" type="button" :disabled="busy" @click="download('/admin/roster/template?format=csv', '课程选课名单模板.csv')">下载 CSV 模板</button></div>
        <label for="ck-roster-file">选择名单文件（Excel 或 UTF-8 CSV，最大 2 MiB）</label>
        <input id="ck-roster-file" ref="rosterInput" type="file" accept=".xlsx,.csv" :disabled="busy" @change="chooseRoster" />
        <div class="ck-actions"><button class="ck-button" type="button" :disabled="busy || !rosterFile" @click="previewRoster">检查并预览名单</button></div>
        <div v-if="rosterPreview" class="ck-roster-preview">
          <p class="ck-muted">共 {{ rosterPreview.summary.total }} 人：新增 {{ rosterPreview.summary.added }}，更新 {{ rosterPreview.summary.updated }}，未变化 {{ rosterPreview.summary.unchanged }}。</p>
          <div v-if="rosterPreview.errors.length" class="ck-alert ck-alert-error" role="alert"><strong>请修正以下问题后重新上传；本次名单尚未保存。</strong><ul><li v-for="(issue, index) in rosterPreview.errors" :key="index">第 {{ issue.row }} 行{{ issue.field ? ` · ${issue.field}` : '' }}：{{ issue.message }}</li></ul></div>
          <div class="ck-table-wrap" v-if="rosterPreview.rows.length"><table><thead><tr><th>学号</th><th>姓名</th><th>学校邮箱</th><th>目标服务器 / 用户名</th><th>变化</th></tr></thead><tbody><tr v-for="(row, index) in rosterPreview.rows" :key="index"><td class="ck-mono">{{ row.studentId }}</td><td>{{ row.name }}</td><td>{{ row.email }}</td><td>{{ serverLabel(row.serverId) }}<br><span class="ck-mono">{{ row.username }}</span></td><td>{{ changeLabels[row.change] }}</td></tr></tbody></table></div>
          <div class="ck-actions"><button class="ck-button ck-button-primary" type="button" :disabled="busy || !rosterPreview.previewId || !!rosterPreview.errors.length" @click="commitRoster">确认保存名单</button><button class="ck-button" type="button" :disabled="busy" @click="rosterPreview = null">取消</button></div>
        </div>
      </details>
    </section>

    <section class="ck-card">
      <div class="ck-section-heading"><h2>学生提交情况</h2><div class="ck-actions"><button class="ck-button" type="button" :disabled="busy" @click="refresh">刷新</button><button class="ck-button" type="button" :disabled="!canOperate" @click="download('/admin/students/export', '课程公钥提交情况.xlsx')">导出在册 Excel</button></div></div>
      <div class="ck-filters">
        <div><label for="ck-search">搜索学生</label><input id="ck-search" v-model.trim="search" type="search" placeholder="学号、姓名或用户名" /></div>
        <div><label for="ck-roster-view">名单范围</label><select id="ck-roster-view" v-model="rosterView" :disabled="busy" @change="changeRosterView"><option value="active">在册学生</option><option value="removed">已移除学生</option></select></div>
        <div><label for="ck-server-filter">目标服务器</label><select id="ck-server-filter" v-model="serverFilter"><option value="all">全部服务器</option><option v-for="server in servers" :key="server.id" :value="server.id">{{ server.label }}</option></select></div>
        <div><label for="ck-filter">筛选状态</label><select id="ck-filter" v-model="filter"><option value="all">全部状态</option><option value="missing_submission">未提交公钥</option><option value="pending_review">待处理</option><option value="installed">已导入</option><option value="failed">导入失败</option><option value="missing_account">账号不存在</option><option value="unauthorized">账号待授权</option><option value="revoked">已撤销</option></select></div>
      </div>
      <p v-if="rosterView === 'removed'" class="ck-alert">这里保留已移除学生的记录与公钥历史。恢复名单后学生需重新验证邮箱；系统不会自动恢复服务器公钥。</p>
      <div class="ck-selection-bar"><span class="ck-muted">显示 {{ filtered.length }} 人 · 已选 {{ selected.length }} 人<span v-if="hiddenSelection">（其中 {{ hiddenSelection }} 人不在当前筛选中）</span></span><div class="ck-actions"><button class="ck-button ck-button-quiet" type="button" :disabled="!selected.length || busy" @click="selected = []; clearReview()">清空选择</button><button v-if="rosterView === 'active'" class="ck-button" type="button" :disabled="!canOperate || !selected.length" @click="checkAccounts">检查所选账号</button><button v-if="rosterView === 'active'" class="ck-button ck-button-primary" type="button" :disabled="!canOperate || !selected.length" @click="previewImport">预览导入</button><button v-if="rosterView === 'active'" class="ck-button ck-button-danger" type="button" :disabled="!canOperate || !selected.length" @click="previewRosterAction('remove')">预览移除名单</button><button v-else class="ck-button ck-button-primary" type="button" :disabled="!canOperate || !selected.length" @click="previewRosterAction('restore')">预览恢复名单</button></div></div>
      <p v-if="busy && !loaded" class="ck-note" role="status">正在加载名单…</p>
      <div v-if="!filtered.length && loaded" class="ck-empty">{{ students.length || rosterView === 'removed' ? '没有符合筛选条件的学生。' : '还没有选课名单。请先展开上方“导入或更新选课名单”。' }}</div>
      <p v-if="filtered.length" class="ck-table-hint ck-muted">窄屏可左右滑动表格，查看服务器账号和操作。</p>
      <div v-if="filtered.length" class="ck-table-wrap"><table class="ck-students-table"><thead><tr><th><input type="checkbox" :checked="allVisibleSelected" :indeterminate="someVisibleSelected && !allVisibleSelected" :disabled="!canOperate" aria-label="选择当前筛选中的全部学生" @change="selectVisible" /></th><th>学号 / 姓名</th><th>提交 / 公钥</th><th>服务器账号</th><th>导入状态</th><th>操作</th></tr></thead><tbody>
        <tr v-for="student in filtered" :key="student.studentId">
          <td><input type="checkbox" :checked="selected.includes(student.studentId)" :disabled="!canOperate" :aria-label="`选择学生 ${student.studentId}`" @change="toggleStudent(student.studentId)" /></td>
          <td><strong class="ck-mono">{{ student.studentId }}</strong><br>{{ student.name }}<span v-if="student.removedAt" class="ck-tag">已移除</span><div v-if="student.removedAt" class="ck-muted">移除于 {{ formatDate(student.removedAt) }}</div><div class="ck-muted">{{ student.email }}</div></td>
          <td><span :class="student.submitted ? 'ck-success' : 'ck-muted'">{{ student.submitted ? '✓ 已提交' : '未提交' }}</span><div class="ck-muted">{{ formatDate(student.submittedAt) }}</div><template v-if="student.latestKey"><div class="ck-muted">{{ student.latestKey.algorithm }} · {{ student.latestKey.bits }} 位 · 第 {{ student.latestKey.version }} 版</div><details><summary>指纹与完整公钥</summary><p class="ck-mono">{{ student.latestKey.fingerprint }}</p><code class="ck-key">{{ student.latestKey.publicKey }}</code><button class="ck-button" type="button" @click="copyKey(student.latestKey.publicKey)">复制公钥</button></details></template></td>
          <td><div>{{ accountLabels[student.accountStatus] || student.accountStatus }}</div><div class="ck-muted ck-mono">{{ serverLabel(student.serverId) }} / {{ student.username }}</div><div v-if="student.accountMessage" class="ck-muted">{{ student.accountMessage }}</div></td>
          <td><span class="ck-tag" :class="{ 'ck-tag-good': student.importStatus === 'installed', 'ck-tag-bad': student.importStatus === 'failed' }">{{ student.autoImport?.status === 'waiting' ? '等待自动导入' : (importLabels[student.importStatus] || student.importStatus) }}</span><div v-if="student.installedKey" class="ck-muted">已安装第 {{ student.installedKey.version }} 版</div><div v-if="student.autoImportBlocked" class="ck-muted">自动导入已暂停；人工导入或恢复成功后解除。</div><div v-else-if="student.autoImport?.status" class="ck-muted">{{ autoImportLabels[student.autoImport.status] }}<span v-if="student.autoImport.message">：{{ student.autoImport.message }}</span></div><div v-if="student.lastError" class="ck-error">{{ student.lastError }}</div></td>
          <td><div class="ck-row-actions"><button class="ck-button ck-button-quiet" type="button" :disabled="!canOperate || !student.latestKey" @click="showHistory(student)">历史公钥</button><button v-if="!student.removedAt" class="ck-button ck-button-quiet ck-button-danger" type="button" :disabled="!canOperate || !student.installedKey" @click="previewAction(student, 'revoke')">撤销</button><button v-if="!student.removedAt" class="ck-button ck-button-quiet ck-button-danger" type="button" :disabled="!canOperate" @click="previewRosterAction('remove', [student.studentId])">移除名单</button><button v-else class="ck-button ck-button-quiet" type="button" :disabled="!canOperate" @click="previewRosterAction('restore', [student.studentId])">恢复名单</button></div></td>
        </tr>
      </tbody></table></div>
      <p class="ck-muted">“已导入”表示公钥已写入服务器。实际 SSH 登录由学生使用对应私钥验证。</p>
    </section>

    <section v-if="historyStudent" ref="historyPanel" class="ck-card" aria-labelledby="ck-history-title">
      <div class="ck-section-heading"><h2 id="ck-history-title">{{ historyStudent.name }} · {{ historyStudent.studentId }} 的公钥历史</h2><button class="ck-button ck-button-quiet" type="button" :disabled="busy" @click="historyStudent = null">关闭历史</button></div>
      <p class="ck-muted">恢复历史公钥需要再次预览并确认，会替换当前课程公钥。<span v-if="historyStudent.removedAt">该学生已移除，请先明确恢复名单后再操作公钥。</span></p>
      <p v-if="!historyKeys.length" class="ck-empty">没有可显示的历史公钥。</p>
      <div v-for="key in historyKeys" :key="key.id" class="ck-history-key"><div class="ck-section-heading"><h3>第 {{ key.version }} 版 <span v-if="historyStudent.installedKey?.id === key.id" class="ck-tag ck-tag-good">当前已安装</span><span v-if="historyStudent.latestKey?.id === key.id" class="ck-tag">最近提交</span></h3><button class="ck-button" type="button" :disabled="!canOperate || !!historyStudent.removedAt || historyStudent.installedKey?.id === key.id" @click="previewAction(historyStudent, 'restore', key.id)">预览恢复此公钥</button></div><p class="ck-muted">{{ key.algorithm }} · {{ key.bits }} 位 · {{ formatDate(key.createdAt) }}</p><p class="ck-mono">{{ key.fingerprint }}</p><details><summary>查看完整公钥</summary><code class="ck-key">{{ key.publicKey }}</code><button class="ck-button" type="button" @click="copyKey(key.publicKey)">复制公钥</button></details></div>
    </section>

    <section class="ck-card">
      <div class="ck-section-heading"><h2>导入与撤销记录</h2><button class="ck-button" type="button" :disabled="busy || polling" @click="refreshBatches">刷新记录</button></div>
      <p class="ck-muted">页面可见时，运行中的批次与新自动导入任务会自动更新。部分失败时保留成功结果，重试只处理仍可执行的失败项。</p>
      <p v-if="batchError" class="ck-error" role="alert">{{ batchError }} 自动更新已暂停，请刷新记录确认实际结果。</p>
      <p v-if="!batches.length" class="ck-empty">暂无操作记录。</p>
      <details v-for="batch in batches" :key="batch.id" class="ck-batch" :open="batch.id === activeBatchId">
        <summary><span>{{ formatDate(batch.createdAt) }}</span><span class="ck-muted ck-batch-source">{{ batch.source === 'automatic' ? '自动导入' : '人工操作' }}</span><span class="ck-tag" :class="{ 'ck-tag-good': batch.status === 'completed', 'ck-tag-bad': ['partial', 'failed'].includes(batch.status) }">{{ batchLabels[batch.status] || batch.status }}</span><span class="ck-muted">{{ batch.items.length }} 项 · 成功 {{ batch.items.filter(item => item.status === 'success').length }} 项</span></summary>
        <p class="ck-muted ck-mono">批次 {{ batch.id }}</p>
        <p class="ck-table-hint ck-muted">左右滑动表格可查看完整目标账号和结果。</p>
        <div class="ck-table-wrap"><table><thead><tr><th>学号</th><th>目标账号</th><th>操作</th><th>状态</th><th>指纹 / 结果说明</th></tr></thead><tbody><tr v-for="item in batch.items" :key="item.studentId"><td class="ck-mono">{{ item.studentId }}</td><td>{{ serverLabel(item.serverId) }}<br><span class="ck-mono">{{ item.username }}</span></td><td>{{ item.action === 'revoke' ? '撤销' : '安装' }}</td><td>{{ itemLabels[item.status] || item.status }}</td><td><span class="ck-mono">{{ item.fingerprint || '—' }}</span><div v-if="item.error" class="ck-error">{{ item.error }}</div></td></tr></tbody></table></div>
        <div v-if="batch.items.some(item => item.status === 'failed')" class="ck-actions"><button class="ck-button" type="button" :disabled="!canOperate || !!batchError || ['queued', 'running'].includes(batch.status)" @click="retryBatch(batch)">重试失败项</button></div>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
type Key = { id: string; version: number; publicKey: string; fingerprint: string; algorithm: string; bits: number; createdAt: string }
type AutoImport = { status: 'waiting' | 'queued' | 'blocked' | 'cancelled' | null; message: string | null }
type AutoImportSettings = { enabled: boolean; revision: number; updatedAt: string | null; updatedBy: string | null }
type Student = { autoImport?: AutoImport; autoImportBlocked?: boolean; studentId: string; name: string; email: string; username: string; serverId: string; submitted: boolean; submittedAt: string | null; accountStatus: string; accountMessage: string | null; latestKey: Key | null; installedKey: Key | null; importStatus: string; lastError: string | null; revision: number; removedAt: string | null; removedBy: string | null }
type Batch = { source?: 'manual' | 'automatic'; id: string; status: string; createdAt: string; items: { studentId: string; serverId: string; username: string; action: string; status: string; fingerprint: string | null; error: string | null }[] }
type ReviewKind = 'import' | 'action' | 'roster-remove' | 'roster-restore'
type Review = { previewId: string; expiresAt: string; items: { studentId: string; name: string; username: string; serverId: string; fingerprint?: string | null; eligible: boolean; reason: string | null }[] }
type RosterPreview = { previewId: string | null; rows: { studentId: string; name: string; email: string; serverId: string; username: string; change: string }[]; errors: { row: number; field: string; message: string }[]; summary: { total: number; added: number; updated: number; unchanged: number } }
const props = defineProps<{ api: (path: string, options?: { method?: string; body?: unknown; download?: boolean }) => Promise<any>; servers: { id: string; label: string }[]; active?: boolean }>()
const students = ref<Student[]>([]), selected = ref<string[]>([]), stats = ref({ total: 0, submitted: 0, pending: 0, installed: 0, failed: 0, removed: 0 })
const busy = ref(false), loaded = ref(false), loadError = ref(''), error = ref(''), message = ref(''), search = ref(''), filter = ref('all')
const rosterFile = ref<File | null>(null), rosterInput = ref<HTMLInputElement | null>(null), rosterPreview = ref<RosterPreview | null>(null)
const review = ref<Review | null>(null), reviewKind = ref<ReviewKind>('import'), reviewAction = ref('install'), reviewRequestId = ref(''), previewPanel = ref<HTMLElement | null>(null)
const historyStudent = ref<Student | null>(null), historyKeys = ref<Key[]>([]), historyPanel = ref<HTMLElement | null>(null)
const batches = ref<Batch[]>([]), activeBatchId = ref(''), batchError = ref(''), polling = ref(false)
const rosterView = ref<'active' | 'removed'>('active'), serverFilter = ref('all')
const autoImport = ref<AutoImportSettings | null>(null), autoImportLoading = ref(false), autoImportError = ref('')
const autoImportConfirm = ref<{ enabled: boolean; revision: number } | null>(null)
const retryIds = new Map<string, string>()
let pollTimer: ReturnType<typeof setTimeout> | undefined
let destroyed = false
const canOperate = computed(() => loaded.value && !busy.value && !loadError.value)
const statCards = computed(() => [{ label: '名单人数', value: stats.value.total }, { label: '已提交', value: stats.value.submitted }, { label: '待处理', value: stats.value.pending }, { label: '已导入', value: stats.value.installed }, { label: '导入失败', value: stats.value.failed }])
const serverCards = computed(() => props.servers.map(server => ({ ...server, count: students.value.filter(student => !student.removedAt && student.serverId === server.id).length })))
const isRosterReview = computed(() => reviewKind.value.startsWith('roster-'))
const reviewTitle = computed(() => reviewKind.value === 'roster-remove' ? '确认移除名单' : reviewKind.value === 'roster-restore' ? '确认恢复名单' : reviewKind.value === 'import' ? '确认导入公钥' : reviewAction.value === 'revoke' ? '确认撤销课程公钥' : '确认恢复历史公钥')
const reviewVerb = computed(() => reviewKind.value === 'roster-remove' ? '移除名单' : reviewKind.value === 'roster-restore' ? '恢复名单' : reviewAction.value === 'revoke' ? '撤销' : reviewAction.value === 'restore' ? '恢复' : '导入')
const filtered = computed(() => students.value.filter(student => {
  const matches = !search.value || student.studentId.includes(search.value) || student.name.includes(search.value) || student.username.includes(search.value)
  return matches && Boolean(student.removedAt) === (rosterView.value === 'removed') && (serverFilter.value === 'all' || student.serverId === serverFilter.value) && (filter.value === 'all' || (filter.value === 'missing_submission' ? !student.submitted : filter.value === 'missing_account' ? student.accountStatus === 'missing' : filter.value === 'unauthorized' ? student.accountStatus === 'unauthorized' : student.importStatus === filter.value))
}))
const allVisibleSelected = computed(() => !!filtered.value.length && filtered.value.every(student => selected.value.includes(student.studentId)))
const someVisibleSelected = computed(() => filtered.value.some(student => selected.value.includes(student.studentId)))
const hiddenSelection = computed(() => selected.value.filter(id => !filtered.value.some(student => student.studentId === id)).length)
const eligibleCount = computed(() => review.value?.items.filter(item => item.eligible).length || 0)
const importLabels: Record<string, string> = { not_submitted: '尚未提交', pending_review: '待审核', queued: '等待导入', running: '正在导入', installed: '已导入', failed: '导入失败', revoked: '已撤销' }
const accountLabels: Record<string, string> = { unchecked: '未检查', missing: '账号不存在，待创建', unauthorized: '待授权', ready: '已就绪', error: '检查失败' }
const batchLabels: Record<string, string> = { queued: '排队中', running: '处理中', completed: '全部成功', partial: '部分失败', failed: '失败' }
const itemLabels: Record<string, string> = { queued: '排队中', running: '处理中', success: '成功', failed: '失败', superseded: '已有更新版本' }
const autoImportLabels: Record<string, string> = { waiting: '等待自动导入', queued: '自动导入已排队', blocked: '自动导入受阻', cancelled: '自动导入已取消' }
const changeLabels: Record<string, string> = { add: '新增', update: '更新', unchanged: '未变化' }
function serverLabel(id: string) { return props.servers.find(server => server.id === id)?.label || `${id} 服务器` }
function changeRosterView() { selected.value = []; clearReview(); historyStudent.value = null; filter.value = 'all' }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }
function errorText(cause: unknown) { return cause instanceof Error ? cause.message : '操作失败，请稍后重试。' }
function clearReview() { review.value = null; reviewRequestId.value = '' }
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try { await action() } catch (cause) { error.value = errorText(cause) } finally { busy.value = false }
}
async function loadStudents() {
  try {
    const result = await props.api('/admin/students?includeRemoved=true'); students.value = result.students; stats.value = result.stats
    selected.value = selected.value.filter(id => students.value.some(student => student.studentId === id && Boolean(student.removedAt) === (rosterView.value === 'removed')))
    if (historyStudent.value) historyStudent.value = students.value.find(student => student.studentId === historyStudent.value?.studentId) || null
    loaded.value = true; loadError.value = ''
  } catch (cause) { loadError.value = errorText(cause); throw cause }
}
async function loadAutoImport() {
  if (autoImportLoading.value || destroyed) return false
  autoImportLoading.value = true
  try { autoImport.value = await props.api('/admin/auto-import'); autoImportError.value = ''; return true }
  catch (cause) { autoImportError.value = errorText(cause); return false }
  finally { autoImportLoading.value = false }
}
async function reloadAutoImport() { autoImportConfirm.value = null; await loadAutoImport(); schedulePoll() }
function prepareAutoImport() {
  if (busy.value || autoImportLoading.value || autoImportError.value || !autoImport.value) return
  autoImportConfirm.value = { enabled: !autoImport.value.enabled, revision: autoImport.value.revision }
}
async function confirmAutoImport() {
  if (!autoImportConfirm.value || autoImportLoading.value || autoImportError.value) return
  await run(async () => {
    const change = { ...autoImportConfirm.value! }
    try {
      autoImport.value = await props.api('/admin/auto-import', { method: 'PUT', body: change })
      autoImportConfirm.value = null; autoImportError.value = ''
      message.value = change.enabled ? '自动导入已启动。仅处理开启后新提交的公钥。' : '自动导入已停止。已入队的任务仍会完成。'
      await loadStudents(); await refreshBatches(); schedulePoll()
    } catch (cause) {
      if ((cause as Error & { status?: number }).status === 409) {
        autoImportConfirm.value = null
        const refreshed = await loadAutoImport(); schedulePoll()
        error.value = refreshed ? '自动导入设置已被更新，已重新加载。请检查当前状态后再次确认。' : '自动导入设置已变化，暂时无法重新加载。请刷新设置后再操作。'
      } else throw cause
    }
  })
}
async function refresh() { await run(async () => { await loadStudents(); await refreshBatches() }) }
function toggleStudent(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]; clearReview() }
function selectVisible(event: Event) {
  const ids = new Set(selected.value)
  for (const student of filtered.value) { if ((event.target as HTMLInputElement).checked) ids.add(student.studentId); else ids.delete(student.studentId) }
  selected.value = [...ids]; clearReview()
}
function chooseRoster(event: Event) {
  error.value = ''; message.value = ''; rosterPreview.value = null; rosterFile.value = null
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!/\.(xlsx|csv)$/i.test(file.name)) error.value = '请选择 .xlsx 或 UTF-8 .csv 名单文件。'
  else if (!file.size || file.size > 2 * 1024 * 1024) error.value = '名单文件不能为空，且不能超过 2 MiB。'
  else rosterFile.value = file
}
async function previewRoster() {
  if (!rosterFile.value) return
  await run(async () => { const body = new FormData(); body.append('file', rosterFile.value!); rosterPreview.value = await props.api('/admin/roster/preview', { method: 'POST', body }) })
}
async function commitRoster() {
  if (!rosterPreview.value?.previewId || rosterPreview.value.errors.length) return
  await run(async () => {
    const result = await props.api('/admin/roster/commit', { method: 'POST', body: { previewId: rosterPreview.value!.previewId } })
    rosterPreview.value = null; rosterFile.value = null; if (rosterInput.value) rosterInput.value.value = ''; clearReview()
    await loadStudents(); message.value = `名单已保存，共处理 ${result.count} 名学生。`
  })
}
async function checkAccounts() {
  if (!canOperate.value || !selected.value.length) return
  await run(async () => { await props.api('/admin/students/check', { method: 'POST', body: { studentIds: selected.value } }); clearReview(); await loadStudents(); message.value = '账号检查完成。不存在的账号需要先由管理员创建，再重试导入。' })
}
async function showReview(result: Review, kind: ReviewKind, action: string) {
  review.value = result; reviewKind.value = kind; reviewAction.value = action; reviewRequestId.value = crypto.randomUUID()
  await nextTick(); previewPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function previewRosterAction(action: 'remove' | 'restore', studentIds = selected.value) {
  if (!canOperate.value || !studentIds.length) return
  await run(async () => { const result = await props.api(`/admin/students/${action}-preview`, { method: 'POST', body: { studentIds } }); await showReview(result, action === 'remove' ? 'roster-remove' : 'roster-restore', action === 'remove' ? 'remove-student' : 'restore-student') })
}
async function previewImport() {
  if (!canOperate.value || !selected.value.length || rosterView.value !== 'active') return
  await run(async () => { const result = await props.api('/admin/imports/preview', { method: 'POST', body: { studentIds: selected.value } }); await loadStudents(); await showReview(result, 'import', 'install') })
}
async function previewAction(student: Student, action: 'revoke' | 'restore', keyId?: string) {
  if (!canOperate.value || student.removedAt) return
  await run(async () => { const result = await props.api('/admin/key-actions/preview', { method: 'POST', body: { studentId: student.studentId, action, ...(keyId ? { keyId } : {}) } }); await showReview(result, 'action', action) })
}
function rememberBatch(batch: Batch) {
  batches.value = [batch, ...batches.value.filter(item => item.id !== batch.id)]
  activeBatchId.value = batch.id; batchError.value = ''; schedulePoll()
}
async function confirmReview() {
  if (!review.value || !eligibleCount.value || !canOperate.value) return
  await run(async () => {
    if (isRosterReview.value) {
      const action = reviewKind.value === 'roster-remove' ? 'remove' : 'restore'
      const result = await props.api(`/admin/students/${action}-confirm`, { method: 'POST', body: { previewId: review.value!.previewId } })
      clearReview(); selected.value = []; historyStudent.value = null; await loadStudents()
      message.value = action === 'remove' ? `已从在册名单移除 ${result.count} 人；Linux 账号和历史记录保留。` : `已恢复 ${result.count} 人到在册名单；未自动安装公钥。`
      return
    }
    const result = await props.api(reviewKind.value === 'import' ? '/admin/imports' : '/admin/key-actions', { method: 'POST', body: { previewId: review.value!.previewId, requestId: reviewRequestId.value } })
    rememberBatch(result); clearReview(); await loadStudents(); message.value = '操作已确认。请在下方记录中查看逐项处理结果。'
  })
}
async function showHistory(student: Student) {
  if (!canOperate.value) return
  await run(async () => { const result = await props.api(`/admin/students/${encodeURIComponent(student.studentId)}/keys`); historyStudent.value = student; historyKeys.value = result.keys; await nextTick(); historyPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
}
async function retryBatch(batch: Batch) {
  if (!canOperate.value || batchError.value || ['queued', 'running'].includes(batch.status)) return
  await run(async () => {
    let requestId = retryIds.get(batch.id)
    if (!requestId) { requestId = crypto.randomUUID(); retryIds.set(batch.id, requestId) }
    const result = await props.api(`/admin/imports/${encodeURIComponent(batch.id)}/retry`, { method: 'POST', body: { requestId } })
    rememberBatch(result); retryIds.delete(batch.id); await loadStudents(); message.value = '已提交失败项重试，请查看批次结果。'
  })
}
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  const hasPending = batches.value.some(batch => ['queued', 'running'].includes(batch.status))
  if (!destroyed && !document.hidden && props.active !== false && !batchError.value && (autoImport.value?.enabled || hasPending)) pollTimer = setTimeout(pollState, 3000)
}
async function pollState() {
  if (destroyed || document.hidden || props.active === false) return
  if (busy.value) { schedulePoll(); return }
  await refreshBatches()
}
function visibilityChanged() {
  if (pollTimer) clearTimeout(pollTimer)
  if (!document.hidden && props.active !== false) void pollState()
}
async function refreshBatches() {
  if (polling.value || destroyed) return
  polling.value = true
  try {
    const previousStates = new Map(batches.value.map(batch => [batch.id, batch.status]))
    batches.value = (await props.api('/admin/imports')).batches; batchError.value = ''
    const changed = batches.value.some(batch => previousStates.get(batch.id) !== batch.status)
    const wasEnabled = autoImport.value?.enabled
    await loadAutoImport()
    if (wasEnabled || autoImport.value?.enabled || changed) await loadStudents()
  } catch (cause) { batchError.value = errorText(cause) }
  finally { polling.value = false; schedulePoll() }
}
async function download(path: string, name: string) {
  await run(async () => {
    const blob = await props.api(path, { download: true })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}
async function copyKey(value: string) {
  try { await navigator.clipboard.writeText(value); message.value = '公钥已复制。' }
  catch { error.value = '浏览器未允许复制，请展开完整公钥后手动选择复制。' }
}
watch(() => props.active, active => { if (active === false) { if (pollTimer) clearTimeout(pollTimer) } else visibilityChanged() })
onMounted(() => { document.addEventListener('visibilitychange', visibilityChanged); void refresh() })
onUnmounted(() => { destroyed = true; if (pollTimer) clearTimeout(pollTimer); document.removeEventListener('visibilitychange', visibilityChanged) })
</script>

<style scoped>
.ck-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--vp-c-divider); border-radius: 12px; margin: 24px 0; overflow: hidden; }
.ck-stats > div { padding: 17px 14px; border-right: 1px solid var(--vp-c-divider); }
.ck-stats > div:last-child { border-right: 0; }
.ck-stats span { display: block; font-size: 11px; color: var(--vp-c-text-2); }
.ck-stats strong { display: block; font-size: 28px; line-height: 1.6; letter-spacing: -.04em; }
.ck-server-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: -8px; }
.ck-server-stats > div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 12px 14px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.ck-server-stats span { font-size: 12px; color: var(--vp-c-text-2); }
.ck-server-stats strong { font-size: 20px; }
.ck-server-stats small { font-size: 11px; font-weight: 400; }
.ck-section-heading { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; }
.ck-section-heading h2, .ck-section-heading h3 { margin: 0; }
.ck-section-heading .ck-actions { margin-top: 0; }
.ck-filters { display: grid; grid-template-columns: minmax(180px, 1.5fr) repeat(3, minmax(130px, 1fr)); gap: 14px; margin: 12px 0 16px; }
.ck-selection-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.ck-selection-bar .ck-actions { margin: 0; }
.ck-row-actions { display: flex; flex-direction: column; min-width: 70px; }
.ck-students-table { min-width: 780px; }
.ck-students-table td:nth-child(2) { min-width: 140px; }
.ck-students-table td:nth-child(3) { min-width: 180px; max-width: 260px; }
.ck-students-table td:nth-child(4) { min-width: 140px; }
.ck-students-table td:nth-child(5) { min-width: 95px; max-width: 220px; }
.ck-review { border: 2px solid var(--ck-accent); scroll-margin-top: 90px; }
.ck-review table { min-width: 550px; }
.ck-review td:nth-child(3) { max-width: 320px; }
.ck-roster-details > summary { font-size: 16px; font-weight: 600; }
.ck-roster-preview .ck-table-wrap { max-height: 340px; overflow-y: auto; }
.ck-roster-preview ul { padding-left: 20px; }
.ck-history-key { border-top: 1px solid var(--vp-c-divider); padding-top: 18px; margin-top: 18px; }
.ck-table-hint { display: none; }
.ck-batch table { min-width: 620px; }
.ck-batch { border-top: 1px solid var(--vp-c-divider); padding: 14px 0; }
.ck-batch summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
@media (max-width: 1000px) { .ck-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .ck-table-hint { display: block; } .ck-stats { grid-template-columns: repeat(5, 1fr); } .ck-stats > div { padding: 12px 7px; } .ck-stats strong { font-size: 23px; } .ck-stats span { font-size: 10px; } .ck-filters { grid-template-columns: 1fr; gap: 0; } }
</style>
