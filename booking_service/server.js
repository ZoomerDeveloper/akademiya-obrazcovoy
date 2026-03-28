'use strict';

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const {v4: uuid} = require('uuid');
const {db, stmts} = require('./db');
const mm = require('./mattermost');
const {sendPaymentReminderToStudents} = require('./jobs/payment_reminder_job');

const PORT = process.env.PORT || 3001;
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 минут блокировки слота

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────── Helpers ─────────────────────────────────────────

function now() { return Date.now(); }

function timeToMin(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/** Ищем ближайшие свободные слоты в тот же день */
function findAlternativeSlots(roomId, date, duration, excludeId = '') {
    const occupied = stmts.occupiedSlots.all(roomId, date);
    const allSlots = [];
    // Генерируем слоты с 09:00 до 21:00 с шагом 30 мин
    for (let h = 9; h < 21; h++) {
        for (const m of [0, 30]) {
            const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            const endMin = h * 60 + m + duration;
            if (endMin > 21 * 60) { break; }
            const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

            // Проверяем конфликт с занятыми слотами
            const conflict = occupied.some((o) =>
                timeToMin(o.start_time) < timeToMin(end) &&
                timeToMin(o.end_time) > timeToMin(start),
            );
            if (!conflict) { allSlots.push({start, end}); }
        }
    }
    return allSlots.slice(0, 5); // Возвращаем до 5 альтернатив
}

function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({error: 'Требуется авторизация'});
    }
    req.userToken = token;
    next();
}

// ─────────────────────────── POST /api/bookings ──────────────────────────────
// Создать заявку на бронирование

app.post('/api/bookings', requireAuth, async (req, res) => {
    const {room_id, room_name, user_id, user_name, user_email,
        date, start_time, end_time, purpose, is_curriculum, student_visible} = req.body;

    if (!room_id || !user_id || !date || !start_time || !end_time) {
        return res.status(400).json({error: 'Обязательные поля: room_id, user_id, date, start_time, end_time'});
    }

    // Проверяем корректность времени
    if (timeToMin(start_time) >= timeToMin(end_time)) {
        return res.status(400).json({error: 'Начало должно быть раньше конца'});
    }

    const id = uuid();

    // Проверяем конфликт
    const {cnt} = stmts.checkConflict.get(room_id, date, id, end_time, start_time);
    if (cnt > 0) {
        const duration = timeToMin(end_time) - timeToMin(start_time);
        const alternatives = findAlternativeSlots(room_id, date, duration, id);
        return res.status(409).json({
            error: 'Время занято. Попробуйте один из ближайших свободных слотов:',
            alternatives,
        });
    }

    let sv = 1;
    if (typeof student_visible === 'boolean') {
        sv = student_visible ? 1 : 0;
    } else if (student_visible === 0 || student_visible === 1) {
        sv = student_visible;
    }

    const booking = {
        id,
        room_id,
        room_name: room_name || room_id,
        user_id,
        user_name,
        user_email: user_email || '',
        date,
        start_time,
        end_time,
        purpose: purpose || '',
        is_curriculum: is_curriculum ? 1 : 0,
        student_visible: sv,
        now: now(),
    };

    stmts.insert.run(booking);
    stmts.logAction.run(id, 'created', user_id, user_name, purpose, now());

    // Уведомляем администраторов
    const fullBooking = stmts.findById.get(id);
    mm.notifyAdminNewBooking(fullBooking).catch(console.error);

    res.status(201).json(fullBooking);
});

// ─────────────────────────── GET /api/bookings ───────────────────────────────
// Список заявок (с фильтрами)

app.get('/api/bookings', requireAuth, (req, res) => {
    const {status, room_id, date, date_from, date_to} = req.query;

    if (date_from && date_to) {
        const re = /^\d{4}-\d{2}-\d{2}$/;
        if (!re.test(String(date_from)) || !re.test(String(date_to))) {
            return res.status(400).json({error: 'date_from и date_to должны быть в формате YYYY-MM-DD'});
        }
        if (String(date_from) > String(date_to)) {
            return res.status(400).json({error: 'date_from не может быть позже date_to'});
        }
        const rid = room_id && String(room_id).trim() ? String(room_id).trim() : null;
        const studentOnlyRaw = req.query.student_only;
        const studentOnly = studentOnlyRaw === '1' || studentOnlyRaw === 'true' ? 1 : 0;
        const rows = stmts.findByDateRangeOccupancy.all({
            date_from: String(date_from),
            date_to: String(date_to),
            room_id: rid,
            student_only: studentOnly,
        });
        return res.json(rows);
    }

    const rows = stmts.findAll.all({
        status: status || null,
        room_id: room_id || null,
        date: date || null,
    });
    res.json(rows);
});

