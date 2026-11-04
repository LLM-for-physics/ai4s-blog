#!/bin/bash
# Install or refresh the llm-proxy service and switch nginx onto it. Idempotent.
# Requires root: sudo bash deploy/install-llm-proxy.sh
# Steps: service user -> code -> key migration -> unit -> nginx snippet (backup + nginx -t gate).
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

[ "$(id -u)" -eq 0 ] || { echo '请用 root 运行：sudo bash deploy/install-llm-proxy.sh' >&2; exit 1; }

DEST=/usr/local/lib/ai4s-llm-proxy/current
ENV_DIR=/etc/ai4s-llm-proxy
ENV_FILE=$ENV_DIR/llm-proxy.env
SNIPPET=/etc/nginx/snippets/ai4s-llm.conf
OLD_SECRET=/etc/nginx/secrets/ai4s-llm.conf

# 1. Dedicated service account.
id -u llm-proxy >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin llm-proxy

# 2. Zero-dependency code; only src/ is needed at runtime.
install -d -m 755 "$DEST"
rm -rf "$DEST/src"
install -d -m 755 "$DEST/src"
install -m 644 services/llm-proxy/src/config.js services/llm-proxy/src/app.js services/llm-proxy/src/server.js "$DEST/src/"

# 3. Migrate the credential from the nginx secret snippet into the systemd env file.
# configure-llm-secret.py preserves unrelated lines and writes 0600 atomically.
if [ ! -f "$ENV_FILE" ] || ! grep -q '^LLM_API_KEY=.' "$ENV_FILE"; then
  if [ -f "$OLD_SECRET" ]; then
    KEY=$(sed -n 's/^proxy_set_header Authorization "Bearer \([^"]*\)";$/\1/p' "$OLD_SECRET")
    [ -n "$KEY" ] || { echo "无法从 $OLD_SECRET 解析密钥，请先手动运行 configure-llm-secret.py" >&2; exit 1; }
    LLM_API_KEY="$KEY" python3 deploy/configure-llm-secret.py --output "$ENV_FILE"
    echo "密钥已从 $OLD_SECRET 迁移到 $ENV_FILE"
  else
    echo "缺少 $ENV_FILE 中的密钥，且无旧 nginx 密钥文件可迁移；请先运行 configure-llm-secret.py" >&2
    exit 1
  fi
fi
grep -q '^LLM_BASE_URL=.' "$ENV_FILE" || printf 'LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1\n' >> "$ENV_FILE"
grep -q '^LLM_MODEL=.' "$ENV_FILE" || printf 'LLM_MODEL=deepseek-v4.1-flash-1017\n' >> "$ENV_FILE"
chmod 700 "$ENV_DIR"; chmod 600 "$ENV_FILE"

# 4. Unit + (re)start. The service is live on 127.0.0.1:3082 before nginx switches.
install -m 644 services/llm-proxy/deploy/llm-proxy.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable llm-proxy >/dev/null
systemctl restart llm-proxy
sleep 1
curl -fsS http://127.0.0.1:3082/health >/dev/null
echo 'llm-proxy health OK'

# 5. Switch nginx: backup the live snippet, install the proxying one, gate on nginx -t.
if ! cmp -s deploy/llm-locations.conf "$SNIPPET"; then
  BAK="$SNIPPET.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$SNIPPET" "$BAK"
  install -m 644 deploy/llm-locations.conf "$SNIPPET"
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    echo "nginx 已切换到 llm-proxy（备份：$BAK）"
  else
    echo 'nginx 校验失败，恢复备份' >&2
    cp -a "$BAK" "$SNIPPET"
    nginx -t && systemctl reload nginx
    exit 1
  fi
else
  echo 'nginx snippet 已是最新版本'
fi

echo '完成。后续建议：'
echo '  1) 发布前端：bash deploy/deploy.sh'
echo "  2) 轮换密钥：LLM_API_KEY=新密钥 python3 deploy/configure-llm-secret.py && systemctl restart llm-proxy"
echo "  3) 轮换后旧密钥文件 $OLD_SECRET 已无引用，可删除"
