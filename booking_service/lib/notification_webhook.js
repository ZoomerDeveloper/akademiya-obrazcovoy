'use strict';

/**
 * Опциональный webhook для внешней цепочки push (n8n, отдельный воркер, MPNS-адаптер).
 * Mattermost сам шлёт mobile push при новом DM от бота; этот URL — для дублирования/метрик.
 */
async function postAcademyNotification(event, payload) {
    const url = process.env.ACADEMY_NOTIFICATION_WEBHOOK_URL;
    if (!url) {
        return;
    }
    const secret = process.env.ACADEMY_NOTIFICATION_WEBHOOK_SECRET || '';
    const body = JSON.stringify({
        event,
        ts: Date.now(),
        ...payload,
    });
    try {
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? require('https') : require('http');
        await new Promise((resolve, reject) => {
            const req = lib.request(
                {
                    hostname: u.hostname,
                    port: u.port || (u.protocol === 'https:' ? 443 : 80),
                    path: u.pathname + u.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                        ...(secret ? {'X-Academy-Webhook-Secret': secret} : {}),
                    },
                },
                (res) => {
                    res.resume();
                    resolve();
                },
            );
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    } catch (e) {
        console.error('[webhook] notification failed:', e.message || e);
    }
}

module.exports = {postAcademyNotification};
