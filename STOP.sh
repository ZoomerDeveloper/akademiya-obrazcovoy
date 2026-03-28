#!/usr/bin/env bash
# STOP.sh — остановить все сервисы Академии

echo "🛑 Останавливаем сервисы Академии..."

stop_pid() {
  local PIDFILE="$1"
  local NAME="$2"
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null && echo "✅ $NAME остановлен (PID: $PID)"
    fi
    rm -f "$PIDFILE"
  fi
}

stop_pid /tmp/mm-server.pid  "Mattermost Server"
stop_pid /tmp/mm-booking.pid "Booking Service"
stop_pid /tmp/mm-smsauth.pid "SMS Auth Service"
stop_pid /tmp/mm-bot.pid     "Bot Moderator"

# Дополнительный поиск по имени процесса
pkill -f "bot_moderator.js" 2>/dev/null && echo "✅ Bot Moderator остановлен" || true
pkill -f "booking_service/server" 2>/dev/null || pkill -f "academy-booking" 2>/dev/null || true
pkill -f "sms_auth/server" 2>/dev/null || pkill -f "academy-sms" 2>/dev/null || true

echo ""
echo "✅ Готово. Для остановки PostgreSQL:"
echo "   brew services stop postgresql@15"
