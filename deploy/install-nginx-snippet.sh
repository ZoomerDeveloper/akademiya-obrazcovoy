#!/usr/bin/env bash
# Установка сниппета nginx на сервере (запускать с машины, где есть sudo и репозиторий).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIP="$ROOT/deploy/nginx-academy-microservices.include"
if [[ ! -f "$SNIP" ]]; then
    echo "Не найден: $SNIP" >&2
    exit 1
fi
sudo cp "$SNIP" /etc/nginx/snippets/academy-microservices.conf
echo "Установлено: /etc/nginx/snippets/academy-microservices.conf"
echo "Добавьте в server { } для Mattermost:   include snippets/academy-microservices.conf;"
echo "Затем: sudo nginx -t && sudo systemctl reload nginx"
