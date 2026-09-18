# 课程公钥服务 API 契约

本文描述当前课程网站、导入服务和受限安装程序之间的接口。部署配置见 [服务说明](services/course-keys/README.md)，测试方法与验收边界见 [测试报告](services/course-keys/TESTING.md)。历史部署记录反映各次发布时的状态，以本文和当前代码作为接口约定。

## 通用约定

- 浏览器 API 前缀为 `/api/course-keys`，使用同域 HTTPS 和 Cookie 会话；生产 Cookie 为 `Secure`、`HttpOnly`、`SameSite=Strict`。
- JSON 错误格式为 `{ "error": { "code": "…", "message": "…" } }`，同时返回对应的 HTTP 错误状态。响应不可缓存。
- 修改请求必须具有匹配的 `Origin`；已登录的修改请求还需 `x-csrf-token`。请求与验证登录验证码也检查 `Origin`。
- 对外时间字段为 ISO UTC 字符串。业务 ID 为不透明字符串；学号为 6 至 16 位 ASCII 数字字符串，保留前导零，不能转换成 UID。
- `serverId` 为字符串 `132`、`190` 或 `197`，由管理员在名单中指定；`username` 固定为 `stu` 加完整学号，学校邮箱默认为 `学号@stu.pku.edu.cn`。学生不能通过上传接口指定其他服务器、用户名或邮箱。
- 批量学号选择须为 1 至 2000 项且不能重复；在册名单最多 2000 人。
- 验证码十分钟内有效，一次使用，最多验证五次；同一规范化身份每分钟最多发送一次、十分钟最多三次。会话有效期八小时。
- 确认导入、重试、撤销公钥、恢复公钥、确认移除或恢复名单、修改自动导入开关，均要求管理员在最近十分钟内验证身份。过期返回 `REAUTH_REQUIRED`。
- 预览绑定创建它的管理员和操作类型，十分钟内有效。确认请求只引用预览 ID，不接受浏览器重新指定预览中的目标、公钥或版本。

```ts
type ServerId = '132' | '190' | '197'
type Target = {
  studentId: string
  serverId: ServerId
  username: string // 严格等于 'stu' + studentId
}
```

## 登录、开放范围与学生接口

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| `GET /health` | 无 | `{ok:true,enrollmentOpen,enrollmentMode,mailConfigured,servers}` |
| `POST /auth/request-code` | `{role:'student',studentId}` 或 `{role:'admin',email}` | `{challengeId,message}` |
| `POST /auth/verify` | `{challengeId,code}` | `Session`，并设置会话 Cookie |
| `GET /auth/session` | 无 | `Session`；无有效会话时字段为 `null` |
| `POST /auth/logout` | `{}` | `{ok:true}`，清除会话 |
| `GET /me` | 无 | `{student:Student}` |
| `POST /me/key` | multipart，文件字段为 `file` | `{student:Student,duplicate:boolean}` |

`health.servers` 为 `[{id:'132',label:'132'},{id:'190',label:'190'},{id:'197',label:'197'}]`，表示支持的目标，不表示各服务器当前连通或账号就绪。`mailConfigured` 只表示邮件适配器配置状态，不是邮件送达证明。健康响应不公开 pilot 学号。

开放范围由进程启动时加载的配置决定：

- `COURSE_KEYS_ENROLLMENT_OPEN=true`：`enrollmentMode:'open'`，全部在册学生可登录与提交。
- 上项不为 `true` 且 `COURSE_KEYS_ENROLLMENT_PILOT_IDS` 非空：`enrollmentMode:'pilot'`，仅名单中的试用学号可登录与提交。
- 两者均未开放：`enrollmentMode:'closed'`，学生入口关闭。

`health.enrollmentOpen` 在 `open` 和 `pilot` 模式下均为 `true`。管理员不受学生开放范围限制。未知学号、已移除或不在开放范围的学生，以及未登记的管理员邮箱，均收到相同结构的验证码请求响应，但不发送邮件。验证码验证和已登录学生的后续请求也检查当前名单与开放范围，不能依靠旧会话绕过关闭。

关闭入口不会删除原有会话或验证码；重新开放后，仍在原有效期和尝试次数限制内的会话与验证码可继续使用。关闭期间的验证码验证尝试仍计数。移除学生则会主动删除其会话并消费未使用验证码。关闭入口不撤销已安装公钥，也不取消已经批准进入 outbox 的任务；尚未批准的自动导入候选会在检查开放范围时取消。

