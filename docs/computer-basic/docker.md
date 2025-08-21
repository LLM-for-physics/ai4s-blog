# Docker 完全入门教程

## 什么是 Docker？

Docker 是一个开源的容器化平台。如果这个解释听起来太技术化，让我们用一个简单的比喻：

**想象一下搬家的情景**：
- 传统方式：你需要把每件物品单独包装，到了新家再重新整理摆放
- Docker 方式：你把所有东西都装在一个标准化的集装箱里，到哪里都能直接使用

Docker 做的就是把应用程序和它需要的所有依赖（操作系统、库文件、配置等）打包成一个"集装箱"（容器），这样就能在任何支持 Docker 的机器上运行。

## 为什么要使用 Docker？

### 1. 解决"在我电脑上能运行"的问题
你是否遇到过这种情况：
- 你的代码在自己电脑上运行正常
- 但在同事或服务器上就出错了
- 原因可能是系统版本、依赖库版本不同

Docker 完美解决了这个问题！

### 2. 环境隔离
- 不同项目需要不同版本的 Python？没问题！
- 担心安装软件污染系统？Docker 容器完全隔离！
- 需要同时运行多个数据库？每个容器都是独立的！

### 3. 快速部署
- 一键启动整个应用环境
- 轻松扩展到多个服务器
- 回滚到之前版本非常简单

## Docker 核心概念

### 1. 镜像（Image）
**镜像就像是软件的"安装包"**
- 包含运行应用所需的一切：代码、运行时、库、环境变量、配置文件
- 镜像是只读的，不会改变
- 就像手机 App 的安装包，可以安装到任何手机上

### 2. 容器（Container）
**容器是镜像的运行实例**
- 从镜像创建出来的，可以启动、停止、删除
- 就像从 App 安装包安装到手机上的应用程序
- 每个容器都是独立的，相互不影响

### 3. 仓库（Repository）
**仓库是存储镜像的地方**
- Docker Hub 是最大的公共仓库（类似应用商店）
- 可以上传自己制作的镜像
- 也可以下载别人制作好的镜像

用一个比喻来理解：
- **仓库** = 应用商店
- **镜像** = App安装包
- **容器** = 安装后运行的App

## 安装 Docker

### Ubuntu/Debian 系统

1. **更新系统包**
```bash
sudo apt update
```

2. **安装必要的依赖**
```bash
sudo apt install apt-transport-https ca-certificates curl gnupg lsb-release
```

3. **添加 Docker 官方GPG密钥**
```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

4. **添加 Docker 仓库**
```bash
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

5. **安装 Docker**
```bash
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io
```

6. **启动 Docker 服务**
```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### CentOS/RHEL 系统

```bash
# 安装依赖
sudo yum install -y yum-utils

# 添加Docker仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装Docker
sudo yum install docker-ce docker-ce-cli containerd.io

# 启动Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### 验证安装

```bash
sudo docker --version
```

如果显示版本信息，说明安装成功！

### 配置用户权限（可选但推荐）

为了避免每次都使用 `sudo`，可以将用户添加到 docker 组：

```bash
sudo usermod -aG docker $USER
```

然后重新登录或运行：
```bash
newgrp docker
```

现在可以直接使用 `docker` 命令了！

## Docker 基本命令

### 1. 获取镜像

```bash
# 从Docker Hub下载镜像
docker pull ubuntu              # 下载Ubuntu镜像
docker pull nginx              # 下载Nginx镜像
docker pull python:3.9        # 下载Python 3.9镜像
```

### 2. 查看镜像

```bash
docker images                  # 查看本地所有镜像
docker image ls               # 同上，另一种写法
```

### 3. 运行容器

```bash
# 最基本的运行方式
docker run ubuntu echo "Hello Docker!"

# 交互式运行（可以进入容器内部）
docker run -it ubuntu bash

# 后台运行
docker run -d nginx

# 指定端口映射
docker run -d -p 8080:80 nginx
```

参数解释：
- `-it`：交互式运行，可以输入命令
- `-d`：后台运行（daemon mode）
- `-p 8080:80`：将主机8080端口映射到容器80端口

### 4. 管理容器

```bash
# 查看运行中的容器
docker ps

# 查看所有容器（包括已停止的）
docker ps -a

# 停止容器
docker stop 容器ID或名称

# 重新启动容器
docker start 容器ID或名称

# 删除容器
docker rm 容器ID或名称

# 删除镜像
docker rmi 镜像ID或名称
```

### 5. 进入运行中的容器

```bash
# 执行命令
docker exec -it 容器ID bash

# 查看容器日志
docker logs 容器ID
```

## 实际案例：部署一个简单的网站

