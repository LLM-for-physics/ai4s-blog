"""
基础 API 调用示例
演示如何使用不同的 LLM 供应商 API
"""

import os
import asyncio
from dotenv import load_dotenv
from openai import OpenAI
import anthropic

# 加载环境变量
load_dotenv()

class LLMClient:
    """统一的 LLM 客户端接口"""
    
    def __init__(self, provider: str, api_key: str = None, base_url: str = None):
        self.provider = provider
        self.api_key = api_key or os.getenv(f"{provider.upper()}_API_KEY")
        self.base_url = base_url or os.getenv(f"{provider.upper()}_BASE_URL")

        if provider == "openai":
            self.client = OpenAI(api_key=self.api_key, base_url=base_url)
        elif provider == "anthropic":
            self.client = anthropic.Anthropic(api_key=self.api_key)
    
    def chat(self, messages, **kwargs):
        """统一的聊天接口"""
        if self.provider == "openai":
            return self._openai_chat(messages, **kwargs)
        elif self.provider == "anthropic":
            return self._anthropic_chat(messages, **kwargs)
        else:
            raise ValueError(f"不支持的供应商: {self.provider}")
    
    def _openai_chat(self, messages, model="gpt-5", **kwargs):
        """OpenAI API 调用"""
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"OpenAI API 错误: {str(e)}"
    
    def _anthropic_chat(self, messages, model="claude-sonnet-4-20250514", **kwargs):
        """Anthropic API 调用"""
        try:
            # 转换消息格式
            system_message = None
            user_messages = []
            
            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    user_messages.append(msg)
            
            response = self.client.messages.create(
                model=model,
                max_tokens=kwargs.get("max_tokens", 1000),
                system=system_message,
                messages=user_messages
            )
            return response.content[0].text
        except Exception as e:
            return f"Anthropic API 错误: {str(e)}"

def demo_basic_usage():
    """演示基础用法"""
    
    # OpenAI 示例
    print("=== OpenAI 示例 ===")
    openai_client = LLMClient("openai")
    
    messages = [
        {"role": "system", "content": "你是一个有用的助手。"},
        {"role": "user", "content": "解释什么是机器学习？"}
    ]
    
    response = openai_client.chat(messages, temperature=0.7)
    print("OpenAI 回答:", response[:200] + "...")
    
    # Anthropic 示例
    print("\n=== Anthropic 示例 ===")
    anthropic_client = LLMClient("anthropic")
    
    response = anthropic_client.chat(messages, temperature=0.7)
    print("Anthropic 回答:", response[:200] + "...")

def demo_streaming():
    """演示流式响应"""
    print("\n=== 流式响应示例 ===")
    
    # 使用环境变量或设置默认值
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    api_key = os.getenv("OPENAI_API_KEY", "your-api-key-here")
    
    if api_key == "your-api-key-here":
        print("请设置 OPENAI_API_KEY 环境变量")
        return
    
    client = OpenAI(base_url=base_url, api_key=api_key)
    
    messages = [
        {"role": "user", "content": "写一首关于春天的短诗"}
    ]
    
    try:
        stream = client.chat.completions.create(
            model="gpt-5-mini",
            messages=messages,
            stream=True
        )
        
        print("流式输出:")
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                print(chunk.choices[0].delta.content, end="")
        print()
        
    except Exception as e:
        print(f"流式调用失败: {e}")

async def demo_async_calls():
    """演示异步调用"""
    print("\n=== 异步调用示例 ===")
    from openai import AsyncOpenAI

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    api_key = os.getenv("OPENAI_API_KEY", "your-api-key-here")
    
    if api_key == "your-api-key-here":
        print("请设置 OPENAI_API_KEY 环境变量")
        return
    
    client = AsyncOpenAI(api_key=api_key)
    
    messages = [
        {"role": "user", "content": "用一句话解释量子物理"}
    ]
    
    try:
        response = await client.chat.completions.create(
            model="gpt-5-mini",
            messages=messages
        )
        print("异步调用结果:", response.choices[0].message.content)
    except Exception as e:
        print(f"异步调用失败: {e}")

def demo_error_handling():
    """演示错误处理"""
    print("\n=== 错误处理示例 ===")
    
    # 使用无效的 API 密钥
    client = LLMClient("openai", api_key="invalid-key")
    
    messages = [
        {"role": "user", "content": "测试错误处理"}
    ]
    
    response = client.chat(messages)
    print("错误处理结果:", response)

if __name__ == "__main__":
    demo_basic_usage()
    asyncio.run(demo_async_calls())
    demo_error_handling()
