# PyTorch 简明入门：读懂这次作业的代码

PyTorch 帮我们做三件事：**用数组表示数据、搭建神经网络、自动计算导数并训练网络。** 下面只介绍本次作业会用到的内容，不需要先学完整个框架。

## 1. Tensor：能参与自动求导的数组

`Tensor`（张量）可以先理解为数组：一列数字、一个表格，或者更多维的数据。

```python
import torch
import torch.nn as nn

x = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
print(x.shape)  # torch.Size([2, 2])：2 行、2 列
```

本次作业通常把**一行看作一个样本**。例如，一批 32 个坐标点，每个点有 x、y 两个数，形状就是 `[32, 2]`。32 是批量大小（batch size），2 是每个样本的特征数。

先看清 `shape`，往往就能找到数据输入错误。常见操作如下：

| 写法 | 用途 |
| --- | --- |
| `torch.rand(32, 1)` | 生成 32 行、1 列的随机数，范围是 [0, 1) |
| `torch.linspace(0, 1, 81)` | 从 0 到 1 等距取 81 个点，含两端 |
| `torch.cat((x, y), dim=1)` | 把两列坐标横向拼成两列；dim=1 表示沿列方向 |
| `torch.stack(data)` | 将形状相同的一组张量叠起来，增加一个维度 |
| `x.reshape(-1, 2)` | 排成每行 2 个数，行数自动计算；不改变元素总数 |
| `x.abs().mean()` | 所有元素先取绝对值，再求平均 |
| `x.item()` | 把只有一个元素的张量变成普通 Python 数字，用于打印 |

输入网络的数通常用浮点数（如 `float32`）；分类标签的类别编号通常用整数（`long`）。`view` 也用于改变形状，但对内存排列有要求；遇到这类报错可以检查是否适合用 `reshape`。

