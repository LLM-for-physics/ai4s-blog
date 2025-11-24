#!/bin/bash

# AI4S Blog 部署脚本

set -e  # 遇到错误立即退出

echo "======================================"
echo "  AI4S Blog 部署脚本"
echo "======================================"
echo ""

# 检查 Nginx 配置（排除注释行）
echo "1. 检查 Nginx 配置..."
if grep -v '^[[:space:]]*#' deploy/aiphy.conf | grep -q "YOUR_API_ENDPOINT_HERE\|YOUR_API_KEY_HERE"; then
    echo "⚠️  警告: 检测到 Nginx 配置中的占位符未替换"
    echo ""
    echo "请在 deploy/aiphy.conf 中配置以下内容："
    echo "  - proxy_pass: 替换 YOUR_API_ENDPOINT_HERE 为实际的 API 端点"
    echo "  - Authorization: 替换 YOUR_API_KEY_HERE 为实际的 API Key"
    echo ""
    read -p "是否继续部署？(y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "部署已取消"
        exit 1
    fi
fi

# 构建站点
echo ""
echo "2. 构建 VitePress 站点..."
yarn docs:build

# 同步文件
echo ""
echo "3. 同步文件到 nginx 目录..."
sudo rm -rf /var/www/ai4s-blog/*
sudo cp -r "${PWD}/docs/.vitepress/dist/"* /var/www/ai4s-blog/

# 设置权限
echo ""
echo "4. 设置正确的权限..."
sudo chown -R www-data:www-data /var/www/ai4s-blog
sudo chmod -R 755 /var/www/ai4s-blog

# 更新 Nginx 配置（如果需要）
echo ""
echo "5. 更新 Nginx 配置..."
if ! sudo diff -q deploy/aiphy.conf /etc/nginx/sites-available/aiphy.conf > /dev/null 2>&1; then
    echo "检测到配置文件变化，更新 Nginx 配置..."
    sudo cp deploy/aiphy.conf /etc/nginx/sites-available/aiphy.conf
    
    # 确保软链接存在
    if [ ! -L /etc/nginx/sites-enabled/aiphy.conf ]; then
        sudo ln -s /etc/nginx/sites-available/aiphy.conf /etc/nginx/sites-enabled/aiphy.conf
    fi
    
    echo "✓ Nginx 配置已更新"
else
    echo "✓ Nginx 配置无变化"
fi

# 检查 Nginx 配置文件语法
echo ""
echo "6. 验证 Nginx 配置语法..."
if ! sudo nginx -t -c /etc/nginx/nginx.conf 2>&1 | grep -q "syntax is ok"; then
    echo "❌ Nginx 配置语法错误，请检查配置文件"
    exit 1
fi
echo "✓ Nginx 配置语法正确"

# 重新加载 Nginx
echo ""
echo "7. 重新加载 Nginx..."
sudo systemctl reload nginx
echo "✓ Nginx 已重新加载"

echo ""
echo "======================================"
echo "  ✅ 部署完成！"
echo "======================================"
echo ""
echo "访问地址: https://aiphy.pku.edu.cn"
echo ""
echo "📝 提醒："
echo "  - 如果是首次部署，请确保已在 deploy/aiphy.conf 中配置 API 密钥"
echo "  - AI 助手功能需要正确配置反向代理才能工作"
echo ""
