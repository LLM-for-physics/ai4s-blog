# Python 开发环境

## 概述

本文档详细介绍了服务器上预配置的 Python 开发环境的使用方法。我们为所有用户提供了一个统一的公共 Python 虚拟环境 `pubpy`，该环境基于 Python 3.13 构建，预装了人工智能和科学计算相关的核心库。

## 环境信息

- **环境名称**: `pubpy`
- **Python 版本**: 3.13
- **管理工具**: Conda
- **适用场景**: AI 开发、科学计算、数据分析

### 快速开始

通过以下命令来配置 conda；以后每次打开终端都可以直接使用 conda 命令
```bash
# 永久配置 conda，修改 shell 配置文件
eval "$(/opt/miniconda/bin/conda shell.bash hook)"
conda init
# 重新加载 shell 配置或重启终端
source ~/.bashrc
conda activate pubpy
```

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

测试 torch 是否已安装以及 cuda 是否可用
```bash
python3 -c "import torch; print(f'PyTorch版本: {torch.__version__}'); print(f'CUDA可用: {torch.cuda.is_available()}'); print(f'CUDA设备数量: {torch.cuda.device_count()}' if torch.cuda.is_available() else 'CUDA不可用')"
```
期待输出
```
PyTorch版本: 2.6.0+cu124
CUDA可用: True
CUDA设备数量: 10
```

## 预装软件包

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
4. 选择 `pubpy` 环境对应的 Python 解释器

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

> ⚠️ **注意**: 这是一个共享环境，你可以 pip install 将一些依赖安装在自己用户目录下，但是没有 sudo 权限，不会影响共享环境。

> 💡 **提示**: 如需安装额外的包，请联系课程团队或助教，或在个人目录下创建独立的虚拟环境。

### 最佳实践

1. **环境激活**: 每次开始工作前都要激活 `pubpy` 环境
2. **代码管理**: 将个人代码保存在自己的用户目录下
3. **资源使用**: 合理使用计算资源，避免长时间占用
4. **版本兼容**: 编写代码时注意包版本兼容性

### 获取帮助

如遇到其他问题，请：
1. 查看系统日志和错误信息
2. 联系技术支持团队 [FAQ](../resources/faq)
