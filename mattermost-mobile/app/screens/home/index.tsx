// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useHardwareKeyboardEvents} from '@mattermost/hardware-keyboard';
import {createBottomTabNavigator, type BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {NavigationContainer, DefaultTheme, type NavigationState} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Platform, StatusBar, StyleSheet, View} from 'react-native';
import tinyColor from 'tinycolor2';
import {useKeyboardState} from 'react-native-keyboard-controller';
import {enableFreeze, enableScreens} from 'react-native-screens';

import {autoUpdateTimezone} from '@actions/remote/user';
import ServerVersion from '@components/server_version';
import {Events, Launch, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {useAppState} from '@hooks/device';
import useDidMount from '@hooks/did_mount';
import SecurityManager from '@managers/security_manager';
import {getAllServers} from '@queries/app/servers';
import {findChannels, popToRoot} from '@screens/navigation';
import NavigationStore from '@store/navigation_store';
import {alertInvalidDeepLink, parseAndHandleDeepLink} from '@utils/deep_link';
import {logError} from '@utils/log';
import {alertChannelArchived, alertChannelRemove, alertTeamRemove} from '@utils/navigation';
import {notificationError} from '@utils/notification';

import AcademyFaq from './academy_faq';
import AcademyProfile from './academy_profile';
import AcademySchedule from './academy_schedule';
import ChannelList from './channel_list';
import NewsFeed from './news_feed';
import TabBar from './tab_bar';

import type {DeepLinkWithData, LaunchProps} from '@typings/launch';

if (Platform.OS === 'ios') {
    // We do this on iOS to avoid conflicts betwen ReactNavigation & Wix ReactNativeNavigation
    enableScreens(false);
}

// In this custom navigation setup (RNN + React Navigation), freezing inactive
// screens can lock transitions after runtime theme updates.
enableFreeze(false);

type HomeProps = LaunchProps & {
    componentId: string;
};

const Tab = createBottomTabNavigator();

function resolveAcademyTabFromPayload(payload?: Record<string, unknown>): string {
    if (!payload) {
        return Screens.NEWS_FEED;
    }
    const probe = [
        payload['channel_name'],
        payload['channel_display_name'],
        payload['category'],
        payload['type'],
        payload['message'],
    ].map((v) => String(v || '').toLowerCase()).join(' ');

    if (probe.includes('novosti') || probe.includes('afisha') || probe.includes('news')) {
        return Screens.NEWS_FEED;
    }
    if (
        probe.includes('booking') ||
        probe.includes('raspis') ||
        probe.includes('schedule') ||
        probe.includes('актов')
    ) {
        return Screens.ACADEMY_SCHEDULE;
    }
    return Screens.NEWS_FEED;
}

/** Только FAQ — тёмная шапка и светлый статус-бар; профиль целиком светлый как остальные табы. */
function isAcademyFaqTab(state: NavigationState | undefined): boolean {
    if (state?.routes == null || state.index == null) {
        return false;
    }
    const route = state.routes[state.index];
    return route?.name === Screens.ACADEMY_FAQ;
}

const updateTimezoneIfNeeded = async () => {
    try {
        const servers = await getAllServers();
        for (const server of servers) {
            if (server.url && server.lastActiveAt > 0) {
                autoUpdateTimezone(server.url);
            }
        }
    } catch (e) {
        logError('Localize change', e);
    }
};

const styles = StyleSheet.create({
    flex: {flex: 1},
});

export function HomeScreen(props: HomeProps) {
    const theme = useTheme();
    const intl = useIntl();
    const appState = useAppState();
    const keyboardState = useKeyboardState();
    const [isEmojiSearchFocused, setIsEmojiSearchFocused] = useState(false);
    const [academyFaqStatusBar, setAcademyFaqStatusBar] = useState(false);
    const navigationRef = React.useRef<any>(null);

    const onNavigationStateChange = useCallback((state: NavigationState | undefined) => {
        setAcademyFaqStatusBar(isAcademyFaqTab(state));
    }, []);

    useEffect(() => {
        SecurityManager.start();
    }, []);

    useEffect(() => {
        // Hide tab bar when keyboard opens, show when it closes
        DeviceEventEmitter.emit(Events.TAB_BAR_VISIBLE, !keyboardState.isVisible);
    }, [keyboardState.isVisible]);

    const handleFindChannels = useCallback(() => {
        if (!NavigationStore.getScreensInStack().includes(Screens.FIND_CHANNELS)) {
            findChannels(
                intl.formatMessage({id: 'find_channels.title', defaultMessage: 'Find Channels'}),
                theme,
            );
        }
    }, [intl, theme]);

    const events = useMemo(() => ({onFindChannels: handleFindChannels}), [handleFindChannels]);
    useHardwareKeyboardEvents(events);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.NOTIFICATION_ERROR, (value: 'Team' | 'Channel' | 'Post' | 'Connection') => {
            notificationError(intl, value);
        });

        return () => {
            listener.remove();
        };
    }, [intl]);

    useEffect(() => {
        const leaveTeamListener = DeviceEventEmitter.addListener(Events.LEAVE_TEAM, (displayName: string) => {
            alertTeamRemove(displayName, intl);
        });

        const leaveChannelListener = DeviceEventEmitter.addListener(Events.LEAVE_CHANNEL, (displayName: string) => {
            alertChannelRemove(displayName, intl);
        });

        const archivedChannelListener = DeviceEventEmitter.addListener(Events.CHANNEL_ARCHIVED, (displayName: string) => {
            alertChannelArchived(displayName, intl);
        });

        const crtToggledListener = DeviceEventEmitter.addListener(Events.CRT_TOGGLED, (isSameServer: boolean) => {
            if (isSameServer) {
                popToRoot();
            }
        });

        return () => {
            leaveTeamListener.remove();
            leaveChannelListener.remove();
            archivedChannelListener.remove();
            crtToggledListener.remove();
        };
    }, [intl]);

    useEffect(() => {
        if (appState === 'active') {
            updateTimezoneIfNeeded();
        }
    }, [appState]);

    useDidMount(() => {
        if (props.launchType === Launch.DeepLink) {
            if (props.launchError) {
                alertInvalidDeepLink(intl);
                return;
            }

            const deepLink = props.extra as DeepLinkWithData;
            if (deepLink?.url) {
                parseAndHandleDeepLink(deepLink.url, intl, props.componentId, true).then((result) => {
                    if (result.error) {
                        alertInvalidDeepLink(intl);
                    }
                });
            }
        }
    });

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.EMOJI_PICKER_SEARCH_FOCUSED, (focused: boolean) => {
            setIsEmojiSearchFocused(focused);
        });

        return () => listener.remove();
    }, []);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.ACADEMY_NOTIFICATION_OPENED, (payload?: Record<string, unknown>) => {
            const target = resolveAcademyTabFromPayload(payload);
            navigationRef.current?.navigate?.(target);
        });
        return () => listener.remove();
    }, []);

    const TabBarComponent = (tabProps: BottomTabBarProps) => {
        if (isEmojiSearchFocused) {
            return null;
        }

        return (
            <TabBar
                {...tabProps}
                theme={theme}
            />
        );
    };
    TabBarComponent.displayName = 'TabBarComponent';

    const initialHomeTabRoute = useMemo(() => {
        if (props.launchType !== Launch.Notification) {
            return Screens.NEWS_FEED;
        }
        const payload = (props.extra as {payload?: Record<string, unknown>} | undefined)?.payload;
        return resolveAcademyTabFromPayload(payload);
    }, [props.extra, props.launchType]);

    const channelBg = theme.centerChannelBg;
    const channelBgDark = tinyColor(channelBg).isDark();
    const statusBarBg = academyFaqStatusBar ? theme.sidebarHeaderBg : channelBg;
    const barStyle = academyFaqStatusBar ? 'light-content' : (channelBgDark ? 'light-content' : 'dark-content');

    return (
        <View
            style={styles.flex}
            nativeID={SecurityManager.getShieldScreenId(Screens.HOME, true)}
        >
            <StatusBar
                backgroundColor={statusBarBg}
                barStyle={barStyle}
            />
            <NavigationContainer
                ref={navigationRef}
                onStateChange={onNavigationStateChange}
                theme={{
                    ...DefaultTheme,
                    dark: false,
                    colors: {
                        ...DefaultTheme.colors,
                        primary: theme.centerChannelColor,
                        background: theme.centerChannelBg,
                        card: theme.centerChannelBg,
                        text: theme.centerChannelColor,
                        border: 'white',
                        notification: theme.mentionHighlightBg,
                    },
                }}
            >
                <Tab.Navigator
                    initialRouteName={initialHomeTabRoute}
                    screenOptions={({route}) => ({
                        headerShown: false,
                        lazy: true,
                        // iOS отключает native screens (конфликт с RNN); иначе неактивные табы часто остаются в дереве и визуально накладываются.
                        unmountOnBlur: true,
                        sceneContainerStyle: {
                            flex: 1,
                            backgroundColor:
                                route.name === Screens.ACADEMY_FAQ ? theme.sidebarHeaderBg : theme.centerChannelBg,
                        },
                    })}
                    backBehavior='none'
                    tabBar={TabBarComponent}
                >
                    {/* Таб 1: Лента новостей — посадочная страница (referens: VkusVill) */}
                    <Tab.Screen
                        name={Screens.NEWS_FEED}
                        component={NewsFeed}
                        options={{tabBarButtonTestID: 'tab_bar.news_feed.tab'}}
                    />
                    {/* Таб 2: Мессенджер — чаты и каналы */}
                    <Tab.Screen
                        name={Screens.HOME}
                        options={{tabBarButtonTestID: 'tab_bar.home.tab'}}
                    >
                        {() => <ChannelList {...props}/>}
                    </Tab.Screen>
                    {/* Таб 3: Занятость Академии — классы + Актовый зал (referens: S17) */}
                    <Tab.Screen
                        name={Screens.ACADEMY_SCHEDULE}
                        component={AcademySchedule}
                        options={{tabBarButtonTestID: 'tab_bar.academy_schedule.tab'}}
                    />
                    {/* Таб 4: Личный кабинет (referens: Будь здоров) */}
                    <Tab.Screen
                        name={Screens.ACADEMY_PROFILE}
                        component={AcademyProfile}
                        options={{tabBarButtonTestID: 'tab_bar.academy_profile.tab'}}
                    />
                    {/* Таб 5: FAQ */}
                    <Tab.Screen
                        name={Screens.ACADEMY_FAQ}
                        component={AcademyFaq}
                        options={{tabBarButtonTestID: 'tab_bar.academy_faq.tab'}}
                    />
                </Tab.Navigator>
            </NavigationContainer>
            <ServerVersion/>
        </View>
    );
}

export default HomeScreen;
