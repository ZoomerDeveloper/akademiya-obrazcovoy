// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Admin-панель управления пользователями
 * Доступна менеджерам и администраторам из «Личного кабинета»
 *
 * Функции:
 *  - Список всех пользователей с ролями
 *  - Поиск по имени/email
 *  - Добавить нового студента (пригласить по email)
 *  - Сменить роль пользователя
 *  - Написать личное сообщение
 *  - Деактивировать аккаунт
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useResolvedServerUrl} from '@hooks/use_resolved_server_url';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

type MMUser = {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    roles: string;
    delete_at: number;
    last_activity_at?: number;
}

type Props = {
    adminToken: string;
    adminId: string;
    onClose: () => void;
}

const ROLE_META: Record<string, {label: string; color: string; icon: string}> = {
    system_admin: {label: 'Администратор', color: '#d24b4e', icon: 'account-multiple-plus-outline'},
    team_admin: {label: 'Педагог / Менеджер', color: '#c4973b', icon: 'account-tie'},
    default: {label: 'Студент', color: '#3db887', icon: 'school'},
};

function getRoleMeta(roles: string) {
    if (roles.includes('system_admin')) { return ROLE_META.system_admin; }
    if (roles.includes('team_admin')) { return ROLE_META.team_admin; }
    return ROLE_META.default;
}

function getInitials(user: MMUser): string {
    const f = user.first_name?.[0] || '';
    const l = user.last_name?.[0] || '';
    return (f + l).toUpperCase() || user.username.slice(0, 2).toUpperCase();
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: changeOpacity(theme.centerChannelColor, 0.02)},
    header: {
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 16 : 10,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        flexDirection: 'row',
        alignItems: 'center',
    },
    backBtn: {padding: 4, marginRight: 12},
    headerTexts: {flex: 1},
    headerTitle: {fontSize: 18, fontWeight: '700', color: theme.centerChannelColor},
    headerMeta: {fontSize: 11, color: changeOpacity(theme.centerChannelColor, 0.45), marginTop: 1},
    inviteBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    },
    inviteBtnText: {color: theme.buttonColor, fontWeight: '700', fontSize: 13},
    searchBox: {
        margin: 12,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        gap: 8,
    },
    searchInput: {flex: 1, fontSize: 14, color: theme.centerChannelColor, paddingVertical: 0},
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        marginBottom: 8,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 8, borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    filterChipActive: {backgroundColor: theme.buttonBg, borderColor: theme.buttonBg},
    filterChipText: {fontSize: 12, fontWeight: '600', color: changeOpacity(theme.centerChannelColor, 0.6)},
    filterChipTextActive: {color: theme.buttonColor},
    list: {flex: 1},
    listContent: {paddingHorizontal: 12, paddingBottom: 32},
    userCard: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14, padding: 14, marginBottom: 8,
        flexDirection: 'row', alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.07),
    },
    avatar: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    avatarText: {fontSize: 15, fontWeight: '700', color: '#fff'},
    userInfo: {flex: 1},
    userName: {fontSize: 14, fontWeight: '600', color: theme.centerChannelColor},
    userEmail: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 1},
    roleBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5,
        alignSelf: 'flex-start',
    },
    roleBadgeText: {fontSize: 11, fontWeight: '600'},
    actionBtn: {padding: 8},
    // Bottom sheet
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, paddingBottom: 40,
        shadowColor: '#000', shadowOffset: {width: 0, height: -4},
        shadowOpacity: 0.1, shadowRadius: 12, elevation: 10,
    },
    sheetOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)'},
    sheetHandle: {width: 36, height: 4, borderRadius: 2, backgroundColor: changeOpacity(theme.centerChannelColor, 0.15), alignSelf: 'center', marginBottom: 16},
    sheetUserRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 20},
    sheetUserName: {fontSize: 16, fontWeight: '700', color: theme.centerChannelColor},
    sheetUserEmail: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 2},
    action: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.07),
    },
    actionIcon: {
        width: 38, height: 38, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    actionLabel: {fontSize: 15, color: theme.centerChannelColor, fontWeight: '500'},
    actionMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.45), marginTop: 2},
    destructiveText: {color: '#d24b4e'},
    loadingBox: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    emptyBox: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40},
    emptyText: {fontSize: 14, color: changeOpacity(theme.centerChannelColor, 0.4), textAlign: 'center', marginTop: 12},
}));

const COLORS = ['#1a1a35', '#2d4a22', '#8b4513', '#6b3570', '#1a3a4a', '#3a1a1a'];

