# 作业提交方式

本页面说明课程作业的提交方式和要求。

## 相关资源

- 点此查看或下载[课件](../course/slides)。

- 我们为每位同学在服务器上创建了用户，学号与服务器 IP 地址对应表格： 
<a href="/students_server_assignment.xlsx" download="students_server_assignment.xlsx">点此下载 Excel 表格</a> （最近更新：9月24日 00:10）。如果你选了这门课但你的学号没有出现在表格中，请联系助教。

- 服务器连接使用、python 开发环境配置方法见 [server](../setup/server) 和 [development](../setup/development) 。推荐用公共的 conda 环境（pubpy），如果需要安装什么新的 python 库或者遇到什么 bug 可以联系助教；也可以用自定义的 conda 环境，但请务必在作业目录中新建 requirements.txt 来记录项目依赖或者在 README.md 中说清楚。

- <a href="https://www.aliyun.com/benefit/">阿里云权益中心</a> 可以点击“高校师生权益”领取高校学生通用权益（代金券），头几次课程作业可以使用阿里云提供的 `base url` 和 `api key`（阿里云提供的 api 调用规范满足 openai 规范，所以可以用 python 的 `openai` 库来编程）。代金券余额和消费记录可以看 <a href="https://billing-cost.console.aliyun.com/">费用与成本控制台</a>。或者使用物理学院大模型网关，网关于 9 月 17 日开始内测，9 月 20 日开放注册，网关使用教程见 [llm gateway](../course/llm-gateway)。

- cline 扩展（ai 编程助手）的介绍和使用见 [cline 指南](./cline)。

- **重要提醒**：完成作业时请不要过于依赖 LLM（AI 编程工具），如果在某些关键地方的实现借助了 AI 编程工具，**请在 README 中说明**。
    虽然 AI 工具可以提供帮助，但是：

  - 重要的是理解解决问题的思路和方法
  - 建议先尝试独立解决，遇到困难时再寻求 AI 辅助
  - 使用 AI 帮助后，务必确保你理解了解决方案的原理


## 提交目录结构

在服务器自己的用户目录下创建作业文件夹（可以参考以下的结构）：

```
~/assignments/
├── assignment1/
│   ├── README.md
│   ├── code/
│   └── results/
├── assignment2/
│   ├── README.md
│   ├── code/
│   └── results/
└── ...
```

## README.md 模板

每个作业文件夹建议包含 `README.md`，可参考以下模板：

```markdown
# Assignment X

## 学生信息
- 姓名：[你的姓名]
- 学号：[你的学号]

## 运行方法
[如何运行代码的简要说明]

## 主要结果
[重要结果和发现]
```

## 版本控制（可选）

如果你想使用 Git 来管理你的作业代码，可以参考 [Git 基础使用指南](../computer-basic/git-usage.md)。Git 可以帮助你：

- 跟踪代码的修改历史
- 在尝试新想法时保存代码的"存档点"
- 更好地组织和管理你的项目文件
