// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Личный кабинет пользователя
 * Референс: приложение клиник «Будь здоров» + Campus
 *
 * При открытии — персонализированная «Главная» посадочная страница:
 *   - Фото профиля, имя, роль
 *   - Ближайшие занятия (расписание на неделю)
 *   - Быстрые действия
 *   - Блок уведомлений/важного
 */

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    Alert,
    DeviceEventEmitter,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {logout} from '@actions/remote/session';
import {Events, Launch, Screens} from '@constants';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useResolvedServerUrl} from '@hooks/use_resolved_server_url';
import {useTheme} from '@context/theme';
import {getServerCredentials} from '@init/credentials';
import AdminPanelScreen from '../admin_panel';
import {bookingApi, type Booking} from '../academy_schedule/booking_api';
import {observeCurrentUser} from '@queries/servers/user';
import {goToScreen, resetToSelectServer} from '@screens/navigation';
import {getAcademyRoleFlags} from '@utils/academy_roles';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

// ─────────────────────────── Типы данных ────────────────────────────────────

type Lesson = {
    id: string;
    subject: string;
    teacher: string;
    room: string;
    time: string;
    day: string;
    isToday: boolean;
}

// ─────────────────────────── Быстрые действия ────────────────────────────────

type QuickAction = {
    id: string;
    icon: string;
    label: string;
    color: string;
    roles: Array<'all' | 'student' | 'staff'>;
    onPress: () => void;
}

// ─────────────────────────── Стили ───────────────────────────────────────────

const pageBg = (theme: Theme) => changeOpacity(theme.centerChannelColor, 0.02);

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: pageBg(theme)},
    scroll: {flex: 1, backgroundColor: pageBg(theme)},
    scrollContent: {
        paddingBottom: 40,
        flexGrow: 1,
        backgroundColor: pageBg(theme),
    },

    // Hero — светлый блок как остальная страница
    hero: {
        backgroundColor: pageBg(theme),
        paddingHorizontal: 20,
        paddingBottom: 24,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    heroRow: {flexDirection: 'row', alignItems: 'center'},
    avatarWrapper: {
        borderWidth: 3,
        borderColor: theme.sidebarTextActiveBorder,
        borderRadius: 32,
        marginRight: 16,
    },
    heroInfo: {flex: 1},
    heroName: {
        fontSize: 20,
        fontWeight: '700',
        color: theme.centerChannelColor,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    heroRole: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.55),
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    heroStatus: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.45),
        marginTop: 4,
    },
    editBtn: {
        padding: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 8,
    },
    // Stats-row
    statsRow: {
        flexDirection: 'row',
        marginTop: 20,
        gap: 10,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 10,
        padding: 10,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.centerChannelColor,
    },
    statLabel: {
        fontSize: 10,
        color: changeOpacity(theme.centerChannelColor, 0.5),
        textAlign: 'center',
        marginTop: 2,
    },

    profileNavRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
        paddingHorizontal: 4,
    },
    profileNavCard: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        alignItems: 'center',
    },
    profileNavTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.centerChannelColor,
        marginTop: 6,
        textAlign: 'center',
    },
    profileNavSub: {
        fontSize: 11,
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 2,
        textAlign: 'center',
    },
    modalRoot: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: theme.centerChannelColor,
    },
    modalBody: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
    },

    // Секция
    section: {paddingHorizontal: 16, paddingTop: 20},
    sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: changeOpacity(theme.centerChannelColor, 0.45),
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    seeAllBtn: {},
    seeAllText: {fontSize: 12, color: theme.linkColor},

    // Карточка занятия
    lessonCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    lessonToday: {
        borderColor: changeOpacity(theme.sidebarTextActiveBorder, 0.4),
        borderWidth: 1,
    },
    lessonTime: {
        width: 52,
        alignItems: 'center',
        marginRight: 12,
    },
    lessonTimeText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.sidebarTextActiveBorder,
        textAlign: 'center',
        lineHeight: 14,
    },
    lessonDay: {
        fontSize: 10,
        color: changeOpacity(theme.centerChannelColor, 0.45),
        marginTop: 3,
        textAlign: 'center',
    },
    lessonDivider: {
        width: 1,
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        marginRight: 12,
    },
    lessonInfo: {flex: 1},
    lessonSubject: {fontSize: 15, fontWeight: '600', color: theme.centerChannelColor},
    lessonMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 2},

    // Быстрые действия
    quickGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
    quickBtn: {
        width: '47%',
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    quickIconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    quickLabel: {fontSize: 13, fontWeight: '600', color: theme.centerChannelColor, flex: 1},

    // Баннер оплаты
    payBanner: {
        marginHorizontal: 16,
        marginTop: 20,
        padding: 16,
        backgroundColor: changeOpacity('#c4973b', 0.1),
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity('#c4973b', 0.25),
    },
    payBannerIcon: {marginRight: 12},
    payBannerText: {flex: 1},
    payBannerTitle: {fontSize: 14, fontWeight: '700', color: '#c4973b'},
    payBannerSub: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.6), marginTop: 2},
    payBtn: {
        backgroundColor: '#c4973b',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    payBtnText: {color: '#fff', fontSize: 12, fontWeight: '700'},
    paymentCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    paymentTitle: {fontSize: 14, fontWeight: '700', color: theme.centerChannelColor},
    paymentMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.55), marginTop: 3},
    paymentStatus: {fontSize: 12, fontWeight: '600', marginTop: 6},
    documentCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    documentTitle: {fontSize: 14, fontWeight: '600', color: theme.centerChannelColor},
    documentMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.55), marginTop: 3},
}));

