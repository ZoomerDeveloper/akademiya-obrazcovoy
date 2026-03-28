#!/usr/bin/env bash
# Создаёт бота-модератора и записывает токены в .env
# Запуск: bash bot_moderator/setup_moderator_bot.sh <admin_email> <admin_password>

set -e

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"
ENV_FILE="$(dirname "$0")/.env"

echo "=== Настройка бота-модератора ==="

# Авторизация
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Ошибка авторизации"
  exit 1
fi
echo "✅ Авторизован как администратор"

# Создаём бота
echo "→ Создание бота-модератора..."
BOT_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/bots" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "moderator-bot",
    "display_name": "Модератор",
    "description": "Следит за readonly-каналами Академии"
  }')

BOT_USER_ID=$(echo "$BOT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user_id',''))" 2>/dev/null)
if [ -z "$BOT_USER_ID" ]; then
  # Уже существует — ищем
  BOT_USER_ID=$(curl -sS "$BASE_URL/api/v4/users/username/moderator-bot" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
fi
echo "✅ Бот ID: $BOT_USER_ID"

# Генерируем токен бота
echo "→ Генерация токена бота..."
TOKEN_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/users/$BOT_USER_ID/tokens" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "moderator-bot-token"}')
BOT_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ Не удалось получить токен бота"
  exit 1
fi

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

if [ -n "$TEAM_ID" ]; then
  curl -sS -X POST "$BASE_URL/api/v4/teams/$TEAM_ID/members" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"team_id\":\"$TEAM_ID\",\"user_id\":\"$BOT_USER_ID\"}" > /dev/null
  echo "✅ Бот добавлен в команду"
fi

# Записываем .env
cat > "$ENV_FILE" << EOF
MM_SERVER_URL=$BASE_URL
MM_BOT_TOKEN=$BOT_TOKEN
MM_ADMIN_TOKEN=$ADMIN_TOKEN
EOF

echo ""
echo "============================================"
echo "✅ Бот настроен!"
echo ""
echo "Файл .env создан: $ENV_FILE"
echo ""
echo "Для запуска бота:"
echo "  cd /Users/devbroseph/Mattermost/bot_moderator"
echo "  npm install"
echo "  npm start"
echo ""
echo "Для автозапуска (pm2):"
echo "  npm install -g pm2"
echo "  pm2 start bot_moderator.js --name academy-moderator"
echo "  pm2 save && pm2 startup"
echo "============================================"
