// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DatabaseProvider} from '@nozbe/watermelondb/react';
import React, {type ComponentType, useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';

import DeviceInfoProvider from '@context/device';
import ServerProvider from '@context/server';
import ThemeProvider from '@context/theme';
import UserLocaleProvider from '@context/user_locale';
import DatabaseManager from '@database/manager';
import {subscribeActiveServers} from '@database/subscription/servers';
import {getActiveServerUrl} from '@init/credentials';
import {getAllServers} from '@queries/app/servers';

import type {Database} from '@nozbe/watermelondb';
import type ServersModel from '@typings/database/models/app/servers';
import type {LaunchProps} from '@typings/launch';

type State = {
    database: Database;
    serverUrl: string;
    serverDisplayName: string;
};

export function withServerDatabase<T extends JSX.IntrinsicAttributes>(Component: ComponentType<T>): ComponentType<T> {
    return function ServerDatabaseComponent(props: T) {
        const [state, setState] = useState<State | undefined>();

        const observer = (servers: ServersModel[]) => {
            const server = servers?.length ? servers.reduce((a, b) =>
                (b.lastActiveAt > a.lastActiveAt ? b : a),
            ) : undefined;

            if (server) {
                const key = DatabaseManager.resolveServerUrlKey(server.url);
                const database = key ? DatabaseManager.serverDatabases[key]?.database : undefined;

                if (database) {
                    setState({
                        database,
                        serverUrl: server.url,
                        serverDisplayName: server.displayName,
                    });
                }
            }
        };

        useEffect(() => {
            let cancelled = false;

            const applyDatabaseForKey = async (launchUrl: string): Promise<boolean> => {
                const key = DatabaseManager.resolveServerUrlKey(launchUrl);
                if (!key) {
                    return false;
                }

                const database = DatabaseManager.serverDatabases[key]?.database;
                if (!database) {
                    return false;
                }

                const all = await getAllServers();
                const server = all.find((s) => (DatabaseManager.resolveServerUrlKey(s.url) || s.url) === key) ||
                    all.find((s) => s.url === launchUrl || s.url === key);

                if (cancelled) {
                    return false;
                }

                if (server) {
                    setState({
                        database,
                        serverUrl: server.url,
                        serverDisplayName: server.displayName,
                    });
                    return true;
                }

                setState({
                    database,
                    serverUrl: key,
                    serverDisplayName: key,
                });
                return true;
            };

            const bootstrap = async () => {
                await DatabaseManager.ensureInitialized();
                if (cancelled) {
                    return;
                }

                const launchProps = props as unknown as LaunchProps;
                const candidates: string[] = [];
                if (launchProps.serverUrl) {
                    candidates.push(launchProps.serverUrl);
                }
                const activeUrl = await getActiveServerUrl();
                if (activeUrl && !candidates.includes(activeUrl)) {
                    candidates.push(activeUrl);
                }

                for (const url of candidates) {
                    /* eslint-disable-next-line no-await-in-loop */
                    if (await applyDatabaseForKey(url)) {
                        return;
                    }
                }

                const loadedKeys = Object.keys(DatabaseManager.serverDatabases);
                if (loadedKeys.length === 1) {
                    await applyDatabaseForKey(loadedKeys[0]);
                }
            };

            bootstrap();

            const subscription = subscribeActiveServers(observer);

            return () => {
                cancelled = true;
                subscription?.unsubscribe();
            };
        }, []);

        if (!state?.database) {
            return (
                <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1c1c1c'}}>
                    <ActivityIndicator
                        size='large'
                        color='#ffffff'
                    />
                </View>
            );
        }

        return (
            <DatabaseProvider
                database={state.database}
                key={state.serverUrl}
            >
                <DeviceInfoProvider>
                    <UserLocaleProvider database={state.database}>
                        <ServerProvider server={{displayName: state.serverDisplayName, url: state.serverUrl}}>
                            <ThemeProvider database={state.database}>
                                <Component {...props}/>
                            </ThemeProvider>
                        </ServerProvider>
                    </UserLocaleProvider>
                </DeviceInfoProvider>
            </DatabaseProvider>
        );
    };
}
