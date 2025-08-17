"""
数学求解 Agent 示例
演示如何构建专门用于数学问题求解的 LLM Agent
"""

import os
import json
import sympy as sp
import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

@dataclass
class Task:
    """任务定义"""
    id: str
    description: str
    priority: int = 1
    status: str = "pending"
    result: Optional[Any] = None

class Tool(ABC):
    """工具抽象基类"""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
    
    @abstractmethod
    def execute(self, **kwargs) -> Dict[str, Any]:
        """执行工具"""
        pass

class SymPyTool(Tool):
    """SymPy 符号计算工具"""
    
    def __init__(self):
        super().__init__("sympy_calculator", "执行符号数学计算")
    
    def execute(self, operation: str, expression: str, **kwargs) -> Dict[str, Any]:
        """执行 SymPy 计算"""
        try:
            # 创建符号变量
            x, y, z, t = sp.symbols('x y z t')
            
            # 安全的命名空间
            safe_dict = {
                'x': x, 'y': y, 'z': z, 't': t,
                'pi': sp.pi, 'e': sp.E,
                'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan,
                'exp': sp.exp, 'log': sp.log, 'sqrt': sp.sqrt,
                'diff': sp.diff, 'integrate': sp.integrate,
                'solve': sp.solve, 'simplify': sp.simplify
            }
            
            # 解析表达式
            expr = eval(expression, {"__builtins__": {}}, safe_dict)
            
            if operation == "solve":
                # 求解方程
                variable = kwargs.get("variable", "x")
                var_symbol = safe_dict.get(variable, x)
                result = sp.solve(expr, var_symbol)
                return {
                    "operation": "solve",
                    "expression": str(expr),
                    "variable": variable,
                    "solutions": [str(sol) for sol in result]
                }
            
            elif operation == "differentiate":
                # 求导
                variable = kwargs.get("variable", "x")
                var_symbol = safe_dict.get(variable, x)
                result = sp.diff(expr, var_symbol)
                return {
                    "operation": "differentiate",
                    "expression": str(expr),
                    "variable": variable,
                    "result": str(result)
                }
            
            elif operation == "integrate":
                # 积分
                variable = kwargs.get("variable", "x")
                var_symbol = safe_dict.get(variable, x)
                result = sp.integrate(expr, var_symbol)
                return {
                    "operation": "integrate",
                    "expression": str(expr),
                    "variable": variable,
                    "result": str(result)
                }
            
            elif operation == "simplify":
                # 化简
                result = sp.simplify(expr)
                return {
                    "operation": "simplify",
                    "expression": str(expr),
                    "result": str(result)
                }
            
            else:
                return {"error": f"不支持的操作: {operation}"}
                
        except Exception as e:
            return {"error": f"SymPy 计算错误: {str(e)}"}

class CalculatorTool(Tool):
    """基础计算器工具"""
    
    def __init__(self):
        super().__init__("calculator", "执行基础数学计算")
    
    def execute(self, expression: str) -> Dict[str, Any]:
        """执行数学表达式"""
        try:
            # 安全的数学表达式求值
            allowed_names = {
                k: v for k, v in __builtins__.items() 
                if k in ['abs', 'round', 'min', 'max', 'sum']
            }
            allowed_names.update({
                'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                'sqrt': np.sqrt, 'log': np.log, 'exp': np.exp,
                'pi': np.pi, 'e': np.e
            })
            
            result = eval(expression, {"__builtins__": {}}, allowed_names)
            return {"result": result, "expression": expression}
            
        except Exception as e:
            return {"error": f"计算错误: {str(e)}"}

class MockLLMClient:
    """模拟的 LLM 客户端（用于演示）"""
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """模拟 LLM 响应"""
        user_message = messages[-1]["content"] if messages else ""
        
        # 简单的规则匹配来模拟 LLM 响应
        if "导数" in user_message or "求导" in user_message:
            return '''
我需要求导数。让我使用 SymPy 工具来计算。

```json
{
    "action": "use_tool",
    "tool_name": "sympy_calculator",
    "parameters": {
        "operation": "differentiate",
        "expression": "x**3 - 3*x**2 + 2*x - 1",
        "variable": "x"
    }
}
```
'''
        elif "积分" in user_message:
            return '''
我需要计算积分。让我使用 SymPy 工具。

```json
{
    "action": "use_tool",
    "tool_name": "sympy_calculator",
    "parameters": {
        "operation": "integrate",
        "expression": "x**3 - 3*x**2 + 2*x - 1",
        "variable": "x"
    }
}
```
'''
        elif "求解" in user_message or "方程" in user_message:
            return '''
我需要求解方程。让我使用 SymPy 工具。

```json
{
    "action": "use_tool",
    "tool_name": "sympy_calculator",
    "parameters": {
        "operation": "solve",
        "expression": "x**2 - 4",
        "variable": "x"
    }
}
```
'''
        else:
            return '''
让我分析这个数学问题并提供解答。

```json
{
    "action": "complete",
    "result": "我已经分析了这个数学问题。根据问题的性质，我建议使用相应的数学工具来求解。"
}
```
'''

