# LLM API 调用基础

## 📖 概述

本模块将介绍大语言模型 API 的调用方法，帮助同学们理解如何通过程序与 LLM 进行交互。我们将学习基础概念，并重点掌握北大物理学院 LLM 网关的使用方法。

## 🔍 LLM API 调用原理

### 什么是 API？

API（Application Programming Interface，应用程序编程接口）是不同软件组件之间通信的桥梁。LLM API 允许我们通过网络请求与大语言模型进行交互。

### HTTP 请求基础

LLM API 基于 HTTP 协议工作，主要使用 POST 方法：

```python
import requests

url = "http://api-endpoint.com/v1/chat/completions"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
data = {
    "model": "model-name",
    "messages": [{"role": "user", "content": "Hello!"}]
}

response = requests.post(url, headers=headers, json=data)
print(response.json())
```

### 流式响应 vs 批量响应

LLM API 支持两种响应模式：

**批量响应**：等待完整回答后一次性返回
```python
response = requests.post(url, headers=headers, json=data)
result = response.json()
print(result['choices'][0]['message']['content'])
```

**流式响应**：实时返回生成的内容（逐字输出）
```python
data["stream"] = True
response = requests.post(url, headers=headers, json=data, stream=True)

for line in response.iter_lines():
    if line:
        # 处理流式数据
        print(line.decode('utf-8'))
```

## 🔑 核心组件详解

### Base URL（基础 URL）

Base URL 是 API 服务的根地址，不同供应商或部署有不同的端点：

```python
# 官方 API 示例
OPENAI_BASE_URL = "https://api.openai.com/v1"
ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"

# 自定义部署或网关
CUSTOM_BASE_URL = "http://162.105.151.181/v1"
```

### API Key（API 密钥）

API Key 是身份认证的凭证，确保只有授权用户才能访问服务。

**安全最佳实践**：使用环境变量存储 API Key

```python
import os
from dotenv import load_dotenv

load_dotenv()  # 从 .env 文件加载环境变量
API_KEY = os.getenv("API_KEY")
```

## 🎓 北大物理学院 LLM 网关使用

我们在服务器上部署了 LLM 网关服务：http://162.105.151.181/

该网关支持多种 API 格式，方便同学们使用不同的客户端库进行调用。详细的网关说明请查看 [LLM 网关文档](../llm-gateway.md)。

### 获取 API Key

