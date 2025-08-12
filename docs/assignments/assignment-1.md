# 作业1：基础概念与Python实践

**发布时间**: 第2周  
**截止时间**: 第4周周日 23:59  
**权重**: 15%

## 📋 作业概述

本次作业旨在帮助你熟悉Python科学计算环境，掌握基本的数据处理和可视化技能，为后续的机器学习课程打下坚实基础。

## 🎯 学习目标

完成本作业后，你将能够：
- 熟练使用Python进行科学计算
- 掌握NumPy和Pandas的基本操作
- 创建高质量的数据可视化图表
- 理解基本的统计概念
- 编写清晰、可读的代码

## 📝 作业内容

### 任务1：Python环境配置 (10分)

**要求**:
1. 配置完整的Python科学计算环境
2. 安装必需的库：numpy, pandas, matplotlib, seaborn, scipy
3. 创建虚拟环境并生成requirements.txt
4. 编写环境验证脚本

**提交物**:
- `environment_check.py` - 环境验证脚本
- `requirements.txt` - 依赖包列表
- `setup_report.md` - 配置过程报告

**评分标准**:
- 环境配置正确性 (50%)
- 验证脚本完整性 (30%)
- 文档清晰度 (20%)

### 任务2：NumPy数组操作 (20分)

**要求**:
实现以下NumPy操作并分析性能：

```python
# 需要完成的操作示例
import numpy as np

# 1. 创建不同类型的数组
def create_arrays():
    """创建各种类型的数组"""
    pass

# 2. 数组运算
def array_operations():
    """实现数组的基本运算"""
    pass

# 3. 线性代数运算
def linear_algebra():
    """矩阵运算和线性代数"""
    pass

# 4. 性能对比
def performance_comparison():
    """对比NumPy与纯Python的性能"""
    pass
```

**提交物**:
- `numpy_exercises.ipynb` - 主要练习notebook
- `numpy_utils.py` - 工具函数
- 性能对比报告

**评分标准**:
- 代码正确性 (60%)
- 性能分析质量 (25%)
- 代码风格和注释 (15%)

### 任务3：数据处理与分析 (30分)