class MathAgent:
    """数学求解 Agent"""
    
    def __init__(self, llm_client=None):
        self.name = "MathSolver"
        self.llm_client = llm_client or MockLLMClient()
        self.tools: Dict[str, Tool] = {}
        self.memory: List[Dict[str, Any]] = []
        
        # 添加数学工具
        self.add_tool(SymPyTool())
        self.add_tool(CalculatorTool())
        
        self.system_prompt = """
你是一个专业的数学问题求解助手，具备以下能力：

1. 符号计算：使用 SymPy 进行精确的符号数学计算
2. 数值计算：进行基础的数值计算
3. 问题分析：理解数学问题的本质和求解策略

工作流程：
1. 分析问题类型和要求
2. 选择合适的数学工具
3. 逐步求解并验证结果
4. 提供清晰的解释

请始终保持数学严谨性，提供详细的求解过程。
"""
    
    def add_tool(self, tool: Tool):
        """添加工具"""
        self.tools[tool.name] = tool
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """执行任务"""
        try:
            result = self._execute_task_internal(task)
            task.status = "completed"
            task.result = result
            return result
        except Exception as e:
            task.status = "error"
            task.result = {"error": str(e)}
            raise e
    
    def _execute_task_internal(self, task: Task) -> Dict[str, Any]:
        """内部任务执行逻辑"""
        # 构建包含工具信息的 prompt
        tools_info = self._format_tools_info()
        
        prompt = f"""
任务: {task.description}

可用工具:
{tools_info}

请分析任务并制定执行计划。如果需要使用工具，请按照以下格式：

```json
{{
    "action": "use_tool",
    "tool_name": "工具名称",
    "parameters": {{
        "参数名": "参数值"
    }}
}}
```

如果任务完成，请按照以下格式：

```json
{{
    "action": "complete",
    "result": "任务结果"
}}
```
"""
        
        # 执行决策循环
        return self._decision_loop(prompt)
    
    def _format_tools_info(self) -> str:
        """格式化工具信息"""
        if not self.tools:
            return "无可用工具"
        
        tools_info = []
        for tool in self.tools.values():
            tools_info.append(f"- {tool.name}: {tool.description}")
        
        return "\n".join(tools_info)
    
    def _decision_loop(self, initial_prompt: str, max_iterations: int = 5) -> Dict[str, Any]:
        """决策循环"""
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": initial_prompt}
        ]
        
        for iteration in range(max_iterations):
            # 获取 LLM 响应
            response = self.llm_client.chat(messages)
            
            # 解析响应
            action = self._parse_action(response)
            
            if action["action"] == "complete":
                return action["result"]
            
            elif action["action"] == "use_tool":
                # 执行工具
                tool_result = self._execute_tool(
                    action["tool_name"], 
                    action.get("parameters", {})
                )
                
                # 添加工具执行结果到对话
                messages.append({"role": "assistant", "content": response})
                messages.append({
                    "role": "user", 
                    "content": f"工具执行结果: {json.dumps(tool_result, ensure_ascii=False)}"
                })
                
                # 记录到内存
                self.memory.append({
                    "iteration": iteration,
                    "action": action,
                    "result": tool_result
                })
            
            else:
                # 继续思考
                messages.append({"role": "assistant", "content": response})
        
        return {"result": "达到最大迭代次数，任务未完成"}
    
    def _parse_action(self, response: str) -> Dict[str, Any]:
        """解析 LLM 响应中的动作"""
        try:
            # 寻找 JSON 代码块
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                json_str = response[start:end].strip()
            else:
                # 寻找花括号
                start = response.find("{")
                end = response.rfind("}") + 1
                if start != -1 and end != 0:
                    json_str = response[start:end]
                else:
                    # 如果没有找到 JSON，返回继续思考的动作
                    return {"action": "think", "content": response}
            
            return json.loads(json_str)
            
        except json.JSONDecodeError:
            return {"action": "think", "content": response}
    
    def _execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """执行工具"""
        if tool_name not in self.tools:
            return {"error": f"工具 '{tool_name}' 不存在"}
        
        try:
            return self.tools[tool_name].execute(**parameters)
        except Exception as e:
            return {"error": f"工具执行失败: {str(e)}"}

