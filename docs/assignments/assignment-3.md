# 作业 3：神经网络学习加法与 PINN 求解静电势

::: info 截止时间与提交位置
**截止时间：2026 年 10 月 30 日 23:59（北京时间）。** 请将作业放入服务器个人主目录的 `~/homework3/` 文件夹。
:::

[下载第三次作业完整材料包（ZIP）](/materials/2026-fall/assignment-3/Homework-3-1014.zip)

本次作业共 **10 分**。请在提供的 Python 骨架上补全代码，不需要从零搭建项目。两部分分别展示从样本学习映射，以及利用物理方程求解未知函数。

## 一、用神经网络学习加法（5 分）

运行 `starter/addition.py`。输入是两个 0～999999 的随机非负整数，每个数按六位十进制数字独热编码（不足六位时高位补 0）；网络输出七位数字，表示它们的和。

程序已给出数字编码、网络结构和数据生成函数。请在主程序标出的区域补全训练代码，训练后保存 `addition_model.pt`。

助教将加载模型，在统一的 1000 道独立测试题上计算准确率（完整加法结果正确才计为答对）。准确率达到 **80% 得 3 分（及格），达到 95% 得 5 分（满分）**；0～80% 对应 0～3 分，80%～95% 对应 3～5 分，各区间内线性赋分。

> **想一想（选做，不计分）**：为什么这里采用独热编码，而不是把每个六位数拆成六个数字直接输入？有兴趣可以另建副本，调整输入层并比较两种编码的训练效果；不要求提交，正式提交的模型仍使用提供的网络结构。

## 二、用 PINN 求解二维静电势（5 分）

**PINN 是什么？** PINN（Physics-Informed Neural Network，物理信息神经网络）用神经网络表示待求的函数，再通过自动求导计算它的导数，检查它是否满足微分方程和边界条件，并据此调整网络参数。本题不提供电势的训练标签，而是用已知的方程和边界条件指导网络求解电势。

在区域 $\Omega=[0,1]\times[0,1]$ 内，电势满足二维泊松方程：

$$
-\left(\frac{\partial^2\varphi}{\partial x^2}
+\frac{\partial^2\varphi}{\partial y^2}\right)
=\rho(x,y),\qquad
\rho(x,y)=2\pi^2\sin(\pi x)\sin(\pi y).
$$

四条边均接地，即：

$$
\varphi(0,y)=\varphi(1,y)=\varphi(x,0)=\varphi(x,1)=0.
$$

网络输入坐标 `(x, y)`，输出电势 `φ(x, y)`。`starter/pinn.py` 已提供网络、取样、自动求导和绘图。请根据方程与边界条件自行设计损失函数。

补全 `physics_loss` 和主程序中的训练循环，训练并保存 `pinn.pt`。

解析解为：

$$
\varphi(x,y)=\sin(\pi x)\sin(\pi y).
$$

解析解仅用于训练后的检查，**不能作为训练标签或代替网络输出**。训练时可以使用题目给定的电荷密度。

助教将加载模型，在包含边界的 **81 × 81 均匀网格**上，计算网络电势与解析解的平均绝对误差（MAE，即各点误差的绝对值取平均，与 `show_result` 的计算方式相同），按下表评分：

| 平均绝对误差 E | 得分 |
| --- | --- |
| E ≤ 0.001 | 5 分（满分） |
| E = 0.01 | 3 分（及格） |
| E ≥ 0.05 | 0 分 |

0.001～0.01、0.01～0.05 两个区间内分别线性赋分，误差越小得分越高。最大绝对误差用于自查，不单独计分。

## 三、比较两种神经网络的作用（选做，不计分）

请思考：两道题中神经网络起到的作用有何不同？

## 提交内容

请将以下文件放入服务器个人主目录的 `~/homework3/` 文件夹：

- 补全后的 `addition.py` 和 `pinn.py`。
- 训练好的 `addition_model.pt` 和 `pinn.pt`。

代码应能在服务器的 `pubpy` 环境中运行，不提交缓存文件。比较分析选交，不计分。

**截止时间：2026 年 10 月 30 日 23:59（北京时间）。**

<a href="/materials/2026-fall/assignment-3/拓展案例（非必做）/README.md" target="_blank" rel="noopener">参考示例</a> 提供谐振子前三个能级和波函数的示例，供有兴趣的同学了解 PINN 在简单物理问题中的应用；不属于必做任务，也不计分。

## 作业材料

| 材料 | 内容 |
| --- | --- |
| [完整材料包（ZIP）](/materials/2026-fall/assignment-3/Homework-3-1014.zip) | 作业说明、PyTorch 入门、代码骨架与选读案例 |
| <a href="/materials/2026-fall/assignment-3/作业说明.md" target="_blank" rel="noopener">作业说明原文</a> | 题目、评分方式与提交要求 |
| <a href="/materials/2026-fall/assignment-3/PyTorch简明入门.md" target="_blank" rel="noopener">PyTorch 简明入门</a> | 网络结构、训练和自动求导 |
| <a href="/materials/2026-fall/assignment-3/README.md" target="_blank" rel="noopener">材料使用说明</a> | 文件说明与运行方法 |
| <a href="/materials/2026-fall/assignment-3/starter/addition.py" download="addition.py">加法代码骨架</a> | 补全训练代码，保存 `addition_model.pt` |
| <a href="/materials/2026-fall/assignment-3/starter/pinn.py" download="pinn.py">PINN 代码骨架</a> | 补全物理损失和训练循环，保存 `pinn.pt` |
| [依赖列表](/materials/2026-fall/assignment-3/starter/requirements.txt) | NumPy、Matplotlib、PyTorch |
| <a href="/materials/2026-fall/assignment-3/拓展案例（非必做）/README.md" target="_blank" rel="noopener">谐振子拓展案例说明</a> | 选读、不计分；代码包含在完整材料包中 |
