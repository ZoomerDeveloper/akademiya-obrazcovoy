// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {getBookingServiceUrl} from '@utils/academy_service';
import {fetchWithTimeout} from '@utils/fetch_utils';

interface CreateNewsPostModalProps {
    visible: boolean;
    onDismiss: () => void;
    channelId: string;
    channelName: string;
    currentUserId: string;
    authorName: string;
    sessionToken: string;
    isSystemAdmin: boolean;
    onPostCreated: () => void;
}

interface ThemeProps {
    centerChannelBg: string;
    centerChannelColor: string;
    linkColor: string;
    buttonColor: string;
}

async function readErrorMessage(resp: Response, fallback: string) {
    try {
        const data = await resp.json();
        return (data?.message || data?.error || fallback) as string;
    } catch {
        return fallback;
    }
}

function getStyleSheet(theme: ThemeProps) {
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
            borderBottomColor: `${theme.centerChannelColor}20`,
        },
        headerTitle: {
            fontSize: 16,
            fontWeight: '600' as const,
            color: theme.centerChannelColor,
        },
        closeBtn: {
            padding: 8,
        },
        content: {
            flex: 1,
            padding: 16,
        },
        formGroup: {
            marginBottom: 20,
        },
        label: {
            fontSize: 13,
            fontWeight: '600' as const,
            color: `${theme.centerChannelColor}BC`,
            marginBottom: 8,
            textTransform: 'uppercase' as const,
        },
        titleInput: {
            borderWidth: 1,
            borderColor: `${theme.centerChannelColor}26`,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            color: theme.centerChannelColor,
            backgroundColor: `${theme.centerChannelColor}0D`,
        },
        bodyInput: {
            borderWidth: 1,
            borderColor: `${theme.centerChannelColor}26`,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 13,
            color: theme.centerChannelColor,
            backgroundColor: `${theme.centerChannelColor}0D`,
            minHeight: 120,
            textAlignVertical: 'top' as const,
        },
        footer: {
            flexDirection: 'row' as const,
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: `${theme.centerChannelColor}26`,
        },
        submitBtn: {
            flex: 1,
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            gap: 6,
            backgroundColor: theme.linkColor,
            borderRadius: 8,
            paddingVertical: 12,
        },
        submitBtnText: {
            color: theme.buttonColor,
            fontSize: 14,
            fontWeight: '600' as const,
        },
        cancelBtn: {
            flex: 1,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            borderRadius: 8,
            paddingVertical: 12,
            backgroundColor: `${theme.centerChannelColor}19`,
        },
        cancelBtnText: {
            color: theme.centerChannelColor,
            fontSize: 14,
            fontWeight: '600' as const,
        },
    };
}

function CreateNewsPostModal({
    visible,
    onDismiss,
    channelId,
    channelName,
    currentUserId,
    authorName,
    sessionToken,
    isSystemAdmin,
    onPostCreated,
}: CreateNewsPostModalProps) {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isValid = title.trim().length > 0 && body.trim().length > 0;

    const handleSubmit = useCallback(async () => {
        if (!isValid || isSubmitting) {
            return;
        }

        setIsSubmitting(true);

        try {
            if (!channelId || !sessionToken) {
                Alert.alert('Ошибка', 'Нет активной сессии или канала для публикации');
                return;
            }

            if (isSystemAdmin) {
                // Publish directly to Mattermost
                const formatted = `## ${title}\n\n${body}`;
                const resp = await fetchWithTimeout(`${serverUrl}/api/v4/posts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${sessionToken}`,
                    },
                    body: JSON.stringify({
                        channel_id: channelId,
                        message: formatted,
                    }),
                });

                if (!resp.ok) {
                    throw new Error(await readErrorMessage(resp, 'Не удалось опубликовать пост'));
                }

                Alert.alert('Успешно', 'Пост опубликован');
            } else {
                // Send to moderation queue (booking_service)
                const formatted = `## ${title}\n\n${body}`;
                const resp = await fetchWithTimeout(`${getBookingServiceUrl(serverUrl)}/api/post-drafts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${sessionToken}`,
                    },
                    body: JSON.stringify({
                        tab: channelName === 'novosti-sotrudnikam' ? 'news_staff' : 'news_students',
                        title,
                        body,
                        formatted_message: formatted,
                        author_id: currentUserId,
                        author_name: authorName,
                        channel_id: channelId,
                    }),
                });

                if (!resp.ok) {
                    throw new Error(await readErrorMessage(resp, 'Не удалось отправить пост на модерацию'));
                }

                Alert.alert('Успешно', 'Пост отправлен на модерацию');
            }

            setTitle('');
            setBody('');
            onPostCreated();
            onDismiss();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Не удалось создать пост';
            Alert.alert('Ошибка', message);
        } finally {
            setIsSubmitting(false);
        }
    }, [isValid, isSubmitting, title, body, isSystemAdmin, serverUrl, currentUserId, authorName, channelId, channelName, sessionToken, onPostCreated, onDismiss]);

    return (
        <Modal
            visible={visible}
            animationType='slide'
            presentationStyle='fullScreen'
        >
            <SafeAreaView style={style.container}>
                {/* Header */}
                <View style={style.header}>
                    <Text style={style.headerTitle}>
                        {isSystemAdmin ? 'Новый пост' : 'Предложить пост'}
                    </Text>
                    <TouchableOpacity
                        style={style.closeBtn}
                        onPress={onDismiss}
                    >
                        <CompassIcon
                            name='close'
                            size={20}
                            color={theme.centerChannelColor}
                        />
                    </TouchableOpacity>
                </View>

                {/* Form */}
                <ScrollView style={style.content}>
                    <View style={style.formGroup}>
                        <Text style={style.label}>{'Заголовок'}</Text>
                        <TextInput
                            style={style.titleInput}
                            placeholder={'Введите заголовок...'}
                            placeholderTextColor={theme.centerChannelColor + '66'}
                            value={title}
                            onChangeText={setTitle}
                            editable={!isSubmitting}
                        />
                    </View>

                    <View style={style.formGroup}>
                        <Text style={style.label}>{'Текст'}</Text>
                        <TextInput
                            style={style.bodyInput}
                            placeholder={'Напишите текст поста...'}
                            placeholderTextColor={theme.centerChannelColor + '66'}
                            value={body}
                            onChangeText={setBody}
                            editable={!isSubmitting}
                            multiline={true}
                            numberOfLines={4}
                        />
                    </View>
                </ScrollView>

                {/* Footer */}
                <View style={style.footer}>
                    <TouchableOpacity
                        style={style.cancelBtn}
                        onPress={onDismiss}
                        disabled={isSubmitting}
                    >
                        <Text style={style.cancelBtnText}>{'Отмена'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[style.submitBtn, {opacity: isValid ? 1 : 0.5}]}
                        onPress={handleSubmit}
                        disabled={isSubmitting || !isValid}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator
                                size='small'
                                color={theme.buttonColor}
                            />
                        ) : (
                            <>
                                <CompassIcon
                                    name='check'
                                    size={16}
                                    color={theme.buttonColor}
                                />
                                <Text style={style.submitBtnText}>
                                    {isSystemAdmin ? 'Опубликовать' : 'Отправить'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

export default CreateNewsPostModal;
