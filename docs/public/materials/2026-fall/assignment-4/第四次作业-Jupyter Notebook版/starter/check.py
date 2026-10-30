"""分阶段检查。无需修改本文件；通过检查不等于训练出的模型已经很强。"""

import argparse
from unittest.mock import patch

import numpy as np
import torch

from model import Network
from support.game import (new_board, legal_moves, play_move, game_result,
                          next_player, result_value, convert_value, encode)
from support.runtime import Node, evaluate_position, set_seed


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def make_position(actions):
    board = new_board()
    player = 1
    for action in actions:
        require(not game_result(board)[0], "检查用棋谱不能在终局后继续落子。")
        board = play_move(board, action, player)
        player = next_player(player)
    return board, player


def check_support():
    board = new_board()
    after = play_move(board, 3, 1)
    require(board.shape == (6, 7) and np.count_nonzero(board) == 0,
            "play_move 不应改变输入棋盘。")
    require(after[5, 3] == 1 and np.count_nonzero(after) == 1, "重力落子位置错误。")
    full_column, player = make_position([0, 0, 0, 0, 0, 0])
    require(0 not in legal_moves(full_column), "满列不应是合法动作。")
    for actions in ([0, 1, 0, 1, 0, 1, 0], [0, 6, 1, 6, 2, 5, 3]):
        won, player = make_position(actions)
        require(game_result(won) == (True, 1), "未正确识别四连终局。")
    state = encode(after, -1)
    require(tuple(state.shape) == (3, 6, 7), "编码形状应为 (3, 6, 7)。")
    require(state[1, 5, 3].item() == 1 and state[0].sum().item() == 0,
            "编码应按当前行动方，而不是固定红方的视角。")
    require(result_value(1, -1) == -1 and result_value(0, 1) == 0,
            "胜负标签的视角转换错误。")
    require(convert_value(0.4, -1, 1) == -0.4, "双方价值应互为相反数。")
    model = Network()
    priors, value = evaluate_position(model, full_column, player)
    require(priors.shape == (7,) and np.isclose(priors.sum(), 1), "落子概率没有归一化。")
    require(priors[0] == 0 and np.all(priors >= 0), "网络推理没有屏蔽满列。")
    require(np.isfinite(value) and -1 <= value <= 1, "价值输出应在 [-1, 1] 内。")
    print("[通过] 游戏规则、编码、价值转换与网络接口")


def check_search():
    import mcts

    board = new_board()
    root = Node(board, 1)
    priors = np.array([0.1, 0.1, 0.1, 0.4, 0.1, 0.1, 0.1])
    mcts.expand(root, priors)
    require(set(root.children) == set(range(7)), "expand 应为每个合法列创建子节点。")
    require(np.count_nonzero(root.board) == 0, "expand 不应改变根节点的棋盘。")
    for col, child in root.children.items():
        require(child.player == -1 and child.board[5, col] == 1,
                "子节点应保存落子后的棋盘，并轮到另一方。")
        require(np.count_nonzero(child.board) == 1, "子节点棋盘可能共享了同一数组。")
        require(np.isclose(child.prior, priors[col]), "子节点先验概率错误。")
    require(mcts.select_child(root, 1.0) is root.children[3],
            "未访问时，选择应考虑先验概率与探索项。")
    root.children[1].visits = 1
    root.children[1].value_sum = -0.8
    root.children[3].visits = 1
    root.children[3].value_sum = 0.7
    require(mcts.select_child(root, 0.0) is root.children[1],
            "选择应使用父节点行动方的价值视角；c_puct=0 时只比较价值。")
    path = [Node(board, 1), Node(board, -1), Node(board, 1)]
    mcts.backpropagate(path, 0.6)
    require([node.visits for node in path] == [1, 1, 1], "回传应更新整条路径的访问次数。")
    require(np.allclose([node.value_sum for node in path], [0.6, -0.6, 0.6]),
            "回传的 value 来自叶节点行动方，请转换到各节点自己的视角。")
    mcts.backpropagate(path, -0.2)
    require([node.visits for node in path] == [2, 2, 2], "回传应累加，不应覆盖访问次数。")
    require(np.allclose([node.value_sum for node in path], [0.4, -0.4, 0.4]),
            "回传应累加价值，不应覆盖旧值。")
    full_column, player = make_position([0, 0, 0, 0, 0, 0])
    full_root = Node(full_column, player)
    mcts.expand(full_root, np.ones(7) / 7)
    require(0 not in full_root.children, "expand 不应扩展满列。")
    model = Network()
    for board, player in [(new_board(), 1), (full_column, player)]:
        before = board.copy()
        counts = np.asarray(mcts.search(board, player, model, simulations=16))
        require(counts.shape == (7,) and np.isfinite(counts).all(),
                "search 应返回 7 个有限的访问次数。")
        require(np.all(counts >= 0) and np.isclose(counts.sum(), 16),
                "每次模拟应访问一个根节点子节点，16 次模拟的访问次数之和应为 16。")
        for col in range(7):
            if col not in legal_moves(board):
                require(counts[col] == 0, "非法列的访问次数应为 0。")
        require(np.array_equal(board, before), "搜索不能改变真实对局的输入棋盘。")
    # 用固定先验只检查终局分支是否使用真实结果，不要求短搜索掌握战术。
    board, player = make_position([0, 1, 0, 1, 0, 2])
    with patch("mcts.evaluate_position", return_value=(np.array([1., 0, 0, 0, 0, 0, 0]), 0.0)) as evaluator:
        with patch("mcts.backpropagate", wraps=mcts.backpropagate) as backup:
            mcts.search(board, player, model, simulations=1)
    require(evaluator.call_count == 1, "终局应使用真实胜负，不应再调用网络评估。")
    require(backup.call_count == 1, "一次模拟应回传一次结果。")
    arguments = backup.call_args
    value = arguments.args[1] if len(arguments.args) > 1 else arguments.kwargs["value"]
    require(value == -1, "终局叶节点轮到败方，传给回传函数的价值应为 -1。")
    print("[通过] 选择、扩展、回传与搜索主循环的基本约定")


