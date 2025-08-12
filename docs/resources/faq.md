# 常见问题解答 (FAQ)

本页面收集了课程学习过程中的常见问题和解答。如果你的问题在这里找不到答案，请在课程论坛发帖或联系助教。

## 🔧 环境配置问题

### Q: 如何选择Python版本？
**A**: 建议使用Python 3.9或3.10。避免使用最新的版本（如3.12），因为某些科学计算库可能还不完全兼容。

### Q: Anaconda和Miniconda有什么区别？
**A**: 
- **Anaconda**: 完整版，包含很多预装的科学计算包，大约3GB
- **Miniconda**: 精简版，只包含conda和Python，约400MB，推荐使用

### Q: 如何解决包安装失败的问题？
**A**: 
1. 首先尝试更新conda：`conda update conda`
2. 使用conda-forge频道：`conda install -c conda-forge package_name`
3. 如果还不行，尝试pip：`pip install package_name`
4. 创建新的虚拟环境重新安装

### Q: GPU环境如何配置？
**A**: 
```bash
# 检查CUDA版本
nvidia-smi

# 安装对应版本的PyTorch
conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia

# 验证GPU可用性
python -c "import torch; print(torch.cuda.is_available())"
```

## 🖥️ 服务器使用问题

### Q: 无法连接到服务器怎么办？
**A**: 
1. 检查VPN是否已连接
2. 确认SSH密钥权限：`chmod 600 ~/.ssh/ai4s_key`
3. 检查防火墙设置
4. 联系管理员检查服务器状态

### Q: Jupyter Lab启动失败怎么办？
**A**: 
```bash
# 杀死已有进程
pkill -f jupyter

# 重新启动
jupyter lab --no-browser --port=8888

# 检查端口占用
lsof -i :8888
```

### Q: 如何查看服务器资源使用情况？
**A**: 
```bash
# 查看CPU和内存
htop

# 查看GPU使用
nvidia-smi

# 查看磁盘空间
df -h

# 查看当前目录大小
du -sh .
```

### Q: 如何传输大文件？
**A**: 
```bash
# 使用rsync（推荐）
rsync -avz --progress local_file user@server:/path/

# 使用scp
scp -r local_folder user@server:/path/

# 压缩后传输
tar -czf archive.tar.gz folder/
scp archive.tar.gz user@server:/path/
```

## 📚 作业相关问题

### Q: 作业延迟提交有什么后果？
**A**: 
- 24小时内：扣除10%分数
- 48小时内：扣除20%分数
- 72小时内：扣除30%分数
- 超过72小时：扣除50%分数

### Q: 可以和同学讨论作业吗？
**A**: 
**可以讨论**：
- 理论概念和方法
- 技术问题和调试
- 学习资源分享

**不可以**：
- 直接复制代码
- 分享具体答案
- 代写作业

### Q: 如何引用他人的代码？
**A**: 
```python
# 参考来源：https://github.com/example/repo
# 作者：Example Author
# 修改：根据课程需求进行了适配
def example_function():
    """
    这个函数参考了XXX的实现，进行了以下修改：
    1. 适配了我们的数据格式
    2. 添加了错误处理
    """
    pass
```

### Q: 代码运行错误怎么办？
**A**: 
1. **仔细阅读错误信息** - 错误信息通常会指出问题所在
2. **检查数据类型** - 确保输入数据类型正确
3. **检查数组维度** - NumPy操作要注意维度匹配
4. **使用调试工具** - 在Jupyter中使用`%debug`
5. **搜索错误信息** - 在Google或Stack Overflow搜索

## 🔬 技术问题

### Q: 如何处理大数据集？
**A**: 
```python
# 分块读取
import pandas as pd

chunk_list = []
for chunk in pd.read_csv('large_file.csv', chunksize=1000):
    chunk_list.append(chunk)
df = pd.concat(chunk_list, ignore_index=True)

# 使用Dask处理超大数据
import dask.dataframe as dd
df = dd.read_csv('large_file.csv')
```

