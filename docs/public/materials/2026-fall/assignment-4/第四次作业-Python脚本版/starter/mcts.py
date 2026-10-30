"""补全四个函数。接口与算法说明见 教程/01-搜索与程序接口.md。"""

import math

from support.game import legal_moves, play_move, next_player
from support.game import game_result, result_value, convert_value
from support.runtime import Node, evaluate_position, root_noise, visit_counts


def select_child(node, c_puct):
    """选择 PUCT 得分最高的子节点，返回该 Node。"""
    # TODO 1：遍历 node.children.values()，比较每个子节点的得分。
    # child.mean_value(node.player) 已把价值换成父节点行棋方的视角。
    # PUCT 公式见教程；平分时选择其中一个即可。
    raise NotImplementedError("请补全 select_child")


def expand(node, priors):
    """为合法动作建立子节点，保存到 node.children[列号]。"""
    # TODO 2：调用合法动作、落子、换手函数，为每个动作创建 Node。
    # 子节点的 prior 使用 priors[列号]。play_move 不会改变原棋盘。
    raise NotImplementedError("请补全 expand")


def backpropagate(path, value):
    """更新路径上每个节点的 visits 与 value_sum。"""
    # TODO 3：value 是 path[-1].player 的价值。
    # 用 convert_value(value, 原视角, 新视角) 换成各节点自己的视角。
    raise NotImplementedError("请补全 backpropagate")


def search(board, player, model, simulations=32, c_puct=1.0, add_noise=False):
    """返回长度为 7 的数组，表示各列在本次搜索中被访问的次数。"""
    if simulations < 1:
        raise ValueError("搜索次数至少为 1")
    if game_result(board)[0]:
        raise ValueError("已经结束的对局不能继续搜索")

    # 建立根节点。训练时加入少量噪声，让自我对弈探索不同走法。
    root = Node(board, player)
    priors, value = evaluate_position(model, board, player)
    if add_noise:
        priors = root_noise(priors, board)
    expand(root, priors)

    # TODO 4：重复 simulations 次模拟，每次从 root 开始。
    # 选择：沿已有子节点向下走，记录经过的 path。
    # 评估：终局用实际胜负；非终局调用网络，并扩展叶节点。
    # 回传：把叶节点视角的 value 沿 path 更新。
    raise NotImplementedError("请补全 search 中的模拟循环")

    return visit_counts(root)
