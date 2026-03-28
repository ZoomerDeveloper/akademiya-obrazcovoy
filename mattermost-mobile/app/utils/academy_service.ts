// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

function resolveHost(serverUrl?: string) {
    try {
        if (!serverUrl) {
            return {protocol: 'http:', host: 'localhost'};
        }
        const parsed = new URL(serverUrl);
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

/** Booking API: dev — `:3001`; production — `{origin}/booking-service` (nginx → :3001). */
export function getBookingServiceUrl(serverUrl?: string) {
    try {
        if (!serverUrl) {
            return 'http://localhost:3001';
        }
        const parsed = new URL(serverUrl);
        const hostname = parsed.hostname;
        const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
        const port = parsed.port;

        const useDedicatedPort =
            isLoopback ||
            (port !== '' && port !== '443' && port !== '80');

        if (useDedicatedPort) {
            const proto = parsed.protocol || 'http:';
            return `${proto}//${hostname}:3001`;
        }

        return `${parsed.origin}/booking-service`;
    } catch {
        return 'http://localhost:3001';
    }
}

/** SMS Auth: dev — `:3002`; production — `{origin}/sms-auth-service` (nginx → :3002). */
export function getSmsAuthServiceUrl(serverUrl?: string) {
    try {
        if (!serverUrl) {
            return 'http://localhost:3002';
        }
        const parsed = new URL(serverUrl);
        const hostname = parsed.hostname;
        const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
        const port = parsed.port;

        const useDedicatedPort =
            isLoopback ||
            (port !== '' && port !== '443' && port !== '80');

        if (useDedicatedPort) {
            const proto = parsed.protocol || 'http:';
            return `${proto}//${hostname}:3002`;
        }

        return `${parsed.origin}/sms-auth-service`;
    } catch {
        return 'http://localhost:3002';
    }
}
