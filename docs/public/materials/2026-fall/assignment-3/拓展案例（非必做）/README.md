# 选读：谐振子的前三个本征态

本示例展示如何结合变分原理和 PINN 求解本征值问题。**不属于必做作业，不计分。**

## 文件

- `harmonic_oscillator.py`：提供网络、物理损失与绘图；训练循环需自行补全。
- `reference_fd.py`：同一区间与边界条件下的有限差分参照，可直接运行。

在本目录运行脚本。三态骨架补全训练后生成的 `pinn.pt`、`pinn_waves.png` 属于本示例，与必做题输出分开存放。

## 问题与方法

在自然单位下求解：

$$
-\frac12\psi''(x)+\frac12x^2\psi(x)=E\psi(x),
\quad x\in[-5,5],\quad \psi(-5)=\psi(5)=0.
$$

目标是最低三个能量及对应波函数。有限区间的本征值与无限区间的 `0.5、1.5、2.5` 略有差别。

网络输出三个函数。边界因子让端点值为零，对称化分别给出偶、奇、偶三个输出。程序用 Rayleigh 商计算各态能量：

$$
E[\psi]=
\frac{\int[\frac12(\psi')^2+\frac12x^2\psi^2]\,dx}
{\int\psi^2\,dx}.
$$

损失包含：

- **能量之和**：在其他约束下推动网络寻找低能态。
- **归一化惩罚**：要求各态的平方积分接近 1，排除零函数。
- **正交惩罚**：避免两个偶态成为同一个态；奇偶态自动正交。
- **方程残差**：要求每个输出分别满足本征方程。

`40` 和 `80` 是惩罚权重，不是物理常数。这是变分方法与 PINN 残差的结合；有限权重与数值优化不保证每次训练都得到准确本征态，需检查结果。两个偶态的输出列可能互换，展示时按能量排序。

训练参考：使用 Adam、学习率 0.001、201 个网格点，训练 1500 轮后得到约 `0.50005、1.50008、2.50151`，范数约为 1。这些数值仅作示例，不是得分标准。

## 参考文献与教程（选读）

以下两篇介绍 PINN 求解微分方程的基本方法，供进一步阅读，不要求读完。

- Hubert Baty、Leo Baty（2023），[Solving differential equations using physics informed deep learning: a hand-on tutorial with benchmark tests](https://arxiv.org/abs/2302.12260)：通过常微分方程示例讲解实现方法，并讨论效果与局限。
- Luis Medrano Navarro、Luis Martín Moreno、Sergio G Rodrigo（2023），[Solving differential equations with Deep Learning: a beginner's guide](https://arxiv.org/abs/2307.11237)：面向物理学习者的 PINN 入门教程。
