# 课程公钥机制测试与验收报告

> Historical v1 acceptance (2026-09-17). For current v2 deployment, roster counts, three-column templates and multi-server results, use [the 2026-09-18 delivery report](DEPLOYMENT-MULTI-SERVER-20260918.md).

本报告记录 2026-09-17 已完成的开发验收和 190 服务器实际联调。SMTP 已通过认证，指定管理员邮箱已实际收到验证码，用户已成功登录；正式选课名单尚未提供，学生入口保持关闭。通过的管理员邮件、服务和 SSH 测试不等于已经对全班开放。

## 已完成的验证

| 验证层次 | 已执行结果 | 覆盖与证据 |
| --- | --- | --- |
| 服务单元测试与根目录集成测试 | Windows 与 190 均使用 Node.js 24.21.0，各通过 33/33 项；后续以实际 TAP 输出为准 | 公钥与名单校验、身份与权限、提交版本、批次确认及幂等、失败恢复；`enrollment.test.js` 覆盖已有学生会话和 OTP 跨关闭重启及重开，管理员始终可用 |
| 课堂规模模拟 | 120 名模拟学生通过 | 共用一个模拟校园出口地址，完成验证码登录与各自公钥提交；记录无丢失、指纹不串号、上传不自动安装 |
| 真实浏览器验收 | 13 项通过 | 构建后的 VitePress 页面连接真实 Fastify API，覆盖完整交互；`artifacts/course-keys-browser/results.json` |
| 公网最终发布后只读检查 | 三个页面与健康接口通过 | `mailConfigured:true`、`enrollmentOpen:false`，HTTP 返回 301 跳转 HTTPS，零 JavaScript 错误；结果位于 `artifacts/course-keys-public-final` |
| VitePress 构建与站点核对 | 通过；最终发布核对 48 个页面 | 公钥页面与现有课程页面可构建，生成站点检查通过 |
| 现有聊天功能回归 | 4 项通过 | `tests/chat-stream.test.mjs` |
| 现有部署工具回归 | 通过 | `deploy/tests` 的 Python unittest；不在本报告固定用例数量 |
| 受限安装程序 | 190 上 17 项通过 | 使用真实 Linux/root 文件权限和系统 OpenSSH；数量为本次执行快照 |
| 190 真实 SSH 验证 | 15 个步骤全部通过 | 正确私钥、错误私钥、替换、撤销、恢复及最终清理；测试私钥已删除 |
| 真实服务权限通路 | 通过 | 以 `course-keys-web` 身份经真实 Unix socket、导入 worker 和 root helper，完成安装、替换、撤销、恢复和最终撤销 |
| systemd 服务与故障恢复 | 已运行并启用；缺套接字冷启动和导入器恢复通过 | 无 importer 套接字时 Web 冷启动成功；恢复 worker 后原 Web 进程即可通信，无需重启 Web。结果为 `course-key-service-recovery.json` |
| 真实 SMTP 与管理员登录 | 通过 | SMTP 认证成功；指定管理员邮箱实际收到验证码，用户成功完成登录。未据此验收全班发信额度或学生邮箱送达 |
| 定时备份 | 真实 systemd 备份运行成功，定时器已启用 | 已生成快照 `20260917T120323968269Z`；快照生成与下方隔离副本检查分别记录 |
| 隔离副本恢复检查 | 通过 | 对快照 `20260917T120323968269Z` 的 Web/importer 副本，分别以所属服务 UID 完成完整性、外键、写入及关闭后重新打开检查；中央公钥快照哈希与 LIVE 一致。临时副本已删除，生产数据库未修改；不能替代生产灾备演练 |

最新服务器原始证据仍保留在 190，未复制到本地。以下路径均为服务器路径：

| 证据 | 190 上的路径 |
| --- | --- |
| 最新 Node 测试输出 | `/tmp/course-key-linux-tests.log` |
| 隔离备份副本检查 | `/tmp/course-key-backup-verification.json` |
| Web 冷启动及 worker 恢复 | `/tmp/course-key-service-recovery.json` |
| 最终服务验收 | `/tmp/course-key-final-acceptance.json` |
| 最终静态发布 | `/tmp/course-key-static-publish.json` |

