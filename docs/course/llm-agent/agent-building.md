# 模块三：Agent 构建实战

## 📖 概述

本模块将指导同学们构建功能完整的 LLM Agent。我们将学习 Agent 的核心架构、决策循环、工具集成，以及如何处理复杂的任务规划和执行。通过实际案例，掌握从简单到复杂的 Agent 开发技能。

## 🏗️ Agent 架构设计

### 基础 Agent 架构

一个完整的 LLM Agent 通常包含以下核心组件：

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
import json

class AgentState(Enum):
    """Agent 状态枚举"""
    IDLE = "idle"
    THINKING = "thinking"
    ACTING = "acting"
    WAITING = "waiting"
    COMPLETED = "completed"
    ERROR = "error"

@dataclass
class Task:
    """任务定义"""
    id: str
    description: str
    priority: int = 1
    status: str = "pending"
    result: Optional[Any] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

class Tool(ABC):
    """工具抽象基类"""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
    
    @abstractmethod
    def execute(self, **kwargs) -> Dict[str, Any]:
        """执行工具"""
        pass
    
    def get_schema(self) -> Dict[str, Any]:
        """获取工具的参数 schema"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self._get_parameters_schema()
        }
    
    @abstractmethod
    def _get_parameters_schema(self) -> Dict[str, Any]:
        """获取参数 schema"""
        pass

class BaseAgent:
    """基础 Agent 类"""
    
    def __init__(self, name: str, llm_client, system_prompt: str = None):
        self.name = name
        self.llm_client = llm_client
        self.state = AgentState.IDLE
        self.tools: Dict[str, Tool] = {}
        self.memory: List[Dict[str, Any]] = []
        self.current_task: Optional[Task] = None
        self.system_prompt = system_prompt or self._default_system_prompt()
    
    def _default_system_prompt(self) -> str:
        return f"""
你是一个名为 {self.name} 的智能助手。你可以使用各种工具来完成任务。

工作流程：
1. 理解用户的任务需求
2. 分析需要使用哪些工具
3. 制定执行计划
4. 逐步执行并获取结果
5. 总结并回报结果

