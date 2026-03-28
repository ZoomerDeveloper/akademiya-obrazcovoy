// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {Link, useHistory, useLocation} from 'react-router-dom';

import type {Team} from '@mattermost/types/teams';

import {loadMe} from 'mattermost-redux/actions/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getIsOnboardingFlowEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getTeamByName, getMyTeamMember} from 'mattermost-redux/selectors/entities/teams';

import {redirectUserToDefaultTeam} from 'actions/global_actions';
import {addUserToTeamFromInvite} from 'actions/team_actions';
import LocalStorageStore from 'stores/local_storage_store';

import type {GlobalState} from 'types/store';

import SmsAuthPanel from './sms_auth_panel';

import {setCSRFFromCookie} from 'utils/utils';

import './login.scss';

/**
 * Отдельная страница входа по телефону (требование заказчика: доп. страница SMS + email на /login).
 */
const SmsLoginPage = () => {
    const dispatch = useDispatch();
    const history = useHistory();
    const {search} = useLocation();
    const searchParam = useMemo(() => new URLSearchParams(search), [search]);
    const redirectTo = searchParam.get('redirect_to');

    const {ExperimentalPrimaryTeam} = useSelector(getConfig);
    const experimentalPrimaryTeam = useSelector((state: GlobalState) => (ExperimentalPrimaryTeam ? getTeamByName(state, ExperimentalPrimaryTeam) : undefined));
    const experimentalPrimaryTeamMember = useSelector((state: GlobalState) => (experimentalPrimaryTeam ? getMyTeamMember(state, experimentalPrimaryTeam.id) : undefined));
    const onboardingFlowEnabled = useSelector(getIsOnboardingFlowEnabled);

    const [busy, setBusy] = useState(false);

    const finishSignin = useCallback((team?: Team) => {
        setCSRFFromCookie();
        LocalStorageStore.setWasLoggedIn(true);
        LocalStorageStore.setWasNotifiedOfLogIn(false);

        if (redirectTo && redirectTo.match(/^\/([^/]|$)/)) {
            history.push(redirectTo);
        } else if (team) {
            history.push(`/${team.name}`);
        } else if (experimentalPrimaryTeamMember?.team_id) {
            history.push(`/${ExperimentalPrimaryTeam}`);
        } else if (onboardingFlowEnabled) {
            history.push('/');
        } else {
            redirectUserToDefaultTeam();
        }
    }, [ExperimentalPrimaryTeam, experimentalPrimaryTeamMember?.team_id, history, onboardingFlowEnabled, redirectTo]);

    const handleSmsLoginSuccess = useCallback(async () => {
        setBusy(true);
        await dispatch(loadMe());

        const inviteToken = searchParam.get('t') || '';
        const inviteId = searchParam.get('id') || '';

        if (inviteId || inviteToken) {
            const {data: inviteTeam} = await dispatch(addUserToTeamFromInvite(inviteToken, inviteId));
            finishSignin(inviteTeam || undefined);
        } else {
            finishSignin();
        }
        setBusy(false);
    }, [dispatch, finishSignin, searchParam]);

    return (
        <div className='login-body'>
            <div className='login-body-content'>
                <div className='login-body-card'>
                    <div className='login-body-card-form'>
                        <div style={{marginBottom: 16}}>
                            <Link
                                to={'/login' + (search || '')}
                                className='login-body-card-header-link'
                            >
                                {'← Вход по email или логину'}
                            </Link>
                        </div>
                        <h2 style={{marginTop: 0, marginBottom: 8}}>
                            {'Вход по номеру телефона'}
                        </h2>
                        <p style={{opacity: 0.75, fontSize: 14, marginBottom: 16}}>
                            {'Укажите номер и код из SMS. Сервис sms_auth должен быть запущен на сервере Академии.'}
                        </p>
                        <SmsAuthPanel
                            onLoginSuccess={handleSmsLoginSuccess}
                            disabled={busy}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmsLoginPage;
