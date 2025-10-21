import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader, TensorDataset


# Define the neural network architecture
class PINN(nn.Module):
    """
    物理信息神经网络（Physics-Informed Neural Network）
    
    用于求解泊松方程: ∇²φ = -ρ(x,y,z)
    边界条件: φ = 0 on boundary of [-1,1]³
    
    参数:
        input_dim: 输入维度（3D空间：x, y, z）
        hidden_dim: 隐藏层神经元数量
        output_dim: 输出维度（电势 φ）
    """
    def __init__(self, input_dim, hidden_dim, output_dim):
        super(PINN, self).__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.fc3 = nn.Linear(hidden_dim, hidden_dim)
        self.fc4 = nn.Linear(hidden_dim, output_dim)

    def forward(self, x):
        x = F.tanh(self.fc1(x))
        x = F.tanh(self.fc2(x))
        x = F.tanh(self.fc3(x))
        x = self.fc4(x)
        return x


def sample_points_in_cube(N, device='cpu'):
    """
    在3D立方体域 [-1, 1] × [-1, 1] × [-1, 1] 内随机采样点
    
    参数:
        N: 采样点数量
        device: 设备 ('cpu' 或 'cuda')
    
    返回:
        torch.Tensor: 形状为 (N, 3) 的张量
    """
    points = torch.rand((N, 3), device=device) * 2 - 1  # 从 [0,1] 缩放到 [-1,1]
    return points


def sample_points_in_boundary(N, device='cpu'):
    """
    在立方体的6个边界面上采样点
    
    参数:
        N: 每个方向的采样点数（总点数约为 6*N²）
        device: 设备 ('cpu' 或 'cuda')
    
    返回:
        torch.Tensor: 边界点集合
    """
    x_train = torch.rand(N, device=device) * 2 - 1
    y_train = torch.rand(N, device=device) * 2 - 1
    x_bn, y_bn = torch.meshgrid(x_train, y_train, indexing='ij')
    x_bn = x_bn.flatten()
    y_bn = y_bn.flatten()
    
    # 6个面：z=±1, y=±1, x=±1
    r_bn = [
        torch.stack((x_bn, y_bn, torch.ones(len(x_bn), device=device)), dim=1),
        torch.stack((x_bn, y_bn, -torch.ones(len(x_bn), device=device)), dim=1),
        torch.stack((x_bn, torch.ones(len(x_bn), device=device), y_bn), dim=1),
        torch.stack((x_bn, -torch.ones(len(x_bn), device=device), y_bn), dim=1),
        torch.stack((torch.ones(len(x_bn), device=device), x_bn, y_bn), dim=1),
        torch.stack((-torch.ones(len(x_bn), device=device), x_bn, y_bn), dim=1)
    ]
    r_bn = torch.cat(r_bn)
    return r_bn


def charge_distribution(r):
    """
    定义电荷分布 ρ(x,y,z)
    
    参数:
        r: 位置坐标 (batch_size, 3)
    
    返回:
        电荷密度值
    """
    return 100 * r[:, 0] * r[:, 1] * r[:, 2]**2


def poisson(phi, r):
    """
    计算泊松方程残差: ∇²φ + ρ = 0
    
    使用自动微分计算拉普拉斯算子
    
    参数:
        phi: 神经网络预测的电势
        r: 空间坐标（需要 requires_grad=True）
    
    返回:
        方程残差
    """
    # 计算一阶导数
    grad_phi = torch.autograd.grad(
        phi, r, 
        grad_outputs=torch.ones_like(phi), 
        create_graph=True
    )[0]
    
    # 计算二阶导数（拉普拉斯算子）
    laplacian_phi = 0
    for i in range(3):  # x, y, z 三个方向
        grad2_phi = torch.autograd.grad(
            grad_phi[:, i].unsqueeze(-1), r, 
            grad_outputs=torch.ones_like(phi), 
            create_graph=True
        )[0][:, i]
        laplacian_phi += grad2_phi
    
    # 电荷密度
    rho = charge_distribution(r)
    
    # 泊松方程残差
    equation = laplacian_phi + rho
    return equation