请始终保持逻辑清晰，步骤明确。
"""
    
    def add_tool(self, tool: Tool):
        """添加工具"""
        self.tools[tool.name] = tool
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """获取可用工具列表"""
        return [tool.get_schema() for tool in self.tools.values()]
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """执行任务"""
        self.current_task = task
        self.state = AgentState.THINKING
        
        try:
            result = self._execute_task_internal(task)
            task.status = "completed"
            task.result = result
            self.state = AgentState.COMPLETED
            return result
            
        except Exception as e:
            task.status = "error"
            task.result = {"error": str(e)}
            self.state = AgentState.ERROR
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
            schema = tool.get_schema()
            tools_info.append(f"- {schema['name']}: {schema['description']}")
        
        return "\n".join(tools_info)
    
    def _decision_loop(self, initial_prompt: str, max_iterations: int = 10) -> Dict[str, Any]:
        """决策循环"""
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": initial_prompt}
        ]
        
        for iteration in range(max_iterations):
            self.state = AgentState.THINKING
            
            # 获取 LLM 响应
            response = self.llm_client.chat(messages)
            
            # 解析响应
            action = self._parse_action(response)
            
            if action["action"] == "complete":
                return action["result"]
            
            elif action["action"] == "use_tool":
                self.state = AgentState.ACTING
                
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
        
        raise Exception("达到最大迭代次数，任务未完成")
    
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
```

### 实用工具实现

```python
import requests
import subprocess
import os
from datetime import datetime

class CalculatorTool(Tool):
    """计算器工具"""
    
    def __init__(self):
        super().__init__("calculator", "执行数学计算")
    
    def execute(self, expression: str) -> Dict[str, Any]:
        """执行数学表达式"""
        try:
            # 安全的数学表达式求值
            allowed_names = {
                k: v for k, v in __builtins__.items() 
                if k in ['abs', 'round', 'min', 'max', 'sum']
            }
            allowed_names.update({
                'sin': __import__('math').sin,
                'cos': __import__('math').cos,
                'tan': __import__('math').tan,
                'sqrt': __import__('math').sqrt,
                'log': __import__('math').log,
                'pi': __import__('math').pi,
                'e': __import__('math').e
            })
            
            result = eval(expression, {"__builtins__": {}}, allowed_names)
            return {"result": result, "expression": expression}
            
        except Exception as e:
            return {"error": f"计算错误: {str(e)}"}
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "要计算的数学表达式"
                }
            },
            "required": ["expression"]
        }

class WebSearchTool(Tool):
    """网络搜索工具（模拟）"""
    
    def __init__(self):
        super().__init__("web_search", "搜索网络信息")
    
    def execute(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """执行网络搜索"""
        # 这里是模拟实现，实际应用中可以集成真实的搜索 API
        mock_results = [
            {
                "title": f"关于 '{query}' 的搜索结果 1",
                "url": "https://example.com/1",
                "snippet": f"这是关于 {query} 的详细信息..."
            },
            {
                "title": f"关于 '{query}' 的搜索结果 2", 
                "url": "https://example.com/2",
                "snippet": f"{query} 的更多相关内容..."
            }
        ]
        
        return {
            "query": query,
            "results": mock_results[:max_results],
            "total_found": len(mock_results)
        }
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索查询词"
                },
                "max_results": {
                    "type": "integer",
                    "description": "最大结果数量",
                    "default": 5
                }
            },
            "required": ["query"]
        }

class FileOperationTool(Tool):
    """文件操作工具"""
    
    def __init__(self, allowed_dirs: List[str] = None):
        super().__init__("file_operation", "读写文件")
        self.allowed_dirs = allowed_dirs or ["./workspace"]
    
    def execute(self, operation: str, filepath: str, content: str = None) -> Dict[str, Any]:
        """执行文件操作"""
        # 安全检查
        if not self._is_safe_path(filepath):
            return {"error": "文件路径不安全"}
        
        try:
            if operation == "read":
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                return {"operation": "read", "filepath": filepath, "content": content}
            
            elif operation == "write":
                if content is None:
                    return {"error": "写入操作需要提供内容"}
                
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                return {"operation": "write", "filepath": filepath, "success": True}
            
            elif operation == "append":
                if content is None:
                    return {"error": "追加操作需要提供内容"}
                
                with open(filepath, 'a', encoding='utf-8') as f:
                    f.write(content)
                return {"operation": "append", "filepath": filepath, "success": True}
            
            else:
                return {"error": f"不支持的操作: {operation}"}
                
        except Exception as e:
            return {"error": f"文件操作失败: {str(e)}"}
    
    def _is_safe_path(self, filepath: str) -> bool:
        """检查文件路径是否安全"""
        abs_path = os.path.abspath(filepath)
        return any(abs_path.startswith(os.path.abspath(allowed_dir)) 
                  for allowed_dir in self.allowed_dirs)
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["read", "write", "append"],
                    "description": "文件操作类型"
                },
                "filepath": {
                    "type": "string",
                    "description": "文件路径"
                },
                "content": {
                    "type": "string",
                    "description": "文件内容（写入和追加操作需要）"
                }
            },
            "required": ["operation", "filepath"]
        }

class CodeExecutionTool(Tool):
    """代码执行工具"""
    
    def __init__(self, allowed_languages: List[str] = None):
        super().__init__("code_execution", "执行代码")
        self.allowed_languages = allowed_languages or ["python"]
    
    def execute(self, language: str, code: str, timeout: int = 30) -> Dict[str, Any]:
        """执行代码"""
        if language not in self.allowed_languages:
            return {"error": f"不支持的语言: {language}"}
        
        try:
            if language == "python":
                return self._execute_python(code, timeout)
            else:
                return {"error": f"语言 {language} 的执行器未实现"}
                
        except Exception as e:
            return {"error": f"代码执行失败: {str(e)}"}
    
    def _execute_python(self, code: str, timeout: int) -> Dict[str, Any]:
        """执行 Python 代码"""
        try:
            # 创建临时文件
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                temp_file = f.name
            
            # 执行代码
            result = subprocess.run(
                ['python', temp_file],
                capture_output=True,
                text=True,
                timeout=timeout
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
            return {"error": f"代码执行超时 ({timeout}s)"}
        except Exception as e:
            return {"error": f"执行失败: {str(e)}"}
    
    def _get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "language": {
                    "type": "string",
                    "enum": self.allowed_languages,
                    "description": "编程语言"
                },
                "code": {
                    "type": "string",
                    "description": "要执行的代码"
                },
                "timeout": {
                    "type": "integer",
                    "description": "超时时间（秒）",
                    "default": 30
                }
            },
            "required": ["language", "code"]
        }
```

## 🔄 决策循环与任务规划

### 高级决策循环

```python
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import uuid

@dataclass
class Step:
    """执行步骤"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""
    tool_name: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    status: str = "pending"  # pending, executing, completed, failed
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class Plan:
    """执行计划"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_description: str = ""
    steps: List[Step] = field(default_factory=list)
    current_step: int = 0
    status: str = "created"  # created, executing, completed, failed
    created_at: datetime = field(default_factory=datetime.now)

class PlanningAgent(BaseAgent):
    """具有规划能力的 Agent"""
    
    def __init__(self, name: str, llm_client, system_prompt: str = None):
        super().__init__(name, llm_client, system_prompt)
        self.current_plan: Optional[Plan] = None
    
    def _execute_task_internal(self, task: Task) -> Dict[str, Any]:
        """内部任务执行逻辑"""
        # 第一步：制定计划
        plan = self._create_plan(task)
        self.current_plan = plan
        
        # 第二步：执行计划
        return self._execute_plan(plan)
    
    def _create_plan(self, task: Task) -> Plan:
        """制定执行计划"""
        tools_info = self._format_tools_info()
        
        planning_prompt = f"""
