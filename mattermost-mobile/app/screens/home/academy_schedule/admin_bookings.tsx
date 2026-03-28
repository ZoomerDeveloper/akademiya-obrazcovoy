// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    Switch,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {bookingApi, type Booking} from './booking_api';

type Props = {
    adminId: string;
    adminName: string;
    adminToken: string;
    serverUrl?: string;
    theme: Theme;
    onClose: () => void;
}

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
    headerTitle: {fontSize: 18, fontWeight: '700', color: theme.centerChannelColor, flex: 1},
    pendingBadge: {
        backgroundColor: '#c4973b',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    pendingBadgeText: {fontSize: 11, fontWeight: '700', color: '#fff'},
    list: {flex: 1},
    listContent: {padding: 12, paddingBottom: 32},
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: changeOpacity('#c4973b', 0.3),
    },
    cardRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8},
    roomName: {fontSize: 16, fontWeight: '700', color: theme.centerChannelColor},
    dateTime: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.55), marginTop: 2},
    requesterRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6},
    requesterText: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.65)},
    purposeRow: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 10,
        marginTop: 8,
    },
    purposeText: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.7), lineHeight: 19},
    typeBadge: {
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    typeBadgeText: {fontSize: 11, fontWeight: '700'},
    actionRow: {flexDirection: 'row', gap: 10, marginTop: 14},
    rejectBtn: {
        flex: 1,
        backgroundColor: changeOpacity('#d24b4e', 0.08),
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity('#d24b4e', 0.2),
    },
    rejectBtnText: {color: '#d24b4e', fontWeight: '600', fontSize: 14},
    approveBtn: {
        flex: 1,
        backgroundColor: changeOpacity('#3db887', 0.1),
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity('#3db887', 0.25),
    },
    approveBtnText: {color: '#3db887', fontWeight: '600', fontSize: 14},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40},
    emptyTitle: {fontSize: 16, fontWeight: '600', color: changeOpacity(theme.centerChannelColor, 0.4), marginTop: 12},
    emptySubtitle: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.3), textAlign: 'center', marginTop: 6},
    loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    modalOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
    },
    modalTitle: {fontSize: 16, fontWeight: '700', color: theme.centerChannelColor, marginBottom: 14},
    modalInput: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 10,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        padding: 12,
        fontSize: 14,
        color: theme.centerChannelColor,
        minHeight: 80,
        textAlignVertical: 'top',
        marginBottom: 14,
    },
    modalConfirm: {
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 8,
    },
    modalConfirmText: {fontWeight: '700', fontSize: 15},
    modalCancel: {paddingVertical: 12, alignItems: 'center'},
    modalCancelText: {color: changeOpacity(theme.centerChannelColor, 0.45), fontSize: 14},
    visibilityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
    },
    visibilityLabel: {fontSize: 13, color: theme.centerChannelColor, flex: 1, marginRight: 8},
    visibilityHint: {fontSize: 11, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 4},
}));

