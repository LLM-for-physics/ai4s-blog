# 模块二：高级用法探索

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

### 上下文窗口优化

```python
class ContextWindowOptimizer:
    """上下文窗口优化器"""
    
    def __init__(self, max_tokens: int = 4000):
        self.max_tokens = max_tokens
    
    def optimize_messages(self, messages: List[Dict[str, str]], 
                         preserve_system: bool = True,
                         preserve_recent: int = 2) -> List[Dict[str, str]]:
        """优化消息列表以适应上下文窗口"""
        
        if not messages:
            return messages
        
        # 分离不同类型的消息
        system_msgs = [msg for msg in messages if msg["role"] == "system"]
        user_msgs = [msg for msg in messages if msg["role"] == "user"]
        assistant_msgs = [msg for msg in messages if msg["role"] == "assistant"]
        
        # 重建对话对
        conversation_pairs = []
        for i in range(min(len(user_msgs), len(assistant_msgs))):
            conversation_pairs.append((user_msgs[i], assistant_msgs[i]))
        
        # 保留最近的对话
        recent_pairs = conversation_pairs[-preserve_recent:] if preserve_recent > 0 else []
        
        # 构建优化后的消息列表
        optimized = []
        
        if preserve_system and system_msgs:
            optimized.extend(system_msgs)
        
        # 添加最近的对话对
        for user_msg, assistant_msg in recent_pairs:
            optimized.extend([user_msg, assistant_msg])
        
        # 检查是否超出限制
        current_tokens = self._estimate_tokens(optimized)
        
        if current_tokens <= self.max_tokens:
            return optimized
        
        # 如果仍然超出限制，进一步压缩
        return self._compress_messages(optimized)
    
    def _estimate_tokens(self, messages: List[Dict[str, str]]) -> int:
        """估算 token 数量"""
        total_text = " ".join([msg["content"] for msg in messages])
        chinese_chars = len([c for c in total_text if '\u4e00' <= c <= '\u9fff'])
        other_chars = len(total_text) - chinese_chars
        return int(chinese_chars / 1.5 + other_chars / 4)
    
    def _compress_messages(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """压缩消息内容"""
        compressed = []
        
        for msg in messages:
            if msg["role"] == "system":
                # 系统消息保持不变
                compressed.append(msg)
            else:
                # 压缩其他消息
                content = msg["content"]
                if len(content) > 200:
                    content = content[:200] + "..."
                
                compressed.append({
                    "role": msg["role"],
                    "content": content
                })
        
        return compressed
```

## 📊 结构化输出

### JSON 格式输出

```python
import json
from typing import Any, Dict, Type
from pydantic import BaseModel, ValidationError

class StructuredOutputManager:
    """结构化输出管理器"""
    
    def __init__(self, llm_client):
        self.llm_client = llm_client
    
    def generate_json(self, prompt: str, schema: Dict[str, Any], 
                     max_retries: int = 3) -> Dict[str, Any]:
        """生成符合指定 schema 的 JSON 输出"""
        
        # 构建包含 schema 的 prompt
        schema_prompt = f"""
{prompt}

请以 JSON 格式回答，严格遵循以下 schema：
{json.dumps(schema, indent=2, ensure_ascii=False)}

只返回 JSON，不要包含其他文本。
"""
        
        for attempt in range(max_retries):
            try:
                response = self.llm_client.chat([
                    {"role": "user", "content": schema_prompt}
                ])
                
                # 提取 JSON
                json_str = self._extract_json(response)
                result = json.loads(json_str)
                
                # 验证 schema
                if self._validate_schema(result, schema):
                    return result
                else:
                    print(f"Schema 验证失败，第 {attempt + 1} 次重试")
                    
            except (json.JSONDecodeError, Exception) as e:
                print(f"JSON 解析失败: {e}，第 {attempt + 1} 次重试")
        
        raise Exception("无法生成有效的结构化输出")
    
    def _extract_json(self, text: str) -> str:
        """从文本中提取 JSON"""
        # 寻找 JSON 代码块
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            return text[start:end].strip()
        
        # 寻找花括号
        start = text.find("{")
        end = text.rfind("}") + 1
        
        if start != -1 and end != 0:
            return text[start:end]
        
        return text.strip()
    
    def _validate_schema(self, data: Dict, schema: Dict) -> bool:
        """简单的 schema 验证"""
        try:
            for key, expected_type in schema.items():
                if key not in data:
                    return False
                
                if expected_type == "string" and not isinstance(data[key], str):
                    return False
                elif expected_type == "number" and not isinstance(data[key], (int, float)):
                    return False
                elif expected_type == "array" and not isinstance(data[key], list):
                    return False
                elif expected_type == "object" and not isinstance(data[key], dict):
                    return False
            
            return True
        except:
            return False

# 使用示例
def structured_output_example():
    # 定义输出 schema
    analysis_schema = {
        "sentiment": "string",
        "confidence": "number",
        "keywords": "array",
        "summary": "string"
    }
    
    # 创建结构化输出管理器
    output_manager = StructuredOutputManager(llm_client)
    
    # 生成结构化输出
    prompt = "分析以下文本的情感和关键信息：'这个产品质量很好，价格也合理，强烈推荐！'"
    
    result = output_manager.generate_json(prompt, analysis_schema)
    print("结构化输出:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
```

