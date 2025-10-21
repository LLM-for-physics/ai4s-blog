# 作业3：使用 PINN 求解泊松方程

**发布时间**: 第6周  
**截止时间**: 11月9日 23:59  
**权重**: 10%  

## 📋 作业概述

本次作业要求同学们使用物理信息神经网络（PINN）求解三维空间中的泊松方程，理解如何将微分方程约束表示为 loss function，来求解微分方程。

**问题描述**：在立方体区域 $[-1,1]^3$ 中求解泊松方程

$$\nabla^2 \phi = -\rho(x,y,z)$$

其中电荷密度为 $\rho(x,y,z) = 100xyz^2$，边界条件为 $\phi = 0$。

## 🎯 作业要求

### 基本任务
1. **编写训练代码**：基于骨架代码实现 PINN 模型和训练流程
2. **求解泊松方程**：使用神经网络求解指定的边值问题
3. **可视化结果**：保存训练曲线和电势分布图
4. **验证准确性**：测试边界条件和 PDE 残差

### 提交内容
1. **代码文件**：`train.py`（训练代码）、可选的测试/可视化代码
2. **README.md**：简述实现思路、展示训练曲线和可视化结果、误差分析、实验结论
3. **模型文件**：训练好的 `pinn.pth`
4. **提交位置**：`~/assignments/assignment3/` 目录下

## 💡 关键技术提示

### 1. 模型架构设计
```python
class PINN(nn.Module):
    def __init__(self, input_dim, hidden_dim, output_dim):
        # 输入: (x, y, z) -> 输出: φ
```
- **隐藏层数**：建议 3-5 层
- **神经元数**：建议 128-512
- **激活函数**：`tanh` 适合光滑解，也可尝试 `sin` 或其他

### 2. 损失函数设计
总损失由两部分组成：
$$\mathcal{L} = \mathcal{L}_{\text{boundary}} + \beta \cdot \mathcal{L}_{\text{PDE}}$$

- **边界损失**：$\mathcal{L}_{\text{boundary}} = \frac{1}{N_b}\sum_{i=1}^{N_b} \phi_i^2$
- **PDE损失**：$\mathcal{L}_{\text{PDE}} = \frac{1}{N_p}\sum_{j=1}^{N_p} (\nabla^2\phi_j + \rho_j)^2$

### 3. 自动微分计算拉普拉斯算子
```python
# 第一步：计算一阶导数 ∇φ = (∂φ/∂x, ∂φ/∂y, ∂φ/∂z)
grad_phi = torch.autograd.grad(
    phi, r, 
    grad_outputs=torch.ones_like(phi), 
    create_graph=True
)[0]  # 返回形状 (N, 3)

# 第二步：对每个分量计算二阶导数
laplacian_phi = 0
for i in range(3):  # 遍历 x, y, z
    # 计算 ∂²φ/∂x², ∂²φ/∂y², ∂²φ/∂z²
    grad2_phi = torch.autograd.grad(
        grad_phi[:, i].unsqueeze(-1),  # 选择第 i 个分量
        r, 
        grad_outputs=torch.ones_like(phi), 
        create_graph=True
    )[0][:, i]  # 提取对应的二阶导数
    laplacian_phi += grad2_phi  # ∇²φ = ∂²φ/∂x² + ∂²φ/∂y² + ∂²φ/∂z²
```

**关键点**：
- `create_graph=True` 保持计算图用于后续反向传播
- `grad_outputs` 指定梯度的"种子"，通常为全1张量
- 需要对三个坐标方向分别计算二阶导数然后求和

### 4. 采样策略
- **域内采样**：每轮随机采样，增强泛化性
- **边界采样**：固定采样点，确保边界条件严格满足

### 5. 训练技巧
- **学习率**：初始建议 1e-3，可使用学习率衰减
- **监控指标**：分别观察 PDE loss 和 Boundary loss 的变化

## 📊 评分标准

- **代码运行** (80%)：代码能正确运行并生成结果
- **README.md** (20%)：实验说明、结果展示和分析

## 📚 参考资源

