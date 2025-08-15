# 模块四：数学问题求解

## 📖 概述

本模块将展示如何构建专门用于数学问题求解的 LLM Agent。我们将学习如何集成外部数学库（如 SymPy、NumPy）、创建安全的代码执行环境，以及构建能够自动分析、求解和验证数学问题的智能系统。

## 🧮 数学工具集成

### SymPy 符号计算工具

```python
import sympy as sp
from sympy import symbols, solve, diff, integrate, limit, series, simplify
from sympy.plotting import plot
import numpy as np
import matplotlib.pyplot as plt
from typing import Dict, Any, List, Optional

class SymPyTool(Tool):
    """SymPy 符号计算工具"""
    
    def __init__(self):
        super().__init__("sympy_calculator", "执行符号数学计算")
    
    def execute(self, operation: str, expression: str, **kwargs) -> Dict[str, Any]:
        """执行 SymPy 计算"""
        try:
            # 创建符号变量
            x, y, z, t = symbols('x y z t')
            n = symbols('n', integer=True)
            
            # 安全的命名空间
            safe_dict = {
                'x': x, 'y': y, 'z': z, 't': t, 'n': n,
                'pi': sp.pi, 'e': sp.E, 'I': sp.I,
                'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan,
                'exp': sp.exp, 'log': sp.log, 'sqrt': sp.sqrt,
                'diff': diff, 'integrate': integrate, 'limit': limit,
                'solve': solve, 'simplify': simplify, 'series': series,
                'symbols': symbols, 'Eq': sp.Eq
            }
            
            # 解析表达式
            expr = eval(expression, {"__builtins__": {}}, safe_dict)
            
            if operation == "solve":
                # 求解方程
                variable = kwargs.get("variable", "x")
                var_symbol = safe_dict.get(variable, x)
                result = solve(expr, var_symbol)
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
                order = kwargs.get("order", 1)
                result = diff(expr, var_symbol, order)
                return {
                    "operation": "differentiate",
                    "expression": str(expr),
                    "variable": variable,
                    "order": order,
                    "result": str(result)
                }
            
            elif operation == "integrate":
                # 积分
                variable = kwargs.get("variable", "x")
                var_symbol = safe_dict.get(variable, x)
                
                # 检查是否为定积分
                lower = kwargs.get("lower_limit")
                upper = kwargs.get("upper_limit")
                
                if lower is not None and upper is not None:
                    result = integrate(expr, (var_symbol, lower, upper))
                else:
                    result = integrate(expr, var_symbol)
                
                return {
                    "operation": "integrate",
                    "expression": str(expr),
                    "variable": variable,
                    "limits": [lower, upper] if lower is not None else None,
                    "result": str(result)
                }
            
            elif operation == "limit":
                # 求极限
                variable = kwargs.get("variable", "x")
                point = kwargs.get("point", 0)
                direction = kwargs.get("direction", "+-")  # +, -, +-
                
                var_symbol = safe_dict.get(variable, x)
                
                if direction == "+":
                    result = limit(expr, var_symbol, point, '+')
                elif direction == "-":
                    result = limit(expr, var_symbol, point, '-')
                else:
                    result = limit(expr, var_symbol, point)
                
                return {
                    "operation": "limit",
                    "expression": str(expr),
                    "variable": variable,
                    "point": point,
                    "direction": direction,
                    "result": str(result)
                }
            
            elif operation == "simplify":
                # 化简
                result = simplify(expr)
                return {
                    "operation": "simplify",
                    "expression": str(expr),
                    "result": str(result)
                }
            
            elif operation == "series":
                # 泰勒级数展开
                variable = kwargs.get("variable", "x")
                point = kwargs.get("point", 0)
                order = kwargs.get("order", 6)
                
                var_symbol = safe_dict.get(variable, x)
                result = series(expr, var_symbol, point, order)
                
                return {
                    "operation": "series",
                    "expression": str(expr),
                    "variable": variable,
                    "point": point,
                    "order": order,
                    "result": str(result)
                }
            
            else:
                return {"error": f"不支持的操作: {operation}"}
                
        except Exception as e:
            return {"error": f"SymPy 计算错误: {str(e)}"}
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["solve", "differentiate", "integrate", "limit", "simplify", "series"],
                    "description": "数学操作类型"
                },
                "expression": {
                    "type": "string",
                    "description": "数学表达式"
                },
                "variable": {
                    "type": "string",
                    "description": "变量名（默认为 x）",
                    "default": "x"
                },
                "order": {
                    "type": "integer",
                    "description": "阶数（用于求导和级数展开）",
                    "default": 1
                },
                "lower_limit": {
                    "type": "number",
                    "description": "积分下限"
                },
                "upper_limit": {
                    "type": "number",
                    "description": "积分上限"
                },
                "point": {
                    "type": "number",
                    "description": "极限点或展开点",
                    "default": 0
                },
                "direction": {
                    "type": "string",
                    "enum": ["+", "-", "+-"],
                    "description": "极限方向",
                    "default": "+-"
                }
            },
            "required": ["operation", "expression"]
        }

### NumPy 数值计算工具

```python
import numpy as np
from scipy import optimize, stats, linalg
import matplotlib.pyplot as plt
import io
import base64

