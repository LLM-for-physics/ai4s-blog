"""Notebook 测试版的源码快照与脚本运行工具；不含作业答案。"""

import ast
import builtins
import dis
import importlib
import inspect
import hashlib
import json
import linecache
import os
from pathlib import Path
import shutil
import subprocess
import sys
import textwrap
import types


SEARCH_NAMES = ("select_child", "expand", "backpropagate", "search")
TRAIN_NAMES = ("self_play", "compute_loss")
CONFIG_NAMES = ("ITERATIONS", "GAMES_PER_ITERATION", "SIMULATIONS", "BATCH_SIZE",
                "TRAIN_STEPS", "MEMORY_SIZE", "LEARNING_RATE", "DEVICE")
COMMON_IMPORTS = """import math
import time
import numpy as np
import torch
from torch import nn
import torch.nn.functional as F
from support.game import new_board, legal_moves, play_move, next_player
from support.game import game_result, result_value, convert_value, encode
from support.runtime import Node, evaluate_position, root_noise, visit_counts
from support.runtime import sample_action, sample_batch, set_seed
from support.runtime import prepare_run, save_model, load_model, append_log, print_board
"""


def _code_key(code):
    # 排除文件名和行号；相同函数在新文件中的位置必然不同。
    constants = tuple(_code_key(value) if isinstance(value, types.CodeType) else value
                      for value in code.co_consts)
    return (code.co_code, constants, code.co_names, code.co_varnames,
            code.co_argcount, code.co_posonlyargcount, code.co_kwonlyargcount,
            code.co_freevars, code.co_cellvars, code.co_flags & 1023)


def _compiled_definition(source, name):
    module = compile(source, "<notebook-snapshot>", "exec")
    return next(code for code in module.co_consts
                if isinstance(code, types.CodeType) and code.co_name == name)


def _check_source(source, name, allow_incomplete=False):
    tree = ast.parse(source)
    definition = tree.body[0]
    if len(tree.body) != 1 or not isinstance(definition, (ast.FunctionDef, ast.ClassDef)):
        raise ValueError(name + " 必须是独立的普通函数或类定义。")
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.decorator_list:
            raise ValueError(name + " 使用了装饰器，测试版不自动导出这种写法。")
        if not allow_incomplete and isinstance(node, ast.Name) and node.id in ("NotImplementedError", "NotImplemented"):
            raise ValueError(name + " 尚未补全：请完成后删除对应的未实现提醒，再运行定义单元。")
        if isinstance(node, ast.FunctionDef):
            body = [item for item in node.body if not (
                isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant)
                and isinstance(item.value.value, str))]
            if not allow_incomplete and (not body or all(isinstance(item, ast.Pass) or (
                isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant)
                and item.value.value is Ellipsis) for item in body)):
                raise ValueError(name + " 仍有空函数，请完成后重新运行定义单元。")
    return definition


def _check_defaults(function, definition):
    try:
        expected = tuple(ast.literal_eval(item) for item in definition.args.defaults)
        kw_expected = {arg.arg: ast.literal_eval(value)
                       for arg, value in zip(definition.args.kwonlyargs,
                                             definition.args.kw_defaults)
                       if value is not None}
    except (ValueError, TypeError):
        raise ValueError(function.__name__ + " 的默认参数请使用数字、布尔值等字面量。") from None
    if expected != (function.__defaults__ or ()) or kw_expected != (function.__kwdefaults__ or {}):
        raise ValueError(function.__name__ + " 的当前默认参数与源码不一致，请重新运行定义单元。")


def _function_source(function, name, allow_incomplete=False):
    if not inspect.isfunction(function) or function.__name__ != name:
        raise ValueError("请先在 Notebook 中定义普通函数 " + name + "，并运行它所在的单元。")
    try:
        source = textwrap.dedent(inspect.getsource(function)).strip() + "\n"
    except (OSError, TypeError):
        raise ValueError("无法读取 " + name + " 的已运行源码，请重新运行定义单元。") from None
    definition = _check_source(source, name, allow_incomplete)
    if not isinstance(definition, ast.FunctionDef) or definition.name != name:
        raise ValueError(name + " 的定义与当前对象不匹配，请重新运行定义单元。")
    if _code_key(function.__code__) != _code_key(_compiled_definition(source, name)):
        raise ValueError(name + " 的源码与当前运行对象不一致，请重新运行定义单元。")
    _check_defaults(function, definition)
    return source


