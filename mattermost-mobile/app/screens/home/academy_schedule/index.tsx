// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Экран «Занятость Академии»
 * Референс: приложение студии S17
 *
 * Раздел «Классы»:
 *   - Список классов с метражом и оборудованием
 *   - Нажатие → сетка занятости на неделю
 *   - Кнопка «Подать заявку» для свободных слотов
 *
 * Раздел «Актовый зал»:
 *   - Только просмотр (read-only calendar)
 *   - Бронирование зала — лично через руководство
 */

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useResolvedServerUrl} from '@hooks/use_resolved_server_url';
import {useTheme} from '@context/theme';
import {getServerCredentials} from '@init/credentials';
import {observeCurrentUser} from '@queries/servers/user';
import {getAcademyRoleFlags} from '@utils/academy_roles';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import AdminBookingsScreen from './admin_bookings';
import {bookingApi, type Booking, type RecurringSlot} from './booking_api';
import BookingForm from './booking_form';
import MyBookingsScreen from './my_bookings';
import RoomsAdminScreen from './rooms_admin';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

// ─────────────────────────── Данные классов ──────────────────────────────────

type ClassRoom = {
    id: string;
    name: string;
    area: number;
    floor: number;
    equipment: string[];
    color: string;
}

const CLASSROOMS: ClassRoom[] = [
    {id: 'r1', name: 'Класс № 1', area: 24, floor: 1, equipment: ['Рояль Steinway', 'Зеркала', 'Балетный станок'], color: '#1a1a35'},
    {id: 'r2', name: 'Класс № 2', area: 18, floor: 1, equipment: ['Пианино Yamaha', 'Музыкальный центр'], color: '#2d4a22'},
    {id: 'r3', name: 'Класс № 3', area: 30, floor: 2, equipment: ['Рояль Bösendorfer', 'Проектор', 'Экран'], color: '#8b4513'},
    {id: 'r4', name: 'Класс № 4', area: 20, floor: 2, equipment: ['Пианино Kawai', 'Синтезатор'], color: '#6b3570'},
    {id: 'r5', name: 'Класс № 5', area: 22, floor: 3, equipment: ['Рояль Steinway Junior', 'Звукоизоляция'], color: '#1a3a4a'},
    {id: 'r6', name: 'Репетиционный зал', area: 45, floor: 1, equipment: ['Ударная установка', 'Усилители', 'Микрофоны'], color: '#3a1a1a'},
];

// ─────────────────────────── Данные расписания Актового зала ─────────────────

type HallEvent = {
    id: string;
    title: string;
    date: string;
    time: string;
    durationMin: number;
    type: 'concert' | 'masterclass' | 'exam' | 'rental';
    isPublic: boolean;
}

const HALL_EVENTS: HallEvent[] = [
    {id: 'e1', title: 'Весенний концерт студентов', date: '15 марта', time: '19:00', durationMin: 120, type: 'concert', isPublic: true},
    {id: 'e2', title: 'Мастер-класс по вокалу', date: '20 марта', time: '14:00', durationMin: 90, type: 'masterclass', isPublic: true},
    {id: 'e3', title: 'Академический экзамен', date: '22 марта', time: '10:00', durationMin: 180, type: 'exam', isPublic: false},
    {id: 'e4', title: 'Аренда (частное мероприятие)', date: '23 марта', time: '18:00', durationMin: 240, type: 'rental', isPublic: false},
    {id: 'e5', title: 'Концерт конкурсантов', date: '1 апреля', time: '17:00', durationMin: 150, type: 'concert', isPublic: true},
    {id: 'e6', title: 'Открытый урок — класс Ивановой', date: '5 апреля', time: '15:00', durationMin: 60, type: 'masterclass', isPublic: true},
];

const FILTERS_CACHE = {
    calendarView: 'week' as 'week' | 'month',
    floorFilter: 'all' as 'all' | 1 | 2 | 3,
    hallTypeFilter: 'all' as 'all' | HallEvent['type'],
    durationFilter: 'all' as 'all' | 'short' | 'medium' | 'long',
};

// ─────────────────────────── Сетка занятости класса ─────────────────────────

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

type SlotStatus = 'free' | 'occupied' | 'my';

/** Локальная календарная дата YYYY-MM-DD (без сдвига UTC). */
function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDaysDate(d: Date, days: number): Date {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy;
}

