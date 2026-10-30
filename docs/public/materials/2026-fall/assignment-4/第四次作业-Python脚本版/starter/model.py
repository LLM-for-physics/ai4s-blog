"""策略头预测各列的落子倾向，价值头预测当前行棋方的胜负。"""

import torch
from torch import nn


class Network(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(3 * 6 * 7, 128)
        self.fc2 = nn.Linear(128, 128)
        self.policy = nn.Linear(128, 7)
        self.value = nn.Linear(128, 1)

    def forward(self, x):
        x = x.reshape(-1, 3 * 6 * 7)
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        logits = self.policy(x)
        value = torch.tanh(self.value(x)).squeeze(1)
        return logits, value