公钥上传整个请求不超过 16 KiB，公钥文件不超过 4096 字节。可选文本字段 `studentId` 必须与登录身份一致；其他文本字段不被接受。只接受一条合法 Ed25519 或至少 3072 位 RSA 公钥，文件扩展名为 `.pub`；返回标准化公钥和指纹，不保留原始附件或注释。同一学生重复提交当前公钥返回 `duplicate:true`，不创建新版本或新的自动导入候选；不同学生不能绑定同一指纹，包括已移除学生的历史公钥。

```ts
type Session = {
  user: null | { role: 'student' | 'admin'; studentId?: string; email: string }
  csrfToken: string | null
  verifiedAt: string | null
}

type Key = {
  id: string
  version: number
  publicKey: string
  fingerprint: string
  algorithm: string
  bits: number
  createdAt: string
}

type Student = Target & {
  name: string
  email: string
  submitted: boolean
  submittedAt: string | null
  accountStatus: 'unchecked' | 'missing' | 'unauthorized' | 'ready' | 'error'
  accountMessage: string | null
  latestKey: Key | null
  installedKey: Key | null
  importStatus: 'not_submitted' | 'pending_review' | 'queued' | 'running' | 'installed' | 'failed' | 'revoked'
  lastError: string | null
  revision: number
  removedAt: string | null
  removedBy: string | null
  autoImport: {
    status: 'waiting' | 'queued' | 'blocked' | 'cancelled' | null
    message: string | null
  }
  autoImportBlocked: boolean
}
```

`latestKey` 表示最近提交的版本，`installedKey` 表示服务记录的当前已安装课程公钥，二者可能不同。`installed` 表示安装程序完成写入与核对，不能当作实际 SSH 登录已经验证。`autoImport` 表示最新公钥的候选状态；没有候选或候选完成后可为 `null`，最终安装结果仍查看 `importStatus` 和 `installedKey`。

## 管理员名单接口

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| `GET /admin/students?includeRemoved=true` | 可省略查询参数；省略时仅返回在册学生 | `{students:Student[],stats:{total,submitted,pending,installed,failed,removed}}` |
| `GET /admin/roster/template?format=xlsx\|csv` | 默认 XLSX；`csv` 返回 CSV | 三列模板附件：学号、姓名、服务器号 |
| `POST /admin/roster/preview` | multipart 文件 `file`，文件最大 2 MiB | `RosterPreview` |
| `POST /admin/roster/commit` | `{previewId}` | `{count}` |
| `GET /admin/students/export` | 无 | 在册学生 XLSX 附件，包含完整标准公钥、目标和状态 |
| `POST /admin/students/check` | `{studentIds:string[]}` | `{students:Student[]}` |
| `POST /admin/students/remove-preview` | `{studentIds:string[]}` | `LifecyclePreview` |
| `POST /admin/students/remove-confirm` | `{previewId}` | `{count}` |
| `POST /admin/students/restore-preview` | `{studentIds:string[]}` | `LifecyclePreview` |
| `POST /admin/students/restore-confirm` | `{previewId}` | `{count}` |

`stats` 除 `removed` 外均统计在册学生，`removed` 为已移除人数，不因 `includeRemoved` 改变。仅接受 `includeRemoved=true` 或省略该参数。

```ts
type RosterPreview = {
  previewId: string | null
  expiresAt?: string // 有有效预览时返回；存在错误时不返回
  rows: Array<Target & {
    name: string
    email: string
    change: 'add' | 'update' | 'unchanged'
    baseRevision: number | null
  }>
  errors: Array<{ row: number; field: string; message: string }>
  summary: { total: number; added: number; updated: number; unchanged: number }
}

type LifecyclePreview = {
  previewId: string
  expiresAt: string
  items: Array<Target & {
    name: string
    eligible: boolean
    reason: string | null
  }>
}
```

名单支持 CSV 和 XLSX，必填列为学号、姓名、服务器号。服务器号只能为 132、190、197；邮箱和用户名由服务派生，文件若包含相应可选列则必须与派生值一致。XLSX 数值类型的学号无法保证前导零，因此拒绝；服务器号可以是这些值对应的数值单元格。XLSX 仅接受单个工作表，公式等非普通单元格值不作为身份信息。名单文件请求体上限为 2 MiB 加 16 KiB multipart 余量。

存在错误时 `previewId:null`，不得提交。确认只新增和更新，不删除后续文件中省略的学生，也不创建 Linux 账号。预览与确认都复核目标和记录版本；账号不存在可先收集公钥，检查显示 `missing`，安装须等待管理员创建账号并加入服务器允许清单。

已安装公钥、未完成任务或未核对的失败结果会阻止改换服务器及移除。须先在原目标手动撤销并确认完成；改换名单服务器不会自动迁移或清除旧服务器上的授权。已移除记录不能通过重新导入名单直接恢复，应使用名单恢复接口。

