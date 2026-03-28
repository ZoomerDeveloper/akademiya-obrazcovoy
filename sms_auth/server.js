'use strict';

/**
 * SMS Auth Service — Академия Образцовой
 *
 * Сервис аутентификации по номеру телефона через sms.ru.
 * Хранит привязку телефон ↔ Mattermost-пользователь в SQLite.
 *
 * Запуск: node -r dotenv/config server.js
 * Порт: 3002 (по умолчанию)
 *
 * Переменные окружения (.env):
 *   PORT             — порт сервиса (по умолчанию 3002)
 *   SMSRU_API_ID     — API-ключ sms.ru
 *   SMSRU_FROM       — имя отправителя (опционально)
 *   SMSRU_TEST       — '1' для тестового режима
 *   MM_SERVER_URL    — адрес Mattermost
 *   MM_ADMIN_TOKEN   — токен системного администратора
 *   MM_DEFAULT_TEAM_ID — опционально: id команды Mattermost; новых/привязанных пользователей добавляем в неё (API от админа)
 *   OTP_TTL_MIN      — TTL кода в минутах (по умолчанию 10)
 *   MAX_ATTEMPTS     — максимум попыток ввода кода (по умолчанию 5)
 *   OTP_DEV_CODE     — если задан (напр. 1234), всегда этот код, SMS можно не слать
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');
const {stmts} = require('./db');
const {normalizePhone, generateCode, sendOtp, getBalance} = require('./smsru');

const PORT = Number(process.env.PORT) || 3002;
const MM_URL = process.env.MM_SERVER_URL || 'http://localhost:8065';
const ADMIN_TOKEN = process.env.MM_ADMIN_TOKEN || '';
/** ID команды Mattermost (например из URL команды или mmctl team list). Пусто — не добавляем в команду автоматически. */
const MM_DEFAULT_TEAM_ID = (process.env.MM_DEFAULT_TEAM_ID || '').trim();
const OTP_TTL = Number(process.env.OTP_TTL_MIN || 10) * 60 * 1000;
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 5);
/** Фиксированный код для локальной разработки (не использовать в production). */
const OTP_DEV_CODE = (process.env.OTP_DEV_CODE || '').trim();

function parseOtpInput(raw) {
    const code = String(raw || '').trim();
    if (!code) {
        return {error: 'Введите код'};
    }
    if (!OTP_DEV_CODE && code.length !== 6) {
        return {error: 'Код должен состоять из 6 цифр'};
    }
    return {code};
}

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────── Rate limiting ───────────────────────────────────

// Не больше 3 запросов кода в 10 минут с одного IP
const requestCodeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: {error: 'Слишком много запросов. Повторите через 10 минут.'},
    standardHeaders: true,
    legacyHeaders: false,
});

// Не больше 10 попыток верификации в 10 минут с одного IP
const verifyLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: {error: 'Слишком много попыток. Повторите через 10 минут.'},
});

const registerRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: {error: 'Слишком много запросов регистрации. Повторите позже.'},
});

// ─────────────────────────── Mattermost API helper ───────────────────────────

function mmRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(MM_URL);
        const lib = url.protocol === 'https:' ? https : http;
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path,
            method,
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json',
                ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}),
            },
        };
        const req = lib.request(options, (res) => {
            // Извлекаем Token из заголовков (при логине)
            const token = res.headers.token || '';
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                try { resolve({body: JSON.parse(raw), token, status: res.statusCode}); }
                catch { resolve({body: {}, token, status: res.statusCode}); }
            });
        });
        req.on('error', reject);
        if (data) { req.write(data); }
        req.end();
    });
}

/** Текст ошибки Mattermost из тела ответа (разные форматы API). */
function mmApiErrorText(body) {
    if (!body || typeof body !== 'object') { return ''; }
    return String(
        body.message || body.error || body.detailed_error || body.id || ''
    ).trim();
}

/** Добавляет пользователя в команду от имени MM_ADMIN_TOKEN (идемпотентно при «уже в команде»). */
async function addUserToDefaultTeamIfConfigured(mmUserId) {
    if (!MM_DEFAULT_TEAM_ID || !mmUserId || !ADMIN_TOKEN) {
        return;
    }
    const teamId = MM_DEFAULT_TEAM_ID;
    const resp = await mmRequest('POST', `/api/v4/teams/${encodeURIComponent(teamId)}/members`, {
        team_id: teamId,
        user_id: mmUserId,
    });
    if (resp.status === 200 || resp.status === 201) {
        console.log(`[mm] Пользователь ${mmUserId} добавлен в команду ${teamId}`);
        return;
    }
    const text = mmApiErrorText(resp.body);
    const id = String(resp.body?.id || '');
    if (resp.status === 400 && (/already exists|save_member\.exists|team member/i.test(text + id))) {
        return;
    }
    console.warn('[mm] Не удалось добавить пользователя в MM_DEFAULT_TEAM_ID:', resp.status, text || id);
}