任务: {task.description}

可用工具:
{tools_info}

请为这个任务制定详细的执行计划。将任务分解为具体的步骤，每个步骤应该：
1. 有清晰的描述
2. 指定需要使用的工具（如果需要）
3. 明确工具的参数

请以 JSON 格式返回计划：

```json
{{
    "steps": [
        {{
            "description": "步骤描述",
            "tool_name": "工具名称或null",
            "parameters": {{
                "参数名": "参数值"
            }}
        }}
    ]
}}
```
"""
        
        response = self.llm_client.chat([
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": planning_prompt}
        ])
        
        # 解析计划
        plan_data = self._parse_action(response)
        
        plan = Plan(task_description=task.description)
        
        if "steps" in plan_data:
            for step_data in plan_data["steps"]:
                step = Step(
                    description=step_data.get("description", ""),
                    tool_name=step_data.get("tool_name"),
                    parameters=step_data.get("parameters", {})
                )
                plan.steps.append(step)
        
        return plan
    
    def _execute_plan(self, plan: Plan) -> Dict[str, Any]:
        """执行计划"""
        plan.status = "executing"
        results = []
        
        for i, step in enumerate(plan.steps):
            plan.current_step = i
            step.status = "executing"
            
            try:
                if step.tool_name:
                    # 执行工具
                    result = self._execute_tool(step.tool_name, step.parameters)
                    step.result = result
                    
                    if "error" in result:
                        step.status = "failed"
                        # 尝试修复或跳过
                        recovery_result = self._handle_step_failure(step, plan)
                        if recovery_result:
                            step.result = recovery_result
                            step.status = "completed"
                        else:
                            plan.status = "failed"
                            break
                    else:
                        step.status = "completed"
                else:
                    # 纯思考步骤
                    step.result = {"type": "thinking", "description": step.description}
                    step.status = "completed"
                
                results.append({
                    "step": i + 1,
                    "description": step.description,
                    "result": step.result
                })
                
            except Exception as e:
                step.status = "failed"
                step.result = {"error": str(e)}
                plan.status = "failed"
                break
        
        if plan.status != "failed":
            plan.status = "completed"
        
        return {
            "plan_id": plan.id,
            "status": plan.status,
            "steps_completed": len([s for s in plan.steps if s.status == "completed"]),
            "total_steps": len(plan.steps),
            "results": results
        }
    
    def _handle_step_failure(self, failed_step: Step, plan: Plan) -> Optional[Dict[str, Any]]:
        """处理步骤失败"""
        recovery_prompt = f"""
执行步骤时遇到错误：

