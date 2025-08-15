#!/bin/bash

# AI4S Blog 部署脚本

echo "构建 VitePress 站点..."
yarn docs:build

echo "同步文件到nginx目录..."
sudo rm -rf /var/www/ai4s-blog/*
sudo cp -r "${PWD}/docs/.vitepress/dist/"* /var/www/ai4s-blog/

echo "设置正确的权限..."
sudo chown -R www-data:www-data /var/www/ai4s-blog
sudo chmod -R 755 /var/www/ai4s-blog

echo "重新加载nginx配置..."
sudo systemctl reload nginx

echo "部署完成！网站已更新。"
echo "访问地址: http://10.129.242.36"