class NumPyTool(Tool):
    """NumPy 数值计算工具"""
    
    def __init__(self):
        super().__init__("numpy_calculator", "执行数值计算和数据分析")
    
    def execute(self, operation: str, data: Any = None, **kwargs) -> Dict[str, Any]:
        """执行 NumPy 计算"""
        try:
            if operation == "solve_linear_system":
                # 求解线性方程组 Ax = b
                A = np.array(kwargs["matrix_A"])
                b = np.array(kwargs["vector_b"])
                
                solution = np.linalg.solve(A, b)
                
                return {
                    "operation": "solve_linear_system",
                    "matrix_A": A.tolist(),
                    "vector_b": b.tolist(),
                    "solution": solution.tolist(),
                    "determinant": float(np.linalg.det(A))
                }
            
            elif operation == "eigenvalues":
                # 计算特征值和特征向量
                matrix = np.array(kwargs["matrix"])
                eigenvals, eigenvecs = np.linalg.eig(matrix)
                
                return {
                    "operation": "eigenvalues",
                    "matrix": matrix.tolist(),
                    "eigenvalues": eigenvals.tolist(),
                    "eigenvectors": eigenvecs.tolist()
                }
            
            elif operation == "polynomial_fit":
                # 多项式拟合
                x_data = np.array(kwargs["x_data"])
                y_data = np.array(kwargs["y_data"])
                degree = kwargs.get("degree", 2)
                
                coefficients = np.polyfit(x_data, y_data, degree)
                poly = np.poly1d(coefficients)
                
                # 计算拟合优度
                y_pred = poly(x_data)
                r_squared = 1 - (np.sum((y_data - y_pred) ** 2) / 
                                np.sum((y_data - np.mean(y_data)) ** 2))
                
                return {
                    "operation": "polynomial_fit",
                    "degree": degree,
                    "coefficients": coefficients.tolist(),
                    "polynomial": str(poly),
                    "r_squared": float(r_squared)
                }
            
            elif operation == "statistics":
                # 统计分析
                data_array = np.array(kwargs["data"])
                
                return {
                    "operation": "statistics",
                    "data_size": len(data_array),
                    "mean": float(np.mean(data_array)),
                    "median": float(np.median(data_array)),
                    "std": float(np.std(data_array)),
                    "variance": float(np.var(data_array)),
                    "min": float(np.min(data_array)),
                    "max": float(np.max(data_array)),
                    "quartiles": np.percentile(data_array, [25, 50, 75]).tolist()
                }
            
            elif operation == "numerical_integration":
                # 数值积分
                from scipy import integrate
                
                # 定义函数
                func_str = kwargs["function"]
                x_min = kwargs["x_min"]
                x_max = kwargs["x_max"]
                
                # 安全的函数定义
                safe_dict = {
                    'np': np, 'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                    'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt,
                    'pi': np.pi, 'e': np.e
                }
                
                # 创建函数
                func = lambda x: eval(func_str, {"__builtins__": {}}, {**safe_dict, 'x': x})
                
                result, error = integrate.quad(func, x_min, x_max)
                
                return {
                    "operation": "numerical_integration",
                    "function": func_str,
                    "limits": [x_min, x_max],
                    "result": float(result),
                    "error_estimate": float(error)
                }
            
            elif operation == "optimization":
                # 函数优化
                func_str = kwargs["function"]
                initial_guess = kwargs.get("initial_guess", [0])
                method = kwargs.get("method", "BFGS")
                
                # 定义目标函数
                safe_dict = {
                    'np': np, 'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                    'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt,
                    'pi': np.pi, 'e': np.e
                }
                
                def objective(x):
                    if len(x) == 1:
                        return eval(func_str, {"__builtins__": {}}, {**safe_dict, 'x': x[0]})
                    else:
                        var_dict = {f'x{i}': x[i] for i in range(len(x))}
                        return eval(func_str, {"__builtins__": {}}, {**safe_dict, **var_dict})
                
                result = optimize.minimize(objective, initial_guess, method=method)
                
                return {
                    "operation": "optimization",
                    "function": func_str,
                    "method": method,
                    "initial_guess": initial_guess,
                    "optimal_point": result.x.tolist(),
                    "optimal_value": float(result.fun),
                    "success": bool(result.success),
                    "iterations": int(result.nit) if hasattr(result, 'nit') else None
                }
            
            else:
                return {"error": f"不支持的操作: {operation}"}
                
        except Exception as e:
            return {"error": f"NumPy 计算错误: {str(e)}"}
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["solve_linear_system", "eigenvalues", "polynomial_fit", 
                            "statistics", "numerical_integration", "optimization"],
                    "description": "数值计算操作类型"
                },
                "matrix_A": {
                    "type": "array",
                    "description": "系数矩阵 A"
                },
                "vector_b": {
                    "type": "array",
                    "description": "常数向量 b"
                },
                "matrix": {
                    "type": "array",
                    "description": "输入矩阵"
                },
                "x_data": {
                    "type": "array",
                    "description": "x 坐标数据"
                },
                "y_data": {
                    "type": "array",
                    "description": "y 坐标数据"
                },
                "degree": {
                    "type": "integer",
                    "description": "多项式次数",
                    "default": 2
                },
                "data": {
                    "type": "array",
                    "description": "统计数据"
                },
                "function": {
                    "type": "string",
                    "description": "数学函数表达式"
                },
                "x_min": {
                    "type": "number",
                    "description": "积分下限"
                },
                "x_max": {
                    "type": "number",
                    "description": "积分上限"
                },
                "initial_guess": {
                    "type": "array",
                    "description": "优化初始猜测值"
                },
                "method": {
                    "type": "string",
                    "description": "优化方法",
                    "default": "BFGS"
                }
            },
            "required": ["operation"]
        }

