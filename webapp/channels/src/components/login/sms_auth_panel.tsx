// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback} from 'react';
import {useDispatch} from 'react-redux';

import {loginWithPersonalAccessToken} from 'actions/views/login';
import Input, {SIZE} from 'components/widgets/inputs/input/input';
import PasswordInput from 'components/widgets/inputs/password_input/password_input';
import SaveButton from 'components/save_button';

import {getSmsAuthBaseUrl} from 'utils/academy_services';

type Props = {
    onLoginSuccess: () => Promise<void>;
    /** Блокировать во время входа по почте */
    disabled?: boolean;
};

export default function SmsAuthPanel({onLoginSuccess, disabled}: Props) {
    const dispatch = useDispatch();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [saving, setSaving] = useState(false);
    const [info, setInfo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const base = getSmsAuthBaseUrl();

    const requestLoginCode = useCallback(async () => {
        setError(null);
        setInfo(null);
        if (!phone.trim()) {
            setError('Введите номер телефона (+7…)');
            return;
        }
        setSaving(true);
        try {
            const r = await fetch(`${base}/api/auth/request-code`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phone: phone.trim()}),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(d.error || 'Не удалось отправить код');
                return;
            }
            setInfo(d.test && d.dev_code ? `Тест: код ${d.dev_code}` : 'Код отправлен по SMS');
        } catch {
            setError('Сервис SMS недоступен. Запустите sms_auth (порт 3002) или проверьте ACADEMY_SMS_AUTH_URL.');
        } finally {
            setSaving(false);
        }
    }, [base, phone]);

    const requestRegisterCode = useCallback(async () => {
        setError(null);
        setInfo(null);
        if (!phone.trim()) {
            setError('Введите номер телефона');
            return;
        }
        setSaving(true);
        try {
            const r = await fetch(`${base}/api/auth/register-request-code`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phone: phone.trim()}),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(d.error || 'Не удалось отправить код');
                return;
            }
            setInfo(d.test && d.dev_code ? `Тест: код ${d.dev_code}` : 'Код отправлен по SMS');
        } catch {
            setError('Сервис SMS недоступен (порт 3002).');
        } finally {
            setSaving(false);
        }
    }, [base, phone]);

    const completeLogin = useCallback(async () => {
        setError(null);
        setInfo(null);
        setSaving(true);
        try {
            const r = await fetch(`${base}/api/auth/verify-code`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phone: phone.trim(), code: code.trim()}),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.token) {
                setError(d.error || 'Неверный код или ошибка входа');
                setSaving(false);
                return;
            }
            const {error: loginErr} = await dispatch(loginWithPersonalAccessToken(d.token));
            if (loginErr) {
                setError((loginErr as {message?: string}).message || 'Не удалось завершить вход');
                setSaving(false);
                return;
            }
            await onLoginSuccess();
        } catch {
            setError('Ошибка сети при входе по SMS');
        } finally {
            setSaving(false);
        }
    }, [base, phone, code, dispatch, onLoginSuccess]);

    const completeRegister = useCallback(async () => {
        setError(null);
        setInfo(null);
        setSaving(true);
        try {
            const r = await fetch(`${base}/api/auth/register-complete`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    phone: phone.trim(),
                    code: code.trim(),
                    email: email.trim(),
                    username: username.trim(),
                    password,
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.token) {
                setError(d.error || 'Не удалось зарегистрироваться');
                setSaving(false);
                return;
            }
            const {error: loginErr} = await dispatch(loginWithPersonalAccessToken(d.token));
            if (loginErr) {
                setError((loginErr as {message?: string}).message || 'Аккаунт создан, но вход не выполнен');
                setSaving(false);
                return;
            }
            await onLoginSuccess();
        } catch {
            setError('Ошибка сети при регистрации');
        } finally {
            setSaving(false);
        }
    }, [base, phone, code, email, username, password, firstName, lastName, dispatch, onLoginSuccess]);

    return (
        <div
            className='login-body-card-form'
            style={{marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)'}}
        >
            <p className='login-body-card-title' style={{fontSize: 15}}>
                Вход и регистрация по SMS
            </p>
            <div style={{display: 'flex', gap: 8, marginBottom: 10}}>
                <button
                    type='button'
                    className={'btn btn-sm ' + (mode === 'login' ? 'btn-primary' : 'btn-tertiary')}
                    onClick={() => { setMode('login'); setError(null); setInfo(null); }}
                    disabled={Boolean(disabled)}
                >
                    Вход по SMS
                </button>
                <button
                    type='button'
                    className={'btn btn-sm ' + (mode === 'register' ? 'btn-primary' : 'btn-tertiary')}
                    onClick={() => { setMode('register'); setError(null); setInfo(null); }}
                    disabled={Boolean(disabled)}
                >
                    Регистрация по SMS
                </button>
            </div>
            <Input
                name='smsPhone'
                containerClassName='login-body-card-form-input'
                type='tel'
                inputSize={SIZE.LARGE}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder='+79161234567'
                disabled={Boolean(disabled) || saving}
            />
            {mode === 'register' && (
                <>
                    <Input
                        name='smsEmail'
                        containerClassName='login-body-card-form-input'
                        type='email'
                        inputSize={SIZE.LARGE}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder='Email (как при входе по почте)'
                        disabled={Boolean(disabled) || saving}
                    />
                    <Input
                        name='smsUsername'
                        containerClassName='login-body-card-form-input'
                        type='text'
                        inputSize={SIZE.LARGE}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder='Имя пользователя (username)'
                        disabled={Boolean(disabled) || saving}
                    />
                    <PasswordInput
                        className='login-body-card-form-password-input'
                        value={password}
                        inputSize={SIZE.LARGE}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={Boolean(disabled) || saving}
                    />
                    <Input
                        name='smsFirst'
                        containerClassName='login-body-card-form-input'
                        type='text'
                        inputSize={SIZE.LARGE}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder='Имя'
                        disabled={Boolean(disabled) || saving}
                    />
                    <Input
                        name='smsLast'
                        containerClassName='login-body-card-form-input'
                        type='text'
                        inputSize={SIZE.LARGE}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder='Фамилия'
                        disabled={Boolean(disabled) || saving}
                    />
                </>
            )}
            <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8}}>
                <button
                    type='button'
                    className='btn btn-secondary btn-sm'
                    onClick={mode === 'login' ? requestLoginCode : requestRegisterCode}
                    disabled={Boolean(disabled) || saving}
                >
                    Получить код
                </button>
            </div>
            <Input
                name='smsCode'
                containerClassName='login-body-card-form-input'
                type='text'
                inputSize={SIZE.LARGE}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder='Код из SMS'
                disabled={Boolean(disabled) || saving}
            />
            {error && (
                <div className='form-group has-error' style={{marginTop: 8}}>
                    <span className='input-error'>{error}</span>
                </div>
            )}
            {info && !error && (
                <div style={{marginTop: 8, fontSize: 13, opacity: 0.85}}>{info}</div>
            )}
            <SaveButton
                extraClasses='login-body-card-form-button-submit large'
                saving={saving}
                disabled={Boolean(disabled)}
                onClick={mode === 'login' ? completeLogin : completeRegister}
                defaultMessage={mode === 'login' ? 'Войти по SMS' : 'Зарегистрироваться'}
                savingMessage={mode === 'login' ? 'Вход…' : 'Регистрация…'}
            />
        </div>
    );
}
