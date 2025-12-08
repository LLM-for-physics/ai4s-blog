# AI 助手功能文档

## 功能概述

为网站添加了一个 AI 聊天助手，用户可在每个页面右下角看到 💬 悬浮按钮，点击展开聊天窗口与 AI 对话。

## 核心特性

### 基础功能
- ✅ 右下角悬浮按钮
- ✅ 可展开/收起的聊天窗口
- ✅ 多轮对话支持
- ✅ 自动获取当前页面内容作为上下文
- ✅ 响应式设计（支持移动端）
- ✅ 深色/浅色模式自适应

### 窗口交互
- ✅ 拖拽移动窗口（点击标题栏拖动）
- ✅ 调整窗口大小（拖动右下角手柄）
- ✅ 窗口位置和大小自动保存

### 内容渲染
- ✅ Markdown 格式支持
- ✅ LaTeX 数学公式渲染（行内 `$...$` 和块级 `$$...$$`）
- ✅ 代码高亮显示
- ✅ 表格、列表、引用等格式化显示

### 数据管理
- ✅ 对话历史本地存储（localStorage）
- ✅ 清空对话历史功能
- ✅ 刷新页面保持对话和窗口状态

## 配置说明

### 本地开发环境变量

创建 `.env` 文件（复制 `.env.example`）：

```env
# 模型名称（必需）
VITE_MODEL=qwen3-max

# 本地开发时的 API 配置（可选，用于本地测试）
VITE_OPENAI_API_KEY=your_api_key
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
```

⚠️ **重要**：
- 修改 `.env` 后必须重启开发服务器（`yarn docs:dev`）
- `.env` 文件已在 `.gitignore` 中，不会提交到仓库
- 生产环境不使用 `.env` 中的 API Key

### 生产环境配置

生产环境中，API Key 保存在服务器端的 Nginx 配置中，不暴露给客户端：

1. **编辑 `deploy/aiphy.conf`**：
   ```nginx
   location /api/llm/ {
       # 替换为实际的 API 端点
       proxy_pass https://your-api-endpoint/v1/;
       
       # 替换为实际的 API Key
       proxy_set_header Authorization "Bearer your-actual-api-key";
       # ... 其他配置
   }
   ```

2. **安全性**：
   - ✅ API Key 仅存在于服务器端
   - ✅ 客户端无法获取 API Key
   - ✅ 防止 API Key 泄露和滥用

## 使用方法

### 基本操作

| 操作 | 说明 |
|------|------|
| 点击 💬 | 打开聊天窗口 |
| 点击 ✕ | 关闭聊天窗口 |
| Enter | 发送消息 |
| Shift+Enter | 换行 |
| 点击 🗑️ | 清空对话历史 |

### 窗口操作

| 操作 | 说明 |
|------|------|
| 拖拽标题栏 | 移动窗口位置 |
| 拖拽右下角 | 调整窗口大小 |

## 技术架构

### 文件结构

```
docs/.vitepress/
  ├── components/
  │   └── AIAssistant.vue          # AI 助手组件
  └── theme/
      └── index.ts                 # 主题配置（已集成组件）
```

### 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 Composition API | 组件框架 |
| TypeScript | 类型安全 |
| marked | Markdown 解析 |
| marked-katex-extension | LaTeX 公式渲染 |
| highlight.js | 代码高亮 |
| DOMPurify | XSS 防护 |
| localStorage | 数据持久化 |

### 核心功能实现

#### 1. 拖拽功能
- 监听 header 的 `mousedown` 事件启动拖拽
- 通过 `mousemove` 计算增量更新窗口位置
- 使用动态样式绑定 `left/top` 实现定位

#### 2. 调整大小
- 右下角添加调整手柄
- 监听手柄的 `mousedown` 事件启动调整
- 限制最小尺寸 300x300px

#### 3. 上下文提取
自动提取当前页面的：
- 页面标题
- 页面路径
- 完整 Markdown 内容

作为 system prompt 发送给 LLM。

## 常见问题

### Q: API 请求失败？
A: 检查：
1. `.env` 配置是否正确
2. 开发服务器是否已重启
3. 网络连接是否正常
4. 控制台错误信息

### Q: 公式无法渲染？
A: 确保：
- 行内公式使用 `$...$`
- 块级公式使用 `$$...$$` 且前后有空行
- 不要在行内使用 `$$...$$`

### Q: 对话历史在哪？
A: 保存在浏览器 localStorage 中，清除浏览器数据会删除历史记录。

## 部署说明

### 开发环境

```bash
# 安装依赖
yarn install

# 启动开发服务器
yarn docs:dev
```

### 生产环境部署

#### 1. 配置 Nginx 反向代理

