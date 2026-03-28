#!/usr/bin/env bash
# Скрипт настройки Академии Образцовой на Mattermost
# Запуск: bash setup_academy.sh <admin_email> <admin_password>

set -e

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"

echo "=== Настройка Академии Образцовой ==="
echo "Сервер: $BASE_URL"
echo ""

# 1. Получаем токен администратора
echo "→ Авторизация администратора..."
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось получить токен. Проверьте email и пароль."
  echo "$LOGIN" | tail -5
  exit 1
fi
echo "✅ Токен получен"

# 2. Создаём команду (team) «Академия Образцовой»
echo ""
echo "→ Создание команды 'Академия Образцовой'..."
TEAM=$(curl -sS -X POST "$BASE_URL/api/v4/teams" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "akademiya-obrazcovoy",
    "display_name": "Академия Образцовой",
    "type": "I"
  }')
TEAM_ID=$(echo "$TEAM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
if [ -z "$TEAM_ID" ]; then
  # Возможно, команда уже существует — ищем её
  TEAMS_LIST=$(curl -sS "$BASE_URL/api/v4/teams" -H "Authorization: Bearer $TOKEN")
  TEAM_ID=$(echo "$TEAMS_LIST" | python3 -c "
import sys,json
teams=json.load(sys.stdin)
for t in teams:
    if t.get('name')=='akademiya-obrazcovoy':
        print(t['id'])
        break
" 2>/dev/null)
fi
echo "✅ Команда: $TEAM_ID"

# 3. Создаём каналы согласно ТЗ
create_channel() {
  local NAME="$1"
  local DISPLAY="$2"
  local TYPE="$3"  # O = public, P = private
  local PURPOSE="$4"
  echo "  → Канал: $DISPLAY"
  curl -sS -X POST "$BASE_URL/api/v4/channels" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"team_id\": \"$TEAM_ID\",
      \"name\": \"$NAME\",
      \"display_name\": \"$DISPLAY\",
      \"type\": \"$TYPE\",
      \"purpose\": \"$PURPOSE\"
    }" > /dev/null
}

echo ""
echo "→ Создание каналов..."

# Объявления (readonly — только педагоги/админы пишут)
create_channel "obyavleniya" "📢 Объявления Академии" "O" "Официальные объявления. Только администраторы и педагоги."

# Новости студентам
create_channel "novosti-studentam" "📰 Новости студентам" "O" "Новости, анонсы мероприятий, результаты для студентов."

# Новости сотрудникам
create_channel "novosti-sotrudnikam" "📰 Новости сотрудникам" "P" "Внутренние новости и объявления для сотрудников и педагогов."

# Расписание
create_channel "raspisanie" "📅 Расписание" "O" "Расписание занятий, актовый зал и классы."

# Актовый зал — бронирование
create_channel "aktovyj-zal" "🎭 Актовый зал" "O" "Бронирование актового зала. Запросы через форму."

# Служебные чаты
create_channel "resepchen" "🏢 Ресепшн" "P" "Служебный чат ресепшна."
create_channel "tehnicheskie-voprosy" "🔧 Технические вопросы" "P" "Технические вопросы и заявки."
create_channel "buhgalteriya" "💰 Бухгалтерия" "P" "Финансовые вопросы, оплата."

# Афиша
create_channel "afisha" "🎪 Афиша мероприятий" "O" "Концерты, мастер-классы и события Академии."

# FAQ
create_channel "faq" "❓ FAQ / Часто задаваемые вопросы" "O" "Ответы на частые вопросы для студентов и сотрудников."

echo "✅ Каналы созданы"

# 4. Настраиваем системные разрешения
echo ""
echo "→ Настройка системных разрешений..."

# Запрещаем пользователям создавать команды (только системный администратор)
curl -sS -X PUT "$BASE_URL/api/v4/roles/system_user" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      "create_direct_channel",
      "create_group_channel",
      "permanent_delete_user",
      "add_user_to_team",
      "list_team_channels",
      "join_public_channels",
      "read_channel",
      "add_reaction",
      "remove_reaction",
      "manage_public_channel_members",
      "upload_file",
      "get_public_link",
      "create_post",
      "use_slash_commands",
      "list_users_without_team",
      "view_team",
      "read_user_access_token",
      "create_post_public",
      "create_post_ephemeral",
      "edit_post",
      "delete_post",
      "use_channel_mentions",
      "use_group_mentions"
    ]
  }' > /dev/null
echo "✅ Разрешения system_user обновлены"

