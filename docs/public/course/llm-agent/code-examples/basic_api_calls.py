"""
基础 API 调用示例
演示如何使用不同的 LLM 供应商 API
"""

import os
import requests
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
        self.base_url = base_url
        
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
    
    def _openai_chat(self, messages, model="gpt-3.5-turbo", **kwargs):
        """OpenAI API 调用"""
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs
        )
        return response.choices[0].message.content
    
    def _anthropic_chat(self, messages, model="claude-3-sonnet-20240229", **kwargs):
        """Anthropic API 调用"""
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

def demo_basic_usage():
    """演示基础用法"""
    
    # OpenAI 示例
    print("=== OpenAI 示例 ===")
    openai_client = LLMClient("openai")
    
    messages = [
        {"role": "system", "content": "你是一个有用的助手。"},
        {"role": "user", "content": "解释什么是机器学习？"}
    ]
    
    try:
        response = openai_client.chat(messages, temperature=0.7)
        print("OpenAI 回答:", response[:200] + "...")
    except Exception as e:
        print(f"OpenAI 调用失败: {e}")
    
    # Anthropic 示例
    print("\n=== Anthropic 示例 ===")
    anthropic_client = LLMClient("anthropic")
    
    try:
        response = anthropic_client.chat(messages, temperature=0.7)
        print("Anthropic 回答:", response[:200] + "...")
    except Exception as e:
        print(f"Anthropic 调用失败: {e}")

def demo_streaming():
    """演示流式响应"""
    print("\n=== 流式响应示例 ===")
    
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    messages = [
        {"role": "user", "content": "写一首关于春天的短诗"}
    ]
    
    try:
        stream = client.chat.completions.create(
            model="gpt-3.5-turbo",
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

if __name__ == "__main__":
    demo_basic_usage()
    demo_streaming()
