// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {getActiveServerUrl} from '@init/credentials';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {bookingApi, type AlternativeSlot} from './booking_api';

type ClassRoom = {
    id: string;
    name: string;
    area: number;
    floor: number;
}

type Props = {
    room: ClassRoom;
    preselectedDate?: string;
    preselectedStart?: string;
    preselectedEnd?: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userToken: string;
    serverUrl?: string;
    isStaff: boolean;
    theme: Theme;
    onClose: () => void;
    onSuccess: () => void;
}

const TIME_OPTIONS = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: theme.centerChannelBg},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    backBtn: {padding: 4, marginRight: 12},
    headerTitle: {fontSize: 18, fontWeight: '700', color: theme.centerChannelColor, flex: 1},
    scroll: {flex: 1},
    scrollContent: {padding: 20, paddingBottom: 40},
    roomInfo: {
        backgroundColor: changeOpacity(theme.sidebarTextActiveBorder, 0.08),
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity(theme.sidebarTextActiveBorder, 0.2),
    },
    roomInfoText: {marginLeft: 10},
    roomInfoName: {fontSize: 15, fontWeight: '700', color: theme.centerChannelColor},
    roomInfoMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.55), marginTop: 2},
    fieldLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.5),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 10,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: theme.centerChannelColor,
    },
    inputFocused: {borderColor: theme.sidebarTextActiveBorder},
    row: {flexDirection: 'row', gap: 10},
    timeScroll: {},
    timeScrollContent: {gap: 8},
    timeChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.15),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    timeChipSelected: {
        backgroundColor: theme.sidebarTextActiveBorder,
        borderColor: theme.sidebarTextActiveBorder,
    },
    timeChipText: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.65)},
    timeChipTextSelected: {color: '#fff', fontWeight: '600'},
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    switchLabel: {fontSize: 14, color: theme.centerChannelColor, flex: 1, marginRight: 10},
    switchNote: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 4},
    submitBtn: {
        marginTop: 28,
        backgroundColor: theme.buttonBg,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    submitBtnDisabled: {opacity: 0.45},
    submitBtnText: {color: theme.buttonColor, fontSize: 16, fontWeight: '700'},
    altBox: {
        marginTop: 20,
        backgroundColor: changeOpacity('#c4973b', 0.08),
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: changeOpacity('#c4973b', 0.25),
    },
    altTitle: {fontSize: 13, fontWeight: '700', color: '#c4973b', marginBottom: 10},
    altSlot: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity('#c4973b', 0.1),
        borderRadius: 8,
        padding: 10,
        marginBottom: 6,
    },
    altSlotText: {fontSize: 14, fontWeight: '600', color: theme.centerChannelColor, flex: 1},
}));

