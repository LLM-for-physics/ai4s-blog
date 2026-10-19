import torch

# 已知数据：本例不需要计算它们的梯度
x = torch.tensor(2.0)
y = torch.tensor(5.0)

# 模型参数：需要计算损失对它们的梯度
w = torch.tensor(3.0, requires_grad=True)
b = torch.tensor(1.0, requires_grad=True)
optimizer = torch.optim.SGD([w, b], lr=0.05)

# 正向计算
a = w * x
pred = a + b
error = pred - y
loss = error ** 2

# 仅为了观察：保留中间量的梯度
for value in (a, pred, error):
    value.retain_grad()

# 反向传播：计算梯度，不更新参数
loss.backward()

for name, value in [
    ("error", error), ("pred", pred), ("a", a),
    ("w", w), ("b", b)
]:
    print(f"{name}: 数值={value.item()}, 梯度={value.grad.item()}")

# 梯度计算完成后，由优化器更新参数
optimizer.step()
print(f"更新后的 w = {w.item():.1f}")
print(f"更新后的 b = {b.item():.1f}")
# 已有的 pred、loss 不会自动刷新；新的结果需要重新前向计算。
