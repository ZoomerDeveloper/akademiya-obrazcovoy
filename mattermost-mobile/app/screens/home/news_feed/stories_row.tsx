// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';

export type Story = {
    id: string;
    title: string;
    emoji: string;
    color: string;
    date: string;
    content: string;
    authorRole: string;
}

type Props = {
    stories: Story[];
    theme: Theme;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    scroll: {
        paddingHorizontal: 14,
    },
    storyItem: {
        alignItems: 'center',
        marginRight: 14,
        width: 68,
    },
    storyRing: {
        width: 62,
        height: 62,
        borderRadius: 31,
        padding: 2,
        marginBottom: 6,
    },
    storyInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.centerChannelBg,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    storyEmoji: {
        fontSize: 26,
    },
    storyLabel: {
        fontSize: 10,
        color: changeOpacity(theme.centerChannelColor, 0.7),
        textAlign: 'center',
        lineHeight: 13,
        width: 68,
    },
    // Viewer modal
    modalOverlay: {
        flex: 1,
        backgroundColor: '#000',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: Platform.OS === 'android' ? 16 : 0,
    },
    modalDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    modalDotEmoji: {
        fontSize: 14,
    },
    modalMeta: {
        flex: 1,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    modalAuthor: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        marginTop: 1,
    },
    modalClose: {
        padding: 4,
    },
    modalContent: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: 24,
        paddingBottom: 48,
    },
    modalContentTitle: {
        color: '#fff',
        fontSize: 26,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 12,
        lineHeight: 32,
    },
    modalDate: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginBottom: 16,
    },
    modalBody: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 16,
        lineHeight: 24,
    },
    progressRow: {
        flexDirection: 'row',
        padding: 12,
        gap: 4,
    },
    progressBar: {
        flex: 1,
        height: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    progressBarActive: {
        backgroundColor: '#fff',
    },
}));

function StoryViewer({stories, initialIndex, onClose, theme}: {
    stories: Story[];
    initialIndex: number;
    onClose: () => void;
    theme: Theme;
}) {
    const [current, setCurrent] = useState(initialIndex);
    const style = getStyleSheet(theme);
    const story = stories[current];

    const goNext = useCallback(() => {
        if (current < stories.length - 1) {
            setCurrent(current + 1);
        } else {
            onClose();
        }
    }, [current, stories.length, onClose]);

    const goPrev = useCallback(() => {
        if (current > 0) {
            setCurrent(current - 1);
        }
    }, [current]);

    return (
        <SafeAreaView style={[style.modalOverlay, {backgroundColor: story.color}]}>
            {/* Прогресс */}
            <View style={style.progressRow}>
                {stories.map((_, i) => (
                    <View
                        key={i}
                        style={[style.progressBar, i <= current && style.progressBarActive]}
                    />
                ))}
            </View>

            {/* Шапка */}
            <View style={style.modalHeader}>
                <View style={[style.modalDot, {backgroundColor: 'rgba(255,255,255,0.2)'}]}>
                    <Text style={style.modalDotEmoji}>{story.emoji}</Text>
                </View>
                <View style={style.modalMeta}>
                    <Text style={style.modalTitle}>{story.title}</Text>
                    <Text style={style.modalAuthor}>{story.authorRole}</Text>
                </View>
                <TouchableOpacity
                    style={style.modalClose}
                    onPress={onClose}
                >
                    <CompassIcon
                        name='close'
                        size={22}
                        color='rgba(255,255,255,0.8)'
                    />
                </TouchableOpacity>
            </View>

            {/* Навигация свайпом (области нажатия) */}
            <View style={{flex: 1, flexDirection: 'row'}}>
                <Pressable
                    style={{flex: 1}}
                    onPress={goPrev}
                />
                <Pressable
                    style={{flex: 2}}
                    onPress={goNext}
                />
            </View>

            {/* Контент */}
            <View style={style.modalContent}>
                <Text style={style.modalDate}>{story.date}</Text>
                <Text style={style.modalContentTitle}>{story.title}</Text>
                <Text style={style.modalBody}>{story.content}</Text>
            </View>
        </SafeAreaView>
    );
}

function StoriesRow({stories, theme}: Props) {
    const style = getStyleSheet(theme);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const openStory = useCallback((index: number) => {
        setActiveIndex(index);
        setViewerOpen(true);
    }, []);

    if (!stories.length) {
        return null;
    }

    return (
        <View style={style.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={style.scroll}
            >
                {stories.map((story, index) => (
                    <TouchableOpacity
                        key={story.id}
                        style={style.storyItem}
                        onPress={() => openStory(index)}
                        activeOpacity={0.8}
                    >
                        <View style={[style.storyRing, {backgroundColor: story.color}]}>
                            <View style={style.storyInner}>
                                <Text style={style.storyEmoji}>{story.emoji}</Text>
                            </View>
                        </View>
                        <Text
                            style={style.storyLabel}
                            numberOfLines={2}
                        >
                            {story.title}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <Modal
                visible={viewerOpen}
                animationType='fade'
                presentationStyle='fullScreen'
                statusBarTranslucent
            >
                <StoryViewer
                    stories={stories}
                    initialIndex={activeIndex}
                    onClose={() => setViewerOpen(false)}
                    theme={theme}
                />
            </Modal>
        </View>
    );
}

export default StoriesRow;