function AdminBookingCard({booking, adminId, adminName, adminToken, serverUrl, theme, onRefresh}: {
    booking: Booking;
    adminId: string;
    adminName: string;
    adminToken: string;
    serverUrl?: string;
    theme: Theme;
    onRefresh: () => void;
}) {
    const style = getStyleSheet(theme);
    const [processing, setProcessing] = useState(false);
    const [showRejectSheet, setShowRejectSheet] = useState(false);
    const [showApproveSheet, setShowApproveSheet] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [paymentLink, setPaymentLink] = useState('');
    const [adminNote, setAdminNote] = useState('');
    const [studentVisible, setStudentVisible] = useState((booking.student_visible ?? 1) === 1);

    const isOffCurriculum = !booking.is_curriculum;
    const isBadge = isOffCurriculum
        ? {bg: changeOpacity('#c4973b', 0.15), text: '#c4973b', label: '💳 Внеурочное'}
        : {bg: changeOpacity('#3db887', 0.12), text: '#3db887', label: '📚 Учебное'};

    const handleApprove = useCallback(async () => {
        setProcessing(true);
        try {
            await bookingApi.approveBooking(booking.id, {
                payment_link: isOffCurriculum ? paymentLink : undefined,
                admin_note: adminNote,
                actor_id: adminId,
                actor_name: adminName,
                student_visible: studentVisible,
            }, adminToken, serverUrl);
            setShowApproveSheet(false);
            onRefresh();
        } catch (err: unknown) {
            Alert.alert('Ошибка', (err as Error).message);
        } finally {
            setProcessing(false);
        }
    }, [booking.id, isOffCurriculum, paymentLink, adminNote, adminId, adminName, adminToken, serverUrl, onRefresh]);

    const handleReject = useCallback(async () => {
        if (!rejectReason.trim()) {
            Alert.alert('Укажите причину отклонения');
            return;
        }
        setProcessing(true);
        try {
            await bookingApi.rejectBooking(booking.id, {
                reject_reason: rejectReason,
                actor_id: adminId,
                actor_name: adminName,
            }, adminToken, serverUrl);
            setShowRejectSheet(false);
            onRefresh();
        } catch (err: unknown) {
            Alert.alert('Ошибка', (err as Error).message);
        } finally {
            setProcessing(false);
        }
    }, [booking.id, rejectReason, adminId, adminName, adminToken, serverUrl, onRefresh]);

    return (
        <View>
            <View style={style.card}>
                <View style={style.cardRow}>
                    <View style={{flex: 1}}>
                        <Text style={style.roomName}>{booking.room_name}</Text>
                        <Text style={style.dateTime}>
                            {`${booking.date}  ·  ${booking.start_time} – ${booking.end_time}`}
                        </Text>
                    </View>
                    <View style={[style.typeBadge, {backgroundColor: isBadge.bg}]}>
                        <Text style={[style.typeBadgeText, {color: isBadge.text}]}>{isBadge.label}</Text>
                    </View>
                </View>

                <View style={style.requesterRow}>
                    <CompassIcon
                        name='account-outline'
                        size={14}
                        color={changeOpacity(theme.centerChannelColor, 0.5)}
                    />
                    <Text style={style.requesterText}>{`@${booking.user_name}`}</Text>
                </View>

                {Boolean(booking.purpose) && (
                    <View style={style.purposeRow}>
                        <Text style={style.purposeText}>{booking.purpose}</Text>
                    </View>
                )}

                <View style={style.actionRow}>
                    <TouchableOpacity
                        style={style.rejectBtn}
                        onPress={() => setShowRejectSheet(true)}
                        disabled={processing}
                    >
                        <Text style={style.rejectBtnText}>{'✕  Отклонить'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={style.approveBtn}
                        onPress={() => setShowApproveSheet(true)}
                        disabled={processing}
                    >
                        {processing
                            ? <ActivityIndicator size='small' color='#3db887'/>
                            : <Text style={style.approveBtnText}>{'✓  Одобрить'}</Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>

            {/* Sheet: отклонение */}
            {showRejectSheet && (
                <View style={style.modalOverlay}>
                    <View style={style.modalSheet}>
                        <Text style={style.modalTitle}>{'Причина отклонения'}</Text>
                        <TextInput
                            style={style.modalInput}
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            placeholder='Например: время зарезервировано для экзамена...'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            multiline
                            autoFocus
                        />
                        <TouchableOpacity
                            style={[style.modalConfirm, {backgroundColor: changeOpacity('#d24b4e', 0.12)}]}
                            onPress={handleReject}
                        >
                            <Text style={[style.modalConfirmText, {color: '#d24b4e'}]}>{'Отклонить заявку'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={style.modalCancel}
                            onPress={() => setShowRejectSheet(false)}
                        >
                            <Text style={style.modalCancelText}>{'Отмена'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Sheet: одобрение */}
            {showApproveSheet && (
                <View style={style.modalOverlay}>
                    <View style={style.modalSheet}>
                        <Text style={style.modalTitle}>{'Одобрение заявки'}</Text>
                        <View style={style.visibilityRow}>
                            <View style={{flex: 1}}>
                                <Text style={style.visibilityLabel}>{'Показывать в студенческом расписании'}</Text>
                                <Text style={style.visibilityHint}>
                                    {studentVisible ? 'Студенты увидят это бронирование.' : 'Скрыто для студентов (только staff).'}
                                </Text>
                            </View>
                            <Switch
                                value={studentVisible}
                                onValueChange={setStudentVisible}
                                trackColor={{false: changeOpacity('#d24b4e', 0.35), true: changeOpacity('#3db887', 0.45)}}
                                thumbColor={studentVisible ? '#3db887' : '#d24b4e'}
                            />
                        </View>
                        {isOffCurriculum && (
                            <>
                                <Text style={{fontSize: 13, color: '#c4973b', marginBottom: 8}}>
                                    {'⚠️ Внеурочное бронирование — укажите ссылку на оплату аренды:'}
                                </Text>
                                <TextInput
                                    style={[style.modalInput, {minHeight: 44}]}
                                    value={paymentLink}
                                    onChangeText={setPaymentLink}
                                    placeholder='https://...'
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                                    keyboardType='url'
                                    autoCapitalize='none'
                                />
                            </>
                        )}
                        <TextInput
                            style={[style.modalInput, {minHeight: 60}]}
                            value={adminNote}
                            onChangeText={setAdminNote}
                            placeholder='Примечание для заявителя (необязательно)...'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                            multiline
                        />
                        <TouchableOpacity
                            style={[style.modalConfirm, {backgroundColor: changeOpacity('#3db887', 0.12)}]}
                            onPress={handleApprove}
                        >
                            <Text style={[style.modalConfirmText, {color: '#3db887'}]}>{'Одобрить заявку'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={style.modalCancel}
                            onPress={() => setShowApproveSheet(false)}
                        >
                            <Text style={style.modalCancelText}>{'Отмена'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

function AdminBookingsScreen({adminId, adminName, adminToken, serverUrl, theme, onClose}: Props) {
    const style = getStyleSheet(theme);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBookings = useCallback(async () => {
        setLoading(true);
        try {
            const list = await bookingApi.getPendingBookings(adminToken, serverUrl);
            setBookings(list);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [adminToken, serverUrl]);

    useEffect(() => { loadBookings(); }, [loadBookings]);

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
                <Text style={style.headerTitle}>{'Заявки на бронирование'}</Text>
                {bookings.length > 0 && (
                    <View style={style.pendingBadge}>
                        <Text style={style.pendingBadgeText}>{bookings.length}</Text>
                    </View>
                )}
            </View>

            {loading ? (
                <View style={style.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            ) : (
                <FlatList
                    style={style.list}
                    contentContainerStyle={[style.listContent, bookings.length === 0 && {flex: 1}]}
                    data={bookings}
                    keyExtractor={(b) => b.id}
                    renderItem={({item}) => (
                        <AdminBookingCard
                            booking={item}
                            adminId={adminId}
                            adminName={adminName}
                            adminToken={adminToken}
                            serverUrl={serverUrl}
                            theme={theme}
                            onRefresh={loadBookings}
                        />
                    )}
                    onRefresh={loadBookings}
                    refreshing={loading}
                    ListEmptyComponent={
                        <View style={style.empty}>
                            <CompassIcon
                                name='check-all'
                                size={52}
                                color={changeOpacity(theme.centerChannelColor, 0.2)}
                            />
                            <Text style={style.emptyTitle}>{'Всё обработано!'}</Text>
                            <Text style={style.emptySubtitle}>{'Новых заявок на бронирование нет'}</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

export default AdminBookingsScreen;
