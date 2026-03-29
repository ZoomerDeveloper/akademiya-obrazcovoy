# Инициализация Расписания Уроков

Решение для заполнения базы данных реальными данными о уроках на сегодня и ближайшие 2 дня.

## Быстрый Старт

### Локальная разработка

```bash
cd booking_service
node seed-lessons.js
```

**Вывод:**
```
▶️  Инициализация расписания уроков...

✅ Созданы занятия: 36
✅ Созданы регулярные слоты: 30

✅ Данные успешно инициализированы!

📊 Статистика:
   • Показано классов: 6
   • Занятия созданы: 36
   • Регулярные слоты: 30
   • Период: сегодня + 2 дня
   • Время занятий: 09:00-18:00 (с перерывом 13:00-14:00)

🎵 Расписание готово!
```

### Развертывание на Сервер

Метод 1: Через GitHub Actions (рекомендуется)

1. Перейти на GitHub Actions → "Academy deploy (VPS)"
2. Нажать **Run workflow**
3. Заполнить параметры:
   - Branch: `main`
   - seed_lessons: `true`
4. Нажать **Run workflow**

Метод 2: Через REST API (если после развертывания нужно пересортировать)

```bash
# Получить токен администратора из Mattermost
ADMIN_TOKEN="your-mm-token" \
BASE_URL="https://vm268473.hosted-by-robovps.ru" \
node booking_service/api-seed-lessons.js
```

## Что Создает Скрипт

- **36 занятий**: распределены по 6 классам на 3 дня (сегодня + 2 дня)
- **8 студентов**: Александр М., Виктория П., Дмитрий С., и др.
- **5 преподавателей**: Иванов А., Сидорова М., Петров И., и др.
- **8 инструментов**: Фортепиано, Скрипка, Виолончель, Флейта, и др.
- **Расписание**: 09:00-18:00 с перерывом 13:00-14:00

### Пример Занятия

```json
{
  "room_id": "r1",
  "room_name": "Класс № 1",
  "user_id": "student_1",
  "user_name": "Александр М.",
  "user_email": "alex@example.ru",
  "date": "2026-03-29",
  "start_time": "09:00",
  "end_time": "10:00",
  "purpose": "Фортепиано с Иванов А.",
  "is_curriculum": 1,
  "status": "confirmed"
}
```

## Опции

### Очистка Перед Заполнением

```bash
CLEAR_BOOKINGS=1 node booking_service/seed-lessons.js
```

Это удалит все старые бронирования и слоты перед созданием новых.

## Интеграция в Деплой

При развертывании с `SEED_LESSONS=1`:

1. Обновляется код сервиса
2. Перезапускаются microservices
3. **Запускается `seed-lessons.js`** если флаг установлен

```bash
# В скрипте deploy/github-remote-deploy.sh
if [[ "${SEED_LESSONS:-0}" == "1" ]]; then
    echo "→ seed lesson data"
    (cd "$ROOT/booking_service" && node seed-lessons.js)
fi
```

## Структура БД

Скрипт создает данные в таблицах SQLite:

- **bookings** - основные бронирования (38 полей)
- **recurring_bookings** - регулярные слоты на неделю (10 полей)
- **booking_log** - логирование изменений

Индексы создаются автоматически для быстрого поиска по:
- `room_id, date`
- `user_id`
- `status`

## Отладка

### Проверить наличие данных в БД

```bash
sqlite3 booking_service/bookings.db

sqlite> SELECT COUNT(*) FROM bookings;
sqlite> SELECT date, start_time, room_name, purpose FROM bookings LIMIT 5;
```

### Проверить доступность через API

```bash
# Здоровье сервиса
curl -H "Authorization: Bearer test" \
  https://vm268473.hosted-by-robovps.ru/booking-service/health

# Все бронирования
curl -H "Authorization: Bearer test" \
  https://vm268473.hosted-by-robovps.ru/booking-service/api/bookings | jq .

# Регулярные слоты
curl -H "Authorization: Bearer test" \
  https://vm268473.hosted-by-robovps.ru/booking-service/api/recurring | jq .
```

## Файлы

- `booking_service/seed-lessons.js` - SQLite-based seeder (используется при деплое)
- `booking_service/api-seed-lessons.js` - REST API seeder (для удаленного заполнения)
- `deploy/github-remote-deploy.sh` - интеграция в деплой (ищет флаг SEED_LESSONS)
- `.github/workflows/academy-deploy-vps.yml` - workflow с параметром seed_lessons
