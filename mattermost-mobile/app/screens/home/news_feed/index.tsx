// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useResolvedServerUrl} from '@hooks/use_resolved_server_url';
import {useTheme} from '@context/theme';
import {observeCurrentTeamId} from '@queries/servers/system';
import {observeCurrentUser} from '@queries/servers/user';
import {getServerCredentials} from '@init/credentials';
import {getAcademyRoleFlags} from '@utils/academy_roles';
import {getBookingServiceUrl} from '@utils/academy_service';
import {fetchWithRetry} from '@utils/fetch_utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import AcademyAfishaScreen from '../academy_afisha';
import DraftsModerationModal from './drafts_moderation_modal';
import NewsFeedPost from './news_feed_post';
import StoriesRow, {type Story} from './stories_row';
import CreateNewsPostModal from './create_news_post_modal';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

// Сервер: каналы `novosti-studentam` (O) и `novosti-sotrudnikam` (P) — setup_academy.sh.
// Участники приватной ленты сотрудников должны быть в канале; доступ к вкладке — team_admin и др. или ACADEMY_STAFF_NEWS_EXTRA_ROLE_NAMES.
const STUDENT_CHANNEL = 'novosti-studentam';
const STAFF_CHANNEL = 'novosti-sotrudnikam';

const TABS = [
    {key: STUDENT_CHANNEL, label: 'Студентам'},
    {key: STAFF_CHANNEL, label: 'Сотрудникам'},
];

// Демо-сторис (в боевом варианте — из канала «afisha»)
const DEMO_STORIES: Story[] = [
    {
        id: 's1',
        title: 'Концерт классической музыки',
        emoji: '🎹',
        color: '#1a1a35',
        date: '15 марта 2026',
        content: 'Приглашаем всех на ежегодный весенний концерт студентов Академии. Актовый зал, 19:00. Вход свободный для всех слушателей.',
        authorRole: 'Администрация Академии',
    },
    {
        id: 's2',
        title: 'Мастер-класс по вокалу',
        emoji: '🎤',
        color: '#8b4513',
        date: '20 марта 2026',
        content: 'Открытый мастер-класс ведущего педагога Марии Ивановой. Класс № 3, 14:00. Количество мест ограничено — запись у менеджера.',
        authorRole: 'Учебный отдел',
    },
    {
        id: 's3',
        title: 'Конкурс молодых исполнителей',
        emoji: '🏆',
        color: '#2d4a22',
        date: '1 апреля 2026',
        content: 'Академия принимает заявки на участие в городском конкурсе молодых исполнителей. Подать заявку — до 25 марта через менеджера.',
        authorRole: 'Руководство',
    },
    {
        id: 's4',
        title: 'Выходной 8 марта',
        emoji: '🌸',
        color: '#6b3570',
        date: '8 марта 2026',
        content: 'В праздничный день 8 марта занятия не проводятся. Расписание на следующую неделю — в обычном режиме.',
        authorRole: 'Администрация',
    },
    {
        id: 's5',
        title: 'Оплата — до 25 марта',
        emoji: '💳',
        color: '#c4973b',
        date: '25 марта 2026',
        content: 'Напоминаем: ежемесячная оплата обучения — до 25 числа. Способы оплаты: касса, терминал, онлайн. Реквизиты — у бухгалтера.',
        authorRole: 'Бухгалтерия',
    },
];

type Post = {
    id: string;
    create_at: number;
    message: string;
    user_id: string;
    type: string;
}

type Props = {
    currentUser?: UserModel;
    teamId?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
    },
    // Шапка в духе VkusVill — белая с именем и датой
    header: {
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    greeting: {
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
    headerActionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
    },
    headerActionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.07),
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    headerActionChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.65),
    },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 20,
        paddingBottom: 0,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tab: {
        paddingVertical: 12,
        marginRight: 24,
    },
    tabActive: {
        borderBottomWidth: 2,
        borderBottomColor: theme.sidebarTextActiveBorder,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: changeOpacity(theme.centerChannelColor, 0.45),
    },
    tabTextActive: {
        color: theme.centerChannelColor,
        fontWeight: '600',
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 20,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        marginTop: 40,
    },
    emptyEmoji: {
        fontSize: 40,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginBottom: 6,
    },
    emptySubtitle: {
        fontSize: 13,
        color: changeOpacity(theme.centerChannelColor, 0.35),
        textAlign: 'center',
        lineHeight: 20,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    errorBanner: {
        marginHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: changeOpacity('#d24b4e', 0.25),
        backgroundColor: changeOpacity('#d24b4e', 0.08),
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    errorText: {
        flex: 1,
        fontSize: 12,
        color: '#d24b4e',
    },
    retryBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: changeOpacity('#d24b4e', 0.16),
    },
    retryBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#d24b4e',
        textTransform: 'uppercase',
    },
}));

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 6) {
        return 'Доброй ночи';
    }
    if (h < 12) {
        return 'Доброе утро';
    }
    if (h < 18) {
        return 'Добрый день';
    }
    return 'Добрый вечер';
}

