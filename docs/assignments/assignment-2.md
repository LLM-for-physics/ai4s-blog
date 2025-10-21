# 作业2：LLM Agent 项目实践

**发布时间**: 第3周  
**截止时间**: 10月19日 23:59  
**权重**: 10%

## 📋 作业概述

本次作业要求同学们选择以下任一主题进行 LLM Agent 的实际开发，主题自由选择，可以根据自己的兴趣和专业背景来决定。每个主题都有其独特的技术挑战和学习价值。

## 🎯 作业选题

请从以下5个主题中选择一个进行实现：

### 1. 物理学语料清洗工作流
构建一个工作流来执行数据清洗和段落预处理任务，语料数据来源可以是任何教材或者互联网，目标是清除语料中的格式错误、typo、简单的计算错误等。

### 2. RAG 问答系统
以 RAG（Retrieval-Augmented Generation）为核心，构建一个完整的提问+检索+答题的工作流

### 3. 联网搜索功能实现
实现一个带联网搜索选项的问答 agent。
可以用 MCP server 或者 OpenAI SDK 内置的 tool calling 功能，连接互联网搜索服务，

### 4. 科学计算 Agent
实现一个简易的科学计算 agent，通过调用外部科学计算工具（比如 python 的 sympy、scipy 库或其他符号计算、数值计算工具），来增强 agent 的推理能力。
可以用 MCP server 或者 OpenAI SDK 内置的 tool calling 功能实现。

### 5. 物理问题 Benchmark 构建
构造一个包含5-10道题目的小型物理问题基准测试集，需要有清晰的问题描述和格式规范的标准答案，并实现评测不同类型 LLM 在数据集上的表现，实现自动化打分。

## 📚 参考资源

### 相关文档
- [LLM Agent 课程资料](../course/llm-agent/overview)
- [API 基础教程](../course/llm-agent/api-basics)
- [RAG（检索增强生成）](../course/llm-agent/rag)
- [MCP Server 实现指南](../course/llm-agent/mcp-server)
- [Tool Calling 高级用法](../course/llm-agent/tool-calling)

### 技术工具
- OpenAI API
- LangChain / LlamaIndex
- Vector Databases (Pinecone, Chroma, etc.)
- MCP Protocol Implementation

## ❓ 常见问题

**Q: 可以使用什么编程语言？**
A: 推荐使用 Python，但也可以使用 JavaScript/TypeScript、Java 等你熟悉的语言。

**Q: 是否可以使用现有的框架？**
A: 可以使用 LangChain、LlamaIndex 等开源框架，也可以不使用框架而是基于 openai sdk、anthropic sdk 来编程。

**Q: API 调用的费用如何处理？**
A: 课程会提供一定的 API 调用额度，如有特殊需求请联系助教。

**Q: 可以小组合作吗？**
A: 本次作业为个人作业，但鼓励同学之间的技术交流和讨论。

## 📞 技术支持

如有技术问题，可以通过以下方式获得帮助：
- 课程讨论群
- 助教答疑时间
- [常见问题文档](../resources/faq)