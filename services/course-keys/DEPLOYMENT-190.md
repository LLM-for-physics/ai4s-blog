# 190 课程公钥机制部署记录

记录时间：2026-09-17。功能已部署，管理员真实邮件验证码和网页登录已通过；学生入口暂未开放。

## 入口与身份

- 助教管理：https://aiphy.pku.edu.cn/course/ssh-keys-admin
- 学生提交：https://aiphy.pku.edu.cn/course/ssh-keys
- 学生教程：https://aiphy.pku.edu.cn/course/ssh-keys-guide
- 助教说明：https://aiphy.pku.edu.cn/course/ssh-keys-admin-guide
- 管理员：`gwlbgs523@pku.edu.cn`。
- 验证码发件邮箱：`physicsandai2026@163.com`。SMTP 已认证，授权码仅保存在服务器 root 可读配置中。
- `COURSE_KEYS_ENROLLMENT_OPEN=false`，正式名单与安装允许清单当前均为空。管理员可以登录并准备名单。

## 已部署内容

学生按学号验证学校邮箱，提交单个 `.pub` 文件。服务器解析并规范化有效公钥，保存指纹和版本，不保存原始附件。学生不能指定替代邮箱、服务器或 Linux 用户名。

助教可以预览并导入两列名单（学号、姓名），核对提交状态、查看完整公钥、导出 Excel、检查账号、确认批次、重试失败记录，以及预览和确认撤销、恢复操作。上传公钥不会自动安装；账号不存在或未在 root 管理的允许清单中时不能安装。

Web、导入 worker 与固定 root 安装程序分别运行。Web 无 sudo 权限，不持有管理员 SSH 私钥。安装仅管理中央课程公钥文件，保留原有个人授权路径；不自动创建学生 Linux 账号。

## 运行状态与数据位置

| 项目 | 实际值 |
| --- | --- |
| 静态发布 | `/var/www/ai4s-site/releases/20260917T120323Z-0d47ebb8` |
| 功能上线前的静态版本 | `/var/www/ai4s-site/releases/20260914T164549Z-779bf99f` |
| 服务发布 | `/usr/local/lib/course-key-service/releases/20260917T114000Z` |
| 独立 Node 运行时 | `/usr/local/lib/course-key-service/runtime/bin/node`，v24.21.0 |
| 名单、会话、公钥版本等 | `/var/lib/course-key-service/web/keys.sqlite3` |
| 安装任务 | `/var/lib/course-key-service/importer/jobs.sqlite3` |
| 已安装课程公钥 | `/etc/ssh/course_authorized_keys/<学号>` |
| root 管理配置 | `/etc/course-keys/`，配置文件 `0600` |
| 每日备份 | `/var/backups/course-key-service/`，保留 30 天 |
| 常驻服务 | `course-keys-web.service`、`course-keys-importer.service`，均 active/enabled |
| 备份定时器 | `course-keys-backup.timer`，active/enabled |

业务数据与静态网站目录分离，发布或回滚网页不会覆盖业务数据。备份不包含 SMTP 和应用密钥；这些配置须按既有私密运维流程单独保管。

## 验收结果与范围

- 后端与根目录集成测试 33/33，通过于 Windows 及 190 的 Node 24.21.0。
- Linux 受限安装程序测试 17/17；真实浏览器交互检查 13 项通过。
- 120 名模拟学生完成验证码登录和各自公钥提交，使用模拟邮件；未向 120 个真实邮箱发信。
- 专用测试账号通过真实 SSH 的 15 个步骤，覆盖正确/错误私钥、替换、撤销、恢复；服务身份经真实 Unix socket、worker、root helper 的完整通路通过。
- 导入服务缺席时 Web 可冷启动；导入服务恢复后，无需再次重启 Web 即可通信。
- 每日备份实际运行成功；两份数据库在隔离副本中的完整性、外键、写入和重新打开检查通过，中央公钥快照与实际状态一致。生产数据未被覆盖，临时副本已清理。
- 最终站点构建与 48 页核对通过，原有聊天和部署工具回归通过，既有 OpenAI Codex 教程保留。
- 公网学生页、助教页及上述教程均返回 200；HTTP 跳转 HTTPS，未登录的管理 API 返回 401，直接绕过网关的 HTTP API 返回 403；手机/桌面无全页横向溢出及 JavaScript 异常。
- SMTP 认证、管理员实际收信和网页登录均已通过。学校学生邮箱送达、课堂集中发信额度尚待验收。

专用合成测试账号 `0099000190` 已过期、设为禁止登录并移出安装允许清单；其课程公钥已撤销（代次 10），临时私钥已删除。测试未留下正式学生名单。

最终原始服务器日志留存于 190 的工作树 `artifacts/course-keys-server-final/`，不包含在本次本地下载中。本地 `artifacts/course-keys-server/` 是较早阶段记录；当前以本文件、TESTING.md 及服务器最终日志为准。最终公网浏览器结果位于本地 `artifacts/course-keys-public-final/`。

## 正式开放前

1. 在助教页面导入只有“学号、姓名”两列的正式名单，先查看预览再保存。
2. 检查账号准备情况。缺失账号由管理员独立创建；核对实际 UID 和课程组后加入 root 安装允许清单。名单导入与公钥上传均不创建账号。
3. 指定一个学生学校邮箱与对应测试学号，完成真实收信、上传、助教确认导入和 SSH 登录的小范围试用，并核对 163 SMTP 的实际额度与集中发信送达情况。
4. 准备好后在服务器开启学生入口并重启 Web。关闭入口仅阻止学生访问，不暂停已批准的导入任务，也不撤销已安装的 SSH 公钥。

应用与网页回滚遵循 [部署与回滚说明](deploy/README.md)。实际生产灾备恢复演练未执行；恢复数据库前必须停止 Web 和 importer，核对恢复任务与实时公钥代次、指纹，不得把通过隔离副本检查理解为可直接覆盖生产数据库。

## 源码交付

- 服务器独立工作树：`/home/fyl/ai4s-blog-course-keys`。
- 分支：`feat/course-key-onboarding-20260917`，本次未执行 Git 提交。
- 原工作树 `/home/fyl/ai4s-blog` 与其既有未提交教程文件均保留。
- 本地源码副本：`F:/Desktop/ssh-server-with-ai/course-key-work/site`。
- 完整测试细节：[TESTING.md](TESTING.md)。