def demo_basic_math_problems():
    """演示基础数学问题求解"""
    print("=== 基础数学问题求解演示 ===")
    
    agent = MathAgent()
    
    # 测试问题列表
    problems = [
        "求函数 f(x) = x³ - 3x² + 2x - 1 的导数",
        "计算 x² - 4 = 0 的解",
        "求 x³ - 3x² + 2x - 1 的不定积分",
        "化简表达式 (x² + 2x + 1)/(x + 1)"
    ]
    
    for i, problem in enumerate(problems, 1):
        print(f"\n问题 {i}: {problem}")
        
        task = Task(
            id=f"math_problem_{i}",
            description=problem,
            priority=1
        )
        
        try:
            result = agent.execute_task(task)
            print(f"结果: {result}")
            
            # 显示执行过程
            if agent.memory:
                print("执行过程:")
                for step in agent.memory:
                    print(f"  - 工具: {step['action']['tool_name']}")
                    print(f"    结果: {step['result']}")
                agent.memory.clear()  # 清理内存
                
        except Exception as e:
            print(f"执行失败: {e}")

def demo_sympy_tools():
    """演示 SymPy 工具的直接使用"""
    print("\n=== SymPy 工具直接使用演示 ===")
    
    sympy_tool = SymPyTool()
    
    # 测试不同的数学操作
    operations = [
        {
            "operation": "differentiate",
            "expression": "x**3 + 2*x**2 - x + 5",
            "variable": "x"
        },
        {
            "operation": "integrate",
            "expression": "3*x**2 + 4*x - 1",
            "variable": "x"
        },
        {
            "operation": "solve",
            "expression": "x**2 - 5*x + 6",
            "variable": "x"
        },
        {
            "operation": "simplify",
            "expression": "(x**2 - 1)/(x - 1)"
        }
    ]
    
    for op in operations:
        print(f"\n操作: {op['operation']}")
        print(f"表达式: {op['expression']}")
        
        result = sympy_tool.execute(**op)
        
        if "error" in result:
            print(f"错误: {result['error']}")
        else:
            print(f"结果: {result}")

def demo_calculator_tool():
    """演示计算器工具"""
    print("\n=== 计算器工具演示 ===")
    
    calc_tool = CalculatorTool()
    
    expressions = [
        "2 + 3 * 4",
        "sqrt(16) + 2**3",
        "sin(pi/2) + cos(0)",
        "log(e) + exp(1)"
    ]
    
    for expr in expressions:
        print(f"\n表达式: {expr}")
        result = calc_tool.execute(expr)
        
        if "error" in result:
            print(f"错误: {result['error']}")
        else:
            print(f"结果: {result['result']}")

class AdvancedMathAgent(MathAgent):
    """高级数学 Agent，支持更复杂的问题"""
    
    def __init__(self, llm_client=None):
        super().__init__(llm_client)
        self.name = "AdvancedMathSolver"
    
    def solve_calculus_problem(self, function_expr: str, problem_type: str) -> Dict[str, Any]:
        """求解微积分问题"""
        results = {}
        
        if problem_type in ["derivative", "all"]:
            # 求导数
            derivative_result = self.tools["sympy_calculator"].execute(
                operation="differentiate",
                expression=function_expr,
                variable="x"
            )
            results["derivative"] = derivative_result
        
        if problem_type in ["integral", "all"]:
            # 求积分
            integral_result = self.tools["sympy_calculator"].execute(
                operation="integrate",
                expression=function_expr,
                variable="x"
            )
            results["integral"] = integral_result
        
        if problem_type in ["critical_points", "all"]:
            # 求临界点（导数为0的点）
            derivative_result = self.tools["sympy_calculator"].execute(
                operation="differentiate",
                expression=function_expr,
                variable="x"
            )
            
            if "result" in derivative_result:
                critical_points = self.tools["sympy_calculator"].execute(
                    operation="solve",
                    expression=derivative_result["result"],
                    variable="x"
                )
                results["critical_points"] = critical_points
        
        return results
    
    def analyze_function(self, function_expr: str) -> Dict[str, Any]:
        """全面分析函数"""
        print(f"正在分析函数: f(x) = {function_expr}")
        
        analysis = self.solve_calculus_problem(function_expr, "all")
        
        # 添加函数简化
        simplified = self.tools["sympy_calculator"].execute(
            operation="simplify",
            expression=function_expr
        )
        analysis["simplified"] = simplified
        
        return analysis

def demo_advanced_math_agent():
    """演示高级数学 Agent"""
    print("\n=== 高级数学 Agent 演示 ===")
    
    agent = AdvancedMathAgent()
    
    # 分析一个复杂函数
    function = "x**3 - 6*x**2 + 9*x + 1"
    analysis = agent.analyze_function(function)
    
    print(f"\n函数分析结果:")
    for key, value in analysis.items():
        print(f"{key}: {value}")

if __name__ == "__main__":
    # 运行所有演示
    demo_basic_math_problems()
    demo_sympy_tools()
    demo_calculator_tool()
    demo_advanced_math_agent()
    
    print("\n=== 演示完成 ===")
    print("这个示例展示了如何构建专门用于数学问题求解的 LLM Agent。")
    print("你可以根据需要扩展更多的数学工具和功能。")