// ─────────────────────────── Компонент ───────────────────────────────────────

type Props = {
    currentUser?: UserModel;
}

function getRoleLabel(roles: string): string {
    const roleFlags = getAcademyRoleFlags(roles);
    if (roleFlags.isSystemAdmin) {
        return 'Системный администратор';
    }
    if (roleFlags.isTeamAdmin || roleFlags.isChannelAdmin) {
        return 'Педагог / Сотрудник';
    }
    return 'Студент';
}

function AcademyProfileScreen({currentUser}: Props) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const style = getStyleSheet(theme);
    const serverUrl = useResolvedServerUrl();
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [lessonsModalVisible, setLessonsModalVisible] = useState(false);
    const [paymentsModalVisible, setPaymentsModalVisible] = useState(false);

    const roles = currentUser?.roles || '';
    const roleFlags = getAcademyRoleFlags(roles);
    const isStaff = roleFlags.isStaff;
    const roleLabel = getRoleLabel(roles);
    const fullName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || currentUser?.username || '';
    const [sessionToken, setSessionToken] = useState((currentUser as UserModel & {token?: string})?.token || '');
    const userId = currentUser?.id || '';

    const [myBookings, setMyBookings] = useState<Booking[]>([]);
    const [bookingsLoaded, setBookingsLoaded] = useState(false);

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

    const formatDateLabel = (dateRaw: string) => {
        const d = new Date(dateRaw);
        if (Number.isNaN(d.getTime())) {
            return dateRaw;
        }
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diff = Math.round((target - today) / (24 * 60 * 60 * 1000));
        if (diff === 0) {
            return 'Сегодня';
        }
        if (diff === 1) {
            return 'Завтра';
        }
        return d.toLocaleDateString('ru-RU', {weekday: 'short'});
    };

    useEffect(() => {
        let cancelled = false;
        const loadMyBookings = async () => {
            if (!sessionToken || !userId) {
                if (!cancelled) {
                    setBookingsLoaded(true);
                }
                return;
            }
            try {
                const rows = await bookingApi.getMyBookings(userId, sessionToken, serverUrl);
                if (!cancelled) {
                    const approved = rows.filter((row) => row.status === 'approved');
                    approved.sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
                    setMyBookings(approved);
                }
            } catch {
                // fallback to demo below
            } finally {
                if (!cancelled) {
                    setBookingsLoaded(true);
                }
            }
        };
        loadMyBookings();
        return () => {
            cancelled = true;
        };
    }, [userId, sessionToken, serverUrl]);

    const lessons = useMemo(() => {
        return myBookings.map((booking) => ({
            id: booking.id,
            subject: booking.purpose || (isStaff ? `Бронирование — ${booking.user_name}` : 'Занятие'),
            teacher: isStaff ? booking.user_name : 'Академия',
            room: booking.room_name,
            time: `${booking.start_time} – ${booking.end_time}`,
            day: formatDateLabel(booking.date),
            isToday: formatDateLabel(booking.date) === 'Сегодня',
        }));
    }, [isStaff, myBookings]);
    const todayLessons = lessons.filter((l) => l.isToday);
    const upcomingLessons = lessons.filter((l) => !l.isToday);
    const offCurriculumApproved = myBookings.filter((booking) => booking.is_curriculum === 0);
    const curriculumApproved = myBookings.filter((booking) => booking.is_curriculum === 1);
    const hasRealBookings = bookingsLoaded && myBookings.length > 0;
    const paymentItems = useMemo(() => {
        return offCurriculumApproved.slice(0, 5).map((booking) => {
            const hasPaymentLink = Boolean(booking.payment_link);
            return {
                id: booking.id,
                title: booking.purpose || booking.room_name,
                meta: `${booking.date} · ${booking.start_time}–${booking.end_time}`,
                status: hasPaymentLink ? 'Ожидает оплаты (есть ссылка)' : 'Ожидает расчёта от администрации',
                statusColor: hasPaymentLink ? '#c4973b' : '#8b4513',
            };
        });
    }, [offCurriculumApproved]);

    const profileLessonsSubtitle = lessons.length > 0 ? `${lessons.length} записей` : 'Просмотр';
    const profilePaymentsSubtitle =
        offCurriculumApproved.length > 0 ? `${offCurriculumApproved.length} к оплате` : 'Только просмотр';

    const documentContracts = useMemo(() => ([
        {
            id: 'docs-ref',
            title: 'Справка об обучении',
            meta: 'POST /api/documents/requests {type: "education_certificate"}',
        },
        {
            id: 'docs-agreement',
            title: 'Копия договора',
            meta: 'POST /api/documents/requests {type: "agreement_copy"}',
        },
        {
            id: 'docs-profile',
            title: 'Изменение личных данных',
            meta: 'PATCH /api/users/{id}/profile + подтверждающие документы',
        },
    ]), []);

    const handleLogout = useCallback(() => {
        Alert.alert(
            'Выйти из аккаунта?',
            'Вы будете возвращены на экран входа.',
            [
                {text: 'Отмена', style: 'cancel'},
                {
                    text: 'Выйти',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await logout(serverUrl, undefined, {removeServer: false});
                        } finally {
                            resetToSelectServer({launchType: Launch.Normal});
                        }
                    },
                },
            ],
        );
    }, [serverUrl]);

    const openScheduleTab = useCallback(() => {
        DeviceEventEmitter.emit(Events.ACADEMY_NOTIFICATION_OPENED, {category: 'schedule'});
    }, []);

    const openSettingsScreen = useCallback(() => {
        goToScreen(Screens.SETTINGS, '', {}, {});
    }, []);

    const quickActions: QuickAction[] = useMemo(() => [
        {
            id: 'schedule',
            icon: 'calendar-month-outline',
            label: 'Расписание',
            color: '#1a1a35',
            roles: ['all'],
            onPress: openScheduleTab,
        },
        {
            id: 'payment',
            icon: 'credit-card-outline',
            label: 'Оплата',
            color: '#c4973b',
            roles: ['student'],
            onPress: () => Alert.alert('Оплата', 'Функция оплаты будет доступна после интеграции с системой 1С.'),
        },
        {
            id: 'docs',
            icon: 'file-text-outline',
            label: 'Документы',
            color: '#2d4a22',
            roles: ['all'],
            onPress: openScheduleTab,
        },
        {
            id: 'settings',
            icon: 'cog-outline',
            label: 'Настройки',
            color: '#555',
            roles: ['all'],
            onPress: openSettingsScreen,
        },
        {
            id: 'logout',
            icon: 'exit-to-app',
            label: 'Выйти',
            color: '#d24b4e',
            roles: ['all'],
            onPress: handleLogout,
        },
        {
            id: 'workload',
            icon: 'chart-bar',
            label: 'Нагрузка',
            color: '#6b3570',
            roles: ['staff'],
            onPress: openScheduleTab,
        },
        {
            id: 'vacation',
            icon: 'beach-umbrella-outline',
            label: 'Отпуск',
            color: '#1a3a4a',
            roles: ['staff'],
            onPress: openScheduleTab,
        },
        {
            id: 'admin',
            icon: 'application-cog',
            label: 'Управление пользователями',
            color: '#d24b4e',
            roles: ['staff'],
            onPress: () => setShowAdminPanel(true),
        },
    ], [handleLogout, openScheduleTab, openSettingsScreen]);

    const visibleActions = quickActions.filter((a) =>
        a.roles.includes('all') ||
        (isStaff ? a.roles.includes('staff') : a.roles.includes('student')),
    );

    const renderLesson = useCallback((lesson: Lesson) => (
        <View
            key={lesson.id}
            style={[style.lessonCard, lesson.isToday && style.lessonToday]}
        >
            <View style={style.lessonTime}>
                <Text style={style.lessonTimeText}>{lesson.time.split(' – ')[0]}</Text>
                <Text style={style.lessonDay}>{lesson.day}</Text>
            </View>
            <View style={style.lessonDivider}/>
            <View style={style.lessonInfo}>
                <Text style={style.lessonSubject}>{lesson.subject}</Text>
                <Text style={style.lessonMeta}>
                    {[lesson.teacher, lesson.room].filter(Boolean).join('  •  ')}
                </Text>
            </View>
        </View>
    ), [style]);

    return (
        <View style={style.container}>
            <ScrollView
                style={style.scroll}
                contentContainerStyle={style.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={[style.hero, {paddingTop: insets.top + 16}]}>
                    <View style={style.heroRow}>
                        <View style={style.avatarWrapper}>
                            <ProfilePicture
                                author={currentUser}
                                showStatus={true}
                                size={56}
                                statusSize={14}
                            />
                        </View>
                        <View style={style.heroInfo}>
                            <Text
                                style={style.heroName}
                                numberOfLines={1}
                            >
                                {fullName}
                            </Text>
                            <Text style={style.heroRole}>{roleLabel}</Text>
                            <Text style={style.heroStatus}>{'@' + (currentUser?.username || '')}</Text>
                        </View>
                        <TouchableOpacity
                            style={style.editBtn}
                            onPress={() => Alert.alert('Редактировать профиль', 'Откроется экран редактирования.')}
                        >
                            <CompassIcon
                                name='pencil-outline'
                                size={18}
                                color={changeOpacity(theme.centerChannelColor, 0.55)}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Мини-статистика */}
                    <View style={style.statsRow}>
                        <View style={style.statCard}>
                            <Text style={style.statValue}>{isStaff ? '12' : '3'}</Text>
                            <Text style={style.statLabel}>{isStaff ? 'Учеников' : 'Предмета'}</Text>
                        </View>
                        <View style={style.statCard}>
                            <Text style={style.statValue}>{todayLessons.length}</Text>
                            <Text style={style.statLabel}>{'Сегодня'}</Text>
                        </View>
                        <View style={style.statCard}>
                            <Text style={style.statValue}>{isStaff ? '4' : '1'}</Text>
                            <Text style={style.statLabel}>{isStaff ? 'Класса' : 'Педагог'}</Text>
                        </View>
                    </View>
                </View>

                <View style={[style.hero, {paddingTop: 0, borderBottomWidth: 0}]}>
                    <View style={style.profileNavRow}>
                        <TouchableOpacity
                            style={style.profileNavCard}
                            onPress={() => setLessonsModalVisible(true)}
                            accessibilityRole='button'
                            accessibilityLabel='Мои занятия'
                        >
                            <CompassIcon
                                name='calendar-month-outline'
                                size={22}
                                color={theme.sidebarTextActiveBorder}
                            />
                            <Text style={style.profileNavTitle}>{'Мои занятия'}</Text>
                            <Text style={style.profileNavSub}>{profileLessonsSubtitle}</Text>
                        </TouchableOpacity>
                        {!isStaff && (
                            <TouchableOpacity
                                style={style.profileNavCard}
                                onPress={() => setPaymentsModalVisible(true)}
                                accessibilityRole='button'
                                accessibilityLabel='Мои платежи'
                            >
                                <CompassIcon
                                    name='credit-card-outline'
                                    size={22}
                                    color='#c4973b'
                                />
                                <Text style={style.profileNavTitle}>{'Мои платежи'}</Text>
                                <Text style={style.profileNavSub}>{profilePaymentsSubtitle}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Баннер оплаты (только для студентов) */}
                {!isStaff && (
                    <View style={style.payBanner}>
                        <CompassIcon
                            name='bell-ring-outline'
                            size={22}
                            color='#c4973b'
                            style={style.payBannerIcon}
                        />
                        <View style={style.payBannerText}>
                            <Text style={style.payBannerTitle}>
                                {hasRealBookings ? `Внеурочных занятий: ${offCurriculumApproved.length}` : 'Оплата до 25 марта'}
                            </Text>
                            <Text style={style.payBannerSub}>
                                {hasRealBookings ? 'История формируется из одобренных заявок' : 'Осталось 8 дней'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={style.payBtn}
                            onPress={() => Alert.alert('Оплата', 'Интеграция с оплатой в разработке.')}
                        >
                            <Text style={style.payBtnText}>{'Оплатить'}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Сегодняшние занятия */}
                {todayLessons.length > 0 && (
                    <View style={style.section}>
                        <View style={style.sectionHeader}>
                            <Text style={style.sectionTitle}>{isStaff ? 'Уроки сегодня' : 'Занятия сегодня'}</Text>
                        </View>
                        {todayLessons.map(renderLesson)}
                    </View>
                )}

                {/* Предстоящие занятия */}
                {upcomingLessons.length > 0 && (
                    <View style={style.section}>
                        <View style={style.sectionHeader}>
                            <Text style={style.sectionTitle}>{'Ближайшие'}</Text>
                            <TouchableOpacity
                                style={style.seeAllBtn}
                                onPress={openScheduleTab}
                            >
                                <Text style={style.seeAllText}>{'Все →'}</Text>
                            </TouchableOpacity>
                        </View>
                        {upcomingLessons.slice(0, 3).map(renderLesson)}
                    </View>
                )}

                {/* Пустое состояние если нет занятий и данные загрузились */}
                {bookingsLoaded && lessons.length === 0 && (
                    <View style={style.section}>
                        <View style={{
                            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
                            borderRadius: 12,
                            padding: 24,
                            alignItems: 'center',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: changeOpacity(theme.centerChannelColor, 0.08),
                        }}>
                            <CompassIcon
                                name='calendar-blank-outline'
                                size={48}
                                color={changeOpacity(theme.centerChannelColor, 0.3)}
                                style={{marginBottom: 12}}
                            />
                            <Text style={{
                                fontSize: 16,
                                fontWeight: '600',
                                color: theme.centerChannelColor,
                                marginBottom: 6,
                            }}>
                                Нет запланированных занятий
                            </Text>
                            <Text style={{
                                fontSize: 13,
                                color: changeOpacity(theme.centerChannelColor, 0.5),
                                textAlign: 'center',
                            }}>
                                Ваше расписание пусто. Посетите раздел «Расписание» чтобы записаться на занятия.
                            </Text>
                        </View>
                    </View>
                )}

                {/* Быстрые действия */}
                <View style={style.section}>
                    <View style={style.sectionHeader}>
                        <Text style={style.sectionTitle}>{'Разделы'}</Text>
                    </View>
                    <View style={style.quickGrid}>
                        {visibleActions.map((action) => (
                            <TouchableOpacity
                                key={action.id}
                                style={style.quickBtn}
                                onPress={action.onPress}
                                activeOpacity={0.75}
                            >
                                <View style={[style.quickIconBox, {backgroundColor: action.color + '18'}]}>
                                    <CompassIcon
                                        name={action.icon}
                                        size={20}
                                        color={action.color}
                                    />
                                </View>
                                <Text style={style.quickLabel}>{action.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {!isStaff && (
                    <View style={style.section}>
                        <View style={style.sectionHeader}>
                            <Text style={style.sectionTitle}>{'Мои оплаты (read-only)'}</Text>
                        </View>
                        {paymentItems.length > 0 ? paymentItems.map((item) => (
                            <View
                                key={item.id}
                                style={style.paymentCard}
                            >
                                <Text style={style.paymentTitle}>{item.title}</Text>
                                <Text style={style.paymentMeta}>{item.meta}</Text>
                                <Text style={[style.paymentStatus, {color: item.statusColor}]}>{item.status}</Text>
                            </View>
                        )) : (
                            <View style={style.paymentCard}>
                                <Text style={style.paymentMeta}>
                                    {'Внеурочных начислений пока нет. История появится после интеграции с биллингом/1С.'}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                <View style={style.section}>
                    <View style={style.sectionHeader}>
                        <Text style={style.sectionTitle}>{'Документы (контракт API)'}</Text>
                    </View>
                    {documentContracts.map((item) => (
                        <View
                            key={item.id}
                            style={style.documentCard}
                        >
                            <Text style={style.documentTitle}>{item.title}</Text>
                            <Text style={style.documentMeta}>{item.meta}</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* Admin Panel Modal */}
            <Modal visible={showAdminPanel} animationType='slide' presentationStyle='fullScreen'>
                <AdminPanelScreen
                    adminToken={sessionToken}
                    adminId={currentUser?.id || ''}
                    onClose={() => setShowAdminPanel(false)}
                />
            </Modal>

            <Modal
                visible={lessonsModalVisible}
                animationType='slide'
                presentationStyle='fullScreen'
                onRequestClose={() => setLessonsModalVisible(false)}
            >
                <View style={[style.modalRoot, {paddingTop: insets.top}]}>
                    <View style={style.modalHeader}>
                        <Text style={style.modalTitle}>{'Мои занятия'}</Text>
                        <TouchableOpacity
                            onPress={() => setLessonsModalVisible(false)}
                            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                        >
                            <CompassIcon
                                name='close'
                                size={26}
                                color={theme.centerChannelColor}
                            />
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        style={style.modalBody}
                        contentContainerStyle={{paddingBottom: insets.bottom + 24}}
                    >
                        <Text style={[style.paymentMeta, {marginBottom: 12}]}>
                            {hasRealBookings
                                ? 'Подтверждённые бронирования из сервиса Академии. При отсутствии данных показывается демо-расписание.'
                                : 'Демонстрационное расписание. После одобрения заявок на классы список подтянется автоматически.'}
                        </Text>
                        {lessons.map(renderLesson)}
                    </ScrollView>
                </View>
            </Modal>

            <Modal
                visible={paymentsModalVisible}
                animationType='slide'
                presentationStyle='fullScreen'
                onRequestClose={() => setPaymentsModalVisible(false)}
            >
                <View style={[style.modalRoot, {paddingTop: insets.top}]}>
                    <View style={style.modalHeader}>
                        <Text style={style.modalTitle}>{'Мои платежи'}</Text>
                        <TouchableOpacity
                            onPress={() => setPaymentsModalVisible(false)}
                            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                        >
                            <CompassIcon
                                name='close'
                                size={26}
                                color={theme.centerChannelColor}
                            />
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        style={style.modalBody}
                        contentContainerStyle={{paddingBottom: insets.bottom + 24}}
                    >
                        <Text style={[style.sectionTitle, {marginBottom: 8, textTransform: 'none'}]}>
                            {'Ежемесячный взнос за обучение'}
                        </Text>
                        <View style={style.paymentCard}>
                            <Text style={style.paymentMeta}>
                                {'Сумма и статус по договору доступны в бухгалтерии. Напоминания приходят в приложение за 7 и 1 день до 25-го числа.'}
                            </Text>
                        </View>

                        {curriculumApproved.length > 0 && (
                            <>
                                <Text style={[style.sectionTitle, {marginTop: 16, marginBottom: 8, textTransform: 'none'}]}>
                                    {'Учебные бронирования классов'}
                                </Text>
                                {curriculumApproved.map((b) => (
                                    <View
                                        key={`cur-${b.id}`}
                                        style={style.paymentCard}
                                    >
                                        <Text style={style.paymentTitle}>{b.room_name}</Text>
                                        <Text style={style.paymentMeta}>{`${b.date} · ${b.start_time}–${b.end_time}`}</Text>
                                        <Text style={[style.paymentStatus, {color: theme.linkColor}]}>{'Включено в учебный процесс'}</Text>
                                    </View>
                                ))}
                            </>
                        )}

                        <Text style={[style.sectionTitle, {marginTop: 16, marginBottom: 8, textTransform: 'none'}]}>
                            {'Внеурочные / аренда'}
                        </Text>
                        {paymentItems.length > 0 ? (
                            paymentItems.map((item) => (
                                <View
                                    key={item.id}
                                    style={style.paymentCard}
                                >
                                    <Text style={style.paymentTitle}>{item.title}</Text>
                                    <Text style={style.paymentMeta}>{item.meta}</Text>
                                    <Text style={[style.paymentStatus, {color: item.statusColor}]}>{item.status}</Text>
                                </View>
                            ))
                        ) : (
                            <View style={style.paymentCard}>
                                <Text style={style.paymentMeta}>
                                    {'Нет активных начислений по внеурочным занятиям.'}
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhance(AcademyProfileScreen));
