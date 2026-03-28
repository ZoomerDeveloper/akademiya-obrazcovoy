#!/usr/bin/env bash
# Настройка ролей и прав доступа в Академии Образцовой
# Запуск: bash configure_permissions.sh <admin_email> <admin_password>

set -e

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"

echo "=== Настройка ролей и прав Академии Образцовой ==="
echo "Сервер: $BASE_URL"
echo ""

# ── Авторизация ──────────────────────────────────────────────────────────────
echo "→ Авторизация..."
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось получить токен. Проверьте email и пароль."
  exit 1
fi
echo "✅ Токен получен"

# ── ID команды ───────────────────────────────────────────────────────────────
TEAMS_LIST=$(curl -sS "$BASE_URL/api/v4/teams" -H "Authorization: Bearer $TOKEN")
TEAM_ID=$(echo "$TEAMS_LIST" | python3 -c "
import sys, json
teams = json.load(sys.stdin)
for t in teams:
    if t.get('name') == 'akademiya-obrazcovoy':
        print(t['id'])
        break
" 2>/dev/null)

if [ -z "$TEAM_ID" ]; then
  echo "❌ Команда 'akademiya-obrazcovoy' не найдена. Сначала запустите setup_academy.sh"
  exit 1
fi
echo "✅ ID команды: $TEAM_ID"

# ── 1. Роль team_user — запрет создания каналов ──────────────────────────────
echo ""
echo "→ [1/4] Ограничение роли team_user (все обычные пользователи)..."

# Получаем текущие permissions роли team_user
TEAM_USER_ROLE=$(curl -sS "$BASE_URL/api/v4/roles/name/team_user" \
  -H "Authorization: Bearer $TOKEN")

echo "  Текущая роль получена, применяем ограничения..."

# Обновляем team_user: убираем право создавать каналы.
# Студент должен: читать, писать в разрешённые каналы, делать DM.
# Педагог/Менеджер — они получат team_admin и у них эти права есть.
curl -sS -X PUT "$BASE_URL/api/v4/roles/name/team_user" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "read_channel",
      "add_reaction",
      "remove_reaction",
      "manage_public_channel_members",
      "upload_file",
      "get_public_link",
      "create_post",
      "use_slash_commands",
      "list_team_channels",
      "join_public_channels",
      "view_team",
      "create_post_public",
      "edit_post",
      "delete_post",
      "use_channel_mentions",
      "create_direct_channel",
      "create_group_channel"
    ]
  }' > /dev/null
# Намеренно НЕ включаем:
#   create_public_channel, create_private_channel,
#   manage_team, manage_channel_roles, delete_public_channel, delete_private_channel

echo "  ✅ team_user: создание каналов запрещено"

# ── 2. Роль team_admin — полные права педагогов/менеджеров ───────────────────
echo ""
echo "→ [2/4] Настройка роли team_admin (Педагоги, Менеджеры, Администраторы)..."

curl -sS -X PUT "$BASE_URL/api/v4/roles/name/team_admin" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "read_channel",
      "add_reaction",
      "remove_reaction",
      "manage_public_channel_members",
      "manage_private_channel_members",
      "upload_file",
      "get_public_link",
      "create_post",
      "use_slash_commands",
      "list_team_channels",
      "join_public_channels",
      "view_team",
      "create_post_public",
      "edit_post",
      "delete_post",
      "delete_others_posts",
      "use_channel_mentions",
      "create_direct_channel",
      "create_group_channel",
      "create_public_channel",
      "create_private_channel",
      "manage_team",
      "manage_channel_roles",
      "invite_user",
      "add_user_to_team",
      "remove_user_from_team",
      "manage_others_webhooks",
      "manage_slash_commands",
      "delete_public_channel",
      "delete_private_channel"
    ]
  }' > /dev/null

echo "  ✅ team_admin: полные права настроены"

# ── 3. Readonly-каналы через Channel Moderation API ──────────────────────────
echo ""
echo "→ [3/4] Настройка readonly-каналов (объявления)..."

# Получаем ID каждого канала по имени
get_channel_id() {
  local CNAME="$1"
  curl -sS "$BASE_URL/api/v4/teams/$TEAM_ID/channels/name/$CNAME" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null
}