步骤描述: {failed_step.description}
使用工具: {failed_step.tool_name}
参数: {failed_step.parameters}
错误信息: {failed_step.result.get('error', '未知错误')}

请分析错误原因并提供解决方案：
1. 修改参数重试
2. 使用其他工具
3. 跳过此步骤
4. 终止执行

请以 JSON 格式回复：

```json
{{
    "action": "retry|skip|abort",
    "tool_name": "工具名称（如果重试）",
    "parameters": {{
        "参数名": "参数值"
    }},
    "reason": "处理原因"
}}
```
"""
        
        response = self.llm_client.chat([
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": recovery_prompt}
        ])
        
        recovery_action = self._parse_action(response)
        
        if recovery_action.get("action") == "retry":
            # 重试执行
            return self._execute_tool(
                recovery_action.get("tool_name", failed_step.tool_name),
                recovery_action.get("parameters", failed_step.parameters)
            )
        elif recovery_action.get("action") == "skip":
            # 跳过步骤
            return {"type": "skipped", "reason": recovery_action.get("reason", "步骤被跳过")}
        else:
            # 终止执行
            return None
```

## 🧠 状态管理和错误处理

### 持久化状态管理

```python
import json
import os
from typing import Dict, Any, Optional
from datetime import datetime

class AgentStateManager:
    """Agent 状态管理器"""
    
    def __init__(self, agent_name: str, state_dir: str = "./agent_states"):
        self.agent_name = agent_name
        self.state_dir = state_dir
        self.state_file = os.path.join(state_dir, f"{agent_name}_state.json")
        os.makedirs(state_dir, exist_ok=True)
    
    def save_state(self, agent: BaseAgent):
        """保存 Agent 状态"""
        state_data = {
            "agent_name": agent.name,
            "state": agent.state.value,
            "memory": agent.memory,
            "current_task": self._serialize_task(agent.current_task),
            "tools": list(agent.tools.keys()),
            "timestamp": datetime.now().isoformat()
        }
        
        # 如果是规划 Agent，保存计划信息
        if isinstance(agent, PlanningAgent) and agent.current_plan:
            state_data["current_plan"] = self._serialize_plan(agent.current_plan)
        
        with open(self.state_file, 'w', encoding='utf-8') as f:
            json.dump(state_data, f, ensure_ascii=False, indent=2)
    
    def load_state(self, agent: BaseAgent) -> bool:
        """加载 Agent 状态"""
        if not os.path.exists(self.state_file):
            return False
        
        try:
            with open(self.state_file, 'r', encoding='utf-8') as f:
                state_data = json.load(f)
            
            agent.state = AgentState(state_data["state"])
            agent.memory = state_data["memory"]
            
            if state_data.get("current_task"):
                agent.current_task = self._deserialize_task(state_data["current_task"])
            
            # 如果是规划 Agent，恢复计划信息
            if isinstance(agent, PlanningAgent) and state_data.get("current_plan"):
                agent.current_plan = self._deserialize_plan(state_data["current_plan"])
            
            return True
            
        except Exception as e:
            print(f"加载状态失败: {e}")
            return False
    
    def _serialize_task(self, task: Optional[Task]) -> Optional[Dict[str, Any]]:
        """序列化任务"""
        if not task:
            return None
        
        return {
            "id": task.id,
            "description": task.description,
            "priority": task.priority,
            "status": task.status,
            "result": task.result,
            "metadata": task.metadata
        }
    
    def _deserialize_task(self, task_data: Dict[str, Any]) -> Task:
        """反序列化任务"""
        return Task(
            id=task_data["id"],
            description=task_data["description"],
            priority=task_data["priority"],
            status=task_data["status"],
            result=task_data["result"],
            metadata=task_data["metadata"]
        )
    
    def _serialize_plan(self, plan: Plan) -> Dict[str, Any]:
        """序列化计划"""
        return {
            "id": plan.id,
            "task_description": plan.task_description,
            "steps": [self._serialize_step(step) for step in plan.steps],
            "current_step": plan.current_step,
            "status": plan.status,
            "created_at": plan.created_at.isoformat()
        }
    
    def _serialize_step(self, step: Step) -> Dict[str, Any]:
        """序列化步骤"""
        return {
            "id": step.id,
            "description": step.description,
            "tool_name": step.tool_name,
            "parameters": step.parameters,
            "result": step.result,
            "status": step.status,
            "created_at": step.created_at.isoformat()
        }
    
    def _deserialize_plan(self, plan_data: Dict[str, Any]) -> Plan:
        """反序列化计划"""
        plan = Plan(
            id=plan_data["id"],
            task_description=plan_data["task_description"],
            current_step=plan_data["current_step"],
            status=plan_data["status"],
            created_at=datetime.fromisoformat(plan_data["created_at"])
        )
        
        for step_data in plan_data["steps"]:
            step = Step(
                id=step_data["id"],
                description=step_data["description"],
                tool_name=step_data["tool_name"],
                parameters=step_data["parameters"],
                result=step_data["result"],
                status=step_data["status"],
                created_at=datetime.fromisoformat(step_data["created_at"])
            )
            plan.steps.append(step)
        
        return plan

# 错误处理和恢复机制
class RobustAgent(PlanningAgent):
    """具有错误处理和恢复能力的 Agent"""
    
    def __init__(self, name: str, llm_client, system_prompt: str = None):
        super().__init__(name, llm_client, system_prompt)
        self.state_manager = AgentStateManager(name)
        self.max_retries = 3
        self.error_history: List[Dict[str, Any]] = []
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """执行任务（带错误处理）"""
        # 保存初始状态
        self.state_manager.save_state(self)
        
        retry_count = 0
        last_error = None
        
        while retry_count < self.max_retries:
            try:
                result = super().execute_task(task)
                
                # 任务成功完成，清理状态
                self._cleanup_state()
                return result
                
            except Exception as e:
                retry_count += 1
                last_error = e
                
                # 记录错误
                error_info = {
                    "error": str(e),
                    "retry_count": retry_count,
                    "timestamp": datetime.now().isoformat(),
                    "task_id": task.id
                }
                self.error_history.append(error_info)
                
                if retry_count < self.max_retries:
                    print(f"任务执行失败，第 {retry_count} 次重试: {e}")
                    
                    # 尝试恢复状态
                    self._attempt_recovery(task, e)
                else:
                    print(f"任务最终失败: {e}")
                    break
        
        # 所有重试都失败了
        if last_error:
            raise last_error
    
    def _attempt_recovery(self, task: Task, error: Exception):
        """尝试从错误中恢复"""
        # 重置 Agent 状态
        self.state = AgentState.IDLE
        self.current_task = None
        
        # 清理部分内存（保留重要信息）
        if len(self.memory) > 5:
            self.memory = self.memory[-3:]  # 只保留最近3条记录
    
    def _cleanup_state(self):
        """清理状态文件"""
        if os.path.exists(self.state_manager.state_file):
            os.remove(self.state_manager.state_file)
```

## 🎯 完整 Agent 实战案例

### 案例 1：研究助手 Agent

```python
class ResearchAgent(RobustAgent):
    """研究助手 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个专业的研究助手，能够帮助用户进行文献调研、数据分析和报告撰写。

