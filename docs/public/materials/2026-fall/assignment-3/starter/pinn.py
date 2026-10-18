"""第三次作业第二部分：用 PINN 求正方形区域内的静电势。请补全损失函数和训练代码。"""

import torch
import torch.nn as nn
import matplotlib.pyplot as plt

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(2026)


class PINN(nn.Module):
    """输入坐标 x、y，输出该点的电势。"""

    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 64)
        self.fc2 = nn.Linear(64, 64)
        self.fc3 = nn.Linear(64, 1)

    def forward(self, x, y):
        z = torch.cat((x, y), dim=1)
        z = torch.tanh(self.fc1(z))
        z = torch.tanh(self.fc2(z))
        return self.fc3(z)


def sample_points(n=1024):
    """随机取区域内的点，并在四条边上均匀取点。"""
    x = torch.rand(n, 1, device=DEVICE, requires_grad=True)
    y = torch.rand(n, 1, device=DEVICE, requires_grad=True)

    t = torch.linspace(0, 1, 64, device=DEVICE).reshape(-1, 1)
    zero = torch.zeros_like(t)
    one = torch.ones_like(t)
    boundary_x = torch.cat((zero, one, t, t))
    boundary_y = torch.cat((t, t, zero, one))
    return x, y, boundary_x, boundary_y


def derivative(value, coordinate):
    """自动求导；保留计算图，以便继续求二阶导数和训练网络。"""
    return torch.autograd.grad(value.sum(), coordinate, create_graph=True)[0]


def physics_loss(model, x, y, boundary_x, boundary_y):
    potential = model(x, y)
    dx = derivative(potential, x)
    dy = derivative(potential, y)
    dxx = derivative(dx, x)
    dyy = derivative(dy, y)

    # 已知的电荷密度；这里没有使用电势的正确答案作为训练标签。
    charge = 2 * torch.pi**2 * torch.sin(torch.pi * x) * torch.sin(torch.pi * y)
    boundary_potential = model(boundary_x, boundary_y)

    # 根据方程和边界条件，构造并返回一个标量损失。
    # ----------------------------------------------------------------------
    # 在这里补全代码：
    # ----------------------------------------------------------------------
    raise NotImplementedError("请先补全 physics_loss")


def show_result(model):
    """这是一个协助作图的函数，与PINN本身无关，是帮助你画出电势和误差图像用的，节省时间；解析解仅用于检查。"""
    model.eval()
    axis = torch.linspace(0, 1, 81, device=DEVICE)
    X, Y = torch.meshgrid(axis, axis, indexing="ij")
    with torch.no_grad():
        potential = model(X.reshape(-1, 1), Y.reshape(-1, 1)).reshape(81, 81)
        error = (potential - torch.sin(torch.pi * X) * torch.sin(torch.pi * Y)).abs()
    print("平均绝对误差：", error.mean().item())
    print("最大绝对误差：", error.max().item())

    plt.figure(figsize=(9, 4))
    for i, values in enumerate([potential, error]):
        plt.subplot(1, 2, i + 1)
        plt.imshow(values.cpu().numpy().T, origin="lower", extent=[0, 1, 0, 1])
        plt.title(["Potential (x, y)", "Absolute error (x, y)"][i])
        plt.colorbar()
    plt.tight_layout()
    plt.savefig("pinn_potential.png")
    plt.close()


if __name__ == "__main__":
    model = PINN().to(DEVICE)

    # ----------------------------------------------------------------------
    # 在这里补全训练代码：
    # 选择优化器，每轮调用 sample_points()，计算 physics_loss 并更新参数。
    # 提示：可先试 Adam、学习率 0.001；少量轮次调试，约 3000 轮看结果。
    # ----------------------------------------------------------------------

    torch.save(model.state_dict(), "pinn.pt")
    show_result(model)