/**
 * Создаёт PAT для пользователя от имени MM_ADMIN_TOKEN.
 * @returns {{ token: string } | { token: null, error: string }}
 */
async function createMmTokenForUser(userId) {
    const resp = await mmRequest('POST', `/api/v4/users/${userId}/tokens`, {
        description: `sms-auth-${Date.now()}`,
    });
    const token = resp.body?.token;
    if (token && (resp.status === 200 || resp.status === 201)) {
        return {token};
    }
    const raw = mmApiErrorText(resp.body);
    const id = String(resp.body?.id || '');
    console.error('[mm] POST /users/.../tokens failed', {status: resp.status, userId, id, message: raw});
    let error = raw || `Mattermost вернул ${resp.status} без токена`;
    if (/user_access_token\.disabled|Personal access tokens are disabled/i.test(id + raw)) {
        error =
            'На сервере Mattermost отключены персональные токены доступа. Включите: System Console → Integrations → ' +
            'Integration Management → «Enable Personal Access Tokens» (или аналог в вашей версии), затем повторите вход.';
    } else if (resp.status === 403 || /permission|edit_other_users/i.test(id + raw)) {
        error =
            'Mattermost отказал в создании токена для пользователя. Нужен MM_ADMIN_TOKEN системного администратора ' +
            'с правами управления пользователями.';
    } else if (resp.status === 401) {
        error = 'MM_ADMIN_TOKEN недействителен или истёк — обновите токен в sms_auth/.env.';
    }
    return {token: null, error};
}

/** Ищет пользователя Mattermost по email */
async function findMmUserByEmail(email) {
    const resp = await mmRequest('GET', `/api/v4/users/email/${encodeURIComponent(email)}`);
    if (resp.status === 200 && resp.body.id) { return resp.body; }
    return null;
}

/** Получает данные пользователя по ID */
async function getMmUser(userId) {
    const resp = await mmRequest('GET', `/api/v4/users/${userId}`);
    if (resp.status === 200) { return resp.body; }
    return null;
}

/**
 * Mattermost для POST /api/v4/users без сессии system_admin идёт по пути «открытая регистрация»
 * и требует EnableOpenServer. Сервис должен вызывать API с MM_ADMIN_TOKEN системного администратора.
 */
function translateMmUserCreateError(raw) {
    const t = String(raw || '');
    if (/does not allow open signups|no_open_server/i.test(t)) {
        return (
            'Mattermost отклонил создание пользователя: запрос не распознан как действие системного администратора. ' +
            'В sms_auth/.env задайте MM_ADMIN_TOKEN — персональный токен доступа (PAT) пользователя с ролью system_admin ' +
            '(Профиль → Безопасность → Персональные токены доступа). Либо включите открытую регистрацию в сервере ' +
            '(Authentication → Signup → разрешить открытый сервер) — это менее безопасно.'
        );
    }
    return t || 'Не удалось создать пользователя в Mattermost';
}

async function createMmUser({email, username, password, first_name, last_name}) {
    const resp = await mmRequest('POST', '/api/v4/users', {
        email,
        username,
        password,
        first_name: first_name || '',
        last_name: last_name || '',
    });
    if (resp.status !== 201 && resp.status !== 200) {
        const msg = translateMmUserCreateError(mmApiErrorText(resp.body) || `Ошибка создания пользователя (${resp.status})`);
        throw new Error(msg);
    }
    return resp.body;
}

