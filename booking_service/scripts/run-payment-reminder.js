#!/usr/bin/env node
/**
 * Ручной запуск воркера напоминаний об оплате (systemd timer / CI).
 *   node scripts/run-payment-reminder.js        → текст «7 дней»
 *   node scripts/run-payment-reminder.js urgent → «1 день», срочный шаблон
 */
'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env')});

const {sendPaymentReminderToStudents} = require('../jobs/payment_reminder_job');

const urgent = process.argv.includes('urgent');
sendPaymentReminderToStudents(urgent ? '1 день' : '7 дней', urgent)
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
