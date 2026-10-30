"""重力四子棋规则。棋盘第 0 行在最上方；列号为 0 至 6。"""

import numpy as np
import torch


# 预先列出所有可能连成四子的线段，判定胜负时直接检查。
LINES = []
for row in range(6):
    for col in range(7):
        for dr, dc in [(0, 1), (1, 0), (1, 1), (1, -1)]:
            if 0 <= row + 3 * dr < 6 and 0 <= col + 3 * dc < 7:
                LINES.append([(row + i * dr) * 7 + col + i * dc for i in range(4)])
LINES = np.array(LINES)


def new_board():
    return np.zeros((6, 7), dtype=np.int8)


def legal_moves(board):
    return [col for col in range(7) if board[0, col] == 0]


def game_result(board):
    lines = np.asarray(board).reshape(-1)[LINES]
    for player in [1, -1]:
        if np.any(np.all(lines == player, axis=1)):
            return True, player
    if not np.any(np.asarray(board) == 0):
        return True, 0
    return False, 0


def play_move(board, action, player):
    if player not in (1, -1):
        raise ValueError("player 应为 1 或 -1")
    if not isinstance(action, (int, np.integer)) or action not in legal_moves(board):
        raise ValueError("落子必须选择一个尚未填满的列，编号为 0 至 6")
    if game_result(board)[0]:
        raise ValueError("对局已经结束")
    result = board.copy()
    for row in range(5, -1, -1):
        if result[row, action] == 0:
            result[row, action] = player
            return result


def next_player(player):
    return -player


def result_value(winner, player):
    if winner == 0:
        return 0.0
    return 1.0 if winner == player else -1.0


def convert_value(value, from_player, to_player):
    return float(value) if from_player == to_player else -float(value)


def encode(board, player):
    layers = np.array([board == player, board == -player, board == 0], dtype=np.float32)
    return torch.from_numpy(layers)
