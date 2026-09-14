# 1. 导入必要的工具包
# ChatOpenAI 是 LangChain 用来连接符合 OpenAI 标准接口的模型
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()


class Config:
    API_KEY = os.getenv("OPENAI_API_KEY")
    BASE_URL = os.getenv("OPENAI_BASE_URL")
    MODEL = os.getenv("MODEL")


llm = ChatOpenAI(
    openai_api_base=Config.BASE_URL, openai_api_key=Config.API_KEY, model=Config.MODEL
)

# 2. 初始化模型 (配置"大脑")
# 这里我们配置了三个关键参数：
# - openai_api_base: 告诉 LangChain 去连什么服务器
# - openai_api_key: 你的通行证
# - model: 我们用的 模型


# 3. 直接调用模型
# invoke 就是"调用"的意思，我们发给它一句话
print("正在思考中...")
response = llm.invoke("你好！请用鲁迅的语气夸《物理与人工智能课程》。")

# 4. 打印结果
# response.content 才是模型真正回复的内容
print("--- 回复内容 ---")
print(response.content)