// ─────────────────────────── GET /api/bookings/my ────────────────────────────
// Мои бронирования

app.get('/api/bookings/my', requireAuth, (req, res) => {
    const {user_id} = req.query;
    if (!user_id) { return res.status(400).json({error: 'Нужен user_id'}); }
    const rows = stmts.findByUser.all(user_id);
    res.json(rows);
});

// ─────────────────────────── GET /api/bookings/pending ───────────────────────
// Ожидающие подтверждения (для admin)

app.get('/api/bookings/pending', requireAuth, (req, res) => {
    res.json(stmts.findPending.all());
});

// ─────────────────────────── GET /api/bookings/:id ───────────────────────────

app.get('/api/bookings/:id', requireAuth, (req, res) => {
    const booking = stmts.findById.get(req.params.id);
    if (!booking) { return res.status(404).json({error: 'Не найдено'}); }
    res.json(booking);
});

// ─────────────────────────── GET /api/rooms ─────────────────────────────────
// Справочник классов / залов

app.get('/api/rooms', requireAuth, (req, res) => {
    const rows = stmts.listRooms.all();
    const out = rows.map((r) => {
        let equipment = [];
        try {
            equipment = JSON.parse(r.equipment || '[]');
            if (!Array.isArray(equipment)) {
                equipment = [];
            }
        } catch {
            equipment = [];
        }
        return {
            id: r.id,
            name: r.name,
            area: r.area,
            floor: r.floor,
            equipment,
            color: r.color || '#555555',
            sort_order: r.sort_order ?? 0,
        };
    });
    res.json(out);
});

// POST /api/rooms — добавить класс (админ)
app.post('/api/rooms', requireAuth, (req, res) => {
    const {id, name, area, floor, equipment, color, sort_order} = req.body || {};
    if (!id || !name || area === undefined || area === null || floor === undefined || floor === null) {
        return res.status(400).json({error: 'Обязательные поля: id, name, area, floor'});
    }
    const rid = String(id).trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rid)) {
        return res.status(400).json({error: 'id: только латиница, цифры, _ и -, до 64 символов'});
    }
    if (stmts.getRoomById.get(rid)) {
        return res.status(409).json({error: 'Класс с таким id уже есть'});
    }
    let equipJson = '[]';
    if (Array.isArray(equipment)) {
        equipJson = JSON.stringify(equipment.map((x) => String(x)));
    } else if (typeof equipment === 'string') {
        equipJson = JSON.stringify(equipment.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean));
    }
    const row = {
        id: rid,
        name: String(name).trim(),
        area: Number(area),
        floor: Math.floor(Number(floor)),
        equipment: equipJson,
        color: (color && String(color).trim()) || '#555555',
        sort_order: sort_order !== undefined ? Math.floor(Number(sort_order)) : 999,
    };
    if (Number.isNaN(row.area) || row.area < 0) {
        return res.status(400).json({error: 'Некорректная площадь'});
    }
    stmts.insertRoom.run(row);
    const created = stmts.getRoomById.get(rid);
    res.status(201).json({
        id: created.id,
        name: created.name,
        area: created.area,
        floor: created.floor,
        equipment: JSON.parse(created.equipment || '[]'),
        color: created.color || '#555555',
        sort_order: created.sort_order ?? 0,
    });
});

