# Markdown 使用

## Markdown 是什么

Markdown 是一种用少量符号表示排版的纯文本格式，文件通常以 `.md` 结尾。本作业包中的说明文档、`README.md` 和 `SKILL.md` 都属于这类文件。

例如，源码中的 `# 标题` 会显示为标题，`**重点**` 会显示为加粗文字。把源码显示成排版后的页面，叫作**渲染或预览**，也就是这里所说的“编译结果”。

## 怎样阅读：优先用 VS Code 自带预览

记事本也能打开 Markdown，但只能看到源码。阅读本作业包时，建议在 VS Code 中选择“文件 → 打开文件夹”，打开整个作业包，再点击要阅读的 `.md` 文件。

**VS Code 自带 Markdown 预览，无需安装插件。** Windows / Linux 默认操作如下：

| 想做什么 | 操作 |
| --- | --- |
| 在旁边打开预览，边改边看 | 先按 `Ctrl+K`，松开，再按 `V` |
| 打开当前文件的预览 | `Ctrl+Shift+V` |
| 保存修改 | `Ctrl+S` |

macOS 对应为 `Cmd+K` 后按 `V`、`Cmd+Shift+V` 和 `Cmd+S`。

如果快捷键不生效，可以通过“查看 → 命令面板”搜索 **Markdown: Open Preview to the Side**（打开侧边预览）。这些是 [VS Code 的内置功能](https://code.visualstudio.com/docs/languages/markdown)。

源码和预览是同一个文件的两种显示方式。在源码中修改，预览会随之更新；最后保存 `.md` 文件即可。

## 看懂几种常见写法

下面这段可以复制到一个新建的 `练习.md` 中，打开预览看看效果：

````markdown
# 我的学习笔记

## 今天的内容

这是普通文字，**这是重点**，`SKILL.md` 是文件名。

- 第一件事
- 第二件事

[查看 VS Code 文档](https://code.visualstudio.com/docs/languages/markdown)

```python
print("Hello")
```
````

其中，`#` 和 `##` 表示不同层级的标题，`-` 表示列表；三个反引号包住的内容会显示为代码块，预览时不会自动执行。

注意：标题的 `#`、列表的 `-` 后要加空格；段落之间空一行。源码中仅按一次回车，不一定会在预览中换行。

## 哪些 VS Code 插件有帮助

阅读本作业包，用内置预览即可。经常编辑 Markdown，可以先考虑 **Markdown All in One**；其余按需选择，不必全部安装。

| 插件与扩展 ID | 主要用途 |
| --- | --- |
| [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)<br>`yzhang.markdown-all-in-one` | 编辑辅助：加粗等快捷键、列表操作、自动生成和更新目录 |
| [Markdown Preview Enhanced](https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced)<br>`shd101wyy.markdown-preview-enhanced` | 提供独立的增强预览，适合有图表或更多排版需求时使用 |
| [markdownlint](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint)<br>`DavidAnson.vscode-markdownlint` | 提醒标题、空行、列表等格式问题；这些提示不等于内容写错 |

安装方法：点击左侧“扩展”图标，搜索表中的完整扩展 ID，核对名称后点击“安装”。也可以从表中链接进入对应发布页，参见 [VS Code 扩展安装说明](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)。

安装后，可在命令面板中搜索插件名称。例如，搜索 **Markdown All in One: Create Table of Contents** 可以生成目录；使用增强预览时，选择 **Markdown Preview Enhanced: Open Preview to the Side**。不同预览器对扩展语法的显示可能略有差别。

## 在 VS Code 中怎样转成 PDF，方便阅读与分享

### 方法一：Markdown PDF，适合直接导出

安装 [Markdown PDF](https://marketplace.visualstudio.com/items?itemName=yzane.markdown-pdf)，扩展 ID 为 `yzane.markdown-pdf`。

1. 打开要转换的 `.md` 文件，先保存修改。
2. 打开命令面板，搜索并执行 `Markdown PDF: Export (pdf)`。
3. 默认会在原文件旁生成同名 PDF，用浏览器或 PDF 阅读器打开即可。

导出需要浏览器组件，首次使用可能需要下载。若下载或导出失败，可按插件发布页的说明配置本机浏览器路径。

### 方法二：已装 Markdown Preview Enhanced，可以直接使用

[Markdown Preview Enhanced](https://github.com/shd101wyy/markdown-preview-enhanced/blob/master/docs/puppeteer.md) 也支持导出 PDF：

1. 打开它的增强预览。
2. 在**预览区域**右键，选择 `Chrome (Puppeteer)`，导出为 PDF。

这种方式需要 Chrome 浏览器；插件找不到浏览器时，可在其设置中配置 `markdown-preview-enhanced.chromePath`。只需要简单导出时，选择一种方式即可。


## 怎样在 VS Code 中查看 PDF

可以安装 [PDF Viewer](https://marketplace.visualstudio.com/items?itemName=mathematic.vscode-pdf)，扩展 ID 为 `mathematic.vscode-pdf`，用于直接阅读 PDF。

1. 在扩展栏搜索上述完整 ID 并安装。
2. 点击 VS Code 文件列表中的 `.pdf` 文件，即可打开阅读界面。
3. 用阅读器工具栏翻页、缩放和查找文字，检查导出效果。

如果 PDF 没有以阅读界面打开，可在命令面板运行 `Reopen Editor With...`，选择 `PDF View`。

## 总之

善用 VS Code 这个平台以及该平台提供的丰富插件。遇到不明白的事情及时请教AI，AI很懂编程以及编程平台。