'use strict';

/**
 * База данных SMS Auth Service.
 * Использует встроенный модуль node:sqlite (Node 22.5+, Node 25+).
 */

const {DatabaseSync} = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.SMS_DB_PATH || path.join(__dirname, 'sms_auth.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ─────────────────────────── Схема ───────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS phone_users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone        TEXT NOT NULL UNIQUE,
    mm_user_id   TEXT NOT NULL UNIQUE,
    mm_username  TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_phone_users_phone ON phone_users(phone);
  CREATE INDEX IF NOT EXISTS idx_phone_users_mm    ON phone_users(mm_user_id);

  CREATE TABLE IF NOT EXISTS otp_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone       TEXT NOT NULL,
    code        TEXT NOT NULL,
    sms_id      TEXT,
    attempts    INTEGER DEFAULT 0,
    verified    INTEGER DEFAULT 0,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);

  CREATE TABLE IF NOT EXISTS auth_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone       TEXT NOT NULL,
    mm_user_id  TEXT,
    ip          TEXT,
    result      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

// ─────────────────────────── Запросы ─────────────────────────────────────────

const stmts = {
    upsertPhoneUser: db.prepare(`
        INSERT INTO phone_users (phone, mm_user_id, mm_username, created_at, updated_at)
        VALUES (:phone, :mm_user_id, :mm_username, :now, :now)
        ON CONFLICT(phone) DO UPDATE SET
            mm_user_id  = excluded.mm_user_id,
            mm_username = excluded.mm_username,
            updated_at  = excluded.updated_at
    `),
    findByPhone:   db.prepare('SELECT * FROM phone_users WHERE phone = ?'),
    findByMmId:   db.prepare('SELECT * FROM phone_users WHERE mm_user_id = ?'),
    listAll:      db.prepare('SELECT * FROM phone_users ORDER BY created_at DESC'),
    deletePhone:  db.prepare('DELETE FROM phone_users WHERE phone = ?'),

    insertOtp: db.prepare(`
        INSERT INTO otp_codes (phone, code, sms_id, created_at, expires_at)
        VALUES (:phone, :code, :sms_id, :now, :expires_at)
    `),
    findLatestOtp: db.prepare(`
        SELECT * FROM otp_codes
        WHERE phone = ? AND verified = 0
        ORDER BY created_at DESC LIMIT 1
    `),
    incrementAttempts: db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?'),
    markVerified:      db.prepare('UPDATE otp_codes SET verified = 1 WHERE id = ?'),
    cleanExpired:      db.prepare('DELETE FROM otp_codes WHERE expires_at < ?'),

    logAuth: db.prepare(`
        INSERT INTO auth_log (phone, mm_user_id, ip, result, created_at)
        VALUES (:phone, :mm_user_id, :ip, :result, :now)
    `),
};

module.exports = {db, stmts};
