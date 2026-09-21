# 作业 1：LLM 多轮对话与上下文管理

::: info 截止日期与提交位置
**截止日期：2026 年 10 月 3 日 23:59**

**提交位置：服务器个人目录下的 `homework1` 文件夹。**
:::

[下载第一次作业完整材料包（ZIP）](/materials/2026-fall/assignment-1/assignment-1-2026-fall.zip)

## 作业目标

使用 Python 编写一个基于 LLM API 的网页多轮对话程序，实现在浏览器中打开网页进行对话。

## 程序要求

- 接入至少一个课程支持的 LLM API。
- 支持保留上下文的连续对话。
- 支持新建对话和保留历史记录；新建后，旧会话内容不得进入后续请求。
- 对话以网页的形式打开。

## 提交内容

- **程序代码**：包含运行入口及必要的额外依赖说明（最好是能够在服务器上的pubpy环境下直接运行）。
- **README.md**：说明运行方法、实现思路，保持简洁。

允许使用 AI 辅助开发。需要在 README 中简要说明使用了什么模型（具体型号）来帮助编程、在什么平台上进行的、消耗了多少额度/token，以及自己进行了哪些验证。

如果完全没有使用AI可以备注“纯手搓”。

## 评价重点

主要评价程序功能和对话界面的实现。

## 作业材料与手把手教程

通过“手把手教程”你可以获得一个简单（甚至是简陋）的网站，但是基本功能是具备的。

完整材料包中包含运行指南、起始代码、从骨架到多轮对话的教程、完成后的自查清单，以及 README 写作提示。可以先下载并解压完整材料包，按照其中“手把手教程”目录下的 README 开始。

| 材料 | 查看或下载 |
| --- | --- |
| 完整材料包 | [下载 ZIP](/materials/2026-fall/assignment-1/assignment-1-2026-fall.zip) |
| 参考资料 | <a href="/materials/2026-fall/assignment-1/参考资料.pdf" target="_blank" rel="noopener">查看 PDF</a> |
| 从骨架到多轮对话 | <a href="/materials/2026-fall/assignment-1/手把手教程/第一次作业-从骨架到多轮对话.pdf" target="_blank" rel="noopener">查看教程 PDF</a> |
| 运行指南 | <a href="/materials/2026-fall/assignment-1/手把手教程/运行指南.md" target="_blank" rel="noopener">查看 Markdown</a> |
| 起始代码 | <a href="/materials/2026-fall/assignment-1/手把手教程/app.py" download>下载 app.py</a> |
| 完成后的自查 | <a href="/materials/2026-fall/assignment-1/手把手教程/完成后的自查.md" target="_blank" rel="noopener">查看 Markdown</a> |
| README 写作提示 | <a href="/materials/2026-fall/assignment-1/手把手教程/README_写作提示.md" target="_blank" rel="noopener">查看 Markdown</a> |

起始代码是供大家继续完善的程序骨架，具体要求以本页“程序要求”和“提交内容”为准。[查看提交方式](./submission)。

::: tip 测试完成后
测试完成后，在运行 Python 程序的终端和运行 SSH 端口转发的终端分别按 Ctrl+C，停止程序和转发。仅关闭网页不会停止服务器上的程序。
:::

## 网页效果参考

下面是两种实现出来的对话界面效果，供大家参考。

### 朴素版

![朴素版网页对话界面参考](/materials/2026-fall/assignment-1/网页效果参考图/朴素版.png)

### 豪华版

![豪华版网页对话界面参考](/materials/2026-fall/assignment-1/网页效果参考图/豪华版.png)

### 进一步尝试

如果想要构建出更加精致、完善，接近于一般的网页端官网的网站，需要的代码能力并不是我们要求掌握的。所以如果你不满足于当前的这个简单的网站，想要构建更加漂亮的网站的话，可以借助AI工具的帮助。大家可以尝试用AI去构建出一个令自己满意的网站，不断向AI提要求完善自己的网站，并在这个过程中积极探索AI使用的技巧。