# 5. Настройки сайта
echo ""
echo "→ Настройка параметров сервера..."
curl -sS -X PUT "$BASE_URL/api/v4/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "TeamSettings": {
      "SiteName": "Академия Образцовой",
      "MaxUsersPerTeam": 500,
      "EnableTeamCreation": false,
      "EnableUserCreation": true,
      "EnableOpenServer": false,
      "RestrictCreationToDomains": "",
      "EnableCustomBrand": true,
      "CustomBrandText": "Международная Академия музыки Елены Образцовой",
      "CustomDescriptionText": "Официальное приложение Академии для общения и координации",
      "RestrictDirectMessage": "any",
      "DefaultChannels": ["obyavleniya", "novosti-studentam", "raspisanie", "afisha", "faq"]
    },
    "ServiceSettings": {
      "EnableIncomingWebhooks": true,
      "EnableOutgoingWebhooks": false,
      "EnablePostUsernameOverride": false,
      "EnablePostIconOverride": false,
      "EnableBotAccountCreation": true
    },
    "PrivacySettings": {
      "ShowEmailAddress": false,
      "ShowFullName": true
    },
    "AnnouncementSettings": {
      "EnableBanner": true,
      "BannerText": "Добро пожаловать в приложение Академии Образцовой!",
      "BannerColor": "#1a1a35",
      "BannerTextColor": "#f0ead6",
      "AllowBannerDismissal": true
    }
  }' > /dev/null
echo "✅ Параметры сервера обновлены"

# 6. Создаём тестовых пользователей с ролями
echo ""
echo "→ Создание демо-пользователей..."

