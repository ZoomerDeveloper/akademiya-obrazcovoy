// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';

import {useServerUrl} from '@context/server';
import {getActiveServerUrl} from '@init/credentials';

/**
 * URL текущего сервера для API. Контекст `useServerUrl` в кастомной навигации часто пустой;
 * тогда берём активный сервер из БД / Keychain (как при логине).
 */
export function useResolvedServerUrl(): string {
    const ctxUrl = useServerUrl();
    const [url, setUrl] = useState(ctxUrl);

    useEffect(() => {
        if (ctxUrl) {
            setUrl(ctxUrl);
            return;
        }
        let cancelled = false;
        const apply = (u: string | undefined) => {
            if (!cancelled && u) {
                setUrl((prev) => prev || u);
            }
        };
        getActiveServerUrl().then(apply);
        const t = setTimeout(() => {
            getActiveServerUrl().then(apply);
        }, 500);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [ctxUrl]);

    return url || '';
}