- [神经网络基础](../course/ai/neural-network.md)
- [PyTorch 教程](../course/ai/torch.md)
- [Physics-informed neural networks (Wikipedia)](https://en.wikipedia.org/wiki/Physics-informed_neural_networks)

### 关键概念
- **自动微分**：PyTorch 的 `autograd` 机制可以自动计算导数
- **物理约束**：将物理定律（PDE）作为损失函数的一部分
- **无网格方法**：不需要传统有限元的网格划分

## 骨架代码

```python
"""
作业3：使用物理信息神经网络求解泊松方程

问题描述：
在立方体区域 [-1,1]³ 中求解泊松方程
∇²φ = -ρ(x,y,z)
其中 ρ(x,y,z) = 100xyz²
边界条件：φ = 0 on boundary

TODO: 请完成标记为 TODO 的部分
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt


# ==================== 1. 定义神经网络 ====================
class PINN(nn.Module):
    """
    物理信息神经网络
    TODO: 定义网络层结构
    """
    def __init__(self, input_dim, hidden_dim, output_dim):
        super(PINN, self).__init__()
        # TODO: 定义网络层
        # 提示：使用 nn.Linear 定义全连接层
        # 建议 3-5 层，每层 128-512 个神经元
        pass
    
    def forward(self, x):
        # TODO: 定义前向传播
        # 提示：使用 tanh 或其他激活函数
        pass


# ==================== 2. 采样函数 ====================
def sample_points_in_cube(N, device='cpu'):
    """
    在立方体域 [-1, 1]³ 内随机采样点
    
    TODO: 实现域内采样
    提示：使用 torch.rand 生成 [0,1] 范围的随机数，然后缩放到 [-1,1]
    
    返回：
        torch.Tensor: 形状 (N, 3) 的张量
    """
    pass


def sample_points_on_boundary(N, device='cpu'):
    """
    在立方体的 6 个边界面上采样点
    
    TODO: 实现边界采样
    提示：立方体有 6 个面（x=±1, y=±1, z=±1），在每个面上采样
    
    返回：
        torch.Tensor: 边界点集合
    """
    pass


# ==================== 3. 物理方程 ====================
def charge_distribution(r):
    """
    定义电荷分布 ρ(x,y,z) = 100xyz²
    
    参数：
        r: 位置坐标，形状 (N, 3)
    
    返回：
        电荷密度值
    """
    # TODO: 实现电荷分布函数
    pass


def compute_pde_residual(model, r):
    """
    计算泊松方程残差：∇²φ + ρ = 0
    
    TODO: 使用自动微分计算拉普拉斯算子
    
    提示：
    1. 首先计算一阶导数（梯度）
    2. 然后对每个方向计算二阶导数
    3. 求和得到拉普拉斯算子
    
    参数：
        model: PINN 模型
        r: 位置坐标（需要 requires_grad=True）
    
    返回：
        PDE 残差
    """
    # TODO: 计算 φ = model(r)
    
    # TODO: 计算一阶导数 ∇φ
    # 提示：使用 torch.autograd.grad，设置 create_graph=True
    
    # TODO: 计算二阶导数（拉普拉斯算子）
    # 提示：对 x, y, z 三个方向分别计算二阶导数并求和
    
    # TODO: 计算电荷密度 ρ
    
    # TODO: 返回 PDE 残差：∇²φ + ρ
    pass


# ==================== 4. 训练函数 ====================
def train(model, optimizer, num_epochs, device='cpu'):
    """
    训练 PINN 模型
    
    TODO: 实现训练循环
    
    参数：
        model: PINN 模型
        optimizer: 优化器
        num_epochs: 训练轮数
        device: 设备
    """
    losses = []
    
    # TODO: 采样边界点（可以固定）
    
    for epoch in range(num_epochs):
        # TODO: 每轮重新采样域内点
        
        # TODO: 前向传播：计算边界点的 φ 值
        
        # TODO: 计算边界损失（边界条件 φ = 0）
        
        # TODO: 计算 PDE 残差和 PDE 损失
        
        # TODO: 计算总损失（边界损失 + β * PDE 损失）
        
        # TODO: 反向传播和优化
        
        # TODO: 记录损失并定期打印
        
        pass
    
    return losses


# ==================== 5. 主程序 ====================
if __name__ == '__main__':
    # TODO: 设置超参数
    # input_dim = 3
    # hidden_dim = 256
    # output_dim = 1
    # num_epochs = 10000
    # learning_rate = 0.001
    
    # TODO: 初始化模型和优化器
    
    # TODO: 训练模型
    
    # TODO: 保存模型
    # torch.save(model.state_dict(), 'pinn.pth')
    
    # TODO: 可视化训练曲线
    # 提示：使用 matplotlib 绘制损失曲线
    
    # TODO: 测试和可视化结果
    # 提示：在测试点上预测电势，绘制等高线图或切片图
    
    pass
```

骨架代码包含了基本的框架和 TODO 标记，请根据提示完成标记为 TODO 的部分。

## ❓ 常见问题

**Q: 训练很慢怎么办？**
A: 可以减少训练轮数或采样点数，使用 GPU 可大幅加速。

**Q: 损失不收敛怎么办？**
A: 尝试调整学习率、增加网络容量，或调整损失函数权重 β。

**Q: 边界条件误差较大？**
A: 可以增加边界采样点数，或增大边界损失的权重。

## 📞 技术支持

如有技术问题，可以通过以下方式获得帮助：
- 课程讨论群
- 助教答疑时间  
- [常见问题文档](../resources/faq.md)