### 可视化工具

```python
class PlottingTool(Tool):
    """数学函数绘图工具"""
    
    def __init__(self):
        super().__init__("plotting", "绘制数学函数图像")
    
    def execute(self, plot_type: str, **kwargs) -> Dict[str, Any]:
        """执行绘图操作"""
        try:
            plt.figure(figsize=(10, 6))
            
            if plot_type == "function":
                # 绘制函数图像
                func_str = kwargs["function"]
                x_min = kwargs.get("x_min", -10)
                x_max = kwargs.get("x_max", 10)
                points = kwargs.get("points", 1000)
                
                x = np.linspace(x_min, x_max, points)
                
                # 安全的函数计算
                safe_dict = {
                    'np': np, 'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                    'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt,
                    'pi': np.pi, 'e': np.e, 'x': x
                }
                
                y = eval(func_str, {"__builtins__": {}}, safe_dict)
                
                plt.plot(x, y, 'b-', linewidth=2, label=f'y = {func_str}')
                plt.xlabel('x')
                plt.ylabel('y')
                plt.title(f'函数图像: y = {func_str}')
                plt.grid(True, alpha=0.3)
                plt.legend()
                
            elif plot_type == "scatter":
                # 散点图
                x_data = np.array(kwargs["x_data"])
                y_data = np.array(kwargs["y_data"])
                
                plt.scatter(x_data, y_data, alpha=0.6)
                plt.xlabel('x')
                plt.ylabel('y')
                plt.title('散点图')
                plt.grid(True, alpha=0.3)
                
                # 如果提供了拟合函数，也绘制出来
                if "fit_function" in kwargs:
                    fit_func = kwargs["fit_function"]
                    x_fit = np.linspace(min(x_data), max(x_data), 100)
                    safe_dict = {
                        'np': np, 'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                        'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt,
                        'pi': np.pi, 'e': np.e, 'x': x_fit
                    }
                    y_fit = eval(fit_func, {"__builtins__": {}}, safe_dict)
                    plt.plot(x_fit, y_fit, 'r-', linewidth=2, label=f'拟合: {fit_func}')
                    plt.legend()
            
            elif plot_type == "histogram":
                # 直方图
                data = np.array(kwargs["data"])
                bins = kwargs.get("bins", 30)
                
                plt.hist(data, bins=bins, alpha=0.7, edgecolor='black')
                plt.xlabel('值')
                plt.ylabel('频数')
                plt.title('直方图')
                plt.grid(True, alpha=0.3)
            
            elif plot_type == "multiple_functions":
                # 多函数对比
                functions = kwargs["functions"]
                x_min = kwargs.get("x_min", -10)
                x_max = kwargs.get("x_max", 10)
                points = kwargs.get("points", 1000)
                
                x = np.linspace(x_min, x_max, points)
                colors = ['b', 'r', 'g', 'm', 'c', 'y', 'k']
                
                for i, func_str in enumerate(functions):
                    safe_dict = {
                        'np': np, 'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                        'exp': np.exp, 'log': np.log, 'sqrt': np.sqrt,
                        'pi': np.pi, 'e': np.e, 'x': x
                    }
                    
                    try:
                        y = eval(func_str, {"__builtins__": {}}, safe_dict)
                        color = colors[i % len(colors)]
                        plt.plot(x, y, color=color, linewidth=2, label=f'y = {func_str}')
                    except:
                        continue
                
                plt.xlabel('x')
                plt.ylabel('y')
                plt.title('函数对比图')
                plt.grid(True, alpha=0.3)
                plt.legend()
            
            # 保存图像到内存
            buffer = io.BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            
            # 转换为 base64
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            
            plt.close()  # 关闭图像以释放内存
            
            return {
                "plot_type": plot_type,
                "image_base64": image_base64,
                "success": True
            }
            
        except Exception as e:
            plt.close()  # 确保在错误时也关闭图像
            return {"error": f"绘图错误: {str(e)}"}
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "plot_type": {
                    "type": "string",
                    "enum": ["function", "scatter", "histogram", "multiple_functions"],
                    "description": "绘图类型"
                },
                "function": {
                    "type": "string",
                    "description": "函数表达式"
                },
                "functions": {
                    "type": "array",
                    "description": "多个函数表达式列表"
                },
                "x_min": {
                    "type": "number",
                    "description": "x 轴最小值",
                    "default": -10
                },
                "x_max": {
                    "type": "number",
                    "description": "x 轴最大值",
                    "default": 10
                },
                "points": {
                    "type": "integer",
                    "description": "绘图点数",
                    "default": 1000
                },
                "x_data": {
                    "type": "array",
                    "description": "x 坐标数据"
                },
                "y_data": {
                    "type": "array",
                    "description": "y 坐标数据"
                },
                "data": {
                    "type": "array",
                    "description": "直方图数据"
                },
                "bins": {
                    "type": "integer",
                    "description": "直方图分组数",
                    "default": 30
                },
                "fit_function": {
                    "type": "string",
                    "description": "拟合函数表达式"
                }
            },
            "required": ["plot_type"]
        }
```

