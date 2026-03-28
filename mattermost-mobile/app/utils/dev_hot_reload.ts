// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Fast Refresh / hot loading can invalidate the RN bridge while WatermelonDB native SQLite
 * is still initializing — the native "Opened database" step never completes its JS callback
 * and the app stays on the splash screen. Toggle hot loading off during cold start, then on.
 */
export function setDevHotLoadingEnabled(enabled: boolean): void {
    if (!__DEV__) {
        return;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NativeDevSettings = require('react-native/Libraries/NativeModules/specs/NativeDevSettings').default;
        if (typeof NativeDevSettings?.setHotLoadingEnabled === 'function') {
            NativeDevSettings.setHotLoadingEnabled(enabled);
        }
    } catch {
        // TurboModule may be unavailable very early
    }
}