移除为软移除，保留公钥历史和审计记录，取消待处理的自动导入候选，并立即使该学生原会话与验证码失效；不删除或锁定 Linux 账号。名单恢复重新开放在册身份并将账号检查重置为 `unchecked`，不会自动安装历史公钥，也不会恢复已失效的会话或验证码。名单恢复与下节的“恢复历史公钥”是不同操作。

## 导入、撤销与历史公钥恢复

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| `POST /admin/imports/preview` | `{studentIds:string[]}` | `ImportPreview` |
| `POST /admin/imports` | `{previewId,requestId}` | `Batch` |
| `GET /admin/imports` | 无 | `{batches:Batch[]}`，最近 100 个批次在前 |
| `GET /admin/imports/:id` | 批次 ID | `Batch` |
| `POST /admin/imports/:id/retry` | `{requestId}` | 新的或同一请求已创建的 `Batch` |
| `GET /admin/students/:studentId/keys` | 学号 | `{keys:Key[]}`，最新版本在前 |
| `POST /admin/key-actions/preview` | `{studentId,action:'revoke'\|'restore',keyId?}` | `ImportPreview`；恢复必须指定 `keyId` |
| `POST /admin/key-actions` | `{previewId,requestId}` | `Batch` |

```ts
type ImportPreview = {
  previewId: string
  expiresAt: string
  items: Array<Target & {
    name: string
    keyId: string | null
    fingerprint: string | null
    action: 'install' | 'revoke'
    eligible: boolean
    reason: string | null
  }>
}

type Batch = {
  id: string
  source: 'manual' | 'automatic'
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  createdAt: string
  items: Array<Target & {
    action: 'install' | 'revoke'
    status: 'queued' | 'running' | 'success' | 'failed' | 'superseded'
    fingerprint: string | null
    error: string | null
  }>
}
```

预览检查账号，并固定目标三字段、学生记录修订号和公钥版本。确认前发生相关变化返回 `STALE_PREVIEW`；只处理 `eligible:true` 的项目。不存在账号、尚未授权或无可操作公钥时给出原因。恢复历史公钥在预览和任务中表现为 `action:'install'`。

`requestId` 由调用方在首次确认前生成，建议 UUID；实际接受 8 至 100 位 ASCII 字母、数字、下划线或连字符。结果不确定时重用同一请求 ID；同一 ID 对应不同内容会冲突。审批先写入持久化 outbox，再联系导入器。重试只处理仍符合已批准版本和目标的失败项，不能用旧任务覆盖新版本。

每个 `(serverId,username)` 独立分配递增部署代次，每次安装、撤销和恢复均使用新代次。浏览器 `Batch` 不返回代次；内部任务返回 `generation`。撤销任务的 `fingerprint` 是确认时待撤销公钥的指纹，不表示撤销后仍安装了该公钥。撤销保留代次元数据，服务对目标响应不匹配或执行结果不确定的情况不会直接报告成功。

## 自动导入设置与候选

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| `GET /admin/auto-import` | 无 | `AutoImportSettings` |
| `PUT /admin/auto-import` | `{enabled:boolean,revision:number}` | 更新后的 `AutoImportSettings` |

```ts
type AutoImportSettings = {
  enabled: boolean
  revision: number
  updatedAt: string | null
  updatedBy: string | null
}
```

新数据库默认关闭自动导入，设置保存在 Web 数据库。修改需要新鲜管理员验证、Origin 和 CSRF；`revision` 必须为读到的当前版本，否则返回 `STALE_AUTO_IMPORT_SETTINGS`。重复写入相同开关值且版本匹配时不推进版本。

关闭时，新上传只进入待审核状态。开启后，后续新公钥上传会创建候选；候选冻结提交时的目标、公钥和开关版本，检查账号及允许清单就绪后生成 `source:'automatic'` 批次。此流程也适用于新上传的替换公钥。开启不会批量扫描此前上传的公钥，重复上传当前公钥也不会补建候选。

账号尚未创建、尚未授权或检查暂不可用时，候选保持等待并退避重查；执行失败或存在未核对结果时会阻止继续自动安装，交由管理员处理。学生移除、改换目标、提交更新版本、开放范围或开关版本变化，都会使不再适用的候选取消或被替代。

关闭自动导入取消尚处于 `waiting` 或 `blocked` 的候选，不取消已经批准进入 outbox 的批次，不撤销已安装公钥。手动撤销审批会设置 `autoImportBlocked:true`，避免后续上传自动恢复权限；管理员手动安装或恢复公钥成功后解除该标记。名单恢复或重新打开自动导入开关不会单独解除该标记。

## 内部导入服务

导入服务使用私有 Unix HTTP socket，独立保存任务数据库。该接口不通过 Nginx 暴露给浏览器。

