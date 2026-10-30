"""实践 notebook 的只读显示工具；修改参数后重新运行单元即可查看。"""

import json
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle
import numpy as np
from IPython.display import HTML, display

from .game import new_board, play_move, game_result, next_player


def _read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError, TypeError, ValueError) as error:
        raise ValueError("无法读取文件，请检查路径和文件编码：" + str(path)) from error


def _read_report(path):
    try:
        report = json.loads(_read_text(path))
    except json.JSONDecodeError as error:
        raise ValueError("报告不是有效的 JSON 文件：" + str(path)) from error
    if not isinstance(report, dict):
        raise ValueError("报告应为 evaluate.py 生成的 JSON 对象。")
    return report


def _is_integer(value):
    return isinstance(value, (int, np.integer)) and not isinstance(value, (bool, np.bool_))


def _number(row, key, line_number):
    value = row.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
        raise ValueError("日志第 " + str(line_number) + " 行的 " + key + " 应为有限数字。")
    return value


def show_training(log_path):
    """读取训练 JSONL，显示最新一轮摘要、损失和经验池样本数。"""
    rows = []
    for line_number, line in enumerate(_read_text(log_path).splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError("日志第 " + str(line_number) + " 行不是完整的 JSON。") from error
        if not isinstance(row, dict):
            raise ValueError("日志每行应为一个 JSON 对象。")
        for key in ("iteration", "positions", "loss"):
            _number(row, key, line_number)
        if row["iteration"] < 1 or row["positions"] < 0:
            raise ValueError("日志的 iteration 应至少为 1，positions 应非负。")
        if "seconds" in row:
            _number(row, "seconds", line_number)
        rows.append(row)
    if not rows:
        raise ValueError("日志没有训练记录，请先完成至少一轮训练。")

    latest = rows[-1]
    print("最新记录：第", latest["iteration"], "轮；经验池", latest["positions"],
          "个局面；本轮记录的损失", format(latest["loss"], ".5f"))
    if "seconds" in latest:
        print("累计用时：", format(latest["seconds"], ".1f"), "秒")
    print("损失用于观察训练变化；棋力还需要通过对局比较。")

    iterations = [row["iteration"] for row in rows]
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.4))
    axes[0].plot(iterations, [row["loss"] for row in rows], marker="o")
    axes[0].set_title("Training loss")
    axes[0].set_ylabel("Loss")
    axes[1].plot(iterations, [row["positions"] for row in rows], marker="o", color="#2b7a4b")
    axes[1].set_title("Replay buffer")
    axes[1].set_ylabel("Positions")
    for axis in axes:
        axis.set_xlabel("Iteration")
        axis.grid(alpha=0.25)
    fig.tight_layout()
    plt.show()
    plt.close(fig)


def _validated_counts(report):
    counts = report.get("counts")
    if not isinstance(counts, dict):
        raise ValueError("报告缺少 counts，请使用 evaluate.py 生成的结果。")
    all_counts = {}
    for side in ("first", "second", "total"):
        values = report.get("total") if side == "total" else counts.get(side)
        if not isinstance(values, dict):
            raise ValueError("报告缺少 " + side + " 的胜平负统计。")
        for result in ("win", "draw", "loss"):
            value = values.get(result)
            if not _is_integer(value) or value < 0:
                raise ValueError(side + " 中的 " + result + " 应为非负整数。")
        all_counts[side] = values
    for result in ("win", "draw", "loss"):
        if all_counts["total"][result] != all_counts["first"][result] + all_counts["second"][result]:
            raise ValueError("报告的总计与先后手统计不一致。")
    games = sum(all_counts["total"][key] for key in ("win", "draw", "loss"))
    if games == 0:
        raise ValueError("报告没有已完成的对局。")
    if "games" in report and (not _is_integer(report["games"]) or report["games"] != games):
        raise ValueError("报告的 games 与胜平负总数不一致。")
    return all_counts


def compare_results(before_path, after_path):
    """显示两份评测报告中，模型先手、后手以及合计的胜平负。"""
    before = _read_report(before_path)
    after = _read_report(after_path)
    before_counts = _validated_counts(before)
    after_counts = _validated_counts(after)
    rows = []
    side_names = {"first": "先手（红方）", "second": "后手（黄方）", "total": "合计"}
    for label, counts in (("训练前", before_counts), ("训练后", after_counts)):
        for side in ("first", "second", "total"):
            values = counts[side]
            games = sum(values[key] for key in ("win", "draw", "loss"))
            rate = format(100 * values["win"] / games, ".1f") + "%" if games else "—"
            cells = [label, side_names[side], str(games), str(values["win"]),
                     str(values["draw"]), str(values["loss"]), rate]
            rows.append("<tr>" + "".join("<td>" + cell + "</td>" for cell in cells) + "</tr>")
    headings = ["模型", "行棋顺序", "局数", "胜", "平", "负", "胜率"]
    header = "<tr>" + "".join("<th>" + item + "</th>" for item in headings) + "</tr>"
    display(HTML("<table><thead>" + header + "</thead><tbody>" + "".join(rows) + "</tbody></table>"))
    different = [key for key in ("games", "seed", "simulations", "opponent", "device", "threads")
                 if before.get(key) != after.get(key)]
    if different:
        print("两份报告的这些评测条件不同：", "、".join(different), "。建议统一后再比较。")
    print("少量对局会有波动。对随机落子策略的胜率只能作为基础观察，不能代表对所有对手的棋力。")


