#!/usr/bin/env bash
# Первоначальная настройка SMS Auth Service
# Запуск: bash sms_auth/setup.sh <admin_email> <admin_password>
#
# Скрипт:
#  1. Авторизуется в Mattermost
#  2. Создаёт API-токен администратора
#  3. Записывает .env с токеном
#  4. Опционально привязывает демо-пользователей

set -e

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"

echo "=== Настройка SMS Auth Service ==="
echo "Mattermost: $BASE_URL"
echo ""

# ── Авторизация ──────────────────────────────────────────────────────────────
echo "→ Авторизация в Mattermost..."
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
USER_ID=$(echo "$LOGIN" | tail -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Ошибка авторизации. Проверьте email и пароль."
  exit 1
fi
echo "✅ Авторизован (ID: $USER_ID)"

# ── Создаём персональный API-токен администратора ─────────────────────────────
echo ""
echo "→ Создаём API-токен для SMS Auth Service..."
TOKEN_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/users/$USER_ID/tokens" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "sms-auth-service"}')

PERSISTENT_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$PERSISTENT_TOKEN" ]; then
  echo "⚠️  Не удалось создать отдельный токен — используем сессионный (не рекомендуется)"
  PERSISTENT_TOKEN="$ADMIN_TOKEN"
fi
echo "✅ Токен создан"

# ── Записываем .env ───────────────────────────────────────────────────────────
echo ""
echo "→ Создаём файл .env..."

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.backup"
  echo "  (старый .env сохранён как .env.backup)"
fi

cat > "$ENV_FILE" << EOF
# SMS Auth Service — автосгенерировано setup.sh
PORT=3002

# sms.ru — ЗАМЕНИТЕ на реальный API ID из https://sms.ru/api/
SMSRU_API_ID=ВСТАВЬТЕ_ВАШЕ_API_ID

# Имя отправителя (согласовать с sms.ru или оставить пустым)
SMSRU_FROM=

# ТЕСТОВЫЙ РЕЖИМ (SMS не отправляются, код возвращается в ответе)
# Поменяйте на 0 когда SMSRU_API_ID заполнен
SMSRU_TEST=1

# Mattermost
MM_SERVER_URL=$BASE_URL
MM_ADMIN_TOKEN=$PERSISTENT_TOKEN

# Параметры OTP
OTP_TTL_MIN=10
MAX_ATTEMPTS=5

# База данных
SMS_DB_PATH=$DIR/sms_auth.db
EOF

echo "✅ .env создан: $ENV_FILE"

# ── Привязка демо-пользователей ───────────────────────────────────────────────
echo ""
echo "→ Привязка телефонов для демо-аккаунтов..."
echo "  (После старта сервиса это можно сделать через API или Admin-панель)"
echo ""
echo "  Пример привязки через curl (после запуска npm start):"
echo ""
echo "  # Студент:"
echo "  curl -X POST http://localhost:3002/api/admin/phone-users \\"
echo "    -H 'Authorization: Bearer $ADMIN_TOKEN' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"phone\": \"+79161234501\", \"email\": \"student@academy.ru\"}'"
echo ""
echo "  # Педагог:"
echo "  curl -X POST http://localhost:3002/api/admin/phone-users \\"
echo "    -H 'Authorization: Bearer $ADMIN_TOKEN' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"phone\": \"+79161234502\", \"email\": \"teacher@academy.ru\"}'"

echo ""
echo "=============================================="
echo "✅ SMS Auth Service настроен!"
echo ""
echo "Следующие шаги:"
echo ""
echo "  1. Установить зависимости:"
echo "     cd $DIR && npm install"
echo ""
echo "  2. Вставить SMSRU_API_ID в $ENV_FILE"
echo "     (получить на https://sms.ru → Настройки → API)"
echo ""
echo "  3. Запустить сервис:"
echo "     cd $DIR && npm start"
echo ""
echo "  4. Привязать телефоны пользователей через Admin-панель"
echo "     (в приложении: Профиль → Управление пользователями)"
echo ""
echo "  API доступен на: http://localhost:3002"
echo "  Тестовый режим: ВКЛЮЧЁН (SMS не отправляются)"
echo "=============================================="