/** Проверка MM_ADMIN_TOKEN при старте (не блокирует запуск). */
async function logMmAdminTokenStatus() {
    if (!ADMIN_TOKEN) {
        console.warn('   ⚠️  MM_ADMIN_TOKEN пуст — регистрация по SMS не сможет создавать пользователей в Mattermost!');
        return;
    }
    try {
        const resp = await mmRequest('GET', '/api/v4/users/me');
        if (resp.status !== 200 || !resp.body?.id) {
            console.warn('   ⚠️  MM_ADMIN_TOKEN недействителен (users/me не OK). Проверьте токен и MM_SERVER_URL.');
            return;
        }
        const roles = resp.body.roles || '';
        if (!roles.includes('system_admin')) {
            console.warn(
                '   ⚠️  MM_ADMIN_TOKEN выдан не системному администратору Mattermost — POST /users уйдёт в «открытую регистрацию» и даст ошибку про open signups. ' +
                'Создайте PAT у пользователя с ролью system_admin.'
            );
            return;
        }
        console.log('   ✅ MM_ADMIN_TOKEN: системный администратор Mattermost подтверждён');

        const cfg = await mmRequest('GET', '/api/v4/config/client');
        if (cfg.status === 200 && cfg.body?.EnableUserAccessTokens === 'false') {
            console.warn(
                '   ⚠️  В Mattermost выключены Personal Access Tokens — SMS-вход не сможет выдать токен. ' +
                'Включите System Console → Integrations → Enable Personal Access Tokens.'
            );
        }
    } catch (e) {
        console.warn('   ⚠️  Не удалось проверить MM_ADMIN_TOKEN:', e.message || e);
    }
}

// ─────────────────────────── POST /api/auth/request-code ─────────────────────
/**
 * Шаг 1: Пользователь вводит номер телефона → получает SMS с кодом.
 *
 * Body: { phone: "+79161234567" }
 * Response 200: { ok: true, phone: "+79161234567", test: false }
 * Response 404: { error: "Номер не найден в системе" }
 */
app.post('/api/auth/request-code', requestCodeLimiter, async (req, res) => {
    let phone;
    try {
        phone = normalizePhone(req.body.phone || '');
    } catch {
        return res.status(400).json({error: 'Неверный формат номера. Пример: +79161234567'});
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    // Проверяем: есть ли такой телефон в базе
    const phoneUser = stmts.findByPhone.get(phone);
    if (!phoneUser) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'no_user', now: Date.now()});
        return res.status(404).json({
            error: 'Номер телефона не привязан к аккаунту Академии. Обратитесь к администратору.',
        });
    }

    // Очищаем старые коды
    stmts.cleanExpired.run(Date.now());

    // Генерируем новый код
    const code = generateCode();
    const expiresAt = Date.now() + OTP_TTL;

    let smsId = null;
    const testMode = process.env.SMSRU_TEST === '1';

    if (OTP_DEV_CODE) {
        console.warn(`[auth] OTP_DEV_CODE активен — SMS не отправляется, код фиксированный`);
    } else {
        try {
            const result = await sendOtp(phone, code);
            if (!result.ok) {
                console.error(`[sms] Ошибка отправки на ${phone}: ${result.error}`);
                if (!testMode) {
                    return res.status(503).json({error: `Не удалось отправить SMS: ${result.error}`});
                }
            }
            smsId = result.sms_id || null;
        } catch (err) {
            console.error('[sms] Исключение:', err.message);
            if (!testMode) {
                return res.status(503).json({error: 'SMS-сервис временно недоступен'});
            }
        }
    }

    stmts.insertOtp.run({phone, code, sms_id: smsId, now: Date.now(), expires_at: expiresAt});

    const devCode = (testMode || OTP_DEV_CODE) ? code : undefined;

    console.log(`[auth] Код отправлен на ${phone.slice(0, 4)}****${phone.slice(-4)} (test=${testMode})`);

    res.json({
        ok: true,
        phone,
        expires_in: Math.round(OTP_TTL / 1000),
        test: testMode || Boolean(OTP_DEV_CODE),
        ...(devCode ? {dev_code: devCode} : {}),
    });
});

// ─────────────────────────── POST /api/auth/verify-code ──────────────────────
/**
 * Шаг 2: Пользователь вводит полученный код → получает Mattermost-токен.
 *
 * Body: { phone: "+79161234567", code: "123456" }
 * Response 200: { ok: true, token, user_id, username, roles }
 */
