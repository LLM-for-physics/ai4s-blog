# 课程讲义

2026 年秋课程讲义与课堂示例，提供 PDF 阅读和材料下载。

## 第 1 周（9 月 7 日）

### 课堂讲义

- [人工智能概览（PDF）](/slides/2026-fall/1-1、人工智能概览.pdf)
- [大语言模型概览（PDF）](/slides/2026-fall/1-2、大语言模型概览.pdf)

### 自学材料

- [Python 基础（PDF）](/slides/2026-fall/1-自1、python基础.pdf)
- [数学基础（PDF）](/slides/2026-fall/1-自2、数学基础.pdf)

## 第 2 周（9 月 14 日）

### 课堂讲义

- [大语言模型应用入门（PDF）](/slides/2026-fall/2-3、大语言模型应用入门.pdf)

### 课堂示例

- <a href="/slides/2026-fall/lesson-2/lesson1.py" download="lesson1.py">lesson1.py：单次模型调用</a>
- <a href="/slides/2026-fall/lesson-2/lesson2.py" download="lesson2.py">lesson2.py：多轮对话</a>
- <a href="/slides/2026-fall/lesson-2/env.example.txt" download="env.example.txt">环境配置示例（env.example.txt）</a>

将示例代码和配置示例放在同一文件夹中，把 `env.example.txt` 重命名为 `.env`，将 `OPENAI_API_KEY` 和 `MODEL` 分别替换为自己的课程网关 API key 和网关中实际可用的模型名称。网关地址与模型以 [LLM 网关说明](/course/llm-gateway) 为准。

安装依赖后，可分别运行两个示例：

```bash
python -m pip install python-dotenv langchain-openai
python lesson1.py
python lesson2.py
```

历史资料请访问 [2025 秋归档](https://aiphy.pku.edu.cn/archive/2025-fall/)。