## 🤖 数学求解 Agent

### 专业数学 Agent

```python
class MathSolverAgent(RobustAgent):
    """专业数学求解 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个专业的数学问题求解助手，具备以下能力：

1. **符号计算**：使用 SymPy 进行精确的符号数学计算
2. **数值计算**：使用 NumPy/SciPy 进行高效的数值计算
3. **可视化**：绘制函数图像和数据图表
4. **问题分析**：理解数学问题的本质和求解策略

工作流程：
1. 分析问题类型和要求
2. 选择合适的数学工具
3. 逐步求解并验证结果
4. 提供清晰的解释和可视化
5. 检查答案的合理性

请始终保持数学严谨性，提供详细的求解过程。
"""
        super().__init__("MathSolver", llm_client, system_prompt)
        
        # 添加数学工具
        self.add_tool(SymPyTool())
        self.add_tool(NumPyTool())
        self.add_tool(PlottingTool())
        self.add_tool(CalculatorTool())
        self.add_tool(CodeExecutionTool(["python"]))

# 使用示例
def math_solver_example():
    agent = MathSolverAgent(llm_client)
    
    # 微积分问题
    calculus_task = Task(
        id="calculus_001",
        description="""
        求解以下微积分问题：
        1. 求函数 f(x) = x³ - 3x² + 2x - 1 的导数
        2. 求该函数的极值点
        3. 计算定积分 ∫[0,2] f(x) dx
        4. 绘制函数图像
        """,
        priority=1
    )
    
    result = agent.execute_task(calculus_task)
    print("微积分问题求解结果:", result)

### 线性代数 Agent

```python
class LinearAlgebraAgent(RobustAgent):
    """线性代数专家 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个线性代数专家，专门处理矩阵运算、向量空间、特征值等问题。

专业领域：
1. 矩阵运算（加法、乘法、逆矩阵、行列式）
2. 线性方程组求解
3. 特征值和特征向量
4. 向量空间和线性变换
5. 矩阵分解（LU、QR、SVD）

请提供准确的计算结果和几何解释。
"""
        super().__init__("LinearAlgebraExpert", llm_client, system_prompt)
        
        self.add_tool(NumPyTool())
        self.add_tool(SymPyTool())
        self.add_tool(PlottingTool())
        self.add_tool(CodeExecutionTool(["python"]))

def linear_algebra_example():
    agent = LinearAlgebraAgent(llm_client)
    
    task = Task(
        id="linalg_001",
        description="""
        解决以下线性代数问题：
        
        给定矩阵 A = [[2, 1], [1, 3]] 和向量 b = [5, 7]
        
        1. 求解线性方程组 Ax = b
        2. 计算矩阵 A 的特征值和特征向量
        3. 计算矩阵 A 的行列式和逆矩阵
        4. 验证解的正确性
        """,
        priority=1
    )
    
    result = agent.execute_task(task)
    print("线性代数问题求解结果:", result)

