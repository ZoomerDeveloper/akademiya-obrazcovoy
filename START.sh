#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# START.sh — Полный запуск Академии Образцовой
# Запуск: bash /Users/devbroseph/Mattermost/START.sh
#
# Что делает скрипт:
#  1. Проверяет зависимости (PostgreSQL, Go, Node.js, npm)
#  2. Устанавливает npm-зависимости для микросервисов (если нет)
#  3. Запускает PostgreSQL
#  4. Запускает Mattermost-сервер (фоново, логи → /tmp/mm-server.log)
#  5. Запускает Booking Service   (фоново, логи → /tmp/mm-booking.log)
#  6. Запускает SMS Auth Service  (фоново, логи → /tmp/mm-smsauth.log)
#  7. Запускает Bot-модератор     (фоново, логи → /tmp/mm-bot.log)
#  8. Выводит итоговую сводку
# ═══════════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[1;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${BLUE}→  $1${NC}"; }

ROOT="/Users/devbroseph/Mattermost"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    Академия Образцовой — Запуск системы          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────── 0. Проверка зависимостей ────────────────────────

info "Проверяем зависимости..."

# Go
if ! command -v go &>/dev/null; then
  err "Go не найден. Установите: brew install go"
  exit 1
fi
ok "Go $(go version | awk '{print $3}')"

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js не найден. Установите через nvm: nvm install 20 && nvm use 20"
  exit 1
fi
ok "Node.js $(node --version)"

# PostgreSQL
if ! command -v psql &>/dev/null; then
  err "PostgreSQL не найден. Установите: brew install postgresql@15"
  exit 1
fi
ok "PostgreSQL $(psql --version | awk '{print $3}')"

echo ""

# ─────────────────────────── 1. PostgreSQL ───────────────────────────────────

info "Запускаем PostgreSQL..."
if brew services list 2>/dev/null | grep -q "postgresql.*started"; then
  ok "PostgreSQL уже запущен"
else
  brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
  sleep 2
  ok "PostgreSQL запущен"
fi

# Проверяем базу данных
if ! psql -U mmuser -d mattermost -c "SELECT 1" &>/dev/null 2>&1; then
  warn "База mattermost не найдена или пользователь mmuser отсутствует."
  echo "  Создайте вручную:"
  echo "    createuser --pwprompt mmuser   # пароль: mmuser_password"
  echo "    createdb -O mmuser mattermost"
  echo "  Затем перезапустите скрипт."
  echo ""
fi

echo ""

# ─────────────────────────── 2. Установка npm зависимостей ──────────────────

install_npm_if_needed() {
  local DIR="$1"
  local NAME="$2"
  if [ ! -d "$DIR/node_modules" ]; then
    info "Устанавливаем зависимости $NAME..."
    (cd "$DIR" && npm install --silent 2>&1 | tail -3)
    ok "$NAME: зависимости установлены"
  else
    ok "$NAME: зависимости уже установлены"
  fi
}

install_npm_if_needed "$ROOT/booking_service" "Booking Service"
install_npm_if_needed "$ROOT/sms_auth" "SMS Auth Service"
install_npm_if_needed "$ROOT/bot_moderator" "Bot Moderator"

echo ""

# ─────────────────────────── 3. Копируем .env если нет ─────────────────────

copy_env_if_needed() {
  local DIR="$1"
  local NAME="$2"
  if [ ! -f "$DIR/.env" ]; then
    if [ -f "$DIR/.env.example" ]; then
      cp "$DIR/.env.example" "$DIR/.env"
      warn "$NAME: создан .env из .env.example — проверьте настройки!"
    else
      warn "$NAME: файл .env не найден — возможны ошибки запуска"
    fi
  fi
}

copy_env_if_needed "$ROOT/booking_service" "Booking Service"
copy_env_if_needed "$ROOT/sms_auth" "SMS Auth Service"
copy_env_if_needed "$ROOT/bot_moderator" "Bot Moderator"

echo ""

# ─────────────────────────── 4. Mattermost Server ────────────────────────────

info "Запускаем Mattermost Server..."

if pgrep -f "mattermost/server" &>/dev/null; then
  ok "Mattermost Server уже запущен"
else
  # Проверяем наличие скомпилированного бинарника
  if [ -f "$ROOT/server/bin/mattermost" ]; then
    nohup "$ROOT/server/bin/mattermost" --config="$ROOT/server/config/config.json" \
      > /tmp/mm-server.log 2>&1 &
    MM_PID=$!
    echo $MM_PID > /tmp/mm-server.pid
    sleep 3
    if kill -0 $MM_PID 2>/dev/null; then
      ok "Mattermost Server запущен (PID: $MM_PID)"
      ok "Логи: /tmp/mm-server.log"
    else
      warn "Сервер не запустился через бинарник, пробуем через make..."
      (cd "$ROOT/server" && nohup make run-server > /tmp/mm-server.log 2>&1 &)
      ok "Mattermost Server запускается через make (логи: /tmp/mm-server.log)"
    fi
  else
    # Запускаем через make (компиляция при первом запуске)
    info "Бинарник не найден — запуск через make (первый раз может занять 5-10 мин)..."
    (cd "$ROOT/server" && nohup make run-server > /tmp/mm-server.log 2>&1 &)
    echo $! > /tmp/mm-server.pid
    ok "Mattermost Server компилируется и запускается (логи: /tmp/mm-server.log)"
  fi
fi