/** Понедельник той же календарной недели (пн–вс), локальная полночь не нужна — только дата */
function getWeekMonday(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
}

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function endOfHourSlot(startTime: string): string {
    const endMin = timeToMinutes(startTime) + 60;
    const eh = Math.floor(endMin / 60);
    const em = endMin % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function rangesOverlap(a0: string, a1: string, b0: string, b1: string): boolean {
    return timeToMinutes(a0) < timeToMinutes(b1) && timeToMinutes(a1) > timeToMinutes(b0);
}

/** Пн=0 … Вс=6, как в recurring_bookings.day_of_week */
function dayOfWeekMon0(d: Date): number {
    return (d.getDay() + 6) % 7;
}

function buildWeekSchedule(
    roomId: string,
    userId: string,
    weekMonday: Date,
    bookings: Booking[],
    recurring: RecurringSlot[],
): Record<string, SlotStatus> {
    const schedule: Record<string, SlotStatus> = {};
    const now = new Date();
    const today = toISODate(now);
    const currentTimeMin = timeToMinutes(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);

    for (let di = 0; di < WEEK_DAYS.length; di++) {
        const dayDate = addDaysDate(weekMonday, di);
        const dateStr = toISODate(dayDate);
        const dow = dayOfWeekMon0(dayDate);

        for (const time of TIME_SLOTS) {
            const key = `${WEEK_DAYS[di]}-${time}`;
            const slotEnd = endOfHourSlot(time);
            const slotStartMin = timeToMinutes(time);
            
            // Проверяем, прошел ли уже этот слот
            const isPassed = dateStr === today && currentTimeMin >= slotStartMin;
            
            let hasMy = false;
            let hasOcc = false;

            for (const b of bookings) {
                if (b.room_id !== roomId || b.date !== dateStr) {
                    continue;
                }
                if (b.status !== 'pending' && b.status !== 'approved') {
                    continue;
                }
                if (rangesOverlap(b.start_time, b.end_time, time, slotEnd)) {
                    if (b.user_id === userId) {
                        hasMy = true;
                    } else {
                        hasOcc = true;
                    }
                }
            }

            for (const r of recurring) {
                if (r.room_id !== roomId || r.day_of_week !== dow) {
                    continue;
                }
                if (rangesOverlap(r.start_time, r.end_time, time, slotEnd)) {
                    hasOcc = true;
                }
            }

            if (isPassed) {
                schedule[key] = 'occupied';
            } else if (hasMy) {
                schedule[key] = 'my';
            } else if (hasOcc) {
                schedule[key] = 'occupied';
            } else {
                schedule[key] = 'free';
            }
        }
    }
    return schedule;
}

// Генерируем случайное расписание для демо (fallback)
function generateSchedule(roomId: string): Record<string, SlotStatus> {
    const seed = roomId.charCodeAt(1);
    const schedule: Record<string, SlotStatus> = {};
    WEEK_DAYS.forEach((day, di) => {
        TIME_SLOTS.forEach((time, ti) => {
            const key = `${day}-${time}`;
            const val = (seed + di * 7 + ti * 3) % 5;
            schedule[key] = val < 2 ? 'occupied' : val === 2 ? 'my' : 'free';
        });
    });
    return schedule;
}

// ─────────────────────────── Стили ───────────────────────────────────────────

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: changeOpacity(theme.centerChannelColor, 0.02)},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
    },
    headerLabel: {
        fontSize: 11,
        color: changeOpacity(theme.centerChannelColor, 0.45),
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 2,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: theme.centerChannelColor,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tab: {paddingVertical: 12, marginRight: 24},
    tabActive: {borderBottomWidth: 2, borderBottomColor: theme.sidebarTextActiveBorder},
    tabText: {fontSize: 14, fontWeight: '500', color: changeOpacity(theme.centerChannelColor, 0.45)},
    tabTextActive: {color: theme.centerChannelColor, fontWeight: '600'},
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    chipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    chipActive: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    chipTextActive: {
        color: theme.buttonColor,
    },
    scroll: {flex: 1},
    scrollContent: {padding: 12, paddingBottom: 32},
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 10,
        marginTop: 4,
        marginHorizontal: 4,
    },
    // Карточка класса (S17-стиль: название, метраж, оборудование)
    roomCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14,
        marginBottom: 10,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    roomAccent: {
        width: 4,
        borderTopLeftRadius: 14,
        borderBottomLeftRadius: 14,
    },
    roomBody: {
        flex: 1,
        padding: 14,
    },
    roomHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    roomName: {fontSize: 16, fontWeight: '700', color: theme.centerChannelColor},
    roomMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 3},
    roomEquipment: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
        gap: 6,
    },
    equipTag: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    equipTagText: {fontSize: 11, color: changeOpacity(theme.centerChannelColor, 0.6)},
    // Карточка события Актового зала
    hallCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14,
        marginBottom: 10,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    hallDateBox: {
        width: 48,
        height: 48,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.sidebarTextActiveBorder, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    hallDate: {fontSize: 11, fontWeight: '700', color: theme.sidebarTextActiveBorder, textAlign: 'center', lineHeight: 14},
    hallInfo: {flex: 1},
    hallTitle: {fontSize: 14, fontWeight: '600', color: theme.centerChannelColor},
    hallTime: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 2},
    hallBadge: {
        borderRadius: 5,
        paddingHorizontal: 7,
        paddingVertical: 2,
        marginLeft: 8,
    },
    hallBadgeText: {fontSize: 10, fontWeight: '600'},
    infoBanner: {
        backgroundColor: changeOpacity(theme.sidebarTextActiveBorder, 0.08),
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: changeOpacity(theme.sidebarTextActiveBorder, 0.15),
    },
    infoBannerText: {
        flex: 1,
        marginLeft: 10,
        fontSize: 13,
        color: changeOpacity(theme.centerChannelColor, 0.7),
        lineHeight: 19,
    },
}));

