// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {getBookingServiceUrl} from '@utils/academy_service';
import {fetchWithRetry, fetchWithTimeout} from '@utils/fetch_utils';
import {changeOpacity} from '@utils/theme';

type Draft = {
    id: string;
    tab: string;
    title: string;
    body: string;
    author_name: string;
    status: string;
    reject_reason?: string;
    created_at: number;
}

type Props = {
    visible: boolean;
    onClose: () => void;
    token: string;
    serverUrl?: string;
    onChanged: () => void;
}

function getStyleSheet(theme: Theme) {
    return {
        container: {
            flex: 1,
            backgroundColor: theme.centerChannelBg,
        },
        header: {
            flexDirection: 'row' as const,
            justifyContent: 'space-between' as const,
            alignItems: 'center' as const,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: changeOpacity(theme.centerChannelColor, 0.12),
        },
        title: {
            fontSize: 16,
            fontWeight: '700' as const,
            color: theme.centerChannelColor,
        },
        list: {flex: 1},
        listContent: {padding: 12},
        card: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: changeOpacity(theme.centerChannelColor, 0.12),
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
        },
        cardTitle: {fontSize: 14, fontWeight: '700' as const, color: theme.centerChannelColor},
        cardMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.55), marginTop: 4},
        cardBody: {fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.75), marginTop: 8},
        row: {flexDirection: 'row' as const, gap: 8, marginTop: 10},
        btn: {
            flex: 1,
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            flexDirection: 'row' as const,
            gap: 6,
        },
        approveBtn: {backgroundColor: '#2d4a22'},
        rejectBtn: {backgroundColor: '#6b1f1f'},
        btnText: {fontSize: 12, fontWeight: '700' as const, color: '#fff'},
        emptyWrap: {flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32},
        emptyText: {fontSize: 14, color: changeOpacity(theme.centerChannelColor, 0.45), marginTop: 10, textAlign: 'center' as const},
    };
}

function DraftsModerationModal({visible, onClose, token, serverUrl, onChanged}: Props) {
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<Draft[]>([]);

    const loadDrafts = useCallback(async () => {
        if (!token) {
            return;
        }
        setLoading(true);
        try {
            const resp = await fetchWithRetry(`${getBookingServiceUrl(serverUrl)}/api/post-drafts?status=pending`, {
                headers: {Authorization: `Bearer ${token}`},
            }, {retries: 2, timeoutMs: 10000});
            if (resp.ok) {
                const rows = await resp.json();
                setItems(Array.isArray(rows) ? rows : []);
            } else {
                Alert.alert('Ошибка', 'Не удалось загрузить черновики');
            }
        } finally {
            setLoading(false);
        }
    }, [token, serverUrl]);

    useEffect(() => {
        if (visible) {
            loadDrafts();
        }
    }, [visible, loadDrafts]);

    const moderate = useCallback(async (draft: Draft, approve: boolean) => {
        try {
            const url = approve ?
                `${getBookingServiceUrl(serverUrl)}/api/post-drafts/${draft.id}/approve` :
                `${getBookingServiceUrl(serverUrl)}/api/post-drafts/${draft.id}/reject`;
            const resp = await fetchWithTimeout(url, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: approve ? '{}' : JSON.stringify({reject_reason: 'Отклонено модератором'}),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                throw new Error(data.error || 'Ошибка модерации');
            }
            await loadDrafts();
            onChanged();
        } catch (e) {
            Alert.alert('Ошибка', (e as Error).message);
        }
    }, [loadDrafts, onChanged, token, serverUrl]);

    const renderItem = ({item}: {item: Draft}) => (
        <View style={style.card}>
            <Text style={style.cardTitle}>{item.title || 'Без заголовка'}</Text>
            <Text style={style.cardMeta}>
                {`${item.tab} · ${item.author_name || 'автор не указан'}`}
            </Text>
            {item.body ? <Text style={style.cardBody} numberOfLines={4}>{item.body}</Text> : null}
            <View style={style.row}>
                <TouchableOpacity style={[style.btn, style.approveBtn]} onPress={() => moderate(item, true)}>
                    <CompassIcon name='check' size={14} color='#fff'/>
                    <Text style={style.btnText}>{'Одобрить'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[style.btn, style.rejectBtn]} onPress={() => moderate(item, false)}>
                    <CompassIcon name='close' size={14} color='#fff'/>
                    <Text style={style.btnText}>{'Отклонить'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <Modal visible={visible} animationType='slide' presentationStyle='fullScreen'>
            <SafeAreaView style={style.container}>
                <View style={style.header}>
                    <Text style={style.title}>{'Черновики на модерации'}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <CompassIcon name='close' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>
                {loading ? (
                    <View style={style.emptyWrap}>
                        <ActivityIndicator size='large' color={theme.buttonBg}/>
                    </View>
                ) : (
                    <FlatList
                        style={style.list}
                        contentContainerStyle={[style.listContent, items.length === 0 && style.emptyWrap]}
                        data={items}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        ListEmptyComponent={(
                            <View style={style.emptyWrap}>
                                <CompassIcon name='check-circle-outline' size={42} color={changeOpacity(theme.centerChannelColor, 0.25)}/>
                                <Text style={style.emptyText}>{'Новых черновиков нет'}</Text>
                            </View>
                        )}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}

export default DraftsModerationModal;
