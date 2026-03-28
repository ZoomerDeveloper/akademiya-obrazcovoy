// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {bookingApi, type Booking, type BookingStatus} from './booking_api';

type Props = {
    userId: string;
    userToken: string;
    serverUrl?: string;
    isStaff: boolean;
    theme: Theme;
    onClose: () => void;
}

const STATUS_META: Record<BookingStatus, {label: string; color: string; icon: string}> = {
    pending: {label: 'На рассмотрении', color: '#c4973b', icon: 'clock-outline'},
    approved: {label: 'Одобрено', color: '#3db887', icon: 'check-circle-outline'},
    rejected: {label: 'Отклонено', color: '#d24b4e', icon: 'close-circle-outline'},
    cancelled: {label: 'Отменено', color: '#888', icon: 'cancel'},
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: changeOpacity(theme.centerChannelColor, 0.02)},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    backBtn: {padding: 4, marginRight: 12},
    headerTitle: {fontSize: 18, fontWeight: '700', color: theme.centerChannelColor},
    list: {flex: 1},
    listContent: {padding: 12, paddingBottom: 32},
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardTop: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10},
    cardInfo: {flex: 1},
    roomName: {fontSize: 15, fontWeight: '700', color: theme.centerChannelColor},
    dateTime: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.6), marginTop: 3},
    purpose: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.45), marginTop: 3},
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        gap: 4,
    },
    statusText: {fontSize: 12, fontWeight: '600'},
    divider: {height: StyleSheet.hairlineWidth, backgroundColor: changeOpacity(theme.centerChannelColor, 0.08), marginBottom: 10},
    noteRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 6},
    noteText: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.6), flex: 1, lineHeight: 18},
    paymentBtn: {
        marginTop: 10,
        backgroundColor: changeOpacity('#c4973b', 0.1),
        borderRadius: 8,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: changeOpacity('#c4973b', 0.25),
    },
    paymentBtnText: {fontSize: 13, fontWeight: '600', color: '#c4973b', flex: 1},
    cancelBtn: {
        marginTop: 8,
        padding: 8,
        alignItems: 'center',
    },
    cancelBtnText: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.45)},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40},
    emptyText: {fontSize: 15, color: changeOpacity(theme.centerChannelColor, 0.4), textAlign: 'center', marginTop: 12},
    loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
}));

function BookingCard({booking, userId, userToken, serverUrl, theme, onRefresh}: {
    booking: Booking;
    userId: string;
    userToken: string;
    serverUrl?: string;
    theme: Theme;
    onRefresh: () => void;
}) {
    const style = getStyleSheet(theme);
    const meta = STATUS_META[booking.status];

    const handleCancel = useCallback(() => {
        Alert.alert(
            'Отменить заявку?',
            `${booking.room_name}\n${booking.date} · ${booking.start_time}–${booking.end_time}`,
            [
                {text: 'Нет', style: 'cancel'},
                {
                    text: 'Да, отменить',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await bookingApi.cancelBooking(booking.id, userId, userToken, serverUrl);
                            onRefresh();
                        } catch (err: unknown) {
                            Alert.alert('Ошибка', (err as Error).message);
                        }
                    },
                },
            ],
        );
    }, [booking, userId, userToken, serverUrl, onRefresh]);

    return (
        <View style={style.card}>
            <View style={style.cardTop}>
                <View style={style.cardInfo}>
                    <Text style={style.roomName}>{booking.room_name}</Text>
                    <Text style={style.dateTime}>
                        {`${booking.date}  ·  ${booking.start_time} – ${booking.end_time}`}
                    </Text>
                    {Boolean(booking.purpose) && (
                        <Text
                            style={style.purpose}
                            numberOfLines={1}
                        >
                            {booking.purpose}
                        </Text>
                    )}
                </View>
                <View style={[style.statusBadge, {backgroundColor: meta.color + '18'}]}>
                    <CompassIcon
                        name={meta.icon}
                        size={14}
                        color={meta.color}
                    />
                    <Text style={[style.statusText, {color: meta.color}]}>{meta.label}</Text>
                </View>
            </View>

            {/* Доп. информация */}
            {Boolean(booking.admin_note || booking.reject_reason) && (
                <>
                    <View style={style.divider}/>
                    <View style={style.noteRow}>
                        <CompassIcon
                            name='information-outline'
                            size={14}
                            color={changeOpacity(theme.centerChannelColor, 0.4)}
                        />
                        <Text style={style.noteText}>
                            {booking.reject_reason || booking.admin_note}
                        </Text>
                    </View>
                </>
            )}

            {/* Ссылка на оплату */}
            {booking.status === 'approved' && !booking.is_curriculum && booking.payment_link && (
                <TouchableOpacity style={style.paymentBtn}>
                    <CompassIcon
                        name='credit-card-outline'
                        size={18}
                        color='#c4973b'
                    />
                    <Text style={style.paymentBtnText}>{'Оплатить аренду класса'}</Text>
                    <CompassIcon
                        name='open-in-new'
                        size={14}
                        color='#c4973b'
                    />
                </TouchableOpacity>
            )}

            {/* Отмена (только pending) */}
            {booking.status === 'pending' && (
                <TouchableOpacity
                    style={style.cancelBtn}
                    onPress={handleCancel}
                >
                    <Text style={style.cancelBtnText}>{'Отменить заявку'}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function MyBookingsScreen({userId, userToken, serverUrl, isStaff, theme, onClose}: Props) {
    const style = getStyleSheet(theme);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBookings = useCallback(async () => {
        setLoading(true);
        try {
            const list = await bookingApi.getMyBookings(userId, userToken, serverUrl);
            setBookings(list);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [userId, userToken, serverUrl]);

    useEffect(() => { loadBookings(); }, [loadBookings]);

    const renderItem = useCallback(({item}: {item: Booking}) => (
        <BookingCard
            booking={item}
            userId={userId}
            userToken={userToken}
            serverUrl={serverUrl}
            theme={theme}
            onRefresh={loadBookings}
        />
    ), [userId, userToken, serverUrl, theme, loadBookings]);

    return (
        <SafeAreaView style={style.container}>
            <View style={style.header}>
                <TouchableOpacity
                    style={style.backBtn}
                    onPress={onClose}
                >
                    <CompassIcon
                        name='arrow-left'
                        size={22}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <Text style={style.headerTitle}>{'Мои заявки'}</Text>
            </View>

            {loading ? (
                <View style={style.loading}>
                    <ActivityIndicator
                        size='large'
                        color={theme.buttonBg}
                    />
                </View>
            ) : (
                <FlatList
                    style={style.list}
                    contentContainerStyle={[style.listContent, bookings.length === 0 && {flex: 1}]}
                    data={bookings}
                    keyExtractor={(b) => b.id}
                    renderItem={renderItem}
                    onRefresh={loadBookings}
                    refreshing={loading}
                    ListEmptyComponent={
                        <View style={style.empty}>
                            <CompassIcon
                                name='calendar-outline'
                                size={52}
                                color={changeOpacity(theme.centerChannelColor, 0.2)}
                            />
                            <Text style={style.emptyText}>{'Заявок пока нет.\nПодай первую через экран классов!'}</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

export default MyBookingsScreen;
