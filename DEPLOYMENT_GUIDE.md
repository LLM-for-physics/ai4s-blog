# AI4S Blog 部署指南

## 🎯 快速开始

### 首次部署

1. **配置 Nginx 反向代理**（⚠️ 重要）
   
   编辑 `deploy/aiphy.conf`，找到以下部分并替换占位符：
   
   ```nginx
   location /api/llm/ {
       # 替换这一行
       proxy_pass YOUR_API_ENDPOINT_HERE;
       # 改为实际的 API 端点，例如：
       # proxy_pass https://dashscope.aliyuncs.com/compatible-mode/v1/;
       
       # 替换这一行  
       proxy_set_header Authorization "Bearer YOUR_API_KEY_HERE";
       # 改为实际的 API Key，例如：
       # proxy_set_header Authorization "Bearer sk-abc123...";
   }
   ```

2. **执行部署**
   
   ```bash
   bash deploy/deploy.sh
   ```

3. **验证**
   
   访问 https://aiphy.pku.edu.cn，测试 AI 助手功能

### 日常更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新部署
bash deploy/deploy.sh
```

## 📋 本次更新内容

### 安全改进

**问题**：之前的实现将 API Key 直接暴露在前端代码中，存在严重安全隐患。

**解决方案**：使用 Nginx 反向代理，API Key 保存在服务器端。

### 更改的文件

1. **`docs/.vitepress/components/AIAssistant.vue`**
   - 移除前端的 API Key 配置
   - 改为调用本站的 `/api/llm/` 路径
   - API 请求通过 Nginx 反向代理转发

2. **`deploy/aiphy.conf`**
   - 新增 `/api/llm/` 反向代理配置
   - API Key 保存在 Nginx 配置中
   - 添加 CORS 头部和超时配置

3. **`deploy/deploy.sh`**
   - 添加配置检查（检测未替换的占位符）
   - 添加 Nginx 配置语法验证
   - 自动更新 Nginx 配置并重载
   - 改进输出格式和错误处理

4. **`.env.example`**（新文件）
   - 提供环境变量配置示例
   - 说明本地开发和生产环境的区别

5. **`AI_ASSISTANT_README.md`**
   - 更新配置说明
   - 添加详细的部署步骤
   - 添加安全最佳实践
   - 添加故障排除指南

6. **`DEPLOYMENT_GUIDE.md`**（本文件）
   - 提供快速部署指南
   - 汇总所有更改

## 🔐 安全架构

### 之前（不安全）
```
用户浏览器 --[包含 API Key]--> LLM API 服务器
```
❌ API Key 暴露在前端 JavaScript 代码中  
❌ 任何人都可以在开发者工具中看到 API Key  
❌ 存在 API Key 被盗用的风险

### 现在（安全）
```
用户浏览器 --[/api/llm/]--> Nginx --[包含 API Key]--> LLM API 服务器
```
✅ API Key 仅存在于服务器端  
✅ 前端代码不包含任何敏感信息  
✅ 用户无法获取 API Key

## ⚙️ 配置说明

### 本地开发

创建 `.env` 文件：

```env
# 模型名称
VITE_MODEL=qwen3-max

# 仅用于本地开发测试（可选）
VITE_OPENAI_API_KEY=your_dev_api_key
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
```

### 生产环境

编辑 `deploy/aiphy.conf`：

```nginx
location /api/llm/ {
    # API 端点（必须以 / 结尾）
    proxy_pass https://your-api-endpoint/v1/;
    
    # API Key
    proxy_set_header Authorization "Bearer sk-your-api-key";
    
    # 其他配置无需修改
}
```

## 🛠️ 故障排除

### 问题 1：AI 助手无响应

**检查 1**：Nginx 配置是否正确
```bash
sudo nginx -t
grep -A 5 "location /api/llm" /etc/nginx/sites-available/aiphy.conf
```

**检查 2**：查看 Nginx 日志
```bash
sudo tail -f /var/log/nginx/error.log
```

**检查 3**：测试 API 端点
```bash
curl -X POST http://localhost/api/llm/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-max","messages":[{"role":"user","content":"test"}]}'
```

### 问题 2：部署脚本报错

**如果提示占位符未替换**：
编辑 `deploy/aiphy.conf`，替换 `YOUR_API_ENDPOINT_HERE` 和 `YOUR_API_KEY_HERE`

**如果提示 Nginx 语法错误**：
检查 `deploy/aiphy.conf` 的语法，特别是 `proxy_pass` 后面的 URL 必须以 `/` 结尾

### 问题 3：404 错误

**解决方法**：
```bash
# 检查文件是否存在
ls -la /var/www/ai4s-blog/

# 修复权限
sudo chown -R www-data:www-data /var/www/ai4s-blog
sudo chmod -R 755 /var/www/ai4s-blog
```

## 📊 验证清单

部署完成后，请检查：

- [ ] 网站可以正常访问
- [ ] AI 助手按钮（💬）显示在右下角
- [ ] 点击按钮可以打开聊天窗口
- [ ] 可以成功发送消息并收到回复
- [ ] 浏览器控制台没有错误信息
- [ ] 构建产物中不包含 API Key（运行 `grep -r "sk-" docs/.vitepress/dist/assets/`）

## 🔄 回滚步骤

如果部署出现问题，可以回滚到之前的版本：

```bash
# 1. 查看提交历史
git log --oneline

# 2. 回退到指定提交
git checkout <commit-hash>

# 3. 重新部署
bash deploy/deploy.sh

# 4. 回到最新版本（如果需要）
git checkout main
```

## 📝 维护建议

1. **定期检查日志**
   ```bash
   sudo tail -100 /var/log/nginx/access.log | grep "/api/llm"
   ```

2. **监控 API 使用量**
   - 在 API 提供商的控制台查看使用统计
   - 设置使用量告警

3. **定期轮换 API Key**
   - 建议每 3-6 个月更换一次 API Key
   - 更换后重新部署

4. **备份配置**
   ```bash
   # 备份 Nginx 配置
   sudo cp /etc/nginx/sites-available/aiphy.conf ~/aiphy.conf.backup
   ```

## 📞 联系支持

如果遇到问题，请：
1. 查看 AI_ASSISTANT_README.md 中的详细文档
2. 检查 Nginx 错误日志
3. 在项目仓库提交 Issue

---

**最后更新**: 2025-01-10  
**版本**: 1.0.0
