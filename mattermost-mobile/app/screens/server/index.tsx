// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useManagedConfig} from '@mattermost/react-native-emm';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {Alert, BackHandler, Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {Navigation} from 'react-native-navigation';
import Animated from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';

import {doPing} from '@actions/remote/general';
import {ssoLogin} from '@actions/remote/session';
import {fetchConfigAndLicense} from '@actions/remote/systems';
import LocalConfig from '@assets/config.json';
import AppVersion from '@components/app_version';
import {Screens, Launch, DeepLink} from '@constants';
import useDidMount from '@hooks/did_mount';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {useScreenTransitionAnimation} from '@hooks/screen_transition_animation';
import {getServerCredentials} from '@init/credentials';
import PushNotifications from '@init/push_notifications';
import NetworkManager from '@managers/network_manager';
import SecurityManager from '@managers/security_manager';
import {getPrivacyConsentAccepted} from '@queries/app/global';
import {getServerByDisplayName, getServerByIdentifier} from '@queries/app/servers';
import Background from '@screens/background';
import {dismissModal, goToScreen, loginAnimationOptions, popTopScreen, resetToHome} from '@screens/navigation';
import {getErrorMessage} from '@utils/errors';
import {canReceiveNotifications} from '@utils/push_proxy';
import {loginOptions} from '@utils/server';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {getServerUrlAfterRedirect, isValidUrl, sanitizeUrl} from '@utils/url';

import ServerForm from './form';
import ServerHeader from './header';
import PrivacyConsentScreen from '../privacy_consent';
import PhoneLoginScreen from '../phone_login';

import type {DeepLinkWithData, LaunchProps} from '@typings/launch';
import type {AvailableScreens} from '@typings/screens/navigation';

interface ServerProps extends LaunchProps {
    animated?: boolean;
    closeButtonId?: string;
    componentId: AvailableScreens;
    isModal?: boolean;
    theme: Theme;
}

let cancelPing: undefined | (() => void);
const ACADEMY_DEFAULT_SERVER_URL = 'https://vm268473.hosted-by-robovps.ru';
const ACADEMY_DEFAULT_SERVER_NAME = 'Академия Образцовой';

const defaultServerUrlMessage = defineMessage({
    id: 'mobile.server_url.empty',
    defaultMessage: 'Please enter a valid server URL',
});

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    appInfo: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    appVersionContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: 24,
    },
    flex: {
        flex: 1,
    },
    scrollContainer: {
        alignItems: 'center',
        flexGrow: 1,
        justifyContent: 'center',
    },
}));

const AnimatedSafeArea = Animated.createAnimatedComponent(SafeAreaView);

