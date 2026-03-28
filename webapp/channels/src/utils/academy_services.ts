// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/** Базовый URL SMS Auth (локально 3002). В production задайте window.ACADEMY_SMS_AUTH_URL в root.html. */
export function getSmsAuthBaseUrl(): string {
    if (typeof window !== 'undefined') {
        const w = window as Window & {ACADEMY_SMS_AUTH_URL?: string};
        if (w.ACADEMY_SMS_AUTH_URL && String(w.ACADEMY_SMS_AUTH_URL).trim()) {
            return String(w.ACADEMY_SMS_AUTH_URL).replace(/\/$/, '');
        }
    }
    return 'http://localhost:3002';
}