app.post('/api/auth/verify-code', verifyLimiter, async (req, res) => {
    let phone;
    try {
        phone = normalizePhone(req.body.phone || '');
    } catch {
        return res.status(400).json({error: 'Неверный формат номера'});
    }

    const parsed = parseOtpInput(req.body.code);
    if (parsed.error) {
        return res.status(400).json({error: parsed.error});
    }
    const inputCode = parsed.code;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    const otp = stmts.findLatestOtp.get(phone);

    if (!otp) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'expired', now: Date.now()});
        return res.status(400).json({error: 'Код не найден или уже использован. Запросите новый.'});
    }

    if (Date.now() > otp.expires_at) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'expired', now: Date.now()});
        return res.status(400).json({error: 'Срок действия кода истёк. Запросите новый.'});
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'rate_limited', now: Date.now()});
        return res.status(429).json({error: `Превышено количество попыток (${MAX_ATTEMPTS}). Запросите новый код.`});
    }

    stmts.incrementAttempts.run(otp.id);

    if (otp.code !== inputCode) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'wrong_code', now: Date.now()});
        const left = MAX_ATTEMPTS - otp.attempts - 1;
        return res.status(400).json({
            error: 'Неверный код',
            attempts_left: Math.max(0, left),
        });
    }

    // Код верный — ищем пользователя
    const phoneUser = stmts.findByPhone.get(phone);
    if (!phoneUser) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'no_user', now: Date.now()});
        return res.status(404).json({error: 'Пользователь не найден'});
    }

    // Отмечаем код использованным
    stmts.markVerified.run(otp.id);

    // Получаем актуальные данные пользователя из Mattermost
    const mmUser = await getMmUser(phoneUser.mm_user_id);
    if (!mmUser || mmUser.delete_at > 0) {
        stmts.logAuth.run({phone, mm_user_id: phoneUser.mm_user_id, ip, result: 'no_user', now: Date.now()});
        return res.status(403).json({error: 'Аккаунт деактивирован. Обратитесь к администратору.'});
    }

    // Создаём API-токен для пользователя в Mattermost
    const pat = await createMmTokenForUser(mmUser.id);
    if (!pat.token) {
        return res.status(503).json({
            error: pat.error || 'Не удалось создать сессию. Обратитесь к администратору.',
        });
    }
    const mmToken = pat.token;

    await addUserToDefaultTeamIfConfigured(mmUser.id);

    stmts.logAuth.run({phone, mm_user_id: mmUser.id, ip, result: 'ok', now: Date.now()});

    console.log(`[auth] ✅ Вход: @${mmUser.username} (${phone.slice(0, 4)}****${phone.slice(-4)})`);

    res.json({
        ok: true,
        token: mmToken,
        user_id: mmUser.id,
        username: mmUser.username,
        email: mmUser.email,
        first_name: mmUser.first_name,
        last_name: mmUser.last_name,
        roles: mmUser.roles,
    });
});

// ─────────────────────────── Регистрация по SMS ─────────────────────────────

/**
 * POST /api/auth/register-request-code
 * OTP на новый номер (номер ещё не должен быть в phone_users).
 */
app.post('/api/auth/register-request-code', registerRequestLimiter, async (req, res) => {
    let phone;
    try {
        phone = normalizePhone(req.body.phone || '');
    } catch {
        return res.status(400).json({error: 'Неверный формат номера. Пример: +79161234567'});
    }

    if (stmts.findByPhone.get(phone)) {
        return res.status(409).json({
            error: 'Этот номер уже привязан к аккаунту. Войдите через «Вход по SMS».',
        });
    }

    stmts.cleanExpired.run(Date.now());
    const code = generateCode();
    const expiresAt = Date.now() + OTP_TTL;
    const testMode = process.env.SMSRU_TEST === '1';

    if (OTP_DEV_CODE) {
        console.warn(`[auth] OTP_DEV_CODE — SMS при регистрации не отправляется`);
    } else {
        try {
            const result = await sendOtp(phone, code);
            if (!result.ok && !testMode) {
                return res.status(503).json({error: `Не удалось отправить SMS: ${result.error}`});
            }
        } catch (err) {
            if (!testMode) {
                return res.status(503).json({error: 'SMS-сервис временно недоступен'});
            }
        }
    }

    stmts.insertOtp.run({phone, code, sms_id: null, now: Date.now(), expires_at: expiresAt});

    res.json({
        ok: true,
        phone,
        expires_in: Math.round(OTP_TTL / 1000),
        test: testMode || Boolean(OTP_DEV_CODE),
        ...((testMode || OTP_DEV_CODE) ? {dev_code: code} : {}),
    });
});

/**
 * POST /api/auth/register-complete
 * Body: phone, code, email, username, password, first_name?, last_name?
 */
