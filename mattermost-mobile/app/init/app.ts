// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallsManager} from '@calls/calls_manager';
import {Launch} from '@constants';
import DatabaseManager from '@database/manager';
import {getAllServerCredentials} from '@init/credentials';
import {initialLaunch} from '@init/launch';
import ManagedApp from '@init/managed_app';
import PushNotifications from '@init/push_notifications';
import GlobalEventHandler from '@managers/global_event_handler';
import NetworkManager from '@managers/network_manager';
import SecurityManager from '@managers/security_manager';
import SessionManager from '@managers/session_manager';
import WebsocketManager from '@managers/websocket_manager';
import {registerScreens} from '@screens/index';
import {registerNavigationListeners, resetToSelectServer} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import NavigationStore from '@store/navigation_store';
import {setDevHotLoadingEnabled} from '@utils/dev_hot_reload';
import {logError, logInfo} from '@utils/log';
import {InteractionManager, Platform} from 'react-native';

// Controls whether the main initialization (database, etc...) is done, either on app launch
// or on the Share Extension, for example.
let baseAppInitialized = false;

let serverCredentials: ServerCredential[];

/** Let the native run loop finish first frame / bridge settle before touching SQLite (avoids hangs after "Opened database"). */
function yieldToNative(): Promise<void> {
    if (Platform.OS !== 'ios') {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
                setImmediate(resolve);
            });
        });
    });
}

// Fallback Polyfill for Promise.allSettle
Promise.allSettled = Promise.allSettled || (<T>(promises: Array<Promise<T>>) => Promise.all(
    promises.map((p) => p.
        then((value) => ({
            status: 'fulfilled',
            value,
        })).
        catch((reason) => ({
            status: 'rejected',
            reason,
        })),
    ),
));

export async function initialize() {
    if (baseAppInitialized) {
        return;
    }

    const credentials = await getAllServerCredentials();
    const serverUrls = credentials.map((credential) => credential.serverUrl);

    await DatabaseManager.init(serverUrls);
    await NetworkManager.init(credentials);
    await SecurityManager.init();

    GlobalEventHandler.init();
    ManagedApp.init();
    SessionManager.init();
    CallsManager.initialize();

    serverCredentials = credentials;
    baseAppInitialized = true;
    if (__DEV__) {
        logInfo('[MM] initialize() complete (DB + network + security)');
    }
}

export async function start() {
    try {
        // Clean relevant information on ephemeral stores
        NavigationStore.reset();
        EphemeralStore.setCurrentThreadId('');
        EphemeralStore.setProcessingNotification('');

        registerNavigationListeners();

        await yieldToNative();
        if (__DEV__) {
            logInfo('[MM] starting initialize() after native yield');
        }

        try {
            await initialize();
        } catch (e) {
            logError('[start] initialize failed', e);
            registerScreens();
            resetToSelectServer({launchType: Launch.Normal, coldStart: true});
            return;
        }

        // Register root screens only after DB/network init — require('@screens/home') pulls a huge module
        // graph; doing that before SQLite is ready has caused deadlocks (splash never dismisses).
        registerScreens();

        PushNotifications.init(serverCredentials.length > 0);

        try {
            await WebsocketManager.init(serverCredentials);
            await initialLaunch();
        } catch (e) {
            logError('[start] post-init failed', e);
            resetToSelectServer({launchType: Launch.Normal, coldStart: true});
        }
    } finally {
        setDevHotLoadingEnabled(true);
    }
}