create_user() {
  local EMAIL="$1"
  local USERNAME="$2"
  local FIRSTNAME="$3"
  local LASTNAME="$4"
  local PASS="$5"
  local ROLE="$6"
  # Все информационные echo — в stderr, чтобы не попасть в результат $(...)
  echo "  → $FIRSTNAME $LASTNAME ($ROLE)" >&2
  local USER_RESP
  USER_RESP=$(curl -sS -X POST "$BASE_URL/api/v4/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"username\": \"$USERNAME\",
      \"first_name\": \"$FIRSTNAME\",
      \"last_name\": \"$LASTNAME\",
      \"password\": \"$PASS\"
    }")
  # Если пользователь уже есть — получаем ID по email
  local USER_ID
  USER_ID=$(echo "$USER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  if [ -z "$USER_ID" ]; then
    USER_ID=$(curl -sS "$BASE_URL/api/v4/users/email/$EMAIL" \
      -H "Authorization: Bearer $TOKEN" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
  fi
  echo "$USER_ID"
}

# Педагог
TEACHER_ID=$(create_user "teacher@academy.ru" "pedagog_ivanova" "Мария" "Иванова" "Teacher123!" "Педагог")
# Менеджер
MANAGER_ID=$(create_user "manager@academy.ru" "manager_petrov" "Алексей" "Петров" "Manager123!" "Менеджер")
# Студент
STUDENT_ID=$(create_user "student@academy.ru" "student_sidorov" "Иван" "Сидоров" "Student123!" "Студент")
# Бухгалтер
ACCOUNTANT_ID=$(create_user "accountant@academy.ru" "buhgalter_kozlova" "Наталья" "Козлова" "Account123!" "Бухгалтер")

echo "✅ Пользователи созданы"

# 7. Добавляем пользователей в команду
echo ""
echo "→ Добавление пользователей в команду..."
for MEMBER_ID in "$TEACHER_ID" "$MANAGER_ID" "$STUDENT_ID" "$ACCOUNTANT_ID"; do
  [ -n "$MEMBER_ID" ] && curl -sS -X POST "$BASE_URL/api/v4/teams/$TEAM_ID/members" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"team_id\":\"$TEAM_ID\",\"user_id\":\"$MEMBER_ID\"}" > /dev/null
done
echo "✅ Пользователи добавлены в команду"

# 8. Назначаем педагога и менеджера тим-администраторами
echo ""
echo "→ Назначение ролей в команде..."
for MEMBER_ID in "$TEACHER_ID" "$MANAGER_ID"; do
  [ -n "$MEMBER_ID" ] && curl -sS -X PUT "$BASE_URL/api/v4/teams/$TEAM_ID/members/$MEMBER_ID/roles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"roles":"team_user team_admin"}' > /dev/null
done
echo "✅ Роли назначены"

# 9. Засеваем начальный FAQ-контент
echo ""
echo "→ Публикация начального контента в FAQ..."

# Получаем ID канала faq
FAQ_CHANNEL_ID=$(curl -sS "$BASE_URL/api/v4/teams/$TEAM_ID/channels/name/faq" \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

post_faq() {
  local MSG="$1"
  if [ -n "$FAQ_CHANNEL_ID" ]; then
    curl -sS -X POST "$BASE_URL/api/v4/posts" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel_id\":\"$FAQ_CHANNEL_ID\",\"message\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$MSG")}" > /dev/null
  fi
}

post_faq "## 📚 Учебный процесс

**Как проходят занятия?**
Занятия проходят индивидуально или в группах по расписанию. Расписание доступно во вкладке «Расписание» приложения.

**Что делать при пропуске занятия?**
Предупредите педагога заранее через личное сообщение в Mattermost. Пропущенное занятие переносится по договорённости с педагогом.

**Как записаться на пробное занятие?**
Напишите в канал #resepchen или обратитесь к администратору. Пробное занятие бесплатно."

post_faq "## 📅 Расписание и бронирование

**Как посмотреть расписание?**
Откройте вкладку «Расписание» в приложении. Там видны все занятия на неделю или месяц.

**Как забронировать класс?**
Перейдите во вкладку «Бронирование», заполните форму и нажмите «Отправить заявку». Администратор подтвердит бронь в течение рабочего дня.

**Можно ли отменить бронирование?**
Да, в разделе «Мои заявки» на вкладке «Бронирование» есть кнопка отмены для заявок со статусом *pending*."

post_faq "## 💰 Оплата

**Как происходит оплата?**
После одобрения бронирования вы получите ссылку на оплату в личном кабинете (вкладка «Профиль» → «Мои оплаты»).

**Когда нужно оплатить?**
Оплата производится до начала занятия или согласно условиям договора. Система напомнит вам 18-го и 24-го числа каждого месяца.

**Выдаёт ли Академия квитанции?**
Да. Запросите квитанцию в канале #buhgalteriya или через вкладку «Профиль» → «Документы» → «Квитанция / Акт»."

post_faq "## 👩‍🏫 Педагоги

**Как связаться с педагогом?**
Найдите педагога в списке участников команды (значок 👤 в верхнем меню) и напишите личное сообщение. Либо спросите в канале #resepchen.

**Можно ли сменить педагога?**
Обратитесь к администратору Академии через канал #resepchen.

**Где посмотреть информацию о педагогах?**
Краткие биографии педагогов публикуются в канале #novosti-studentam и на сайте Академии."

post_faq "## 📱 Приложение

**Как войти в приложение?**
Используйте логин (email) и пароль, выданные при зачислении. Если забыли пароль — нажмите «Забыли пароль» на странице входа.

**Есть ли мобильное приложение?**
Да, мобильное приложение Академии доступно для iOS и Android. Ссылки на скачивание — у администратора.

**Как включить уведомления?**
Перейдите в «Профиль» → «Настройки» → «Настройки уведомлений» или нажмите на колокольчик 🔔 в верхнем меню.

**Куда обращаться при технических проблемах?**
Напишите в канал #tehnicheskie-voprosy или на почту поддержки."

post_faq "## 📄 Документы

**Как получить справку об обучении?**
Запросите через вкладку «Профиль» → «Документы» → кнопка «Запросить». Справка готовится 2–3 рабочих дня.

**Как получить копию договора?**
Аналогично: «Профиль» → «Документы» → «Договор об обучении» → «Запросить». Либо обратитесь лично в ресепшн.

**Как получить сертификат об окончании курса?**
Сертификаты выдаются по итогам завершения программы. Обратитесь к куратору группы или в канал #resepchen."

post_faq "## 🎵 Концерты и выступления

**Как проходят выступления студентов?**
Концерты класса проводятся в конце каждого учебного семестра в Актовом зале Академии. Расписание публикуется в канале #afisha.

**Могу ли я выступать и когда?**
Да! Студенты выступают на концертах своего класса минимум раз в семестр. Хотите выступить внепланово — поговорите с педагогом.

**Можно ли участвовать в конкурсах от Академии?**
Да. Академия регулярно организует участие в региональных и международных конкурсах. Следите за объявлениями в #novosti-studentam и обсуждайте возможность участия с педагогом."

post_faq "## 📋 Для педагогов

**Как оформляется нагрузка?**
Нагрузка оформляется менеджером учебного отдела на основании расписания и трудового договора. По вопросам нагрузки обращайтесь в канал #resepchen.

**Где смотреть внутренние регламенты?**
Все внутренние документы публикуются в закрытом канале #novosti-sotrudnikov. Если у вас нет доступа — обратитесь к администратору.

**Как согласовываются замены?**
Обратитесь к администратору или менеджеру через #resepchen как можно раньше. Замена согласовывается и отражается в расписании.

**Как оформляется отпуск?**
Заявление на отпуск подаётся через #resepchen не менее чем за 2 недели. Форму заявления можно запросить у администратора.

**Как подать заявку на проведение концерта или мастер-класса?**
Заполните форму бронирования Актового зала во вкладке «Бронирование» и укажите цель — «Концерт» или «Мастер-класс». Заявка уйдёт на согласование руководству.

**К кому обращаться по техническим вопросам?**
Пишите в канал #tehnicheskie-voprosy. Там дежурит технический специалист Академии."

echo "✅ FAQ-контент опубликован"

echo ""
echo "============================================"
echo "✅ НАСТРОЙКА ЗАВЕРШЕНА"
echo ""
echo "Демо-пользователи:"
echo "  Педагог:    teacher@academy.ru / Teacher123!"
echo "  Менеджер:   manager@academy.ru / Manager123!"
echo "  Студент:    student@academy.ru / Student123!"
echo "  Бухгалтер:  accountant@academy.ru / Account123!"
echo ""
echo "Откройте: http://localhost:8065"
echo "============================================"
