# 第四次作业：训练自己的四子棋 AI

先读 [作业说明](作业说明.md)，按照自己编程喜好任选一个版本完成：

- **Jupyter Notebook 版**：在笔记本中阅读、补全和运行。
- **Python 脚本版**：阅读教程，补全 `.py` 文件并运行。

两版程序独立。用 VS Code / Remote SSH 打开所选版本的整个子目录，切记保留其中的 `starter/`。运行使用课程提供的 `pubpy` 环境即可；有关Jupyter Notebook的基础知识可复习 [神经网络实践-课堂笔记](https://aiphy.pku.edu.cn/course/neural-network-practice)。

## Jupyter Notebook 版

1. 确认 VS Code 已安装 Python、Jupyter 相关扩展。工作目录应为 Notebook 版子目录。
2. 按提示补全并检查。修改函数后，重新运行定义格。**只需补全笔记本，`starter/` 中的模板不用重复填写。**

模板程序默认 2 轮、每轮 2 局的小实验只用于跑通流程。结果在 `notebook_runs/实验名/`，再次训练时更换 `RUN_NAME`。程序不会自动续训。

导出文件位于 `notebook_runs/实验名/upload/`。方法论见 [AlphaZero 学习讲义](第四次作业-Jupyter%20Notebook版/参考文献/AlphaZero学习参考.md)，原论文供有兴趣的同学自行阅读。

## Python 脚本版

### 1. 环境与文件

打开 `第四次作业-Python脚本版`，在终端执行：

```bash
cd starter
conda activate pubpy
python check.py support
```

**后续命令均在该 `starter` 目录执行。**

- `mcts.py`、`train.py`：需要补全。
- `model.py`、`support/`：已提供的网络与辅助程序。
- `check.py`、`evaluate.py`、`export.py`：检查、评估和导出工具。

### 2. 补全与训练

按 [搜索教程](第四次作业-Python脚本版/教程/01-搜索与程序接口.md) 完成 `mcts.py` 的四处 TODO：

```bash
python check.py search
```

再读 [数据准备](第四次作业-Python脚本版/教程/03-训练数据的准备与使用.md) 和 [训练教程](第四次作业-Python脚本版/教程/02-自我对弈与训练.md)，完成 `train.py` 的 A、B、C。补全后删除对应的 `raise NotImplementedError(...)`，根据检查提示修正。

```bash
python check.py training
python train.py
```

默认 CPU 单线程训练 10 轮、每轮 20 局，参数在 `train.py` 末尾调整。结果保存在 `runs/first_run/`：`initial.pt` 为初始参数，`model.pt` 为最近一轮参数，`log.jsonl` 为日志。

再次训练前修改 `RUN_DIR`。停止运行按 **Ctrl+C**；已保存轮次保留，重新运行不会自动续训。

### 3. 评估与导出

```bash
python evaluate.py runs/first_run/initial.pt --games 40 --output before.json
python evaluate.py runs/first_run/model.pt --games 40 --output after.json
python export.py runs/first_run/model.pt --out upload
```

比较时保持搜索次数、对手和随机种子一致。评估的是“网络 + 搜索”，少量对局或损失下降不能单独证明棋力提高。

导出文件在 `starter/upload/`；再次导出换一个目录，如 `--out upload2`。网站对战每步默认搜索 32 次，由 `support/bot.py` 的 `SIMULATIONS` 控制，与训练参数分开；调整后重新导出即可，无需重训。若新增推理文件，应加入 `export.py` 的文件列表。

整体方法见本版本的 [AlphaZero 学习讲义](第四次作业-Python脚本版/教程/参考文献/AlphaZero学习参考.md)，原论文选读。

## 上传、测试与提交

1. 在服务器上训练后，在 VS Code 左侧找到导出目录，将 **`code.zip` 和 `model.pt`** 分别右键下载到本地。
2. 打开 [课程对战平台](https://botlab.aiphys.cn/)，点击“上传策略”，创建或选择自己的 Bot；“策略代码”选 `code.zip`，“模型参数”选 `model.pt`，无需解压或改名。
3. 点击“上传并检查”，状态为“检查通过”后即可对战；未通过时查看日志。更多操作见网站的 [上传与对战指南](https://botlab.aiphys.cn/guide?game=connect4)。
4. 自行挑战随机策略、入门策略或其他同学，检查模型效果。截止前进入“正式比赛”页面，指定参赛版本。日常榜排名不计入作业成绩。
5. 按作业说明，将完整源码和对应模型提交到服务器个人目录下的 `homework4/` 文件夹。

网站上传包只含推理代码；作业还须提交完整训练源码，详见 [作业说明](作业说明.md)。
