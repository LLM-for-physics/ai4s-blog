# LLM Agent 开发指南

## 📖 课程概述

本课程将带领同学们深入了解大语言模型（LLM）的 API 调用机制，并学习如何构建智能的 LLM Agent 来解决实际问题。我们将从基础的 API 调用开始，逐步探索高级用法，最终构建能够与外部工具协同工作的智能代理。

## 🎯 学习目标

通过本课程的学习，同学们将掌握：

- **LLM API 调用基础**：理解 API 调用原理，掌握不同供应商的接口使用
- **高级交互技巧**：学会设计 prompt 模板，管理多轮对话，实现结构化输出
- **Agent 构建能力**：构建简单但功能完整的智能代理
- **实际问题求解**：让 LLM 与数学工具、编程环境协同工作解决复杂问题

## 📚 课程模块

### [模块一：API 调用基础](./api-basics.md)
- LLM API 调用原理深入解析
- Base URL 和 API Key 核心概念
- 主流供应商对比（OpenAI、Anthropic、国内厂商）
- 实践代码示例和最佳实践

### [模块二：高级用法探索](./advanced-usage.md)
- Prompt 工程与模板设计
- 多轮对话管理策略
- 结构化输出与数据验证
- 进阶开发技巧

### [模块三：Agent 构建实战](./agent-building.md)
- Agent 架构设计模式
- 工具集成与决策循环
- 状态管理和错误处理
- 完整 Agent 开发流程

### [模块四：数学问题求解](./math-solver.md)
- 外部数学库集成（SymPy、NumPy）
- 安全的代码执行环境
- 数学问题自动求解流程
- 物理问题建模实例

## 💻 代码示例

所有课程相关的代码示例都存放在 [`./code-examples`](./code-examples/index) 目录中，包括：

- 基础 API 调用示例
- Prompt 模板库
- 对话管理器
- 数学求解 Agent
- 完整项目模板

## 🚀 快速开始

1. **环境准备**：确保已安装 Python 3.8+ 和必要的依赖包
2. **API 密钥**：获取至少一个 LLM 供应商的 API 密钥
3. **从基础开始**：建议按模块顺序学习，从 API 基础开始
4. **动手实践**：每个模块都包含可运行的代码示例

## 📋 学习路径建议

### 初学者路径
1. 先学习 [API 调用基础](./api-basics.md)，理解基本概念
2. 通过 [高级用法](./advanced-usage.md) 掌握实用技巧
3. 尝试构建简单的 [Agent](./agent-building.md)
4. 挑战 [数学问题求解](./math-solver.md) 实战项目

### 进阶路径
- 有编程基础的同学可以直接从模块二开始
- 重点关注 Agent 架构设计和工具集成
- 深入研究数学问题求解的算法实现

## 🛠️ 技术栈

本课程将使用以下主要技术：

- **核心库**：`openai`, `anthropic`, `requests`, `asyncio`
- **数据处理**：`pydantic`, `json`, `yaml`
- **数学计算**：`sympy`, `numpy`, `scipy`
- **可视化**：`matplotlib`, `plotly`
- **开发工具**：`python-dotenv`, `logging`

## 📞 获取帮助

- 课程相关问题请参考各模块的详细文档
- 代码问题可以查看 [./code-examples](./code-examples/index) 中的完整示例
- 如有疑问，请通过课程邮箱联系教学团队

---

*开始您的 LLM Agent 开发之旅吧！建议从 [API 调用基础](./api-basics.md) 开始学习。*
