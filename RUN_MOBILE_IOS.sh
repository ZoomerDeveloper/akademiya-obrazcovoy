#!/usr/bin/env bash
# =============================================================================
# RUN_MOBILE_IOS.sh — Запуск мобильного приложения Академии на iOS Simulator
# Запускать из любой директории: bash /Users/devbroseph/Mattermost/RUN_MOBILE_IOS.sh
# =============================================================================
set -euo pipefail

MOBILE_DIR="/Users/devbroseph/Mattermost/mattermost-mobile"
REQUIRED_NODE="20"
LOGS_DIR="/tmp/academy_mobile_logs"
mkdir -p "$LOGS_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
info() { echo -e "${CYAN}→  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; }
step() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}   $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ─────────────────────────── Шаг 0: Проверка окружения ───────────────────────
step "0/6 Проверка окружения"

if [ ! -d "$MOBILE_DIR" ]; then
    err "Директория $MOBILE_DIR не найдена. Клонируй проект сначала."
    exit 1
fi

# Проверяем Xcode
if ! xcode-select -p &>/dev/null; then
    err "Xcode Command Line Tools не установлены. Запусти: xcode-select --install"
    exit 1
fi
ok "Xcode CLI найден: $(xcode-select -p)"

# Проверяем CocoaPods
if ! command -v pod &>/dev/null; then
    warn "CocoaPods не найден. Устанавливаем..."
    sudo gem install cocoapods
fi
ok "CocoaPods: $(pod --version)"

# ─────────────────────────── Шаг 1: Node.js ──────────────────────────────────
step "1/6 Переключение Node.js → v${REQUIRED_NODE}"

# Загружаем nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
    info "nvm найден: $(nvm --version)"
elif command -v brew &>/dev/null && [ -s "$(brew --prefix nvm)/nvm.sh" ]; then
    source "$(brew --prefix nvm)/nvm.sh"
    info "nvm найден через brew"
else
    warn "nvm не найден — попробуем использовать системный node"
fi

CURRENT_NODE=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")

if [ "$CURRENT_NODE" -ne "$REQUIRED_NODE" ] 2>/dev/null; then
    if command -v nvm &>/dev/null; then
        info "Текущая версия Node: v$CURRENT_NODE. Переключаем на v$REQUIRED_NODE..."
        nvm install "$REQUIRED_NODE" 2>/dev/null || true
        nvm use "$REQUIRED_NODE"
        ok "Node переключён: $(node --version)"
    else
        warn "Не удалось переключить Node (нет nvm). Попробуем с текущей: v$CURRENT_NODE"
        warn "Если npm install упадёт — установи nvm: https://github.com/nvm-sh/nvm"
    fi
else
    ok "Node.js уже v$REQUIRED_NODE: $(node --version)"
fi

# ─────────────────────────── Шаг 2: npm install ───────────────────────────────
step "2/6 Установка npm-зависимостей"

cd "$MOBILE_DIR"

if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    ok "node_modules уже установлены — пропускаем (запусти с --fresh чтобы переустановить)"
else
    info "Запускаем npm install (может занять 5–10 мин)..."
    npm install --engine-strict=false --legacy-peer-deps 2>&1 | tee "$LOGS_DIR/npm_install.log"
    ok "npm install завершён"
fi

# ─────────────────────────── Шаг 3: Pod install ──────────────────────────────
step "3/6 Установка iOS Pods"

cd "$MOBILE_DIR"

if [ -d "ios/Pods" ] && [ -f "ios/Podfile.lock" ]; then
    ok "Pods уже установлены — пропускаем"
else
    info "Запускаем pod install (может занять 5–10 мин)..."
    export RCT_NEW_ARCH_ENABLED=0
    cd ios && pod install 2>&1 | tee "$LOGS_DIR/pod_install.log" && cd ..
    ok "Pod install завершён"
fi

# ─────────────────────────── Шаг 4: Выбор симулятора ─────────────────────────
step "4/6 Подготовка iOS Simulator"

# Список доступных симуляторов
info "Доступные симуляторы iPhone:"
xcrun simctl list devices available | grep -E "iPhone|iPad" | grep -v "unavailable" | head -15

# Берём последний iPhone из списка или используем дефолтный
SIMULATOR=$(xcrun simctl list devices available | grep -E "iPhone 1[5-9]|iPhone 1[0-4]" | head -1 | sed 's/.*(\(.*\)) (.*/\1/' | xargs)

if [ -z "$SIMULATOR" ]; then
    SIMULATOR=$(xcrun simctl list devices available | grep "iPhone" | head -1 | sed 's/.*(\(.*\)) (.*/\1/' | xargs)
fi

SIMULATOR_NAME=$(xcrun simctl list devices available | grep "$SIMULATOR" | head -1 | sed 's/^[[:space:]]*//' | sed 's/ (.*)//')

info "Выбран симулятор: $SIMULATOR_NAME (UDID: $SIMULATOR)"

# Загружаем симулятор заранее
info "Запускаем симулятор..."
xcrun simctl boot "$SIMULATOR" 2>/dev/null || true
open -a Simulator 2>/dev/null || true
sleep 3

# ─────────────────────────── Шаг 5: Metro Bundler ────────────────────────────
step "5/6 Запуск Metro Bundler"

cd "$MOBILE_DIR"

# Убиваем старый Metro если запущен
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
sleep 1

info "Запускаем Metro в фоне..."
npx react-native start --host 127.0.0.1 --reset-cache > "$LOGS_DIR/metro.log" 2>&1 &
METRO_PID=$!
echo $METRO_PID > "$LOGS_DIR/metro.pid"

info "Ждём готовности Metro (до 30 сек)..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8081/status 2>/dev/null | grep -q "packager-status:running"; then
        ok "Metro готов (PID: $METRO_PID)"
        break
    fi
    if [ $i -eq 30 ]; then
        warn "Metro не ответил за 30 сек — пробуем запустить приложение всё равно"
        warn "Лог Metro: $LOGS_DIR/metro.log"
    fi
    sleep 1
done

# ─────────────────────────── Шаг 6: Запуск на iOS ────────────────────────────
step "6/6 Запуск на iOS Simulator"

cd "$MOBILE_DIR"

info "Сборка и запуск на симуляторе (займёт 2–5 мин)..."
npx react-native run-ios --udid "$SIMULATOR" 2>&1 | tee "$LOGS_DIR/run_ios.log"

# ─────────────────────────── Итог ────────────────────────────────────────────
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   ✅ ПРИЛОЖЕНИЕ ЗАПУЩЕНО${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  📱  Симулятор: ${CYAN}$SIMULATOR_NAME${NC}"
echo -e "  🌐  Введи адрес сервера: ${CYAN}http://localhost:8065${NC}"
echo ""
echo -e "  📁  Логи:"
echo -e "       Metro:    ${CYAN}$LOGS_DIR/metro.log${NC}"
echo -e "       Сборка:   ${CYAN}$LOGS_DIR/run_ios.log${NC}"
echo ""
echo -e "  🔄  Перезагрузка приложения: ${YELLOW}Cmd+R${NC} в симуляторе"
echo -e "  🐛  Dev меню: ${YELLOW}Cmd+D${NC} в симуляторе"
echo ""

# Держим Metro в режиме логирования
echo -e "${CYAN}Metro работает в фоне (PID: $METRO_PID)${NC}"
echo -e "Для остановки: ${YELLOW}kill $METRO_PID${NC}"
echo ""

# Показываем хвост лога Metro
echo -e "${CYAN}━━━ Metro Live Log ━━━${NC}"
tail -f "$LOGS_DIR/metro.log"
