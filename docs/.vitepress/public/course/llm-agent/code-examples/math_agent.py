"""
数学代理示例 - 通过 Function Calling 求解方程组
演示如何使用 LLM 的工具调用能力来解决数学问题
"""

import os
import json
import sympy as sp
from typing import List, Dict, Any, Union
from dotenv import load_dotenv
from openai import OpenAI
import re

# 加载环境变量
load_dotenv()

class MathSolver:
    """数学求解器 - 提供具体的数学工具"""
    
    @staticmethod
    def solve_linear_system(equations: List[str], variables: List[str]) -> Dict[str, Any]:
        """
        求解线性方程组
        
        Args:
            equations: 方程列表，如 ["x + y = 5", "2*x - y = 1"]
            variables: 变量列表，如 ["x", "y"]
        
        Returns:
            求解结果字典
        """
        try:
            # 将变量字符串转换为 sympy 符号
            var_symbols = [sp.Symbol(var) for var in variables]
            
            # 解析方程
            parsed_equations = []
            for eq in equations:
                # 分割等号两边
                left, right = eq.split('=')
                # 创建方程对象
                equation = sp.Eq(sp.sympify(left.strip()), sp.sympify(right.strip()))
                parsed_equations.append(equation)
            
            # 求解方程组
            solution = sp.solve(parsed_equations, var_symbols)
            
            # 格式化结果
            if isinstance(solution, dict):
                result = {str(var): float(solution[var]) if solution[var].is_number else str(solution[var]) 
                         for var in solution}
            elif isinstance(solution, list) and len(solution) > 0:
                # 多个解的情况
                result = []
                for sol in solution:
                    if isinstance(sol, dict):
                        sol_dict = {str(var): float(sol[var]) if sol[var].is_number else str(sol[var]) 
                                   for var in sol}
                        result.append(sol_dict)
                    else:
                        result.append(str(sol))
            else:
                result = {"message": "无解或解的形式复杂", "raw_solution": str(solution)}
            
            return {
                "success": True,
                "solution": result,
                "equations": equations,
                "variables": variables
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "equations": equations,
                "variables": variables
            }
    
    @staticmethod
    def solve_nonlinear_system(equations: List[str], variables: List[str]) -> Dict[str, Any]:
        """
        求解非线性方程组
        
        Args:
            equations: 方程列表
            variables: 变量列表
        
        Returns:
            求解结果字典
        """
        try:
            var_symbols = [sp.Symbol(var) for var in variables]
            
            parsed_equations = []
            for eq in equations:
                left, right = eq.split('=')
                equation = sp.Eq(sp.sympify(left.strip()), sp.sympify(right.strip()))
                parsed_equations.append(equation)
            
            solution = sp.solve(parsed_equations, var_symbols)
            
            if isinstance(solution, list):
                result = []
                for sol in solution:
                    if isinstance(sol, tuple):
                        sol_dict = {str(variables[i]): float(sol[i]) if sol[i].is_number else str(sol[i]) 
                                   for i in range(len(variables))}
                        result.append(sol_dict)
                    elif isinstance(sol, dict):
                        sol_dict = {str(var): float(sol[var]) if sol[var].is_number else str(sol[var]) 
                                   for var in sol}
                        result.append(sol_dict)
                    else:
                        result.append(str(sol))
            else:
                result = {"message": "解的形式复杂", "raw_solution": str(solution)}
            
            return {
                "success": True,
                "solution": result,
                "equations": equations,
                "variables": variables
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "equations": equations,
                "variables": variables
            }