function AdminPanelScreen({adminToken, adminId, onClose}: Props) {
    const theme = useTheme();
    const serverUrl = useResolvedServerUrl();
    const style = getStyleSheet(theme);

    const [users, setUsers] = useState<MMUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'staff' | 'admin'>('all');
    const [selectedUser, setSelectedUser] = useState<MMUser | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${serverUrl}/api/v4/users?per_page=100&active=true`, {
                headers: {Authorization: `Bearer ${adminToken}`},
            });
            if (res.ok) {
                const list: MMUser[] = await res.json();
                setUsers(list.filter((u) => !u.roles.includes('system_bot')));
            }
        } catch {}
        finally { setLoading(false); }
    }, [serverUrl, adminToken]);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        return users.filter((u) => {
            const nameMatch = !q ||
                u.username.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                `${u.first_name} ${u.last_name}`.toLowerCase().includes(q);

            const roleMatch = roleFilter === 'all' ||
                (roleFilter === 'admin' && u.roles.includes('system_admin')) ||
                (roleFilter === 'staff' && u.roles.includes('team_admin') && !u.roles.includes('system_admin')) ||
                (roleFilter === 'student' && !u.roles.includes('team_admin') && !u.roles.includes('system_admin'));

            return nameMatch && roleMatch;
        });
    }, [users, query, roleFilter]);

    const handlePromoteToAdmin = useCallback(async (user: MMUser) => {
        setActionLoading(true);
        try {
            // Обновляем роль system_user → system_admin
            await fetch(`${serverUrl}/api/v4/users/${user.id}/roles`, {
                method: 'PUT',
                headers: {'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json'},
                body: JSON.stringify({roles: 'system_user system_admin'}),
            });
            await loadUsers();
            setSelectedUser(null);
            Alert.alert('✅ Роль обновлена', `@${user.username} теперь администратор`);
        } catch (err: unknown) {
            Alert.alert('Ошибка', (err as Error).message);
        } finally { setActionLoading(false); }
    }, [serverUrl, adminToken, loadUsers]);

    const handleBindPhone = useCallback((user: MMUser) => {
        Alert.prompt(
            `📱 Привязать телефон`,
            `Введите номер телефона для @${user.username}:\n(формат: +79161234567 или 89161234567)`,
            async (rawPhone) => {
                if (!rawPhone) { return; }
                try {
                    const resp = await fetch('http://localhost:3002/api/admin/phone-users', {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json'},
                        body: JSON.stringify({phone: rawPhone, mm_user_id: user.id}),
                    });
                    const data = await resp.json();
                    if (resp.ok) {
                        Alert.alert(
                            '✅ Телефон привязан',
                            `@${user.username} → ${data.phone_masked}\n\nТеперь пользователь может войти по SMS-коду.`,
                        );
                        setSelectedUser(null);
                    } else {
                        Alert.alert('Ошибка', data.error || 'Не удалось привязать телефон');
                    }
                } catch {
                    Alert.alert('Ошибка', 'SMS Auth Service недоступен (порт 3002)');
                }
            },
            'plain-text',
            '',
            'phone-pad',
        );
    }, [adminToken]);

    const handleDeactivate = useCallback(async (user: MMUser) => {
        Alert.alert(
            'Деактивировать аккаунт?',
            `Пользователь @${user.username} потеряет доступ к приложению.`,
            [
                {text: 'Отмена', style: 'cancel'},
                {
                    text: 'Деактивировать', style: 'destructive',
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            await fetch(`${serverUrl}/api/v4/users/${user.id}`, {
                                method: 'DELETE',
                                headers: {Authorization: `Bearer ${adminToken}`},
                            });
                            await loadUsers();
                            setSelectedUser(null);
                        } catch (err: unknown) {
                            Alert.alert('Ошибка', (err as Error).message);
                        } finally { setActionLoading(false); }
                    },
                },
            ],
        );
    }, [serverUrl, adminToken, loadUsers]);

    const handleInvite = useCallback(() => {
        Alert.prompt(
            'Пригласить нового студента',
            'Введите email для отправки приглашения:',
            async (email) => {
                if (!email?.includes('@')) { return; }
                try {
                    await fetch(`${serverUrl}/api/v4/teams/invite/email`, {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json'},
                        body: JSON.stringify([email]),
                    });
                    Alert.alert('✅ Приглашение отправлено', `Письмо отправлено на ${email}`);
                } catch {
                    Alert.alert('Ошибка', 'Не удалось отправить приглашение');
                }
            },
            'plain-text',
        );
    }, [serverUrl, adminToken]);

    const renderUser = useCallback(({item}: {item: MMUser}) => {
        const meta = getRoleMeta(item.roles);
        const initials = getInitials(item);
        const colorIdx = item.id.charCodeAt(0) % COLORS.length;
        const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ');

        return (
            <TouchableOpacity style={style.userCard} onPress={() => setSelectedUser(item)} activeOpacity={0.8}>
                <View style={[style.avatar, {backgroundColor: COLORS[colorIdx]}]}>
                    <Text style={style.avatarText}>{initials}</Text>
                </View>
                <View style={style.userInfo}>
                    <Text style={style.userName}>{fullName || `@${item.username}`}</Text>
                    <Text style={style.userEmail}>{item.email}</Text>
                    <View style={[style.roleBadge, {backgroundColor: meta.color + '18'}]}>
                        <CompassIcon name={meta.icon} size={12} color={meta.color}/>
                        <Text style={[style.roleBadgeText, {color: meta.color}]}>{meta.label}</Text>
                    </View>
                </View>
                <CompassIcon name='chevron-right' size={18} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
            </TouchableOpacity>
        );
    }, [style, theme]);

    const FILTERS = [
        {key: 'all', label: 'Все'},
        {key: 'student', label: 'Студенты'},
        {key: 'staff', label: 'Педагоги'},
        {key: 'admin', label: 'Админы'},
    ] as const;

    return (
        <SafeAreaView style={style.container}>
            {/* Шапка */}
            <View style={style.header}>
                <TouchableOpacity style={style.backBtn} onPress={onClose}>
                    <CompassIcon name='arrow-left' size={22} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <View style={style.headerTexts}>
                    <Text style={style.headerTitle}>{'Пользователи'}</Text>
                    <Text style={style.headerMeta}>{`${users.length} аккаунтов в системе`}</Text>
                </View>
                <TouchableOpacity style={style.inviteBtn} onPress={handleInvite}>
                    <Text style={style.inviteBtnText}>{'+ Пригласить'}</Text>
                </TouchableOpacity>
            </View>

            {/* Поиск */}
            <View style={style.searchBox}>
                <CompassIcon name='magnify' size={18} color={changeOpacity(theme.centerChannelColor, 0.4)}/>
                <TextInput
                    style={style.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder='Поиск по имени, email...'
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                    returnKeyType='search'
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <CompassIcon name='close' size={16} color={changeOpacity(theme.centerChannelColor, 0.4)}/>
                    </TouchableOpacity>
                )}
            </View>

            {/* Фильтры */}
            <View style={style.filterRow}>
                {FILTERS.map(({key, label}) => (
                    <TouchableOpacity
                        key={key}
                        style={[style.filterChip, roleFilter === key && style.filterChipActive]}
                        onPress={() => setRoleFilter(key)}
                    >
                        <Text style={[style.filterChipText, roleFilter === key && style.filterChipTextActive]}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Список */}
            {loading ? (
                <View style={style.loadingBox}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            ) : (
                <FlatList
                    style={style.list}
                    contentContainerStyle={[style.listContent, filtered.length === 0 && {flex: 1}]}
                    data={filtered}
                    keyExtractor={(u) => u.id}
                    renderItem={renderUser}
                    onRefresh={loadUsers}
                    refreshing={loading}
                    ListEmptyComponent={
                        <View style={style.emptyBox}>
                            <CompassIcon name='account-search' size={52} color={changeOpacity(theme.centerChannelColor, 0.2)}/>
                            <Text style={style.emptyText}>{'Пользователей не найдено'}</Text>
                        </View>
                    }
                />
            )}

            {/* Bottom sheet — действия с пользователем */}
            {selectedUser && (
                <>
                    <TouchableOpacity style={style.sheetOverlay} onPress={() => setSelectedUser(null)} activeOpacity={1}/>
                    <View style={style.sheet}>
                        <View style={style.sheetHandle}/>
                        <View style={style.sheetUserRow}>
                            <View style={[style.avatar, {backgroundColor: COLORS[selectedUser.id.charCodeAt(0) % COLORS.length], marginRight: 12}]}>
                                <Text style={style.avatarText}>{getInitials(selectedUser)}</Text>
                            </View>
                            <View>
                                <Text style={style.sheetUserName}>
                                    {[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || `@${selectedUser.username}`}
                                </Text>
                                <Text style={style.sheetUserEmail}>{selectedUser.email}</Text>
                            </View>
                        </View>

                        {[
                            {
                                icon: 'message-text-outline', label: 'Написать сообщение',
                                meta: 'Открыть личный чат', color: theme.buttonBg,
                                onPress: () => { setSelectedUser(null); Alert.alert('Сообщение', `Перейти в чат с @${selectedUser.username}`); },
                            },
                            {
                                icon: 'account-arrow-up', label: 'Назначить педагогом/менеджером',
                                meta: 'Роль team_admin', color: '#c4973b',
                                onPress: () => handlePromoteToAdmin(selectedUser),
                            },
        {
                icon: 'cellphone', label: 'Привязать телефон',
                meta: 'Для SMS-входа в приложение', color: '#2d4a22',
                onPress: () => handleBindPhone(selectedUser),
            },
                            {
                                icon: 'account-remove-outline', label: 'Деактивировать аккаунт',
                                meta: 'Закрыть доступ к приложению', color: '#d24b4e',
                                onPress: () => handleDeactivate(selectedUser), destructive: true,
                            },
                        ].map((action) => (
                            <TouchableOpacity key={action.label} style={style.action} onPress={action.onPress} disabled={actionLoading}>
                                <View style={[style.actionIcon, {backgroundColor: action.color + '18'}]}>
                                    <CompassIcon name={action.icon} size={20} color={action.color}/>
                                </View>
                                <View style={{flex: 1}}>
                                    <Text style={[style.actionLabel, action.destructive && style.destructiveText]}>{action.label}</Text>
                                    <Text style={style.actionMeta}>{action.meta}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </>
            )}
        </SafeAreaView>
    );
}

export default AdminPanelScreen;
