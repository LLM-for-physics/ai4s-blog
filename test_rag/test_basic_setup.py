#!/usr/bin/env python3
"""
测试基础 Chroma 设置
验证文档中的基础代码是否正确
"""

import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

def test_basic_setup():
    """测试基础 Chroma 客户端初始化"""
    print("=" * 50)
    print("测试 1: 基础 Chroma 设置")
    print("=" * 50)
    
    try:
        # 加载环境变量
        load_dotenv()
        print("✓ 环境变量加载成功")
        
        # 创建持久化客户端
        client = chromadb.PersistentClient(path="./chroma_db")
        print("✓ Chroma 客户端初始化成功")
        
        # 检查 API 密钥是否存在
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        
        if not api_key or api_key == "your-openai-api-key-here":
            print("⚠️  警告: OPENAI_API_KEY 未正确设置")
            return False
        else:
            print("✓ OPENAI_API_KEY 已设置")
        
        if base_url:
            print(f"✓ OPENAI_BASE_URL 已设置: {base_url}")
        else:
            print("⚠️  警告: OPENAI_BASE_URL 未设置")
        
        # 使用 OpenAI 嵌入函数（根据用户要求使用 text-embedding-v4）
        openai_ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=api_key,
            api_base=base_url,  # 添加 base_url 支持
            model_name="text-embedding-v4"  # 使用用户指定的模型
        )
        print("✓ OpenAI 嵌入函数创建成功（使用 text-embedding-v4 模型）")
        
        return True
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_basic_setup()
    if success:
        print("\n🎉 基础设置测试通过！")
    else:
        print("\n❌ 基础设置测试失败！")
