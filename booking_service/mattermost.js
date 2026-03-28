'use strict';

const https = require('https');
const http = require('http');

const MM_URL = process.env.MM_SERVER_URL || 'http://localhost:8065';
const BOT_TOKEN = process.env.MM_BOT_TOKEN;
const ADMIN_TOKEN = process.env.MM_ADMIN_TOKEN;
const BOOKING_CHANNEL = process.env.MM_BOOKING_CHANNEL || 'resepchen';
const HOOK_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3001';

// ─────────────────────────── HTTP helper ─────────────────────────────────────

function mmRequest(method, path, body, token) {
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
                'Authorization': `Bearer ${token || BOT_TOKEN}`,
                'Content-Type': 'application/json',
                ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}),
            },
        };
        const req = lib.request(options, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); } catch { resolve({}); }
            });
        });
        req.on('error', reject);
        if (data) { req.write(data); }
        req.end();
    });
}

// ─────────────────────────── Получаем DM-канал ───────────────────────────────

async function getDMChannel(userId) {
    const me = await mmRequest('GET', '/api/v4/users/me', null, BOT_TOKEN);
    const ch = await mmRequest('POST', '/api/v4/channels/direct', [me.id, userId], BOT_TOKEN);
    return ch.id;
}

// ─────────────────────────── Получаем канал по имени ─────────────────────────

let _bookingChannelId = null;
async function getBookingChannelId() {
    if (_bookingChannelId) { return _bookingChannelId; }
    try {
        // Получаем список команд
        const teams = await mmRequest('GET', '/api/v4/teams', null, BOT_TOKEN);
        for (const team of teams) {
            const ch = await mmRequest(
                'GET',
                `/api/v4/teams/${team.id}/channels/name/${BOOKING_CHANNEL}`,
                null,
                BOT_TOKEN,
            );
            if (ch.id) {
                _bookingChannelId = ch.id;
                return ch.id;
            }
        }
    } catch {}
    return null;
}

// ─────────────────────────── Получаем admin-пользователей ────────────────────

async function getAdminUserIds() {
    try {
        const users = await mmRequest(
            'GET',
            '/api/v4/users?per_page=100&role=system_admin',
            null,
            ADMIN_TOKEN,
        );
        return Array.isArray(users) ? users.map((u) => u.id) : [];
    } catch { return []; }
}

// ─────────────────────────── Уведомление admin о новой заявке ────────────────

async function notifyAdminNewBooking(booking) {
    const channelId = await getBookingChannelId();
    if (!channelId) { return; }

    const typeLabel = booking.is_curriculum ? '📚 Учебное' : '💳 Внеурочное (нужна оплата)';
    const approveUrl = `${HOOK_URL}/api/bookings/${booking.id}/approve`;
    const rejectUrl = `${HOOK_URL}/api/bookings/${booking.id}/reject`;

    const message = [
        `### 📋 Новая заявка на бронирование`,
        ``,
        `**Класс:** ${booking.room_name}`,
        `**Дата:** ${booking.date}  **Время:** ${booking.start_time} – ${booking.end_time}`,
        `**Заявитель:** @${booking.user_name}`,
        `**Цель:** ${booking.purpose || '—'}`,
        `**Тип:** ${typeLabel}`,
        ``,
        `ID заявки: \`${booking.id}\``,
    ].join('\n');

    const attachments = [
        {
            text: message,
            color: '#c4973b',
            actions: [
                {
                    id: `approve_${booking.id}`,
                    name: '✅ Одобрить',
                    integration: {
                        url: `${approveUrl}?via=button`,
                        context: {booking_id: booking.id, action: 'approve'},
                    },
                },
                {
                    id: `reject_${booking.id}`,
                    name: '❌ Отклонить',
                    integration: {
                        url: `${rejectUrl}?via=button`,
                        context: {booking_id: booking.id, action: 'reject'},
                    },
                },
            ],
        },
    ];

    await mmRequest('POST', '/api/v4/posts', {
        channel_id: channelId,
        message: '',
        props: {attachments},
    }, BOT_TOKEN);
}

// ─────────────────────────── DM заявителю: одобрено ─────────────────────────

async function notifyUserApproved(booking) {
    const dmId = await getDMChannel(booking.user_id);
    if (!dmId) { return; }

    let msg = [
        `✅ **Заявка одобрена!**`,
        ``,
        `**${booking.room_name}**, ${booking.date} · ${booking.start_time}–${booking.end_time}`,
        booking.admin_note ? `\n📝 Примечание администратора: ${booking.admin_note}` : '',
    ].join('\n');

    if (!booking.is_curriculum && booking.payment_link) {
        msg += `\n\n💳 **Для внеурочного бронирования необходима оплата аренды:**\n${booking.payment_link}`;
    }

    await mmRequest('POST', '/api/v4/posts', {channel_id: dmId, message: msg}, BOT_TOKEN);
}

// ─────────────────────────── DM заявителю: отклонено ────────────────────────

