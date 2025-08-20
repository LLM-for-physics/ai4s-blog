# Git 基础

想象一下你在玩一个高难度的游戏，马上就要挑战最终 BOSS 了。在挑战前，你一定会先“存档”，对吗？这样，即使挑战失败，你也可以随时读档，回到挑战前的最佳状态，而不用从头再来。

在编程世界里，Git 就是你代码的“存档”工具。当你辛辛苦苦写完一个功能，或者准备尝试一个大胆的新想法时，如果一不小心把事情搞砸了——比如代码崩溃了，或者新功能还不如旧的好用——你可能会希望能回到修改前的样子。如果没有 Git，你可能只能凭记忆一点点往回改，这无疑是一场噩噩梦。

Git，作为一个强大的**版本控制系统**，就是为了解决这个问题而生的。它能帮你记录每一次代码的“快照”，让你可以在任意时刻“读档”，回到过去任何一个你保存过的状态。

## Git 是如何工作的？

为了理解 Git，我们需要了解它的三个核心区域，你可以把它们想象成一个高效的办公室工作流程：

1.  **工作区 (Working Directory)**：这是你的办公桌。所有你当前正在编辑、修改的文件都在这里。这是你进行创造和修改的实时区域。

2.  **暂存区 (Staging Area)**：这是你办公桌上的一个“待归档”文件盒。当你完成了一部分修改（比如修复了一个 bug，或完成了某个小功能），你觉得这部分工作可以告一段落了，就把修改过的文件放进这个盒子里。这表示你“暂存”了这些改动，准备将它们正式存档。

3.  **版本库 (Repository)**：这是你办公室里那个巨大的、永不丢失的档案柜。当你觉得“待归档”文件盒里的东西都准备好了，你就可以执行“提交 (commit)”操作。这个操作会把暂存区里所有的文件制作成一个永久的“快照”（一个版本），并贴上标签（比如“v1.0，修复了登录 bug”），然后存入档案柜。

这个流程可以总结为：

1.  在**工作区**修改你的文件。
2.  将修改完成的文件**暂存**起来 (`git add`)。
3.  将暂存区的所有内容**提交**到**版本库**，形成一个新版本 (`git commit`)。

通过这个流程，你的每一次重要修改都被永久地记录了下来。无论未来你的代码经历了多少次迭代，你总能找到历史上的任何一个版本，就像拥有了一台属于你代码的时光机。

## 基础使用

使用 Git 的第一步是先编辑本地的一些提交信息。Git 的提交需要一个用户名和一个邮箱，来对应每次提交的作者。我们可以使用以下命令来设置这些信息：

```bash
git config --global user.name "Your Name"
git config --global user.email "email@example.com"
```

虽然我们主要通过命令行来学习 Git 的核心概念，但在日常开发中，我们强烈推荐使用图形化界面工具来辅助版本控制。Visual Studio Code 内置了强大的 Git 支持，你可以通过其侧边栏的“源代码管理”视图轻松地查看文件状态、暂存更改、提交版本，甚至解决冲突，极大地提高了工作效率。

此外，Git 本身是一个分布式的版本控制系统，但为了方便团队协作和代码备份，我们通常会使用像 GitHub、GitLab 或 Gitee 这样的代码托管平台。这些平台为你的本地 Git 仓库提供了一个远程的“家”，你可以将本地的提交推送到远程服务器，也可以从远程服务器拉取他人的更新。这使得多人协作开发变得简单而高效。

## 版本控制：提交
接下来，让我们通过一个具体的例子来体验一下 Git 的完整流程。假设我们要创建一个简单的 Python 项目。

1.  **创建项目目录并初始化仓库**

首先，我们创建一个名为 `hello-git` 的文件夹，并进入该文件夹。

```bash
mkdir hello-git
cd hello-git
```

然后，我们使用 `git init` 命令来初始化一个新的 Git 仓库。

```bash
git init
```

你会看到类似这样的输出，表示一个空的 Git 仓库已经创建好了：
```
Initialized empty Git repository in /path/to/your/hello-git/.git/
```

2.  **创建文件并进行第一次提交**

现在，让我们在项目里创建一个 `hello.py` 文件：

```python
# hello.py
print("Hello, Git!")
```

我们可以使用 `git status` 命令来查看当前仓库的状态：

```bash
git status
```

Git 会告诉我们，有一个“未暂存”的文件 `hello.py`：

```
On branch master

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        hello.py

nothing added to commit but untracked files present (use "git add" to track)
```

接下来，我们使用 `git add` 命令将这个文件添加到暂存区：

```bash
git add hello.py
```

再次运行 `git status`，你会发现 `hello.py` 已经从“未暂存”变成了“待提交”：

```
On branch master

No commits yet

Changes to be committed:
  (use "git rm --cached <file>..." to unstage)
        new file:   hello.py
```

最后，我们使用 `git commit` 命令，将暂存区的内容提交到版本库，并附上一条有意义的提交信息：

```bash
git commit -m "Initial commit: Add hello.py"
```

现在，我们的第一个版本就已经被永久保存下来了！再次运行 `git status`，Git 会告诉我们工作区是干净的，没有什么需要提交的了。

3.  **修改文件并提交新版本**

现在，我们来修改一下 `hello.py`：

```python
# hello.py
print("Hello, Git!")
print("This is the second version.")
```

再次运行 `git status`，Git 会检测到文件的改动：

```
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   hello.py

no changes added to commit (use "git add" and/or "git commit -a")
```