### 统计分析 Agent

```python
class StatisticsAgent(RobustAgent):
    """统计分析专家 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个统计分析专家，擅长数据分析、概率计算和统计推断。

专业能力：
1. 描述性统计（均值、方差、分位数等）
2. 概率分布分析
3. 假设检验
4. 回归分析
5. 数据可视化

请提供准确的统计分析和合理的解释。
"""
        super().__init__("StatisticsExpert", llm_client, system_prompt)
        
        self.add_tool(NumPyTool())
        self.add_tool(PlottingTool())
        self.add_tool(CodeExecutionTool(["python"]))

def statistics_example():
    agent = StatisticsAgent(llm_client)
    
    task = Task(
        id="stats_001",
        description="""
        分析以下数据集：
        数据: [23, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55, 58]
        
        请完成：
        1. 计算基本统计量（均值、中位数、标准差等）
        2. 绘制直方图
        3. 检验数据是否符合正态分布
        4. 计算 95% 置信区间
        """,
        priority=1
    )
    
    result = agent.execute_task(task)
    print("统计分析结果:", result)
```

## 🧪 安全代码执行环境

### 沙箱执行器

```python
import subprocess
import tempfile
import os
import signal
import resource
from typing import Dict, Any, Optional

class SafeMathExecutor(Tool):
    """安全的数学代码执行器"""
    
    def __init__(self, timeout: int = 30, memory_limit: int = 128):
        super().__init__("safe_math_executor", "安全执行数学计算代码")
        self.timeout = timeout
        self.memory_limit = memory_limit  # MB
    
    def execute(self, code: str, language: str = "python") -> Dict[str, Any]:
        """安全执行数学代码"""
        if language != "python":
            return {"error": "目前只支持 Python"}
        
        try:
            return self._execute_python_safe(code)
        except Exception as e:
            return {"error": f"执行失败: {str(e)}"}
    
    def _execute_python_safe(self, code: str) -> Dict[str, Any]:
        """安全执行 Python 代码"""
        # 创建受限的代码环境
        safe_code = self._create_safe_code(code)
        
        # 创建临时文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(safe_code)
            temp_file = f.name
        
        try:
            # 设置资源限制
            def set_limits():
                # 限制内存使用
                resource.setrlimit(resource.RLIMIT_AS, 
                                 (self.memory_limit * 1024 * 1024, 
                                  self.memory_limit * 1024 * 1024))
                # 限制 CPU 时间
                resource.setrlimit(resource.RLIMIT_CPU, (self.timeout, self.timeout))
            
            # 执行代码
            result = subprocess.run(
                ['python', temp_file],
                capture_output=True,
                text=True,
                timeout=self.timeout,
                preexec_fn=set_limits
            )
            
            # 清理临时文件
            os.unlink(temp_file)
            
            return {
                "language": "python",
                "code": code,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode,
                "success": result.returncode == 0
            }
            
        except subprocess.TimeoutExpired:
            return {"error": f"代码执行超时 ({self.timeout}s)"}
        except Exception as e:
            return {"error": f"执行失败: {str(e)}"}
        finally:
            # 确保清理临时文件
            if os.path.exists(temp_file):
                os.unlink(temp_file)
    
    def _create_safe_code(self, code: str) -> str:
        """创建安全的代码环境"""
        safe_imports = """
import sys
import os
import numpy as np
import sympy as sp
import matplotlib.pyplot as plt
from scipy import optimize, integrate, stats
import math

# 限制可用模块
allowed_modules = {
    'numpy', 'sympy', 'matplotlib', 'scipy', 'math', 
    'collections', 'itertools', 'functools'
}

# 重写 __import__ 函数
original_import = __builtins__.__import__

def safe_import(name, *args, **kwargs):
    if name.split('.')[0] not in allowed_modules:
        raise ImportError(f"模块 '{name}' 不被允许")
    return original_import(name, *args, **kwargs)

__builtins__.__import__ = safe_import

# 禁用危险函数
__builtins__.open = None
__builtins__.exec = None
__builtins__.eval = None
__builtins__.compile = None

"""
        return safe_imports + "\n" + code
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "要执行的 Python 代码"
                },
                "language": {
                    "type": "string",
                    "enum": ["python"],
                    "description": "编程语言",
                    "default": "python"
                }
            },
            "required": ["code"]
        }
```

## 🔬 物理问题求解实例

### 物理计算 Agent

