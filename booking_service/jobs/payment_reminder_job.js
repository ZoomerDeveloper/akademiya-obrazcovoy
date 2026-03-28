'use strict';

const mm = require('../mattermost');
const {postAcademyNotification} = require('../lib/notification_webhook');

/**
 * Воркер напоминаний об оплате: DM через Mattermost (→ push на телефон при включённых уведомлениях)
 * + опционально ACADEMY_NOTIFICATION_WEBHOOK_URL для внешней доставки.
 */
async function sendPaymentReminderToStudents(daysLeft, isUrgent = false) {
    const users = await mm.mmRequest(
        'GET',
        '/api/v4/users?per_page=200',
        null,
        process.env.MM_ADMIN_TOKEN,
    );
    const studentIds = Array.isArray(users)
        ? users
            .filter((u) => u.roles &&
                !u.roles.includes('team_admin') &&
                !u.roles.includes('system_admin') &&
                !u.roles.includes('system_bot'))
            .map((u) => u.id)
        : [];

    await mm.sendPaymentReminder(studentIds, daysLeft, isUrgent);
    console.log(`[payment_reminder_job] DM отправлены ${studentIds.length} получателям (осталось: ${daysLeft})`);

    await postAcademyNotification('payment_reminder', {
        daysLeft,
        isUrgent,
        recipientCount: studentIds.length,
        channel: 'mattermost_dm',
    });
}

module.exports = {sendPaymentReminderToStudents};
