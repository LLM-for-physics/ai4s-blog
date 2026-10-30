"""检查完成情况，导出网站需要的 code.zip 和单独的 model.pt。"""

import argparse
import ast
from pathlib import Path
import shutil
import zipfile

import numpy as np
import torch

from mcts import search
from support.game import new_board
from support.runtime import load_model, set_seed


def check_completed(path):
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Raise):
            error = node.exc
            if isinstance(error, ast.Call):
                error = error.func
            if isinstance(error, ast.Name) and error.id == "NotImplementedError":
                raise ValueError(str(path.name) + " 第 " + str(node.lineno)
                                 + " 行仍有 NotImplementedError，请先完成对应部分。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", help="训练生成的模型参数文件")
    parser.add_argument("--out", default="upload", help="新的输出目录；不覆盖旧文件")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    output = Path(args.out).resolve()
    if output.exists():
        parser.error("输出目录已存在，请用 --out 指定一个新目录。")
    for name in ("mcts.py", "train.py"):
        check_completed(root / name)
    torch.set_num_threads(1)
    set_seed(2026)
    model = load_model(args.model, "cpu")
    # 加载、前向、搜索都通过后才导出，避免把错配的结构与权重传到网站。
    counts = np.asarray(search(new_board(), 1, model, simulations=8))
    if counts.shape != (7,) or not np.isfinite(counts).all() or np.any(counts < 0):
        raise ValueError("搜索结果格式错误，请先运行 python check.py search。")
    if not np.isclose(counts.sum(), 8):
        raise ValueError("根节点子节点访问次数之和应为 8，请先检查搜索。")
    names = ["model.py", "mcts.py", "support/__init__.py",
             "support/game.py", "support/runtime.py", "support/bot.py"]
    for name in names:
        if not (root / name).is_file():
            raise ValueError("缺少文件：" + name)
    output.mkdir(parents=True)
    with zipfile.ZipFile(output / "code.zip", "x", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("strategy.py", "from support.bot import Bot\n")
        for name in names:
            archive.write(root / name, name)
    shutil.copyfile(args.model, output / "model.pt")
    print("已导出到", output)
    print("网站游戏选择重力四子棋；代码上传 code.zip，模型单独上传 model.pt。")
    print("在服务器上训练后，可在 VS Code 中将这两个文件分别右键下载到本地，再上传；无需解压。")
    print("该命令只检查本地基本运行，平台会另行检查运行时间和资源使用。")


if __name__ == "__main__":
    try:
        main()
    except (NotImplementedError, ValueError, FileNotFoundError, RuntimeError) as error:
        raise SystemExit("导出未完成：" + str(error))
