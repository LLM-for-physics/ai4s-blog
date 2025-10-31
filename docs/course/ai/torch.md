# PyTorch 与深度学习

## 简介

PyTorch 是一个强大的深度学习框架，由 Facebook AI Research 开发。它的主要特点包括：

- **动态计算图**：可以在运行时动态构建计算图，使得调试更加直观
- **与 Python 深度集成**：语法简洁，易于学习和使用
- **丰富的生态系统**：拥有大量预训练模型和工具库

## 环境准备与安装

### 使用 Conda 安装

Conda 是一个强大的包管理器，特别适合管理深度学习环境。

#### 安装 Anaconda 或 Miniconda

如果还没有安装 conda，可以先安装 Miniconda（更轻量）：

```bash
# 下载 Miniconda 安装脚本
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh

# 运行安装脚本
bash Miniconda3-latest-Linux-x86_64.sh

# 重启终端或执行
source ~/.bashrc
```

#### 创建 conda 环境

```bash
# 创建新的 conda 环境
conda create -n pytorch_env python=3.10

# 激活环境
conda activate pytorch_env
```

#### 安装 PyTorch

**CPU 版本：**

```bash
conda install pytorch torchvision torchaudio cpuonly -c pytorch
```

**GPU 版本（需要 CUDA）：**

```bash
# CUDA 11.8 版本
conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia

# CUDA 12.1 版本
conda install pytorch torchvision torchaudio pytorch-cuda=12.1 -c pytorch -c nvidia
```