官方阅读：[Tensor 基础](https://docs.pytorch.org/tutorials/beginner/basics/tensorqs_tutorial.html)。

## 2. 最重要的一段：class Network 在写什么？

先看一个小网络。它接收两个数，输出一个数；这里不规定它要学习什么任务。

```python
class Network(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 8)
        self.fc2 = nn.Linear(8, 1)

    def forward(self, x):
        x = self.fc1(x)
        x = torch.tanh(x)
        x = self.fc2(x)
        return x

model = Network()
x = torch.rand(4, 2)
output = model(x)
print(output.shape)  # torch.Size([4, 1])
```

可以按下面的顺序读：

| 代码 | 简单理解 |
| --- | --- |
| `class Network(nn.Module)` | 定义一种网络，使用 PyTorch 的网络基础类 |
| `__init__` | 创建网络时执行：准备要用的层 |
| `super().__init__()` | 先完成 PyTorch 基础类的初始化 |
| `self` | 当前这个网络对象；`self.fc1` 是它保存的一层 |
| `nn.Linear(2, 8)` | 将每个样本的 2 个数变成 8 个数 |
| `forward` | 规定输入按什么顺序经过各层 |
| `model = Network()` | 按上述结构创建一个网络实例 |
| `model(x)` | 让这个网络计算输出；PyTorch 会调用它的 `forward` |

`Network` 和 `fc1` 是我们取的名字，可以不同；`__init__`、`forward` 则有固定作用。网络不应在每次训练更新时重新创建，否则会丢掉已学到的参数。

**Linear 层做的是“加权求和，再加一个偏置”。** 权重和偏置就是训练要调整的参数，由 PyTorch 自动初始化和管理。把层保存在 `self.fc1` 等属性中后，`model.parameters()` 就能取得这些参数。

上面网络的数据形状变化是：

```text
[4, 2] → Linear(2, 8) → [4, 8] → tanh → [4, 8] → Linear(8, 1) → [4, 1]
```

`tanh` 是激活函数，让网络能表达非线性关系。如果中间只有 Linear，叠很多层仍等价于一次线性变换加偏置。加法骨架用 `relu`，PINN 骨架用光滑的 `tanh`；本题需要二阶导数，不宜直接把 PINN 的激活函数换成分段线性的 ReLU。

官方阅读：[搭建神经网络](https://docs.pytorch.org/tutorials/beginner/basics/buildmodel_tutorial.html)。

### 对照这次作业

| 程序 | 一批 B 个样本的输入 | 输出 |
| --- | --- | --- |
| 加法 | `[B, 120]`：两个数，每个数六位，每位独热编码占 10 个数 | `[B, 7, 10]`：七个结果位，每位十个类别的对数概率 |
| PINN | x、y 各为 `[B, 1]`，在 forward 中拼成 `[B, 2]` | `[B, 1]`：每个坐标点的电势 |

加法网络最后输出的还不是整数。检查答案时，用 `argmax(dim=2)` 选出每一位最可能的数字。**argmax 用于解码和评价，不要先把预测取 argmax 再计算分类训练损失**，这样无法通过离散选择正常训练网络。

## 3. loss、梯度下降、反向传播分别是什么？

- **loss（损失）**：用一个数表示当前结果与训练要求相差多少。
- **梯度**：参数稍微改变时，loss 会往哪个方向、以多快的速度变化。
- **梯度下降**：沿着让 loss 降低的方向，小步调整参数。
- **反向传播**：按链式法则，把 loss 对各层参数的梯度算出来。

最基本的更新规则是：

```text
新参数 = 旧参数 − 学习率 × 梯度
```

例如，若目标是让 `(w - 3)²` 变小，在 w=0 时梯度为 −6；减去这个负数，就会把 w 往 3 的方向推。

学习率（`lr`）控制每次调整的大小。太大可能来回震荡，太小可能学习很慢；也不是每一步 loss 都一定下降。`Adam` 会利用过去的梯度信息调整更新幅度，可以先按“帮我们更新参数的优化器”来理解。

```python
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
```

一次训练更新的流程如下。这是流程示意，`...` 部分要根据具体任务写：

```python
optimizer.zero_grad()  # 清掉上一次留下的参数梯度
prediction = model(...)  # 计算预测
loss = ...               # 根据本次任务计算一个标量损失
loss.backward()          # 计算 loss 对网络参数的梯度
optimizer.step()         # 根据梯度更新参数
```

**backward 只计算梯度，step 才更新参数。** PyTorch 默认会累积梯度，所以普通训练通常每次更新前都要 `zero_grad()`。优化器应在循环外创建。

官方阅读：[训练与优化](https://docs.pytorch.org/tutorials/beginner/basics/optimization_tutorial.html)。

### batch、epoch 和学习率调整

加法训练集通常分成很多小批次（batch）。每批算一次 loss、更新一次参数；完整看过一遍训练集称为一个 epoch。因此，训练 100 个 epoch 不等于只更新 100 次。

PINN 骨架每次重新抽取坐标点，这里的“训练轮数”通常指参数更新次数。增加训练轮数后，应观察新采样点上的效果，不能只看训练 loss。

训练后期也可以降低学习率。PyTorch 的 `torch.optim.lr_scheduler` 提供这类工具，例如 `MultiStepLR`；第一次实现时不必急着使用。

## 4. 两个作业的损失如何选？

**加法是分类问题**：每一位要在 0～9 中选一个类别。骨架已经使用 `log_softmax` 输出对数概率，可以搭配 `nn.NLLLoss()` 或 `nn.functional.nll_loss`。它要求：

- 预测是各类别的对数概率，常用形状为 `[样本数, 类别数]`。
- 标签是正确类别编号，而不是独热向量，常用形状为 `[样本数]`。
- 本题要让每一位的预测与标签对应。可把七位合并进“样本数”这一维，再计算损失；先打印形状检查。

若使用 `CrossEntropyLoss`，常规输入是未经 softmax 的原始分数；它内部已包含 log_softmax 的计算。不要把这些接口的输入约定混淆。

**PINN 是求函数的问题**：没有训练用的电势答案，但有方程和边界要求。需要自己思考，怎样把“满足这些要求”写成可求导的标量损失。

作业评分的 **MAE 是电势预测与解析解之差的绝对值取平均**，只用于检查结果。训练损失不必与评分指标采用相同形式，更不能把解析解当成 PINN 的训练标签。

官方阅读：[NLLLoss 的输入、标签与形状](https://docs.pytorch.org/docs/2.6/generated/torch.nn.NLLLoss.html)。

## 5. PINN 为什么能对网络输出求导？

PyTorch 会记录张量参与了哪些运算，这份记录叫**计算图**。有了它，就能沿着计算过程求导。

```python
x = torch.tensor([[1.0], [2.0]], requires_grad=True)
u = x ** 3
du = torch.autograd.grad(u.sum(), x, create_graph=True)[0]
ddu = torch.autograd.grad(du.sum(), x, create_graph=True)[0]
print(du)   # 两个位置分别是 3、12
print(ddu)  # 两个位置分别是 6、12
```

- `requires_grad=True`：需要跟踪与这个张量有关的运算，以便求导。
- `autograd.grad(..., x)`：计算对 x 的导数；结果是元组，`[0]` 取出第一个结果。
- `create_graph=True`：求导后也记录导数的计算过程，以便继续求二阶导数，或让包含导数的损失参与训练。

这里先 `sum()`，是为了得到一个标量输出。本作业的网络独立处理每一行，因此对这些行的输出求和后求导，能得到各行对应的导数；这不是任意网络都可以直接照用的技巧。

**要分清两种求导：**

| 求导对象 | 目的 |
| --- | --- |
| 电势对坐标 x、y 的导数 | 判断网络输出是否满足微分方程 |
| loss 对网络权重、偏置的梯度 | 训练网络，让参数变得更合适 |

坐标设置 `requires_grad=True`，并不意味着优化器会修改坐标；`Adam(model.parameters(), ...)` 更新的是网络参数。

官方阅读：[自动求导入门](https://docs.pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html)、[autograd.grad 参数说明](https://docs.pytorch.org/docs/stable/generated/torch.autograd.grad.html)。

## 6. 运行和检查时常用的几件事

### CPU 与 GPU

```python
device = "cuda" if torch.cuda.is_available() else "cpu"
model = Network().to(device)
x = torch.rand(4, 2, device=device)
```

网络和它使用的输入要在同一设备上。已有张量可用 `x = x.to(device)` 转移。GPU 适合批量计算，但不保证任何小任务都比 CPU 快。

### train、eval 和 no_grad

`model.train()` 切换到训练模式，`model.eval()` 切换到评估模式；它们本身不会执行训练，也不会自动关闭求导。

只检查预测时可以写：

```python
model.eval()
with torch.no_grad():
    prediction = model(x)
```

`no_grad()` 不记录求导过程，可减少开销。**PINN 计算方程所需导数时不能放进这个区块**，即使只是在检查方程残差也一样。

`detach()` 会切断当前张量与原计算图的联系；`item()` 会转成普通数字。它们可用于数据准备或记录结果，不能用来拼接需要反向传播的损失。加法输入和标签通常不需要梯度，原骨架生成的数据可以先 `detach()`；PINN 需要求导的坐标则应保留梯度。

### 保存与读取

```python
torch.save(model.state_dict(), "model.pt")

# 重新读取时，先创建相同结构的网络
model = Network().to(device)
weights = torch.load("model.pt", map_location=device, weights_only=True)
model.load_state_dict(weights)
model.eval()
```

`state_dict()` 保存模型的参数等状态，不包含网络类的源代码，因此读取时需要相同的网络结构。

官方阅读：[保存与读取模型](https://docs.pytorch.org/tutorials/beginner/basics/saveloadrun_tutorial.html)。

## 7. 出问题时，先检查这几处

| 现象 | 先看什么 |
| --- | --- |
| 矩阵形状不匹配 | 打印输入的 `shape`，核对 Linear 的输入特征数 |
| 分类标签报错 | 标签是否为类别编号、整数类型，形状是否对应 |
| 提示 CPU / CUDA 不一致 | 模型、输入、标签是否在同一设备 |
| loss 无法 backward | 是否误用了 `detach()`、`item()`、`no_grad()` |
| PINN 二阶导数出错 | 坐标是否需要梯度，一阶求导是否设置了 `create_graph=True` |
| loss 下降但结果仍不好 | 是否只拟合了训练点、遗漏了约束；用检查网格或独立样本看结果 |

官方文档较长，先看上面对应的入门页；查具体函数时重点看 **Parameters（参数）、Shape（形状）、Examples（示例）**。可以用 `print(torch.__version__)` 查看自己的版本，再选择相应版本的 API 文档。