// PUT /api/rooms/:id — изменить класс
app.put('/api/rooms/:id', requireAuth, (req, res) => {
    const existing = stmts.getRoomById.get(req.params.id);
    if (!existing) {
        return res.status(404).json({error: 'Не найдено'});
    }
    const {name, area, floor, equipment, color, sort_order} = req.body || {};
    if (!name || area === undefined || floor === undefined) {
        return res.status(400).json({error: 'Обязательные поля: name, area, floor'});
    }
    let equipJson = existing.equipment || '[]';
    if (equipment !== undefined) {
        if (Array.isArray(equipment)) {
            equipJson = JSON.stringify(equipment.map((x) => String(x)));
        } else if (typeof equipment === 'string') {
            equipJson = JSON.stringify(equipment.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean));
        }
    }
    const row = {
        id: req.params.id,
        name: String(name).trim(),
        area: Number(area),
        floor: Math.floor(Number(floor)),
        equipment: equipJson,
        color: (color && String(color).trim()) || existing.color || '#555555',
        sort_order: sort_order !== undefined ? Math.floor(Number(sort_order)) : (existing.sort_order ?? 0),
    };
    if (Number.isNaN(row.area) || row.area < 0) {
        return res.status(400).json({error: 'Некорректная площадь'});
    }
    stmts.updateRoom.run(row);
    const updated = stmts.getRoomById.get(req.params.id);
    res.json({
        id: updated.id,
        name: updated.name,
        area: updated.area,
        floor: updated.floor,
        equipment: JSON.parse(updated.equipment || '[]'),
        color: updated.color || '#555555',
        sort_order: updated.sort_order ?? 0,
    });
});

// DELETE /api/rooms/:id — удалить (если нет активных броней)
app.delete('/api/rooms/:id', requireAuth, (req, res) => {
    const existing = stmts.getRoomById.get(req.params.id);
    if (!existing) {
        return res.status(404).json({error: 'Не найдено'});
    }
    const {cnt} = stmts.countActiveBookingsForRoom.get(req.params.id);
    if (cnt > 0) {
        return res.status(409).json({error: `Нельзя удалить: есть ${cnt} активных заявок (pending/approved)`});
    }
    stmts.deleteRoom.run(req.params.id);
    res.json({ok: true});
});

// ─────────────────────────── GET /api/rooms/:roomId/slots ────────────────────
// Занятые слоты класса на дату (для сетки)

app.get('/api/rooms/:roomId/slots', requireAuth, (req, res) => {
    const {date} = req.query;
    if (!date) { return res.status(400).json({error: 'Нужна дата'}); }
    const slots = stmts.findByRoomDate.all(req.params.roomId, date);
    res.json(slots);
});

// ─────────────────────────── PUT /api/bookings/:id/approve ───────────────────
// Одобрить заявку

app.put('/api/bookings/:id/approve', async (req, res) => {
    const booking = stmts.findById.get(req.params.id);
    if (!booking) { return res.status(404).json({error: 'Не найдено'}); }
    if (booking.status !== 'pending') {
        return res.status(400).json({error: `Нельзя одобрить заявку со статусом: ${booking.status}`});
    }

    const {payment_link, admin_note, actor_id, actor_name, student_visible} = req.body || {};

    let visOverride = null;
    if (typeof student_visible === 'boolean') {
        visOverride = student_visible ? 1 : 0;
    } else if (student_visible === 0 || student_visible === 1) {
        visOverride = student_visible;
    }

    stmts.approve.run({
        payment_link: payment_link || null,
        admin_note: admin_note || null,
        updated_at: now(),
        vis_override: visOverride,
        id: booking.id,
    });
    stmts.logAction.run(booking.id, 'approved', actor_id || 'admin', actor_name || 'Администратор', admin_note || '', now());

    const updated = stmts.findById.get(booking.id);
    mm.notifyUserApproved(updated).catch(console.error);
    res.json(updated);
});

// ─────────────────────────── PUT /api/bookings/:id/reject ────────────────────
// Отклонить заявку

app.put('/api/bookings/:id/reject', async (req, res) => {
    const booking = stmts.findById.get(req.params.id);
    if (!booking) { return res.status(404).json({error: 'Не найдено'}); }
    if (booking.status !== 'pending') {
        return res.status(400).json({error: `Нельзя отклонить заявку со статусом: ${booking.status}`});
    }

    const {reject_reason, actor_id, actor_name} = req.body || {};

    stmts.reject.run(reject_reason || '', now(), booking.id);
    stmts.logAction.run(booking.id, 'rejected', actor_id || 'admin', actor_name || 'Администратор', reject_reason || '', now());

    const updated = stmts.findById.get(booking.id);
    mm.notifyUserRejected(updated).catch(console.error);
    res.json(updated);
});

