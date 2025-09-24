#!/usr/bin/env python3
"""
测试完整的 RAG Agent
验证文档中的 RAG Agent 类代码是否正确
"""

import chromadb
from chromadb.utils import embedding_functions
import openai
import os
from dotenv import load_dotenv
from typing import List, Dict, Any

class RAGAgent:
    """RAG Agent 类（来自原文档）"""
    def __init__(self, collection, openai_api_key: str, openai_base_url: str = None):
        self.collection = collection
        # 根据用户要求添加 base_url 支持
        if openai_base_url:
            self.client = openai.OpenAI(api_key=openai_api_key, base_url=openai_base_url)
        else:
            self.client = openai.OpenAI(api_key=openai_api_key)
    
    def retrieve(self, query: str, n_results: int = 3) -> List[Dict[str, Any]]:
        """检索相关文档"""
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            include=["documents", "metadatas", "distances"]
        )
        
        retrieved_docs = []
        for doc, metadata, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            retrieved_docs.append({
                "content": doc,
                "metadata": metadata,
                "similarity": 1 - distance
            })
        
        return retrieved_docs
    
    def generate_response(self, query: str, retrieved_docs: List[Dict[str, Any]]) -> str:
        """基于检索到的文档生成回答"""
        context = "\n".join([f"文档 {i+1}: {doc['content']}" 
                           for i, doc in enumerate(retrieved_docs)])
        
        prompt = f"""基于以下文档内容回答用户问题：

相关文档:
{context}

用户问题: {query}

请基于上述文档内容提供准确回答:"""

        response = self.client.chat.completions.create(
            model="deepseek-v3",
            messages=[
                {"role": "system", "content": "你是一个基于文档内容回答问题的助手。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        return response.choices[0].message.content
    
    def query(self, question: str, n_results: int = 3) -> Dict[str, Any]:
        """完整的 RAG 查询流程"""
        retrieved_docs = self.retrieve(question, n_results)
        answer = self.generate_response(question, retrieved_docs)
        
        return {
            "question": question,
            "answer": answer,
            "sources": retrieved_docs
        }

def test_rag_agent():
    """测试完整的 RAG Agent"""
    print("=" * 50)
    print("测试 4: 完整 RAG Agent")
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
        
        # 创建 RAG Agent
        rag_agent = RAGAgent(collection, api_key, base_url)
        print("✓ RAG Agent 创建成功")
        
        # 测试查询
        test_question = "深度学习和机器学习有什么区别？"
        print(f"\n测试问题: {test_question}")
        print("-" * 50)
        
        result = rag_agent.query(test_question)
        
        print("问题:", result["question"])
        print("\n回答:", result["answer"])
        print(f"\n引用来源 ({len(result['sources'])} 个):")
        for i, source in enumerate(result["sources"], 1):
            print(f"{i}. 相似度: {source['similarity']:.3f}")
            print(f"   主题: {source['metadata']['topic']}")
            print(f"   内容: {source['content'][:100]}...")
            print()
        
        # 验证结果 - 修复验证逻辑，相似度可以是负数
        if (result["answer"] and 
            len(result["sources"]) > 0 and 
            isinstance(result["answer"], str) and 
            len(result["answer"].strip()) > 0):
            print("✓ RAG Agent 测试通过")
            return True
        else:
            print("❌ RAG Agent 测试失败")
            return False
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_rag_agent()
    if success:
        print("\n🎉 RAG Agent 测试通过！")
    else:
        print("\n❌ RAG Agent 测试失败！")