编辑 `deploy/aiphy.conf`，替换占位符：

```nginx
location /api/llm/ {
    # 替换为实际的 API 端点
    proxy_pass https://dashscope.aliyuncs.com/compatible-mode/v1/;
    
    # 替换为实际的 API Key
    proxy_set_header Authorization "Bearer sk-your-actual-api-key";
    
    # 其他配置保持不变...
}
```

#### 2. 执行部署脚本

```bash
# 运行部署脚本
bash deploy/deploy.sh
```

部署脚本会自动：
- ✅ 检查 Nginx 配置中是否有未替换的占位符
- ✅ 验证 Nginx 配置语法
- ✅ 构建 VitePress 站点
- ✅ 同步文件到 Nginx 目录
- ✅ 设置正确的文件权限
- ✅ 更新 Nginx 配置（如有变化）
- ✅ 重新加载 Nginx

#### 3. 验证部署

访问 `https://aiphy.pku.edu.cn`，点击右下角的 💬 按钮测试 AI 助手功能。

### 安全最佳实践

#### ⚠️ 重要安全说明

**生产环境架构**：
```
用户浏览器 → Nginx (包含 API Key) → LLM API 服务器
```

**为什么使用反向代理？**

1. **API Key 安全**：
   - ❌ 错误做法：在前端代码中硬编码 API Key
   - ✅ 正确做法：API Key 保存在服务器端 Nginx 配置中
   - 用户无法通过浏览器开发者工具获取 API Key

2. **防止滥用**：
   - 可在 Nginx 层添加速率限制
   - 可添加访问日志和监控
   - 可实施 IP 黑白名单

3. **跨域问题**：
   - 解决浏览器 CORS 限制
   - 统一请求路径

#### 🔒 API Key 保护检查清单

- [ ] 确认 `.env` 在 `.gitignore` 中
- [ ] 确认没有将 API Key 提交到 Git 仓库
- [ ] 确认 Nginx 配置文件权限正确（`chmod 600`）
- [ ] 确认已删除构建产物中的敏感信息
- [ ] 定期轮换 API Key
- [ ] 监控 API 使用量，防止异常消耗

#### 检查构建产物

部署后检查 JavaScript 文件是否包含敏感信息：

```bash
# 在构建目录中搜索可能的 API Key
grep -r "sk-" docs/.vitepress/dist/assets/

# 应该没有任何输出，如果有输出说明存在泄露风险
```

### 故障排除

#### 1. AI 助手无法连接

**症状**：点击发送按钮后，收到"发生了错误"提示

**排查步骤**：
```bash
# 1. 检查 Nginx 配置是否正确
sudo nginx -t

# 2. 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 3. 检查反向代理配置
grep -A 10 "location /api/llm" /etc/nginx/sites-available/aiphy.conf

# 4. 测试 API 端点（在服务器上）
curl -X POST http://localhost/api/llm/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-max","messages":[{"role":"user","content":"test"}]}'
```

#### 2. 配置未生效

**症状**：修改了配置但没有效果

**解决方法**：
```bash
# 重新部署
bash deploy/deploy.sh

# 或手动重新加载 Nginx
sudo systemctl reload nginx
```

#### 3. 权限问题

**症状**：404 错误或无法访问文件

**解决方法**：
```bash
# 检查文件所有者
ls -la /var/www/ai4s-blog/

# 修复权限
sudo chown -R www-data:www-data /var/www/ai4s-blog
sudo chmod -R 755 /var/www/ai4s-blog
```

### 监控和维护

#### 日志位置

- **Nginx 访问日志**：`/var/log/nginx/access.log`
- **Nginx 错误日志**：`/var/log/nginx/error.log`

#### 监控 API 使用

在 Nginx 配置中添加日志记录：

```nginx
location /api/llm/ {
    # ... 其他配置
    
    # 记录 API 调用
    access_log /var/log/nginx/ai-assistant-api.log combined;
}
```

### 更新和回滚

#### 更新部署

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新部署
bash deploy/deploy.sh
```

#### 回滚

```bash
# 1. 回退到之前的提交
git checkout <previous-commit-hash>

# 2. 重新部署
bash deploy/deploy.sh
```

### 环境差异说明

| 环境 | API Key 位置 | 配置方式 |
|------|-------------|---------|
| 本地开发 | `.env` 文件 | `VITE_OPENAI_API_KEY` |
| 生产环境 | Nginx 配置 | `proxy_set_header Authorization` |

⚠️ **关键区别**：
- 本地开发：前端直接调用 API（使用 `.env` 中的配置）
- 生产环境：前端调用 `/api/llm/`，由 Nginx 代理到真实 API（API Key 在服务器端）