// ─────────────────────────── DELETE /api/bookings/:id ────────────────────────
// Отмена заявки самим заявителем

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
    const {user_id} = req.body || {};
    const booking = stmts.findById.get(req.params.id);
    if (!booking) { return res.status(404).json({error: 'Не найдено'}); }

    if (booking.status === 'approved' || booking.status === 'rejected') {
        return res.status(400).json({error: 'Нельзя отменить уже обработанную заявку. Напишите администратору.'});
    }

    stmts.cancel.run(now(), req.params.id, user_id || booking.user_id);
    stmts.logAction.run(req.params.id, 'cancelled', user_id, '', '', now());
    res.json({ok: true});
});

// ─────────────────────────── GET /api/bookings/:id/log ───────────────────────
// История изменений заявки

app.get('/api/bookings/:id/log', requireAuth, (req, res) => {
    res.json(stmts.getLog.all(req.params.id));
});

// ─────────────────────────── POST /api/bookings/:id/lock ─────────────────────
// Временно заблокировать слот при редактировании (5 мин)

app.post('/api/bookings/:id/lock', requireAuth, (req, res) => {
    const booking = stmts.findById.get(req.params.id);
    if (!booking) { return res.status(404).json({error: 'Не найдено'}); }
    stmts.lockSlot.run(now() + LOCK_TTL_MS, req.params.id);
    res.json({locked_until: now() + LOCK_TTL_MS});
});

// ─────────────────────────── GET /api/alternatives ───────────────────────────
// Найти альтернативные свободные слоты

app.get('/api/alternatives', requireAuth, (req, res) => {
    const {room_id, date, duration} = req.query;
    if (!room_id || !date || !duration) {
        return res.status(400).json({error: 'Нужны room_id, date, duration (мин)'});
    }
    const alts = findAlternativeSlots(room_id, date, Number(duration));
    res.json(alts);
});

// ──────────────────────── Регулярные слоты ─────────────────────────────────────────

// GET /api/recurring — список всех регулярных слотов
app.get('/api/recurring', requireAuth, (req, res) => {
    res.json(stmts.findAllRecurring.all());
});

// POST /api/recurring — создать регулярный слот
app.post('/api/recurring', requireAuth, (req, res) => {
    const {room_id, room_name, day_of_week, start_time, end_time,
        purpose, note, is_curriculum, student_visible, created_by} = req.body || {};
    if (!room_id || day_of_week === undefined || !start_time || !end_time) {
        return res.status(400).json({error: 'Обязательные: room_id, day_of_week, start_time, end_time'});
    }
    if (typeof day_of_week !== 'number' || day_of_week < 0 || day_of_week > 6) {
        return res.status(400).json({error: 'day_of_week должен быть числом 0-6'});
    }
    if (timeToMin(start_time) >= timeToMin(end_time)) {
        return res.status(400).json({error: 'Начало должно быть раньше конца'});
    }
    const id = uuid();
    stmts.insertRecurring.run(
        id, room_id, room_name || room_id,
        Number(day_of_week), start_time, end_time,
        purpose || '', note || '',
        is_curriculum ? 1 : 0,
        student_visible !== false ? 1 : 0,
        created_by || '', now(),
    );
    res.status(201).json({id, room_id, room_name: room_name || room_id, day_of_week, start_time, end_time});
});

// DELETE /api/recurring/:id — удалить регулярный слот
app.delete('/api/recurring/:id', requireAuth, (req, res) => {
    stmts.deleteRecurring.run(req.params.id);
    res.json({ok: true});
});

// ──────────────────────── Черновики публикаций ───────────────────────────────────

// GET /api/post-drafts — список черновиков
app.get('/api/post-drafts', requireAuth, (req, res) => {
    const {status} = req.query;
    const rows = stmts.findDraftsByStatus.all({status: status || null});
    res.json(rows);
});

// POST /api/post-drafts — создать черновик
app.post('/api/post-drafts', requireAuth, (req, res) => {
    const {tab, title, body, template_id, image_file_id,
        channel_id, formatted_message, author_id, author_name} = req.body || {};
    if (!tab || !channel_id || !formatted_message || !author_id) {
        return res.status(400).json({error: 'Обязательные: tab, channel_id, formatted_message, author_id'});
    }
    const id = uuid();
    stmts.insertDraft.run(
        id, tab, title || '', body || '', template_id || '', image_file_id || '',
        channel_id, formatted_message, author_id, author_name || '', now(), now(),
    );
    // Уведомляем администраторов о новом черновике
    mm.notifyAdminAboutDraft({id, tab, title, author_name, formatted_message}).catch(console.error);
    res.status(201).json({id, status: 'pending'});
});