class MathAgent:
    """数学代理 - 通过 LLM Function Calling 处理自然语言数学问题"""
    
    def __init__(self, api_key: str = None, base_url: str = None):
        """初始化数学代理"""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self.solver = MathSolver()
        
        # 定义可用的工具
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "solve_linear_system",
                    "description": "求解线性方程组。适用于形如 ax + by = c 的方程组。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "equations": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "方程列表，每个方程是一个 sympy 格式的字符串"
                            },
                            "variables": {
                                "type": "array", 
                                "items": {"type": "string"},
                                "description": "变量列表，如 ['x', 'y']"
                            }
                        },
                        "required": ["equations", "variables"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "solve_nonlinear_system",
                    "description": "求解非线性方程组。适用于包含平方、立方等非线性项的方程组。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "equations": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "方程列表，每个方程是一个 sympy 格式的字符串"
                            },
                            "variables": {
                                "type": "array",
                                "items": {"type": "string"}, 
                                "description": "变量列表"
                            }
                        },
                        "required": ["equations", "variables"]
                    }
                }
            }
        ]
    
    def solve_math_problem(self, problem: str) -> Dict[str, Any]:
        """
        解决数学问题
        
        Args:
            problem: 自然语言描述的数学问题
            
        Returns:
            包含解答的字典
        """
        try:
            # 构建系统提示
            system_prompt = """你是一个专业的数学助手。用户会用自然语言描述数学问题，你需要：

1. 理解问题中的数学关系
2. 识别变量和方程
3. 选择合适的工具来求解
4. 调用相应的函数来获得答案

请注意：
- 对于线性方程组，使用 solve_linear_system 函数
- 对于非线性方程组，使用 solve_nonlinear_system 函数
- 方程格式要标准化，如 "x + y = 5" 而不是 "x加y等于5"
- 确保正确识别所有变量
"""
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": problem}
            ]
            
            # 第一次调用 - 让 LLM 决定使用什么工具
            response = self.client.chat.completions.create(
                model="gpt-5-mini",
                messages=messages,
                tools=self.tools,
                tool_choice="auto"
            )
            
            response_message = response.choices[0].message
            
            # 检查是否有工具调用
            if response_message.tool_calls:
                # 执行工具调用
                # 将assistant的消息添加到对话历史中
                messages.append({
                    "role": "assistant",
                    "content": response_message.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": tc.type,
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in response_message.tool_calls
                    ]
                })
                
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    print(f"🔧 调用工具: {function_name}")
                    print(f"📋 参数: {function_args}")
                    
                    # 执行相应的求解函数
                    if function_name == "solve_linear_system":
                        result = self.solver.solve_linear_system(
                            function_args["equations"],
                            function_args["variables"]
                        )
                    elif function_name == "solve_nonlinear_system":
                        result = self.solver.solve_nonlinear_system(
                            function_args["equations"],
                            function_args["variables"]
                        )
                    else:
                        result = {"success": False, "error": f"未知的函数: {function_name}"}
                    
                    # 将结果添加到对话中
                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": json.dumps(result, ensure_ascii=False)
                    })
                
                # 第二次调用 - 让 LLM 解释结果
                final_response = self.client.chat.completions.create(
                    model="gpt-5-mini",
                    messages=messages
                )
                
                return {
                    "success": True,
                    "problem": problem,
                    "tool_calls": [{
                        "function": tc.function.name,
                        "arguments": json.loads(tc.function.arguments)
                    } for tc in response_message.tool_calls],
                    "raw_results": [json.loads(msg["content"]) for msg in messages if msg["role"] == "tool"],
                    "explanation": final_response.choices[0].message.content
                }
            else:
                # 没有工具调用，直接返回 LLM 的回答
                return {
                    "success": True,
                    "problem": problem,
                    "explanation": response_message.content,
                    "note": "LLM 没有使用工具，可能问题描述不够清晰或不是方程组求解问题"
                }
                
        except Exception as e:
            return {
                "success": False,
                "problem": problem,
                "error": str(e)
            }


def demo():
    """演示函数"""
    print("🧮 数学代理演示")
    print("=" * 50)
    
    agent = MathAgent()
    
    # 测试用例
    test_problems = [
        "求解方程组：x + y = 5，2x - y = 1",
        "小明买了3个苹果和2个橙子，总共花了13元。小红买了1个苹果和4个橙子，总共花了11元。请问苹果和橙子各多少钱一个？",
        "求解二次方程组：x^2 + y^2 = 25，x + y = 7",
        "有两个数，它们的和是10，它们的差是4，求这两个数。"
    ]
    
    for i, problem in enumerate(test_problems, 1):
        print(f"\n📝 测试问题 {i}:")
        print(f"问题: {problem}")
        print("-" * 30)
        
        result = agent.solve_math_problem(problem)
        
        if result["success"]:
            print("✅ 求解成功!")
            
            if "tool_calls" in result:
                print(f"🔧 使用的工具: {[tc['function'] for tc in result['tool_calls']]}")
                
                if "raw_results" in result:
                    for j, raw_result in enumerate(result["raw_results"]):
                        if raw_result.get("success", False):
                            print(f"📊 工具 {j+1} 结果: {raw_result['solution']}")
                        else:
                            print(f"❌ 工具 {j+1} 错误: {raw_result['error']}")
            
            print(f"💡 解释:\n{result['explanation']}")
            
        else:
            print(f"❌ 求解失败: {result['error']}")
        
        print("=" * 50)


if __name__ == "__main__":
    demo()
