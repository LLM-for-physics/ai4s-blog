# 常见问题解答 (FAQ)

本页面收集了课程学习过程中的常见问题和解答。如果你的问题在这里找不到答案，请在课程论坛发帖或联系助教。

## 🔧 环境配置问题

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

## 🔬 技术问题


## 🎓 课程政策问题

## 📞 联系方式

### 课程团队

### 在线平台

---

*如果你的问题在这里没有找到答案，请不要犹豫，立即联系我们！*
