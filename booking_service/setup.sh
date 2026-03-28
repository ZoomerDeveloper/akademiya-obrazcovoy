#!/usr/bin/env bash
# Настройка Booking Service
# Запуск: bash booking_service/setup.sh <admin_email> <admin_password>

set -e

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/.env"

echo "=== Настройка Booking Service ==="

# Авторизация
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Ошибка авторизации"
  exit 1
fi
echo "✅ Авторизован"

# Создаём бота booking-service (если нет)
echo "→ Создание бота booking-service..."
BOT_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/bots" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "booking-service",
    "display_name": "Бронирование Академии",
    "description": "Сервис бронирования классов"
  }')

BOT_USER_ID=$(echo "$BOT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user_id',''))" 2>/dev/null)
if [ -z "$BOT_USER_ID" ]; then
  BOT_USER_ID=$(curl -sS "$BASE_URL/api/v4/users/username/booking-service" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
fi
echo "✅ Бот ID: $BOT_USER_ID"

# Токен бота
TOKEN_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/users/$BOT_USER_ID/tokens" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "booking-service-token"}')
BOT_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

# Добавляем бота в команду
TEAMS_LIST=$(curl -sS "$BASE_URL/api/v4/teams" -H "Authorization: Bearer $ADMIN_TOKEN")
TEAM_ID=$(echo "$TEAMS_LIST" | python3 -c "
import sys, json
teams = json.load(sys.stdin)
for t in teams:
    if t.get('name') == 'akademiya-obrazcovoy':
        print(t['id'])
        break
" 2>/dev/null)

if [ -n "$TEAM_ID" ] && [ -n "$BOT_USER_ID" ]; then
  curl -sS -X POST "$BASE_URL/api/v4/teams/$TEAM_ID/members" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"team_id\":\"$TEAM_ID\",\"user_id\":\"$BOT_USER_ID\"}" > /dev/null
  echo "✅ Бот добавлен в команду"
fi

# Записываем .env
cat > "$ENV_FILE" << EOF
# Booking Service
PORT=3001
MM_SERVER_URL=$BASE_URL
MM_BOT_TOKEN=$BOT_TOKEN
MM_ADMIN_TOKEN=$ADMIN_TOKEN
MM_BOOKING_CHANNEL=resepchen
BOOKING_SERVICE_URL=http://localhost:3001
DB_PATH=$DIR/bookings.db
EOF

echo ""
echo "============================================"
echo "✅ Booking Service настроен!"
echo ""
echo "Для запуска:"
echo "  cd /Users/devbroseph/Mattermost/booking_service"
echo "  npm install"
echo "  npm start"
echo ""
echo "API будет доступен на: http://localhost:3001"
echo ""
echo "Для автозапуска через pm2:"
echo "  pm2 start server.js --name academy-booking"
echo "  pm2 save"
echo "============================================"
