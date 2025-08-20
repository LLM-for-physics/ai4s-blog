# SSH 使用指南

## 什么是 SSH？

SSH，全称 Secure Shell，是一种加密的网络协议，用于在不安全的网络上安全地进行远程登录和执行命令。与 Telnet 或 FTP 等早期协议不同，SSH 会对所有传输的数据进行加密，有效防止了窃听和数据篡改。

## SSH 的工作原理：密钥对

SSH 的安全性主要基于**密钥对**——一个**公钥**和一个**私钥**。

- **私钥 (Private Key)**: 存放在你的本地电脑上，必须妥善保管，绝不能泄露给任何人。它相当于你的个人身份证明。
- **公钥 (Public Key)**: 可以自由地分发，可以把它放在任何你想要访问的服务器上。

当你尝试连接到一个配置了你的公钥的服务器时，服务器会使用你的公钥加密一个随机的质询（challenge）并发送给你。只有你的私钥才能解密这个质询。你将解密后的信息发回服务器，服务器确认无误后，就允许你登录。这个过程就像用一把只有你自己拥有的钥匙打开了一把锁。

## 如何生成 SSH 密钥

你可以使用 `ssh-keygen` 命令来生成自己的 SSH 密钥对。

1.  打开终端（在 Windows 上可以是 Git Bash、PowerShell 或 WSL）。
2.  输入以下命令：

    ```bash
    ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
    ```

    - `-t rsa`: 指定密钥类型为 RSA。
    - `-b 4096`: 指定密钥长度为 4096 位，这是一个比较安全的长度。
    - `-C "your_email@example.com"`: 添加一个注释，通常是你的邮箱地址，方便识别。

3.  按回车键后，系统会提示你保存密钥的位置（默认为 `~/.ssh/id_rsa`），直接按回车即可。
4.  接着会提示你设置一个密码（passphrase）。这个密码用于保护你的私钥。如果设置了，每次使用私钥时都需要输入这个密码。为了方便，你也可以直接按回车留空。

命令执行完毕后，你会在 `~/.ssh/` 目录下找到两个文件：
- `id_rsa`: 你的私钥。
- `id_rsa.pub`: 你的公钥。

## 实际应用

### 1. 连接到远程服务器

要使用 SSH 连接到远程服务器，你需要将你的**公钥**复制到服务器的 `~/.ssh/authorized_keys` 文件中。

1.  在本地电脑上，复制你的公钥内容。你可以使用 `cat` 命令查看：

    ```bash
    cat ~/.ssh/id_rsa.pub
    ```

2.  登录到你的远程服务器（可能需要使用密码登录），然后将你复制的公钥内容粘贴到 `~/.ssh/authorized_keys` 文件的末尾。

    ```bash
    # 在服务器上执行
    mkdir -p ~/.ssh
    echo "你复制的公钥内容" >> ~/.ssh/authorized_keys
    ```

完成以上步骤后，你就可以在本地终端通过以下命令免密登录服务器了：

```bash
ssh username@your_server_ip
```

### 2. 在 GitHub 上使用 SSH

将你的 SSH 公钥添加到 GitHub 账户，可以让你在推送（push）和拉取（pull）代码时不再需要输入用户名和密码。

1.  复制你的公钥内容，同上一步。

2.  登录到你的 GitHub 账户。
3.  点击右上角的头像，选择 "Settings"。
4.  在左侧菜单中，选择 "SSH and GPG keys"。
5.  点击 "New SSH key"。
6.  在 "Title" 字段中，为你的密钥起一个容易识别的名字（例如 "My Laptop"）。
7.  在 "Key" 字段中，粘贴你的公钥内容。
8.  点击 "Add SSH key"。

现在，当你克隆一个仓库时，请确保使用 SSH URL，而不是 HTTPS URL。SSH URL 的格式通常是 `git@github.com:username/repository.name.git`。

例如：
```bash
git clone git@github.com:LLM-for-physics/ai4s-blog.git
```

通过这种方式克隆的仓库，在进行 `git push` 或 `git pull` 操作时，将自动使用你的 SSH 密钥进行身份验证。

## 简化连接：SSH 配置文件

如果你需要管理多个 SSH 连接，可以在 `~/.ssh/` 目录下创建一个 `config` 文件来简化操作。

例如，在 `~/.ssh/config` 文件中添加以下内容：

```
Host my-server
    HostName your_server_ip
    User your_username
    IdentityFile ~/.ssh/id_rsa

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa
```

配置完成后，你就可以使用更简单的命令进行连接了：

```bash
# 连接到你的服务器
ssh my-server

# 测试与 GitHub 的连接
ssh -T git@github.com
```

这样就不需要每次都输入完整的用户名和 IP 地址了。