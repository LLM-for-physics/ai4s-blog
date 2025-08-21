# 代码示例

本目录包含了 LLM Agent 开发指南的所有代码示例，帮助同学们更好地理解和实践课程内容。

## 📁 文件结构

### 依赖文件
<CodeFileViewer 
  src="/course/llm-agent/code-examples/requirements.txt" 
  filename="requirements.txt"
  language="text"
/>

### Python 代码示例

<CodeFileViewer 
  src="/course/llm-agent/code-examples/basic_api_calls.py" 
  filename="basic_api_calls.py"
  language="python"
/>

<CodeFileViewer 
  src="/course/llm-agent/code-examples/prompt_templates.py" 
  filename="prompt_templates.py"
  language="python"
/>

<CodeFileViewer 
  src="/course/llm-agent/code-examples/math_agent.py" 
  filename="math_agent.py"
  language="python"
/>

::: tip 使用说明
- 点击 **预览代码** 按钮可以直接在页面中查看代码内容
- 点击 **复制代码** 按钮可以将代码复制到剪贴板
- 点击 **下载文件** 按钮可以下载文件到本地
- 所有文件都可以独立运行，建议按顺序学习
:::


## 🚀 快速开始

1. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

2. **设置环境变量**
   ```bash
   # 创建 .env 文件
   cp .env.example .env
   # 编辑 .env 文件，添加你的 API 密钥
   ```

3. **运行示例**
   ```bash
   # 运行基础 API 调用示例
   python basic_api_calls.py
   
   # 运行 Prompt 模板示例
   python prompt_templates.py
   
   # 运行数学 Agent 示例
   python math_agent.py
   ```

## 💡 使用提示

- 所有示例都包含详细的注释和说明
- 每个文件都可以独立运行
- 建议按照学习路径逐步学习
- 可以根据需要修改和扩展代码

## 🔧 环境要求

- Python 3.12+
- 相关 LLM API 密钥（OpenAI、Anthropic 等）
- 必要的 Python 包（见 requirements.txt）

## 📞 获取帮助

如果在运行示例时遇到问题：
1. 检查 API 密钥是否正确设置
2. 确认所有依赖包已安装
3. 查看各模块的详细文档
4. 联系课程助教获取支持