def _network_source(network):
    if not inspect.isclass(network) or network.__name__ != "Network":
        raise ValueError("请先运行 class Network 的定义单元。")
    forward = network.__dict__.get("forward")
    if not inspect.isfunction(forward):
        raise ValueError("Network 需要自己定义普通 forward 方法。")
    cell_source = "".join(linecache.getlines(forward.__code__.co_filename))
    if not cell_source:
        raise ValueError("无法读取 Network 的已运行源码，请重新运行整个类定义单元。")
    candidates = [node for node in ast.parse(cell_source).body
                  if isinstance(node, ast.ClassDef) and node.name == "Network"
                  and node.lineno <= forward.__code__.co_firstlineno <= node.end_lineno]
    if len(candidates) != 1:
        raise ValueError("请把 class Network 放在一个普通代码单元的顶层，并重新运行。")
    definition = candidates[0]
    if len(definition.bases) != 1 or ast.unparse(definition.bases[0]) not in ("nn.Module", "torch.nn.Module") or definition.keywords:
        raise ValueError("测试版的 Network 请直接继承 nn.Module 或 torch.nn.Module。")
    source = ast.get_source_segment(cell_source, definition).strip() + "\n"
    _check_source(source, "Network")
    methods = {}
    for node in definition.body:
        if isinstance(node, ast.FunctionDef):
            methods[node.name] = node
        elif not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
                  and isinstance(node.value.value, str)):
            raise ValueError("测试版支持在 Network 中定义普通方法；类常量请改为 __init__ 中的属性。")
    actual_methods = {name: value for name, value in network.__dict__.items()
                      if inspect.isfunction(value)}
    if set(methods) != set(actual_methods):
        raise ValueError("Network 的方法与类定义不一致，请重新运行整个类定义单元。")
    if any(not name.startswith("__") and name not in actual_methods for name in network.__dict__):
        raise ValueError("Network 有单独添加的类属性，请改为 __init__ 中的实例属性并重新运行类定义。")
    compiled = _compiled_definition(source, "Network")
    code_methods = {code.co_name: code for code in compiled.co_consts
                    if isinstance(code, types.CodeType)}
    for name, function in actual_methods.items():
        if _code_key(function.__code__) != _code_key(code_methods[name]):
            raise ValueError("Network." + name + " 已被单独修改，请重新运行整个类定义单元。")
        _check_defaults(function, methods[name])
    return source, actual_methods.values()


def _check_globals(function, allowed, is_method=False):
    if function.__closure__:
        for name, cell in zip(function.__code__.co_freevars, function.__closure__):
            if not (is_method and name == "__class__" and cell.cell_contents is allowed["Network"]):
                raise ValueError(function.__name__ + " 捕获了外部变量；请在函数内部定义或通过参数传入。")
    pending = [function.__code__]
    while pending:
        code = pending.pop()
        for value in code.co_consts:
            if isinstance(value, types.CodeType):
                pending.append(value)
        for instruction in dis.get_instructions(code):
            if instruction.opname == "IMPORT_NAME" and instruction.argval.split(".")[0] in ("model", "mcts", "train", "support"):
                raise ValueError(function.__name__ + " 在函数内部导入了本作业模块。请直接使用准备单元已提供的函数名，不要在函数内部重新导入，以免调用旧代码。")
            if instruction.opname not in ("LOAD_GLOBAL", "LOAD_NAME"):
                continue
            name = instruction.argval
            if name in ("globals", "locals", "eval", "exec", "__import__"):
                raise ValueError("测试版不导出依赖动态全局环境的函数：" + function.__name__)
            if name in function.__globals__:
                if name not in allowed or function.__globals__[name] is not allowed[name]:
                    raise ValueError(function.__name__ + " 依赖未支持或被替换的全局名 " + name
                                     + "。请使用教程中的导入，将额外常量放在函数内部或作为参数传入。")
            elif not hasattr(builtins, name):
                raise ValueError(function.__name__ + " 使用了未定义的名字：" + name)


