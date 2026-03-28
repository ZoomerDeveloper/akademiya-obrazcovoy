# Локальный запуск Mattermost (сервер + веб-приложение)

## Официальный репозиторий
- **https://github.com/mattermost/mattermost** — монопрепо: `server/` (Go), `webapp/` (React).

## Что уже сделано
- Репозиторий клонирован в эту папку.
- Зависимости Go подтянуты, mmctl собран.

## Вариант A: Запуск без Docker (уже включён)

Файл `server/config.override.mk` создан с `MM_NO_DOCKER=true` — Docker не нужен.

### 1. Установить и настроить PostgreSQL (macOS)
```bash
brew install postgresql@14
brew services start postgresql@14
# Добавьте в PATH при необходимости: echo 'export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"' >> ~/.zshrc
```

Создать пользователя и БД:
```bash
psql postgres -c "CREATE ROLE mmuser WITH LOGIN PASSWORD 'mostest';"
psql postgres -c "ALTER ROLE mmuser CREATEDB;"
psql postgres -U mmuser -c "CREATE DATABASE mattermost_test;"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE mattermost_test TO mmuser;"
```

### 2. Запуск сервера
```bash
cd /Users/devbroseph/Mattermost/server
make run-server
```
В логе должно быть: `No Docker Enabled: skipping docker start`.  
Проверка: `curl http://localhost:8065/api/v4/system/ping` — JSON с `"status":"OK"`.

Дальше — шаги 4–6 ниже (админ, веб-приложение, остановка).

---

## Вариант B: Запуск с Docker
Сервер по умолчанию может поднимать PostgreSQL, Redis и др. через Docker.

1. Удалите или переименуйте `server/config.override.mk` (или задайте в нём `MM_NO_DOCKER ?= false`).
2. **Запустите Docker Desktop**, затем в `server/`: `make run-server`.

---

## 2. Увеличить лимит файловых дескрипторов (рекомендуется)
В `~/.zshrc` добавьте и перезапустите терминал:
```bash
ulimit -n 8096
```

## 3. Запуск сервера
```bash
cd /Users/devbroseph/Mattermost/server
make run-server
```
Первый запуск может занять несколько минут (образы Docker, сборка).  
Проверка: откройте в браузере или выполните:
```bash
curl http://localhost:8065/api/v4/system/ping
```
Должен вернуться JSON со `"status":"OK"`.

## 4. Создать администратора
В **новом** терминале, из корня репозитория:
```bash
cd /Users/devbroseph/Mattermost/server
./bin/mmctl user create --local --email admin@example.com --username admin --password AdminPass123! --system-admin
```
(Измените email, username и password по желанию; пароль — не менее 8 символов.)

