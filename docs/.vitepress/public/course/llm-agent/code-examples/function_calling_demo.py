"""
OpenAI Function Calling 简单示例
演示如何使用 Function Calling 实现天气查询功能
"""

import os
import json
from typing import Dict, Any
from dotenv import load_dotenv
from openai import OpenAI

# 加载环境变量
load_dotenv()


def get_weather(location: str, unit: str = "celsius") -> Dict[str, Any]:
    """
    获取指定地点的天气信息（模拟函数）
    
    Args:
        location: 城市名称，如 "北京" 或 "Beijing, China"
        unit: 温度单位，"celsius" 或 "fahrenheit"
    
    Returns:
        包含天气信息的字典
    """
    # 这里是模拟数据，实际应用中应该调用真实的天气 API
    mock_weather_data = {
        "北京": {"temperature": 15, "condition": "晴天", "humidity": 45},
        "上海": {"temperature": 18, "condition": "多云", "humidity": 60},
        "广州": {"temperature": 25, "condition": "小雨", "humidity": 80},
        "深圳": {"temperature": 24, "condition": "阴天", "humidity": 70},
        "Beijing": {"temperature": 15, "condition": "Sunny", "humidity": 45},
        "Shanghai": {"temperature": 18, "condition": "Cloudy", "humidity": 60},
    }
    
    # 简单的地点匹配
    weather = mock_weather_data.get(location, {
        "temperature": 20, 
        "condition": "未知", 
        "humidity": 50
    })
    
    # 温度单位转换
    if unit == "fahrenheit":
        weather["temperature"] = weather["temperature"] * 9/5 + 32
        weather["unit"] = "°F"
    else:
        weather["unit"] = "°C"
    
    return {
        "location": location,
        "temperature": weather["temperature"],
        "condition": weather["condition"],
        "humidity": weather["humidity"],
        "unit": weather["unit"]
    }


class WeatherAgent:
    """天气查询代理 - 使用 Function Calling"""
    
    def __init__(self, api_key: str = None, base_url: str = None):
        """初始化天气代理"""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        
        # 定义可用的工具
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "获取指定地点的当前天气信息",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {
                                "type": "string",
                                "description": "城市名称，如 '北京' 或 'Beijing, China'"
                            },
                            "unit": {
                                "type": "string",
                                "enum": ["celsius", "fahrenheit"],
                                "description": "温度单位，默认为摄氏度"
                            }
                        },
                        "required": ["location"]
                    }
                }
            }
        ]
    
    def query_weather(self, user_question: str) -> Dict[str, Any]:
        """
        处理用户的天气查询请求
        
        Args:
            user_question: 用户的自然语言问题
            
        Returns:
            包含查询结果的字典
        """
        try:
            # 步骤1: 构建对话消息
            messages = [
                {
                    "role": "system", 
                    "content": "你是一个天气助手。用户询问天气时，请使用 get_weather 函数获取信息，然后用友好的方式回答。"
                },
                {
                    "role": "user", 
                    "content": user_question
                }
            ]
            
            # 步骤2: 调用 OpenAI API，让模型决定是否使用工具
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=messages,
                tools=self.tools,
                tool_choice="auto"  # 让模型自动决定是否调用工具
            )
            
            response_message = response.choices[0].message
            
            # 步骤3: 检查是否有工具调用
            if response_message.tool_calls:
                # 将 assistant 的消息添加到对话历史
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
                
                # 步骤4: 执行工具调用
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    print(f"🔧 调用工具: {function_name}")
                    print(f"📋 参数: {function_args}")
                    
                    # 执行对应的函数
                    if function_name == "get_weather":
                        result = get_weather(**function_args)
                    else:
                        result = {"error": f"未知的函数: {function_name}"}
                    
                    # 将工具执行结果添加到对话
                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": json.dumps(result, ensure_ascii=False)
                    })
                
                # 步骤5: 获取最终回答
                final_response = self.client.chat.completions.create(
                    model="gpt-5",
                    messages=messages
                )
                
                return {
                    "success": True,
                    "question": user_question,
                    "answer": final_response.choices[0].message.content,
                    "tool_used": True,
                    "tool_results": [json.loads(msg["content"]) for msg in messages if msg["role"] == "tool"]
                }
            
            else:
                # 没有工具调用，直接返回模型回答
                return {
                    "success": True,
                    "question": user_question,
                    "answer": response_message.content,
                    "tool_used": False
                }
                
        except Exception as e:
            return {
                "success": False,
                "question": user_question,
                "error": str(e)
            }


def demo():
    """演示函数"""
    print("🌤️  天气查询 Function Calling 演示")
    print("=" * 50)
    
    # 初始化天气代理
    agent = WeatherAgent()
    
    # 测试问题
    test_questions = [
        "北京今天天气怎么样？",
        "上海的温度是多少度？",
        "广州现在下雨吗？",
        "请告诉我深圳的天气情况，用华氏度显示温度",
        "你好，我想了解一下人工智能"  # 这个问题不会触发工具调用
    ]
    
    for i, question in enumerate(test_questions, 1):
        print(f"\n❓ 问题 {i}: {question}")
        print("-" * 30)
        
        result = agent.query_weather(question)
        
        if result["success"]:
            print(f"✅ 回答: {result['answer']}")
            
            if result["tool_used"]:
                print(f"🔧 使用了工具调用")
                for tool_result in result["tool_results"]:
                    print(f"📊 工具结果: {tool_result}")
            else:
                print("💬 直接回答，未使用工具")
        else:
            print(f"❌ 错误: {result['error']}")
        
        print("=" * 50)


if __name__ == "__main__":
    demo()