你的能力包括：
1. 网络搜索相关资料
2. 分析和总结信息
3. 执行数据计算
4. 生成研究报告

请始终保持学术严谨性，提供可靠的信息来源。
"""
        super().__init__("ResearchAgent", llm_client, system_prompt)
        
        # 添加工具
        self.add_tool(WebSearchTool())
        self.add_tool(CalculatorTool())
        self.add_tool(FileOperationTool(["./research_output"]))
        self.add_tool(CodeExecutionTool(["python"]))

# 使用示例
def research_agent_example():
    # 初始化 Agent
    research_agent = ResearchAgent(llm_client)
    
    # 创建研究任务
    task = Task(
        id="research_001",
        description="研究人工智能在教育领域的应用现状，并生成一份简要报告",
        priority=1
    )
    
    # 执行任务
    try:
        result = research_agent.execute_task(task)
        print("研究任务完成:")
        print(f"状态: {result['status']}")
        print(f"完成步骤: {result['steps_completed']}/{result['total_steps']}")
        
        # 显示执行结果
        for step_result in result['results']:
            print(f"\n步骤 {step_result['step']}: {step_result['description']}")
            if 'result' in step_result['result']:
                print(f"结果: {step_result['result']['result']}")
                
    except Exception as e:
        print(f"任务执行失败: {e}")

### 案例 2：数据分析 Agent

```python
class DataAnalysisAgent(RobustAgent):
    """数据分析 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个专业的数据分析师，擅长处理各种数据分析任务。

