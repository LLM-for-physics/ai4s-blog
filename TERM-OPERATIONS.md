# 学期归档与发布操作手册

## 当前约定

`terms.json` 是学期清单。2025 秋基线为 `2bb11ac239c3bc79c73c22c857913b54d9d98f40`，不包含当时未提交的文件。归档适配代码在 `scripts/build-archive.mjs` 和 `scripts/archive/`；旧正文和侧边栏从基线提取。

使用 Node 20+、Yarn 4.9.2、Python 3.8+、Git、tar，先执行 `yarn install --immutable`。归档构建核对基线 package 依赖与 yarn.lock；不匹配则拒绝构建，需在保留适配脚本的独立 checkout 中恢复基线依赖。不要升级锁文件来绕过检查。

## 本地构建与验收

```bash
yarn docs:build
yarn archive:build
yarn site:verify
yarn deploy:test
```

`yarn site:build` 合并前两个构建命令。主站输出在 `docs/.vitepress/dist/`，归档在 `artifacts/archive/2025-fall/`。`site-manifest.json` 是全部文件的 SHA-256 清单；`archive-build.json` 记录基线、Node、包管理器、锁文件和适配代码摘要。验证失败的产物不可发布。

`docs/public` 中的通用代码示例可以在本地有虚拟环境；构建先生成 `.site-public/`，排除隐藏文件、虚拟环境、缓存。学生表、成绩、反馈文件不属于公开资源，检查发现会阻止构建。构建之外还需审计代码示例中的实际凭据，不应把私有数据塞入任意其他文件名绕过限制。

本地模拟发布（不会修改 nginx）：

```bash
python3 deploy/publish.py --root /tmp/ai4s-release-check
```

再次发布会产生新的完整主站目录，归档目录保持原文件不变。产物被修改而未重新验收、归档缺失或试图覆盖归档时，发布失败且不会切换 current。

## 首次生产迁移

本机已核实 HTTPS server 反向代理至本机 80 端口，HTTP server 提供静态文件。对应的一次性自动迁移脚本为：

```bash
sudo python3 deploy/migrate-production.py
```

脚本严格核对旧 root 和静态 location，保留 LLM 代理及 HTTPS 配置，将旧配置备份到 `/var/backups/ai4s-site/<timestamp>/`，验证产物后发布、检查 nginx 语法并 reload，随后测试 HTTP/HTTPS。失败自动恢复旧 nginx 配置。该脚本仅用于首次迁移，成功后使用常规发布命令。


本次代码准备不等同于线上已迁移。上线前先核对 `nginx -T` 的有效 HTTP/HTTPS 配置、旧数据位置和磁盘空间，备份当前配置与原站点；不要在共享日志中打印 API key。

1. 构建、验收并在服务器外备份归档产物，以及包含基线 commit 的 Git 仓库；建议保存 `git bundle` 或推送不可变学期 tag。仅记录 SHA 而丢失 Git 对象无法重建。
2. 执行 `sudo python3 deploy/publish.py`，准备 `/var/www/ai4s-site/current`。该步骤不修改原来的 `/var/www/ai4s-blog/`。
3. 将 `deploy/static-locations.conf` 安装为 `/etc/nginx/snippets/ai4s-static.conf`。在实际提供课程网站的 server 中设置 `root /var/www/ai4s-site/current;` 并 include 此文件，移除冲突的旧静态 location。仓库 `deploy/aiphy.conf` 已展示目标结构；保留实际 TLS、证书和 API 代理设置，不能盲目用 HTTP 示例替换线上配置。
4. 执行 `sudo nginx -t`；失败立即恢复备份配置，勿 reload。通过后 `sudo systemctl reload nginx`。reload 失败时恢复配置并再次测试/加载。
5. 验证首页、归档深层页和刷新、代码预览/下载、Mermaid、移动端横幅和版本切换。未知 URL 返回 404，`/score/extra.yaml`、旧学生表、归档成绩数据路径不可访问。确认旧数据没有通过其他 location/域名公开。
6. 保留旧站点和配置备份，完成线上验收后再按运维保留策略处理。首次迁移回退需恢复旧 nginx 配置；常规发布回退只切换 current。

