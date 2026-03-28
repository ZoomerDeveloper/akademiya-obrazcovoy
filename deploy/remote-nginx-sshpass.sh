#!/usr/bin/env bash
# Выгрузка сниппета nginx на сервер через sshpass (пароль только в env, не в репо).
# Пример:
#   export SSHPASS='...'
#   ./deploy/remote-nginx-sshpass.sh root@185.71.196.254
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIP="$ROOT/deploy/nginx-academy-microservices.include"
TARGET="${1:?Укажите user@host, например root@185.71.196.254}"

if [[ -z "${SSHPASS:-}" ]]; then
    echo "Задайте SSHPASS (пароль SSH) или используйте ssh-ключи без этого скрипта." >&2
    exit 1
fi

if [[ ! -f "$SNIP" ]]; then
    echo "Не найден: $SNIP" >&2
    exit 1
fi

command -v sshpass >/dev/null 2>&1 || {
    echo "Установите sshpass (brew install sshpass / apt install sshpass)" >&2
    exit 1
}

sshpass -e scp -o ConnectTimeout=30 -o ServerAliveInterval=10 "$SNIP" "${TARGET}:/tmp/academy-microservices.conf"

sshpass -e ssh -o ConnectTimeout=30 -o ServerAliveInterval=10 "$TARGET" 'bash -se' << 'REMOTE'
set -euo pipefail
mkdir -p /etc/nginx/snippets
cp /tmp/academy-microservices.conf /etc/nginx/snippets/academy-microservices.conf
MM=/etc/nginx/sites-available/mattermost
if ! grep -q "include snippets/academy-microservices.conf" "$MM"; then
  python3 -c "
import pathlib
p = pathlib.Path('/etc/nginx/sites-available/mattermost')
t = p.read_text(encoding='utf-8')
if 'academy-microservices.conf' in t:
    raise SystemExit(0)
needle = 'client_max_body_size 100M;'
if needle not in t:
    raise SystemExit('ожидалась строка client_max_body_size 100M; в mattermost site')
ins = needle + '\n\n    include snippets/academy-microservices.conf;'
p.write_text(t.replace(needle, ins, 1), encoding='utf-8')
print('patched mattermost site')
"
else
  echo "include уже есть"
fi
nginx -t
systemctl reload nginx
echo "OK: nginx reloaded"
code=$(curl -sS -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1/booking-service/health || echo "000")
echo "booking-service/health HTTP $code"
rooms=$(curl -sS -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1/booking-service/api/rooms || echo "000")
echo "booking-service/api/rooms HTTP $rooms (ожидается 401; 404 = regex /api/ перехватывает — нужен ^~ в сниппете)"
code2=$(curl -sS -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1/sms-auth-service/health || echo "000")
echo "sms-auth-service/health HTTP $code2"
REMOTE
