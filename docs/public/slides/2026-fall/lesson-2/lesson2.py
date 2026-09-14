import os

# 2. 初始化模型 (配置和之前一样)
from dotenv import load_dotenv

# 导入三种消息类型
# SystemMessage: 系统指令 (比如：你是一个猫娘...)
# HumanMessage: 用户说的话
# AIMessage: AI 回复的话
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

load_dotenv()


class Config:
    API_KEY = os.getenv("OPENAI_API_KEY")
    BASE_URL = os.getenv("OPENAI_BASE_URL")
    MODEL = os.getenv("MODEL")


llm = ChatOpenAI(
    openai_api_base=Config.BASE_URL, openai_api_key=Config.API_KEY, model=Config.MODEL
)

# 3. 初始化"记忆条"
# 我们用一个列表来保存所有的对话历史
# 先给它定个调子：你是一个资深的 Python 助教
messages = [SystemMessage(content="你是一个幽默的 Python 助教，说话喜欢带点 emoji。")]

print("🤖 助教已上线！(输入 'exit' 退出)")

# 4. 开启循环对话
while True:
    # 获取用户输入
    user_input = input("\n👤 你: ")

    # 如果输入 exit 就结束
    if user_input.lower() == "exit":
        print("再见！")
        break

    # A. 把用户说的话，包装成 HumanMessage，存入记忆列表
    messages.append(HumanMessage(content=user_input))

    # B. 把整个记忆列表 (包含之前的对话) 发给 AI
    print("Thinking...")
    response = llm.invoke(messages)

    # C. 打印 AI 的回复
    ai_reply = response.content
    print(f"🤖 助教: {ai_reply}")

    # D. 关键一步：把 AI 的回复也存入记忆列表
    messages.append(AIMessage(content=ai_reply))
