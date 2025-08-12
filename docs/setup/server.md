# 服务器使用指南

本课程提供专用的GPU计算服务器，用于运行深度学习模型和大规模数据分析。本指南将帮助你学会如何安全、高效地使用服务器资源。

## 🖥️ 服务器概览

### 硬件配置
- **CPU**: 2x Intel Xeon Gold 6248R (48核心)
- **内存**: 512GB DDR4
- **GPU**: 8x NVIDIA A100 80GB
- **存储**: 100TB NVMe SSD存储阵列
- **网络**: 100Gbps InfiniBand互连

### 软件环境
- **操作系统**: Ubuntu 22.04 LTS
- **Python**: 3.9/3.10/3.11 (通过conda管理)
- **CUDA**: 11.8 / 12.1
- **深度学习框架**: TensorFlow 2.x, PyTorch 2.x
- **科学计算**: NumPy, SciPy, Pandas, Matplotlib
- **Jupyter**: JupyterLab 最新版

## 🔑 获取访问权限

### 步骤1: 提交申请
1. 访问[服务器申请页面](https://portal.university.edu/ai4s-server)
2. 填写个人信息和课程注册码
3. 上传学生证照片
4. 等待审批（1-2个工作日）

### 步骤2: 接收凭证
审批通过后，你将收到包含以下信息的邮件：
- 服务器IP地址
- 用户名和初始密码
- SSH私钥文件
- VPN配置文件

### 步骤3: 修改密码
首次登录后立即修改密码：
```bash
passwd
```

## 🌐 网络连接

### VPN配置

#### Windows系统
1. 下载OpenVPN客户端
2. 导入提供的`.ovpn`配置文件
3. 使用你的服务器用户名和密码连接

#### macOS系统
1. 安装Tunnelblick
2. 双击导入`.ovpn`文件
3. 连接VPN

#### Linux系统
```bash
sudo apt install openvpn
sudo openvpn --config ai4s-course.ovpn
```

### 网络验证
连接VPN后验证网络：
```bash
ping ai4s-server.university.edu
```

## 🔐 SSH连接

### 基本连接
```bash
ssh -i ~/.ssh/ai4s_key username@ai4s-server.university.edu
```

### 配置SSH密钥

#### 生成密钥对（如果需要）
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/ai4s_key
```

#### 添加到SSH配置
编辑`~/.ssh/config`文件：
```
Host ai4s
    HostName ai4s-server.university.edu
    User your_username
    IdentityFile ~/.ssh/ai4s_key
    Port 22
```

现在可以简单使用：
```bash
ssh ai4s
```

### SSH隧道设置
为了安全访问Jupyter Lab，设置SSH隧道：
```bash
ssh -L 8888:localhost:8888 ai4s
```

## 📓 Jupyter Lab使用

### 启动Jupyter Lab
```bash
# 连接到服务器后
jupyter lab --no-browser --port=8888
```

### 访问界面
在本地浏览器访问：`http://localhost:8888`

### 常用功能
- **新建Notebook**: 选择Python 3内核
- **终端访问**: 直接在浏览器中使用终端
- **文件管理**: 上传、下载、编辑文件
- **扩展插件**: Git集成、代码格式化等

## 💾 文件管理

### 目录结构
```
/home/username/
├── notebooks/          # Jupyter notebooks
├── data/              # 数据文件
├── models/            # 训练好的模型
├── scripts/           # Python脚本
└── shared/            # 共享文件夹
```

### 文件传输

#### scp命令
```bash
# 上传文件到服务器
scp -i ~/.ssh/ai4s_key local_file.py username@server:/home/username/

# 从服务器下载文件
scp -i ~/.ssh/ai4s_key username@server:/home/username/remote_file.py ./
```

#### rsync同步
```bash
# 同步整个目录
rsync -avz -e "ssh -i ~/.ssh/ai4s_key" \
  local_folder/ username@server:/home/username/remote_folder/
```

#### 图形化工具
推荐使用：
- **Windows**: WinSCP, FileZilla
- **macOS**: Cyberduck, Transmit
- **Linux**: Nautilus (SFTP支持)

## 🚀 资源管理

### GPU使用

#### 查看GPU状态
```bash
nvidia-smi
```

#### 在Python中使用GPU
```python
import tensorflow as tf
import torch

# TensorFlow GPU检查
print("TensorFlow GPUs:", tf.config.list_physical_devices('GPU'))

# PyTorch GPU检查
print("PyTorch CUDA available:", torch.cuda.is_available())
print("PyTorch GPU count:", torch.cuda.device_count())
```

### 内存监控
```bash
# 查看内存使用
free -h

# 查看进程内存使用
htop
```

### 磁盘空间
```bash
# 查看磁盘使用情况
df -h

# 查看目录大小
du -sh /home/username/
```

## ⚡ 性能优化

### 批处理作业
对于长时间运行的任务，使用tmux或screen：
```bash
# 创建新会话
tmux new-session -d -s training

# 在会话中运行训练
tmux send-keys -t training "python train_model.py" Enter

# 查看会话
tmux list-sessions

# 重新连接
tmux attach-session -t training
```

### 并行计算
```python
# 设置TensorFlow GPU内存增长
import tensorflow as tf

gpus = tf.config.experimental.list_physical_devices('GPU')
if gpus:
    for gpu in gpus:
        tf.config.experimental.set_memory_growth(gpu, True)
```

### 数据加载优化
```python
# TensorFlow数据管道优化
dataset = tf.data.Dataset.from_tensor_slices(data)
dataset = dataset.batch(32)
dataset = dataset.prefetch(tf.data.experimental.AUTOTUNE)
```

## 🛡️ 安全最佳实践

### 密码安全
- 使用强密码（至少12位，包含数字、字母、符号）
- 定期更换密码
- 不要与他人共享账户

### 密钥管理
- 妥善保管SSH私钥
- 设置私钥密码保护
- 不要将私钥上传到代码仓库

### 数据保护
- 不要在服务器上存储敏感个人信息
- 定期备份重要代码和数据
- 使用Git管理代码版本

## 📊 资源配额

每个用户的资源限制：
- **磁盘空间**: 100GB个人目录
- **GPU使用**: 同时最多使用2块GPU
- **运行时间**: 单个作业最长72小时
- **并发作业**: 最多3个同时运行的作业

## 🆘 故障排除

### 常见问题

#### 连接失败
```bash
# 检查VPN连接
ping ai4s-server.university.edu

# 检查SSH配置
ssh -v ai4s
```

#### Jupyter Lab无法访问
```bash
# 检查端口转发
lsof -i :8888

# 重启Jupyter
jupyter lab stop
jupyter lab --no-browser --port=8888
```

#### GPU无法使用
```python
# 检查CUDA安装
import torch
print(torch.version.cuda)

# 检查驱动版本
import subprocess
result = subprocess.run(['nvidia-smi'], capture_output=True, text=True)
print(result.stdout)
```

### 获取帮助
- **系统问题**: 发邮件到 sysadmin@university.edu
- **账户问题**: 联系助教 ai4s-ta@university.edu
- **技术问题**: 在课程论坛发帖求助

## 📋 使用规范

### 允许的使用
- 课程相关的学习和研究
- 运行课程作业和项目
- 学术研究和论文写作

### 禁止的使用
- 商业用途或盈利活动
- 挖矿或其他非学术计算
- 存储非法或有害内容
- 攻击其他系统或网络

### 后果说明
违反使用规范可能导致：
- 账户暂停或终止
- 学术诚信调查
- 相关法律后果

---

*记住：服务器是共享资源，请合理使用，与同学友好协作！*
