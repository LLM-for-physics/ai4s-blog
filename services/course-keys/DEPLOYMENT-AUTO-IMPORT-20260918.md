# 自动导入交付记录 — 2026-09-18

需求已实现并部署：助教可在管理页面启动或停止自动导入，首次提交和后续换钥都适用。默认关闭，已批准安装继续使用原受限 importer/SSH helper；网站不能创建账号或扩大 root 允许清单。

## 当前版本与数据

- 服务：`/usr/local/lib/course-key-service/releases/20260918-auto-v1`；前版 `20260918-pilot-v1`。
- 静态页面：`/var/www/ai4s-site/releases/20260918T083726Z-fa1b25ff`；前版 `20260918T060327Z-da715df5`。
- Web 数据库 schema 3，importer 仍为 schema 2。开关 `enabled=false, revision=0`。
- 升级前后所有原学生、公钥、批次、审计、会话、验证码、预览与限流表内容摘要一致。180 条历史学生记录、1 名在册、179 名此前已移除、1 把公钥均保留。
- 未改 SMTP、登录密钥或其他环境配置；运行中 Web 的 `COURSE_KEYS_ENROLLMENT_OPEN=false`、`COURSE_KEYS_ENROLLMENT_PILOT_IDS=2501110104` 已核对。
- 只重启 Web。importer、备份计时器、Nginx、SSH 均 active。无未完成安装任务。
- 本次只读复核：`2501110104` 目标 `132/stu2501110104`，安装检查 ready，网站已有公钥状态 installed。此记录是升级前已有业务数据，本轮未提交或替换该学生的公钥，也未实际测试该学生私钥登录。

## 功能与限制

开启只处理之后新提交的有效公钥，不扫描旧提交，也不会通过重复上传同一把公钥重新批准。账号不存在或尚未授权时，保留候选并以 5 秒起、最长 15 分钟的退避间隔检查；准备好后无需重传。真正安装前仍由 root helper 复查精确用户名、UID、服务器及允许清单。

关闭取消未批准候选，入队任务完成。手动撤销会暂停该学生后续自动导入，人工导入或恢复成功后解除；暂停期间的候选不复活。移除或改变目标使原候选失效。明确失败或结果未知需助教处理，通信重试沿用同一 requestId。

自动批次与人工批次共用不可变快照和版本队列。顺便修复了旧多人批次仍在处理中时，其已完成项反复覆盖更新安装记录的问题。

## 验证

- 本地后端 81/81；本地集成 6/6；190 Linux 合并运行 87/87。
- 新增自动导入回归 23 组，包括权限、版本、撤销保护、重启持久化、异步竞态、失败处理及跨服务器隔离。
- 120 名模拟学生在三服务器各 40 人自动导入，12 人再换钥；共 132 个独立批次且无重复安装。
- 构建页面与实际 API 的隔离浏览器 28 项通过，含 390px 布局、确认开关及自动状态刷新。
- 190 网站构建及 48 页密封检查通过。公网四个课程页面及健康检查成功，新应用资源 `/assets/chunks/theme.CxlXXaiE.js` 含自动导入入口。
- 无真实测试邮件、全班放开或新真实学生公钥操作。本轮未改三台服务器 SSH/helper，未重复真实 SSH 登录验收。

本地证据：`artifacts/course-keys-auto/VALIDATION.md`、`public-smoke.json` 与 `artifacts/course-keys-browser-auto/results.json`。服务器原始日志仅保留在特性工作树 `artifacts/course-keys-server-auto/`。

## 备份与回滚

迁移前一致性备份 `/var/backups/course-key-service/20260918T083651814732Z`，先以 Web 用户升级隔离副本，再以同一低权限账号升级实际数据库并核对摘要。

发布后备份 `/var/backups/course-key-service/20260918T083822477713Z` 已通过离线临时恢复：两数据库完整性、外键、写入后重开均通过；Web schema 3、180 名历史学生；worker schema 2、21 个历史任务；未完成任务均为 0；临时恢复副本已删除。190 管理公钥备份与现场摘要相同。

应用回滚需兼容 Web schema 3，不可直接指回旧 schema 2 程序，也不可盲目覆盖新业务数据或回退服务器公钥 generation。先关闭自动导入，再按 `deploy/AUTO-IMPORT.md` 处理。数据、公钥与 SSH 配置不会随静态网页回滚撤销。

代码包 SHA256：`ca705131f91ef55965e083cfd0f6dfe386b360e224bf1943e83fa14c5a004bb2`。
受审升级脚本 SHA256：`a659f0d1efb62034b942bef1703f39b6a212a116dad5f8beb2f1ad56fdf12c34`。
未执行 Git commit。