本地 `artifacts/course-keys-server` 中已有日志属于此前阶段性结果，可能记录 32 项测试或上一静态版本，不能作为本轮 33/33 项测试和最终发布的证据。`artifacts/course-keys-public-final` 与 `artifacts/course-keys-browser` 则是本地已核实的最终公网检查和浏览器交互结果。

浏览器验收的 13 项检查包括：

1. 管理员通过页面完成验证码登录，使用独立 Cookie 会话。
2. 下载两列 CSV 模板，预览并保存名单，保留学号前导零。
3. 学生通过学号派生的学校邮箱验证身份，显示正确服务器用户名。
4. 伪装成 `.pub` 的私钥被真实后端拒绝，公钥表没有新增记录。
5. 合法公钥去除注释后标准化保存，上传不会自动安装；390px 页面无横向溢出。
6. 账号不存在时不能确认导入；模拟账号准备好后，无需学生重新上传。
7. 管理员勾选、检查账号、核对指纹并确认，安装到预期学生记录。
8. Excel 导出保留文本学号、完整标准公钥和已导入状态。
9. 经预览和确认撤销课程公钥。
10. 经历史选择、预览和确认恢复所选公钥，安装版本继续递增。
11. 自动轮询将安装、撤销、恢复三个批次均更新为完成。
12. 助教搜索和筛选正常，1440px 桌面页面无全页横向溢出。
13. 学生刷新后看到已安装状态，浏览器无 JavaScript 异常。

控制台中私钥拒收对应的 HTTP 400 是测试预期结果；脚本会拒绝其他非预期控制台错误。手机与桌面截图已经目视检查。

最终静态发布 `20260917T120323Z-0d47ebb8` 后，公网只读冒烟检查覆盖三个页面和健康接口，健康状态为 `mailConfigured:true`、`enrollmentOpen:false`；HTTP 返回 301 跳转 HTTPS，零 JavaScript 错误。最终证据位于 `artifacts/course-keys-public-final`。此前 `artifacts/course-keys-public` 记录的是 SMTP 配置前检查，不代表最终邮件配置状态；真实管理员收信与登录另行验收通过。

## 浏览器与课堂模拟测试的边界

浏览器验收使用真实构建页面、真实 HTTP 接口和实际 SQLite 业务逻辑，但数据库位于内存中，邮件与公钥安装服务使用注入的测试替身。

- 验证码只进入测试进程内存，没有向学校或外部邮箱发信。
- 模拟安装记录只进入测试任务，不创建服务器账号，也不调用真实 SSH 或修改服务器公钥。
- 测试生成的私钥只用于拒收场景和临时测试密钥，未使用任何学生私钥。
- **120 人模拟验证应用处理和身份限流逻辑，不代表 SMTP 发信额度、学校邮箱送达速度或服务器 SSH 并发能力已经通过验收。**

上述限制针对浏览器和课堂规模模拟。190 的真实权限通路、SSH，以及指定管理员邮箱的真实收信和登录已另行完成上表所列验证；学生学校邮箱送达与课堂集中发信额度仍未验收。

## 重复执行方法

需要 Node.js 24、服务依赖、站点依赖和 Python 3。以下命令均从仓库根目录执行。

```sh
npm --prefix services/course-keys ci
npm --prefix services/course-keys test
node --test tests/course-keys-integration.test.mjs

yarn docs:build
yarn site:verify
yarn chat:test
yarn deploy:test
```

浏览器脚本读取已生成的站点目录：

```sh
node tests/course-keys-browser.mjs docs/.vitepress/dist
```

脚本优先加载项目可解析的 `playwright` 或 `playwright-core`，也可使用当前用户已有的 Codex 工作运行时。浏览器优先使用 Playwright 的 Chromium，其次查找系统标准安装位置的 Chrome、Edge 或 Chromium。

如自动发现不可用，使用以下环境变量指定本机安装位置；无需修改脚本：