if __name__ == '__main__':
    # ==================== 超参数设置 ====================
    input_dim = 3           # 输入维度 (x, y, z)
    hidden_dim = 256        # 隐藏层神经元数
    output_dim = 1          # 输出维度 (φ)
    
    num_epochs = 20000      # 训练轮数
    learning_rate = 0.001   # 学习率
    beta = 1.0              # PDE损失权重（相对于边界损失）
    
    nt = 32                 # 域内采样倍数
    n = 21                  # 边界采样密度
    
    # 自动检测设备
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"使用设备: {device}")
    
    # ==================== 初始化模型 ====================
    model = PINN(input_dim, hidden_dim, output_dim).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    
    print(f"模型参数总数: {sum(p.numel() for p in model.parameters())}")
    
    # ==================== 边界点采样 ====================
    r_bn = sample_points_in_boundary(N=n, device=device)
    r_bn = r_bn.requires_grad_(True)
    print(f"边界点数量: {r_bn.shape[0]}")
    
    # ==================== 训练循环 ====================
    losses = []
    pde_losses = []
    bn_losses = []
    
    print("\n开始训练...")
    for epoch in range(num_epochs):
        model.train()
        optimizer.zero_grad()
        
        # 每轮重新采样域内点（增强随机性）
        r_in = sample_points_in_cube(N=nt*len(r_bn), device=device)
        r_in = r_in.requires_grad_(True)
        
        # 前向传播：预测电势
        phi = model(r_in)
        
        # 计算PDE残差
        equation = poisson(phi, r_in)
        loss_pde = torch.mean(equation**2)
        
        # 边界条件：φ = 0
        phi_bn = model(r_bn)
        loss_bn = torch.mean(phi_bn**2)
        
        # 总损失
        loss = loss_bn + beta * loss_pde
        
        # 反向传播
        loss.backward()
        optimizer.step()
        
        # 记录损失
        losses.append(loss.item())
        pde_losses.append(loss_pde.item())
        bn_losses.append(loss_bn.item())
        
        # 打印进度
        if (epoch + 1) % 100 == 0:
            print(f"Epoch [{epoch+1}/{num_epochs}], "
                  f"Total Loss: {loss.item():.6f}, "
                  f"PDE Loss: {loss_pde.item():.6f}, "
                  f"BC Loss: {loss_bn.item():.6f}")
    
    # ==================== 保存模型和结果 ====================
    torch.save(model.state_dict(), 'docs/assignments/assignment-3-material/pinn.pth')
    print("\n模型已保存到 pinn.pth")
    
    # 保存训练损失曲线
    plt.figure(figsize=(10, 6))
    plt.semilogy(losses, label='Total Loss', alpha=0.7)
    plt.semilogy(pde_losses, label='PDE Loss', alpha=0.7)
    plt.semilogy(bn_losses, label='Boundary Loss', alpha=0.7)
    plt.xlabel('Epoch')
    plt.ylabel('Loss (log scale)')
    plt.title('Training Loss Curves')
    plt.legend()
    plt.grid(True)
    plt.savefig('docs/assignments/assignment-3-material/loss_curve.png', dpi=150)
    print("损失曲线已保存到 loss_curve.png")
    
    # ==================== 保存测试数据 ====================
    model.eval()
    with torch.no_grad():
        # 生成测试网格
        test_n = 50
        x = torch.linspace(-1, 1, test_n)
        y = torch.linspace(-1, 1, test_n)
        z = torch.linspace(-1, 1, test_n)
        X, Y, Z = torch.meshgrid(x, y, z, indexing='ij')
        
        test_points = torch.stack([X.flatten(), Y.flatten(), Z.flatten()], dim=1).to(device)
        test_values = model(test_points).cpu().numpy()
        
        # 保存到CSV
        np.savetxt('docs/assignments/assignment-3-material/points.csv', 
                   test_points.cpu().numpy(), 
                   delimiter=',', 
                   header='x,y,z', 
                   comments='')
        np.savetxt('docs/assignments/assignment-3-material/values.csv', 
                   test_values, 
                   delimiter=',', 
                   header='phi', 
                   comments='')
        print("测试数据已保存到 points.csv 和 values.csv")
    
    print("\n训练完成！")
