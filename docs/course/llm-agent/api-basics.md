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

### 国内供应商

#### 百度文心一言
```python
import requests

def call_wenxin_api(prompt):
    # 获取 access_token
    token_url = "https://aip.baidubce.com/oauth/2.0/token"
    token_params = {
        "grant_type": "client_credentials",
        "client_id": "your_api_key",
        "client_secret": "your_secret_key"
    }
    token_response = requests.post(token_url, params=token_params)
    access_token = token_response.json()["access_token"]
    
    # 调用文心一言 API
    api_url = f"https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token={access_token}"
    data = {
        "messages": [{"role": "user", "content": prompt}]
    }
    
    response = requests.post(api_url, json=data)
    return response.json()["result"]
```

#### 智谱 ChatGLM
```python
import zhipuai

zhipuai.api_key = "your-api-key"

response = zhipuai.model_api.invoke(
    model="chatglm_turbo",
    prompt="解释人工智能的发展历程",
    temperature=0.7,
    top_p=0.7,
)

print(response['data']['choices'][0]['content'])
```

## 💻 完整实践示例

### 统一的 LLM 客户端

```python
import os
import requests
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class LLMClient(ABC):
    """LLM 客户端抽象基类"""
    
    @abstractmethod
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        pass

class OpenAIClient(LLMClient):
    def __init__(self, api_key: str = None, base_url: str = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or "https://api.openai.com/v1"
        
    def chat(self, messages: List[Dict[str, str]], model: str = "gpt-3.5-turbo", **kwargs) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": model,
            "messages": messages,
            **kwargs
        }
        
        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json=data
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            raise Exception(f"API 调用失败: {response.status_code}, {response.text}")

class AnthropicClient(LLMClient):
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        
    def chat(self, messages: List[Dict[str, str]], model: str = "claude-3-sonnet-20240229", **kwargs) -> str:
        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }
        
        data = {
            "model": model,
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", 1000),
            **{k: v for k, v in kwargs.items() if k != "max_tokens"}
        }
        
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=data
        )
        
        if response.status_code == 200:
            return response.json()["content"][0]["text"]
        else:
            raise Exception(f"API 调用失败: {response.status_code}, {response.text}")

# 使用示例
def main():
    # 初始化客户端
    openai_client = OpenAIClient()
    anthropic_client = AnthropicClient()
    
    messages = [
        {"role": "system", "content": "你是一个有用的数学助手。"},
        {"role": "user", "content": "解释什么是微积分？"}
    ]
    
    try:
        # OpenAI 响应
        openai_response = openai_client.chat(messages, temperature=0.7)
        print("OpenAI 回答:")
        print(openai_response)
        print("\n" + "="*50 + "\n")
        
        # Anthropic 响应
        anthropic_response = anthropic_client.chat(messages, temperature=0.7)
        print("Anthropic 回答:")
        print(anthropic_response)
        
    except Exception as e:
        print(f"错误: {e}")

if __name__ == "__main__":
    main()
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

### Token 使用优化

```python
def estimate_tokens(text: str) -> int:
    """粗略估算文本的 token 数量"""
    # 英文大约 4 个字符 = 1 token，中文大约 1.5 个字符 = 1 token
    chinese_chars = len([c for c in text if '\u4e00' <= c <= '\u9fff'])
    other_chars = len(text) - chinese_chars
    
    return int(chinese_chars / 1.5 + other_chars / 4)

def optimize_messages(messages: List[Dict[str, str]], max_tokens: int = 3000) -> List[Dict[str, str]]:
    """优化消息列表，确保不超过 token 限制"""
    total_tokens = sum(estimate_tokens(msg["content"]) for msg in messages)
    
    if total_tokens <= max_tokens:
        return messages
    
    # 保留系统消息和最近的用户消息
    optimized = []
    if messages[0]["role"] == "system":
        optimized.append(messages[0])
        messages = messages[1:]
    
    # 从最新消息开始添加，直到接近 token 限制
    current_tokens = sum(estimate_tokens(msg["content"]) for msg in optimized)
    
    for msg in reversed(messages):
        msg_tokens = estimate_tokens(msg["content"])
        if current_tokens + msg_tokens <= max_tokens:
            optimized.insert(-1 if optimized and optimized[0]["role"] == "system" else 0, msg)
            current_tokens += msg_tokens
        else:
            break
    
    return optimized
```

## 📝 练习作业

1. **基础练习**：使用不同的 LLM 供应商 API 实现相同的对话功能
2. **进阶练习**：实现一个支持多供应商的统一 LLM 客户端
3. **实战练习**：添加错误处理、重试机制和 token 优化功能

## 🔗 相关资源

- [OpenAI API 文档](https://platform.openai.com/docs)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Google AI Studio](https://makersuite.google.com/)
- [百度千帆大模型平台](https://cloud.baidu.com/product/wenxinworkshop)

---

**下一步**：学习 [高级用法探索](./advanced-usage.md)，掌握 Prompt 工程和多轮对话管理技巧。
