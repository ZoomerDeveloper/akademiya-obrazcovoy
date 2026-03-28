#!/usr/bin/env bash
# Брендинг веб-интерфейса Академии Образцовой через API
# Запуск: bash brand_web.sh <admin_email> <admin_password>
# Устанавливает: название сайта, описание, кастомную тему

set -e

BASE_URL="http://localhost:8065"
ADMIN_EMAIL="${1:-admin@academy.ru}"
ADMIN_PASS="${2:-AdminPass123!}"

echo "=== Брендинг веб-интерфейса Академии ==="

# Авторизация
LOGIN=$(curl -sS -i -X POST "$BASE_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN" | grep -i "^token:" | awk '{print $2}' | tr -d '\r')
if [ -z "$TOKEN" ]; then
  echo "❌ Ошибка авторизации"
  exit 1
fi
echo "✅ Авторизован"

# ── Название сайта и описание ─────────────────────────────────────────────────
echo "→ Устанавливаем название и описание сайта..."
curl -sS -X PUT "$BASE_URL/api/v4/config/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "TeamSettings": {
      "SiteName": "Академия Образцовой",
      "CustomDescriptionText": "Международная Академия музыки Елены Образцовой",
      "EnableUserCreation": true,
      "EnableOpenServer": false
    },
    "PrivacySettings": {
      "ShowEmailAddress": false,
      "ShowFullName": true
    },
    "ServiceSettings": {
      "EnableCustomEmoji": true,
      "EnableGifPicker": false,
      "EnableLatex": false
    },
    "DisplaySettings": {
      "ExperimentalTimezone": true
    },
    "LocalizationSettings": {
      "DefaultServerLocale": "ru",
      "DefaultClientLocale": "ru",
      "AvailableLocales": "ru,en"
    }
  }' > /dev/null
echo "✅ Название сайта установлено"

# ── Кастомная тема для веба ──────────────────────────────────────────────────
echo "→ Устанавливаем тему Академии..."
curl -sS -X PUT "$BASE_URL/api/v4/config/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ThemeSettings": {
      "EnableThemeSelection": true,
      "DefaultTheme": "custom",
      "AllowCustomThemes": true
    }
  }' > /dev/null
echo "✅ Тема настроена"

# ── Политики безопасности для образовательного учреждения ─────────────────────
echo "→ Настраиваем политики безопасности..."
curl -sS -X PUT "$BASE_URL/api/v4/config/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "PasswordSettings": {
      "MinimumLength": 8,
      "Lowercase": true,
      "Number": true,
      "Uppercase": false,
      "Symbol": false
    },
    "ServiceSettings": {
      "SessionLengthWebInDays": 30,
      "SessionLengthMobileInDays": 60,
      "EnableMultifactorAuthentication": false
    }
  }' > /dev/null
echo "✅ Политики безопасности установлены"

# ── Отключаем маркетинговые элементы Mattermost ────────────────────────────────
echo "→ Отключаем маркетинговые плагины и trial-баннеры..."
curl -sS -X PUT "$BASE_URL/api/v4/config/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "PluginSettings": {
      "EnableUploads": false
    },
    "FeatureFlags": {
      "CloudFreeTrialBannerDismissed": "true"
    },
    "AnnouncementSettings": {
      "ShowMattermostPurchaseLink": false,
      "EnableBanner": false
    }
  }' > /dev/null
echo "✅ Trial-баннеры отключены"

echo ""
echo "=============================================="
echo "✅ БРЕНДИНГ ЗАВЕРШЁН"
echo ""
echo "  Название: Академия Образцовой"
echo "  Описание: Международная Академия музыки Елены Образцовой"
echo "  Язык: Русский"
echo ""
echo "  Пересоберите webapp для применения изменений логотипа:"
echo "    cd /Users/devbroseph/Mattermost/webapp"
echo "    npm run build"
echo "    # Перезапустите сервер"
echo "=============================================="