// ─────────────────────────── Сетка класса (модал) ────────────────────────────

const getGridStyle = makeStyleSheetFromTheme((theme: Theme) => ({
    modalContainer: {flex: 1, backgroundColor: theme.centerChannelBg},
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    modalBackBtn: {padding: 4, marginRight: 10},
    modalTitle: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '700',
        color: theme.centerChannelColor,
        flexShrink: 1,
    },
    modalMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5)},
    legend: {flexDirection: 'row', padding: 14, gap: 16},
    legendItem: {flexDirection: 'row', alignItems: 'center', gap: 6},
    legendDot: {width: 12, height: 12, borderRadius: 3},
    legendText: {fontSize: 11, color: changeOpacity(theme.centerChannelColor, 0.6)},
    gridScroll: {flex: 1},
    gridScrollContent: {paddingBottom: 20},
    grid: {flexDirection: 'column'},
    dayHeaderRow: {flexDirection: 'row', marginBottom: 4},
    dayHeader: {
        width: 56,
        alignItems: 'center',
        paddingVertical: 6,
    },
    dayHeaderText: {fontSize: 12, fontWeight: '600', color: changeOpacity(theme.centerChannelColor, 0.5)},
    row: {flexDirection: 'row', alignItems: 'center', marginBottom: 2},
    timeLabel: {
        width: 56,
        position: 'absolute',
        left: -56,
        alignItems: 'flex-end',
        paddingRight: 12,
    },
    timeLabelText: {fontSize: 10, color: changeOpacity(theme.centerChannelColor, 0.4)},
    slot: {
        width: 52,
        height: 34,
        borderRadius: 6,
        marginHorizontal: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    slotFree: {backgroundColor: changeOpacity('#3db887', 0.15), borderWidth: 1, borderColor: changeOpacity('#3db887', 0.3)},
    slotOccupied: {backgroundColor: changeOpacity(theme.centerChannelColor, 0.08)},
    slotMy: {backgroundColor: changeOpacity(theme.sidebarTextActiveBorder, 0.2), borderWidth: 1, borderColor: changeOpacity(theme.sidebarTextActiveBorder, 0.4)},
    slotFreeText: {fontSize: 9, color: '#3db887', fontWeight: '600'},
    requestBtn: {
        margin: 16,
        backgroundColor: theme.buttonBg,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    requestBtnText: {color: theme.buttonColor, fontSize: 16, fontWeight: '700'},
}));

