#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# FIRST_RUN.sh — Первичная настройка Академии Образцовой
#
# Запускать ОДИН РАЗ после того, как Mattermost Server уже поднялся
# и вы создали учётную запись администратора через веб-интерфейс.
#
# Запуск: bash /Users/devbroseph/Mattermost/FIRST_RUN.sh
# ═══════════════════════════════════════════════════════════════════════════════

ROOT="/Users/devbroseph/Mattermost"
ADMIN_EMAIL="admin@academy.ru"
ADMIN_PASS="AdminPass123!"

echo "╔══════════════════════════════════════════════════╗"
echo "║    Академия Образцовой — Первичная настройка     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Сервер: http://localhost:8065"
echo "  Admin:  $ADMIN_EMAIL / $ADMIN_PASS"
echo ""
read -p "  Убедитесь, что Mattermost запущен. Нажмите Enter для продолжения..."

# ─────────────────────────── Проверка доступности ────────────────────────────
echo ""
echo "→ Проверяем доступность сервера..."
HTTP=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:8065" 2>/dev/null || echo "000")
if [ "$HTTP" = "000" ]; then
  echo "❌ Mattermost не отвечает. Сначала запустите:"
  echo "   bash $ROOT/START.sh"
  exit 1
fi
echo "✅ Сервер доступен (HTTP $HTTP)"

# ─────────────────────────── Шаг 1: Академия ─────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Шаг 1/5: Создание команды, каналов, пользователей"
echo "════════════════════════════════════════"
bash "$ROOT/setup_academy.sh" "$ADMIN_EMAIL" "$ADMIN_PASS"

# ─────────────────────────── Шаг 2: Роли и права ─────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Шаг 2/5: Настройка ролей и прав"
echo "════════════════════════════════════════"
bash "$ROOT/configure_permissions.sh" "$ADMIN_EMAIL" "$ADMIN_PASS"

# ─────────────────────────── Шаг 3: Брендинг ────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Шаг 3/5: Брендинг веб-интерфейса"
echo "════════════════════════════════════════"
bash "$ROOT/brand_web.sh" "$ADMIN_EMAIL" "$ADMIN_PASS"

# ─────────────────────────── Шаг 4: Booking Service ─────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Шаг 4/5: Booking Service"
echo "════════════════════════════════════════"
if [ -d "$ROOT/booking_service/node_modules" ]; then
  bash "$ROOT/booking_service/setup.sh" "$ADMIN_EMAIL" "$ADMIN_PASS"
else
  echo "⚠️  Сначала установите: cd $ROOT/booking_service && npm install"
fi

# ─────────────────────────── Шаг 5: SMS Auth ─────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Шаг 5/5: SMS Auth Service"
echo "════════════════════════════════════════"
if [ -d "$ROOT/sms_auth/node_modules" ]; then
  bash "$ROOT/sms_auth/setup.sh" "$ADMIN_EMAIL" "$ADMIN_PASS"
else
  echo "⚠️  Сначала установите: cd $ROOT/sms_auth && npm install"
fi

# ─────────────────────────── Итог ────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    ✅ ПЕРВИЧНАЯ НАСТРОЙКА ЗАВЕРШЕНА              ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Веб-интерфейс: http://localhost:8065            ║"
echo "║                                                  ║"
echo "║  Демо-аккаунты:                                  ║"
echo "║  admin@academy.ru   / AdminPass123!   (Админ)   ║"
echo "║  teacher@academy.ru / Teacher123!     (Педагог) ║"
echo "║  student@academy.ru / Student123!     (Студент) ║"
echo "║  manager@academy.ru / Manager123!     (Менеджер)║"
echo "║                                                  ║"
echo "║  ⚠️  Для SMS-входа добавьте SMSRU_API_ID в:      ║"
echo "║     $ROOT/sms_auth/.env"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