让我们通过一个实际例子来学习 Docker。我们将部署一个简单的静态网站。

### 步骤1：创建网站文件

```bash
# 创建项目目录
mkdir my-website
cd my-website

# 创建一个简单的HTML文件
cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>我的第一个Docker网站</title>
    <style>
        body { font-family: Arial; text-align: center; margin-top: 50px; }
        h1 { color: #2196F3; }
    </style>
</head>
<body>
    <h1>欢迎来到我的Docker网站！</h1>
    <p>这个网站运行在Docker容器中</p>
    <p>学习Docker真有趣！</p>
</body>
</html>
EOF
```

### 步骤2：使用Nginx镜像部署

```bash
# 运行Nginx容器，将网站文件映射到容器内
docker run -d -p 8080:80 -v $(pwd):/usr/share/nginx/html --name my-website nginx
```

参数解释：
- `-v $(pwd):/usr/share/nginx/html`：将当前目录映射到容器的网站目录
- `--name my-website`：给容器取个名字

### 步骤3：访问网站

打开浏览器访问：`http://localhost:8080`

你应该能看到你的网站！

### 步骤4：管理你的网站

```bash
# 查看运行状态
docker ps

# 查看网站日志
docker logs my-website

# 停止网站
docker stop my-website

# 重新启动
docker start my-website

# 删除容器
docker rm my-website
```

## 数据卷（Volumes）

### 为什么需要数据卷？

容器被删除时，其中的数据也会丢失。数据卷可以：
- 持久化数据
- 在容器之间共享数据
- 备份和恢复数据

### 创建和使用数据卷

```bash
# 创建数据卷
docker volume create my-data

# 查看数据卷
docker volume ls

# 使用数据卷
docker run -d -v my-data:/data ubuntu

# 挂载主机目录
docker run -d -v /host/path:/container/path ubuntu
```

## Dockerfile：制作自己的镜像

Dockerfile 是用来构建自定义镜像的配置文件。

### 创建一个Python应用的Dockerfile

```bash
# 创建项目目录
mkdir python-app
cd python-app

# 创建Python应用
cat > app.py << 'EOF'
from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello():
    return '<h1>Hello from Docker!</h1><p>这是一个Python Flask应用</p>'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOF

# 创建依赖文件
cat > requirements.txt << 'EOF'
Flask==2.0.1
EOF

# 创建Dockerfile
cat > Dockerfile << 'EOF'
# 使用Python官方镜像作为基础
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY requirements.txt .

# 安装依赖
RUN pip install -r requirements.txt

# 复制应用代码
COPY app.py .

# 暴露端口
EXPOSE 5000

# 运行应用
CMD ["python", "app.py"]
EOF
```

### 构建和运行镜像

```bash
# 构建镜像
docker build -t my-python-app .

# 运行容器
docker run -d -p 5000:5000 --name python-web my-python-app

# 访问 http://localhost:5000 查看结果
```

### Dockerfile 常用指令

```dockerfile
FROM ubuntu:20.04          # 基础镜像
WORKDIR /app              # 设置工作目录
COPY . .                  # 复制文件
RUN apt-get update        # 执行命令
EXPOSE 80                 # 声明端口
ENV NODE_ENV=production   # 设置环境变量
CMD ["python", "app.py"]  # 容器启动时执行的命令
```

## Docker Compose：管理多容器应用

当应用需要多个服务（如数据库、缓存、应用服务器）时，Docker Compose 可以帮你一次性管理所有容器。

### 安装 Docker Compose

```bash
# 下载Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.12.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 添加执行权限
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker-compose --version
```

### 创建一个完整的Web应用

```bash
# 创建项目目录
mkdir web-app
cd web-app

# 创建docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  # Web应用
  web:
    image: nginx
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html
    depends_on:
      - database

  # 数据库
  database:
    image: postgres:13
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - db_data:/var/lib/postgresql/data

  # 缓存
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

volumes:
  db_data:
EOF

# 创建网站内容
mkdir html
cat > html/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>多容器应用</title>
</head>
<body>
    <h1>这是一个多容器应用</h1>
    <p>包含了：</p>
    <ul>
        <li>Nginx Web服务器</li>
        <li>PostgreSQL 数据库</li>
        <li>Redis 缓存</li>
    </ul>
</body>
</html>
EOF
```

### 管理多容器应用

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs

# 停止所有服务
docker-compose down

