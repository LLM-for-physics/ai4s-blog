# 模块一：LLM API 调用基础

## 📖 概述

本模块将深入介绍大语言模型 API 的调用原理，帮助同学们理解如何与不同的 LLM 供应商进行交互。我们将从最基础的概念开始，逐步掌握实际的编程技能。

## 🔍 LLM API 调用原理

### 什么是 API？

API（Application Programming Interface，应用程序编程接口）是不同软件组件之间通信的桥梁。LLM API 允许我们通过网络请求与大语言模型进行交互。

### HTTP 请求基础

LLM API 基于 HTTP 协议工作，主要使用 POST 方法：

```python
import requests
import json

# 基本的 HTTP POST 请求结构
url = "https://api.openai.com/v1/chat/completions"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
data = {
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello, world!"}]
}

response = requests.post(url, headers=headers, json=data)
print(response.json())
```

### 流式响应 vs 批量响应

LLM API 支持两种响应模式：

**批量响应**：等待完整回答后一次性返回
```python
# 批量响应示例
response = requests.post(url, headers=headers, json=data)
result = response.json()
print(result['choices'][0]['message']['content'])
```

**流式响应**：实时返回生成的内容
```python
# 流式响应示例
data["stream"] = True
response = requests.post(url, headers=headers, json=data, stream=True)

for line in response.iter_lines():
    if line:
        chunk = json.loads(line.decode('utf-8').split('data: ')[1])
        if chunk['choices'][0]['delta'].get('content'):
            print(chunk['choices'][0]['delta']['content'], end='')
```

## 🔑 核心组件详解

### Base URL（基础 URL）

Base URL 是 API 服务的根地址，不同供应商有不同的端点：

```python
# 不同供应商的 Base URL
OPENAI_BASE_URL = "https://api.openai.com/v1"
ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
AZURE_BASE_URL = "https://your-resource.openai.azure.com"

# 自定义部署示例
CUSTOM_BASE_URL = "https://your-custom-deployment.com/v1"
```

**使用场景**：
- 官方 API 服务
- 私有化部署
- 代理服务
- 镜像服务

### API Key（API 密钥）

API Key 是身份认证的凭证，确保只有授权用户才能访问服务。

#### 安全最佳实践

1. **环境变量存储**
```python
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 从环境变量获取 API Key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
```

2. **创建 .env 文件**
```bash
# .env 文件内容
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
ZHIPU_API_KEY=your-zhipu-key-here
```

3. **配置 .gitignore**
```gitignore
# 确保不提交敏感信息
.env
*.key
config/secrets.json
```

## 🏢 主流 LLM 供应商对比

### OpenAI

**特点**：
- 最成熟的 API 生态
- 模型种类丰富（GPT-3.5, GPT-4, GPT-4 Turbo）
- 支持函数调用、图像理解等高级功能

**API 示例**：
```python
from openai import OpenAI

client = OpenAI(api_key="your-api-key")

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "你是一个有用的助手。"},
        {"role": "user", "content": "解释什么是机器学习？"}
    ],
    temperature=0.7,
    max_tokens=1000
)

print(response.choices[0].message.content)
```

**定价模式**：按 token 计费，输入和输出 token 价格不同

### Anthropic (Claude)

**特点**：
- Constitutional AI 技术，更安全可靠
- 长上下文支持（Claude-2 支持 100K tokens）
- 优秀的推理和分析能力

**API 示例**：
```python
import anthropic

client = anthropic.Anthropic(api_key="your-api-key")

message = client.messages.create(
    model="claude-3-sonnet-20240229",
    max_tokens=1000,
    temperature=0.7,
    messages=[
        {"role": "user", "content": "解释量子计算的基本原理"}
    ]
)

print(message.content[0].text)
```

### Google (Gemini)

**特点**：
- 多模态能力强（文本、图像、音频）
- 与 Google 生态系统深度集成
- 免费额度相对较高

**API 示例**：
```python
import google.generativeai as genai

genai.configure(api_key="your-api-key")
model = genai.GenerativeModel('gemini-pro')

response = model.generate_content("解释深度学习的工作原理")
print(response.text)
```

## 🛠️ 错误处理和最佳实践

### 常见错误处理

```python
import time
import random
from typing import Optional

def call_llm_with_retry(client: LLMClient, messages: List[Dict[str, str]], 
                       max_retries: int = 3, backoff_factor: float = 1.0) -> Optional[str]:
    """带重试机制的 LLM 调用"""
    
    for attempt in range(max_retries):
        try:
            return client.chat(messages)
            
        except requests.exceptions.RequestException as e:
            if "rate limit" in str(e).lower():
                # 速率限制，使用指数退避
                wait_time = backoff_factor * (2 ** attempt) + random.uniform(0, 1)
                print(f"遇到速率限制，等待 {wait_time:.2f} 秒后重试...")
                time.sleep(wait_time)
                
            elif attempt == max_retries - 1:
                print(f"达到最大重试次数，调用失败: {e}")
                return None
                
            else:
                print(f"请求失败，第 {attempt + 1} 次重试: {e}")
                time.sleep(1)
                
        except Exception as e:
            print(f"未知错误: {e}")
            return None
    
    return None
```

## 📝 练习作业

1. 使用不同的 LLM 供应商 API 实现相同的对话功能
2. 实现一个支持多供应商的统一 LLM 客户端
3. 添加错误处理、重试机制

## 🔗 相关资源

- [OpenAI API 文档](https://platform.openai.com/docs)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Google AI Studio](https://makersuite.google.com/)

---

**下一步**：学习 [高级用法探索](./advanced-usage.md)，掌握 Prompt 工程和多轮对话管理技巧。
