#!/usr/bin/env python3
"""
测试搜索功能
验证文档中的查询和检索代码是否正确
"""

import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

def search_knowledge_base(collection, query: str, n_results: int = 3):
    """在知识库中搜索相关文档（来自原文档的函数）"""
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        include=["documents", "metadatas", "distances"]
    )
    
    print(f"查询: {query}")
    print("-" * 50)
    
    for i, (doc, metadata, distance) in enumerate(zip(
        results["documents"][0],
        results["metadatas"][0], 
        results["distances"][0]
    )):
        print(f"结果 {i+1} (相似度: {1-distance:.3f}):")
        print(f"主题: {metadata['topic']}, 难度: {metadata['level']}")
        print(f"内容: {doc}")
        print()
    
    return results

def test_search_functionality():
    """测试搜索功能"""
    print("=" * 50)
    print("测试 3: 搜索功能")
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
        
        # 获取现有集合
        try:
            collection = client.get_collection(
                name="knowledge_base",
                embedding_function=openai_ef
            )
            print(f"✓ 获取集合成功，文档数量: {collection.count()}")
        except Exception as e:
            print(f"❌ 无法获取集合，请先运行 test_collection.py: {str(e)}")
            return False
        
        if collection.count() == 0:
            print("❌ 集合为空，请先运行 test_collection.py 添加文档")
            return False
        
        # 测试搜索功能
        test_queries = [
            "什么是神经网络？",
            "机器学习和人工智能的关系",
            "计算机视觉的应用",
            "自然语言处理技术"
        ]
        
        all_tests_passed = True
        
        for i, query in enumerate(test_queries, 1):
            print(f"\n--- 测试查询 {i} ---")
            try:
                search_results = search_knowledge_base(collection, query)
                
                # 验证搜索结果
                if (search_results["documents"] and 
                    len(search_results["documents"][0]) > 0):
                    print(f"✓ 查询 '{query}' 返回了 {len(search_results['documents'][0])} 个结果")
                    
                    # 检查相似度分数
                    distances = search_results["distances"][0]
                    similarities = [1 - d for d in distances]
                    print(f"✓ 相似度分数范围: {min(similarities):.3f} - {max(similarities):.3f}")
                    
                else:
                    print(f"❌ 查询 '{query}' 没有返回结果")
                    all_tests_passed = False
                    
            except Exception as e:
                print(f"❌ 查询 '{query}' 失败: {str(e)}")
                all_tests_passed = False
        
        return all_tests_passed
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_search_functionality()
    if success:
        print("\n🎉 搜索功能测试通过！")
    else:
        print("\n❌ 搜索功能测试失败！")