async function notifyUserRejected(booking) {
    const dmId = await getDMChannel(booking.user_id);
    if (!dmId) { return; }

    const msg = [
        `❌ **Заявка отклонена**`,
        ``,
        `**${booking.room_name}**, ${booking.date} · ${booking.start_time}–${booking.end_time}`,
        booking.reject_reason ? `\n📝 Причина: ${booking.reject_reason}` : '',
        `\nЕсли у вас есть вопросы — напишите в канал **#resepchen** или администратору.`,
    ].join('\n');

    await mmRequest('POST', '/api/v4/posts', {channel_id: dmId, message: msg}, BOT_TOKEN);
}

// ─────────────────────────── Напоминание об оплате ───────────────────────────

async function sendPaymentReminder(userIds, daysLeft = '7 дней', isUrgent = false) {
    const urgentPrefix = isUrgent ? '🚨 ' : '🔔 ';
    const urgentNote = isUrgent ? '\n\n⚠️ _Завтра последний день для оплаты!_' : '';

    const msg = [
        `${urgentPrefix}**Напоминание об оплате обучения**`,
        ``,
        `Ежемесячная оплата — **до 25 числа**. Осталось: **${daysLeft}**.`,
        ``,
        `Способы оплаты:`,
        `• Наличными в кассу ресепшна`,
        `• Картой на терминале`,
        `• Онлайн-перевод (реквизиты у бухгалтера)`,
        urgentNote,
        ``,
        `При вопросах: напишите в **#buhgalteriya**.`,
    ].filter((l) => l !== undefined).join('\n');

    for (const userId of userIds) {
        try {
            const dmId = await getDMChannel(userId);
            if (dmId) {
                await mmRequest('POST', '/api/v4/posts', {channel_id: dmId, message: msg}, BOT_TOKEN);
            }
        } catch {}
    }
}

async function getDMChannelForAdmin(adminId) {
    return getDMChannel(adminId);
}

// ────────────────────────────────────────────────────────────────────────────────────

/** Уведомить админов о новом черновике публикации */
async function notifyAdminAboutDraft(draft) {
    const channelId = await getBookingChannelId();
    if (!channelId) { return; }
    const tabLabels = {news_students: 'Новости студентам', news_staff: 'Новости сотрудникам', afisha: 'Афиша', faq: 'FAQ'};
    const msg = [
        `✏️ **Черновик для согласования**`,
        ``,
        `**Секция:** ${tabLabels[draft.tab] || draft.tab}`,
        `**Заголовок:** ${draft.title || '—'}`,
        `**Автор:** @${draft.author_name}`,
        ``,
        `Одобрить/отклонить — вкладка «Админ» → Черновики.`,
        `ID: \`${draft.id}\``,
    ].join('\n');
    await mmRequest('POST', '/api/v4/posts', {channel_id: channelId, message: msg}, BOT_TOKEN);
}

/** Опубликовать одобренный черновик в Mattermost */
async function publishApprovedDraft(draft) {
    const post = {
        channel_id: draft.channel_id,
        message: draft.formatted_message || draft.body || draft.title || '',
    };
    if (draft.image_file_id) {
        post.file_ids = [draft.image_file_id];
    }
    const resp = await mmRequest('POST', '/api/v4/posts', post, BOT_TOKEN || ADMIN_TOKEN);
    if (resp.status_code >= 400) {
        throw new Error(resp.message || 'Ошибка Mattermost');
    }
    // Уведомить автора
    if (draft.author_id) {
        const dmId = await getDMChannel(draft.author_id);
        if (dmId) {
            const tabLabels = {news_students: 'Новости студентам', news_staff: 'Новости сотрудникам', afisha: 'Афиша', faq: 'FAQ'};
            await mmRequest('POST', '/api/v4/posts', {
                channel_id: dmId,
                message: `✅ Ваша публикация **«${draft.title || 'без заголовка'}»** в разделе **${tabLabels[draft.tab] || draft.tab}** одобрена и опубликована!`,
            }, BOT_TOKEN || ADMIN_TOKEN);
        }
    }
}

/** Уведомить автора об отклонении черновика */
async function notifyDraftRejected(draft, reason) {
    if (!draft.author_id) { return; }
    const dmId = await getDMChannel(draft.author_id);
    if (!dmId) { return; }
    await mmRequest('POST', '/api/v4/posts', {
        channel_id: dmId,
        message: [
            `❌ Ваша публикация **«${draft.title || 'без заголовка'}»** отклонена.`,
            reason ? `\nПричина: ${reason}` : '',
            `\nОтредактируйте и отправьте снова или обратитесь к руководству.`,
        ].filter(Boolean).join(''),
    }, BOT_TOKEN || ADMIN_TOKEN);
}

module.exports = {
    notifyAdminNewBooking,
    notifyUserApproved,
    notifyUserRejected,
    sendPaymentReminder,
    getDMChannelForAdmin,
    notifyAdminAboutDraft,
    publishApprovedDraft,
    notifyDraftRejected,
    mmRequest,
    getAdminUserIds,
};