发布目录：

```text
/var/www/ai4s-site/
  current -> releases/<release-id>
  releases/<release-id>/
    index.html
    archive/index.html
    archive/2025-fall -> /var/www/ai4s-site/archives/2025-fall
  archives/2025-fall/
    index.html
    archive-build.json
    site-manifest.json
```

## 日常主站发布与回滚

首次配置迁移后执行：

```bash
bash deploy/deploy.sh
```

脚本只构建/验证主站，检查已安装 nginx 配置，再发布；服务器已有归档时不需要本地归档副本，也不重建旧站。若本地还保留归档产物，则要求与服务器归档完全一致。归档发布后不要日常重新构建，否则构建环境差异可能导致摘要变化，被不可覆盖规则拒绝。

发布命令输出新旧 release 路径。回滚使用记录的旧路径：

```bash
sudo python3 deploy/publish.py --rollback /var/www/ai4s-site/releases/<previous-release-id>
```

不删除历史发布；磁盘清理由运维另行安排，不能删除 current 或仍需回滚的目标。主站切换是原子的，但已打开旧页面的浏览器仍可能请求旧哈希资源；正常发布后必要时刷新页面。若需要保证跨发布的长会话连续性，可另行建设共享哈希资源存储。

## 下一学期

1. 将当前学期最终内容提交，记录完整 commit，可打 `term-2026-fall-final` tag 并备份远端。
2. 在 `terms.json` archives 增加该学期，更新 current。复核归档适配仍适用于新基线，尤其未来添加的动态组件和资源链接。
3. `yarn archive:build 2026-fall` 构建新增归档并单独验收，不重建已有归档。
4. 在 `deploy/static-locations.conf` 为新增学期增加对应 404 location；更新 `docs/archive/index.md`。
5. 按需求清理主站。正式内容未知时使用待公布，不复制上一学期的人员、账号或考核安排。
6. 构建、验证、备份、发布；新学期成绩或反馈功能需要独立设计生产服务和授权，不能恢复公开静态数据目录。

## 本次年份复核

已重置首页、介绍、大纲、评分、作业、讲义、网关和服务器分配说明。`git-usage.md` 的 2025 截图名称、`api-basics.md` 和 `claude-code.md` 中带日期的模型 ID、服务器教程的历史终端输出属于示例/历史引用，保留。工作区原有未提交的 `openai-codex.md` 未被修改，也未纳入 2025 快照。

## 2026-09-06 发布前验证记录

- 当前站 46 页、2025 秋归档 44 页通过构建及生成资源检查。
- 8 项发布测试通过，覆盖重复发布、归档保持不变、旧文件清理、错误产物拒绝、并发锁及回滚。
- 本机 nginx `127.0.0.1:18086` 实际路由验证通过：两套首页、归档深层页、代码下载、成绩/学生表拒绝及真实 404。
- Chromium 浏览器验证通过：导航版本切换、归档代码预览/下载、404 横幅、390px 手机布局；工具调用页 Mermaid 已生成 SVG，无动态请求及 JS 错误。
- 生产迁移已由管理员执行成功，HTTP 与 HTTPS 各 10 项检查全部通过。
- 当前发布：`/var/www/ai4s-site/releases/20260906T154610Z-e8338aeb`。
- 配置备份：`/var/backups/ai4s-site/20260906T154609Z/`，其中 `deployment.json` 记录迁移结果。
- 原站点 `/var/www/ai4s-blog/` 保留，首次迁移前没有旧 release。若需退回迁移前版本，应恢复上述备份中的 nginx 配置并执行 `nginx -t`、reload；不能使用不存在的 previous release 回滚。
- 后续内容更新执行 `bash deploy/deploy.sh`，不要重复运行一次性迁移脚本。
