// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {MM_TABLES} from '@constants/database';
import DatabaseManager from '@database/manager';

import type ServersModel from '@typings/database/models/app/servers';

const {SERVERS} = MM_TABLES.APP;

export const subscribeActiveServers = (observer: (servers: ServersModel[]) => void) => {
    const db = DatabaseManager.appDatabase?.database;
    if (!db) {
        observer([]);
        return {unsubscribe: () => undefined};
    }

    return db.
        get<ServersModel>(SERVERS).
        query().
        observeWithColumns(['display_name', 'last_active_at', 'url', 'identifier']).
        subscribe((allServers: ServersModel[]) => {
            const withLoadedDatabase = allServers.filter((s) => DatabaseManager.resolveServerUrlKey(s.url));
            observer(withLoadedDatabase);
        });
};

export const subscribeAllServers = (observer: (servers: ServersModel[]) => void) => {
    const db = DatabaseManager.appDatabase?.database;
    return db?.
        get<ServersModel>(SERVERS).
        query().
        observeWithColumns(['last_active_at']).
        subscribe(observer);
};

