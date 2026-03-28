# Runbook: выкладка Академии (Mattermost + микросервисы)

Краткая инструкция для production. Порты по умолчанию локально — на сервере задайте свои и проксируйте через Nginx/Caddy.

## Компоненты

| Сервис | Порт (по умолчанию) | Назначение |
|--------|---------------------|------------|
| Mattermost (server + веб) | 8065 | Основное приложение |
| `booking_service` | 3001 | Бронирования, cron напоминаний об оплате |
| `sms_auth` | 3002 | OTP по телефону (sms.ru) |

## Сборка веба

```bash
cd webapp && npm install && npm run build
```

Сервер Mattermost отдаёт собранный `client` из `dist` (см. ваш процесс релиза в репозитории).

## Переменные окружения

### `booking_service`
- `DB_PATH` — путь к SQLite (бэкапить регулярно).
- `MM_SERVER_URL`, `MM_BOT_TOKEN` / токены для уведомлений — см. `booking_service/.env` или ваш секрет-менеджер.

### `sms_auth`
- Скопировать `sms_auth/.env.example` → `.env`, заполнить `SMSRU_API_ID`, `MM_ADMIN_TOKEN`, при необходимости `SMSRU_TEST=0`.

### Веб (Academy Hub)
Сейчас URL микросервисов захардкожены как `http://localhost:3001` и `3002`. **Для production** нужно вынести в конфиг (например `window.publicAcademyConfig` из `root.html` или env на этапе сборки) и подставить `https://api.your-domain/booking` и т.д.

## Reverse proxy (Nginx)

- TLS-терминация на 443.
- Проксирование `/` → Mattermost (8065).
- Мобильное приложение ходит на **`https://<домен>/booking-service`** и **`https://<домен>/sms-auth-service`** (без открытых портов 3001/3002 снаружи). Готовый фрагмент:

```bash
# На сервере, из корня репозитория:
sudo cp deploy/nginx-academy-microservices.include /etc/nginx/snippets/academy-microservices.conf
```

В блок `server { ... }` для вашего домена Mattermost добавьте строку **`include snippets/academy-microservices.conf;`** (рядом с остальными `location`, до или после прокси на 8065 — не внутри другого `location`).

Проверка и перезагрузка:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sS "https://ВАШ_ДОМЕН/booking-service/health"
curl -sS "https://ВАШ_ДОМЕН/sms-auth-service/health"
```

Оба ответа должны быть JSON с `"ok":true` (сервисы `booking_service` и `sms_auth` должны слушать 3001 и 3002 на localhost).

## Процесс релиза (чеклист)

1. Остановить `booking_service` / `sms_auth` (graceful).
2. Бэкап `bookings.db`, `sms_auth.db`.
3. Выкатить новый код, `npm run build` для webapp.
4. Миграции SQLite в `booking_service` выполняются при старте (см. `db.js`).
5. Запустить сервисы под systemd/supervisor/Docker.
6. Проверить: `GET http://localhost:3001/health`, `GET http://localhost:3002/health`, Mattermost `/api/v4/system/ping`.

## GitHub Actions → VPS

Workflow: **`.github/workflows/academy-deploy-vps.yml`** — запускается при push в `main` и вручную (**Actions → Academy deploy (VPS) → Run workflow**).

### Секреты (Settings → Secrets and variables → Actions)

| Секрет | Назначение |
|--------|------------|
| `ACADEMY_SSH_HOST` | IP или домен сервера |
| `ACADEMY_SSH_USER` | Пользователь SSH (`root` или отдельный `deploy`) |
| `ACADEMY_SSH_PRIVATE_KEY` | Приватный ключ OpenSSH (пару создаёте локально: `ssh-keygen -t ed25519 -f academy_deploy -N ""`; **публичный** ключ в `~/.ssh/authorized_keys` на сервере, **приватный** целиком в секрет) |
| `ACADEMY_DEPLOY_PATH` | Абсолютный путь к клону репозитория на сервере, например `/root/Mattermost` |
| `ACADEMY_SSH_PORT` | Опционально, если SSH не на 22 |

На сервере в каталоге деплоя должен быть **git clone** вашего репозитория; для **приватного** репо добавьте на сервер [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#deploy-keys) (read-only) или настройте `git` с PAT.

### Перезапуск сервисов после `git pull`

Скрипт **`deploy/github-remote-deploy.sh`** после обновления ветки ставит зависимости в `booking_service` и `sms_auth`. Перезапуск Mattermost / pm2 / systemd в репозиторий не зашит — создайте на сервере **`/etc/academy/post-deploy.sh`** (исполняемый), например:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Подставьте свои имена unit / процессов:
systemctl restart mattermost 2>/dev/null || true
pm2 restart academy-booking academy-sms 2>/dev/null || true
# При необходимости: cd /path/to/repo/webapp && npm run build
```

## Cron

Напоминания об оплате встроены в `booking_service` (`node-cron`). Убедитесь, что процесс **один** и часовой пояс сервера соответствует ожиданиям (в коде задано 18 и 24 число 10:00 — уточните МСК/UTC при деплое).
