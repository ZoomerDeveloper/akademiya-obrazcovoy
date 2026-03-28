'use strict';

/**
 * Клиент sms.ru API
 * Документация: https://sms.ru/api/send
 *
 * Переменные окружения:
 *   SMSRU_API_ID  — API-ключ из личного кабинета sms.ru
 *   SMSRU_FROM    — Имя отправителя (согласовать с sms.ru, по умолчанию пусто)
 *   SMSRU_TEST    — '1' для тестового режима (SMS не отправляются, деньги не списываются)
 */

const https = require('https');

const API_ID = process.env.SMSRU_API_ID || '';
const FROM = process.env.SMSRU_FROM || '';
const TEST = process.env.SMSRU_TEST === '1' ? 1 : 0;

const BASE = 'https://sms.ru';

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve({status: 'ERROR', data}); }
            });
        }).on('error', reject);
    });
}

/**
 * Нормализует телефон к формату +7XXXXXXXXXX
 * Принимает: 89161234567, +79161234567, 79161234567, 8(916)123-45-67
 */
function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '8') {
        return '+7' + digits.slice(1);
    }
    if (digits.length === 11 && digits[0] === '7') {
        return '+' + digits;
    }
    if (digits.length === 10) {
        return '+7' + digits;
    }
    // Международный формат — оставляем как есть с +
    if (raw.startsWith('+') && digits.length >= 10) {
        return '+' + digits;
    }
    throw new Error('Неверный формат номера телефона');
}

/**
 * Генерирует OTP: при OTP_DEV_CODE в env — фиксированный код (только для разработки).
 * Иначе — случайный 6-значный.
 */
function generateCode() {
    const dev = (process.env.OTP_DEV_CODE || '').trim();
    if (dev) {
        return dev;
    }
    return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Отправляет SMS с кодом через sms.ru
 * @returns {Promise<{ok: boolean, sms_id?: string, error?: string}>}
 */
async function sendOtp(phone, code) {
    if (!API_ID) {
        throw new Error('SMSRU_API_ID не задан в .env');
    }

    const msg = encodeURIComponent(`Ваш код входа в Академию Образцовой: ${code}. Действителен 10 минут.`);
    const from = FROM ? `&from=${encodeURIComponent(FROM)}` : '';
    const url = `${BASE}/sms/send?api_id=${API_ID}&to=${encodeURIComponent(phone)}&msg=${msg}${from}&json=1&test=${TEST}`;

    const resp = await httpsGet(url);

    if (resp.status_code === 100) {
        const smsEntry = Object.values(resp.sms || {})[0];
        if (smsEntry && smsEntry.status_code === 100) {
            return {ok: true, sms_id: smsEntry.sms_id};
        }
        const code_ = smsEntry?.status_code;
        return {ok: false, error: smsru_error(code_)};
    }

    return {ok: false, error: smsru_error(resp.status_code)};
}

/**
 * Проверяет баланс аккаунта sms.ru
 */
async function getBalance() {
    const url = `${BASE}/my/balance?api_id=${API_ID}&json=1`;
    return httpsGet(url);
}

/**
 * Статус отправленного SMS
 */
async function getSmsStatus(smsId) {
    const url = `${BASE}/sms/status?api_id=${API_ID}&sms_id=${smsId}&json=1`;
    return httpsGet(url);
}

function smsru_error(code) {
    const errors = {
        100: 'Успешно',
        101: 'Сообщение передаётся оператору',
        102: 'Сообщение отправлено (в пути)',
        103: 'Сообщение доставлено',
        104: 'Не может быть доставлено: время жизни истекло',
        105: 'Не может быть доставлено: удалено оператором',
        106: 'Не может быть доставлено: сбой телефона',
        107: 'Не может быть доставлено: неизвестная причина',
        108: 'Не может быть доставлено: отклонено',
        150: 'Не может быть доставлено: не существует',
        200: 'Неправильный api_id',
        201: 'Не хватает средств',
        202: 'Неправильно указан получатель',
        203: 'Нет текста сообщения',
        204: 'Имя отправителя не согласовано',
        205: 'Сообщение слишком длинное',
        206: 'Слишком много сообщений в сутки',
        207: 'На этот номер нельзя отправлять сообщения',
        208: 'Неправильный формат времени',
        209: 'Добавьте номер в стоп-лист',
        210: 'Используйте POST вместо GET',
        211: 'Метод не найден',
        212: 'Текст сообщения необходимо передать в кодировке UTF-8',
        220: 'Сервис временно недоступен',
        500: 'Ошибка на сервере (на стороне sms.ru)',
    };
    return errors[code] || `Неизвестная ошибка (код ${code})`;
}

module.exports = {normalizePhone, generateCode, sendOtp, getBalance, getSmsStatus};