def snapshot_code(starter_dir, output_dir, namespace, stage="training", config=None):
    """导出当前已运行且补全的核心定义，返回全新目录中的 src 路径。

    支持教程中的 math/time/np/torch/nn、support 接口以及七个核心定义。
    不自动收集额外的全局常量、外部函数、装饰器或新模块。
    stage='search' 只读取网络与搜索定义；训练函数暂用原模板，不需提前运行。
    train.py 附带原始主循环，config 可更新其参数；重跑输出位于 src 同级的 rerun。
    """
    starter = Path(starter_dir).resolve()
    output = Path(output_dir).resolve()
    if stage not in ("search", "training"):
        raise ValueError("stage 只能是 search 或 training。")
    if output == starter or starter in output.parents or output in starter.parents:
        raise ValueError("请选择 starter 之外的全新独立目录，不要覆盖或包含 starter。")
    if output.exists() or output.is_symlink():
        raise FileExistsError("快照目录已存在，请换一个名字：" + str(output))
    needed = ["check.py", "evaluate.py", "export.py", "requirements.txt", "train.py",
              "support/__init__.py", "support/game.py", "support/runtime.py", "support/bot.py"]
    for name in needed:
        if not (starter / name).is_file():
            raise FileNotFoundError("starter 缺少文件：" + name)
    original_train = (starter / "train.py").read_text(encoding="utf-8-sig")
    train_tree = ast.parse(original_train)
    active_functions = SEARCH_NAMES + (TRAIN_NAMES if stage == "training" else ())
    definitions = {}
    for name in ("Network",) + active_functions:
        if name not in namespace:
            raise ValueError("还没有定义 " + name + "，请先运行对应的代码单元。")
        definitions[name] = namespace[name]
    sources = {}
    sources["Network"], methods = _network_source(definitions["Network"])
    for name in active_functions:
        sources[name] = _function_source(definitions[name], name)
    if stage == "search":
        # 搜索检查不会调用训练函数；沿用原模板，学生可以按顺序逐段学习。
        for name in TRAIN_NAMES:
            candidates = [node for node in train_tree.body
                          if isinstance(node, ast.FunctionDef) and node.name == name]
            if len(candidates) != 1:
                raise ValueError("starter/train.py 缺少唯一的 " + name + " 定义，请使用作业原始模板。")
            sources[name] = ast.get_source_segment(original_train, candidates[0]).strip() + "\n"
            _check_source(sources[name], name, allow_incomplete=True)
    allowed = {}
    exec(COMMON_IMPORTS, allowed)
    for module_name in ("support.game", "support.runtime"):
        location = Path(sys.modules[module_name].__file__).resolve()
        if starter not in location.parents:
            raise ValueError(module_name + " 不是来自所选 starter，请重启内核并运行准备单元。")
    for function in methods:
        _check_globals(function, dict(allowed, Network=definitions["Network"]), is_method=True)
    for name in active_functions:
        names = SEARCH_NAMES if name in SEARCH_NAMES else ("Network", "search") + TRAIN_NAMES
        _check_globals(definitions[name], dict(allowed, **{key: definitions[key] for key in names}))
    if definitions["Network"].__bases__ != (allowed["nn"].Module,):
        raise ValueError("Network 的继承关系被修改，请重新运行类定义单元。")
    guards = [node for node in train_tree.body if isinstance(node, ast.If)
              and ast.dump(node.test) == ast.dump(ast.parse('__name__ == "__main__"', mode="eval").body)]
    if len(guards) != 1:
        raise ValueError("starter/train.py 的主训练循环不符合预期，请使用作业原始模板。")
    settings = dict(config or {})
    if set(settings) - set(CONFIG_NAMES):
        raise ValueError("config 只支持这些参数：" + ", ".join(CONFIG_NAMES))
    main = guards[0]
    final_settings = {}
    for node in main.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        if name not in CONFIG_NAMES and name != "RUN_DIR":
            continue
        value = "../rerun" if name == "RUN_DIR" else settings.get(name, ast.literal_eval(node.value))
        if name in CONFIG_NAMES:
            if name == "DEVICE":
                valid = isinstance(value, str) and bool(value)
            elif name == "LEARNING_RATE":
                valid = type(value) in (int, float) and value > 0
            else:
                valid = type(value) is int and value > 0
            if not valid:
                raise ValueError("config 中的 " + name + " 值不正确。")
        if name == "RUN_DIR":
            node.value = ast.parse('str(Path(__file__).resolve().parent.parent / "rerun")', mode="eval").body
        else:
            node.value = ast.Constant(value=value)
        final_settings[name] = value
    if set(CONFIG_NAMES) - set(final_settings):
        raise ValueError("starter/train.py 缺少预期的训练参数。")
    main_loop = ast.unparse(ast.fix_missing_locations(main))
    generated = {
        "model.py": COMMON_IMPORTS + "\n" + sources["Network"],
        "mcts.py": COMMON_IMPORTS + "\n" + "\n".join(sources[name] for name in SEARCH_NAMES),
        "train.py": COMMON_IMPORTS + "from pathlib import Path\nfrom model import Network\nfrom mcts import search\n\n"
                    + "\n".join(sources[name] for name in TRAIN_NAMES) + "\n" + main_loop + "\n",
    }
    for name, source in generated.items():
        compile(source, name, "exec")
    output.mkdir(parents=True, exist_ok=False)
    source_dir = output / "src"
    (source_dir / "support").mkdir(parents=True)
    for name in needed:
        if name != "train.py":
            shutil.copy2(starter / name, source_dir / name)
    for name in ("notebook_tools.py", "notebook_view.py"):
        if (starter / "support" / name).is_file():
            shutil.copy2(starter / "support" / name, source_dir / "support" / name)
    for name, source in generated.items():
        (source_dir / name).write_text(source, encoding="utf-8")
    manifest = {"definitions": list(definitions), "stage": stage, "training_loop": "starter loop, captured config",
                "note": "Core sources come from executed objects; no notebook save is required."}
    if stage == "search":
        manifest["template_placeholders"] = list(TRAIN_NAMES)
    manifest["sha256"] = {path.relative_to(source_dir).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                          for path in source_dir.rglob("*.py")}
    (output / "snapshot.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (output / "config.json").write_text(json.dumps(final_settings, indent=2), encoding="utf-8")
    print("已保存当前已运行代码：", source_dir)
    return source_dir


def check_notebook(starter_dir, assignment_dir, namespace, stage):
    """检查当前已运行的定义，自动保留不重名的源码副本，返回是否通过。"""
    try:
        if stage not in ("search", "training"):
            raise ValueError("stage 只能是 search 或 training。")
        checks_dir = Path(assignment_dir).resolve() / "notebook_checks"
        number = 1
        check_dir = checks_dir / (stage + "-" + str(number).zfill(3))
        while check_dir.exists() or check_dir.is_symlink():
            number += 1
            check_dir = checks_dir / (stage + "-" + str(number).zfill(3))
        source_dir = snapshot_code(starter_dir, check_dir, namespace, stage=stage)
        run_script(source_dir, "check.py", [stage])
    except (ValueError, NotImplementedError, FileExistsError, RuntimeError) as error:
        print("本次检查未通过：", error)
        print("请按上方提示修改对应函数，重新运行它的定义格，再运行本检查格。")
        return False
    return True


def load_training(src_dir):
    """从快照独立加载 train 模块，不替换 Notebook 已导入的原模板模块。

    返回模块的 Network/self_play/compute_loss/search 等绑定均属于该快照。
    使用其模型实例与纯 state_dict 保存函数；不要序列化整个 Python 类对象。
    """
    source_dir = Path(src_dir).resolve()
    if not (source_dir / "train.py").is_file():
        raise FileNotFoundError("快照目录中没有 train.py：" + str(source_dir))

    def belongs(name):
        return name in ("model", "mcts", "train", "support") or name.startswith("support.")

    previous_modules = {name: module for name, module in sys.modules.copy().items() if belongs(name)}
    previous_path = sys.path[:]
    try:
        for name in previous_modules:
            del sys.modules[name]
        sys.path.insert(0, str(source_dir))
        importlib.invalidate_caches()
        task = importlib.import_module("train")
        if Path(task.__file__).resolve() != source_dir / "train.py":
            raise RuntimeError("没有加载到指定快照的 train.py。")
        return task
    finally:
        for name in list(sys.modules):
            if belongs(name):
                del sys.modules[name]
        sys.modules.update(previous_modules)
        sys.path[:] = previous_path


def run_script(src_dir, script, args=()):
    """用当前 Notebook 内核的 Python 运行辅助脚本，并实时显示输出。"""
    source_dir = Path(src_dir).resolve()
    if script not in ("check.py", "evaluate.py", "export.py"):
        raise ValueError("这里只运行 check.py、evaluate.py 或 export.py。")
    target = source_dir / script
    if not target.is_file():
        raise FileNotFoundError("找不到辅助脚本：" + str(target))
    command = [sys.executable, "-u", str(target)] + [str(value) for value in args]
    environment = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    process = subprocess.Popen(command, cwd=source_dir, env=environment, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    try:
        for line in process.stdout:
            print(line, end="", flush=True)
        return_code = process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        raise
    finally:
        process.stdout.close()
    if return_code:
        raise RuntimeError(script + " 未通过（退出码 " + str(return_code) + "），请看上方提示。")
