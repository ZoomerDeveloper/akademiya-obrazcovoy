// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import {useTheme} from '@context/theme';
import {getSmsAuthServiceUrl} from '@utils/academy_service';
import {fetchWithTimeout} from '@utils/fetch_utils';
import {changeOpacity} from '@utils/theme';

type Props = {
    serverUrl: string;
    onSuccess: (token: string, userId: string) => void;
    onBack: () => void;
};

function normalizePhoneInput(value: string) {
    const raw = value.replace(/[^\d+]/g, '');
    if (raw.startsWith('+')) {
        return `+${raw.slice(1).replace(/\D/g, '')}`;
    }
    return raw.replace(/\D/g, '');
}

function parseErrorMessage(data: unknown, fallback: string) {
    if (typeof data === 'object' && data && 'error' in data && typeof (data as {error?: unknown}).error === 'string') {
        return (data as {error: string}).error;
    }
    if (typeof data === 'object' && data && 'message' in data && typeof (data as {message?: unknown}).message === 'string') {
        return (data as {message: string}).message;
    }
    return fallback;
}

export default function PhoneLoginScreen({serverUrl, onSuccess, onBack}: Props) {
    const theme = useTheme();
    const styles = useMemo(() => getStyleSheet(theme), [theme]);
    const smsBaseUrl = getSmsAuthServiceUrl(serverUrl);

    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState<'phone' | 'code'>('phone');
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [maskedPhone, setMaskedPhone] = useState('');
    const [devCodeHint, setDevCodeHint] = useState('');

    const requestCode = useCallback(async () => {
        const normalizedPhone = normalizePhoneInput(phone);
        if (!normalizedPhone || normalizedPhone.length < 11) {
            Alert.alert('Ошибка', 'Введите корректный номер телефона в формате +7XXXXXXXXXX');
            return;
        }

        setSending(true);
        try {
            const resp = await fetchWithTimeout(`${smsBaseUrl}/api/auth/request-code`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({phone: normalizedPhone}),
            }, 12000);

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                Alert.alert('Ошибка', parseErrorMessage(data, 'Не удалось отправить код'));
                return;
            }

            setMaskedPhone(normalizedPhone);
            setDevCodeHint(typeof data.dev_code === 'string' ? data.dev_code : '');
            setStep('code');
            setCode('');
            if (typeof data.dev_code === 'string') {
                Alert.alert('Тестовый режим', `Код подтверждения: ${data.dev_code}`);
            } else {
                Alert.alert('Код отправлен', `Мы отправили SMS на ${normalizedPhone}`);
            }
        } catch (error) {
            Alert.alert('Ошибка', error instanceof Error ? error.message : 'Сетевая ошибка');
        } finally {
            setSending(false);
        }
    }, [phone, smsBaseUrl]);

    const verifyCode = useCallback(async () => {
        const normalizedPhone = normalizePhoneInput(maskedPhone || phone);
        const normalizedCode = code.replace(/\D/g, '');
        if (!normalizedCode) {
            Alert.alert('Ошибка', 'Введите код из SMS');
            return;
        }

        setVerifying(true);
        try {
            const resp = await fetchWithTimeout(`${smsBaseUrl}/api/auth/verify-code`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    phone: normalizedPhone,
                    code: normalizedCode,
                }),
            }, 12000);

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                Alert.alert('Ошибка', parseErrorMessage(data, 'Не удалось подтвердить код'));
                return;
            }

            const token = typeof data.token === 'string' ? data.token : '';
            const userId = typeof data.user_id === 'string' ? data.user_id : '';
            if (!token || !userId) {
                Alert.alert('Ошибка', 'Сервис авторизации вернул неполные данные');
                return;
            }

            onSuccess(token, userId);
        } catch (error) {
            Alert.alert('Ошибка', error instanceof Error ? error.message : 'Сетевая ошибка');
        } finally {
            setVerifying(false);
        }
    }, [code, maskedPhone, onSuccess, phone, smsBaseUrl]);

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Text style={styles.backButtonText}>{'Назад'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>{'Вход по телефону'}</Text>
                    <View style={styles.headerSpacer}/>
                </View>

                <View style={styles.content}>
                    <Text style={styles.subtitle}>
                        {step === 'phone' ?
                            'Введите номер, привязанный к вашему аккаунту Академии.' :
                            `Введите код из SMS для ${maskedPhone || normalizePhoneInput(phone)}.`}
                    </Text>

                    {step === 'phone' ? (
                        <>
                            <TextInput
                                style={styles.input}
                                value={phone}
                                onChangeText={(v) => setPhone(normalizePhoneInput(v))}
                                placeholder='+79161234567'
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                keyboardType='phone-pad'
                                autoCapitalize='none'
                                autoCorrect={false}
                            />
                            <TouchableOpacity
                                style={[styles.primaryButton, sending && styles.primaryButtonDisabled]}
                                onPress={requestCode}
                                disabled={sending}
                            >
                                {sending ? (
                                    <ActivityIndicator size='small' color='#fff'/>
                                ) : (
                                    <Text style={styles.primaryButtonText}>{'Получить код'}</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TextInput
                                style={styles.input}
                                value={code}
                                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                                placeholder='Код из SMS'
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                keyboardType='number-pad'
                                autoCapitalize='none'
                                autoCorrect={false}
                                maxLength={6}
                            />
                            <TouchableOpacity
                                style={[styles.primaryButton, verifying && styles.primaryButtonDisabled]}
                                onPress={verifyCode}
                                disabled={verifying}
                            >
                                {verifying ? (
                                    <ActivityIndicator size='small' color='#fff'/>
                                ) : (
                                    <Text style={styles.primaryButtonText}>{'Подтвердить код'}</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={requestCode}
                                disabled={sending}
                            >
                                <Text style={styles.secondaryButtonText}>{'Отправить код повторно'}</Text>
                            </TouchableOpacity>

                            {Boolean(devCodeHint) && (
                                <Text style={styles.hint}>{`Тестовый код: ${devCodeHint}`}</Text>
                            )}
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function getStyleSheet(theme: Theme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.centerChannelBg,
        },
        flex: {flex: 1},
        header: {
            height: 56,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: changeOpacity(theme.centerChannelColor, 0.14),
        },
        headerSpacer: {
            width: 52,
        },
        backButton: {
            width: 52,
            height: 34,
            alignItems: 'flex-start',
            justifyContent: 'center',
        },
        backButtonText: {
            color: theme.buttonBg,
            fontSize: 14,
            fontWeight: '600',
        },
        title: {
            color: theme.centerChannelColor,
            fontSize: 16,
            fontWeight: '700',
        },
        content: {
            paddingHorizontal: 20,
            paddingTop: 24,
            gap: 12,
        },
        subtitle: {
            color: changeOpacity(theme.centerChannelColor, 0.68),
            fontSize: 14,
            lineHeight: 20,
            marginBottom: 4,
        },
        input: {
            height: 48,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.2),
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
            color: theme.centerChannelColor,
            fontSize: 16,
            paddingHorizontal: 14,
        },
        primaryButton: {
            height: 48,
            borderRadius: 10,
            backgroundColor: theme.buttonBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
        },
        primaryButtonDisabled: {
            opacity: 0.7,
        },
        primaryButtonText: {
            color: '#fff',
            fontSize: 15,
            fontWeight: '700',
        },
        secondaryButton: {
            height: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.2),
            alignItems: 'center',
            justifyContent: 'center',
        },
        secondaryButtonText: {
            color: changeOpacity(theme.centerChannelColor, 0.72),
            fontSize: 14,
            fontWeight: '600',
        },
        hint: {
            color: changeOpacity('#c4973b', 0.95),
            fontSize: 13,
            marginTop: 4,
        },
    });
}
