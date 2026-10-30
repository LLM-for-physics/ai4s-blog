"""搜索节点、网络调用及文件工具；作业所需接口见教程。"""

import json
import random
from pathlib import Path

import numpy as np
import torch

from support.game import legal_moves, encode, convert_value, game_result


class Node:
    def __init__(self, board, player, prior=1.0):
        self.board = board.copy()
        self.player = player
        self.prior = float(prior)
        self.children = {}
        self.visits = 0
        self.value_sum = 0.0

    def mean_value(self, player):
        if self.visits == 0:
            return 0.0
        return convert_value(self.value_sum / self.visits, self.player, player)


def evaluate_position(model, board, player):
    if game_result(board)[0]:
        raise ValueError("终局请直接使用 game_result 的胜负，不调用网络")
    device = next(model.parameters()).device
    state = encode(board, player).unsqueeze(0).to(device)
    was_training = model.training
    model.eval()
    try:
        with torch.no_grad():
            logits, value = model(state)
            mask = torch.full((7,), -torch.inf, device=device)
            actions = legal_moves(board)
            mask[actions] = 0
            priors = torch.softmax(logits[0] + mask, dim=0)
            if not torch.isfinite(priors).all() or not torch.isfinite(value).all():
                raise ValueError("网络产生了非有限数，请检查训练损失")
            return priors.cpu().numpy().astype(np.float64), float(value.item())
    finally:
        model.train(was_training)


def root_noise(priors, board):
    actions = legal_moves(board)
    noise = np.random.dirichlet([0.3] * len(actions))
    result = np.zeros(7, dtype=np.float64)
    result[actions] = 0.75 * np.asarray(priors)[actions] + 0.25 * noise
    return result / result.sum()


def visit_counts(root):
    counts = np.zeros(7, dtype=np.float64)
    for action, child in root.children.items():
        counts[action] = child.visits
    return counts


def sample_action(pi):
    pi = np.asarray(pi, dtype=np.float64)
    if pi.shape != (7,) or not np.isfinite(pi).all() or np.any(pi < 0):
        raise ValueError("pi 必须是长度为 7 的非负有限数组")
    if not np.isclose(pi.sum(), 1.0):
        raise ValueError("pi 的和必须为 1，请检查访问次数归一化")
    return int(np.random.choice(7, p=pi / pi.sum()))


def sample_batch(replay, batch_size, device):
    if not replay:
        raise ValueError("请先通过自我对弈产生训练数据")
    examples = random.choices(replay, k=batch_size)
    states = torch.stack([item[0] for item in examples]).to(device)
    pi = torch.tensor(np.array([item[1] for item in examples]), dtype=torch.float32, device=device)
    z = torch.tensor([item[2] for item in examples], dtype=torch.float32, device=device)
    return states, pi, z


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)


def prepare_run(path):
    directory = Path(path)
    if directory.exists():
        raise FileExistsError("训练目录已存在。请修改 RUN_DIR，避免覆盖之前的结果：" + str(directory))
    directory.mkdir(parents=True)


def save_model(model, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    weights = {name: value.detach().cpu() for name, value in model.state_dict().items()}
    torch.save(weights, path)


def load_model(path, device="cpu"):
    from model import Network
    model = Network().to(device)
    weights = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(weights)
    model.eval()
    return model


def append_log(path, row):
    with open(path, "a", encoding="utf-8") as file:
        file.write(json.dumps(row, ensure_ascii=False) + "\n")


def print_board(board):
    symbols = {0: ".", 1: "X", -1: "O"}
    for row in board:
        print(" ".join(symbols[int(cell)] for cell in row))
    print("0 1 2 3 4 5 6")