function getApiBase(serverUrl: string): string {
    const t = serverUrl.trim().replace(/\/$/, '');
    if (!/^http:\/\//i.test(t)) {
        return t;
    }

    const rest = t.replace(/^http:\/\//i, '');
    if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(rest)) {
        return t;
    }

    return `https://${rest}`;
}

function NewsFeedScreen({currentUser, teamId}: Props) {
    const theme = useTheme();
    const serverUrl = useResolvedServerUrl();
    const insets = useSafeAreaInsets();
    const style = getStyleSheet(theme);
    const apiBaseUrl = useMemo(() => getApiBase(serverUrl), [serverUrl]);

    const [activeTab, setActiveTab] = useState(STUDENT_CHANNEL);
    const [showAfisha, setShowAfisha] = useState(false);
    const [showCreatePost, setShowCreatePost] = useState(false);
    const [showModeration, setShowModeration] = useState(false);
    const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
    const [posts, setPosts] = useState<Record<string, Post[]>>({
        [STUDENT_CHANNEL]: [],
        [STAFF_CHANNEL]: [],
    });
    const [loading, setLoading] = useState<Record<string, boolean>>({
        [STUDENT_CHANNEL]: true,
        [STAFF_CHANNEL]: false,
    });
    const [loadError, setLoadError] = useState<Record<string, string>>({
        [STUDENT_CHANNEL]: '',
        [STAFF_CHANNEL]: '',
    });
    const [channelIds, setChannelIds] = useState<Record<string, string>>({});
    const [sessionToken, setSessionToken] = useState('');
    const fetchedRef = useRef<Set<string>>(new Set());

    const firstName = currentUser?.firstName || currentUser?.username || '';

    const roleFlags = useMemo(() => getAcademyRoleFlags(currentUser?.roles), [currentUser?.roles]);
    const isStaff = roleFlags.isStaff;
    const canSeeStaffNewsFeed = roleFlags.canSeeStaffNewsFeed;
    const isSystemAdmin = roleFlags.isSystemAdmin;

    const visibleTabs = useMemo(
        () => (canSeeStaffNewsFeed ? TABS : TABS.filter((t) => t.key === STUDENT_CHANNEL)),
        [canSeeStaffNewsFeed],
    );

    useEffect(() => {
        if (!canSeeStaffNewsFeed && activeTab === STAFF_CHANNEL) {
            setActiveTab(STUDENT_CHANNEL);
        }
    }, [canSeeStaffNewsFeed, activeTab]);

    useEffect(() => {
        let cancelled = false;
        const loadCredentials = async () => {
            const credentials = await getServerCredentials(serverUrl);
            if (!cancelled) {
                setSessionToken(credentials?.token || '');
            }
        };
        loadCredentials();
        return () => {
            cancelled = true;
        };
    }, [serverUrl]);

    const fetchChannelPosts = useCallback(async (channelName: string) => {
        if (!teamId || !sessionToken || fetchedRef.current.has(channelName)) {
            return;
        }
        setLoading((prev) => ({...prev, [channelName]: true}));
        setLoadError((prev) => ({...prev, [channelName]: ''}));
        try {
            const chResp = await fetchWithRetry(
                `${apiBaseUrl}/api/v4/teams/${teamId}/channels/name/${channelName}`,
                {headers: {Authorization: `Bearer ${sessionToken}`}},
                {retries: 2, timeoutMs: 10000, retryDelayMs: 500},
            );
            if (!chResp.ok) {
                setLoadError((prev) => ({...prev, [channelName]: 'Не удалось загрузить канал. Попробуйте еще раз.'}));
                return;
            }
            const channel = await chResp.json();
            if (!channel?.id) {
                return;
            }
            setChannelIds((prev) => ({...prev, [channelName]: channel.id}));
            const postsResp = await fetchWithRetry(
                `${apiBaseUrl}/api/v4/channels/${channel.id}/posts?page=0&per_page=100&collapsedThreads=false&collapsedThreadsExtended=false`,
                {headers: {Authorization: `Bearer ${sessionToken}`}},
                {retries: 2, timeoutMs: 10000, retryDelayMs: 500},
            );

            if (!postsResp.ok) {
                setLoadError((prev) => ({...prev, [channelName]: 'Не удалось загрузить посты канала. Попробуйте еще раз.'}));
                return;
            }

            const result = await postsResp.json();
            if (result?.posts && typeof result.posts === 'object') {
                const postList = Object.values(result.posts as Record<string, Post>)
                    .filter((p) => !p.type || p.type === '')
                    .sort((a, b) => b.create_at - a.create_at);
                setPosts((prev) => ({...prev, [channelName]: postList}));
            }
            fetchedRef.current.add(channelName);
        } catch {
            setLoadError((prev) => ({...prev, [channelName]: 'Проблема с сетью. Обновите ленту.'}));
        } finally {
            setLoading((prev) => ({...prev, [channelName]: false}));
        }
    }, [apiBaseUrl, sessionToken, teamId]);

    useEffect(() => {
        fetchChannelPosts(activeTab);
    }, [activeTab, fetchChannelPosts]);

    useEffect(() => {
        if (!canSeeStaffNewsFeed || !sessionToken || !teamId) {
            return;
        }
        fetchChannelPosts(STAFF_CHANNEL);
    }, [canSeeStaffNewsFeed, sessionToken, teamId, fetchChannelPosts]);

    const handleRefresh = useCallback(() => {
        fetchedRef.current.delete(activeTab);
        fetchChannelPosts(activeTab);
    }, [activeTab, fetchChannelPosts]);

    const fetchPendingDraftsCount = useCallback(async () => {
        if (!isStaff || !sessionToken) {
            setPendingDraftsCount(0);
            return;
        }
        try {
            const bookingBase = getBookingServiceUrl(serverUrl);
            if (!bookingBase) {
                return;
            }
            const resp = await fetchWithRetry(`${bookingBase}/api/post-drafts?status=pending`, {
                headers: {Authorization: `Bearer ${sessionToken}`},
            }, {retries: 1, timeoutMs: 8000});
            if (!resp.ok) {
                return;
            }
            const rows = await resp.json();
            setPendingDraftsCount(Array.isArray(rows) ? rows.length : 0);
        } catch {
            // silent
        }
    }, [isStaff, sessionToken, serverUrl]);

    useEffect(() => {
        if (!isStaff || !sessionToken) {
            setPendingDraftsCount(0);
            return;
        }
        fetchPendingDraftsCount();
        const id = setInterval(fetchPendingDraftsCount, 30000);
        return () => clearInterval(id);
    }, [isStaff, sessionToken, fetchPendingDraftsCount]);

    const renderPost = useCallback(({item}: {item: Post}) => (
        <NewsFeedPost
            post={item}
            channelId={channelIds[activeTab] || ''}
            theme={theme}
            canDelete={isSystemAdmin}
            onDelete={(postId) => {
                Alert.alert(
                    'Удалить пост?',
                    'Это действие можно отменить только через восстановление из резервной копии.',
                    [
                        {text: 'Отмена', style: 'cancel'},
                        {
                            text: 'Удалить',
                            style: 'destructive',
                            onPress: async () => {
                                try {
                                    const resp = await fetchWithRetry(
                                        `${apiBaseUrl}/api/v4/posts/${postId}`,
                                        {
                                            method: 'DELETE',
                                            headers: {Authorization: `Bearer ${sessionToken}`},
                                        },
                                        {retries: 1, timeoutMs: 10000},
                                    );
                                    if (!resp.ok) {
                                        Alert.alert('Ошибка', 'Не удалось удалить пост');
                                        return;
                                    }
                                    setPosts((prev) => ({
                                        ...prev,
                                        [activeTab]: (prev[activeTab] || []).filter((p) => p.id !== postId),
                                    }));
                                } catch {
                                    Alert.alert('Ошибка', 'Не удалось удалить пост');
                                }
                            },
                        },
                    ],
                );
            }}
        />
    ), [channelIds, activeTab, theme, isSystemAdmin, apiBaseUrl, sessionToken]);

    const renderEmpty = () => (
        <View style={style.emptyContainer}>
            <Text style={style.emptyEmoji}>{'📭'}</Text>
            <Text style={style.emptyTitle}>{'Пока тихо'}</Text>
            <Text style={style.emptySubtitle}>{'Новости появятся здесь,\nкак только их опубликуют'}</Text>
        </View>
    );

    const currentPosts = posts[activeTab] || [];
    const isLoading = loading[activeTab];
    const currentLoadError = loadError[activeTab];

    return (
        <View style={[style.container, {paddingTop: insets.top}]}>
            {/* Шапка: приветствие на всю ширину, действия — отдельной строкой ниже (без давления на имя) */}
            <View style={style.header}>
                <Text style={style.greeting}>{getGreeting()}</Text>
                <Text style={style.headerTitle}>
                    {firstName ? `${firstName} 👋` : 'Академия Образцовой'}
                </Text>
                <View style={style.headerActionsRow}>
                    {isStaff && (
                        <TouchableOpacity
                            onPress={() => setShowModeration(true)}
                            style={style.headerActionChip}
                        >
                            <CompassIcon name='account-multiple-plus-outline' size={16} color={changeOpacity(theme.centerChannelColor, 0.65)}/>
                            <Text style={style.headerActionChipText}>{'Модерация'}</Text>
                            {pendingDraftsCount > 0 && (
                                <View
                                    style={{
                                        minWidth: 16,
                                        height: 16,
                                        borderRadius: 8,
                                        paddingHorizontal: 4,
                                        backgroundColor: '#d24b4e',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{fontSize: 10, fontWeight: '700', color: '#fff'}}>
                                        {pendingDraftsCount > 99 ? '99+' : pendingDraftsCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    {isStaff && (
                        <TouchableOpacity
                            onPress={() => setShowCreatePost(true)}
                            style={style.headerActionChip}
                        >
                            <CompassIcon name='plus' size={16} color={changeOpacity(theme.centerChannelColor, 0.65)}/>
                            <Text style={style.headerActionChipText}>{'Пост'}</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={() => setShowAfisha(true)}
                        style={style.headerActionChip}
                    >
                        <CompassIcon name='calendar-check-outline' size={16} color={changeOpacity(theme.centerChannelColor, 0.65)}/>
                        <Text style={style.headerActionChipText}>{'Афиша'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Модал создания поста */}
            <CreateNewsPostModal
                visible={showCreatePost}
                onDismiss={() => setShowCreatePost(false)}
                serverUrl={serverUrl}
                channelId={channelIds[activeTab] || ''}
                channelName={activeTab}
                currentUserId={currentUser?.id || ''}
                authorName={firstName || currentUser?.username || 'Пользователь'}
                sessionToken={sessionToken}
                isSystemAdmin={isSystemAdmin}
                onPostCreated={handleRefresh}
            />

            <DraftsModerationModal
                visible={showModeration}
                onClose={() => {
                    setShowModeration(false);
                    fetchPendingDraftsCount();
                }}
                token={sessionToken}
                serverUrl={serverUrl}
                onChanged={() => {
                    handleRefresh();
                    fetchPendingDraftsCount();
                }}
            />

            {/* Модал афиши */}
            <Modal visible={showAfisha} animationType='slide' presentationStyle='fullScreen'>
                <View style={{flex: 1, backgroundColor: theme.centerChannelBg}}>
                    <AcademyAfishaScreen onRequestClose={() => setShowAfisha(false)}/>
                </View>
            </Modal>

            {/* Сторис */}
            <StoriesRow
                stories={DEMO_STORIES}
                theme={theme}
            />

            {/* Табы */}
            <View style={style.tabRow}>
                {visibleTabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[style.tab, isActive && style.tabActive]}
                            onPress={() => setActiveTab(tab.key)}
                            accessibilityRole='tab'
                            accessibilityState={{selected: isActive}}
                            accessibilityLabel={
                                tab.key === STAFF_CHANNEL
                                    ? 'Сотрудникам, внутренние новости'
                                    : tab.label
                            }
                        >
                            <Text style={[style.tabText, isActive && style.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Список постов */}
            {Boolean(currentLoadError) && (
                <View style={style.errorBanner}>
                    <Text style={style.errorText}>{currentLoadError}</Text>
                    <TouchableOpacity style={style.retryBtn} onPress={handleRefresh}>
                        <Text style={style.retryBtnText}>{'Повторить'}</Text>
                    </TouchableOpacity>
                </View>
            )}
            {isLoading ? (
                <View style={style.loadingContainer}>
                    <ActivityIndicator
                        size='large'
                        color={theme.buttonBg}
                    />
                </View>
            ) : (
                <FlatList
                    style={style.list}
                    contentContainerStyle={[
                        style.listContent,
                        currentPosts.length === 0 && {flex: 1},
                    ]}
                    data={currentPosts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPost}
                    ListEmptyComponent={renderEmpty}
                    refreshControl={
                        <RefreshControl
                            refreshing={isLoading}
                            onRefresh={handleRefresh}
                            tintColor={theme.buttonBg}
                            colors={[theme.buttonBg]}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    teamId: observeCurrentTeamId(database),
}));

export default withDatabase(enhance(NewsFeedScreen));
