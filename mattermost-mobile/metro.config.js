// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    resolver: {
        // Shim для Node.js-модуля 'events', который нужен @mattermost/calls.
        // В React Native нет Node.js runtime, поэтому добавляем собственную реализацию.
        extraNodeModules: {
            events: path.resolve(__dirname, 'shims/events.js'),
        },
    },
};

module.exports = mergeConfig(defaultConfig, config);