def check_training():
    import train

    model = Network()
    # 固定一盘短棋谱，单独检查数据流程，不依赖此时模型的棋力。
    for actions in ([0, 1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 2, 1, 2, 1]):
        positions = []
        expected_pi = []
        board = new_board()
        player = 1
        counts_list = []
        for action in actions:
            positions.append((encode(board, player), player))
            counts = np.zeros(7)
            counts[legal_moves(board)] = 1
            counts[action] = 5
            counts_list.append(counts)
            expected_pi.append(counts / counts.sum())
            board = play_move(board, action, player)
            player = next_player(player)
        done, winner = game_result(board)
        require(done, "固定测试棋谱应当结束。")
        with patch("train.search", side_effect=counts_list) as search_mock:
            with patch("train.sample_action", side_effect=actions) as action_mock:
                examples = train.self_play(model, 8)
        require(len(examples) == len(actions), "每次落子前应记录一个训练样本。")
        require(search_mock.call_count == len(actions), "应每步调用一次搜索。")
        require(action_mock.call_count == len(actions), "应按 pi 采样本次动作。")
        for index, (state, pi, z) in enumerate(examples):
            require(torch.equal(state.cpu(), positions[index][0].cpu()),
                    "样本应保存落子前的局面，并采用当时行动方的编码。")
            require(np.allclose(pi, expected_pi[index]),
                    "策略标签应保留完整的访问次数分布，不应只保留最优列。")
            require(np.allclose(action_mock.call_args_list[index].args[0], pi),
                    "实际采样与保存的策略标签应使用同一个 pi。")
            require(z == result_value(winner, positions[index][1]),
                    "价值标签必须来自该样本行动方的视角。")
    # 固定输出便于核对损失；这里不放 compute_loss 的参考实现。
    class Probe(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.logits = torch.nn.Parameter(torch.zeros(2, 7))
            self.values = torch.nn.Parameter(torch.tensor([0.2, -0.4]))

        def forward(self, states):
            return self.logits, self.values

    probe = Probe()
    states = torch.stack([encode(new_board(), 1), encode(new_board(), -1)])
    target_pi = torch.tensor([[0.4, 0.2, 0.1, 0.1, 0.1, 0.05, 0.05],
                              [0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.3]])
    target_z = torch.tensor([1.0, -1.0])
    loss = train.compute_loss(probe, states, target_pi, target_z)
    require(torch.is_tensor(loss) and loss.ndim == 0 and torch.isfinite(loss).item(),
            "compute_loss 应返回有限的标量 Tensor。")
    require(abs(loss.item() - 2.445910149) < 1e-6,
            "请核对策略分布交叉熵、价值均方误差，以及求和/平均的维度。")
    loss.backward()
    expected_policy_grad = torch.tensor([
        [-0.12857143, -0.02857143, 0.02142857, 0.02142857, 0.02142857, 0.04642857, 0.04642857],
        [0.02142857, 0.02142857, 0.02142857, 0.02142857, 0.02142857, -0.02857143, -0.07857143],
    ])
    require(probe.logits.grad is not None and probe.values.grad is not None,
            "两个输出都应收到梯度，请勿在损失计算中使用 item() 或 detach()。")
    require(torch.allclose(probe.logits.grad, expected_policy_grad, atol=1e-6),
            "策略损失的梯度不正确，请保留完整的策略分布。")
    require(torch.allclose(probe.values.grad, torch.tensor([-0.8, 0.6]), atol=1e-6),
            "价值损失的梯度不正确，请检查标签形状与平均方式。")
    print("[通过] 自我对弈样本、双方胜负标签、策略/价值损失及梯度")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["support", "search", "training"])
    args = parser.parse_args()
    torch.set_num_threads(1)
    set_seed(2026)
    check_support()
    if args.stage in ("search", "training"):
        check_search()
    if args.stage == "training":
        check_training()
    print("本阶段检查通过。它用于发现常见错误，不替代阅读代码和实际对战。")


if __name__ == "__main__":
    try:
        main()
    except NotImplementedError as error:
        raise SystemExit("尚未完成：" + str(error) + "\n请按教程补全对应位置后再次检查。")
    except AssertionError as error:
        raise SystemExit("检查未通过：" + str(error))