```python
class PhysicsAgent(RobustAgent):
    """物理问题求解 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个物理问题求解专家，能够处理各种物理计算和建模问题。

专业领域：
1. 经典力学（运动学、动力学、能量）
2. 电磁学（电场、磁场、电路）
3. 热力学和统计物理
4. 波动和振动
5. 量子力学基础

工作方法：
1. 理解物理问题的背景和条件
2. 建立数学模型
3. 选择合适的求解方法
4. 进行数值计算和符号推导
5. 验证结果的物理合理性
6. 提供图形化展示

请确保计算准确，解释清晰。
"""
        super().__init__("PhysicsExpert", llm_client, system_prompt)
        
        # 添加物理计算工具
        self.add_tool(SymPyTool())
        self.add_tool(NumPyTool())
        self.add_tool(PlottingTool())
        self.add_tool(SafeMathExecutor())

# 物理问题示例
def physics_example():
    agent = PhysicsAgent(llm_client)
    
    task = Task(
        id="physics_001",
        description="""
        求解以下物理问题：
        
        一个质量为 2kg 的物体从高度 10m 处自由落下。
        
        请计算：
        1. 物体落地时的速度
        2. 下落过程中的位置-时间关系
        3. 速度-时间关系
        4. 绘制位置和速度随时间的变化图
        5. 计算物体的动能和势能随时间的变化
        
        已知：重力加速度 g = 9.8 m/s²
        """,
        priority=1
    )
    
    result = agent.execute_task(task)
    print("物理问题求解结果:", result)

### 工程数学 Agent

```python
class EngineeringMathAgent(RobustAgent):
    """工程数学专家 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个工程数学专家，专门处理工程中的数学问题。

专业能力：
1. 微分方程求解
2. 拉普拉斯变换
3. 傅里叶分析
4. 数值方法
5. 优化问题
6. 信号处理

请提供实用的工程解决方案。
"""
        super().__init__("EngineeringMath", llm_client, system_prompt)
        
        self.add_tool(SymPyTool())
        self.add_tool(NumPyTool())
        self.add_tool(PlottingTool())
        self.add_tool(SafeMathExecutor())

def engineering_example():
    agent = EngineeringMathAgent(llm_client)
    
    task = Task(
        id="engineering_001",
        description="""
        求解以下工程数学问题：
        
        RLC 电路的微分方程为：
        L(d²i/dt²) + R(di/dt) + (1/C)i = V₀cos(ωt)
        
        其中：L = 0.1 H, R = 10 Ω, C = 0.01 F, V₀ = 12 V, ω = 50 rad/s
        
        请：
        1. 求解齐次方程的通解
        2. 求特解
        3. 给出完整解
        4. 分析电路的频率响应
        5. 绘制电流随时间的变化图
        """,
        priority=1
    )
    
    result = agent.execute_task(task)
    print("工程数学问题求解结果:", result)
```

## 🎯 综合数学问题求解系统

### 多专家协作系统

```python
class MathExpertSystem:
    """数学专家系统"""
    
    def __init__(self, llm_client):
        self.experts = {
            "general": MathSolverAgent(llm_client),
            "linear_algebra": LinearAlgebraAgent(llm_client),
            "statistics": StatisticsAgent(llm_client),
            "physics": PhysicsAgent(llm_client),
            "engineering": EngineeringMathAgent(llm_client)
        }
        self.coordinator = RobustAgent("MathCoordinator", llm_client)
    
    def solve_problem(self, problem_description: str) -> Dict[str, Any]:
        """智能分配和求解数学问题"""
        
        # 问题分类
        classification_prompt = f"""
        数学问题: {problem_description}
        
        请分析这个问题属于哪个数学领域，并选择最合适的专家：
        
        可用专家：
        - general: 通用数学问题（微积分、代数、几何等）
        - linear_algebra: 线性代数（矩阵、向量、特征值等）
        - statistics: 统计分析（概率、数据分析、假设检验等）
        - physics: 物理问题（力学、电磁学、热力学等）
        - engineering: 工程数学（微分方程、信号处理、优化等）
        
        返回 JSON 格式：
        {{
            "expert": "专家名称",
            "confidence": 0.9,
            "reasoning": "选择理由"
        }}
        """
        
        response = self.coordinator.llm_client.chat([
            {"role": "user", "content": classification_prompt}
        ])
        
        # 解析专家选择
        classification = self.coordinator._parse_action(response)
        expert_name = classification.get("expert", "general")
        
        if expert_name not in self.experts:
            expert_name = "general"
        
        # 创建任务
        task = Task(
            id=f"math_problem_{len(self.experts)}",
            description=problem_description,
            priority=1
        )
        
        # 执行求解
        try:
            expert = self.experts[expert_name]
            result = expert.execute_task(task)
            
            return {
                "problem": problem_description,
                "assigned_expert": expert_name,
                "classification": classification,
                "solution": result,
                "success": True
            }
            
        except Exception as e:
            return {
                "problem": problem_description,
                "assigned_expert": expert_name,
                "error": str(e),
                "success": False
            }

