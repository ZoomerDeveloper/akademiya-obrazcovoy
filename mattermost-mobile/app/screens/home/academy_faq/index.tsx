// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo, useState} from 'react';
import {
    Alert,
    LayoutAnimation,
    Linking,
    Platform,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {fetchChannelByName, switchToChannelById} from '@actions/remote/channel';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {useTheme} from '@context/theme';
import {observeCurrentUser} from '@queries/servers/user';
import {getAcademyRoleFlags} from '@utils/academy_roles';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import FAQ_DATA, {type FaqItem, type FaqSection} from './faq_data';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    currentUser?: UserModel;
}

type SectionListItem = {
    title: string;
    icon: string;
    data: FaqItem[];
}

/** Канал из сценария «Организация» (hub.tsx) — ресепшн для связи с администрацией. */
const RECEPTION_CHANNEL_NAME = 'resepchen';
const ADMIN_MAILTO = 'mailto:admin@образцова.academy';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelBg, 1),
    },
    header: {
        backgroundColor: theme.sidebarHeaderBg,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    headerTitle: {
        color: theme.sidebarHeaderTextColor,
        fontSize: 20,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 12,
        marginTop: 4,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.sidebarHeaderTextColor, 0.1),
        borderRadius: 10,
        paddingHorizontal: 10,
        height: 40,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.sidebarHeaderTextColor,
        fontSize: 15,
        paddingVertical: 0,
    },
    clearButton: {
        padding: 4,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    sectionIcon: {
        marginRight: 8,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: changeOpacity(theme.centerChannelColor, 0.6),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    faqItem: {
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
        overflow: 'hidden',
    },
    questionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    question: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        color: theme.centerChannelColor,
        marginRight: 12,
        lineHeight: 21,
    },
    answerContainer: {
        paddingBottom: 14,
    },
    answer: {
        fontSize: 14,
        lineHeight: 21,
        color: changeOpacity(theme.centerChannelColor, 0.75),
    },
    noResults: {
        padding: 40,
        alignItems: 'center',
    },
    noResultsText: {
        fontSize: 15,
        color: changeOpacity(theme.centerChannelColor, 0.45),
        textAlign: 'center',
    },
    contactBanner: {
        margin: 12,
        padding: 16,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.2),
    },
    contactText: {
        flex: 1,
        marginLeft: 12,
    },
    contactTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.buttonBg,
        marginBottom: 2,
    },
    contactSubtitle: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.55),
    },
}));

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

function FaqItemRow({item, theme}: {item: FaqItem; theme: Theme}) {
    const style = getStyleSheet(theme);
    const [expanded, setExpanded] = useState(false);

    const toggle = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded((v) => !v);
    }, []);

    return (
        <View style={style.faqItem}>
            <TouchableOpacity
                style={style.questionRow}
                onPress={toggle}
                accessibilityRole='button'
                accessibilityState={{expanded}}
            >
                <Text style={style.question}>{item.question}</Text>
                <CompassIcon
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={changeOpacity(theme.centerChannelColor, 0.45)}
                />
            </TouchableOpacity>
            {expanded ? (
                <View style={style.answerContainer}>
                    <Text style={style.answer}>{item.answer}</Text>
                </View>
            ) : null}
        </View>
    );
}

