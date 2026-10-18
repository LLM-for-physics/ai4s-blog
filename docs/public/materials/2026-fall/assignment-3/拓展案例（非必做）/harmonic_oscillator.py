"""选读示例：用 PINN 求解有限区间的一维量子谐振子。"""

import torch
import torch.nn as nn
import matplotlib.pyplot as plt

L = 5.0  # 求解区间 [-5, 5]
N_GRID = 201
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(2026)


class WaveNet(nn.Module):
    """一个网络同时表示最低三个态的波函数。"""

    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(1, 64)
        self.fc2 = nn.Linear(64, 64)
        self.fc3 = nn.Linear(64, 3)

    def raw_output(self, x):
        x = torch.tanh(self.fc1(x))
        x = torch.tanh(self.fc2(x))
        return self.fc3(x)

    def forward(self, x):
        right = self.raw_output(x)
        left = self.raw_output(-x)
        boundary = 1 - (x / L) ** 2  # x = ±5 时，波函数为 0

        # 前三个态依次为偶函数、奇函数、偶函数。
        psi0 = (right[:, 0:1] + left[:, 0:1]) / 2
        psi1 = (right[:, 1:2] - left[:, 1:2]) / 2
        psi2 = (right[:, 2:3] + left[:, 2:3]) / 2
        return boundary * torch.cat((psi0, psi1, psi2), dim=1)


def sample_points():
    """在区间内取点；自动求导需要对 x 开启梯度。"""
    x = torch.linspace(-L, L, N_GRID, device=DEVICE).reshape(-1, 1)
    x.requires_grad_(True)
    return x


def derivative(y, x):
    """对函数 y(x) 求导；再调用一次即可得到二阶导数。"""
    return torch.autograd.grad(y.sum(), x, create_graph=True)[0]


def physics_loss(model, x):
    """用能量、方程残差、归一化和正交条件约束三个波函数。"""
    psi = model(x)  # 每列对应一个态
    potential = 0.5 * x**2
    energies = []
    norms = []
    residual_losses = []

    for i in range(3):
        wave = psi[:, i:i+1]
        slope = derivative(wave, x)
        curvature = derivative(slope, x)

        norm = torch.trapezoid(wave[:, 0] ** 2, x[:, 0])
        # Rayleigh 商：动能与势能的积分，除以波函数范数。
        energy_density = 0.5 * slope**2 + potential * wave**2
        energy = torch.trapezoid(energy_density[:, 0], x[:, 0]) / (norm + 1e-8)

        # 薛定谔方程：-ψ''/2 + x²ψ/2 = Eψ。
        residual = -0.5 * curvature + potential * wave - energy * wave
        residual_loss = torch.trapezoid(residual[:, 0] ** 2, x[:, 0]) / (norm + 1e-8)

        norms.append(norm)
        energies.append(energy)
        residual_losses.append(residual_loss)

    norms = torch.stack(norms)
    energies = torch.stack(energies)
    residual_losses = torch.stack(residual_losses)
    # 第 0、2 态都是偶函数，需要额外避免它们收敛到同一个波函数。
    overlap = torch.trapezoid(psi[:, 0] * psi[:, 2], x[:, 0])

    loss = (energies.sum()
            + 40 * ((norms - 1) ** 2).sum()
            + 80 * overlap**2
            + residual_losses.sum())
    return loss, energies, norms, overlap


def show_result(model):
    """打印能量与检查值，并画出归一化后的波函数。"""
    model.eval()
    x = sample_points()
    _, energies, norms, overlap = physics_loss(model, x)
    order = torch.argsort(energies)  # 两个偶态的输出顺序可能互换
    energies = energies.detach().cpu()[order.cpu()]
    norms = norms.detach().cpu()[order.cpu()]
    waves = model(x).detach().cpu()[:, order.cpu()] / torch.sqrt(norms)
    positions = x.detach().cpu()[:, 0]

    print("前三个能级：", energies.tolist())
    print("归一化前的范数：", norms.tolist())
    print("两个偶态的内积：", overlap.item())
    for i in range(3):
        plt.plot(positions.numpy(), waves[:, i].numpy(), label=f"E{i} = {energies[i]:.4f}")
    plt.xlabel("x")
    plt.ylabel("wavefunction")
    plt.legend()
    plt.savefig("pinn_waves.png")
    plt.close()


if __name__ == "__main__":
    model = WaveNet().to(DEVICE)

    # ----------------------------------------------------------------------
    # 在这里补全训练代码：选择优化器，反复取点，计算 physics_loss 并更新网络。
    # 提示：可先试 Adam、学习率 0.001；少量轮次调试，约 1500 轮看结果。
    # ----------------------------------------------------------------------

    torch.save(model.state_dict(), "pinn.pt")
    show_result(model)