echo ""

# ─────────────────────────── 5. Booking Service ──────────────────────────────

info "Запускаем Booking Service..."

if pgrep -f "booking_service/server" &>/dev/null || pgrep -f "academy-booking" &>/dev/null; then
  ok "Booking Service уже запущен"
else
  (cd "$ROOT/booking_service" && nohup node -r dotenv/config server.js > /tmp/mm-booking.log 2>&1 &)
  echo $! > /tmp/mm-booking.pid
  sleep 1
  ok "Booking Service запущен (порт 3001, логи: /tmp/mm-booking.log)"
fi

echo ""

# ─────────────────────────── 6. SMS Auth Service ─────────────────────────────

info "Запускаем SMS Auth Service..."

if pgrep -f "sms_auth/server" &>/dev/null || pgrep -f "academy-sms" &>/dev/null; then
  ok "SMS Auth Service уже запущен"
else
  if [ -f "$ROOT/sms_auth/.env" ] && grep -q "SMSRU_API_ID" "$ROOT/sms_auth/.env" 2>/dev/null; then
    (cd "$ROOT/sms_auth" && nohup node -r dotenv/config server.js > /tmp/mm-smsauth.log 2>&1 &)
    echo $! > /tmp/mm-smsauth.pid
    sleep 1
    ok "SMS Auth Service запущен (порт 3002, логи: /tmp/mm-smsauth.log)"
    if grep -q "SMSRU_TEST=1" "$ROOT/sms_auth/.env" 2>/dev/null; then
      warn "SMS Auth работает в ТЕСТОВОМ режиме (SMS не отправляются)"
    fi
  else
    warn "SMS Auth Service: .env не настроен, пропускаем."
    echo "  Настройте: bash $ROOT/sms_auth/setup.sh admin@academy.ru AdminPass123!"
  fi
fi

echo ""

# ─────────────────────────── 7. Bot Moderator ────────────────────────────────

info "Запускаем Bot Moderator..."

if pgrep -f "bot_moderator" &>/dev/null || pgrep -f "academy-moderator" &>/dev/null; then
  ok "Bot Moderator уже запущен"
else
  if [ -f "$ROOT/bot_moderator/.env" ]; then
    (cd "$ROOT/bot_moderator" && nohup node -r dotenv/config bot_moderator.js > /tmp/mm-bot.log 2>&1 &)
    echo $! > /tmp/mm-bot.pid
    sleep 1
    ok "Bot Moderator запущен (логи: /tmp/mm-bot.log)"
  else
    warn "Bot Moderator: .env не настроен, пропускаем."
    echo "  Настройте: bash $ROOT/bot_moderator/setup_moderator_bot.sh admin@academy.ru AdminPass123!"
  fi
fi

echo ""

# ─────────────────────────── 8. Ожидаем готовность сервера ───────────────────

info "Ожидаем запуска Mattermost Server..."
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:8065" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" != "000" ]; then
    ok "Mattermost Server отвечает (HTTP $HTTP_CODE)"
    break
  fi
  printf "."
  sleep 3
  WAITED=$((WAITED + 3))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  warn "Mattermost Server ещё не ответил за ${MAX_WAIT}с — может компилироваться"
  echo "  Следите за: tail -f /tmp/mm-server.log"
fi

echo ""

# ─────────────────────────── 9. Итоговая сводка ──────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    🎓 Академия Образцовой — ЗАПУЩЕНА             ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Mattermost Web:     http://localhost:8065       ║"
echo "║  Booking Service:    http://localhost:3001       ║"
echo "║  SMS Auth Service:   http://localhost:3002       ║"
echo "║                                                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Демо-аккаунты:                                  ║"
echo "║  admin@academy.ru   / AdminPass123!              ║"
echo "║  teacher@academy.ru / Teacher123!                ║"
echo "║  student@academy.ru / Student123!                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Логи:                                           ║"
echo "║  tail -f /tmp/mm-server.log                      ║"
echo "║  tail -f /tmp/mm-booking.log                     ║"
echo "║  tail -f /tmp/mm-smsauth.log                     ║"
echo "║  tail -f /tmp/mm-bot.log                         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Напоминаем о первичной настройке
if ! curl -sS --max-time 3 "http://localhost:8065/api/v4/teams" 2>/dev/null | grep -q "akademiya"; then
  echo ""
  echo "  💡 ПЕРВЫЙ ЗАПУСК? Выполните первичную настройку Академии:"
  echo ""
  echo "     # Шаг 1: Создать команды, каналы, пользователей"
  echo "     bash $ROOT/setup_academy.sh admin@academy.ru AdminPass123!"
  echo ""
  echo "     # Шаг 2: Настроить роли и права"
  echo "     bash $ROOT/configure_permissions.sh admin@academy.ru AdminPass123!"
  echo ""
  echo "     # Шаг 3: Брендинг веб-интерфейса"
  echo "     bash $ROOT/brand_web.sh admin@academy.ru AdminPass123!"
  echo ""
  echo "     # Шаг 4: Настроить Booking Service бота"
  echo "     bash $ROOT/booking_service/setup.sh admin@academy.ru AdminPass123!"
  echo ""
  echo "     # Шаг 5: Настроить SMS Auth"
  echo "     bash $ROOT/sms_auth/setup.sh admin@academy.ru AdminPass123!"
  echo "     # Затем добавьте SMSRU_API_ID в $ROOT/sms_auth/.env"
fi
