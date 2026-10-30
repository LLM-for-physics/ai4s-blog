"""网站适配器：只调用你完成的 MCTS，不增加额外的落子规则。"""

from pathlib import Path

import numpy as np
import torch

from mcts import search
from support.runtime import load_model, set_seed


SIMULATIONS = 32


class Bot:
    def __init__(self, context):
        torch.set_num_threads(1)
        set_seed(context["seed"])
        # 网站把单独上传的模型放在代码旁的 models/ 目录。
        root = Path(__file__).resolve().parent.parent
        self.model = load_model(root / "models" / "model.pt", "cpu")

    def act(self, observation):
        if observation.get("game") != "connect4":
            raise ValueError("这个策略只支持重力四子棋。")
        board = np.array(observation["board"], dtype=np.int8)
        if board.shape != (6, 7):
            raise ValueError("棋盘应为 6 行、7 列。")
        visits = np.asarray(search(
            board, observation["player"], self.model,
            simulations=SIMULATIONS, add_noise=False,
        ))
        legal = observation["legal_actions"]
        if visits.shape != (7,) or not np.isfinite(visits).all():
            raise ValueError("search 应返回 7 个有限的访问次数。")
        if not legal or np.any(visits < 0) or visits.sum() <= 0:
            raise ValueError("没有合法动作，或搜索访问次数不正确。")
        illegal = [col for col in range(7) if col not in legal]
        if np.any(visits[illegal] != 0):
            raise ValueError("搜索给非法列分配了访问次数，请运行 check.py search 排查。")
        # 对战时选访问最多的合法列；训练中的采样由 train.py 负责。
        return int(legal[np.argmax(visits[legal])])
