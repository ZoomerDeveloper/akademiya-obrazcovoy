#!/usr/bin/env node
/**
 * Бот-модератор для readonly-каналов Академии Образцовой.
 * Удаляет сообщения студентов в каналах-объявлениях (fallback без Enterprise).
 *
 * Требования: Node.js 16+, @mattermost/client
 * Запуск: node bot_moderator.js
 *
 * Переменные окружения:
 *   MM_SERVER_URL   — адрес Mattermost (по умолчанию http://localhost:8065)
 *   MM_BOT_TOKEN    — токен бота-модератора (создан через setup_moderator_bot.sh)
 *   MM_ADMIN_TOKEN  — токен администратора (для удаления чужих сообщений)
 */

const https = require('https');
const http = require('http');
const WebSocket = require('ws');

const SERVER_URL = process.env.MM_SERVER_URL || 'http://localhost:8065';
const BOT_TOKEN = process.env.MM_BOT_TOKEN;
const ADMIN_TOKEN = process.env.MM_ADMIN_TOKEN;

if (!BOT_TOKEN || !ADMIN_TOKEN) {
    console.error('❌ Нужны переменные MM_BOT_TOKEN и MM_ADMIN_TOKEN');
    console.error('   bash bot_moderator/setup_moderator_bot.sh EMAIL PASS');
    process.exit(1);
}

// Каналы, в которых студентам нельзя писать
const READONLY_CHANNEL_NAMES = new Set([
    'obyavleniya',
    'novosti-studentam',
    'afisha',
    'raspisanie',
    'faq',
]);

// Кэш: channel_id → channel_name
const channelCache = new Map();
// Кэш: user_id → roles
const userRoleCache = new Map();

function apiRequest(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(SERVER_URL);
        const lib = url.protocol === 'https:' ? https : http;
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        };
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({});
                }
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function getUserRoles(userId) {
    if (userRoleCache.has(userId)) {
        return userRoleCache.get(userId);
    }
    const user = await apiRequest('GET', `/api/v4/users/${userId}`, null, ADMIN_TOKEN);
    const roles = user.roles || '';
    userRoleCache.set(userId, roles);
    // Инвалидируем кэш через 5 минут (роли могут меняться)
    setTimeout(() => userRoleCache.delete(userId), 5 * 60 * 1000);
    return roles;
}

async function getChannelName(channelId) {
    if (channelCache.has(channelId)) {
        return channelCache.get(channelId);
    }
    const channel = await apiRequest('GET', `/api/v4/channels/${channelId}`, null, BOT_TOKEN);
    const name = channel.name || '';
    channelCache.set(channelId, name);
    return name;
}

function isStaff(roles) {
    return roles.includes('system_admin') ||
           roles.includes('team_admin') ||
           roles.includes('channel_admin');
}

async function handlePost(post) {
    // Игнорируем системные сообщения
    if (post.type && post.type !== '') {
        return;
    }

    const channelName = await getChannelName(post.channel_id);
    if (!READONLY_CHANNEL_NAMES.has(channelName)) {
        return;
    }

    const roles = await getUserRoles(post.user_id);
    if (isStaff(roles)) {
        // Сотрудники могут писать
        return;
    }

    // Студент написал в readonly-канал — удаляем сообщение
    console.log(`🗑  Удаляем сообщение студента в #${channelName} (user: ${post.user_id})`);
    await apiRequest('DELETE', `/api/v4/posts/${post.id}`, null, ADMIN_TOKEN);

    // Отправляем эфемерное предупреждение только автору (видит только он)
    await apiRequest('POST', '/api/v4/posts/ephemeral', {
        user_id: post.user_id,
        post: {
            channel_id: post.channel_id,
            message: `⚠️ Канал **#${channelName}** является каналом объявлений. Публиковать сообщения в нём могут только педагоги и администраторы Академии.\n\nЕсли у вас есть вопрос — напишите в личное сообщение или используйте канал **#faq**.`,
        },
    }, ADMIN_TOKEN);
}

async function connectWebSocket() {
    const wsUrl = SERVER_URL.replace(/^http/, 'ws') + '/api/v4/websocket';
    console.log(`🔌 Подключение к WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl, {
        headers: {Authorization: `Bearer ${BOT_TOKEN}`},
    });

    ws.on('open', () => {
        console.log('✅ WebSocket подключён');
        // Аутентификация через WebSocket
        ws.send(JSON.stringify({
            seq: 1,
            action: 'authentication_challenge',
            data: {token: BOT_TOKEN},
        }));
    });

    ws.on('message', (rawData) => {
        let event;
        try {
            event = JSON.parse(rawData.toString());
        } catch {
            return;
        }

        if (event.event === 'posted') {
            const post = typeof event.data?.post === 'string'
                ? JSON.parse(event.data.post)
                : event.data?.post;

            if (post) {
                handlePost(post).catch((err) =>
                    console.error('Ошибка обработки поста:', err),
                );
            }
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket ошибка:', err.message);
    });

    ws.on('close', () => {
        console.log('⚠️  WebSocket закрыт. Переподключение через 5 сек...');
        setTimeout(connectWebSocket, 5000);
    });

    // Ping каждые 30 секунд
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({seq: Date.now(), action: 'ping'}));
        }
    }, 30000);

    ws.on('close', () => clearInterval(pingInterval));
}

console.log('🤖 Бот-модератор Академии Образцовой');
console.log(`   Readonly-каналы: ${[...READONLY_CHANNEL_NAMES].join(', ')}`);
console.log('');

connectWebSocket().catch(console.error);
