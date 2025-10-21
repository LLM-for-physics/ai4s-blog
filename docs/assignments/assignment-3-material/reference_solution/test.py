import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D


# 导入模型定义
class PINN(nn.Module):
    """物理信息神经网络"""
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


def charge_distribution(r):
    """电荷分布"""
    return 100 * r[:, 0] * r[:, 1] * r[:, 2]**2


def compute_laplacian(model, r):
    """计算拉普拉斯算子验证物理定律"""
    r = r.requires_grad_(True)
    phi = model(r)
    
    grad_phi = torch.autograd.grad(
        phi, r, 
        grad_outputs=torch.ones_like(phi), 
        create_graph=True
    )[0]
    
    laplacian = 0
    for i in range(3):
        grad2 = torch.autograd.grad(
            grad_phi[:, i].unsqueeze(-1), r, 
            grad_outputs=torch.ones_like(phi), 
            create_graph=True
        )[0][:, i]
        laplacian += grad2
    
    return laplacian


if __name__ == '__main__':
    # ==================== 加载模型 ====================
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"使用设备: {device}")
    
    model = PINN(input_dim=3, hidden_dim=256, output_dim=1).to(device)
    model.load_state_dict(torch.load('docs/assignments/assignment-3-material/pinn.pth', map_location=device))
    model.eval()
    print("模型加载成功！")
    
    # ==================== 测试边界条件 ====================
    print("\n【边界条件测试】")
    # 在边界上采样点
    n_boundary = 100
    boundary_points = []
    
    # 6个面
    for _ in range(n_boundary):
        x, y = torch.rand(2) * 2 - 1
        face = torch.randint(0, 6, (1,)).item()
        if face == 0: point = torch.tensor([x, y, 1.0])   # z=1
        elif face == 1: point = torch.tensor([x, y, -1.0]) # z=-1
        elif face == 2: point = torch.tensor([x, 1.0, y])  # y=1
        elif face == 3: point = torch.tensor([x, -1.0, y]) # y=-1
        elif face == 4: point = torch.tensor([1.0, x, y])  # x=1
        else: point = torch.tensor([-1.0, x, y])           # x=-1
        boundary_points.append(point)
    
    boundary_points = torch.stack(boundary_points).to(device)
    
    with torch.no_grad():
        boundary_phi = model(boundary_points)
        boundary_error = torch.mean(torch.abs(boundary_phi)).item()
    
    print(f"边界条件平均误差: {boundary_error:.6f}")
    print(f"边界条件最大误差: {torch.max(torch.abs(boundary_phi)).item():.6f}")
    
    # ==================== 验证泊松方程 ====================
    print("\n【泊松方程验证】")
    # 在域内随机采样点
    n_test = 1000
    test_points = torch.rand(n_test, 3).to(device) * 2 - 1
    
    laplacian = compute_laplacian(model, test_points)
    rho = charge_distribution(test_points)
    
    residual = laplacian + rho
    residual_error = torch.mean(residual**2).item()
    
    print(f"方程残差均方误差: {residual_error:.6f}")
    print(f"方程残差平均值: {torch.mean(torch.abs(residual)).item():.6f}")
    
    # ==================== 可视化：中心平面切片 ====================
    print("\n【生成可视化图像】")
    
    # 创建 z=0 平面的网格
    n_plot = 100
    x = torch.linspace(-1, 1, n_plot)
    y = torch.linspace(-1, 1, n_plot)
    X, Y = torch.meshgrid(x, y, indexing='ij')
    
    # z=0 平面
    Z = torch.zeros_like(X)
    points = torch.stack([X.flatten(), Y.flatten(), Z.flatten()], dim=1).to(device)
    
    with torch.no_grad():
        phi_pred = model(points).cpu().reshape(n_plot, n_plot)
    
    # 绘制等高线图
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # 子图1：电势分布
    ax1 = axes[0]
    contour = ax1.contourf(X.numpy(), Y.numpy(), phi_pred.numpy(), levels=20, cmap='RdBu_r')
    ax1.contour(X.numpy(), Y.numpy(), phi_pred.numpy(), levels=10, colors='black', alpha=0.3, linewidths=0.5)
    plt.colorbar(contour, ax=ax1, label='φ')
    ax1.set_xlabel('x')
    ax1.set_ylabel('y')
    ax1.set_title('电势分布 (z=0 平面)')
    ax1.set_aspect('equal')
    
    # 子图2：电荷密度分布
    ax2 = axes[1]
    rho_plot = charge_distribution(points).cpu().reshape(n_plot, n_plot)
    contour2 = ax2.contourf(X.numpy(), Y.numpy(), rho_plot.numpy(), levels=20, cmap='viridis')
    plt.colorbar(contour2, ax=ax2, label='ρ')
    ax2.set_xlabel('x')
    ax2.set_ylabel('y')
    ax2.set_title('电荷密度分布 (z=0 平面)')
    ax2.set_aspect('equal')
    
    plt.tight_layout()
    plt.savefig('docs/assignments/assignment-3-material/visualization.png', dpi=150)
    print("可视化图像已保存到 visualization.png")
    
    # ==================== 3D可视化（可选） ====================
    # 绘制 3D 等势面
    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection='3d')
    
    # 创建稀疏网格用于3D可视化
    n_3d = 30
    x = torch.linspace(-1, 1, n_3d)
    y = torch.linspace(-1, 1, n_3d)
    z = torch.linspace(-1, 1, n_3d)
    X3d, Y3d, Z3d = torch.meshgrid(x, y, z, indexing='ij')
    
    points_3d = torch.stack([X3d.flatten(), Y3d.flatten(), Z3d.flatten()], dim=1).to(device)
    
    with torch.no_grad():
        phi_3d = model(points_3d).cpu().reshape(n_3d, n_3d, n_3d).numpy()
    
    # 选择几个等势面绘制
    levels = np.percentile(phi_3d, [20, 50, 80])
    colors = ['blue', 'green', 'red']
    
    for level, color in zip(levels, colors):
        # 这里简化处理，只显示部分点
        mask = np.abs(phi_3d - level) < np.std(phi_3d) * 0.1
        ax.scatter(X3d.numpy()[mask], Y3d.numpy()[mask], Z3d.numpy()[mask], 
                  c=color, alpha=0.1, s=1, label=f'φ≈{level:.2f}')
    
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.set_zlabel('z')
    ax.set_title('3D 等势面（稀疏采样）')
    ax.legend()
    
    plt.savefig('docs/assignments/assignment-3-material/3d_visualization.png', dpi=150)
    print("3D可视化图像已保存到 3d_visualization.png")
    
    # ==================== 统计信息 ====================
    print("\n【统计信息】")
    with torch.no_grad():
        # 在整个域内采样
        sample_points = torch.rand(10000, 3).to(device) * 2 - 1
        sample_phi = model(sample_points).cpu()
    
    print(f"电势最大值: {torch.max(sample_phi).item():.6f}")
    print(f"电势最小值: {torch.min(sample_phi).item():.6f}")
    print(f"电势平均值: {torch.mean(sample_phi).item():.6f}")
    print(f"电势标准差: {torch.std(sample_phi).item():.6f}")
    
    print("\n测试完成！")
