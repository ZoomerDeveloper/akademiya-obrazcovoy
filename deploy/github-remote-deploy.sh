#!/usr/bin/env bash
# Выполняется на сервере после SSH из GitHub Actions (см. .github/workflows/academy-deploy-vps.yml).
# Ожидается: репозиторий уже клонирован, remote настроен, для приватного репо — deploy key на сервере.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${DEPLOY_BRANCH:-main}"
echo "→ deploy root: $ROOT"
echo "→ branch: $BRANCH"

git remote -v
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "→ npm microservices (booking_service, sms_auth)"
for d in booking_service sms_auth; do
    if [[ -f "$d/package.json" ]]; then
        echo "  · $d"
        (cd "$d" && npm ci --omit=dev 2>/dev/null || npm install --omit=dev --no-audit --no-fund)
    fi
done

if [[ -x /etc/academy/post-deploy.sh ]]; then
    echo "→ /etc/academy/post-deploy.sh"
    /etc/academy/post-deploy.sh
elif [[ -x deploy/post-deploy.local.sh ]]; then
    echo "→ deploy/post-deploy.local.sh (локальный хук в клоне)"
    deploy/post-deploy.local.sh
else
    echo "ℹ Нет хука перезапуска: создайте /etc/academy/post-deploy.sh (рекомендуется) или deploy/post-deploy.local.sh"
fi

echo "→ OK"
