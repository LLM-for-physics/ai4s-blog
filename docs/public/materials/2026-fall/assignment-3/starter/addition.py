import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np


N = 6  # 两个 N 位数相加（在我们的作业中都取 N=6）


# 定义神经网络模型
class AdditionNet(nn.Module):
    """
    输入维数为 batchsize * (2 * N * 10)，其中 2 对应于待相加的两个 N 位数， N*10 对应于每个数的向量表示。
    例如，（这里举一个简单的例子）如果 N=2，当网络要处理 12+9 时，输入应为：
    [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1].

    输出维数为 (N+1)*10，对应于两个数相加结果的向量表示。其中 N+1 对应于结果的位数（因为存在可能的进位）。

    注意：不要修改网络结构，以防批改时出现问题。
    """
    def __init__(self):
        super(AdditionNet, self).__init__()
        self.fc1 = nn.Linear(2*N*10, 256)
        self.fc2 = nn.Linear(256, 256)
        self.fc3 = nn.Linear(256, (N+1) * 10)  # 输出 N+1 个位置，每个位置 10 个类别

    def forward(self, x: torch.Tensor):
        x = x.view(-1, 2*N*10)
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        x = self.fc3(x)
        x = x.view(-1, N+1, 10)
        x = torch.log_softmax(x, dim=2)  # 输出概率分布的对数值。用 log_softmax 代替 softmax，以防止数值不稳定
        return x

    def predict(self, x: list[tuple[int, int]]) -> list[int]:
        x = [torch.cat((int_to_vector(i), int_to_vector(j))) for i, j in x]
        x = torch.stack(x)

        self.eval()
        with torch.no_grad():
            output = self.forward(x)
            return [vector_to_int(pred) for pred in output]


def int_to_vector(num: int, is_result=False) -> torch.Tensor:
    """
    将一个自然数转换为一个PyTorch张量，张量的长度为 N*10，其中 N 为自然数的位数。
    如果 is_result 为 True，那么张量的长度为 (N+1)*10。

    is_result表示函数处理的自然数是否是两个数相加的结果。如果是，则应考虑进位。
    """
    len = N if not is_result else N+1
    vector = torch.zeros(len * 10, dtype=torch.float32)

    num_str = str(num)
    num_str = num_str.zfill(len)

    for i, digit in enumerate(num_str):
        position = i * 10 + int(digit)
        vector[position] = 1
    return vector


def vector_to_int(vector: torch.Tensor) -> int:
    """
    可能会用到的函数。如有需要，把下面的 pass 删掉，然后实现这个函数。
    """
    pass


# 准备数据
def generate_data(num_samples):
    data = []
    targets = []
    for _ in range(num_samples):
        a = np.random.randint(0, 10**N)
        b = np.random.randint(0, 10**N)
        input_vector = torch.cat((int_to_vector(a), int_to_vector(b)))
        target = a + b
        target_vector = int_to_vector(target, is_result=True)

        data.append(input_vector)
        targets.append(target_vector)

    data = torch.stack(data).requires_grad_()
    targets = torch.stack(targets).requires_grad_()

    return data, targets


# 主程序
if __name__ == "__main__":
    # 初始化模型  
    model = AdditionNet()

    # ---------------------------------------------------------------------------- #
    #                                 在这里补全训练模型的代码                         #
    # ---------------------------------------------------------------------------- #
    # hint: 损失函数可以考虑使用交叉熵损失函数

    # 保存模型
    torch.save(model.state_dict(), 'addition_model.pt')