set_readonly_channel() {
  local CHANNEL_ID="$1"
  local DISPLAY_NAME="$2"

  RESP=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X PUT "$BASE_URL/api/v4/channels/$CHANNEL_ID/moderations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '[
      {
        "name": "create_post",
        "roles": {
          "members": false,
          "admins": true,
          "guests": false
        }
      },
      {
        "name": "create_reactions",
        "roles": {
          "members": true,
          "admins": true,
          "guests": false
        }
      },
      {
        "name": "manage_members",
        "roles": {
          "members": false,
          "admins": true
        }
      },
      {
        "name": "use_channel_mentions",
        "roles": {
          "members": false,
          "admins": true,
          "guests": false
        }
      }
    ]')

  if [ "$RESP" = "200" ]; then
    echo "  ✅ Readonly: $DISPLAY_NAME"
  elif [ "$RESP" = "403" ]; then
    echo "  ⚠️  $DISPLAY_NAME — требует Enterprise-лицензию (403)"
    echo "     Применяем fallback: только channel_admin может писать..."
    apply_readonly_fallback "$CHANNEL_ID" "$DISPLAY_NAME"
  else
    echo "  ⚠️  $DISPLAY_NAME — HTTP $RESP, пробуем fallback..."
    apply_readonly_fallback "$CHANNEL_ID" "$DISPLAY_NAME"
  fi
}

# Fallback для бесплатной версии: назначаем channel_admin-а и конвертируем канал
apply_readonly_fallback() {
  local CHANNEL_ID="$1"
  local DISPLAY_NAME="$2"

  # Получаем ID администратора
  ADMIN_ID=$(curl -sS "$BASE_URL/api/v4/users/me" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  # Назначаем admin channel_admin-ом
  curl -sS -X POST "$BASE_URL/api/v4/channels/$CHANNEL_ID/members/$ADMIN_ID/schemeRoles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"scheme_admin": true, "scheme_user": true}' > /dev/null 2>&1 || true

  # Назначаем педагога channel_admin-ом (если существует)
  TEACHER_RESP=$(curl -sS "$BASE_URL/api/v4/users/email/teacher@academy.ru" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  TEACHER_ID=$(echo "$TEACHER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -n "$TEACHER_ID" ]; then
    curl -sS -X POST "$BASE_URL/api/v4/channels/$CHANNEL_ID/members/$TEACHER_ID/schemeRoles" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"scheme_admin": true, "scheme_user": true}' > /dev/null 2>&1 || true
    echo "     → Педагог назначен channel_admin в: $DISPLAY_NAME"
  fi

  echo "  ⚠️  $DISPLAY_NAME: channel_admin назначен (полный readonly требует Enterprise)"
}

# Применяем readonly к объявительным каналам
READONLY_CHANNELS=("obyavleniya" "novosti-studentam" "novosti-sotrudnikam" "afisha")
READONLY_NAMES=("📢 Объявления" "📰 Новости студентам" "📰 Новости сотрудникам" "🎪 Афиша")

for i in "${!READONLY_CHANNELS[@]}"; do
  CNAME="${READONLY_CHANNELS[$i]}"
  DNAME="${READONLY_NAMES[$i]}"
  CID=$(get_channel_id "$CNAME")
  if [ -n "$CID" ]; then
    set_readonly_channel "$CID" "$DNAME"
  else
    echo "  ⚠️  Канал '$CNAME' не найден — пропускаем"
  fi
done

# ── 4. FAQ и Расписание — студенты читают, не пишут ──────────────────────────
echo ""
echo "→ [4/4] FAQ и Расписание — readonly для студентов..."

for CNAME in "faq" "raspisanie"; do
  CID=$(get_channel_id "$CNAME")
  if [ -n "$CID" ]; then
    RESP=$(curl -sS -o /dev/null -w "%{http_code}" \
      -X PUT "$BASE_URL/api/v4/channels/$CID/moderations" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '[
        {
          "name": "create_post",
          "roles": {
            "members": false,
            "admins": true,
            "guests": false
          }
        },
        {
          "name": "create_reactions",
          "roles": {
            "members": true,
            "admins": true
          }
        }
      ]')
    if [ "$RESP" = "200" ]; then
      echo "  ✅ Readonly: $CNAME"
    else
      echo "  ⚠️  $CNAME — HTTP $RESP (может потребовать Enterprise)"
      apply_readonly_fallback "$CID" "$CNAME"
    fi
  fi
done

# ── Итог ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "✅ НАСТРОЙКА ПРАВ ЗАВЕРШЕНА"
echo ""
echo "Что настроено:"
echo "  • team_user (Студенты): нет права создавать каналы"
echo "  • team_admin (Педагоги, Менеджеры): полные права"
echo "  • Объявления, Новости, Афиша, FAQ, Расписание:"
echo "    → если HTTP 200 — полный readonly через Channel Moderation API"
echo "    → если HTTP 403 — назначен channel_admin (нужна Enterprise для полного readonly)"
echo ""
echo "Проверьте: http://localhost:8065"
echo "  1. Войдите как student@academy.ru / Student123!"
echo "  2. Попробуйте создать канал — должно быть недоступно"
echo "  3. Зайдите в 'Объявления' — если readonly успешен, кнопка написать будет заблокирована"
echo "============================================"