const Server = ({
    animated,
    closeButtonId,
    componentId,
    displayName: defaultDisplayName,
    extra,
    isModal,
    launchType,
    launchError,
    serverUrl: defaultServerUrl,
    theme,
}: ServerProps) => {
    const intl = useIntl();
    const managedConfig = useManagedConfig<ManagedConfig>();
    const keyboardAwareRef = useRef<KeyboardAwareScrollView>(null);
    const [connecting, setConnecting] = useState(false);
    const [showPrivacyConsent, setShowPrivacyConsent] = useState(false);
    const [showPhoneLogin, setShowPhoneLogin] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            let accepted = false;
            try {
                accepted = await getPrivacyConsentAccepted();
            } catch {
                accepted = false;
            }
            if (!cancelled && !accepted) {
                setShowPrivacyConsent(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    const [displayName, setDisplayName] = useState<string>(ACADEMY_DEFAULT_SERVER_NAME);
    const [buttonDisabled, setButtonDisabled] = useState(true);
    const [preauthSecret, setPreauthSecret] = useState<string>('');
    const [url, setUrl] = useState<string>(ACADEMY_DEFAULT_SERVER_URL);
    const [displayNameError, setDisplayNameError] = useState<string | undefined>();
    const [urlError, setUrlError] = useState<string | undefined>();
    const [preauthSecretError, setPreauthSecretError] = useState<string | undefined>();
    const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
    const styles = getStyleSheet(theme);
    const {formatMessage} = intl;
    const academyServerUrl = managedConfig?.serverUrl || url || LocalConfig.DefaultServerUrl || ACADEMY_DEFAULT_SERVER_URL;
    const disableServerUrl = true;
    const additionalServer = launchType === Launch.AddServerFromDeepLink || launchType === Launch.AddServer;

    const dismiss = () => {
        NetworkManager.invalidateClient(url);
        dismissModal({componentId});
    };

    const animatedStyles = useScreenTransitionAnimation(componentId, animated);

    useEffect(() => {
        let serverName: string | undefined = defaultDisplayName || managedConfig?.serverName || LocalConfig.DefaultServerName || ACADEMY_DEFAULT_SERVER_NAME;
        let serverUrl: string | undefined = managedConfig?.serverUrl || defaultServerUrl || LocalConfig.DefaultServerUrl || ACADEMY_DEFAULT_SERVER_URL;
        let autoconnect = true;

        if (launchType === Launch.DeepLink || launchType === Launch.AddServerFromDeepLink) {
            const deepLinkServerUrl = (extra as DeepLinkWithData).data?.serverUrl;
            if (managedConfig.serverUrl) {
                autoconnect = (managedConfig.allowOtherServers === 'false' && managedConfig.serverUrl === deepLinkServerUrl);
                if (managedConfig.serverUrl !== deepLinkServerUrl || launchError) {
                    Alert.alert('', intl.formatMessage({
                        id: 'mobile.server_url.deeplink.emm.denied',
                        defaultMessage: 'This app is controlled by an EMM and the DeepLink server url does not match the EMM allowed server',
                    }));
                }
            } else {
                autoconnect = true;
                serverUrl = deepLinkServerUrl;
            }
        } else if (launchType === Launch.AddServer) {
            serverName = defaultDisplayName;
            serverUrl = defaultServerUrl;
        }

        if (serverUrl) {
            // If a server Url is set by the managed or local configuration, use it.
            setUrl(serverUrl);
        }

        if (serverName) {
            setDisplayName(serverName);
        }

        if (serverUrl && serverName && autoconnect) {
            // If no other servers are allowed or the local config for AutoSelectServerUrl is set, attempt to connect
            handleConnect(managedConfig?.serverUrl || LocalConfig.DefaultServerUrl);
        }

        // We only want to handle connect when a smaller set of variables change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managedConfig?.allowOtherServers, managedConfig?.serverUrl, managedConfig?.serverName, defaultServerUrl]);

    useEffect(() => {
        if (url && displayName && !urlError && !preauthSecretError) {
            setButtonDisabled(false);
        } else {
            setButtonDisabled(true);
        }
    }, [url, displayName, urlError, preauthSecretError]);

    useEffect(() => {
        const listener = {
            componentDidAppear: () => {
                if (url) {
                    NetworkManager.invalidateClient(url);
                }
            },
        };
        const unsubscribe = Navigation.events().registerComponentListener(listener, componentId);

        return () => unsubscribe.remove();
    }, [componentId, url]);

    useDidMount(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (LocalConfig.ShowOnboarding && animated) {
                popTopScreen(Screens.SERVER);
                return true;
            }
            if (isModal) {
                dismiss();
                return true;
            }

            return false;
        });

        PushNotifications.registerIfNeeded();

        return () => backHandler.remove();
    });

    useNavButtonPressed(closeButtonId || '', componentId, dismiss, []);

    const displayLogin = (serverUrl: string, config: ClientConfig, license: ClientLicense) => {
        const {enabledSSOs, hasLoginForm, numberSSOs, ssoOptions} = loginOptions(config, license);
        const passProps = {
            config,
            extra,
            hasLoginForm,
            launchError,
            launchType,
            license,
            serverDisplayName: displayName,
            serverPreauthSecret: preauthSecret.trim() || undefined,
            serverUrl,
            ssoOptions,
            theme,
        };

        const redirectSSO = !hasLoginForm && numberSSOs === 1;
        const screen = redirectSSO ? Screens.SSO : Screens.LOGIN;
        if (redirectSSO) {
            // @ts-expect-error ssoType not in definition
            passProps.ssoType = enabledSSOs[0];
        }

        // if deeplink is of type server removing the deeplink info on new login
        if (extra?.type === DeepLink.Server) {
            passProps.extra = undefined;
            passProps.launchType = Launch.Normal;
        }

        goToScreen(screen, '', passProps, loginAnimationOptions());
        setConnecting(false);
        setButtonDisabled(false);
        setUrl(serverUrl);
    };

    const handleConnect = async (manualUrl?: string) => {
        if (buttonDisabled && !manualUrl) {
            return;
        }

        if (connecting && cancelPing) {
            cancelPing();
            return;
        }

        const serverUrl = typeof manualUrl === 'string' ? manualUrl : url;
        if (!serverUrl || serverUrl.trim() === '') {
            setUrlError(formatMessage(defaultServerUrlMessage));
            return;
        }

        if (!isServerUrlValid(serverUrl)) {
            return;
        }

        if (displayNameError) {
            setDisplayNameError(undefined);
        }

        if (urlError) {
            setUrlError(undefined);
        }

        const server = await getServerByDisplayName(displayName);
        const credentials = await getServerCredentials(serverUrl);
        if (server && server.lastActiveAt > 0 && credentials?.token) {
            setButtonDisabled(true);
            setDisplayNameError(formatMessage({
                id: 'mobile.server_name.exists',
                defaultMessage: 'You are using this name for another server.',
            }));
            setConnecting(false);
            return;
        }

        pingServer(serverUrl);
    };

    const handleDisplayNameTextChanged = useCallback((text: string) => {
        setDisplayName(text);
        setDisplayNameError(undefined);
    }, []);

    const handleUrlTextChanged = useCallback((text: string) => {
        setUrlError(undefined);
        setUrl(text);
    }, []);

    const handlePreauthSecretTextChanged = useCallback((text: string) => {
        setPreauthSecret(text);

        // Clear any connection errors when preauth secret is modified
        if (urlError) {
            setUrlError(undefined);
        }
        if (preauthSecretError) {
            setPreauthSecretError(undefined);
        }
    }, [urlError, preauthSecretError]);

    const isServerUrlValid = (serverUrl?: string) => {
        const testUrl = sanitizeUrl(serverUrl ?? url);
        if (!isValidUrl(testUrl)) {
            setUrlError(intl.formatMessage({
                id: 'mobile.server_url.invalid_format',
                defaultMessage: 'URL must start with http:// or https://',
            }));
            return false;
        }
        return true;
    };

    const pingServer = async (pingUrl: string, retryWithHttp = true) => {
        let canceled = false;
        setConnecting(true);
        cancelPing = () => {
            canceled = true;
            setConnecting(false);
            cancelPing = undefined;
        };

        const headRequest = await getServerUrlAfterRedirect(pingUrl, !retryWithHttp, preauthSecret.trim() || undefined);
        if (!headRequest.url) {
            cancelPing();
            if (retryWithHttp) {
                const nurl = pingUrl.replace('https:', 'http:');
                pingServer(nurl, false);
            } else {
                setUrlError(getErrorMessage(headRequest.error, intl));
                setButtonDisabled(true);
                setConnecting(false);
            }
            return;
        }
        const result = await doPing(
            headRequest.url,
            true, // verifyPushProxy
            managedConfig?.timeout ? parseInt(managedConfig?.timeout, 10) : undefined, // timeoutInterval
            preauthSecret.trim() || undefined, // preauthSecret
        );

        if (canceled) {
            return;
        }

        if (result.error) {
            if (result.isPreauthError) {
                setPreauthSecretError(intl.formatMessage({
                    id: 'mobile.server.preauth_secret.invalid',
                    defaultMessage: 'Authentication secret is invalid. Try again or contact your admin.',
                }));
                setShowAdvancedOptions(true);
            } else {
                setUrlError(getErrorMessage(result.error, intl));
            }
            setButtonDisabled(true);
            setConnecting(false);
            return;
        }

        canReceiveNotifications(headRequest.url, result.canReceiveNotifications as string, intl);
        const data = await fetchConfigAndLicense(headRequest.url, true);
        if (data.error) {
            setButtonDisabled(true);
            setUrlError(getErrorMessage(data.error, intl));
            setConnecting(false);
            return;
        }

        if (!data.config?.DiagnosticId) {
            setUrlError(formatMessage({
                id: 'mobile.diagnostic_id.empty',
                defaultMessage: 'A DiagnosticId value is missing for this server. Contact your system admin to review this value and restart the server.',
            }));
            setConnecting(false);
            return;
        }

        if (data.config.MobileJailbreakProtection === 'true') {
            const isJailbroken = await SecurityManager.isDeviceJailbroken(headRequest.url, data.config.SiteName);
            if (isJailbroken) {
                setConnecting(false);
                return;
            }
        }

        if (data.config.MobileEnableBiometrics === 'true') {
            const biometricsResult = await SecurityManager.authenticateWithBiometrics(headRequest.url, data.config.SiteName);
            if (!biometricsResult) {
                setConnecting(false);
                return;
            }
        }

        const server = await getServerByIdentifier(data.config.DiagnosticId);
        const credentials = await getServerCredentials(headRequest.url);
        setConnecting(false);

        if (server && server.lastActiveAt > 0 && credentials?.token) {
            setButtonDisabled(true);
            setUrlError(formatMessage({
                id: 'mobile.server_identifier.exists',
                defaultMessage: 'You are already connected to this server.',
            }));
            return;
        }

        displayLogin(headRequest.url, data.config!, data.license!);
    };

    const handlePhoneLoginSuccess = useCallback(async (token: string, _userId: string) => {
        if (!academyServerUrl) {
            setUrlError(formatMessage(defaultServerUrlMessage));
            return;
        }
        setConnecting(true);
        try {
            const cl = await fetchConfigAndLicense(academyServerUrl, true);
            if (cl.error || !cl.config?.DiagnosticId) {
                setUrlError(cl.error ? getErrorMessage(cl.error, intl) : formatMessage({
                    id: 'mobile.diagnostic_id.empty',
                    defaultMessage: 'A DiagnosticId value is missing for this server. Contact your system admin to review this value and restart the server.',
                }));
                return;
            }

            const loginResult = await ssoLogin(
                academyServerUrl,
                cl.config.SiteName || 'Академия Образцовой',
                cl.config.DiagnosticId,
                token,
                '',
            );

            if (loginResult.failed || loginResult.error) {
                setUrlError(getErrorMessage(loginResult.error, intl));
                return;
            }

            setShowPhoneLogin(false);
            resetToHome({launchType: Launch.Normal, serverUrl: academyServerUrl});
        } finally {
            setConnecting(false);
        }
    }, [academyServerUrl, formatMessage, intl]);

    return (
        <View
            style={styles.flex}
            testID='server.screen'
            nativeID={SecurityManager.getShieldScreenId(componentId, false, true)}
        >
            <Modal
                visible={showPrivacyConsent}
                animationType='slide'
                presentationStyle='fullScreen'
                statusBarTranslucent={true}
            >
                <PrivacyConsentScreen
                    onAccept={() => setShowPrivacyConsent(false)}
                    onDecline={() => BackHandler.exitApp()}
                />
            </Modal>

            {/* Вход по телефону */}
            <Modal
                visible={showPhoneLogin}
                animationType='slide'
                presentationStyle='fullScreen'
            >
                <PhoneLoginScreen
                    serverUrl={academyServerUrl}
                    onSuccess={handlePhoneLoginSuccess}
                    onBack={() => setShowPhoneLogin(false)}
                />
            </Modal>
            <Background theme={theme}/>
            <AnimatedSafeArea
                key={'server_content'}
                style={[styles.flex, animatedStyles]}
            >
                <KeyboardAwareScrollView
                    bounces={false}
                    contentContainerStyle={styles.scrollContainer}
                    enableAutomaticScroll={false}
                    enableOnAndroid={false}
                    enableResetScrollToCoords={true}
                    extraScrollHeight={20}
                    keyboardDismissMode='on-drag'
                    keyboardShouldPersistTaps='handled'
                    ref={keyboardAwareRef}
                    scrollToOverflowEnabled={true}
                    style={styles.flex}
                >
                    <ServerHeader
                        additionalServer={additionalServer}
                        theme={theme}
                    />
                    <ServerForm
                        autoFocus={additionalServer}
                        buttonDisabled={buttonDisabled}
                        connecting={connecting}
                        displayName={displayName}
                        displayNameError={displayNameError}
                        disableServerUrl={disableServerUrl}
                        handleConnect={handleConnect}
                        handleDisplayNameTextChanged={handleDisplayNameTextChanged}
                        handlePreauthSecretTextChanged={handlePreauthSecretTextChanged}
                        handleUrlTextChanged={handleUrlTextChanged}
                        keyboardAwareRef={keyboardAwareRef}
                        preauthSecret={preauthSecret}
                        preauthSecretError={preauthSecretError}
                        setShowAdvancedOptions={setShowAdvancedOptions}
                        showAdvancedOptions={showAdvancedOptions}
                        theme={theme}
                        url={url}
                        urlError={urlError}
                    />
                    {/* Кнопка «Войти по телефону» — под стандартной формой */}
                    <View style={{alignItems: 'center', marginTop: 12, marginBottom: 4}}>
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            marginBottom: 14, paddingHorizontal: 32,
                        }}>
                            <View style={{flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)'}}/>
                            <Text style={{color: 'rgba(255,255,255,0.4)', fontSize: 12}}>{'или'}</Text>
                            <View style={{flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)'}}/>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowPhoneLogin(true)}
                            style={{
                                flexDirection: 'row', alignItems: 'center', gap: 8,
                                backgroundColor: 'rgba(196,151,59,0.15)',
                                borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28,
                                borderWidth: 1, borderColor: 'rgba(196,151,59,0.35)',
                            }}
                        >
                            <Text style={{fontSize: 18}}>{'📱'}</Text>
                            <Text style={{color: '#c4973b', fontWeight: '700', fontSize: 15}}>
                                {'Войти по номеру телефона'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.appVersionContainer}>
                        <AppVersion
                            textStyle={styles.appInfo}
                            isWrapped={false}
                        />
                    </View>
                </KeyboardAwareScrollView>
            </AnimatedSafeArea>
        </View>
    );
};

export default Server;