# 重新构建并启动
docker-compose up -d --build
```

## 常用镜像介绍

### 1. 操作系统镜像
```bash
docker pull ubuntu:20.04      # Ubuntu系统
docker pull centos:8          # CentOS系统
docker pull alpine            # 轻量级Linux（体积小）
```

### 2. 编程语言镜像
```bash
docker pull python:3.9        # Python
docker pull node:16           # Node.js
docker pull openjdk:11        # Java
docker pull golang:1.17      # Go语言
```

### 3. 数据库镜像
```bash
docker pull mysql:8.0         # MySQL
docker pull postgres:13       # PostgreSQL
docker pull mongo:4.4         # MongoDB
docker pull redis:alpine      # Redis
```

### 4. Web服务器镜像
```bash
docker pull nginx             # Nginx
docker pull httpd             # Apache
docker pull tomcat:9.0        # Tomcat
```

## 实用技巧

### 1. 清理系统

```bash
# 删除停止的容器
docker container prune

# 删除未使用的镜像
docker image prune

# 删除未使用的数据卷
docker volume prune

# 全面清理（谨慎使用）
docker system prune -a
```

### 2. 监控资源使用

```bash
# 查看容器资源使用情况
docker stats

# 查看容器内进程
docker top 容器名称

# 查看容器详细信息
docker inspect 容器名称
```

### 3. 镜像操作技巧

```bash
# 给镜像打标签
docker tag 源镜像名称 新镜像名称

# 保存镜像到文件
docker save -o myimage.tar 镜像名称

# 从文件加载镜像
docker load -i myimage.tar

# 查看镜像历史
docker history 镜像名称
```

### 4. 容器操作技巧

```bash
# 复制文件到容器
docker cp 本地文件 容器名:/容器路径

# 从容器复制文件
docker cp 容器名:/容器路径 本地路径

# 查看容器IP地址
docker inspect 容器名 | grep IPAddress
```

## 最佳实践

### 1. 镜像构建最佳实践

```dockerfile
# 使用轻量级基础镜像
FROM alpine:latest

# 合并RUN指令减少层数
RUN apt-get update && \
    apt-get install -y python3 && \
    rm -rf /var/lib/apt/lists/*

# 利用缓存，将变化少的操作放在前面
COPY requirements.txt /app/
RUN pip install -r /app/requirements.txt
COPY . /app/

# 使用非root用户
RUN adduser -D -s /bin/sh appuser
USER appuser
```

### 2. 安全最佳实践

- 不要在镜像中存储敏感信息（密码、密钥等）
- 使用非root用户运行容器
- 定期更新基础镜像
- 限制容器资源使用

### 3. 性能优化

- 使用多阶段构建减小镜像大小
- 利用Docker层缓存
- 清理不必要的文件
- 选择合适的基础镜像

## 故障排除

### 1. 常见错误及解决方法

**权限错误**
```bash
# 如果出现权限错误，检查用户是否在docker组中
groups $USER
# 如果没有docker组，添加用户到docker组
sudo usermod -aG docker $USER
```

**端口冲突**
```bash
# 如果端口被占用，使用其他端口
docker run -p 8081:80 nginx  # 使用8081代替8080
```

**镜像下载慢**
```bash
# 配置国内镜像源
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF
sudo systemctl restart docker
```

### 2. 调试技巧

```bash
# 进入容器调试
docker exec -it 容器名 /bin/bash

# 查看详细错误信息
docker logs --details 容器名

# 检查容器配置
docker inspect 容器名
```

## 学习路径建议

### 阶段1：基础使用（1-2周）
1. 理解Docker基本概念
2. 熟练使用基本命令
3. 能够运行常用镜像

### 阶段2：进阶操作（2-3周）  
1. 学会编写Dockerfile
2. 理解数据卷和网络
3. 使用Docker Compose

### 阶段3：生产实践（持续学习）
1. 学习安全最佳实践
2. 了解容器编排（Kubernetes）
3. 掌握CI/CD集成

## 总结

Docker 是现代软件开发和部署的重要工具。通过本教程，你应该已经：

✅ **理解了Docker的核心概念**
- 镜像、容器、仓库的关系
- Docker解决的问题和优势

✅ **掌握了基本操作**
- 安装和配置Docker
- 运行和管理容器
- 使用常用命令

✅ **学会了实际应用**
- 部署简单网站
- 编写Dockerfile
- 使用Docker Compose

✅ **了解了最佳实践**
- 安全配置
- 性能优化
- 故障排除

记住，学习Docker最好的方式就是多动手实践！从简单的例子开始，逐步尝试更复杂的应用。

## 下一步学习建议

1. **深入学习Dockerfile**：尝试为不同类型的应用编写Dockerfile
2. **探索容器编排**：学习Kubernetes或Docker Swarm
3. **实践DevOps**：将Docker集成到CI/CD流程中
4. **学习容器安全**：了解如何安全地使用容器

Docker的世界很广阔，但有了这个基础，你已经可以开始你的容器化之旅了！🚀