app.post('/api/auth/register-complete', verifyLimiter, async (req, res) => {
    let phone;
    try {
        phone = normalizePhone(req.body.phone || '');
    } catch {
        return res.status(400).json({error: 'Неверный формат номера'});
    }

    const codeParsed = parseOtpInput(req.body.code);
    if (codeParsed.error) {
        return res.status(400).json({error: codeParsed.error});
    }
    const inputCode = codeParsed.code;
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const first_name = String(req.body.first_name || '').trim();
    const last_name = String(req.body.last_name || '').trim();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (!email.includes('@')) {
        return res.status(400).json({error: 'Укажите корректный email'});
    }
    if (!username || username.length < 3) {
        return res.status(400).json({error: 'Username не короче 3 символов'});
    }
    if (password.length < 8) {
        return res.status(400).json({error: 'Пароль не короче 8 символов'});
    }

    if (stmts.findByPhone.get(phone)) {
        return res.status(409).json({error: 'Номер уже зарегистрирован'});
    }

    const existingEmail = await findMmUserByEmail(email);
    if (existingEmail) {
        return res.status(409).json({error: 'Пользователь с таким email уже есть. Войдите по почте или привяжите телефон в админке.'});
    }

    const otp = stmts.findLatestOtp.get(phone);
    if (!otp || Date.now() > otp.expires_at) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'expired', now: Date.now()});
        return res.status(400).json({error: 'Код не найден или истёк. Запросите новый.'});
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({error: 'Превышено число попыток. Запросите новый код.'});
    }

    stmts.incrementAttempts.run(otp.id);
    if (otp.code !== inputCode) {
        stmts.logAuth.run({phone, mm_user_id: null, ip, result: 'wrong_code', now: Date.now()});
        return res.status(400).json({error: 'Неверный код'});
    }

    let mmUser;
    try {
        mmUser = await createMmUser({email, username, password, first_name, last_name});
    } catch (e) {
        return res.status(400).json({error: e.message || 'Не удалось создать пользователя'});
    }

    stmts.markVerified.run(otp.id);

    stmts.upsertPhoneUser.run({
        phone,
        mm_user_id: mmUser.id,
        mm_username: mmUser.username || username,
        now: Date.now(),
    });

    const pat = await createMmTokenForUser(mmUser.id);
    if (!pat.token) {
        return res.status(503).json({
            error:
                pat.error ||
                'Аккаунт создан, но не удалось выдать токен. Включите Personal Access Tokens в Mattermost или войдите по почте.',
        });
    }
    const mmToken = pat.token;

    await addUserToDefaultTeamIfConfigured(mmUser.id);

    stmts.logAuth.run({phone, mm_user_id: mmUser.id, ip, result: 'register_ok', now: Date.now()});

    res.json({
        ok: true,
        token: mmToken,
        user_id: mmUser.id,
        username: mmUser.username,
        email: mmUser.email,
    });
});

// ─────────────────────────── Admin: привязка телефонов ───────────────────────

// Проверяем, что запрос от администратора
async function requireAdmin(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) { return res.status(401).json({error: 'Требуется авторизация'}); }

    try {
        const resp = await mmRequest('GET', '/api/v4/users/me');
        // Проверяем через отдельный запрос с переданным токеном
        const checkResp = await new Promise((resolve) => {
            const url = new URL(MM_URL);
            const lib = url.protocol === 'https:' ? https : http;
            lib.get({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: '/api/v4/users/me',
                headers: {'Authorization': `Bearer ${token}`},
            }, (r) => {
                let raw = '';
                r.on('data', (c) => { raw += c; });
                r.on('end', () => {
                    try { resolve(JSON.parse(raw)); } catch { resolve({}); }
                });
            }).on('error', () => resolve({}));
        });

        if (!checkResp.roles?.includes('system_admin') && !checkResp.roles?.includes('team_admin')) {
            return res.status(403).json({error: 'Требуются права администратора'});
        }
        req.adminUser = checkResp;
        next();
    } catch {
        return res.status(401).json({error: 'Ошибка авторизации'});
    }
}

/**
 * GET /api/admin/phone-users
 * Список всех привязанных телефонов
 */
app.get('/api/admin/phone-users', requireAdmin, (req, res) => {
    const users = stmts.listAll.all();
    // Маскируем телефоны в ответе
    res.json(users.map((u) => ({
        ...u,
        phone_masked: u.phone.slice(0, 4) + '****' + u.phone.slice(-4),
    })));
});

/**
 * GET /api/admin/lookup-by-phone?phone=%2B79161234567
 * Mattermost в приглашении в team ищет только username/email — не телефон.
 * Запрос с Bearer-токеном админа MM → username/email для поля Invite / Add members.
 */