function RoomScheduleModal({room, onClose, theme, onRequestSlot, serverUrl, sessionToken, userId}: {
    room: ClassRoom;
    onClose: () => void;
    theme: Theme;
    onRequestSlot: (r: ClassRoom, slot?: {date: string; start?: string; end?: string}) => void;
    serverUrl?: string;
    sessionToken: string;
    userId: string;
}) {
    const style = getGridStyle(theme);
    const [weekOffset, setWeekOffset] = useState(0);
    const weekMonday = useMemo(() => {
        const base = getWeekMonday(new Date());
        return addDaysDate(base, weekOffset * 7);
    }, [weekOffset]);

    const [schedule, setSchedule] = useState<Record<string, SlotStatus>>(() => generateSchedule(room.id));
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionToken) {
            setSchedule(generateSchedule(room.id));
            setLoadError(null);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const mon = weekMonday;
                const sat = addDaysDate(mon, 5);
                const from = toISODate(mon);
                const to = toISODate(sat);
                const [bookings, recurring] = await Promise.all([
                    bookingApi.getAllBookings(
                        {room_id: room.id, date_from: from, date_to: to, student_only: 0},
                        sessionToken,
                        serverUrl,
                    ),
                    bookingApi.getRecurringSlots(sessionToken, serverUrl),
                ]);
                if (cancelled) {
                    return;
                }
                const rec = Array.isArray(recurring) ? recurring.filter((x) => x.room_id === room.id) : [];
                const rows = Array.isArray(bookings) ? bookings : [];
                setSchedule(buildWeekSchedule(room.id, userId, mon, rows, rec));
            } catch (e) {
                if (!cancelled) {
                    setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки');
                    setSchedule(generateSchedule(room.id));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [room.id, serverUrl, sessionToken, userId, weekMonday]);

    const weekLabel = useMemo(() => {
        const a = toISODate(weekMonday);
        const b = toISODate(addDaysDate(weekMonday, 5));
        return `${a.slice(8, 10)}.${a.slice(5, 7)} — ${b.slice(8, 10)}.${b.slice(5, 7)}`;
    }, [weekMonday]);

    const handleCellPress = useCallback((dayIndex: number, time: string) => {
        const dateStr = toISODate(addDaysDate(weekMonday, dayIndex));
        onRequestSlot(room, {date: dateStr, start: time, end: endOfHourSlot(time)});
    }, [onRequestSlot, room, weekMonday]);

    return (
        <SafeAreaView style={style.modalContainer}>
            <View style={style.modalHeader}>
                <TouchableOpacity
                    style={style.modalBackBtn}
                    onPress={onClose}
                >
                    <CompassIcon
                        name='arrow-left'
                        size={22}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <View style={{flex: 1}}>
                    <Text
                        style={style.modalTitle}
                        numberOfLines={2}
                    >
                        {room.name}
                    </Text>
                    <Text style={style.modalMeta}>{`${room.area} м²  •  ${room.floor} этаж  •  ${weekLabel}`}</Text>
                </View>
            </View>

            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 16}}>
                <TouchableOpacity
                    onPress={() => setWeekOffset((w) => w - 1)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                >
                    <CompassIcon
                        name='chevron-left'
                        size={22}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <Text style={{fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.55)}}>
                    {'Неделя'}
                </Text>
                <TouchableOpacity
                    onPress={() => setWeekOffset((w) => w + 1)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                >
                    <CompassIcon
                        name='chevron-right'
                        size={22}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
            </View>

            <View style={style.legend}>
                {loading && (
                    <ActivityIndicator
                        size='small'
                        color={theme.sidebarTextActiveBorder}
                        style={{marginRight: 8}}
                    />
                )}
                <View style={style.legendItem}>
                    <View style={[style.legendDot, {backgroundColor: changeOpacity('#3db887', 0.4)}]}/>
                    <Text style={style.legendText}>{'Свободно'}</Text>
                </View>
                <View style={style.legendItem}>
                    <View style={[style.legendDot, {backgroundColor: changeOpacity(theme.centerChannelColor, 0.15)}]}/>
                    <Text style={style.legendText}>{'Занято'}</Text>
                </View>
                <View style={style.legendItem}>
                    <View style={[style.legendDot, {backgroundColor: changeOpacity(theme.sidebarTextActiveBorder, 0.4)}]}/>
                    <Text style={style.legendText}>{'Мои занятия'}</Text>
                </View>
            </View>
            {loadError ? (
                <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
                    <Text style={{fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.55)}}>
                        {loadError}
                    </Text>
                </View>
            ) : null}

            <ScrollView
                style={style.gridScroll}
                contentContainerStyle={style.gridScrollContent}
                horizontal={false}
            >
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{paddingLeft: 64}}
                >
                    <View style={style.grid}>
                        <View style={style.dayHeaderRow}>
                            {WEEK_DAYS.map((day, di) => {
                                const d = addDaysDate(weekMonday, di);
                                const dd = String(d.getDate()).padStart(2, '0');
                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                return (
                                    <View
                                        key={day}
                                        style={style.dayHeader}
                                    >
                                        <Text style={style.dayHeaderText}>{day}</Text>
                                        <Text style={{fontSize: 10, color: changeOpacity(theme.centerChannelColor, 0.35)}}>
                                            {`${dd}.${mm}`}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                        {TIME_SLOTS.map((time) => (
                            <View
                                key={time}
                                style={style.row}
                            >
                                <View style={style.timeLabel}>
                                    <Text style={style.timeLabelText}>{time}</Text>
                                </View>
                                {WEEK_DAYS.map((day, di) => {
                                    const key = `${day}-${time}`;
                                    const status = schedule[key];
                                    const isFree = status === 'free';
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            style={[
                                                style.slot,
                                                status === 'free' && style.slotFree,
                                                status === 'occupied' && style.slotOccupied,
                                                status === 'my' && style.slotMy,
                                            ]}
                                            onPress={isFree ? () => handleCellPress(di, time) : undefined}
                                            activeOpacity={isFree ? 0.7 : 1}
                                            disabled={!isFree}
                                        >
                                            {isFree && <Text style={style.slotFreeText}>{'+'}</Text>}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </ScrollView>

            <TouchableOpacity
                style={style.requestBtn}
                onPress={() => onRequestSlot(room)}
            >
                <Text style={style.requestBtnText}>{'Подать заявку на занятие'}</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

// ─────────────────────────── Основной экран ──────────────────────────────────

type Props = {
    currentUser?: UserModel;
}

function AcademyScheduleScreen({currentUser}: Props) {
    const theme = useTheme();
    const serverUrl = useResolvedServerUrl();
    const insets = useSafeAreaInsets();
    const style = getStyleSheet(theme);

    const [activeTab, setActiveTab] = useState<'classrooms' | 'hall'>('classrooms');
    const [calendarView, setCalendarView] = useState<'week' | 'month'>(FILTERS_CACHE.calendarView);
    const [floorFilter, setFloorFilter] = useState<'all' | 1 | 2 | 3>(FILTERS_CACHE.floorFilter);
    const [hallTypeFilter, setHallTypeFilter] = useState<'all' | HallEvent['type']>(FILTERS_CACHE.hallTypeFilter);
    const [durationFilter, setDurationFilter] = useState<'all' | 'short' | 'medium' | 'long'>(FILTERS_CACHE.durationFilter);
    const [selectedRoom, setSelectedRoom] = useState<ClassRoom | null>(null);
    const [showBookingForm, setShowBookingForm] = useState(false);
    const [showMyBookings, setShowMyBookings] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [showRoomsAdmin, setShowRoomsAdmin] = useState(false);
    const [bookingRoom, setBookingRoom] = useState<ClassRoom | null>(null);
    const [bookingFormSlot, setBookingFormSlot] = useState<{date: string; start?: string; end?: string} | null>(null);
    const [classrooms, setClassrooms] = useState<ClassRoom[]>(CLASSROOMS);

    const roleFlags = useMemo(() => getAcademyRoleFlags(currentUser?.roles), [currentUser?.roles]);
    const isStaff = roleFlags.isStaff;

    const [sessionToken, setSessionToken] = useState((currentUser as UserModel & {token?: string})?.token || '');
    const userId = currentUser?.id || '';
    const userName = currentUser?.username || '';
    const userEmail = currentUser?.email || '';
    const [hallApiEvents, setHallApiEvents] = useState<HallEvent[]>([]);

    useEffect(() => {
        let cancelled = false;
        const loadCredentials = async () => {
            const credentials = await getServerCredentials(serverUrl);
            if (!cancelled) {
                setSessionToken(credentials?.token || (currentUser as UserModel & {token?: string})?.token || '');
            }
        };
        loadCredentials();
        return () => {
            cancelled = true;
        };
    }, [serverUrl, currentUser]);

    const reloadClassrooms = useCallback(async () => {
        if (!sessionToken) {
            return;
        }
        try {
            const rows = await bookingApi.getRooms(sessionToken, serverUrl);
            if (!Array.isArray(rows)) {
                setClassrooms(CLASSROOMS);
                return;
            }
            if (rows.length === 0) {
                setClassrooms([]);
                return;
            }
            setClassrooms(
                rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    area: r.area,
                    floor: r.floor,
                    equipment: Array.isArray(r.equipment) ? r.equipment : [],
                    color: r.color || '#555555',
                })),
            );
        } catch {
            setClassrooms(CLASSROOMS);
        }
    }, [sessionToken, serverUrl]);

    useEffect(() => {
        reloadClassrooms();
    }, [reloadClassrooms]);

    useEffect(() => {
        FILTERS_CACHE.calendarView = calendarView;
        FILTERS_CACHE.floorFilter = floorFilter;
        FILTERS_CACHE.hallTypeFilter = hallTypeFilter;
        FILTERS_CACHE.durationFilter = durationFilter;
    }, [calendarView, floorFilter, hallTypeFilter, durationFilter]);

    const mapBookingToHallType = (booking: Booking): HallEvent['type'] => {
        const text = `${booking.purpose || ''} ${booking.room_name || ''}`.toLowerCase();
        if (text.includes('мастер') || text.includes('урок')) {
            return 'masterclass';
        }
        if (text.includes('экзам')) {
            return 'exam';
        }
        if (text.includes('аренд')) {
            return 'rental';
        }
        return 'concert';
    };

    const dateToLabel = (dateRaw: string) => {
        const d = new Date(dateRaw);
        if (Number.isNaN(d.getTime())) {
            return dateRaw;
        }
        return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'});
    };

    useEffect(() => {
        if (!sessionToken) {
            setHallApiEvents([]);
            return;
        }
        let cancelled = false;
        const loadHallEvents = async () => {
            try {
                const from = new Date();
                const to = calendarView === 'week' ? addDaysDate(from, 6) : addDaysDate(from, 30);
                const rows = await bookingApi.getAllBookings(
                    {
                        status: 'approved',
                        date_from: toISODate(from),
                        date_to: toISODate(to),
                        student_only: isStaff ? 0 : 1,
                    },
                    sessionToken,
                    serverUrl,
                );
                if (cancelled || !Array.isArray(rows)) {
                    return;
                }
                const hallRows = rows.filter((b) => /актов|hall|зал/i.test(`${b.room_name || ''} ${b.room_id || ''}`));
                const mapped: HallEvent[] = hallRows.map((b) => {
                    const startM = Number((b.start_time || '00:00').split(':')[0]) * 60 + Number((b.start_time || '00:00').split(':')[1]);
                    const endM = Number((b.end_time || '00:00').split(':')[0]) * 60 + Number((b.end_time || '00:00').split(':')[1]);
                    const duration = Math.max(30, endM - startM);
                    const type = mapBookingToHallType(b);
                    return {
                        id: b.id,
                        title: b.purpose || b.room_name || 'Бронирование',
                        date: dateToLabel(b.date),
                        time: b.start_time,
                        durationMin: duration,
                        type,
                        isPublic: (b.student_visible ?? 1) === 1,
                    };
                });
                setHallApiEvents(mapped.length ? mapped : []);
            } catch {
                // fallback to demo events
                if (!cancelled) {
                    setHallApiEvents([]);
                }
            }
        };
        loadHallEvents();
        return () => {
            cancelled = true;
        };
    }, [calendarView, isStaff, sessionToken, serverUrl]);

    const filteredClassrooms = useMemo(() => {
        if (floorFilter === 'all') {
            return classrooms;
        }
        return classrooms.filter((room) => room.floor === floorFilter);
    }, [classrooms, floorFilter]);

    const visibleHallEvents = useMemo(() => {
        const source = hallApiEvents.length > 0 ? hallApiEvents : HALL_EVENTS;
        let events = source.filter((event) => {
            const typeOk = hallTypeFilter === 'all' || event.type === hallTypeFilter;
            let durationOk = true;
            if (durationFilter === 'short') {
                durationOk = event.durationMin <= 60;
            } else if (durationFilter === 'medium') {
                durationOk = event.durationMin > 60 && event.durationMin <= 120;
            } else if (durationFilter === 'long') {
                durationOk = event.durationMin > 120;
            }
            return typeOk && durationOk;
        });
        if (calendarView === 'week') {
            events = events.slice(0, 3);
        }
        return events;
    }, [calendarView, durationFilter, hallApiEvents, hallTypeFilter]);

    const openBookingForm = useCallback((room: ClassRoom, slot?: {date: string; start?: string; end?: string}) => {
        setBookingRoom(room);
        if (slot) {
            setBookingFormSlot(slot);
        } else {
            setBookingFormSlot({date: toISODate(new Date())});
        }
        setSelectedRoom(null);
        setShowBookingForm(true);
    }, []);

    const getEventBadge = (type: HallEvent['type']) => {
        const map = {
            concert: {bg: '#1a1a35', text: 'Концерт'},
            masterclass: {bg: '#2d4a22', text: 'Мастер-класс'},
            exam: {bg: '#6b3570', text: 'Экзамен'},
            rental: {bg: '#555', text: 'Аренда'},
        };
        return map[type];
    };

    return (
        <View style={[style.container, {paddingTop: insets.top}]}>
            {/* Шапка */}
            <View style={style.header}>
                <View style={{flex: 1, minWidth: 0, paddingRight: 8}}>
                    <Text style={style.headerLabel}>{'Академия'}</Text>
                    <Text style={style.headerTitle}>{'Занятость'}</Text>
                </View>
                <View style={style.headerActions}>
                    <TouchableOpacity
                        onPress={() => setShowMyBookings(true)}
                        style={{padding: 8}}
                        accessibilityLabel='Мои заявки'
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    >
                        <CompassIcon
                            name='playlist-check'
                            size={22}
                            color={changeOpacity(theme.centerChannelColor, 0.6)}
                        />
                    </TouchableOpacity>
                    {isStaff && (
                        <>
                            <TouchableOpacity
                                onPress={() => setShowRoomsAdmin(true)}
                                style={{padding: 8}}
                                accessibilityLabel='Справочник классов'
                                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            >
                                <CompassIcon
                                    name='home-variant-outline'
                                    size={22}
                                    color={changeOpacity(theme.centerChannelColor, 0.6)}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setShowAdminPanel(true)}
                                style={{padding: 8}}
                                accessibilityLabel='Заявки администратора'
                                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            >
                                <CompassIcon
                                    name='application-cog'
                                    size={22}
                                    color={changeOpacity(theme.centerChannelColor, 0.6)}
                                />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {/* Табы */}
            <View style={style.tabRow}>
                {[
                    {key: 'classrooms', label: 'Классы'},
                    {key: 'hall', label: 'Актовый зал'},
                ] .map(({key, label}) => (
                    <TouchableOpacity
                        key={key}
                        style={[style.tab, activeTab === key && style.tabActive]}
                        onPress={() => setActiveTab(key as 'classrooms' | 'hall')}
                    >
                        <Text style={[style.tabText, activeTab === key && style.tabTextActive]}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView
                style={style.scroll}
                contentContainerStyle={[
                    style.scrollContent,
                    {paddingBottom: Math.max(insets.bottom, 12) + 56},
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={style.controlsRow}>
                    <View style={style.chipsRow}>
                        {[
                            {key: 'week', label: 'Неделя'},
                            {key: 'month', label: 'Месяц'},
                        ].map((item) => {
                            const active = calendarView === item.key;
                            return (
                                <TouchableOpacity
                                    key={item.key}
                                    style={[style.chip, active && style.chipActive]}
                                    onPress={() => setCalendarView(item.key as 'week' | 'month')}
                                >
                                    <Text style={[style.chipText, active && style.chipTextActive]}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {activeTab === 'classrooms' && (
                        <View style={style.chipsRow}>
                            {[
                                {key: 'all', label: 'Все этажи'},
                                {key: 1, label: '1'},
                                {key: 2, label: '2'},
                                {key: 3, label: '3'},
                            ].map((item) => {
                                const active = floorFilter === item.key;
                                return (
                                    <TouchableOpacity
                                        key={String(item.key)}
                                        style={[style.chip, active && style.chipActive]}
                                        onPress={() => setFloorFilter(item.key as 'all' | 1 | 2 | 3)}
                                    >
                                        <Text style={[style.chipText, active && style.chipTextActive]}>
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                    {activeTab === 'hall' && (
                        <View style={style.chipsRow}>
                            {[
                                {key: 'all', label: 'Все'},
                                {key: 'concert', label: 'Концерты'},
                                {key: 'masterclass', label: 'МК'},
                                {key: 'exam', label: 'Экзамены'},
                                {key: 'rental', label: 'Аренда'},
                            ].map((item) => {
                                const active = hallTypeFilter === item.key;
                                return (
                                    <TouchableOpacity
                                        key={item.key}
                                        style={[style.chip, active && style.chipActive]}
                                        onPress={() => setHallTypeFilter(item.key as 'all' | HallEvent['type'])}
                                    >
                                        <Text style={[style.chipText, active && style.chipTextActive]}>
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
                {activeTab === 'hall' && (
                    <View style={[style.controlsRow, {marginTop: -2}]}>
                        <View style={style.chipsRow}>
                            {[
                                {key: 'all', label: 'Любая длительность'},
                                {key: 'short', label: 'до 60 мин'},
                                {key: 'medium', label: '60–120 мин'},
                                {key: 'long', label: '120+ мин'},
                            ].map((item) => {
                                const active = durationFilter === item.key;
                                return (
                                    <TouchableOpacity
                                        key={item.key}
                                        style={[style.chip, active && style.chipActive]}
                                        onPress={() => setDurationFilter(item.key as 'all' | 'short' | 'medium' | 'long')}
                                    >
                                        <Text style={[style.chipText, active && style.chipTextActive]}>
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}
                {activeTab === 'classrooms' ? (
                    <>
                        <Text style={style.sectionLabel}>
                            {calendarView === 'week' ? 'Нажми на класс — увидишь сетку занятости на неделю' : 'Выбран месячный режим (список классов с фильтрами)'}
                        </Text>
                        {filteredClassrooms.map((room) => (
                            <TouchableOpacity
                                key={room.id}
                                style={style.roomCard}
                                onPress={() => setSelectedRoom(room)}
                                activeOpacity={0.8}
                            >
                                <View style={[style.roomAccent, {backgroundColor: room.color}]}/>
                                <View style={style.roomBody}>
                                    <View style={style.roomHeader}>
                                        <Text style={style.roomName}>{room.name}</Text>
                                        <CompassIcon
                                            name='chevron-right'
                                            size={18}
                                            color={changeOpacity(theme.centerChannelColor, 0.35)}
                                        />
                                    </View>
                                    <Text style={style.roomMeta}>
                                        {`${room.area} м²  •  ${room.floor} этаж`}
                                    </Text>
                                    <View style={style.roomEquipment}>
                                        {room.equipment.map((eq) => (
                                            <View
                                                key={eq}
                                                style={style.equipTag}
                                            >
                                                <Text style={style.equipTagText}>{eq}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {filteredClassrooms.length === 0 && (
                            <View style={style.infoBanner}>
                                <CompassIcon
                                    name='information-outline'
                                    size={20}
                                    color={theme.sidebarTextActiveBorder}
                                />
                                <Text style={style.infoBannerText}>
                                    {'По выбранному этажу классы не найдены.'}
                                </Text>
                            </View>
                        )}
                    </>
                ) : (
                    <>
                        {/* Информационный баннер — Актовый зал только для просмотра */}
                        <View style={style.infoBanner}>
                            <CompassIcon
                                name='information-outline'
                                size={20}
                                color={theme.sidebarTextActiveBorder}
                            />
                            <Text style={style.infoBannerText}>
                                {'Бронирование Актового зала — только лично через руководство Академии. Это расписание только для ознакомления.'}
                            </Text>
                        </View>

                        <Text style={style.sectionLabel}>
                            {calendarView === 'week' ? 'Ближайшие события (неделя)' : 'События на месяц'}
                        </Text>
                        {visibleHallEvents.map((event) => {
                            const badge = getEventBadge(event.type);
                            const [day, month] = event.date.split(' ');
                            return (
                                <View
                                    key={event.id}
                                    style={style.hallCard}
                                >
                                    <View style={style.hallDateBox}>
                                        <Text style={style.hallDate}>{`${day}\n${month}`}</Text>
                                    </View>
                                    <View style={style.hallInfo}>
                                        <Text style={style.hallTitle}>{event.title}</Text>
                                        <Text style={style.hallTime}>{`${event.time}  ·  ${event.durationMin} мин`}</Text>
                                    </View>
                                    {(isStaff || event.isPublic) && (
                                        <View style={[style.hallBadge, {backgroundColor: badge.bg + '22'}]}>
                                            <Text style={[style.hallBadgeText, {color: badge.bg}]}>
                                                {badge.text}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        {visibleHallEvents.length === 0 && (
                            <View style={style.infoBanner}>
                                <CompassIcon
                                    name='information-outline'
                                    size={20}
                                    color={theme.sidebarTextActiveBorder}
                                />
                                <Text style={style.infoBannerText}>
                                    {'По выбранным фильтрам событий не найдено.'}
                                </Text>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Сетка занятости (S17-стиль) */}
            {selectedRoom && (
                <Modal
                    visible={true}
                    animationType='slide'
                    presentationStyle='fullScreen'
                >
                    <RoomScheduleModal
                        room={selectedRoom}
                        onClose={() => setSelectedRoom(null)}
                        theme={theme}
                        serverUrl={serverUrl}
                        sessionToken={sessionToken}
                        userId={userId}
                        onRequestSlot={(room, slot) => openBookingForm(room, slot)}
                    />
                </Modal>
            )}

            {/* Форма заявки на бронирование */}
            {showBookingForm && bookingRoom && (
                <Modal
                    visible={true}
                    animationType='slide'
                    presentationStyle='fullScreen'
                >
                    <BookingForm
                        key={`${bookingRoom.id}-${bookingFormSlot?.date}-${bookingFormSlot?.start}-${bookingFormSlot?.end}`}
                        room={bookingRoom}
                        preselectedDate={bookingFormSlot?.date ?? new Date().toISOString().slice(0, 10)}
                        preselectedStart={bookingFormSlot?.start}
                        preselectedEnd={bookingFormSlot?.end}
                        userId={userId}
                        userName={userName}
                        userEmail={userEmail}
                        userToken={sessionToken}
                        serverUrl={serverUrl}
                        isStaff={isStaff}
                        theme={theme}
                        onClose={() => setShowBookingForm(false)}
                        onSuccess={() => {
                            setShowBookingForm(false);
                            setShowMyBookings(true);
                        }}
                    />
                </Modal>
            )}

            {/* Мои заявки */}
            {showMyBookings && (
                <Modal
                    visible={true}
                    animationType='slide'
                    presentationStyle='fullScreen'
                >
                    <MyBookingsScreen
                        userId={userId}
                        userToken={sessionToken}
                        serverUrl={serverUrl}
                        isStaff={isStaff}
                        theme={theme}
                        onClose={() => setShowMyBookings(false)}
                    />
                </Modal>
            )}

            {/* Справочник классов (только для staff) */}
            {showRoomsAdmin && isStaff && (
                <Modal
                    visible={true}
                    animationType='slide'
                    presentationStyle='fullScreen'
                >
                    <RoomsAdminScreen
                        userToken={sessionToken}
                        serverUrl={serverUrl}
                        theme={theme}
                        onClose={() => setShowRoomsAdmin(false)}
                        onSaved={reloadClassrooms}
                    />
                </Modal>
            )}

            {/* Admin-панель заявок (только для staff) */}
            {showAdminPanel && isStaff && (
                <Modal
                    visible={true}
                    animationType='slide'
                    presentationStyle='fullScreen'
                >
                    <AdminBookingsScreen
                        adminId={userId}
                        adminName={userName}
                        adminToken={sessionToken}
                        serverUrl={serverUrl}
                        theme={theme}
                        onClose={() => setShowAdminPanel(false)}
                    />
                </Modal>
            )}
        </View>
    );
}

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhance(AcademyScheduleScreen));