你的工作流程：
1. 理解数据分析需求
2. 编写数据处理代码
3. 执行分析计算
4. 生成可视化图表
5. 撰写分析报告

请确保分析结果的准确性和可解释性。
"""
        super().__init__("DataAnalysisAgent", llm_client, system_prompt)
        
        # 添加专业工具
        self.add_tool(CodeExecutionTool(["python"]))
        self.add_tool(FileOperationTool(["./data", "./output"]))
        self.add_tool(CalculatorTool())

# 数据分析任务示例
def data_analysis_example():
    agent = DataAnalysisAgent(llm_client)
    
    task = Task(
        id="analysis_001",
        description="""
        分析以下销售数据并生成报告：
        - 数据文件：./data/sales_data.csv
        - 需要分析：月度销售趋势、产品类别表现、地区分布
        - 生成图表和总结报告
        """,
        priority=1
    )
    
    result = agent.execute_task(task)
    print("数据分析完成:", result)

### 案例 3：代码助手 Agent

```python
class CodingAgent(RobustAgent):
    """编程助手 Agent"""
    
    def __init__(self, llm_client):
        system_prompt = """
你是一个专业的编程助手，能够帮助用户解决编程问题。

你的能力包括：
1. 理解编程需求
2. 设计算法和数据结构
3. 编写高质量代码
4. 测试和调试程序
5. 优化代码性能

