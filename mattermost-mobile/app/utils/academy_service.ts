// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ACADEMY_BOOKING_SERVICE_URL, ACADEMY_SMS_AUTH_SERVICE_URL} from '@constants/academy';

/**
 * В БД/Keychain иногда лежит хост без схемы (`example.com`). `new URL('example.com')` бросает —
 * тогда booking API получал пустой base и показывал «Не удалось определить адрес сервера».
 */
export function normalizeAcademyServerUrl(raw: string): string {
    const t = raw.trim();
    if (!t) {
        return '';
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(t)) {
        return t;
    }
    return `https://${t.replace(/^\/+/, '')}`;
}

function resolveHost(serverUrl?: string) {
    try {
        if (!serverUrl) {
            return {protocol: 'http:', host: 'localhost'};
        }
        const parsed = new URL(normalizeAcademyServerUrl(serverUrl));
        return {
            protocol: parsed.protocol || 'http:',
            host: parsed.hostname || 'localhost',
        };
    } catch {
        return {protocol: 'http:', host: 'localhost'};
    }
}

export function getAcademyServiceBaseUrl(serverUrl: string | undefined, port: number) {
    const {protocol, host} = resolveHost(serverUrl);
    return `${protocol}//${host}:${port}`;
}

/**
 * База booking API (без завершающего /).
 * - localhost / 127.0.0.1 → `:3001` для разработки.
 * - Иначе, если передан валидный URL Mattermost → `{origin}/booking-service`.
 * - Иначе → `ACADEMY_BOOKING_SERVICE_URL` из `@constants/academy` (один явный прод-путь).
 */
export function getBookingServiceUrl(serverUrl?: string): string {
    const raw = typeof serverUrl === 'string' ? serverUrl.trim() : '';
    if (raw) {
        try {
            const parsed = new URL(normalizeAcademyServerUrl(raw));
            const hostname = parsed.hostname;
            const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

            if (isLoopback) {
                const proto = parsed.protocol || 'http:';
                return `${proto}//${hostname}:3001`;
            }

            return `${parsed.origin}/booking-service`;
        } catch {
            /* ниже — прод по константе */
        }
    }
    return ACADEMY_BOOKING_SERVICE_URL;
}

/** SMS Auth: локально `:3002`; иначе `{origin}/sms-auth-service`; иначе константа прод. */
export function getSmsAuthServiceUrl(serverUrl?: string): string {
    const raw = typeof serverUrl === 'string' ? serverUrl.trim() : '';
    if (raw) {
        try {
            const parsed = new URL(normalizeAcademyServerUrl(raw));
            const hostname = parsed.hostname;
            const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

            if (isLoopback) {
                const proto = parsed.protocol || 'http:';
                return `${proto}//${hostname}:3002`;
            }

            return `${parsed.origin}/sms-auth-service`;
        } catch {
            /* прод */
        }
    }
    return ACADEMY_SMS_AUTH_SERVICE_URL;
}