function AcademyFaqScreen({currentUser}: Props) {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();
    const style = getStyleSheet(theme);
    const [query, setQuery] = useState('');

    const isStaff = useMemo(
        () => getAcademyRoleFlags(currentUser?.roles).isStaff,
        [currentUser?.roles],
    );

    const sections = useMemo((): SectionListItem[] => {
        const userRole = isStaff ? 'staff' : 'student';
        const q = query.toLowerCase().trim();

        return FAQ_DATA
            .filter((section) =>
                section.roles.includes('all') || section.roles.includes(userRole as 'student' | 'staff'),
            )
            .map((section: FaqSection) => {
                const filteredItems = section.items.filter((item) => {
                    const roleOk = item.roles.includes('all') || item.roles.includes(userRole as 'student' | 'staff');
                    if (!roleOk) {
                        return false;
                    }
                    if (!q) {
                        return true;
                    }
                    return item.question.toLowerCase().includes(q) ||
                           item.answer.toLowerCase().includes(q);
                });
                return {
                    title: section.title,
                    icon: section.icon,
                    data: filteredItems,
                };
            })
            .filter((s) => s.data.length > 0);
    }, [isStaff, query]);

    const renderItem = useCallback(({item}: {item: FaqItem}) => (
        <FaqItemRow
            item={item}
            theme={theme}
        />
    ), [theme]);

    const renderSectionHeader = useCallback(({section}: {section: SectionListItem}) => (
        <View style={style.sectionHeader}>
            <CompassIcon
                name={section.icon}
                size={16}
                color={changeOpacity(theme.centerChannelColor, 0.55)}
                style={style.sectionIcon}
            />
            <Text style={style.sectionTitle}>{section.title}</Text>
        </View>
    ), [style, theme]);

    const openContactAdmin = useCallback(async () => {
        if (!serverUrl) {
            Alert.alert(
                'Нет подключения к серверу',
                'Войдите в приложение и попробуйте снова.',
            );
            return;
        }
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = (await getCurrentTeamId(database)) || '';
            const fetched = await fetchChannelByName(serverUrl, teamId, RECEPTION_CHANNEL_NAME, false);
            if (fetched.error || !fetched.channel?.id) {
                throw new Error('channel not available');
            }
            const channelId = fetched.channel.id;
            if (!channelId) {
                Alert.alert(
                    'Канал не найден',
                    'Зайдите во вкладку «Мессенджер» и выберите канал ресепшн, либо напишите администрации на почту.',
                    [
                        {text: 'OK', style: 'cancel'},
                        {
                            text: 'Написать на почту',
                            onPress: () => Linking.openURL(ADMIN_MAILTO).catch(() => null),
                        },
                    ],
                );
                return;
            }
            await switchToChannelById(serverUrl, channelId, teamId);
        } catch {
            Alert.alert(
                'Не удалось открыть чат',
                'Попробуйте позже или напишите на почту администрации.',
                [
                    {text: 'OK', style: 'cancel'},
                    {
                        text: 'Написать на почту',
                        onPress: () => Linking.openURL(ADMIN_MAILTO).catch(() => null),
                    },
                ],
            );
        }
    }, [serverUrl]);

    const ListFooter = useCallback(() => (
        <TouchableOpacity
            style={style.contactBanner}
            accessibilityRole='button'
            onPress={openContactAdmin}
        >
            <CompassIcon
                name='message-text-outline'
                size={24}
                color={theme.buttonBg}
            />
            <View style={style.contactText}>
                <Text style={style.contactTitle}>{'Не нашли ответ?'}</Text>
                <Text style={style.contactSubtitle}>{'Напишите администратору Академии'}</Text>
            </View>
            <CompassIcon
                name='chevron-right'
                size={20}
                color={changeOpacity(theme.buttonBg, 0.5)}
            />
        </TouchableOpacity>
    ), [openContactAdmin, style, theme]);

    return (
        <View style={style.container}>
            <View style={[style.header, {paddingTop: insets.top + 8}]}>
                <Text style={style.headerTitle}>{'FAQ'}</Text>
                <View style={style.searchContainer}>
                    <CompassIcon
                        name='magnify'
                        size={18}
                        color={changeOpacity(theme.sidebarHeaderTextColor, 0.6)}
                        style={style.searchIcon}
                    />
                    <TextInput
                        style={style.searchInput}
                        placeholder='Поиск по вопросам...'
                        placeholderTextColor={changeOpacity(theme.sidebarHeaderTextColor, 0.45)}
                        value={query}
                        onChangeText={setQuery}
                        returnKeyType='search'
                        clearButtonMode='while-editing'
                        autoCorrect={false}
                    />
                    {query.length > 0 && Platform.OS === 'android' && (
                        <TouchableOpacity
                            style={style.clearButton}
                            onPress={() => setQuery('')}
                        >
                            <CompassIcon
                                name='close'
                                size={18}
                                color={changeOpacity(theme.sidebarHeaderTextColor, 0.6)}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {sections.length === 0 ? (
                <View style={style.noResults}>
                    <Text style={style.noResultsText}>
                        {`По запросу «${query}» ничего не найдено`}
                    </Text>
                </View>
            ) : (
                <SectionList
                    style={style.list}
                    contentContainerStyle={style.listContent}
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    ListFooterComponent={ListFooter}
                    stickySectionHeadersEnabled={true}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhance(AcademyFaqScreen));
