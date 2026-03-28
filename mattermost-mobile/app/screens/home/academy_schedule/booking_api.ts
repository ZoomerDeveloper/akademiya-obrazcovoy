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
        request<RoomInfo[]>('GET', '/api/rooms', undefined, token, serverUrl),

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
    ) => request<RoomInfo>('POST', '/api/rooms', data, token, serverUrl),

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
    ) => request<RoomInfo>('PUT', `/api/rooms/${encodeURIComponent(id)}`, data, token, serverUrl),

    deleteRoom: (id: string, token: string, serverUrl?: string) =>
        request<{ok: boolean}>('DELETE', `/api/rooms/${encodeURIComponent(id)}`, undefined, token, serverUrl),

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