::: tip 提示
- 如果不确定使用哪个版本，可以访问 [PyTorch 官网](https://pytorch.org/get-started/locally/) 获取适合您系统的安装命令
- GPU 版本需要先安装对应版本的 CUDA 驱动
- 可以使用 `nvidia-smi` 命令查看 GPU 和 CUDA 信息
:::

#### 验证安装

```python
import torch

# 查看 PyTorch 版本
print(f"PyTorch 版本: {torch.__version__}")

# 检查 CUDA 是否可用
print(f"CUDA 是否可用: {torch.cuda.is_available()}")

# 如果有 GPU，查看 GPU 信息
if torch.cuda.is_available():
    print(f"GPU 数量: {torch.cuda.device_count()}")
    print(f"当前 GPU: {torch.cuda.get_device_name(0)}")
```

## 核心概念：张量 (Tensor)

张量（Tensor）是 PyTorch 中最基础的数据结构，类似于 NumPy 的 `array`，但具有更强大的功能。

### 创建张量

#### 从列表创建

```python
import torch

data = [[1, 2], [3, 4]]
x_data = torch.tensor(data)
print(x_data)
# tensor([[1, 2],
#         [3, 4]])
```

#### 从 NumPy 数组创建

```python
import numpy as np

np_array = np.array(data)
x_np = torch.from_numpy(np_array)
print(x_np)
```

#### 使用常用函数创建

```python
shape = (2, 3)

rand_tensor = torch.rand(shape)      # 随机张量，值在 [0, 1] 之间
ones_tensor = torch.ones(shape)      # 全为 1
zeros_tensor = torch.zeros(shape)    # 全为 0

print(f"随机张量: \n{rand_tensor}\n")
print(f"单位张量: \n{ones_tensor}\n")
print(f"零张量: \n{zeros_tensor}")
```

### 张量属性

```python
x_data = torch.tensor([[1, 2], [3, 4]])

# 形状
print(x_data.shape)  # torch.Size([2, 2])

# 数据类型
print(x_data.dtype)  # torch.int64

# 所在设备
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
x_data = x_data.to(device)
print(x_data.device)  # cuda:0 或 cpu
```

### 常用操作

#### 索引和切片

```python
rand_tensor = torch.rand(2, 3)

print(f"第一行: {rand_tensor[0]}")
print(f"第二列: {rand_tensor[:, 1]}")
```

#### 形状变换

```python
# 转置
print(rand_tensor.transpose(1, 0))

# 拼接
ones_tensor = torch.ones(2, 3)
print(torch.cat((rand_tensor, ones_tensor)))           # 按行拼接
print(torch.cat((rand_tensor, ones_tensor), dim=1))    # 按列拼接

# 堆叠（增加新维度）
print(torch.stack((rand_tensor, ones_tensor)))         # shape: (2, 2, 3)

# 增加维度
print(rand_tensor.unsqueeze(0).shape)   # (1, 2, 3)
print(rand_tensor.unsqueeze(-1).shape)  # (2, 3, 1)

# 展平
print(rand_tensor.flatten())            # shape: (6,)
```

#### 数据类型与设备转换

```python
ones_tensor = torch.ones(2, 3)

# 转换数据类型
float_tensor = ones_tensor.to(torch.float32)  # 或 ones_tensor.float()
bool_tensor = ones_tensor.to(torch.bool)      # 或 ones_tensor.bool()

# 转移到 GPU
if torch.cuda.is_available():
    gpu_tensor = ones_tensor.to("cuda:0")
    
# 转移回 CPU
cpu_tensor = gpu_tensor.to("cpu")  # 或 gpu_tensor.cpu()
```

## 自动微分机制

PyTorch 的自动微分功能是神经网络训练的核心。它可以自动计算梯度，无需手动推导。

### 基本用法

```python
# 创建需要计算梯度的张量
x = torch.linspace(0., 2., steps=25, requires_grad=True)

# 定义计算过程
w = torch.rand_like(x)
y = torch.sum(x * w)

# 反向传播计算梯度
y.backward()

# 查看梯度
print(x.grad)  # dy/dx = w
```

关键概念：
- `requires_grad=True`：标记该张量需要计算梯度
- `.backward()`：从标量开始反向传播计算梯度
- `.grad`：存储计算得到的梯度

## 构建神经网络

### 核心组件：nn.Module

所有神经网络模型都应该继承 `nn.Module` 类：

```python
from torch import nn

class Network(nn.Module):
    def __init__(self):
        super(Network, self).__init__()
        # 在这里定义网络层
        
    def forward(self, x):
        # 在这里定义前向传播逻辑
        return x
```

### 常用网络层

#### 线性层

```python
# 输入维度 32，输出维度 256
linear_layer = nn.Linear(32, 256)
```

#### 激活函数

```python
# ReLU: max(0, x)
relu = nn.ReLU()

# Sigmoid: 1 / (1 + e^(-x))
sigmoid = nn.Sigmoid()

# 其他激活函数
leaky_relu = nn.LeakyReLU()
gelu = nn.GELU()
```

#### 容器：Sequential

`nn.Sequential` 可以快速搭建简单的顺序模型：

```python
model = nn.Sequential(
    nn.Linear(28*28, 512),
    nn.ReLU(),
    nn.Linear(512, 512),
    nn.ReLU(),
    nn.Linear(512, 10)
)
```

### 完整网络示例

```python
class Network(nn.Module):
    """一个全连接神经网络"""
    def __init__(self, hidden_dim=128):
        super(Network, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(1, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim*2),
            nn.ReLU(),
            nn.Linear(hidden_dim*2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )
    
    def forward(self, x):
        return self.network(x)

# 创建模型实例
model = Network(hidden_dim=128)

# 查看模型参数
for param in model.parameters():
    print(param.shape)
```

## 数据处理

### Dataset 类

自定义数据集需要继承 `torch.utils.data.Dataset` 并实现三个方法：

```python
from torch.utils.data import Dataset

class FunctionDataset(Dataset):
    """一个动态生成数据的 Dataset"""
    def __init__(self, func, x_range=(-10, 10), n_samples=10000):
        self.func = func
        self.x_range = x_range
        self.n_samples = n_samples
    
    def __len__(self):
        """返回数据集大小"""
        return self.n_samples
    
    def __getitem__(self, idx):
        """获取单个数据样本"""
        x_val = (self.x_range[1] - self.x_range[0]) * np.random.rand() + self.x_range[0]
        y_val = self.func(x_val)
        
        x = torch.tensor([x_val], dtype=torch.float32)
        y = torch.tensor([y_val], dtype=torch.float32)
        
        return x, y
```

### DataLoader 类

`DataLoader` 将 `Dataset` 包装成可迭代对象，提供批量加载、随机打乱等功能：

```python
from torch.utils.data import DataLoader

BATCH_SIZE = 512
dataset = FunctionDataset(target_function, n_samples=20000)
dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

# 迭代数据
for x_batch, y_batch in dataloader:
    # x_batch.shape: (512, 1)
    # y_batch.shape: (512, 1)
    pass
```

## 模型训练流程

### 定义超参数

```python
import torch.optim as optim

# 超参数
LEARNING_RATE = 1e-3  # 学习率
BATCH_SIZE = 512      # 批量大小
EPOCHS = 200          # 训练轮数

# 设备选择
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")
```

### 初始化组件

```python
# 准备数据
train_dataset = FunctionDataset(target_function, n_samples=20000)
train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)

# 初始化模型
model = Network(hidden_dim=128).to(device)

# 损失函数（均方误差）
criterion = nn.MSELoss()

# 优化器（Adam）
optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
```

常用损失函数：
- `nn.MSELoss()`：均方误差，用于回归任务
- `nn.CrossEntropyLoss()`：交叉熵，用于分类任务
- `nn.L1Loss()`：平均绝对误差

常用优化器：
- `optim.SGD()`：随机梯度下降
- `optim.Adam()`：自适应学习率优化器（最常用）
- `optim.LBFGS()`：二阶优化方法

### 训练循环

```python
print("Starting training...")

for epoch in range(EPOCHS):
    epoch_loss = 0.0
    
    for x_batch, y_batch in train_loader:
        # 1. 将数据移到指定设备
        x_batch, y_batch = x_batch.to(device), y_batch.to(device)
        
        # 2. 前向传播
        y_pred = model(x_batch)
        
        # 3. 计算损失
        loss = criterion(y_pred, y_batch)
        
        # 4. 清空梯度
        optimizer.zero_grad()
        
        # 5. 反向传播
        loss.backward()
        
        # 6. 更新参数
        optimizer.step()
        
        epoch_loss += loss.item()
    
    # 打印平均损失
    avg_loss = epoch_loss / len(train_loader)
    if (epoch + 1) % 10 == 0:
        print(f"Epoch {epoch+1}/{EPOCHS}, Average Loss: {avg_loss:.6f}")

print("Training finished!")
```

训练循环的关键步骤：
1. **清空梯度**：`optimizer.zero_grad()` - PyTorch 默认会累积梯度，需要手动清零
2. **前向传播**：`y_pred = model(x_batch)` - 计算预测值
3. **计算损失**：`loss = criterion(y_pred, y_batch)` - 评估预测与真实值的差距
4. **反向传播**：`loss.backward()` - 计算梯度
5. **更新参数**：`optimizer.step()` - 根据梯度更新模型参数

### 模型评估

```python
# 切换到评估模式
model.eval()

# 禁用梯度计算
with torch.no_grad():
    x_test = torch.linspace(-10, 10, 1000).view(-1, 1).to(device)
    y_pred = model(x_test)
    
# 可视化结果
import matplotlib.pyplot as plt

plt.figure(figsize=(10, 6))
plt.plot(x_test.cpu().numpy(), y_pred.cpu().numpy(), label='Prediction')
plt.plot(x_test.cpu().numpy(), target_function(x_test.cpu().numpy()), label='True Function')
plt.legend()
plt.show()
```

## 综合实例：函数拟合

下面是一个完整的函数拟合示例，演示了从数据准备到模型训练的全流程。

### 定义目标函数

```python
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset
import torch.optim as optim

def target_function(x):
    """目标函数：sin(x/2) + e^(-0.1*x^2)*cos(5x)"""
    return np.sin(x / 2) + np.exp(-0.1 * x**2) * np.cos(5 * x)

def noisy_target_function(x):
    """添加噪声的目标函数"""
    return target_function(x) + 0.1 * np.random.randn()
```

### 准备数据集

```python
class FunctionDataset(Dataset):
    def __init__(self, func, x_range=(-10, 10), n_samples=10000):
        self.func = func
        self.x_range = x_range
        self.n_samples = n_samples
    
    def __len__(self):
        return self.n_samples
    
    def __getitem__(self, idx):
        x_val = (self.x_range[1] - self.x_range[0]) * np.random.rand() + self.x_range[0]
        y_val = self.func(x_val)
        
        x = torch.tensor([x_val], dtype=torch.float32)
        y = torch.tensor([y_val], dtype=torch.float32)
        
        return x, y
```

### 定义网络

```python
class Network(nn.Module):
    def __init__(self, hidden_dim=128):
        super(Network, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(1, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim*2),
            nn.ReLU(),
            nn.Linear(hidden_dim*2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )
    
    def forward(self, x):
        return self.network(x)
```

### 训练模型

```python
# 设置超参数
LEARNING_RATE = 1e-3
BATCH_SIZE = 512
EPOCHS = 200
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 准备数据
train_dataset = FunctionDataset(noisy_target_function, n_samples=20000)
train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)

# 初始化模型、损失函数和优化器
model = Network(hidden_dim=128).to(device)
criterion = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

# 训练循环
for epoch in range(EPOCHS):
    epoch_loss = 0.0
    for x_batch, y_batch in train_loader:
        x_batch, y_batch = x_batch.to(device), y_batch.to(device)
        
        y_pred = model(x_batch)
        loss = criterion(y_pred, y_batch)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        epoch_loss += loss.item()
    
    if (epoch + 1) % 10 == 0:
        avg_loss = epoch_loss / len(train_loader)
        print(f"Epoch {epoch+1}/{EPOCHS}, Loss: {avg_loss:.6f}")
```

### 可视化结果

```python
import matplotlib.pyplot as plt

# 生成测试数据
x_test = torch.linspace(-10, 10, 1000).view(-1, 1).to(device)
y_true = target_function(x_test.cpu().numpy())

# 模型预测
model.eval()
with torch.no_grad():
    y_pred = model(x_test).cpu().numpy()

# 绘图
plt.figure(figsize=(12, 6))
plt.plot(x_test.cpu().numpy(), y_true, label='True Function', linewidth=2)
plt.plot(x_test.cpu().numpy(), y_pred, label='Model Prediction', linestyle='--', linewidth=2)
plt.xlabel('x')
plt.ylabel('y')
plt.legend()
plt.title('Function Fitting with Neural Network')
plt.grid(True)
plt.show()
```

通过这个示例，我们可以看到神经网络如何学习拟合一个复杂的非线性函数。即使目标函数包含多个组成部分（sin、cos、指数函数），神经网络也能通过训练很好地逼近它。

## 小结

本教程介绍了 PyTorch 的核心概念和基本用法：

1. **张量（Tensor）**：PyTorch 的基础数据结构
2. **自动微分**：自动计算梯度的机制
3. **神经网络构建**：使用 `nn.Module` 定义模型
4. **数据处理**：使用 `Dataset` 和 `DataLoader` 管理数据
5. **训练流程**：包括前向传播、损失计算、反向传播和参数更新

掌握这些基础知识后，你就可以开始构建自己的深度学习模型了。