# 使用示例
def comprehensive_example():
    system = MathExpertSystem(llm_client)
    
    problems = [
        "求解方程组：2x + 3y = 7, x - y = 1",
        "计算函数 f(x) = x²sin(x) 在区间 [0, π] 上的定积分",
        "分析数据集 [1,2,3,4,5,6,7,8,9,10] 的统计特征",
        "求解弹簧振子的运动方程：m(d²x/dt²) + kx = 0",
        "优化函数 f(x,y) = x² + y² - 2x - 4y + 5 的最小值"
    ]
    
    for problem in problems:
        print(f"\n问题: {problem}")
        result = system.solve_problem(problem)
        print(f"分配专家: {result['assigned_expert']}")
        print(f"求解成功: {result['success']}")
        if result['success']:
            print(f"解决方案: {result['solution']}")
        else:
            print(f"错误: {result['error']}")
```

## 📊 性能评估和验证

### 数学结果验证器

```python
class MathResultValidator:
    """数学结果验证器"""
    
    def __init__(self, llm_client):
        self.llm_client = llm_client
        self.sympy_tool = SymPyTool()
        self.numpy_tool = NumPyTool()
    
    def validate_solution(self, problem: str, solution: Dict[str, Any]) -> Dict[str, Any]:
        """验证数学解答的正确性"""
        
        validation_results = {
            "problem": problem,
            "solution": solution,
            "validations": [],
            "overall_score": 0.0,
            "is_valid": False
        }
        
        try:
            # 1. 语法检查
            syntax_check = self._check_syntax(solution)
            validation_results["validations"].append(syntax_check)
            
            # 2. 数值验证
            numerical_check = self._numerical_verification(solution)
            validation_results["validations"].append(numerical_check)
            
            # 3. 符号验证
            symbolic_check = self._symbolic_verification(solution)
            validation_results["validations"].append(symbolic_check)
            
            # 4. 合理性检查
            reasonableness_check = self._reasonableness_check(problem, solution)
            validation_results["validations"].append(reasonableness_check)
            
            # 计算总分
            scores = [check["score"] for check in validation_results["validations"]]
            validation_results["overall_score"] = sum(scores) / len(scores)
            validation_results["is_valid"] = validation_results["overall_score"] >= 0.7
            
        except Exception as e:
            validation_results["error"] = str(e)
        
        return validation_results
    
    def _check_syntax(self, solution: Dict[str, Any]) -> Dict[str, Any]:
        """检查解答的语法正确性"""
        try:
            # 检查是否包含数学表达式
            if "result" in solution or "solutions" in solution:
                return {"type": "syntax", "score": 1.0, "message": "语法检查通过"}
            else:
                return {"type": "syntax", "score": 0.5, "message": "缺少明确的数学结果"}
        except:
            return {"type": "syntax", "score": 0.0, "message": "语法检查失败"}
    
    def _numerical_verification(self, solution: Dict[str, Any]) -> Dict[str, Any]:
        """数值验证"""
        try:
            # 如果有数值结果，检查其合理性
            if "result" in solution:
                result = solution["result"]
                if isinstance(result, (int, float)):
                    if not (abs(result) < 1e10):  # 检查数值范围
                        return {"type": "numerical", "score": 0.3, "message": "数值结果可能过大"}
                    return {"type": "numerical", "score": 1.0, "message": "数值验证通过"}
            
            return {"type": "numerical", "score": 0.8, "message": "无法进行数值验证"}
        except:
            return {"type": "numerical", "score": 0.0, "message": "数值验证失败"}
    
    def _symbolic_verification(self, solution: Dict[str, Any]) -> Dict[str, Any]:
        """符号验证"""
        try:
            # 检查符号表达式的正确性
            if "expression" in solution:
                expr_str = solution["expression"]
                # 尝试用 SymPy 解析
                result = self.sympy_tool.execute("simplify", expr_str)
                if "error" not in result:
                    return {"type": "symbolic", "score": 1.0, "message": "符号验证通过"}
                else:
                    return {"type": "symbolic", "score": 0.2, "message": "符号表达式有误"}
            
            return {"type": "symbolic", "score": 0.8, "message": "无符号表达式需要验证"}
        except:
            return {"type": "symbolic", "score": 0.0, "message": "符号验证失败"}
    
    def _reasonableness_check(self, problem: str, solution: Dict[str, Any]) -> Dict[str, Any]:
        """合理性检查"""
        try:
            # 使用 LLM 检查解答的合理性
            check_prompt = f"""
            数学问题: {problem}
            
            给出的解答: {solution}
            
            请评估这个解答的合理性，考虑：
            1. 解答是否回答了问题
            2. 数学方法是否正确
            3. 结果是否合理
            
            返回 JSON 格式：
            {{
                "score": 0.9,
                "reasoning": "评估理由"
            }}
            """
            
            response = self.llm_client.chat([
                {"role": "user", "content": check_prompt}
            ])
            
            # 解析评估结果
            evaluation = json.loads(response)
            score = evaluation.get("score", 0.5)
            reasoning = evaluation.get("reasoning", "无法评估")
            
            return {
                "type": "reasonableness",
                "score": score,
                "message": f"合理性评估: {reasoning}"
            }
            
        except:
            return {"type": "reasonableness", "score": 0.5, "message": "合理性检查失败"}

