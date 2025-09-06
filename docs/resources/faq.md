# 常见问题解答 (FAQ)

本页面收集了课程学习过程中的常见问题和解答。如果你的问题在这里找不到答案，请在课程微信群里发问或联系助教和老师。

## 📞 联系方式

- **授课教师**: 马滟青
- **邮箱**: yqma@pku.edu.cn
- **助教**: 方尤乐，见东山，李想
- **助教微信**: 15313960363

### 在线平台

- 物理与人工智能课程知识库 http://aiphy.pku.edu.cn/
- 北京大学物理学院网关 http://162.105.151.181/

只能在校园网环境下（或者连学校 VPN）访问

### 课程服务器资源

162.105.151.58、162.105.151.213 和 162.105.151.132
只能在校园网环境下（或者连学校 VPN）访问，可以通过 ssh 方式连接服务器（具体参考 [服务器连接和使用](../setup/server.md)）

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

---

*如果你的问题在这里没有找到答案，请不要犹豫，立即联系我们！*
