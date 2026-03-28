// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Launch} from '@constants';
import {RUNNING_E2E} from '@env';
import TurboLogger from '@mattermost/react-native-turbo-log';
import {LogBox, Platform, UIManager} from 'react-native';
import ViewReactNativeStyleAttributes from 'react-native/Libraries/Components/View/ReactNativeStyleAttributes';
import 'react-native-gesture-handler';
import {Navigation} from 'react-native-navigation';

import {start} from './app/init/app';
import {resetToSelectServer} from './app/screens/navigation';
import {setDevHotLoadingEnabled} from './app/utils/dev_hot_reload';
import setFontFamily from './app/utils/font_family';
import {logError, logInfo} from './app/utils/log';

declare const global: { HermesInternal: null | {} };

// Add scaleY back to work around its removal in React Native 0.70.
ViewReactNativeStyleAttributes.scaleY = true;

TurboLogger.configure({
    dailyRolling: false,
    logToFile: !__DEV__,
    maximumFileSize: 1024 * 1024,
    maximumNumberOfFiles: 2,
});

if (__DEV__) {
    LogBox.ignoreLogs([
        'new NativeEventEmitter',
    ]);

    // Ignore all notifications if running e2e
    const isRunningE2e = RUNNING_E2E === 'true';
    logInfo(`RUNNING_E2E: ${RUNNING_E2E}, isRunningE2e: ${isRunningE2e}`);
    if (isRunningE2e) {
        LogBox.ignoreAllLogs(true);
    }
}

setFontFamily();

if (global.HermesInternal) {
    // Polyfills required to use Intl with Hermes engine
    require('@formatjs/intl-getcanonicallocales/polyfill-force');
    require('@formatjs/intl-locale/polyfill-force');
    require('@formatjs/intl-pluralrules/polyfill-force');
    require('@formatjs/intl-numberformat/polyfill-force');
    require('@formatjs/intl-datetimeformat/polyfill-force');
    require('@formatjs/intl-datetimeformat/add-all-tz');
    require('@formatjs/intl-listformat/polyfill-force');
    require('@formatjs/intl-relativetimeformat/polyfill-force');
    require('@formatjs/intl-displaynames/polyfill-force');
}

if (Platform.OS === 'android') {
    const ShareExtension = require('share_extension/index.tsx').default;
    const AppRegistry = require('react-native/Libraries/ReactNative/AppRegistry');
    AppRegistry.registerComponent('MattermostShare', () => ShareExtension);
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

let mmStartInFlight: Promise<void> | null = null;

Navigation.events().registerAppLaunchedListener(async () => {
    if (mmStartInFlight) {
        await mmStartInFlight;
        return;
    }

    mmStartInFlight = (async () => {
        setDevHotLoadingEnabled(false);
        try {
            await start();
        } catch (e) {
            logError('[index] Unhandled error during app start', e);
            try {
                resetToSelectServer({launchType: Launch.Normal, coldStart: true});
            } catch (e2) {
                logError('[index] Fallback resetToSelectServer failed', e2);
            }
        }
    })().finally(() => {
        mmStartInFlight = null;
    });

    await mmStartInFlight;
});