### Q: 模型训练太慢怎么办？
**A**: 
1. **检查GPU使用**：确保使用GPU训练
2. **调整批次大小**：增大batch size（如果内存允许）
3. **数据预处理**：预先处理数据，避免重复计算
4. **使用更高效的算法**：选择适合的模型架构
5. **并行化**：使用多进程处理数据

### Q: 内存不足怎么办？
**A**: 
```python
# 释放内存
import gc
del large_variable
gc.collect()

# 查看内存使用
import psutil
print(f"内存使用: {psutil.virtual_memory().percent}%")

# 使用内存映射
import numpy as np
large_array = np.memmap('data.dat', dtype='float32', mode='r')
```

### Q: 如何优化代码性能？
**A**: 
1. **使用向量化操作**：避免Python循环
2. **选择合适的数据结构**：list vs numpy array
3. **使用JIT编译**：Numba加速
4. **并行处理**：multiprocessing或joblib
5. **性能分析**：使用cProfile找出瓶颈

## 📖 学习方法问题

### Q: 如何跟上课程进度？
**A**: 
1. **制定学习计划**：每周安排固定的学习时间
2. **及时复习**：课后及时回顾课程内容
3. **动手实践**：多写代码，多做练习
4. **寻求帮助**：不懂就问，参加答疑
5. **组建学习小组**：与同学组队学习

### Q: 推荐哪些额外的学习资源？
**A**: 
- **书籍**：见[推荐书籍页面](/resources/books)
- **在线课程**：Coursera, edX, Udacity
- **实践平台**：Kaggle, Google Colab
- **论文网站**：arXiv, Papers with Code

### Q: 如何提高编程能力？
**A**: 
1. **多写代码**：实践是最好的老师
2. **阅读优秀代码**：学习开源项目
3. **参与项目**：加入开源项目或自己做项目
4. **学习算法**：刷LeetCode提高算法思维
5. **Code Review**：让他人审查你的代码

## 🎓 课程政策问题

### Q: 如何申请延期？
**A**: 
需要提前至少48小时发邮件给助教，说明原因并提供相关证明。特殊情况下可以考虑延期，但需要合理的理由。

### Q: 缺课怎么办？
**A**: 
1. 提前请假（发邮件给老师）
2. 找同学借笔记
3. 观看录制的课程视频（如果有）
4. 参加下次答疑时间补充了解

### Q: 如何查看成绩？
**A**: 
- 登录[课程管理系统](https://lms.university.edu/ai4s)
- 作业成绩会在批改完成后一周内公布
- 如对成绩有疑问，可以申请复核

### Q: 考试形式是什么？
**A**: 
- **期中考试**：开卷考试，主要考察理论理解
- **期末项目**：综合项目答辩，占总成绩40%
- **平时作业**：4个作业，占总成绩60%

## 🚨 紧急情况

### Q: 遇到技术故障怎么办？
**A**: 
1. **立即联系助教**：发邮件详细描述问题
2. **保存证据**：截图、错误信息、日志文件
3. **寻找替代方案**：使用本地环境或其他工具
4. **及时沟通**：不要等到最后一刻才报告问题

### Q: 服务器维护期间怎么办？
**A**: 
- 提前会收到维护通知
- 使用本地环境继续工作
- 维护完成后及时同步代码

## 📞 联系方式

### 课程团队
- **主讲教师**：zhang@university.edu
- **助教团队**：ai4s-ta@university.edu
- **技术支持**：ai4s-tech@university.edu

### 答疑时间
- **线上答疑**：每周二 20:00-21:00
- **线下答疑**：每周三、五 15:00-17:00
- **紧急联系**：ai4s-emergency@university.edu

### 在线平台
- **课程论坛**：[https://forum.university.edu/ai4s](https://forum.university.edu/ai4s)
- **课程群**：微信群（二维码见课程通知）
- **作业提交**：[https://lms.university.edu/ai4s](https://lms.university.edu/ai4s)

---

*如果你的问题在这里没有找到答案，请不要犹豫，立即联系我们！*