### Pydantic 模型验证

```python
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from enum import Enum

class SentimentType(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"

class TextAnalysis(BaseModel):
    """文本分析结果模型"""
    text: str = Field(..., description="原始文本")
    sentiment: SentimentType = Field(..., description="情感倾向")
    confidence: float = Field(..., ge=0.0, le=1.0, description="置信度")
    keywords: List[str] = Field(..., description="关键词列表")
    summary: str = Field(..., max_length=200, description="摘要")
    language: Optional[str] = Field(None, description="语言")
    
    @validator('keywords')
    def keywords_not_empty(cls, v):
        if not v:
            raise ValueError('关键词列表不能为空')
        return v
    
    @validator('summary')
    def summary_not_empty(cls, v):
        if not v.strip():
            raise ValueError('摘要不能为空')
        return v

class PydanticOutputManager:
    """基于 Pydantic 的结构化输出管理器"""
    
    def __init__(self, llm_client):
        self.llm_client = llm_client
    
    def generate_structured_output(self, prompt: str, model_class: Type[BaseModel], 
                                 max_retries: int = 3) -> BaseModel:
        """生成并验证结构化输出"""
        
        # 获取模型 schema
        schema = model_class.schema()
        
        # 构建 prompt
        structured_prompt = f"""
{prompt}

请以 JSON 格式回答，严格遵循以下数据模型：

模型名称: {model_class.__name__}
字段说明:
"""
        
        for field_name, field_info in schema["properties"].items():
            field_type = field_info.get("type", "unknown")
            description = field_info.get("description", "")
            structured_prompt += f"- {field_name} ({field_type}): {description}\n"
        
        structured_prompt += "\n只返回 JSON 格式的数据，不要包含其他文本。"
        
        for attempt in range(max_retries):
            try:
                response = self.llm_client.chat([
                    {"role": "user", "content": structured_prompt}
                ])
                
                # 提取并解析 JSON
                json_str = self._extract_json(response)
                data = json.loads(json_str)
                
                # 使用 Pydantic 验证
                return model_class(**data)
                
            except ValidationError as e:
                print(f"数据验证失败: {e}，第 {attempt + 1} 次重试")
            except json.JSONDecodeError as e:
                print(f"JSON 解析失败: {e}，第 {attempt + 1} 次重试")
            except Exception as e:
                print(f"未知错误: {e}，第 {attempt + 1} 次重试")
        
        raise Exception("无法生成有效的结构化输出")
    
    def _extract_json(self, text: str) -> str:
        """从文本中提取 JSON"""
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            return text[start:end].strip()
        
        start = text.find("{")
        end = text.rfind("}") + 1
        
        if start != -1 and end != 0:
            return text[start:end]
        
        return text.strip()

# 使用示例
def pydantic_example():
    output_manager = PydanticOutputManager(llm_client)
    
    prompt = """
    分析以下文本：
    "今天的天气非常好，阳光明媚，适合外出游玩。这种天气让人心情愉悦，充满活力。"
    
    请提供详细的文本分析结果。
    """
    
    try:
        result = output_manager.generate_structured_output(prompt, TextAnalysis)
        print("分析结果:")
        print(f"情感: {result.sentiment}")
        print(f"置信度: {result.confidence}")
        print(f"关键词: {result.keywords}")
        print(f"摘要: {result.summary}")
        
    except Exception as e:
        print(f"生成失败: {e}")
```

## 🔧 进阶开发技巧

### 异步处理

```python
import asyncio
import aiohttp
from typing import List, Dict

class AsyncLLMClient:
    """异步 LLM 客户端"""
    
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url
    
    async def chat_async(self, messages: List[Dict[str, str]], 
                        model: str = "gpt-3.5-turbo", **kwargs) -> str:
        """异步聊天"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": model,
            "messages": messages,
            **kwargs
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=data
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return result["choices"][0]["message"]["content"]
                else:
                    raise Exception(f"API 调用失败: {response.status}")
    
    async def batch_chat(self, message_lists: List[List[Dict[str, str]]], 
                        **kwargs) -> List[str]:
        """批量异步处理"""
        tasks = [
            self.chat_async(messages, **kwargs) 
            for messages in message_lists
        ]
        
        return await asyncio.gather(*tasks)

# 使用示例
async def async_example():
    client = AsyncLLMClient("your-api-key", "https://api.openai.com/v1")
    
    # 批量处理多个问题
    questions = [
        [{"role": "user", "content": "什么是机器学习？"}],
        [{"role": "user", "content": "什么是深度学习？"}],
        [{"role": "user", "content": "什么是神经网络？"}]
    ]
    
    results = await client.batch_chat(questions)
    
    for i, result in enumerate(results):
        print(f"问题 {i+1} 的回答: {result[:100]}...")

# 运行异步示例
# asyncio.run(async_example())
```

