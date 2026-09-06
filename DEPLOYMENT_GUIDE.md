# AI4S 部署与 AI 助教配置

静态站点发布、学期切换和回滚见 [TERM-OPERATIONS.md](TERM-OPERATIONS.md)。`deploy/deploy.sh` 发布静态产物，不会自动安装或重载 Nginx 配置。

## 密钥管理

浏览器仅请求同源 `/api/llm/chat/completions`。生产密钥通过 `/etc/nginx/secrets/ai4s-llm.conf` 注入，不存入仓库、前端环境变量或构建产物。文件由 root 持有，权限 0600，密钥变更与站点构建独立。密钥管理服务也可在部署时通过 `LLM_API_KEY` 环境变量调用安装脚本；不要把密钥写进命令行参数。

```bash
sudo python3 deploy/configure-llm-secret.py
```

脚本隐藏输入、验证 token 字符、原子写入文件，不打印密钥。Nginx 原生配置不会自动展开 shell 环境变量，所以不要直接写 `Bearer $LLM_API_KEY`。不要分享 `nginx -T` 的完整输出，它会展开秘密 include。

旧配置中出现过的真实密钥应在服务商处轮换；删除当前文件中的密钥不会删除 Git 历史或旧构建中的副本。

## 修复 HTTPS 流式链路

检查发现本机 `/etc/nginx/conf.d/aiphy-https.conf` 的 443 server 使用 `location /` 转发到 `127.0.0.1:80`，没有关闭该层默认的代理缓冲。仅在 80 端口配置 `proxy_buffering off` 无法保证公网 HTTPS 流式输出。

现在 HTTP 与 HTTPS 共用 `deploy/llm-locations.conf`，HTTPS 的精确 chat location 直接转发模型服务，绕过通用的 HTTP 回源。片段关闭代理缓冲、缓存和 gzip，并返回 `X-Accel-Buffering: no`。如果学校还有额外网关，也需要该网关透传 SSE 并关闭缓冲。

1. 检查 `deploy/llm-locations.conf` 的 `proxy_pass`。目前使用阿里云北京地域官方 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`，已启用 TLS 证书校验。密钥必须属于对应地域。
2. 安装密钥及公共代理片段：

   ```bash
   sudo python3 deploy/configure-llm-secret.py
   sudo install -m 644 deploy/llm-locations.conf /etc/nginx/snippets/ai4s-llm.conf
   ```

3. 在实际 443 server 中加入 `include /etc/nginx/snippets/ai4s-llm.conf;`。`deploy/aiphy-https.conf` 是基于本机实际 TLS 配置生成的完整示例，保留证书、HTTP 回源和 HSTS。备份后可安装：

   ```bash
   sudo cp -a /etc/nginx/conf.d/aiphy-https.conf /etc/nginx/conf.d/aiphy-https.conf.bak
   sudo install -m 644 deploy/aiphy-https.conf /etc/nginx/conf.d/aiphy-https.conf
   ```

4. 将实际 80 server 中原来的整个 `/api/llm/` location 替换为同一 include，以去除旧硬编码密钥；保留服务器现有的其他路由。参考 `deploy/aiphy.conf`，不要盲目覆盖整份配置。
5. 验证并重载：

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

   如校验失败，恢复备份后再次校验；不要在校验失败时重载。
6. 发布前端：`bash deploy/deploy.sh`。

该端点仍是公开的课程助手；隐藏密钥不等于用户鉴权。需要限制使用范围时，在学校网关增加登录校验和配额。

## 本地开发

复制 `.env.example` 到根目录 `.env`，填写 `LLM_API_KEY`、`LLM_BASE_URL`；`VITE_MODEL` 仅保存公开模型名称。开发代理在服务端加载 `LLM_` 变量。迁移旧 `.env` 时删除 `VITE_OPENAI_API_KEY`，切勿给任何秘密使用 `VITE_` 前缀。

```bash
yarn docs:dev
```

## 流式验证

通过**真实 HTTPS 域名**测试，而非仅测 localhost。`curl -N` 关闭客户端缓冲；应在请求结束前持续看到 `data:` 事件，最终收到 `[DONE]`。

```bash
curl -N https://aiphy.pku.edu.cn/api/llm/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.8-max","messages":[{"role":"user","content":"逐条解释牛顿三定律"}],"stream":true,"max_tokens":300}'
```

前端提供逐段 Markdown/公式渲染、停止生成、失败重试和移动端布局。网络中断会保留已有内容并标记未完成；新对话会取消旧请求，避免串写。用户向上滚动查看历史时不会被强制拉回底部。