app.get('/api/admin/lookup-by-phone', requireAdmin, async (req, res) => {
    let phone;
    try {
        phone = normalizePhone(String(req.query.phone || ''));
    } catch {
        return res.status(400).json({error: 'Неверный формат номера. Пример: +79161234567'});
    }

    const row = stmts.findByPhone.get(phone);
    if (!row) {
        return res.status(404).json({error: 'Номер не привязан в SMS Auth'});
    }

    const mmUser = await getMmUser(row.mm_user_id);
    if (!mmUser || mmUser.delete_at > 0) {
        return res.status(404).json({error: 'Учётка Mattermost не найдена или отключена'});
    }

    res.json({
        phone,
        phone_masked: phone.slice(0, 4) + '****' + phone.slice(-4),
        username: mmUser.username,
        email: mmUser.email,
        user_id: mmUser.id,
        first_name: mmUser.first_name || '',
        last_name: mmUser.last_name || '',
        mattermost_invite_hint:
            'В веб-клиенте: команда → Invite / Add members → вставьте username или email (поиск по телефону в MM нет).',
    });
});

/**
 * POST /api/admin/phone-users
 * Привязать телефон к пользователю Mattermost
 * Body: { phone, mm_user_id } или { phone, email }
 */
app.post('/api/admin/phone-users', requireAdmin, async (req, res) => {
    const {phone: rawPhone, mm_user_id, email} = req.body;

    let phone;
    try {
        phone = normalizePhone(rawPhone || '');
    } catch {
        return res.status(400).json({error: 'Неверный формат номера'});
    }

    let userId = mm_user_id;
    let username = '';

    if (!userId && email) {
        const mmUser = await findMmUserByEmail(email);
        if (!mmUser) {
            return res.status(404).json({error: `Пользователь с email ${email} не найден в Mattermost`});
        }
        userId = mmUser.id;
        username = mmUser.username;
    } else if (userId) {
        const mmUser = await getMmUser(userId);
        if (!mmUser) {
            return res.status(404).json({error: 'Пользователь Mattermost не найден'});
        }
        username = mmUser.username;
    } else {
        return res.status(400).json({error: 'Нужен mm_user_id или email'});
    }

    stmts.upsertPhoneUser.run({
        phone,
        mm_user_id: userId,
        mm_username: username,
        now: Date.now(),
    });

    await addUserToDefaultTeamIfConfigured(userId);

    console.log(`[admin] Телефон привязан: ${phone.slice(0, 4)}****${phone.slice(-4)} → @${username}`);

    res.json({ok: true, phone_masked: phone.slice(0, 4) + '****' + phone.slice(-4), username});
});

/**
 * DELETE /api/admin/phone-users/:phone
 * Удалить привязку телефона
 */
app.delete('/api/admin/phone-users/:phone', requireAdmin, (req, res) => {
    let phone;
    try { phone = normalizePhone(decodeURIComponent(req.params.phone)); }
    catch { return res.status(400).json({error: 'Неверный формат номера'}); }

    stmts.deletePhone.run(phone);
    res.json({ok: true});
});

/**
 * GET /api/admin/balance
 * Остаток средств на sms.ru
 */
app.get('/api/admin/balance', requireAdmin, async (req, res) => {
    try {
        const balance = await getBalance();
        res.json(balance);
    } catch (err) {
        res.status(503).json({error: err.message});
    }
});

// ─────────────────────────── Health ──────────────────────────────────────────

app.get('/health', (_, res) => res.json({
    ok: true,
    smsru_test: process.env.SMSRU_TEST === '1',
    otp_dev: Boolean(OTP_DEV_CODE),
    ts: Date.now(),
}));

// ─────────────────────────── Start ───────────────────────────────────────────

app.listen(PORT, () => {
    const testMode = process.env.SMSRU_TEST === '1';
    console.log(`📱 SMS Auth Service запущен на порту ${PORT}`);
    console.log(`   sms.ru: ${testMode ? '⚠️  ТЕСТОВЫЙ РЕЖИМ (SMS не отправляются)' : '✅ Боевой режим'}`);
    if (OTP_DEV_CODE) {
        console.warn(`   ⚠️  OTP_DEV_CODE задан — фиксированный OTP (только для разработки!)`);
    }
    console.log(`   Mattermost: ${MM_URL}`);
    if (MM_DEFAULT_TEAM_ID) {
        console.log(`   Команда по умолчанию (автовступление): ${MM_DEFAULT_TEAM_ID}`);
    }
    if (!process.env.SMSRU_API_ID) {
        console.warn('   ⚠️  SMSRU_API_ID не задан — SMS не будут отправляться!');
    }
    void logMmAdminTokenStatus();
});
