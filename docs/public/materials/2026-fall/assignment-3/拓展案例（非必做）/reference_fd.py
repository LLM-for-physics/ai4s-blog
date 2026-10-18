"""有限区间数值参照：有限差分矩阵，不能代替 PINN 结果。"""
import numpy as np

L = 5.0
N_GRID = 201
x = np.linspace(-L, L, N_GRID)
dx = x[1] - x[0]
interior = x[1:-1]
diagonal = 1.0 / dx**2 + 0.5 * interior**2
off_diagonal = np.full(len(interior) - 1, -0.5 / dx**2)
H = np.diag(diagonal) + np.diag(off_diagonal, 1) + np.diag(off_diagonal, -1)
energies, vectors = np.linalg.eigh(H)

print("区间 [-5,5]、端点为零的有限差分参考能量：")
for i in range(3):
    psi = np.pad(vectors[:, i], (1, 1))
    psi /= np.sqrt(np.sum((psi[:-1]**2 + psi[1:]**2) * 0.5 * dx))
    print(f"state {i}: E = {energies[i]:.6f}，范数 = {np.sum((psi[:-1]**2 + psi[1:]**2) * 0.5 * dx):.6f}")
print("网格离散会带来误差；波函数整体正负号任意。")