1. 在 [LLM 网关](http://162.105.151.181/) 注册账号（用户名设置为学号）
2. 在左侧"令牌管理"处点击"添加令牌"获取 API Key
3. 根据需要选择不同的分组（普通用户使用 default 分组，VIP 分组可访问 Claude、Gemini 等模型）

### OpenAI 格式调用

网关兼容 OpenAI API 格式，这是最常用的调用方式。

**Python 示例**：
```python
import openai

client = openai.OpenAI(
    base_url="http://162.105.151.181/v1",
    api_key="sk-{YOUR_API_KEY}"
)

response = client.chat.completions.create(
    model="deepseek-v3-250324",
    messages=[
        {"role": "system", "content": "你是一个有用的助手。"},
        {"role": "user", "content": "解释什么是机器学习？"}
    ],
    temperature=0.7,
    max_tokens=1000
)

print(response.choices[0].message.content)
```

**环境变量配置**：
```bash
OPENAI_BASE_URL=http://162.105.151.181/v1
OPENAI_API_KEY=sk-{YOUR_API_KEY}
```

**curl 示例**（`"stream": true` 表示流式输出）：
```bash
curl -X POST http://162.105.151.181/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-{YOUR_API_KEY}" \
  -d '{
    "model": "deepseek-v3-250324",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": true
  }'
```

### Anthropic 格式调用

如需使用 Claude 系列模型，需要设置 **VIP 分组**的 API Key。

**Python 示例**：
```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://162.105.151.181",
    api_key="sk-{YOUR_API_KEY}"
)

response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, Claude!"}
    ]
)

print(response.content[0].text)
```

**环境变量配置**：
```bash
ANTHROPIC_BASE_URL=http://162.105.151.181
ANTHROPIC_API_KEY=sk-{YOUR_API_KEY}
```

**curl 示例**：
```bash
curl -X POST http://162.105.151.181/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -H "x-api-key: sk-{YOUR_API_KEY}" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Google Gemini 格式调用

如需使用 Gemini 系列模型，需要设置 **VIP 分组**的 API Key。

**Python 示例**（支持多模态输入，如图片理解）：
```python
import google.generativeai as genai
import PIL.Image

genai.configure(
    api_key="sk-{YOUR_API_KEY}",
    transport="rest",
    client_options={"api_endpoint": "http://162.105.151.181"}
)

model = genai.GenerativeModel("gemini-2.5-flash")

# 文本输入
response = model.generate_content("Who are you?")
print(response.text)

# 多模态输入（图片 + 文本）
response = model.generate_content(
    [{'role': 'user', 'parts': ['阅读下面这张图', PIL.Image.open("test.jpg")]}]
)
print(response.text)
```

**环境变量配置**：
```bash
GEMINI_BASE_URL=http://162.105.151.181
GEMINI_API_KEY=sk-{YOUR_API_KEY}
```

**curl 示例**（`:streamGenerateContent` 表示流式输出）：
```bash
curl -N "http://162.105.151.181/v1beta/models/gemini-2.5-pro:streamGenerateContent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-{YOUR_API_KEY}" \
  -d '{
    "contents": [{"parts":[{"text": "Who are you?"}]}]
  }'
```

### 可用模型

- **default 分组**:通义千问系列、DeepSeek 系列
- **VIP 分组**:Claude 系列、Gemini 系列

您可以在网关的"模型广场"界面查看所有可用模型。部分模型(如 qwen "vl" 系列)支持多模态功能(图片理解)。

### 在 Cherry Studio 中调用 API

Cherry Studio 是一个本地的大语言模型对话客户端,支持添加各种 API 接口,提供了友好的图形化界面。

#### 基本配置

首先,在 162.105.151.181 平台上开通账号、权限,并创建新的 API Key。

然后,从 [Cherry Studio 官网](https://cherry-ai.com/) 下载并安装该软件。

随后,进行基础配置,详见下图:

![Cherry Studio 基础配置](./cherry.png)

配置要点:
- **Base URL**: 填写 `http://162.105.151.181/v1`
- **API Key**: 填写您在网关获取的 API Key (格式为 `sk-{YOUR_API_KEY}`)
- **模型选择**: 根据您的分组权限选择可用模型

#### 对话界面功能

下面是对话界面中常用功能的简介:

![Cherry Studio 对话界面](./cherry_interface.png)

主要功能包括:
- **模型切换**: 在顶部可以快速切换不同的模型
- **对话历史**: 左侧显示历史对话记录
- **参数设置**: 可以调整温度、最大 token 数等参数
- **多轮对话**: 支持连续对话,保持上下文

#### 温度参数设置

温度(Temperature)是控制模型输出随机性的重要参数:
- **温度 = 0**: 输出最确定,适合需要精确答案的场景
- **温度 > 0**: 输出更有创造性,适合创意写作等场景

设置温度为 0 的操作如下:

![设置温度为 0](./cherry_T.png)

## 📝 练习作业

1. 使用 OpenAI 格式调用网关，实现一个简单的对话功能
2. 尝试使用不同的模型（DeepSeek、Claude、Gemini），比较它们的输出特点
3. 实现流式输出功能，观察实时生成的效果

## 🔗 相关资源

- [北大物理学院 LLM 网关文档](../llm-gateway.md)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Google AI Studio](https://makersuite.google.com/)

---

**下一步**：学习 [高级用法探索](./advanced-usage.md)，掌握 Prompt 工程和多轮对话管理技巧。
