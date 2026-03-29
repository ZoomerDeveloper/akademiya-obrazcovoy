// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

type Post = {
    id: string;
    create_at: number;
    message: string;
    user_id: string;
}

type Props = {
    post: Post;
    channelId: string;
    theme: Theme;
    canDelete?: boolean;
    onDelete?: (postId: string) => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    card: {
        backgroundColor: theme.centerChannelBg,
        marginHorizontal: 12,
        marginVertical: 6,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.buttonBg,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    avatarText: {
        color: theme.buttonColor,
        fontSize: 14,
        fontWeight: '700',
    },
    metaContainer: {
        flex: 1,
    },
    actions: {
        marginLeft: 8,
    },
    deleteIcon: {
        padding: 4,
    },
    authorName: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.centerChannelColor,
    },
    timestamp: {
        fontSize: 11,
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginTop: 1,
    },
    message: {
        fontSize: 15,
        lineHeight: 22,
        color: theme.centerChannelColor,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        marginVertical: 12,
    },
}));

const normalizeMessageForFeed = (message: string): string => {
    if (!message) {
        return '';
    }
    return message.replace(/^\s*#{1,6}\s+/m, '').trim();
};

const formatTimestamp = (ms: number): string => {
    const date = new Date(ms);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
        const mins = Math.floor(diffMs / (1000 * 60));
        return `${mins} мин. назад`;
    }
    if (diffHours < 24) {
        return `${Math.floor(diffHours)} ч. назад`;
    }
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

function NewsFeedPost({post, theme, canDelete, onDelete}: Props) {
    const style = getStyleSheet(theme);

    const initials = useMemo(() => {
        return post.user_id.slice(0, 2).toUpperCase();
    }, [post.user_id]);

    const cleanedMessage = useMemo(() => normalizeMessageForFeed(post.message), [post.message]);

    return (
        <View style={style.card}>
            <View style={style.header}>
                <View style={style.avatar}>
                    <Text style={style.avatarText}>{initials}</Text>
                </View>
                <View style={style.metaContainer}>
                    <Text
                        style={style.authorName}
                        numberOfLines={1}
                    >
                        {'Академия Образцовой'}
                    </Text>
                    <Text style={style.timestamp}>
                        {formatTimestamp(post.create_at)}
                    </Text>
                </View>
                {canDelete && onDelete && (
                    <View style={style.actions}>
                        <TouchableOpacity
                            onPress={() => onDelete(post.id)}
                            style={style.deleteIcon}
                            accessibilityRole='button'
                            accessibilityLabel='Удалить пост'
                        >
                            <CompassIcon
                                name='trash-can-outline'
                                size={18}
                                color={changeOpacity(theme.centerChannelColor, 0.6)}
                            />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
            <Text style={style.message}>{cleanedMessage}</Text>
        </View>
    );
}

export default NewsFeedPost;
