'use strict';

/**
 * База данных сервиса бронирования.
 * Использует встроенный модуль node:sqlite (Node 22.5+, Node 25+).
 * Не требует компиляции native addon.
 */

const {DatabaseSync} = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bookings.db');
const db = new DatabaseSync(DB_PATH);

// WAL-режим и foreign keys через exec (pragma недоступен напрямую)
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ─────────────────────────── Миграция ────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL,
    room_name   TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    user_email  TEXT,
    date        TEXT NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    purpose     TEXT,
    is_curriculum INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'pending',
    payment_link TEXT,
    reject_reason TEXT,
    admin_note  TEXT,
    locked_until INTEGER DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_room_date
    ON bookings(room_id, date);

  CREATE INDEX IF NOT EXISTS idx_bookings_user
    ON bookings(user_id);

  CREATE INDEX IF NOT EXISTS idx_bookings_status
    ON bookings(status);

  CREATE TABLE IF NOT EXISTS booking_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id  TEXT NOT NULL,
    action      TEXT NOT NULL,
    actor_id    TEXT,
    actor_name  TEXT,
    comment     TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  CREATE INDEX IF NOT EXISTS idx_log_booking
    ON booking_log(booking_id);
`);

// Миграция: видимость в студенческом расписании (аренда / партнёры — student_visible = 0)
const bookingCols = db.prepare('PRAGMA table_info(bookings)').all();
const hasStudentVisible = bookingCols.some((c) => c.name === 'student_visible');
if (!hasStudentVisible) {
    db.exec('ALTER TABLE bookings ADD COLUMN student_visible INTEGER NOT NULL DEFAULT 1');
}

// Регулярные слоты (еженедельная занятость классов)
db.exec(`
  CREATE TABLE IF NOT EXISTS recurring_bookings (
    id            TEXT PRIMARY KEY,
    room_id       TEXT NOT NULL,
    room_name     TEXT NOT NULL,
    day_of_week   INTEGER NOT NULL, -- 0=Пн, 1=Вт, ... 6=Вс
    start_time    TEXT NOT NULL,
    end_time      TEXT NOT NULL,
    purpose       TEXT,
    note          TEXT,
    is_curriculum INTEGER DEFAULT 1,
    student_visible INTEGER DEFAULT 1,
    created_by    TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rec_room ON recurring_bookings(room_id);
  CREATE INDEX IF NOT EXISTS idx_rec_day  ON recurring_bookings(day_of_week);
`);

// Черновики публикаций (workflow согласования педагог → руководство)
db.exec(`
  CREATE TABLE IF NOT EXISTS post_drafts (
    id               TEXT PRIMARY KEY,
    tab              TEXT NOT NULL,
    title            TEXT,
    body             TEXT,
    template_id      TEXT,
    image_file_id    TEXT,
    channel_id       TEXT,
    formatted_message TEXT,
    author_id        TEXT,
    author_name      TEXT,
    status           TEXT DEFAULT 'pending',
    reject_reason    TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drafts_status ON post_drafts(status);
`);

// ─────────────────────────── Подготовленные запросы ──────────────────────────
// node:sqlite использует :param вместо @param

const stmts = {
    insert: db.prepare(`
        INSERT INTO bookings
          (id, room_id, room_name, user_id, user_name, user_email,
           date, start_time, end_time, purpose, is_curriculum, student_visible,
           status, created_at, updated_at)
        VALUES
          (:id, :room_id, :room_name, :user_id, :user_name, :user_email,
           :date, :start_time, :end_time, :purpose, :is_curriculum, :student_visible,
           'pending', :now, :now)
    `),

    findById: db.prepare('SELECT * FROM bookings WHERE id = ?'),

    findByRoomDate: db.prepare(`
        SELECT * FROM bookings
        WHERE room_id = ? AND date = ?
          AND status IN ('pending','approved')
        ORDER BY start_time
    `),

    findByUser: db.prepare(`
        SELECT * FROM bookings
        WHERE user_id = ?
        ORDER BY date DESC, start_time DESC
        LIMIT 50
    `),

    findPending: db.prepare(`
        SELECT * FROM bookings
        WHERE status = 'pending'
        ORDER BY created_at ASC
    `),

    findAll: db.prepare(`
        SELECT * FROM bookings
        WHERE (:status IS NULL OR status = :status)
          AND (:room_id IS NULL OR room_id = :room_id)
          AND (:date IS NULL OR date = :date)
        ORDER BY date DESC, start_time DESC
        LIMIT 100
    `),

    /** Занятость для календаря: только активные слоты, диапазон дат YYYY-MM-DD */
    findByDateRangeOccupancy: db.prepare(`
        SELECT * FROM bookings
        WHERE date >= :date_from
          AND date <= :date_to
          AND status IN ('pending', 'approved')
          AND (:room_id IS NULL OR room_id = :room_id)
          AND (
            :student_only = 0
            OR COALESCE(student_visible, 1) = 1
          )
        ORDER BY date ASC, start_time ASC
        LIMIT 500
    `),

    approve: db.prepare(`
        UPDATE bookings
        SET status = 'approved',
            payment_link = :payment_link,
            admin_note = :admin_note,
            updated_at = :updated_at,
            student_visible = COALESCE(:vis_override, student_visible)
        WHERE id = :id
    `),

    reject: db.prepare(`
        UPDATE bookings
        SET status = 'rejected', reject_reason = ?, updated_at = ?
        WHERE id = ?
    `),

    cancel: db.prepare(`
        UPDATE bookings
        SET status = 'cancelled', updated_at = ?
        WHERE id = ? AND user_id = ?
    `),

    lockSlot: db.prepare(`
        UPDATE bookings
        SET locked_until = ?
        WHERE id = ?
    `),

    releaseLocks: db.prepare(`
        UPDATE bookings
        SET locked_until = 0
        WHERE locked_until > 0 AND locked_until < ?
    `),

    checkConflict: db.prepare(`
        SELECT COUNT(*) as cnt FROM bookings
        WHERE room_id = ?
          AND date = ?
          AND status IN ('approved','pending')
          AND id != ?
          AND start_time < ?
          AND end_time > ?
    `),

    occupiedSlots: db.prepare(`
        SELECT start_time, end_time FROM bookings
        WHERE room_id = ? AND date = ?
          AND status IN ('approved','pending')
        ORDER BY start_time
    `),

    logAction: db.prepare(`
        INSERT INTO booking_log (booking_id, action, actor_id, actor_name, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `),

    getLog: db.prepare(`
        SELECT * FROM booking_log
        WHERE booking_id = ?
        ORDER BY created_at ASC
    `),

    // ─── Регулярные слоты ────────────────────────────────────────────────────
    insertRecurring: db.prepare(`
        INSERT INTO recurring_bookings
          (id, room_id, room_name, day_of_week, start_time, end_time,
           purpose, note, is_curriculum, student_visible, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    findAllRecurring: db.prepare(`
        SELECT * FROM recurring_bookings ORDER BY day_of_week, start_time
    `),

    deleteRecurring: db.prepare(`
        DELETE FROM recurring_bookings WHERE id = ?
    `),

    // ─── Черновики публикаций ────────────────────────────────────────────────
    insertDraft: db.prepare(`
        INSERT INTO post_drafts
          (id, tab, title, body, template_id, image_file_id, channel_id,
           formatted_message, author_id, author_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `),

    findDraftsByStatus: db.prepare(`
        SELECT * FROM post_drafts
        WHERE (:status IS NULL OR status = :status)
        ORDER BY created_at DESC
        LIMIT 100
    `),

    findDraftById: db.prepare(`SELECT * FROM post_drafts WHERE id = ?`),

    updateDraftStatus: db.prepare(`
        UPDATE post_drafts
        SET status = ?, reject_reason = ?, updated_at = ?
        WHERE id = ?
    `),
};

module.exports = {db, stmts};