| 环境变量 | 用途 |
| --- | --- |
| `COURSE_KEYS_PLAYWRIGHT_MODULE` | Playwright 模块名称或绝对路径 |
| `COURSE_KEYS_BROWSER_EXECUTABLE` | Chromium、Chrome 或 Edge 可执行文件路径 |
| `COURSE_KEYS_BROWSER_ARTIFACTS` | 可选的测试产物目录，默认 `artifacts/course-keys-browser` |

脚本自动使用 `127.0.0.1` 的随机端口，在两个独立浏览器上下文中运行，完成后关闭服务与浏览器。产物包括机器可读结果、手机截图、助教桌面截图、CSV 模板和 Excel 导出。测试失败时会保留失败截图和错误详情。

隔离备份副本检查由 `services/course-keys/deploy/verify-backup.py` 实现。在已部署的 190 上执行下列固定命令；它检查隔离副本，不是生产数据库恢复命令：

```sh
sudo /usr/bin/python3 -I -S /usr/local/lib/course-key-service/current/deploy/verify-backup.py
```

## 本次部署记录

- 最终静态站点发布：`20260917T120323Z-0d47ebb8`，共 48 页。功能加入前的稳定回滚基线为 `20260914T164549Z-779bf99f`；`20260917T114503Z-62609e1a` 仅为本次功能的中间发布，不是该基线。
- 独立服务发布：`20260917T114000Z`，部署根目录为 `/usr/local/lib/course-key-service`。
- 运行时已升级至 Node.js `24.21.0`；Windows 与 190 的服务及根目录集成测试各通过 33/33 项。后续运行时升级仍须重新验证。
- 合成测试账号 `0099000190` 的课程公钥最终状态为撤销，代次 `10`。测试私钥已删除；该账号已设置过期、禁止登录、主组改为 `nogroup`，并已从安装允许清单移除。
- 安装允许清单当前为空，正式网站选课名单也为空；没有将测试名单留作正式学生数据。
- SMTP 已认证，指定管理员邮箱已收到验证码并成功登录。学生入口保持关闭，等待学生学校邮箱验收、正式名单与账号核对。
- 关闭入口会在 Web 重启载入配置后阻止学生发码、验证和已有学生会话的访问；管理员仍可操作。`enrollment.test.js` 已覆盖已有学生会话和已发 OTP 跨关闭重启及重新开放，管理员始终可用。关闭入口不会暂停已批准任务或撤销 SSH 公钥，也不会删除未过期会话和验证码。

## 正式开放前仍需完成

| 实际验收 | 完成标准 |
| --- | --- |
| 课堂集中发信边界 | 指定管理员邮箱的单次真实收信和登录已通过；仍需核对实际 SMTP 额度、集中发信送达速度和垃圾邮件情况 |
| 学校邮箱真实接收 | 按测试学号验证 `学号@stu.pku.edu.cn` 的收件与登录流程 |
| 变更后的 SSH 复核 | 实际 SSH 测试已通过；今后更改账号组或 SSH 配置时，保留管理员连接，重新核对语法及各角色、来源的有效配置 |
| 小范围试用 | 正式名单与学生邮箱核对后，由少量学生完成收信、上传、助教确认导入及实际 SSH 登录，再决定全班开放 |
| 实际生产灾备演练 | 恢复前停止 Web 和 importer；逐项核对恢复副本中的未完成批次、任务以及已成功记录与 LIVE 公钥代次/指纹。核对完成前不得启动服务，关闭学生入口不能替代停服；应用回滚不得删除已安装公钥与元数据 |
| 正式名单与账号 | 核对课程名单、缺失账号和授权状态，再由助教人工确认实际批次 |

只有对应项目实际完成后，才在上线记录中标记通过。当前已完成真实 SSH、服务通路与故障恢复、管理员真实邮件和登录、备份生成及隔离副本恢复检查；实际生产灾备演练和正式全班开放尚未完成。隔离副本检查未执行生产停服恢复，也未证明真实业务数据恢复后的任务核对已完成。
