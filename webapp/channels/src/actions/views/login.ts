// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {batchActions} from 'redux-batched-actions';

import type {ServerError} from '@mattermost/types/errors';
import type {UserProfile} from '@mattermost/types/users';

import {UserTypes} from 'mattermost-redux/action_types';
import {logError} from 'mattermost-redux/actions/errors';
import {loadRolesIfNeeded} from 'mattermost-redux/actions/roles';
import {Client4} from 'mattermost-redux/client';

import type {ActionFuncAsync, DispatchFunc} from 'types/store';

/**
 * Mattermost сначала берёт токен из HttpOnly-cookie MMAUTHTOKEN, и только потом из Authorization.
 * На странице логина часто лежит протухшая cookie — тогда Bearer PAT игнорируется и API отвечает UserRequired.
 * POST /logout с credentials выставляет Set-Cookie и сбрасывает сессионные cookie (см. api4.Logout).
 */
async function clearMmSessionCookiesBeforePatLogin(): Promise<void> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };
        const csrf = Client4.getCSRFFromCookie();
        if (csrf) {
            headers['X-CSRF-Token'] = csrf;
        }
        await fetch(`${Client4.getUrl()}/api/v4/users/logout`, {
            method: 'POST',
            credentials: 'include',
            headers,
        });
    } catch {
        // продолжаем — иначе PAT всё равно попробуем
    }
    Client4.setCSRF('');
}

async function handleLoginSuccess(dispatch: DispatchFunc, loggedInUserProfile: UserProfile) {
    dispatch(
        batchActions([
            {
                type: UserTypes.LOGIN_SUCCESS,
            },
            {
                type: UserTypes.RECEIVED_ME,
                data: loggedInUserProfile,
            },
        ]),
    );

    dispatch(loadRolesIfNeeded(loggedInUserProfile.roles.split(' ')));
}

async function performLogin(
    dispatch: DispatchFunc,
    loginFunc: () => Promise<UserProfile>,
) {
    dispatch({type: UserTypes.LOGIN_REQUEST, data: null});

    try {
        // This is partial user profile we received when we login. We still need to make getMe for complete user profile.
        const loggedInUserProfile = await loginFunc();

        await handleLoginSuccess(dispatch, loggedInUserProfile);
    } catch (error) {
        dispatch({
            type: UserTypes.LOGIN_FAILURE,
            error,
        });
        dispatch(logError(error as ServerError));
        return {error};
    }

    return {data: true};
}

export function login(loginId: string, password: string, mfaToken = ''): ActionFuncAsync {
    return async (dispatch) => {
        // Root.tsx выставляет setAuthHeader = false — авторизация через cookie сессии после /users/login.
        Client4.setAuthHeader = false;
        Client4.setIncludeCookies(true);
        return performLogin(dispatch, () => Client4.login(loginId, password, mfaToken));
    };
}

export function loginWithDesktopToken(token: string): ActionFuncAsync {
    return async (dispatch) => {
        Client4.setAuthHeader = false;
        Client4.setIncludeCookies(true);
        return performLogin(dispatch, () => Client4.loginWithDesktopToken(token));
    };
}

/**
 * Вход по персональному токену (выдаётся SMS Auth после verify-code).
 * Root.tsx держит setAuthHeader = false — Client4 тогда НЕ добавляет Authorization даже при setToken (только cookie).
 * Для PAT включаем setAuthHeader и credentials: 'omit', иначе последующие loadMe идут без Bearer.
 */
export function loginWithPersonalAccessToken(token: string): ActionFuncAsync {
    return async (dispatch) => {
        const previousIncludeCookies = Client4.getIncludeCookies();
        const previousSetAuthHeader = Client4.setAuthHeader;
        Client4.setIncludeCookies(false);
        Client4.setAuthHeader = true;
        const result = await performLogin(dispatch, async () => {
            await clearMmSessionCookiesBeforePatLogin();
            Client4.setToken(token);
            return Client4.getMe();
        });
        if (result.error) {
            Client4.setIncludeCookies(previousIncludeCookies);
            Client4.setAuthHeader = previousSetAuthHeader;
        }
        return result;
    };
}

export function loginById(id: string, password: string): ActionFuncAsync {
    return async (dispatch) => {
        Client4.setAuthHeader = false;
        Client4.setIncludeCookies(true);
        return performLogin(dispatch, () => Client4.loginById(id, password, ''));
    };
}

export function getUserLoginType(loginId: string): ActionFuncAsync<{auth_service: 'magic_link' | ''; is_deactivated: boolean }> {
    return async (dispatch) => {
        try {
            const response = await Client4.getUserLoginType(loginId);
            return {data: {auth_service: response.auth_service ?? '', is_deactivated: response.is_deactivated ?? false}};
        } catch (error) {
            dispatch(logError(error as ServerError));
            return {error};
        }
    };
}
