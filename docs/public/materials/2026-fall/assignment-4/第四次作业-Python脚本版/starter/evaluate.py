"""与随机合法落子策略对战；这不是网站资源限制测试。"""

import argparse
import json
from pathlib import Path
import random
import time

import numpy as np
import torch

from mcts import search
from support.game import new_board, legal_moves, play_move, game_result, next_player
from support.runtime import load_model, set_seed


def play_game(model, model_player, simulations, seed):
    rng = random.Random(seed)
    board = new_board()
    player = 1
    moves = []
    for step in range(42):
        legal = legal_moves(board)
        if player == model_player:
            visits = np.asarray(search(board, player, model, simulations=simulations))
            if visits.shape != (7,) or not np.isfinite(visits).all():
                raise ValueError("search 应返回形状为 (7,) 的有限访问次数。")
            if np.any(visits < 0) or visits.sum() <= 0:
                raise ValueError("搜索访问次数应非负，且总数大于 0。")
            illegal = [col for col in range(7) if col not in legal]
            if np.any(visits[illegal] != 0):
                raise ValueError("搜索给非法列分配了访问次数，请先运行 check.py search。")
            action = int(legal[np.argmax(visits[legal])])
        else:
            action = rng.choice(legal)
        moves.append(action)
        board = play_move(board, action, player)
        done, winner = game_result(board)
        if done:
            return winner, moves
        player = next_player(player)
    raise RuntimeError("42 步后没有结束，请检查游戏规则。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", help="自己的模型参数，例如 runs/first_run/model.pt")
    parser.add_argument("--games", type=int, default=40, help="偶数；先后手各一半")
    parser.add_argument("--simulations", type=int, default=32)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--output", default="evaluation.json")
    args = parser.parse_args()
    if args.games < 2 or args.games % 2 or args.simulations < 1:
        parser.error("games 须为至少 2 的偶数，simulations 须至少为 1。")
    output = Path(args.output)
    if output.exists():
        parser.error("结果文件已存在，请用 --output 换一个文件名。")
    torch.set_num_threads(1)
    set_seed(args.seed)
    model = load_model(args.model, "cpu")
    counts = {"first": {"win": 0, "draw": 0, "loss": 0},
              "second": {"win": 0, "draw": 0, "loss": 0}}
    records = []
    started = time.perf_counter()
    for index in range(args.games):
        model_player = 1 if index % 2 == 0 else -1
        # 每组两局交换先后手；随机对手使用同一个种子。
        game_seed = args.seed + index // 2
        set_seed(game_seed)
        winner, moves = play_game(model, model_player, args.simulations, game_seed)
        result = "draw" if winner == 0 else "win" if winner == model_player else "loss"
        side = "first" if model_player == 1 else "second"
        counts[side][result] += 1
        records.append({"seed": game_seed, "model_player": model_player,
                        "winner": winner, "moves": moves})
        print("第", index + 1, "/", args.games, "局：", side, result, flush=True)
    total = {}
    for result in ("win", "draw", "loss"):
        total[result] = counts["first"][result] + counts["second"][result]
    report = {"model": str(Path(args.model).resolve()), "opponent": "random_legal",
              "games": args.games, "seed": args.seed, "simulations": args.simulations,
              "device": "cpu", "threads": 1, "counts": counts, "total": total,
              "seconds": round(time.perf_counter() - started, 3), "records": records}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("总计：胜", total["win"], "平", total["draw"], "负", total["loss"])
    print("结果保存到", output)
    print("少量对局仅供观察。比较两个模型时，请使用相同的搜索次数、局数和种子。")


if __name__ == "__main__":
    try:
        main()
    except NotImplementedError as error:
        raise SystemExit("还有未补全的代码：" + str(error))