### 缓存机制

```python
import hashlib
import pickle
import os
from functools import wraps
from typing import Any, Callable

class LLMCache:
    """LLM 响应缓存"""
    
    def __init__(self, cache_dir: str = "./llm_cache"):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
    
    def _get_cache_key(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """生成缓存键"""
        content = str(messages) + str(sorted(kwargs.items()))
        return hashlib.md5(content.encode()).hexdigest()
    
    def get(self, messages: List[Dict[str, str]], **kwargs) -> Any:
        """获取缓存"""
        cache_key = self._get_cache_key(messages, **kwargs)
        cache_file = os.path.join(self.cache_dir, f"{cache_key}.pkl")
        
        if os.path.exists(cache_file):
            with open(cache_file, 'rb') as f:
                return pickle.load(f)
        
        return None
    
    def set(self, messages: List[Dict[str, str]], result: Any, **kwargs):
        """设置缓存"""
        cache_key = self._get_cache_key(messages, **kwargs)
        cache_file = os.path.join(self.cache_dir, f"{cache_key}.pkl")
        
        with open(cache_file, 'wb') as f:
            pickle.dump(result, f)

def cached_llm_call(cache: LLMCache):
    """LLM 调用缓存装饰器"""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(messages: List[Dict[str, str]], **kwargs):
            # 尝试从缓存获取
            cached_result = cache.get(messages, **kwargs)
            if cached_result is not None:
                print("使用缓存结果")
                return cached_result
            
            # 调用实际函数
            result = func(messages, **kwargs)
            
            # 保存到缓存
            cache.set(messages, result, **kwargs)
            
            return result
        return wrapper
    return decorator

# 使用示例
cache = LLMCache()

@cached_llm_call(cache)
def cached_chat(messages: List[Dict[str, str]], **kwargs) -> str:
    # 这里调用实际的 LLM API
    return llm_client.chat(messages, **kwargs)
```

## 📝 实践练习

### 练习 1：智能问答系统

```python
class IntelligentQASystem:
    """智能问答系统"""
    
    def __init__(self, llm_client):
        self.llm_client = llm_client
        self.conversation = ConversationManager()
        self.output_manager = StructuredOutputManager(llm_client)
        
        # 设置系统角色
        self.conversation.add_message(
            "system", 
            "你是一个智能问答助手，能够理解用户问题并提供准确、有用的回答。"
        )
    
    def ask(self, question: str) -> Dict[str, Any]:
        """提问并获取结构化回答"""
        self.conversation.add_message("user", question)
        
        # 定义回答结构
        answer_schema = {
            "answer": "string",
            "confidence": "number",
            "sources": "array",
            "follow_up_questions": "array"
        }
        
        # 构建 prompt
        prompt = f"""
        基于对话历史回答用户问题：{question}
        
        对话历史：
        {self._format_history()}
        
        请提供结构化的回答。
        """
        
        result = self.output_manager.generate_json(prompt, answer_schema)
        
        # 添加助手回答到历史
        self.conversation.add_message("assistant", result["answer"])
        
        return result
    
    def _format_history(self) -> str:
        """格式化对话历史"""
        messages = self.conversation.get_messages()
        formatted = []
        
        for msg in messages[-6:]:  # 只显示最近6条消息
            if msg["role"] != "system":
                formatted.append(f"{msg['role']}: {msg['content']}")
        
        return "\n".join(formatted)

# 使用示例
qa_system = IntelligentQASystem(llm_client)

# 连续提问
questions = [
    "什么是人工智能？",
    "它有哪些应用领域？",
    "未来发展趋势如何？"
]

for question in questions:
    result = qa_system.ask(question)
    print(f"问题: {question}")
    print(f"回答: {result['answer']}")
    print(f"置信度: {result['confidence']}")
    print(f"后续问题: {result['follow_up_questions']}")
    print("-" * 50)
```

## 📚 总结

本模块介绍了 LLM 的高级用法，包括：

1. **Prompt 工程**：从基础模板到复杂的 Few-shot 学习
2. **对话管理**：历史维护、上下文优化、持久化存储
3. **结构化输出**：JSON 格式控制、Pydantic 验证
4. **进阶技巧**：异步处理、缓存机制、错误处理

这些技能将为构建复杂的 LLM 应用奠定坚实基础。

---

**下一步**：学习 [Agent 构建实战](./agent-building.md)，将这些技能整合到完整的智能代理中。