// PUT /api/post-drafts/:id/approve — одобрить и опубликовать
app.put('/api/post-drafts/:id/approve', async (req, res) => {
    const draft = stmts.findDraftById.get(req.params.id);
    if (!draft) { return res.status(404).json({error: 'Черновик не найден'}); }
    if (draft.status !== 'pending') {
        return res.status(400).json({error: `Черновик уже обработан: ${draft.status}`});
    }
    try {
        await mm.publishApprovedDraft(draft);
        stmts.updateDraftStatus.run('approved', null, now(), draft.id);
        res.json({ok: true, status: 'approved'});
    } catch (err) {
        res.status(500).json({error: 'Ошибка публикации: ' + (err.message || err)});
    }
});

// PUT /api/post-drafts/:id/reject — отклонить черновик
app.put('/api/post-drafts/:id/reject', async (req, res) => {
    const draft = stmts.findDraftById.get(req.params.id);
    if (!draft) { return res.status(404).json({error: 'Черновик не найден'}); }
    if (draft.status !== 'pending') {
        return res.status(400).json({error: `Черновик уже обработан: ${draft.status}`});
    }
    const {reject_reason} = req.body || {};
    stmts.updateDraftStatus.run('rejected', reject_reason || '', now(), draft.id);
    mm.notifyDraftRejected(draft, reject_reason).catch(console.error);
    res.json({ok: true, status: 'rejected'});
});

// ──────────────────────── Health check ────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ok: true, ts: now()}));

// ─────────────────────────── Cron-задачи ─────────────────────────────────────

// Автоосвобождение устаревших блокировок — каждые 5 минут
cron.schedule('*/5 * * * *', () => {
    stmts.releaseLocks.run(now());
});

// Напоминание об оплате — 18 числа в 10:00 МСК (за 7 дней)
cron.schedule('0 10 18 * *', async () => {
    console.log('[cron] Воркер: напоминание об оплате (18-е число, -7 дней)...');
    try {
        await sendPaymentReminderToStudents('7 дней');
        console.log('[cron] Напоминания (7 дней) завершены');
    } catch (err) {
        console.error('[cron] Ошибка:', err);
    }
});

// Финальное напоминание — 24 числа в 10:00 МСК (за 1 день)
cron.schedule('0 10 24 * *', async () => {
    console.log('[cron] Воркер: напоминание об оплате (24-е число, -1 день)...');
    try {
        await sendPaymentReminderToStudents('1 день', true);
        console.log('[cron] Напоминания (1 день) завершены');
    } catch (err) {
        console.error('[cron] Ошибка:', err);
    }
});

// Еженедельный дайджест для администраторов — каждый понедельник 09:00
cron.schedule('0 9 * * 1', async () => {
    console.log('[cron] Отправка еженедельного дайджеста...');
    try {
        const pending = stmts.findPending.all();
        if (pending.length === 0) { return; }

        const adminIds = await mm.getAdminUserIds();
        const msg = [
            `📊 **Еженедельный отчёт бронирований**`,
            ``,
            `⏳ Ожидают подтверждения: **${pending.length}** заявок`,
            ...pending.slice(0, 5).map((b) =>
                `• ${b.room_name} — ${b.date} ${b.start_time}–${b.end_time} (@${b.user_name})`,
            ),
            pending.length > 5 ? `_...и ещё ${pending.length - 5}_` : '',
            ``,
            `Перейдите в канал #resepchen для обработки.`,
        ].filter(Boolean).join('\n');

        for (const adminId of adminIds) {
            try {
                const dmId = await mm.getDMChannelForAdmin(adminId);
                if (dmId) {
                    await mm.mmRequest('POST', '/api/v4/posts', {channel_id: dmId, message: msg}, process.env.MM_BOT_TOKEN);
                }
            } catch {}
        }
    } catch (err) {
        console.error('[cron] Ошибка дайджеста:', err);
    }
});

// ─────────────────────────── Start ───────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`🏫 Booking Service запущен на порту ${PORT}`);
    console.log(`   Mattermost: ${process.env.MM_SERVER_URL || 'http://localhost:8065'}`);
    console.log(`   База данных: ${process.env.DB_PATH || 'bookings.db'}`);
});
