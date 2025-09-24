#!/usr/bin/env python3
"""
运行所有 RAG 测试
验证文档中的所有代码是否正确
"""

import sys
import os
from dotenv import load_dotenv

# 导入所有测试模块
from test_basic_setup import test_basic_setup
from test_collection import test_collection_operations
from test_search import test_search_functionality
from test_rag_agent import test_rag_agent

def main():
    """运行所有测试"""
    print("🚀 开始运行 RAG 文档代码验证测试")
    print("=" * 60)
    
    # 加载环境变量
    load_dotenv()
    
    # 检查环境配置
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    
    print("环境配置检查:")
    if not api_key or api_key == "your-openai-api-key-here":
        print("❌ OPENAI_API_KEY 未正确设置")
        print("请在 .env 文件中设置正确的 API 密钥")
        return False
    else:
        print("✓ OPENAI_API_KEY 已设置")
    
    if base_url:
        print(f"✓ OPENAI_BASE_URL 已设置: {base_url}")
    else:
        print("⚠️  OPENAI_BASE_URL 未设置，将使用默认值")
    
    print()
    
    # 运行测试
    tests = [
        ("基础设置测试", test_basic_setup),
        ("集合操作测试", test_collection_operations),
        ("搜索功能测试", test_search_functionality),
        ("RAG Agent 测试", test_rag_agent)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            result = test_func()
            results.append((test_name, result))
            if result:
                print(f"✅ {test_name} 通过")
            else:
                print(f"❌ {test_name} 失败")
        except Exception as e:
            print(f"❌ {test_name} 出现异常: {str(e)}")
            results.append((test_name, False))
    
    # 汇总结果
    print("\n" + "=" * 60)
    print("📊 测试结果汇总")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\n总计: {passed}/{total} 个测试通过")
    
    if passed == total:
        print("\n🎉 所有测试都通过了！文档中的代码是正确的。")
        print("\n📝 发现的改进点:")
        print("1. ✅ 已将嵌入模型从 text-embedding-3-small 更新为 text-embedding-v4")
        print("2. ✅ 已添加 OPENAI_BASE_URL 支持")
        print("3. ✅ 已添加错误处理和详细日志")
        print("4. ✅ 所有代码片段语法正确")
        return True
    else:
        print(f"\n⚠️  有 {total - passed} 个测试失败，请检查相关问题。")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