def show_board(board, player=1, model_player=None, title=None):
    """显示棋盘。player 是下一行动方；终局时改为显示胜负。"""
    try:
        board = np.asarray(board)
        valid_board = board.shape == (6, 7) and np.isin(board, [-1, 0, 1]).all()
    except (TypeError, ValueError) as error:
        raise ValueError("board 应为 6×7 的棋盘，格子值只能为 -1、0、1。") from error
    if not valid_board:
        raise ValueError("board 应为 6×7 的棋盘，格子值只能为 -1、0、1。")
    if not _is_integer(player) or player not in (1, -1):
        raise ValueError("player 应为 1（红方）或 -1（黄方）。")
    if model_player is not None and (not _is_integer(model_player) or model_player not in (1, -1)):
        raise ValueError("model_player 应为 1、-1，或省略为 None。")
    if title is not None and not isinstance(title, str):
        raise ValueError("title 应为字符串，或省略为 None。")

    names = {1: "红方（先手）", -1: "黄方（后手）"}
    done, winner = game_result(board)
    if done:
        print("对局结束：平局。" if winner == 0 else "对局结束：" + names[winner] + "获胜。")
    else:
        print("下一行动方：", names[player])
    if model_player is not None:
        print("本局被评测的模型：", names[model_player])
    colors = {0: "#f5f6fa", 1: "#e34b43", -1: "#f5c842"}
    fig, axis = plt.subplots(figsize=(6.3, 5.6))
    axis.add_patch(Rectangle((-0.5, -0.5), 7, 6, facecolor="#2864a5"))
    for row in range(6):
        for col in range(7):
            axis.add_patch(Circle((col, row), 0.40, facecolor=colors[int(board[row, col])],
                                  edgecolor="#214e7c", linewidth=1.2))
    axis.set_xlim(-0.5, 6.5)
    axis.set_ylim(5.5, -0.5)
    axis.set_aspect("equal")
    axis.set_xticks(range(7))
    axis.set_yticks([])
    axis.set_xlabel("Column")
    axis.set_title(title if title is not None else "Connect Four")
    fig.tight_layout()
    plt.show()
    plt.close(fig)


def show_replay(report_path, game_index=0, move=None):
    """重放一局。game_index 从 0 开始；move 为已落子步数，None 表示终局。"""
    report = _read_report(report_path)
    records = report.get("records")
    if not isinstance(records, list) or not records:
        raise ValueError("报告没有棋谱 records，请使用 evaluate.py 生成的结果。")
    if not _is_integer(game_index) or not 0 <= game_index < len(records):
        raise ValueError("game_index 应为 0 至 " + str(len(records) - 1) + " 的整数。")
    record = records[game_index]
    if not isinstance(record, dict):
        raise ValueError("所选棋谱应为 JSON 对象。")
    moves = record.get("moves")
    if not isinstance(moves, list) or not 1 <= len(moves) <= 42:
        raise ValueError("所选棋谱的 moves 应包含 1 至 42 个落子列号。")
    model_player = record.get("model_player")
    winner = record.get("winner")
    if not _is_integer(model_player) or model_player not in (1, -1):
        raise ValueError("棋谱的 model_player 应为 1 或 -1。")
    if not _is_integer(winner) or winner not in (1, -1, 0):
        raise ValueError("棋谱的 winner 应为 1、-1 或 0。")
    if move is None:
        move = len(moves)
    if not _is_integer(move) or not 0 <= move <= len(moves):
        raise ValueError("move 应为 0 至 " + str(len(moves)) + " 的整数，或用 None 显示终局。")

    board = new_board()
    selected_board = board.copy()
    player = 1
    for step, action in enumerate(moves, start=1):
        if not _is_integer(action) or not 0 <= action <= 6:
            raise ValueError("棋谱第 " + str(step) + " 步应为 0 至 6 的整数列号。")
        try:
            board = play_move(board, action, player)
        except ValueError as error:
            raise ValueError("棋谱第 " + str(step) + " 步不合法：" + str(error)) from error
        if step == move:
            selected_board = board.copy()
        player = next_player(player)
    done, actual_winner = game_result(board)
    if not done or actual_winner != winner:
        raise ValueError("棋谱未到终局，或 winner 与实际胜负不一致。")
    print("第", game_index + 1, "/", len(records), "局；已落子", move, "/", len(moves), "步。")
    print("修改 game_index 可换一局；修改 move 可查看中间局面（0 表示空棋盘）。")
    next_to_play = 1 if move % 2 == 0 else -1
    show_board(selected_board, player=next_to_play, model_player=model_player,
               title="Game " + str(game_index + 1) + " | Move " + str(move) + "/" + str(len(moves)))
