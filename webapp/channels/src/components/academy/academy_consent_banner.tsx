// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {useSelector} from 'react-redux';

import type {GlobalState} from 'types/store';

/**
 * Глобальное напоминание о согласии на ПДн (ТЗ Privacy & Legal).
 * Тот же ключ localStorage, что и в /academy — academy.privacy_consent.{userId}
 */
export default function AcademyConsentBanner() {
    const currentUserId = useSelector((state: GlobalState) => state.entities.users.currentUserId);
    const location = useLocation();
    const [checked, setChecked] = useState(false);
    const [dismissedSession, setDismissedSession] = useState(false);
    const [hasConsent, setHasConsent] = useState(true);

    const storageKey = useMemo(() => (currentUserId ? `academy.privacy_consent.${currentUserId}` : ''), [currentUserId]);

    useEffect(() => {
        if (!storageKey) {
            setHasConsent(true);
            return;
        }
        setHasConsent(window.localStorage.getItem(storageKey) === '1');
    }, [storageKey, location.pathname]);

    if (!currentUserId || !storageKey) {
        return null;
    }

    if (location.pathname.startsWith('/academy')) {
        return null;
    }

    if (hasConsent || dismissedSession) {
        return null;
    }

    const save = () => {
        if (!checked) {
            return;
        }
        window.localStorage.setItem(storageKey, '1');
        setHasConsent(true);
    };

    return (
        <div
            className='academy-consent-banner'
            style={{
                background: '#1e3a8a',
                color: '#fff',
                padding: '10px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
                zIndex: 1200,
                justifyContent: 'space-between',
            }}
        >
            <div style={{flex: '1 1 280px'}}>
                <b>Академия:</b>{' '}
                подтвердите согласие на обработку персональных данных. Вход по почте или по SMS — на странице входа в систему.
            </div>
            <label style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <input
                    type='checkbox'
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                />
                <span>Согласен(на)</span>
            </label>
            <button
                type='button'
                className='btn btn-primary btn-sm'
                onClick={save}
                disabled={!checked}
            >
                Сохранить
            </button>
            <Link
                to='/academy'
                style={{color: '#bfdbfe'}}
            >
                Открыть Академию →
            </Link>
            <button
                type='button'
                className='btn btn-tertiary btn-sm'
                style={{color: '#fff', borderColor: 'rgba(255,255,255,0.35)'}}
                onClick={() => setDismissedSession(true)}
            >
                Позже
            </button>
        </div>
    );
}
