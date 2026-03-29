// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getActiveServerUrl} from '@init/credentials';
import {getBookingServiceUrl} from '@utils/academy_service';

export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type Booking = {
    id: string;
    room_id: string;
    room_name: string;
    user_id: string;
    user_name: string;
    user_email?: string;
    date: string;
    start_time: string;
    end_time: string;
    purpose?: string;
    is_curriculum: number;
    student_visible?: number;
    status: BookingStatus;
    payment_link?: string;
    reject_reason?: string;
    admin_note?: string;
    created_at: number;
    updated_at: number;
}

export type AlternativeSlot = {
    start: string;
    end: string;
}

export type BookingLogEntry = {
    id: number;
    booking_id: string;
    action: string;
    actor_name: string;
    comment: string;
    created_at: number;
}

export type RoomInfo = {
    id: string;
    name: string;
    area: number;
    floor: number;
    equipment: string[];
    color: string;
    sort_order?: number;
}

export type RecurringSlot = {
    id: string;
    room_id: string;
    room_name: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    purpose?: string;
    note?: string;
    is_curriculum?: number;
    student_visible?: number;
    created_by?: string;
    created_at: number;
}

let roomsCrudSupported: boolean | null = null;

function makeRoomsCrudUnsupportedError() {
    return new Error(
        'Управление классами недоступно: на сервере не включены маршруты /api/rooms. Обновите booking_service на сервере.',
    );
}

const ROOM_FALLBACK_COLORS = [
    '#1a1a35',
    '#2d4a22',
    '#6b3570',
    '#1a3a4a',
    '#8b4513',
    '#3f3f3f',
];

function colorByRoomId(roomId: string) {
    let hash = 0;
    for (let i = 0; i < roomId.length; i++) {
        hash = ((hash << 5) - hash) + roomId.charCodeAt(i);
        hash |= 0;
    }
    return ROOM_FALLBACK_COLORS[Math.abs(hash) % ROOM_FALLBACK_COLORS.length];
}

