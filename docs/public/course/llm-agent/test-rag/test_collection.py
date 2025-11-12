#!/usr/bin/env python3
"""
测试集合创建和文档添加
验证文档中的集合操作代码是否正确
"""

import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

def test_collection_operations():
    """测试集合创建和文档添加"""
    print("=" * 50)
    print("测试 2: 集合创建和文档添加")
    print("=" * 50)
    
    try:
        # 加载环境变量
        load_dotenv()
        
        # 创建持久化客户端
        client = chromadb.PersistentClient(path="./chroma_db")
        print("✓ Chroma 客户端初始化成功")
        
        # 使用 OpenAI 嵌入函数
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        
        if not api_key or api_key == "your-openai-api-key-here":
            print("❌ OPENAI_API_KEY 未正确设置，跳过测试")
            return False
        
        openai_ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=api_key,
            api_base=base_url,
            model_name="text-embedding-v4"
        )
        print("✓ OpenAI 嵌入函数创建成功")
        
        # 创建集合（如果存在则删除重建）
        try:
            client.delete_collection(name="knowledge_base")
            print("✓ 删除已存在的集合")
        except:
            pass
        
        collection = client.create_collection(
            name="knowledge_base",
            embedding_function=openai_ef,
            metadata={
                "description": "我的知识库",
                "created": "2024-01-01"
            }
        )
        print(f"✓ 集合创建成功，当前文档数量: {collection.count()}")
        
        # 示例文档（来自原文档）
        documents = [
            "人工智能是计算机科学的一个分支，致力于创建能够执行通常需要人类智能的任务的系统。",
            "机器学习是人工智能的一个子集，它使计算机能够在没有明确编程的情况下学习和改进。",
            "深度学习是机器学习的一个分支，使用多层神经网络来模拟人脑的工作方式。",
            "自然语言处理（NLP）是人工智能的一个领域，专注于计算机与人类语言之间的交互。",
            "计算机视觉是人工智能的一个分支，致力于让计算机能够理解和解释视觉信息。"
        ]
        
        # 生成唯一 ID 和元数据
        ids = [f"doc_{i}" for i in range(len(documents))]
        metadatas = [
            {"topic": "AI", "level": "basic"},
            {"topic": "ML", "level": "basic"},
            {"topic": "DL", "level": "intermediate"},
            {"topic": "NLP", "level": "intermediate"},
            {"topic": "CV", "level": "intermediate"}
        ]
        
        # 添加文档到集合
        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        print(f"✓ 成功添加 {len(documents)} 个文档")
        print(f"✓ 集合中现有文档数量: {collection.count()}")
        
        # 验证文档是否正确添加
        if collection.count() == len(documents):
            print("✓ 文档数量验证通过")
            return True
        else:
            print(f"❌ 文档数量不匹配，期望: {len(documents)}, 实际: {collection.count()}")
            return False
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_collection_operations()
    if success:
        print("\n🎉 集合操作测试通过！")
    else:
        print("\n❌ 集合操作测试失败！")
