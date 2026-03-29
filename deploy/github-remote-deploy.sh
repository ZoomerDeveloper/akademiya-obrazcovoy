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

academy_restart_service_fallback() {
    local NAME="$1"
    local DIR="$2"
    local ENTRY="$3"
    local PM2_NAME="$4"
    local LOG_FILE="$5"

    if [[ ! -f "$DIR/$ENTRY" ]]; then
        echo "ℹ $NAME: entry not found ($DIR/$ENTRY), skip"
        return 0
    fi

    echo "→ restart $NAME"

    if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
        pm2 restart "$PM2_NAME"
        echo "   $NAME: restarted via pm2 ($PM2_NAME)"
        return 0
    fi

    # Fallback without pm2/systemd: restart node process by path pattern.
    pkill -f "$DIR/$ENTRY" 2>/dev/null || true
    (
        cd "$DIR"
        nohup node -r dotenv/config "$ENTRY" > "$LOG_FILE" 2>&1 &
    )
    echo "   $NAME: restarted via nohup (log: $LOG_FILE)"
}

if [[ -x /etc/academy/post-deploy.sh ]]; then
    echo "→ /etc/academy/post-deploy.sh"
    /etc/academy/post-deploy.sh
elif [[ -x deploy/post-deploy.local.sh ]]; then
    echo "→ deploy/post-deploy.local.sh (локальный хук в клоне)"
    deploy/post-deploy.local.sh
else
    echo "ℹ Нет хука перезапуска: запускаю встроенный fallback restart для microservices"
    academy_restart_service_fallback "Booking Service" "$ROOT/booking_service" "server.js" "academy-booking" "/tmp/mm-booking.log"
    academy_restart_service_fallback "SMS Auth Service" "$ROOT/sms_auth" "server.js" "academy-sms" "/tmp/mm-smsauth.log"
fi

# ── Nginx: сниппет booking / sms (^~ чтобы не перехватывал location ~ /api/ у Mattermost) ──
academy_deploy_nginx_snippet() {
    local SNIP="$ROOT/deploy/nginx-academy-microservices.include"
    [[ -f "$SNIP" ]] || {
        echo "ℹ nginx: нет файла $SNIP — пропуск"
        return 0
    }
    if [[ "${ACADEMY_SKIP_NGINX:-0}" == "1" ]]; then
        echo "ℹ nginx: ACADEMY_SKIP_NGINX=1 — пропуск"
        return 0
    fi
    local SUDO=()
    if [[ "$(id -u)" -ne 0 ]]; then
        if sudo -n true 2>/dev/null; then
            SUDO=(sudo -n)
        else
            echo "ℹ nginx: не root и нет passwordless sudo — сниппет не обновлён (см. deploy/install-nginx-snippet.sh или deploy/remote-nginx-sshpass.sh)"
            return 0
        fi
    fi
    echo "→ nginx: snippets/academy-microservices.conf (^~ /booking-service/, ^~ /sms-auth-service/)"
    "${SUDO[@]}" mkdir -p /etc/nginx/snippets
    "${SUDO[@]}" cp "$SNIP" /etc/nginx/snippets/academy-microservices.conf
    local MM_SITE=/etc/nginx/sites-available/mattermost
    if [[ -f "$MM_SITE" ]] && ! grep -q "include snippets/academy-microservices.conf" "$MM_SITE" 2>/dev/null; then
        echo "→ nginx: добавляю include в $MM_SITE"
        "${SUDO[@]}" python3 -c "
import pathlib
p = pathlib.Path('/etc/nginx/sites-available/mattermost')
t = p.read_text(encoding='utf-8')
if 'academy-microservices.conf' in t:
    raise SystemExit(0)
needle = 'client_max_body_size 100M;'
if needle not in t:
    raise SystemExit('нет строки client_max_body_size 100M; — добавьте вручную: include snippets/academy-microservices.conf;')
ins = needle + '\n\n    include snippets/academy-microservices.conf;'
p.write_text(t.replace(needle, ins, 1), encoding='utf-8')
print('patched')
"
    fi
    "${SUDO[@]}" nginx -t
    "${SUDO[@]}" systemctl reload nginx
    echo "→ nginx: reload OK"
    local code rooms health
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1/booking-service/health || echo "000")
    echo "   booking-service/health → HTTP $code"
    rooms=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1/booking-service/api/rooms || echo "000")
    echo "   booking-service/api/rooms → HTTP $rooms (ожидается 401 без токена; 404 = конфликт location с MM)"
    health=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1/sms-auth-service/health || echo "000")
    echo "   sms-auth-service/health → HTTP $health"
}
academy_deploy_nginx_snippet

echo "→ OK"