我们可以使用 `git diff` 命令来查看具体的修改内容：

```diff
- print("Hello, Git!")
+ print("Hello, Git!")
+ print("This is the second version.")
```

和之前一样，我们先把修改过的文件添加到暂存区，然后再提交：

```bash
git add hello.py
git commit -m "Update hello.py with a new line"
```

## 版本控制：回退

有时候，我们可能需要回到过去某个特定的版本，无论是为了查看当时的代码，还是彻底放弃当前的修改。Git 提供了强大的工具来帮助我们实现“代码回溯”。

### 查看提交历史 (`git log`)

在回退之前，我们首先需要知道我们想回退到哪个版本。`git log` 命令可以帮助我们查看所有的提交历史。

```bash
git log
```

它会按时间倒序列出所有的提交记录，包括每个提交的唯一哈希值（commit hash）、作者、日期和提交信息。

```
commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8g9h0 (HEAD -> master)
Author: Your Name <email@example.com>
Date:   ...

    Update hello.py with a new line

commit 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9g0h
Author: Your Name <email@example.com>
Date:   ...

    Initial commit: Add hello.py
```

这个长长的、由字母和数字组成的字符串就是**commit hash**，它是每个版本的唯一身份证。在回退版本时，我们通常只需要使用它的前几位（比如前 7 位 `a1b2c3d`）就足够了。

### 回退版本 (`git reset`)

`git reset` 是 Git 的“时光机”中最强大的命令之一。它可以将你的项目回退到指定的版本。它有三种主要的模式：`--soft`、`--mixed`（默认）和 `--hard`。

为了理解这三种模式的区别，我们再次回顾 Git 的三个核心区域：**工作区**、**暂存区**和**版本库**。

假设我们的提交历史是 `A -> B -> C`，当前在 `C` 版本。我们现在想回退到 `B` 版本 (`git reset B`)。

1. `--hard` 模式：彻底回退

这是最彻底、也是最“危险”的回退模式。它会完全丢弃回退点之后的所有改动。

```bash
git reset --hard <commit_hash>
```

**执行效果**：
*   **版本库**：从 `C` 回退到 `B`。
*   **暂存区**：内容被清空，与 `B` 版本保持一致。
*   **工作区**：所有文件都被强制恢复到 `B` 版本时的状态。你在 `C` 版本所做的所有修改（包括 `hello.py` 中新增的那一行）都会**彻底消失**。

**适用场景**：当你确定要完全放弃某个版本之后的所有修改时使用。**请谨慎使用，因为工作区的修改将无法恢复！**

**示例**：
```bash
# 假设 B 版本的 commit hash 是 1a2b3c4
git reset --hard 1a2b3c4
```

2. `--mixed` 模式：保留工作区修改

这是 `git reset` 的默认模式。如果你不指定任何模式，它就会使用 `--mixed`。

```bash
git reset <commit_hash>
# 或者
git reset --mixed <commit_hash>
```

**执行效果**：
*   **版本库**：从 `C` 回退到 `B`。
*   **暂存区**：内容被清空，与 `B` 版本保持一致。
*   **工作区**：**保持不变**。你在 `C` 版本所做的修改（`hello.py` 中新增的那一行）会**依然存在**于你的文件中，但这些修改会处于“未暂存”状态。

**适用场景**：当你想要撤销某次提交，但又想保留那次提交所做的代码改动，以便重新修改和提交时使用。

**示例**：
```bash
git reset 1a2b3c4
```
执行后，运行 `git status`，你会看到 `hello.py` 显示为“modified”，就像你刚刚修改完但还没 `git add` 一样。

1. `--soft` 模式：保留工作区和暂存区

这是最“温和”的回退模式。

```bash
git reset --soft <commit_hash>
```

**执行效果**：
*   **版本库**：从 `C` 回退到 `B`。
*   **暂存区**：**保持不变**。`C` 版本所做的修改会依然存在于暂存区中。
*   **工作区**：**保持不变**。

**适用场景**：当你觉得上一次的提交信息写得不好，或者想把上一次的提交内容和新的修改合并成一次提交时使用。

## 版本控制：忽略特定文件 (`.gitignore`)

在我们的项目中，并非所有文件都适合纳入版本控制。例如，编译产生的文件、日志文件或包含密码等敏感信息的文件，都不应该提交到代码库中。

为了让 Git 自动忽略这些文件，我们可以在项目的根目录下创建一个名为 `.gitignore` 的特殊文件。在文件中，我们可以列出不希望被 Git 跟踪的文件或目录。

### `.gitignore` 示例

假设我们不希望跟踪任何 `.log` 文件和 `temp/` 目录下的所有内容，我们可以创建一个 `.gitignore` 文件，并写入以下内容：

```gitignore
# 忽略所有 .log 文件
*.log

# 忽略 temp/ 目录
temp/
```

创建好 `.gitignore` 文件后，记得将它本身添加到 Git 仓库中，这样团队成员就能共享同一套忽略规则了。

```bash
git add .gitignore
git commit -m "Add .gitignore"
```

**注意**：`.gitignore` 只能忽略那些从未被跟踪过的文件。如果某个文件已经被纳入了版本库，你需要先从版本库中删除它 (`git rm --cached <file>`)，然后再将其加入 `.gitignore`。

关于 Git 版本控制的一些更加进阶的知识（例如分支管理等内容），欢迎查阅更多资料。 我们在高阶课程7.1中会介绍一些 Git 的进阶用法。
