# Python 开发环境

本文适用于 **2026 秋学期**。请先按[服务器使用指南](/setup/server)完成公钥提交、SSH 登录和服务器分配信息核对，再在自己分配到的服务器上使用开发环境。

::: tip 版本和输出以当前服务器为准
本页沿用原教程的操作、示例和软件包表格。Python 3.13、表格中的软件包版本，以及下方 CUDA 可用和设备数量为 10 的输出，都是原教程的环境记录或示例，不代表 2026 年三台服务器的当前配置。请在分配到的服务器上运行 `python --version`、`conda list` 和相应检查命令，以实际结果为准。
:::

## 概述

本文档介绍服务器上公共 Python 虚拟环境 `pubpy` 的使用方法。环境位于 `/opt/miniconda/envs/pubpy`，由管理员维护，用于课程的人工智能和科学计算练习；具体 Python 版本和已安装依赖请通过下面的命令核对。

## 环境信息

- **环境名称**: `pubpy`
- **Python 版本**: 运行 `python --version` 确认；原教程示例为 3.13
- **管理工具**: Conda
- **适用场景**: AI 开发、科学计算、数据分析

### 快速开始

下面的命令在**登录后的服务器 Bash 终端**中执行，VS Code 的远端终端也适用。首次使用时，若 `conda` 尚未初始化，可以运行：

```bash
# 让当前 Bash 会话可以使用 Conda
eval "$(/opt/miniconda/bin/conda shell.bash hook)"
# 将初始化配置写入自己的 ~/.bashrc
conda init bash
# 在当前终端进入课程环境
conda activate pubpy
```

之后重新连接或新开 Bash 终端即可加载 Conda，无需重复初始化；使用课程环境前仍需确认已激活 `pubpy`。是否自动显示 `(base)` 取决于配置，可运行 `conda env list` 检查已有环境。

### 激活虚拟环境

在开始任何开发工作之前，请先激活预配置的虚拟环境：

```bash
conda activate pubpy
```

### 验证环境

激活环境后，可以通过以下命令验证环境是否正确配置：

```bash
# 检查 Python 版本
python --version

# 检查已安装的包
conda list

# 测试核心库导入
python -c "import numpy, matplotlib, openai, anthropic; print('环境配置正确')"
```

检查当前环境是否已安装 PyTorch，以及 CUDA 是否可用：

```bash
python -c "import torch; print(f'PyTorch版本: {torch.__version__}'); print(f'CUDA可用: {torch.cuda.is_available()}'); print(f'CUDA设备数量: {torch.cuda.device_count()}' if torch.cuda.is_available() else 'CUDA不可用')"
```
原教程示例输出如下。当前版本、CUDA 可用状态和设备数量以分配服务器的实际结果为准；如提示缺少依赖，请联系助教确认课程环境。

```text
PyTorch版本: 2.6.0+cu124
CUDA可用: True
CUDA设备数量: 10
```

## 预装软件包

以下保留原教程的软件包与版本记录，便于了解用途；它不是当前服务器的软件清单或 2026 年固定版本要求。请使用 `conda list` 核对当前环境，课程指定版本以本学期要求为准。

### 核心计算库

| 包名 | 版本 | 用途 |
|------|------|------|
| numpy | 2.3.2 | 数值计算基础库 |
| scipy | 1.16.1 | 科学计算扩展库 |
| sympy | >= 1.13.1 | 符号数学计算 |
| matplotlib | 3.10.6 | 数据可视化库 |

### AI/ML 相关库

| 包名 | 版本 | 用途 |
|------|------|------|
| openai | 1.106.1 | OpenAI API 客户端 |
| anthropic | 0.66.0 | Anthropic API 客户端 |
| langchain | 0.3.27 | LangChain 核心框架 |
| langchain_openai | 0.3.33 | LangChain OpenAI 集成 |
| langchain_anthropic | 0.3.20 | LangChain Anthropic 集成 |
| langgraph | 0.6.7 | LangChain 图形化工作流 |
| chainlit | 2.8.0 | 对话式 AI 应用框架 |
| pytorch | 2.6.0+cu124 | 深度学习库 |

### 开发工具

| 包名 | 版本 | 用途 |
|------|------|------|
| ipykernel | 6.29.5 | Jupyter 内核支持 |
| flask | 3.1.2 | Web 应用框架 |
| aiohttp | 3.12.15 | 异步 HTTP 客户端/服务器 |
| python-dotenv | >= 1.1.0 | 环境变量加载工具 |

## 使用指南

### 在 Jupyter Notebook 中使用

1. 启动 Jupyter Notebook 或 JupyterLab
2. 创建新的 notebook 时选择 `pubpy` 内核
3. 开始编写代码

### 在 VSCode 中使用

1. 打开 VSCode 并连接到服务器
2. 在 Python 文件中按 `Ctrl+Shift+P` 打开命令面板
3. 选择 "Python: Select Interpreter"
4. 选择 `pubpy` 环境对应的 Python 解释器；若列表中没有显示，可选择输入解释器路径并填写 `/opt/miniconda/envs/pubpy/bin/python`

### 示例代码

以下是一个简单的测试示例，验证环境配置：

```python
import numpy as np
import matplotlib.pyplot as plt
import openai
from anthropic import Anthropic

# 测试 numpy
arr = np.array([1, 2, 3, 4, 5])
print(f"NumPy 数组: {arr}")
print(f"数组平均值: {np.mean(arr)}")

# 测试 matplotlib
x = np.linspace(0, 2*np.pi, 100)
y = np.sin(x)
plt.figure(figsize=(8, 4))
plt.plot(x, y)
plt.title("正弦函数图像")
plt.xlabel("x")
plt.ylabel("sin(x)")
plt.grid(True)
plt.savefig("test_plot.png", dpi=150, bbox_inches='tight')
plt.close()
print("图像已保存为 test_plot.png")

# 验证 AI 库导入
print("OpenAI 库版本:", openai.__version__)
print("Anthropic 库已成功导入")

print("✅ 开发环境配置验证完成")
```

## 注意事项

### 重要提醒

> ⚠️ **注意**: `pubpy` 是管理员维护的共享环境，请不要直接在其中运行 `pip install` 或 `conda install` 修改依赖。安装到用户目录的包也可能改变 Python 实际加载的版本，不能以没有 `sudo` 权限来判断是否会影响环境。

> 💡 **提示**: 如需额外依赖，请联系课程团队或助教；也可以在自己的目录中创建独立虚拟环境，确认已切换到该个人环境后再安装。VS Code 解释器和 Notebook 内核也应选为对应的个人环境。

### 最佳实践

1. **环境激活**: 每次开始工作前都要激活 `pubpy` 环境
2. **代码管理**: 将个人代码保存在自己的用户目录下
3. **资源使用**: 合理使用计算资源，避免长时间占用
4. **版本兼容**: 编写代码时注意包版本兼容性

### 获取帮助

如遇到其他问题，请：
1. 查看系统日志和错误信息
2. 通过[课程首页的联系方式](/)联系助教或任课教师