| 方法与路径 | 输入 | 响应 |
| --- | --- | --- |
| `GET /health` | 无 | `{ok:true}` |
| `POST /check` | `{targets:Target[]}` | `{accounts:Array<Target & {status,message}>}` |
| `POST /jobs` | `{requestId,items:Array<Target & {action,publicKey,fingerprint}>}` | `Job` |
| `GET /jobs/:id` | 任务 ID | `Job` |

```ts
type Job = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  createdAt: string
  items: Array<Target & {
    action: 'install' | 'revoke'
    status: 'queued' | 'running' | 'success' | 'failed' | 'superseded'
    fingerprint: string
    error: string | null
    generation: number
  }>
}
```

账号 `status` 为 `missing`、`unauthorized`、`ready` 或 `error`，`message` 为字符串或 `null`。`/check` 接受 1 至 2000 个目标，不能重复同一服务器账号；`/jobs` 接受 1 至 2000 项，同一任务不能重复学生。每项均须显式携带合法且一致的 `studentId`、`serverId`、`username`。

安装项目携带标准公钥与一致的 SHA256 指纹；撤销项目携带 `publicKey:null` 和待撤销指纹。导入器调用 helper 时，将待撤销指纹转换为 `expectedFingerprint`，并把 helper 请求的 `publicKey`、`fingerprint` 都设为 `null`。

服务对同一 `requestId` 与相同规范化请求内容返回既有任务；相同 ID 携带不同内容会冲突。任务及每个服务器账号的代次持久保存，重启或写入结果不确定时核对安装程序的实际状态。任务目标不随之后的名单或路由选择改变。

路由由 root 管理的 `COURSE_KEYS_TARGETS_FILE` 指定，190 通过固定 sudo/Python 命令本地执行，132 和 197 通过固定 SSH 参数连接受限 receiver；不拼接远程 shell 命令。未配置目标显式失败，不回落到 190。远端主机密钥使用固定 known_hosts 严格验证，导入器私钥不提供给 Web 进程。

## 受限安装程序

安装程序从标准输入接收单个不超过 16 KiB 的 JSON 请求，标准输出返回 JSON。程序、配置和所有上级目录由 root 管理，网站和导入服务不能修改。当前配置 `schemaVersion:2`，固定本机 `serverId`，允许清单仍按学号索引预期 UID。

```ts
type HelperRequest = Target & {
  operation: 'check' | 'status' | 'apply'
  // 以下字段仅供 apply 使用
  action?: 'install' | 'revoke'
  generation?: number
  expectedFingerprint?: string | null // 仅撤销：确认时所见的已安装指纹
  publicKey?: string | null
  fingerprint?: string | null
}

type HelperResponse = {
  ok: boolean
  serverId: ServerId | null
  studentId: string | null
  username: string | null
  accountStatus: 'missing' | 'unauthorized' | 'ready' | 'error'
  generation: number | null
  action: 'none' | 'install' | 'revoke' | null
  fingerprint: string | null
  publicKey: string | null
  changed: boolean
  error: null | { code: string; message: string }
}
```

每个请求必须提供目标三字段；`serverId` 必须等于本机 root 配置，`username` 必须等于 `stu+studentId`，否则拒绝。响应回显可安全解析的目标字段，无效字段为 `null`；调用方必须核对响应目的地。安装程序使用 `pwd.getpwnam(username)` 精确查询账号，核对 root 允许清单中的实际 UID，并拒绝管理员账号。不会自动创建账号。

`check` 只检查账号权限，不读取当前安装状态，其代次、动作和公钥字段为 `null`。`status` 返回实际状态；尚无课程公钥元数据时为 `generation:0,action:'none'`。`apply` 要求正整数代次，范围不超过 JavaScript 安全整数上限；安装时重新解析公钥、自行计算指纹并调用 OpenSSH 复核。输入不能指定目标路径、服务器地址或任意命令。按 `stu` 用户名保存课程公钥和代次元数据，以账号锁保护原子写入。

撤销在账号锁内比较 `expectedFingerprint` 与当前已安装指纹。若确认后公钥发生变化，返回 `EXPECTED_KEY_MISMATCH`，不写入且不推进代次；已为空的目标可安全保持无公钥状态。安装操作不接受 `expectedFingerprint`。

同代次、同动作与公钥内容的重复应用成功且 `changed:false`；同代次不同内容返回冲突；旧代次不能覆盖新代次。撤销只移除课程管理公钥，保留版本元数据，不处理既有其他授权公钥文件。旧纯数字用户名的历史元数据作为审计和备份保留，不由新请求自动改写或清除；迁移前须核实旧授权状态。
