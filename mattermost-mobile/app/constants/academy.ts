// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Прод Mattermost (экран сервера, дефолты). Меняете домен — правите здесь.
 */
export const ACADEMY_DEFAULT_SERVER_URL = 'https://vm268473.hosted-by-robovps.ru';
export const ACADEMY_DEFAULT_SERVER_NAME = 'Академия Образцовой';

const academyOrigin = ACADEMY_DEFAULT_SERVER_URL.replace(/\/$/, '');

/**
 * База API бронирования в проде (nginx `location /booking-service/` → localhost:3001).
 * Используется всегда, если из приложения не пришёл валидный URL сервера.
 */
export const ACADEMY_BOOKING_SERVICE_URL = `${academyOrigin}/booking-service`;

/** База SMS-auth в проде (`/sms-auth-service/` → :3002). */
export const ACADEMY_SMS_AUTH_SERVICE_URL = `${academyOrigin}/sms-auth-service`;