## Академия: SMS-вход и микросервисы
- Вход и **регистрация по SMS** встроены на страницу **логина** Mattermost (блок под формой email/пароль). Нужен запущенный **`sms_auth`** (порт **3002**) и настроенный `.env` (см. `sms_auth/.env.example`).
- **`MM_ADMIN_TOKEN`** обязателен для регистрации по SMS: это **Personal Access Token** пользователя Mattermost с ролью **system_admin** (не бот и не обычный пользователь). Иначе Mattermost вернёт *«This server does not allow open signups»* — сервер считает запрос публичной регистрацией, а не созданием пользователя админом.
- Для **входа по SMS** после верного OTP сервис создаёт PAT для пользователя. В Mattermost должны быть **включены Personal Access Tokens**: System Console → **Integrations** → **Integration Management** → **Enable Personal Access Tokens** = true (по умолчанию часто выключено — тогда `/api/auth/verify-code` возвращает 500/503 «не удалось создать сессию»).
- Запрос к **`/api/v4/users/me`** (и прочим защищённым методам) должен нести либо сессию Mattermost (**`MMAUTHTOKEN`** после обычного логина), либо заголовок **`Authorization: Bearer <token из verify-code>`**. Другие cookie в браузере на тот же host Mattermost **не подставляются** вместо этого — без Bearer сервер ответит **UserRequired**.
- Если после успешного `verify-code` веб-клиент получает **401 UserRequired / Invalid session**: в **`root.tsx`** для веба выставлено **`Client4.setAuthHeader = false`** (сессия через cookie + CSRF), поэтому **`setToken(PAT)` сам по себе не добавляет `Authorization`**. Вход по SMS включает **`Client4.setAuthHeader = true`** и **`setIncludeCookies(false)`** + в **`getOptions`** задаётся **`credentials: 'omit'`** (см. `platform/client`). Плюс опционально **`POST /api/v4/users/logout`**. Пересоберите `@mattermost/client` / channels.
- **Где задаётся телефон (не в Mattermost):** в интерфейсе Mattermost **нет** поля «телефон для SMS-входа». Номер хранится в **`sms_auth`** (SQLite `phone_users`). Администратор привязывает его так: **`POST http://localhost:3002/api/admin/phone-users`** с телом `{"phone":"+79161234567","email":"user@example.com"}` (или `"mm_user_id":"…"`) и заголовком **`Authorization: Bearer <PAT админа MM>`** — пользователь уже должен существовать в Mattermost (создан через mmctl, приглашение по почте и т.д.). Либо пользователь **сам** указывает номер в блоке **«Регистрация по SMS»** на странице логина — тогда создаётся учётка MM и привязка телефона без ручного `phone-users`.
- **Чтобы после входа не было экрана «нет команд»:** в **`sms_auth/.env`** задайте **`MM_DEFAULT_TEAM_ID=<id команды>`** (id из `mmctl team list --local` или из URL команды в веб-клиенте). Тогда сервис после **регистрации по SMS**, после **успешного входа по SMS** (`verify-code`) и после **`POST /api/admin/phone-users`** добавляет пользователя в эту команду через API (нужны **`MM_ADMIN_TOKEN`** и права админа на добавление в team).
- **Приглашение вручную в UI:** поиск в Invite только по **username / email**. По телефону: `GET http://localhost:3002/api/admin/lookup-by-phone?phone=%2B79161234567` с тем же **`Authorization: Bearer`** — в ответе `username` и `email` для поля Invite.
- Для production в `root.html` можно задать `window.ACADEMY_SMS_AUTH_URL = 'https://…'` — иначе клиент использует `http://localhost:3002`.
- Для локалки в `sms_auth/.env` можно задать **`OTP_DEV_CODE=1234`** — тогда код всегда `1234`, SMS не уходит (см. `sms_auth/.env.example`). **В production переменную не задавать.**

## 5. Запуск веб-приложения (фронтенд)
Установите Node.js через NVM (версия из репозитория — в `.nvmrc`):
```bash
# Установка NVM: https://github.com/nvm-sh/nvm#installing-and-updating
cd /Users/devbroseph/Mattermost/webapp
nvm install    # установит версию из .nvmrc (24.11)
npm install    # при первом запуске
make run
```
Веб-интерфейс будет доступен по тому же адресу: **http://localhost:8065** (сервер раздаёт и API, и фронтенд).

## 6. Остановка
- Остановить сервер: в каталоге `server` выполнить `make stop-server`.
- Остановить контейнеры Docker: `make stop-docker` (в каталоге `server`).
- Остановить веб-приложение: в каталоге `webapp` — `make stop` (или Ctrl+C в терминале, где запущен `make run`).

---

## Дальше: перенос на сервер и мобильное приложение
- Краткий runbook по нашим сервисам (порты, env, прокси): **`DEPLOY_RUNBOOK.md`** в корне репозитория.
- Общая документация Mattermost: [Deploy Mattermost](https://docs.mattermost.com/guides/deployment.html) (Docker, Ubuntu, tar и др.).
- Мобильные приложения подключаются к URL вашего сервера (например, `https://your-server.com`). Клиенты: [Android](https://mattermost.com/pl/android-app/), [iOS](https://mattermost.com/pl/ios-app/).