# 使用示例
def validation_example():
    validator = MathResultValidator(llm_client)
    
    # 测试解答
    test_solution = {
        "operation": "solve",
        "expression": "x**2 - 4",
        "solutions": ["-2", "2"],
        "result": "方程 x² - 4 = 0 的解为 x = ±2"
    }
    
    validation = validator.validate_solution(
        "求解方程 x² - 4 = 0",
        test_solution
    )
    
    print("验证结果:")
    print(f"总分: {validation['overall_score']:.2f}")
    print(f"是否有效: {validation['is_valid']}")
    
    for check in validation["validations"]:
        print(f"- {check['type']}: {check['score']:.2f} - {check['message']}")
```

## 📚 实践练习

### 练习 1：构建微积分求解器

```python
def build_calculus_solver():
    """构建专门的微积分求解器"""
    
    class CalculusSolver(RobustAgent):
        def __init__(self, llm_client):
            system_prompt = """
            你是一个微积分专家，专门处理导数、积分、极限等问题。
            
            请提供详细的求解步骤和数学推理。
            """
            super().__init__("CalculusSolver", llm_client, system_prompt)
            
            self.add_tool(SymPyTool())
            self.add_tool(PlottingTool())
    
    return CalculusSolver(llm_client)

### 练习 2：数据拟合分析器

```python
def build_data_fitter():
    """构建数据拟合分析器"""
    
    class DataFitter(RobustAgent):
        def __init__(self, llm_client):
            system_prompt = """
            你是一个数据拟合专家，能够：
            1. 分析数据特征
            2. 选择合适的拟合模型
            3. 评估拟合质量
            4. 提供预测能力
            """
            super().__init__("DataFitter", llm_client, system_prompt)
            
            self.add_tool(NumPyTool())
            self.add_tool(PlottingTool())
            self.add_tool(SafeMathExecutor())
    
    return DataFitter(llm_client)

### 练习 3：物理建模系统

```python
def build_physics_modeler():
    """构建物理建模系统"""
    
    class PhysicsModeler(RobustAgent):
        def __init__(self, llm_client):
            system_prompt = """
            你是一个物理建模专家，能够：
            1. 理解物理现象
            2. 建立数学模型
            3. 求解物理方程
            4. 分析物理意义
            5. 提供可视化展示
            """
            super().__init__("PhysicsModeler", llm_client, system_prompt)
            
            self.add_tool(SymPyTool())
            self.add_tool(NumPyTool())
            self.add_tool(PlottingTool())
            self.add_tool(SafeMathExecutor())
    
    return PhysicsModeler(llm_client)
```

## 📈 总结与展望

本模块深入介绍了数学问题求解的 LLM Agent 构建技术，包括：

### 核心技能
1. **符号计算集成**：SymPy 库的深度应用
2. **数值计算能力**：NumPy/SciPy 的高效使用
3. **可视化展示**：Matplotlib 图形生成
4. **安全执行环境**：代码沙箱和资源限制
5. **多专家协作**：不同数学领域的专业化

### 应用领域
- 微积分问题求解
- 线性代数计算
- 统计数据分析
- 物理问题建模
- 工程数学应用

### 技术特点
- **准确性**：符号计算保证精确结果
- **效率性**：数值方法处理复杂计算
- **安全性**：沙箱环境防止恶意代码
- **可视化**：图形展示增强理解
- **可扩展性**：模块化设计便于扩展

### 未来发展方向
1. **更多数学库集成**：如 Mathematica、Maple 接口
2. **机器学习增强**：自动模型选择和参数优化
3. **交互式求解**：实时反馈和调整
4. **多模态输入**：支持手写公式识别
5. **云端计算**：大规模并行数值计算

通过本模块的学习，同学们可以构建功能强大的数学求解系统，为科学研究和工程应用提供智能化的数学工具支持。

---

**课程总结**：至此，我们完成了从基础 API 调用到高级 Agent 构建，再到专业数学问题求解的完整学习路径。希望同学们能够将这些技能应用到实际项目中，构建更加智能和实用的 LLM 应用系统。
