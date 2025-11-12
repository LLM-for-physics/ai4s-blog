"""
Prompt 模板示例
演示如何设计和使用各种 Prompt 模板
"""

from jinja2 import Template
from typing import List, Dict, Any

class PromptTemplate:
    """基础 Prompt 模板类"""
    
    def __init__(self, template: str):
        self.template = template
    
    def format(self, **kwargs) -> str:
        return self.template.format(**kwargs)

class AdvancedPromptTemplate:
    """使用 Jinja2 的高级 Prompt 模板"""
    
    def __init__(self, template_str: str):
        self.template = Template(template_str)
    
    def render(self, **kwargs) -> str:
        return self.template.render(**kwargs)

# 数学问题求解模板
MATH_SOLVER_TEMPLATE = PromptTemplate("""
你是一个专业的数学助手。请按照以下步骤解决数学问题：

1. 理解问题：分析题目要求
2. 制定策略：选择合适的解题方法
3. 逐步求解：展示详细的计算过程
4. 验证答案：检查结果的合理性

问题：{problem}

请开始解答：
""")

# Few-shot 学习模板
FEW_SHOT_TEMPLATE = AdvancedPromptTemplate("""
{{ task_description }}

{% for example in examples %}
示例 {{ loop.index }}:
输入: {{ example.input }}
输出: {{ example.output }}

{% endfor %}
现在请处理以下输入:
输入: {{ input_text }}
输出: 
""")

# 角色扮演模板
ROLE_PLAY_TEMPLATE = AdvancedPromptTemplate("""
你是一个{{ role }}，具有以下特点：
{% for trait in traits %}
- {{ trait }}
{% endfor %}

{% if background %}
背景信息：{{ background }}
{% endif %}

{% if constraints %}
约束条件：
{% for constraint in constraints %}
- {{ constraint }}
{% endfor %}
{% endif %}

用户问题：{{ user_question }}

请以{{ role }}的身份回答：
""")

# 代码生成模板
CODE_GENERATION_TEMPLATE = PromptTemplate("""
请生成{language}代码来解决以下问题：

问题描述：{problem_description}

要求：
{requirements}

请提供：
1. 完整的代码实现
2. 代码注释说明
3. 使用示例
4. 可能的改进建议

代码：
""")

# 结构化输出模板
STRUCTURED_OUTPUT_TEMPLATE = PromptTemplate("""
请分析以下内容并以JSON格式返回结果：

内容：{content}

请按照以下格式返回：
{schema}

只返回JSON，不要包含其他文本：
""")

def demo_basic_template():
    """演示基础模板使用"""
    print("=== 基础模板示例 ===")
    
    problem = "求函数 f(x) = x² + 2x - 3 的最小值"
    prompt = MATH_SOLVER_TEMPLATE.format(problem=problem)
    
    print("生成的 Prompt:")
    print(prompt)

def demo_few_shot_template():
    """演示 Few-shot 学习模板"""
    print("\n=== Few-shot 学习模板示例 ===")
    
    context = {
        "task_description": "请分析以下文本的情感倾向，输出 '积极'、'消极' 或 '中性'。",
        "examples": [
            {"input": "今天天气真好，心情很愉快！", "output": "积极"},
            {"input": "这部电影太无聊了，浪费时间。", "output": "消极"},
            {"input": "今天是星期三。", "output": "中性"}
        ],
        "input_text": "这个产品质量不错，值得推荐。"
    }
    
    prompt = FEW_SHOT_TEMPLATE.render(**context)
    print("生成的 Prompt:")
    print(prompt)

def demo_role_play_template():
    """演示角色扮演模板"""
    print("\n=== 角色扮演模板示例 ===")
    
    context = {
        "role": "物理学教授",
        "traits": ["严谨", "耐心", "善于用类比解释复杂概念"],
        "background": "在顶尖大学任教20年，专攻量子物理学",
        "constraints": ["使用通俗易懂的语言", "提供实际应用例子"],
        "user_question": "什么是量子纠缠？"
    }
    
    prompt = ROLE_PLAY_TEMPLATE.render(**context)
    print("生成的 Prompt:")
    print(prompt)

def demo_code_generation_template():
    """演示代码生成模板"""
    print("\n=== 代码生成模板示例 ===")
    
    context = {
        "language": "Python",
        "problem_description": "实现一个简单的计算器",
        "requirements": """
- 支持基本的四则运算（+、-、*、/）
- 支持括号运算
- 处理除零错误
- 提供友好的用户界面
        """.strip()
    }
    
    prompt = CODE_GENERATION_TEMPLATE.format(**context)
    print("生成的 Prompt:")
    print(prompt)

def demo_structured_output_template():
    """演示结构化输出模板"""
    print("\n=== 结构化输出模板示例 ===")
    
    schema = """{
    "sentiment": "string (积极/消极/中性)",
    "confidence": "number (0-1)",
    "keywords": "array of strings",
    "summary": "string"
}"""
    
    context = {
        "content": "今天的天气非常好，阳光明媚，适合外出游玩。这种天气让人心情愉悦，充满活力。",
        "schema": schema
    }
    
    prompt = STRUCTURED_OUTPUT_TEMPLATE.format(**context)
    print("生成的 Prompt:")
    print(prompt)

class DynamicPromptBuilder:
    """动态 Prompt 构建器"""
    
    def __init__(self):
        self.components = []
    
    def add_system_role(self, role: str, traits: List[str] = None):
        """添加系统角色"""
        role_text = f"你是一个{role}"
        if traits:
            role_text += f"，具有以下特点：\n" + "\n".join(f"- {trait}" for trait in traits)
        self.components.append(role_text)
        return self
    
    def add_task_description(self, task: str):
        """添加任务描述"""
        self.components.append(f"任务：{task}")
        return self
    
    def add_examples(self, examples: List[Dict[str, str]]):
        """添加示例"""
        examples_text = "示例：\n"
        for i, example in enumerate(examples, 1):
            examples_text += f"{i}. 输入：{example['input']}\n   输出：{example['output']}\n"
        self.components.append(examples_text)
        return self
    
    def add_constraints(self, constraints: List[str]):
        """添加约束条件"""
        constraints_text = "约束条件：\n" + "\n".join(f"- {constraint}" for constraint in constraints)
        self.components.append(constraints_text)
        return self
    
    def add_user_input(self, user_input: str):
        """添加用户输入"""
        self.components.append(f"用户输入：{user_input}")
        return self
    
    def build(self) -> str:
        """构建最终的 Prompt"""
        return "\n\n".join(self.components)

def demo_dynamic_builder():
    """演示动态 Prompt 构建器"""
    print("\n=== 动态 Prompt 构建器示例 ===")
    
    builder = DynamicPromptBuilder()
    prompt = (builder
              .add_system_role("数据分析师", ["专业", "细致", "善于发现数据中的模式"])
              .add_task_description("分析给定的数据集并提供洞察")
              .add_examples([
                  {"input": "销售数据：[100, 120, 110, 130]", "output": "数据显示上升趋势，平均增长率为10%"},
                  {"input": "温度数据：[20, 22, 19, 21]", "output": "温度相对稳定，波动范围在19-22度之间"}
              ])
              .add_constraints(["使用专业术语", "提供具体的数值分析", "给出可行的建议"])
              .add_user_input("用户评分数据：[4.2, 4.5, 4.1, 4.8, 4.3]")
              .build())
    
    print("动态构建的 Prompt:")
    print(prompt)

if __name__ == "__main__":
    demo_basic_template()
    demo_few_shot_template()
    demo_role_play_template()
    demo_code_generation_template()
    demo_structured_output_template()
    demo_dynamic_builder()
