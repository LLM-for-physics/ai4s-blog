# 高级用法探索

## 📖 概述

在掌握了基础的 API 调用后，本模块将深入探索 LLM 的高级用法。我们将学习如何设计有效的 Prompt 模板、管理复杂的多轮对话、实现结构化输出，以及掌握各种进阶开发技巧。

## 🎨 Prompt 工程与模板设计

### Prompt 设计原则

有效的 Prompt 设计是 LLM 应用成功的关键。以下是一些核心原则：

1. **明确性**：清晰地表达你的需求
2. **具体性**：提供具体的例子和上下文
3. **结构化**：使用一致的格式和结构
4. **迭代优化**：不断测试和改进

### 基础 Prompt 模板

```python
class PromptTemplate:
    """基础 Prompt 模板类"""
    
    def __init__(self, template: str):
        self.template = template
    
    def format(self, **kwargs) -> str:
        return self.template.format(**kwargs)

# 示例：数学问题求解模板
math_template = PromptTemplate("""
你是一个专业的数学助手。请按照以下步骤解决数学问题：

1. 理解问题：分析题目要求
2. 制定策略：选择合适的解题方法
3. 逐步求解：展示详细的计算过程
4. 验证答案：检查结果的合理性

问题：{problem}

请开始解答：
""")

# 使用示例
problem = "求函数 f(x) = x² + 2x - 3 的最小值"
prompt = math_template.format(problem=problem)
print(prompt)
```

### 高级 Prompt 模板（使用 Jinja2）

```python
from jinja2 import Template

class AdvancedPromptTemplate:
    """使用 Jinja2 的高级 Prompt 模板"""
    
    def __init__(self, template_str: str):
        self.template = Template(template_str)
    
    def render(self, **kwargs) -> str:
        return self.template.render(**kwargs)

# 复杂的对话模板
conversation_template = AdvancedPromptTemplate("""
你是一个{{role}}，具有以下特点：
{% for trait in traits %}
- {{trait}}
{% endfor %}

对话历史：
{% for message in history %}
{{message.role}}: {{message.content}}
{% endfor %}

当前任务：{{task}}

{% if constraints %}
约束条件：
{% for constraint in constraints %}
- {{constraint}}
{% endfor %}
{% endif %}

请回应用户的最新消息。
""")

# 使用示例
context = {
    "role": "物理学教授",
    "traits": ["严谨", "耐心", "善于用类比解释复杂概念"],
    "history": [
        {"role": "用户", "content": "什么是量子纠缠？"},
        {"role": "助手", "content": "量子纠缠是量子力学中的一个现象..."}
    ],
    "task": "解释量子隧道效应",
    "constraints": ["使用通俗易懂的语言", "提供实际应用例子"]
}

prompt = conversation_template.render(**context)
```

### Few-Shot Learning 模板

```python
class FewShotTemplate:
    """Few-shot 学习模板"""
    
    def __init__(self, task_description: str, examples: list, input_format: str):
        self.task_description = task_description
        self.examples = examples
        self.input_format = input_format
    
    def create_prompt(self, input_data: str) -> str:
        prompt = f"{self.task_description}\n\n"
        
        # 添加示例
        for i, example in enumerate(self.examples, 1):
            prompt += f"示例 {i}:\n"
            prompt += f"输入: {example['input']}\n"
            prompt += f"输出: {example['output']}\n\n"
        
        # 添加当前输入
        prompt += f"现在请处理以下输入:\n"
        prompt += f"输入: {input_data}\n"
        prompt += f"输出: "
        
        return prompt

# 情感分析示例
sentiment_template = FewShotTemplate(
    task_description="请分析以下文本的情感倾向，输出 '积极'、'消极' 或 '中性'。",
    examples=[
        {"input": "今天天气真好，心情很愉快！", "output": "积极"},
        {"input": "这部电影太无聊了，浪费时间。", "output": "消极"},
        {"input": "今天是星期三。", "output": "中性"}
    ],
    input_format="文本"
)

# 使用
text = "这个产品质量不错，值得推荐。"
prompt = sentiment_template.create_prompt(text)
```

## 💬 多轮对话管理

### 对话历史管理

```python
from typing import List, Dict, Optional
from datetime import datetime
import json

class ConversationManager:
    """对话管理器"""
    
    def __init__(self, max_history: int = 10, max_tokens: int = 3000):
        self.messages: List[Dict[str, str]] = []
        self.max_history = max_history
        self.max_tokens = max_tokens
        self.metadata = {
            "created_at": datetime.now().isoformat(),
            "total_exchanges": 0
        }
    
    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """添加消息到对话历史"""
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        
        if metadata:
            message["metadata"] = metadata
        
        self.messages.append(message)
        
        if role == "user":
            self.metadata["total_exchanges"] += 1
        
        # 自动清理历史
        self._cleanup_history()
    
    def _cleanup_history(self):
        """清理过长的对话历史"""
        # 保留系统消息
        system_messages = [msg for msg in self.messages if msg["role"] == "system"]
        other_messages = [msg for msg in self.messages if msg["role"] != "system"]
        
        # 限制历史长度
        if len(other_messages) > self.max_history:
            other_messages = other_messages[-self.max_history:]
        
        # 限制 token 数量
        while self._estimate_tokens(system_messages + other_messages) > self.max_tokens and other_messages:
            other_messages.pop(0)
        
        self.messages = system_messages + other_messages
    
    def _estimate_tokens(self, messages: List[Dict]) -> int:
        """估算消息的 token 数量"""
        total_text = " ".join([msg["content"] for msg in messages])
        chinese_chars = len([c for c in total_text if '\u4e00' <= c <= '\u9fff'])
        other_chars = len(total_text) - chinese_chars
        return int(chinese_chars / 1.5 + other_chars / 4)
    
    def get_messages(self) -> List[Dict[str, str]]:
        """获取用于 API 调用的消息格式"""
        return [{"role": msg["role"], "content": msg["content"]} for msg in self.messages]
    
    def save_to_file(self, filename: str):
        """保存对话到文件"""
        data = {
            "messages": self.messages,
            "metadata": self.metadata
        }
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def load_from_file(self, filename: str):
        """从文件加载对话"""
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.messages = data["messages"]
        self.metadata = data["metadata"]

# 使用示例
def chat_with_memory():
    conversation = ConversationManager()
    
    # 设置系统消息
    conversation.add_message("system", "你是一个有用的数学助手，擅长解释复杂的数学概念。")
    
    # 模拟对话
    conversation.add_message("user", "什么是导数？")
    conversation.add_message("assistant", "导数是函数在某一点的瞬时变化率...")
    
    conversation.add_message("user", "能给我一个具体的例子吗？")
    conversation.add_message("assistant", "当然！比如函数 f(x) = x²...")
    
    # 获取用于 API 的消息
    api_messages = conversation.get_messages()
    print("API 消息格式:")
    for msg in api_messages:
        print(f"{msg['role']}: {msg['content'][:50]}...")
```
