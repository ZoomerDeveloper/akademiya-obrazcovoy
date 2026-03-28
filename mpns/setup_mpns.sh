#!/usr/bin/env bash
# Скрипт настройки MPNS (Mattermost Push Notification Service)
# Запуск: bash mpns/setup_mpns.sh <admin_email> <admin_password>
# Требует: запущенный MPNS (docker compose up -d в папке mpns/)

set -e

BASE_URL="http://localhost:8065"
MPNS_URL="http://localhost:8066"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"

echo "=== Настройка Push Notification Service ==="
echo "Mattermost: $BASE_URL"
echo "MPNS:       $MPNS_URL"
echo ""

# 1. Авторизация
echo "→ Авторизация..."
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось получить токен"
  exit 1
fi
echo "✅ Авторизован"

# 2. Проверяем MPNS
echo ""
echo "→ Проверка доступности MPNS ($MPNS_URL)..."
MPNS_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$MPNS_URL" 2>/dev/null || echo "000")
if [ "$MPNS_STATUS" = "000" ]; then
  echo "⚠️  MPNS недоступен. Убедись, что запустил:"
  echo "   cd /Users/devbroseph/Mattermost/mpns && docker compose up -d"
  echo ""
  echo "   (продолжаем настройку сервера — MPNS можно запустить позже)"
else
  echo "✅ MPNS доступен (HTTP $MPNS_STATUS)"
fi

# 3. Настраиваем Mattermost для работы с MPNS
echo ""
echo "→ Настройка EmailSettings и Push-уведомлений..."
curl -sS -X PUT "$BASE_URL/api/v4/config/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"EmailSettings\": {
      \"SendPushNotifications\": true,
      \"PushNotificationServer\": \"$MPNS_URL\",
      \"PushNotificationContents\": \"full\",
      \"PushNotificationBuffer\": 1000
    },
    \"TeamSettings\": {
      \"MaxNotificationsPerChannel\": 1000
    }
  }" > /dev/null
echo "✅ Сервер настроен на MPNS: $MPNS_URL"

# 4. Настраиваем политики уведомлений (напоминание об оплате — 25 числа)
echo ""
echo "→ Настройка политик уведомлений..."
curl -sS -X PUT "$BASE_URL/api/v4/config/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "NotificationLogSettings": {
      "EnableNotificationLog": true
    },
    "ServiceSettings": {
      "EnableBotAccountCreation": true
    }
  }' > /dev/null
echo "✅ Логирование уведомлений включено"

# 5. Создаём бота для напоминаний об оплате
echo ""
echo "→ Создание бота напоминаний об оплате..."
BOT_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/bots" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "payment-reminder",
    "display_name": "Напоминание об оплате",
    "description": "Автоматические напоминания об оплате обучения"
  }')

BOT_ID=$(echo "$BOT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user_id',''))" 2>/dev/null)
if [ -n "$BOT_ID" ]; then
  echo "✅ Бот создан: $BOT_ID"
  # Генерируем токен для бота
  BOT_TOKEN_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/users/$BOT_ID/tokens" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"description": "payment-reminder-token"}')
  BOT_TOKEN=$(echo "$BOT_TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
  if [ -n "$BOT_TOKEN" ]; then
    echo ""
    echo "  🔑 Токен бота (сохрани его!):"
    echo "     $BOT_TOKEN"
    echo ""
    # Сохраняем токен в файл
    echo "$BOT_TOKEN" > /Users/devbroseph/Mattermost/mpns/.bot_payment_token
    echo "  → Сохранён в: mpns/.bot_payment_token"
  fi
else
  echo "  ⚠️  Бот уже существует или ошибка: $(echo "$BOT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','?'))" 2>/dev/null)"
fi

echo ""
echo "============================================"
echo "✅ НАСТРОЙКА MPNS ЗАВЕРШЕНА"
echo ""
echo "Следующие шаги:"
echo "  1. Добавь APNs-сертификат iOS в: mpns/config.json"
echo "     (ApplePushCertPrivate — путь к .pem файлу)"
echo "  2. Добавь FCM Server Key для Android в: mpns/config.json"
echo "     (AndroidApiKey — из Firebase Console)"
echo "  3. Перезапусти MPNS: cd mpns && docker compose restart"
echo ""
echo "  Получить APNs-сертификат:"
echo "    → developer.apple.com → Certificates → Push Notifications"
echo "    → Bundle ID: ru.obrazcova.academy"
echo ""
echo "  Получить FCM Server Key:"
echo "    → console.firebase.google.com → Настройки проекта → Cloud Messaging"
echo "============================================"