function TimeSelector({value, onChange, label, theme, style}: {
    value: string;
    onChange: (v: string) => void;
    label: string;
    theme: Theme;
    style: ReturnType<typeof getStyleSheet>;
}) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={style.timeScroll}
            contentContainerStyle={style.timeScrollContent}
        >
            {TIME_OPTIONS.map((t) => (
                <TouchableOpacity
                    key={t}
                    style={[style.timeChip, value === t && style.timeChipSelected]}
                    onPress={() => onChange(t)}
                >
                    <Text style={[style.timeChipText, value === t && style.timeChipTextSelected]}>
                        {t}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

function BookingForm({
    room, preselectedDate, preselectedStart, preselectedEnd,
    userId, userName, userEmail, userToken, serverUrl, isStaff,
    theme, onClose, onSuccess,
}: Props) {
    const style = getStyleSheet(theme);

    const [date, setDate] = useState(preselectedDate || '');
    const [startTime, setStartTime] = useState(preselectedStart || '14:00');
    const [endTime, setEndTime] = useState(preselectedEnd || '15:30');
    const [purpose, setPurpose] = useState('');
    const [isCurriculum, setIsCurriculum] = useState(isStaff);
    const [loading, setLoading] = useState(false);
    const [alternatives, setAlternatives] = useState<AlternativeSlot[]>([]);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const canSubmit = Boolean(date && startTime && endTime && purpose.trim());

    const handleSubmit = useCallback(async () => {
        if (!canSubmit || loading) { return; }
        let resolvedUrl = serverUrl?.trim() || '';
        if (!resolvedUrl) {
            resolvedUrl = (await getActiveServerUrl()) || '';
        }
        if (!resolvedUrl) {
            Alert.alert(
                'Нет адреса сервера',
                'Не удалось определить URL Mattermost. Выйдите и войдите снова или обновите приложение.',
            );
            return;
        }
        setLoading(true);
        setAlternatives([]);
        try {
            await bookingApi.createBooking({
                room_id: room.id,
                room_name: room.name,
                user_id: userId,
                user_name: userName,
                user_email: userEmail,
                date,
                start_time: startTime,
                end_time: endTime,
                purpose,
                is_curriculum: isCurriculum,
            }, userToken, resolvedUrl);

            Alert.alert(
                '✅ Заявка подана',
                'Администратор рассмотрит её и свяжется с вами в личном сообщении.',
                [{text: 'Понятно', onPress: onSuccess}],
            );
        } catch (err: unknown) {
            const error = err as Error & {alternatives?: AlternativeSlot[]};
            if (error.alternatives?.length) {
                setAlternatives(error.alternatives);
            }
            Alert.alert('Не удалось подать заявку', error.message || 'Ошибка сервера');
        } finally {
            setLoading(false);
        }
    }, [canSubmit, loading, room, userId, userName, userEmail, date, startTime, endTime, purpose, isCurriculum, userToken, serverUrl, onSuccess]);

    const applyAlternative = useCallback((alt: AlternativeSlot) => {
        setStartTime(alt.start);
        setEndTime(alt.end);
        setAlternatives([]);
    }, []);

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
                <Text style={style.headerTitle}>{'Заявка на бронирование'}</Text>
            </View>

            <ScrollView
                style={style.scroll}
                contentContainerStyle={style.scrollContent}
                keyboardShouldPersistTaps='handled'
            >
                {/* Карточка класса */}
                <View style={style.roomInfo}>
                    <CompassIcon
                        name='home-variant-outline'
                        size={24}
                        color={theme.sidebarTextActiveBorder}
                    />
                    <View style={style.roomInfoText}>
                        <Text style={style.roomInfoName}>{room.name}</Text>
                        <Text style={style.roomInfoMeta}>{`${room.area} м²  •  ${room.floor} этаж`}</Text>
                    </View>
                </View>

                {/* Дата */}
                <Text style={style.fieldLabel}>{'Дата (ГГГГ-ММ-ДД)'}</Text>
                <TextInput
                    style={[style.input, focusedField === 'date' && style.inputFocused]}
                    value={date}
                    onChangeText={setDate}
                    placeholder='2026-03-25'
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                    keyboardType='numeric'
                    onFocus={() => setFocusedField('date')}
                    onBlur={() => setFocusedField(null)}
                />

                {/* Начало */}
                <Text style={style.fieldLabel}>{'Начало'}</Text>
                <TimeSelector
                    value={startTime}
                    onChange={setStartTime}
                    label='Начало'
                    theme={theme}
                    style={style}
                />

                {/* Конец */}
                <Text style={style.fieldLabel}>{'Конец'}</Text>
                <TimeSelector
                    value={endTime}
                    onChange={setEndTime}
                    label='Конец'
                    theme={theme}
                    style={style}
                />

                {/* Цель */}
                <Text style={style.fieldLabel}>{'Цель занятия'}</Text>
                <TextInput
                    style={[style.input, focusedField === 'purpose' && style.inputFocused, {minHeight: 80, textAlignVertical: 'top'}]}
                    value={purpose}
                    onChangeText={setPurpose}
                    placeholder='Например: самостоятельная работа, подготовка к концерту...'
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                    multiline={true}
                    onFocus={() => setFocusedField('purpose')}
                    onBlur={() => setFocusedField(null)}
                />

                {/* Тип: учебное / внеурочное */}
                <Text style={style.fieldLabel}>{'Тип бронирования'}</Text>
                <View style={style.switchRow}>
                    <View style={{flex: 1}}>
                        <Text style={style.switchLabel}>{'Учебное занятие'}</Text>
                        <Text style={style.switchNote}>
                            {isCurriculum
                                ? 'Бесплатно — в рамках учебного расписания'
                                : '⚠️ Внеурочное — потребуется оплата аренды'}
                        </Text>
                    </View>
                    <Switch
                        value={isCurriculum}
                        onValueChange={setIsCurriculum}
                        trackColor={{false: changeOpacity('#c4973b', 0.4), true: changeOpacity(theme.buttonBg, 0.6)}}
                        thumbColor={isCurriculum ? theme.buttonBg : '#c4973b'}
                    />
                </View>

                {/* Альтернативы при конфликте */}
                {alternatives.length > 0 && (
                    <View style={style.altBox}>
                        <Text style={style.altTitle}>{'⏰ Это время занято. Свободные слоты:'}</Text>
                        {alternatives.map((alt) => (
                            <TouchableOpacity
                                key={`${alt.start}-${alt.end}`}
                                style={style.altSlot}
                                onPress={() => applyAlternative(alt)}
                            >
                                <Text style={style.altSlotText}>{`${alt.start} – ${alt.end}`}</Text>
                                <CompassIcon
                                    name='arrow-right'
                                    size={16}
                                    color={changeOpacity(theme.centerChannelColor, 0.4)}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Кнопка */}
                <TouchableOpacity
                    style={[style.submitBtn, !canSubmit && style.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit || loading}
                >
                    {loading
                        ? <ActivityIndicator color={theme.buttonColor}/>
                        : (
                            <>
                                <CompassIcon
                                    name='send'
                                    size={18}
                                    color={theme.buttonColor}
                                />
                                <Text style={style.submitBtnText}>{'Отправить заявку'}</Text>
                            </>
                        )
                    }
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

export default BookingForm;
