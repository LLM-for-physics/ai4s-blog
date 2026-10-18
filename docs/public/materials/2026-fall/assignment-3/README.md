# 第三次作业讨论稿

- [作业说明](作业说明.md)：题目与提交要求。
- [PyTorch 简明入门](PyTorch简明入门.md)：网络结构、训练和自动求导。
- `starter/addition.py`：六位数加法骨架。
- `starter/pinn.py`：二维静电泊松方程骨架。
- [参考材料](拓展案例（非必做）/README.md)：谐振子前三个本征态示例，选读、不计分。

在服务器的 `pubpy` 环境中，补全两个程序的训练代码和 PINN 的 `physics_loss` 后，在 `starter` 目录执行：

```bash
python addition.py
python pinn.py
```

训练后，加法程序保存 `addition_model.pt`，PINN 程序保存 `pinn.pt`。PINN 还会生成 `pinn_potential.png`，供自行检查。提交要求见[作业说明](作业说明.md)。