请遵循编程最佳实践，编写清晰、可维护的代码。
"""
        super().__init__("CodingAgent", llm_client, system_prompt)
        
        self.add_tool(CodeExecutionTool(["python", "javascript"]))
        self.add_tool(FileOperationTool(["./projects"]))
        self.add_tool(WebSearchTool())  # 搜索编程资料

def coding_agent_example():
    agent = CodingAgent(llm_client)
    
    task = Task(
        id="coding_001",
        description="""
        实现一个简单的任务管理系统：
        1. 支持添加、删除、修改任务
        2. 任务有优先级和截止日期
        3. 可以按不同条件排序和筛选
        4. 提供命令行界面
        5. 数据持久化到文件
        """,
        priority=1
    )
    
    result = agent.execute_task(task)
    print("编程任务完成:", result)
```

## 🔧 Agent 性能优化

### 并行处理优化

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List

class ParallelAgent(RobustAgent):
    """支持并行处理的 Agent"""
    
    def __init__(self, name: str, llm_client, max_workers: int = 3):
        super().__init__(name, llm_client)
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
    
    async def execute_parallel_tasks(self, tasks: List[Task]) -> List[Dict[str, Any]]:
        """并行执行多个任务"""
        loop = asyncio.get_event_loop()
        
        # 创建任务协程
        coroutines = [
            loop.run_in_executor(self.executor, self.execute_task, task)
            for task in tasks
        ]
        
        # 并行执行
        results = await asyncio.gather(*coroutines, return_exceptions=True)
        
        return results
    
    def __del__(self):
        """清理资源"""
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=True)

# 使用示例
async def parallel_execution_example():
    agent = ParallelAgent("ParallelAgent", llm_client)
    
    tasks = [
        Task(id="task1", description="计算 1+1"),
        Task(id="task2", description="搜索人工智能相关信息"),
        Task(id="task3", description="生成一个简单的 Python 函数")
    ]
    
    results = await agent.execute_parallel_tasks(tasks)
    
    for i, result in enumerate(results):
        print(f"任务 {i+1} 结果: {result}")

### 缓存和优化

```python
from functools import lru_cache
import hashlib

class OptimizedAgent(RobustAgent):
    """优化版 Agent"""
    
    def __init__(self, name: str, llm_client):
        super().__init__(name, llm_client)
        self.tool_cache = {}
        self.plan_cache = {}
    
    @lru_cache(maxsize=100)
    def _cached_llm_call(self, messages_hash: str, messages_json: str) -> str:
        """缓存 LLM 调用结果"""
        import json
        messages = json.loads(messages_json)
        return self.llm_client.chat(messages)
    
    def _get_messages_hash(self, messages: List[Dict[str, str]]) -> str:
        """生成消息哈希"""
        content = json.dumps(messages, sort_keys=True)
        return hashlib.md5(content.encode()).hexdigest()
    
    def _execute_tool_cached(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """缓存工具执行结果"""
        cache_key = f"{tool_name}:{json.dumps(parameters, sort_keys=True)}"
        
        if cache_key in self.tool_cache:
            print(f"使用缓存结果: {tool_name}")
            return self.tool_cache[cache_key]
        
        result = self._execute_tool(tool_name, parameters)
        
        # 只缓存成功的结果
        if "error" not in result:
            self.tool_cache[cache_key] = result
        
        return result
```

## 📊 Agent 监控和调试

### 性能监控

```python
import time
from typing import Dict, Any, List
from dataclasses import dataclass
from datetime import datetime

@dataclass
class PerformanceMetrics:
    """性能指标"""
    task_id: str
    start_time: datetime
    end_time: datetime
    duration: float
    steps_count: int
    tools_used: List[str]
    success: bool
    error_message: str = None

class MonitoredAgent(RobustAgent):
    """带监控功能的 Agent"""
    
    def __init__(self, name: str, llm_client):
        super().__init__(name, llm_client)
        self.metrics: List[PerformanceMetrics] = []
        self.total_llm_calls = 0
        self.total_tool_calls = 0
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """执行任务（带性能监控）"""
        start_time = datetime.now()
        
        try:
            result = super().execute_task(task)
            
            # 记录成功指标
            metrics = PerformanceMetrics(
                task_id=task.id,
                start_time=start_time,
                end_time=datetime.now(),
                duration=(datetime.now() - start_time).total_seconds(),
                steps_count=result.get('steps_completed', 0),
                tools_used=self._get_tools_used_in_task(),
                success=True
            )
            
        except Exception as e:
            # 记录失败指标
            metrics = PerformanceMetrics(
                task_id=task.id,
                start_time=start_time,
                end_time=datetime.now(),
                duration=(datetime.now() - start_time).total_seconds(),
                steps_count=0,
                tools_used=[],
                success=False,
                error_message=str(e)
            )
            raise e
        
        finally:
            self.metrics.append(metrics)
        
        return result
    
    def _get_tools_used_in_task(self) -> List[str]:
        """获取任务中使用的工具"""
        tools_used = set()
        for memory_item in self.memory:
            if 'action' in memory_item and memory_item['action'].get('tool_name'):
                tools_used.add(memory_item['action']['tool_name'])
        return list(tools_used)
    
    def get_performance_report(self) -> Dict[str, Any]:
        """生成性能报告"""
        if not self.metrics:
            return {"message": "暂无性能数据"}
        
        successful_tasks = [m for m in self.metrics if m.success]
        failed_tasks = [m for m in self.metrics if not m.success]
        
        avg_duration = sum(m.duration for m in successful_tasks) / len(successful_tasks) if successful_tasks else 0
        
        return {
            "total_tasks": len(self.metrics),
            "successful_tasks": len(successful_tasks),
            "failed_tasks": len(failed_tasks),
            "success_rate": len(successful_tasks) / len(self.metrics) * 100,
            "average_duration": avg_duration,
            "total_llm_calls": self.total_llm_calls,
            "total_tool_calls": self.total_tool_calls,
            "most_used_tools": self._get_most_used_tools()
        }
    
    def _get_most_used_tools(self) -> Dict[str, int]:
        """获取最常用的工具"""
        tool_usage = {}
        for metrics in self.metrics:
            for tool in metrics.tools_used:
                tool_usage[tool] = tool_usage.get(tool, 0) + 1
        
        return dict(sorted(tool_usage.items(), key=lambda x: x[1], reverse=True))

# 使用示例
def monitoring_example():
    agent = MonitoredAgent("MonitoredAgent", llm_client)
    
    # 执行多个任务
    tasks = [
        Task(id="task1", description="计算圆周率的前10位"),
        Task(id="task2", description="搜索最新的AI新闻"),
        Task(id="task3", description="编写一个排序算法")
    ]
    
    for task in tasks:
        try:
            result = agent.execute_task(task)
            print(f"任务 {task.id} 完成")
        except Exception as e:
            print(f"任务 {task.id} 失败: {e}")
    
    # 生成性能报告
    report = agent.get_performance_report()
    print("\n性能报告:")
    for key, value in report.items():
        print(f"{key}: {value}")
```

## 📝 实践练习

### 练习 1：构建个人助手 Agent

```python
def build_personal_assistant():
    """构建个人助手 Agent"""
    
    class PersonalAssistant(RobustAgent):
        def __init__(self, llm_client):
            system_prompt = """
            你是一个个人助手，能够帮助用户处理日常任务：
            - 信息搜索和整理
            - 简单计算和数据处理
            - 文件管理
            - 代码编写和执行
            
            请友好、高效地完成用户的请求。
            """
            super().__init__("PersonalAssistant", llm_client, system_prompt)
            
            # 添加基础工具
            self.add_tool(WebSearchTool())
            self.add_tool(CalculatorTool())
            self.add_tool(FileOperationTool())
            self.add_tool(CodeExecutionTool())
    
    return PersonalAssistant(llm_client)

### 练习 2：多 Agent 协作系统

```python
class MultiAgentSystem:
    """多 Agent 协作系统"""
    
    def __init__(self, llm_client):
        self.agents = {
            "researcher": ResearchAgent(llm_client),
            "analyst": DataAnalysisAgent(llm_client),
            "coder": CodingAgent(llm_client)
        }
        self.coordinator = RobustAgent("Coordinator", llm_client)
    
    def execute_complex_task(self, task_description: str) -> Dict[str, Any]:
        """执行复杂任务（多 Agent 协作）"""
        
        # 第一步：任务分解
        decomposition_prompt = f"""
        复杂任务: {task_description}
        
        可用的专业 Agent:
        - researcher: 负责信息搜索和研究
        - analyst: 负责数据分析和处理
        - coder: 负责编程和代码实现
        
        请将任务分解为子任务，并分配给合适的 Agent。
        
        返回 JSON 格式：
        {{
            "subtasks": [
                {{
                    "agent": "agent_name",
                    "description": "子任务描述",
                    "priority": 1
                }}
            ]
        }}
        """
        
        response = self.coordinator.llm_client.chat([
            {"role": "user", "content": decomposition_prompt}
        ])
        
        # 解析任务分解结果
        subtasks_data = self.coordinator._parse_action(response)
        
        # 执行子任务
        results = {}
        for subtask in subtasks_data.get("subtasks", []):
            agent_name = subtask["agent"]
            if agent_name in self.agents:
                task = Task(
                    id=f"subtask_{len(results)}",
                    description=subtask["description"],
                    priority=subtask.get("priority", 1)
                )
                
                try:
                    result = self.agents[agent_name].execute_task(task)
                    results[agent_name] = result
                except Exception as e:
                    results[agent_name] = {"error": str(e)}
        
        return {
            "original_task": task_description,
            "subtasks_results": results,
            "coordination_success": len([r for r in results.values() if "error" not in r])
        }

# 使用示例
def multi_agent_example():
    system = MultiAgentSystem(llm_client)
    
    complex_task = """
    创建一个关于"机器学习在金融风控中的应用"的完整项目：
    1. 研究相关文献和案例
    2. 分析示例数据集
    3. 实现一个简单的风控模型
    4. 生成项目报告
    """
    
    result = system.execute_complex_task(complex_task)
    print("多 Agent 协作结果:", result)
```

## 📚 总结

本模块深入介绍了 LLM Agent 的构建技术，包括：

1. **架构设计**：从基础 Agent 到复杂的规划 Agent
2. **工具集成**：各种实用工具的实现和使用
3. **决策循环**：智能的任务规划和执行机制
4. **状态管理**：持久化和错误恢复机制
5. **性能优化**：并行处理、缓存和监控
6. **实战案例**：研究助手、数据分析、编程助手等

通过这些技能，同学们可以构建功能强大、稳定可靠的 LLM Agent 系统。

---

**下一步**：学习 [数学问题求解](./math-solver.md)，将 Agent 技术应用到具体的数学和科学计算场景中。