**数据集**: [物理实验数据](https://course-data.university.edu/physics_lab.csv)

**要求**:
1. 数据加载和基本信息探索
2. 数据清洗（处理缺失值、异常值）
3. 统计分析（描述性统计、相关性分析）
4. 分组聚合操作

```python
import pandas as pd
import numpy as np

# 示例任务结构
def load_and_explore_data():
    """加载数据并进行基本探索"""
    pass

def clean_data():
    """数据清洗"""
    pass

def statistical_analysis():
    """统计分析"""
    pass

def advanced_operations():
    """高级数据操作"""
    pass
```

**提交物**:
- `data_analysis.ipynb` - 数据分析notebook
- `cleaned_data.csv` - 清洗后的数据
- 数据质量报告

**评分标准**:
- 数据探索完整性 (25%)
- 清洗方法合理性 (25%)
- 统计分析准确性 (30%)
- 结果解释清晰度 (20%)

### 任务4：数据可视化 (25分)

**要求**:
使用matplotlib和seaborn创建高质量的可视化图表：

1. **基础图表**:
   - 散点图、线图、柱状图
   - 直方图、箱线图
   - 热力图

2. **高级可视化**:
   - 子图布局
   - 多变量关系图
   - 自定义样式

3. **物理主题图表**:
   - 实验数据拟合曲线
   - 误差棒图
   - 3D可视化

**提交物**:
- `visualization.ipynb` - 可视化notebook
- `figures/` - 生成的图表文件夹
- 可视化设计说明

**评分标准**:
- 图表类型选择合理性 (30%)
- 视觉设计质量 (25%)
- 代码组织清晰度 (25%)
- 创新性和美观度 (20%)

### 任务5：综合应用 (15分)

**物理应用场景**: 
分析简谐振动实验数据，包括：
1. 振幅随时间的变化
2. 频率分析
3. 阻尼系数计算
4. 理论模型拟合

**提交物**:
- `physics_application.ipynb` - 综合应用notebook
- 物理原理解释文档
- 结果与理论的对比分析

**评分标准**:
- 物理概念理解 (40%)
- 数据分析准确性 (30%)
- 理论结合程度 (20%)
- 结论合理性 (10%)

## 📚 参考资源

### 必读材料
- [NumPy官方教程](https://numpy.org/doc/stable/user/quickstart.html)
- [Pandas用户指南](https://pandas.pydata.org/pandas-docs/stable/user_guide/)
- [Matplotlib教程](https://matplotlib.org/stable/tutorials/index.html)

### 推荐阅读
- 《Python数据科学手册》第2-4章
- 《利用Python进行数据分析》第4-9章

### 在线资源
- [DataCamp Python课程](https://www.datacamp.com/courses/intro-to-python-for-data-science)
- [Kaggle Learn Python](https://www.kaggle.com/learn/python)

## 🛠️ 技术要求

### 开发环境
- Python 3.9+
- Jupyter Notebook/Lab
- 推荐使用Anaconda发行版

### 必需库
```txt
numpy>=1.21.0
pandas>=1.3.0
matplotlib>=3.4.0
seaborn>=0.11.0
scipy>=1.7.0
jupyter>=1.0.0
```

### 代码规范
- 遵循PEP 8编码规范
- 使用有意义的变量名
- 添加必要的注释和文档字符串
- 保持代码整洁和可读性

## 📤 提交要求

### 文件结构
```
assignment_1_姓名_学号/
├── README.md
├── environment_check.py
├── requirements.txt
├── setup_report.md
├── notebooks/
│   ├── numpy_exercises.ipynb
│   ├── data_analysis.ipynb
│   ├── visualization.ipynb
│   └── physics_application.ipynb
├── src/
│   └── numpy_utils.py
├── data/
│   ├── physics_lab.csv
│   └── cleaned_data.csv
├── figures/
│   └── (生成的图表)
└── report.pdf
```

### 提交方式
1. 将所有文件打包为zip格式
2. 命名为：`assignment_1_姓名_学号.zip`
3. 上传到课程管理系统
4. 确认提交成功

## ⏰ 时间安排建议

| 任务 | 建议时间 | 完成时间 |
|------|----------|----------|
| 环境配置 | 2小时 | 第2周末 |
| NumPy练习 | 4小时 | 第3周前半 |
| 数据分析 | 6小时 | 第3周后半 |
| 可视化 | 5小时 | 第4周前半 |
| 综合应用 | 4小时 | 第4周后半 |
| 报告撰写 | 3小时 | 提交前 |

## 🔍 评分细则

| 评分项目 | 权重 | 评分标准 |
|----------|------|----------|
| 环境配置 | 10% | 配置正确性、文档完整性 |
| NumPy操作 | 20% | 代码正确性、性能分析 |
| 数据处理 | 30% | 分析质量、方法合理性 |
| 数据可视化 | 25% | 图表质量、设计美观性 |
| 综合应用 | 15% | 物理理解、理论结合 |

### 加分项
- 代码优化和创新 (+5%)
- 额外的探索和实验 (+3%)
- 优秀的可视化设计 (+2%)

### 扣分项
- 代码无法运行 (-20%)
- 缺少关键文件 (-10%)
- 严重的代码质量问题 (-5%)

## 🆘 获取帮助

### 答疑时间
- **时间**: 每周三、五 15:00-17:00
- **地点**: 实验楼301或在线会议
- **方式**: 现场答疑或预约在线答疑

### 在线资源
- [课程论坛](https://forum.university.edu/ai4s)
- [作业FAQ](https://wiki.university.edu/ai4s/assignment1-faq)
- 课程微信群

### 联系方式
- **助教邮箱**: ai4s-ta@university.edu
- **课程邮箱**: ai4s-course@university.edu

## 📈 学习提示

::: tip 起步建议
如果你是Python初学者，建议先完成基础教程，再开始作业。可以参考[Python官方教程](https://docs.python.org/3/tutorial/)。
:::

::: info 调试技巧
遇到代码问题时，善用print语句和Jupyter的调试功能。学会阅读错误信息，这是编程的重要技能。
:::

::: warning 时间管理
不要等到最后一刻才开始。每个任务都需要时间思考和调试，建议分阶段完成。
:::

---

*祝你在第一次作业中取得好成绩！记住，重要的不仅是完成任务，更是在过程中学到的知识和技能。*
