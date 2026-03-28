#!/usr/bin/env bash
# Завершение настройки — добавление пользователей в команду и назначение ролей

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2}"

if [ -z "$ADMIN_PASS" ]; then
  echo "Использование: bash finish_setup.sh EMAIL ПАРОЛЬ"
  exit 1
fi

echo "=== Завершение настройки Академии ==="

# Авторизация
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
[ -z "$TOKEN" ] && echo "❌ Ошибка авторизации" && exit 1
echo "✅ Авторизован"

# Находим команду Академии
TEAM_ID=$(curl -sS "$BASE_URL/api/v4/teams" \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; teams=json.load(sys.stdin); [print(t['id']) for t in teams if t.get('name')=='akademiya-obrazcovoy']" 2>/dev/null)
echo "✅ Команда: $TEAM_ID"

# Находим пользователей по email
get_user_id() {
  curl -sS "$BASE_URL/api/v4/users/email/$1" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null
}

TEACHER_ID=$(get_user_id "teacher@academy.ru")
MANAGER_ID=$(get_user_id "manager@academy.ru")
STUDENT_ID=$(get_user_id "student@academy.ru")
ACCOUNTANT_ID=$(get_user_id "accountant@academy.ru")

echo "  Педагог:   $TEACHER_ID"
echo "  Менеджер:  $MANAGER_ID"
echo "  Студент:   $STUDENT_ID"
echo "  Бухгалтер: $ACCOUNTANT_ID"

# Добавляем в команду
echo ""
echo "→ Добавление в команду..."
for MEMBER_ID in "$TEACHER_ID" "$MANAGER_ID" "$STUDENT_ID" "$ACCOUNTANT_ID"; do
  [ -n "$MEMBER_ID" ] && curl -sS -X POST "$BASE_URL/api/v4/teams/$TEAM_ID/members" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"team_id\":\"$TEAM_ID\",\"user_id\":\"$MEMBER_ID\"}" > /dev/null && echo "  ✅ $MEMBER_ID добавлен"
done

# Назначаем педагога и менеджера тим-администраторами
echo ""
echo "→ Назначение ролей Team Admin..."
for MEMBER_ID in "$TEACHER_ID" "$MANAGER_ID"; do
  [ -n "$MEMBER_ID" ] && curl -sS -X PUT "$BASE_URL/api/v4/teams/$TEAM_ID/members/$MEMBER_ID/roles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"roles":"team_user team_admin"}' > /dev/null && echo "  ✅ $MEMBER_ID → team_admin"
done

# Добавляем всех в обязательные публичные каналы
echo ""
echo "→ Добавление в каналы объявлений..."
for CHANNEL_NAME in "obyavleniya" "novosti-studentam" "raspisanie" "afisha" "faq"; do
  CHANNEL_ID=$(curl -sS "$BASE_URL/api/v4/teams/$TEAM_ID/channels/name/$CHANNEL_NAME" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -n "$CHANNEL_ID" ]; then
    for MEMBER_ID in "$TEACHER_ID" "$MANAGER_ID" "$STUDENT_ID" "$ACCOUNTANT_ID"; do
      [ -n "$MEMBER_ID" ] && curl -sS -X POST "$BASE_URL/api/v4/channels/$CHANNEL_ID/members" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"user_id\":\"$MEMBER_ID\"}" > /dev/null
    done
    echo "  ✅ $CHANNEL_NAME"
  fi
done

# Педагог и менеджер — в приватные служебные каналы
echo ""
echo "→ Добавление в служебные каналы..."
for CHANNEL_NAME in "novosti-sotrudnikam" "resepchen" "tehnicheskie-voprosy"; do
  CHANNEL_ID=$(curl -sS "$BASE_URL/api/v4/teams/$TEAM_ID/channels/name/$CHANNEL_NAME" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -n "$CHANNEL_ID" ]; then
    for MEMBER_ID in "$TEACHER_ID" "$MANAGER_ID"; do
      [ -n "$MEMBER_ID" ] && curl -sS -X POST "$BASE_URL/api/v4/channels/$CHANNEL_ID/members" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"user_id\":\"$MEMBER_ID\"}" > /dev/null
    done
    echo "  ✅ $CHANNEL_NAME"
  fi
done

# Бухгалтер — в канал бухгалтерии
BUHG_ID=$(curl -sS "$BASE_URL/api/v4/teams/$TEAM_ID/channels/name/buhgalteriya" \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$BUHG_ID" ] && [ -n "$ACCOUNTANT_ID" ] && \
  curl -sS -X POST "$BASE_URL/api/v4/channels/$BUHG_ID/members" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"$ACCOUNTANT_ID\"}" > /dev/null && echo "  ✅ buhgalteriya (бухгалтер)"

echo ""
echo "============================================"
echo "✅ ВСЁ ГОТОВО! Откройте http://localhost:8065"
echo ""
echo "Переключитесь на команду 'Академия Образцовой'"
echo "в левом верхнем углу (рядом с 'Maxim')"
echo ""
echo "Демо-аккаунты:"
echo "  teacher@academy.ru    / Teacher123!"
echo "  manager@academy.ru    / Manager123!"
echo "  student@academy.ru    / Student123!"
echo "  accountant@academy.ru / Account123!"
echo "============================================"