function deriveRoomsFromBookings(bookings: Booking[]): RoomInfo[] {
    const map = new Map<string, RoomInfo>();
    for (const b of bookings) {
        const roomId = (b.room_id || '').trim();
        if (!roomId || map.has(roomId)) {
            continue;
        }
        map.set(roomId, {
            id: roomId,
            name: (b.room_name || roomId).trim(),
            area: 0,
            floor: 1,
            equipment: [],
            color: colorByRoomId(roomId),
            sort_order: 999,
        });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

async function getRoomsWithFallback(token: string, serverUrl?: string): Promise<RoomInfo[]> {
    try {
        const rooms = await request<RoomInfo[]>('GET', '/api/rooms', undefined, token, serverUrl);
        roomsCrudSupported = true;
        return rooms;
    } catch (e) {
        const status = (e as {status?: number})?.status;
        if (status !== 404) {
            throw e;
        }

        roomsCrudSupported = false;
        const bookings = await request<Booking[]>('GET', '/api/bookings', undefined, token, serverUrl);
        return deriveRoomsFromBookings(Array.isArray(bookings) ? bookings : []);
    }
}

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    serverUrl?: string,
): Promise<T> {
    const base = getBookingServiceUrl(serverUrl);
    let res: Response;
    try {
        res = await fetch(`${base}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? {Authorization: `Bearer ${token}`} : {}),
            },
            ...(body ? {body: JSON.stringify(body)} : {}),
        });
    } catch (e) {
        const hint = e instanceof Error ? e.message : String(e);
        throw new Error(
            `Сервис бронирования недоступен (${base}). Проверьте сеть и что сервис запущен. ${hint}`,
        );
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({error: `HTTP ${res.status}`}));
        throw Object.assign(new Error(err.error || 'Ошибка сервера'), {
            status: res.status,
            alternatives: (err as {alternatives?: AlternativeSlot[]}).alternatives,
        });
    }

    return res.json() as Promise<T>;
}

export const bookingApi = {
    getRooms: (token: string, serverUrl?: string) =>
        getRoomsWithFallback(token, serverUrl),

    getRoomsCrudSupportState: () => roomsCrudSupported,

    createRoom: (
        data: {
            id: string;
            name: string;
            area: number;
            floor: number;
            equipment?: string[] | string;
            color?: string;
            sort_order?: number;
        },
        token: string,
        serverUrl?: string,
    ) => {
        if (roomsCrudSupported === false) {
            return Promise.reject(makeRoomsCrudUnsupportedError());
        }
        return request<RoomInfo>('POST', '/api/rooms', data, token, serverUrl).catch((e: unknown) => {
            if ((e as {status?: number})?.status === 404) {
                roomsCrudSupported = false;
                throw makeRoomsCrudUnsupportedError();
            }
            throw e;
        });
    },

    updateRoom: (
        id: string,
        data: {
            name: string;
            area: number;
            floor: number;
            equipment?: string[] | string;
            color?: string;
            sort_order?: number;
        },
        token: string,
        serverUrl?: string,
    ) => {
        if (roomsCrudSupported === false) {
            return Promise.reject(makeRoomsCrudUnsupportedError());
        }
        return request<RoomInfo>('PUT', `/api/rooms/${encodeURIComponent(id)}`, data, token, serverUrl).catch((e: unknown) => {
            if ((e as {status?: number})?.status === 404) {
                roomsCrudSupported = false;
                throw makeRoomsCrudUnsupportedError();
            }
            throw e;
        });
    },

    deleteRoom: (id: string, token: string, serverUrl?: string) =>
        (roomsCrudSupported === false
            ? Promise.reject(makeRoomsCrudUnsupportedError())
            : request<{ok: boolean}>('DELETE', `/api/rooms/${encodeURIComponent(id)}`, undefined, token, serverUrl).catch((e: unknown) => {
                if ((e as {status?: number})?.status === 404) {
                    roomsCrudSupported = false;
                    throw makeRoomsCrudUnsupportedError();
                }
                throw e;
            })),

    getRecurringSlots: (token: string, serverUrl?: string) =>
        request<RecurringSlot[]>('GET', '/api/recurring', undefined, token, serverUrl),

    createBooking: (data: {
        room_id: string;
        room_name: string;
        user_id: string;
        user_name: string;
        user_email?: string;
        date: string;
        start_time: string;
        end_time: string;
        purpose?: string;
        is_curriculum?: boolean;
    }, token: string, serverUrl?: string) =>
        request<Booking>('POST', '/api/bookings', data, token, serverUrl),

    getMyBookings: (userId: string, token: string, serverUrl?: string) =>
        request<Booking[]>('GET', `/api/bookings/my?user_id=${userId}`, undefined, token, serverUrl),

    getPendingBookings: (token: string, serverUrl?: string) =>
        request<Booking[]>('GET', '/api/bookings/pending', undefined, token, serverUrl),

    getAllBookings: (
        filters: {
            status?: string;
            room_id?: string;
            date?: string;
            date_from?: string;
            date_to?: string;
            student_only?: 0 | 1;
        },
        token: string,
        serverUrl?: string,
    ) => {
        const params = new URLSearchParams(
            Object.fromEntries(
                Object.entries(filters).filter(([, v]) => v !== undefined),
            ),
        ).toString();
        return request<Booking[]>('GET', `/api/bookings?${params}`, undefined, token, serverUrl);
    },

    getRoomSlots: (roomId: string, date: string, token: string, serverUrl?: string) =>
        request<Booking[]>('GET', `/api/rooms/${roomId}/slots?date=${date}`, undefined, token, serverUrl),

    approveBooking: (id: string, data: {
        payment_link?: string;
        admin_note?: string;
        actor_id?: string;
        actor_name?: string;
        student_visible?: boolean | 0 | 1;
    }, token: string, serverUrl?: string) =>
        request<Booking>('PUT', `/api/bookings/${id}/approve`, data, token, serverUrl),

    rejectBooking: (id: string, data: {reject_reason: string; actor_id?: string; actor_name?: string}, token: string, serverUrl?: string) =>
        request<Booking>('PUT', `/api/bookings/${id}/reject`, data, token, serverUrl),

    cancelBooking: (id: string, userId: string, token: string, serverUrl?: string) =>
        request<{ok: boolean}>('DELETE', `/api/bookings/${id}`, {user_id: userId}, token, serverUrl),

    getBookingLog: (id: string, token: string, serverUrl?: string) =>
        request<BookingLogEntry[]>('GET', `/api/bookings/${id}/log`, undefined, token, serverUrl),

    getAlternatives: (roomId: string, date: string, durationMin: number, token: string, serverUrl?: string) =>
        request<AlternativeSlot[]>(
            'GET',
            `/api/alternatives?room_id=${roomId}&date=${date}&duration=${durationMin}`,
            undefined,
            token,
            serverUrl,
        ),
};
