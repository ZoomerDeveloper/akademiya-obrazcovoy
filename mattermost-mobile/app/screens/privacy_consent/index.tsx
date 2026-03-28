// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Экран согласия на обработку персональных данных (Privacy & Legal, ТЗ).
 * Показывается оверлеем после входа, пока пользователь не примет условия.
 * Флаг хранится в app DB (Global), одинаково на iOS и Android.
 */

import Emm from '@mattermost/react-native-emm';
import React, {useCallback, useState} from 'react';
import {
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import {storeGlobal} from '@actions/app/global';
import CompassIcon from '@components/compass_icon';
import {GLOBAL_IDENTIFIERS} from '@constants/database';
import {useTheme} from '@context/theme';
import {dismissOverlay} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    safeArea: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    container: {
        flex: 1,
    },
    header: {
        backgroundColor: theme.sidebarHeaderBg,
        padding: 24,
        paddingTop: 32,
        alignItems: 'center',
    },
    academyIcon: {
        marginBottom: 16,
    },
    headerTitle: {
        color: theme.sidebarHeaderTextColor,
        fontSize: 22,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        textAlign: 'center',
        marginBottom: 6,
    },
    headerSubtitle: {
        color: changeOpacity(theme.sidebarHeaderTextColor, 0.7),
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.centerChannelColor,
        marginBottom: 10,
        marginTop: 20,
    },
    paragraph: {
        fontSize: 14,
        lineHeight: 22,
        color: changeOpacity(theme.centerChannelColor, 0.8),
        marginBottom: 8,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 6,
        paddingLeft: 4,
    },
    bullet: {
        fontSize: 14,
        color: theme.buttonBg,
        marginRight: 8,
        lineHeight: 22,
    },
    bulletText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 22,
        color: changeOpacity(theme.centerChannelColor, 0.8),
    },
    linkText: {
        color: theme.linkColor,
        textDecorationLine: 'underline',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        marginVertical: 12,
    },
    footer: {
        padding: 20,
        paddingBottom: 32,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: theme.centerChannelBg,
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: theme.buttonBg,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
    },
    checkText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 19,
        color: changeOpacity(theme.centerChannelColor, 0.75),
    },
    acceptButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    acceptButtonDisabled: {
        opacity: 0.45,
    },
    acceptButtonText: {
        color: theme.buttonColor,
        fontSize: 16,
        fontWeight: '700',
    },
    declineButton: {
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    declineButtonText: {
        color: changeOpacity(theme.centerChannelColor, 0.5),
        fontSize: 14,
    },
}));

type Props = {
    /** Если задан — оверлей RNN, закрытие через dismissOverlay */
    componentId?: string;
    /** Если без componentId (например Modal на экране сервера) */
    onAccept?: () => void;
    onDecline?: () => void;
}

const BULLET_POINTS_DATA = [
    'ФИО, контактные данные (email, телефон)',
    'Информация об обучении (направление, педагог, расписание)',
    'Сообщения и файлы, отправляемые через приложение',
    'Данные устройства для push-уведомлений',
];

export function PrivacyConsentScreen({componentId, onAccept, onDecline}: Props) {
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const [checked1, setChecked1] = useState(false);
    const [checked2, setChecked2] = useState(false);

    const canAccept = checked1 && checked2;

    const handleAccept = useCallback(async () => {
        if (!canAccept) {
            return;
        }
        await storeGlobal(GLOBAL_IDENTIFIERS.PRIVACY_CONSENT, true, false);
        if (componentId) {
            await dismissOverlay(componentId);
        }
        onAccept?.();
    }, [canAccept, componentId, onAccept]);

    const handleDecline = useCallback(async () => {
        if (componentId) {
            await dismissOverlay(componentId);
        }
        if (onDecline) {
            onDecline();
            return;
        }
        Emm.exitApp();
    }, [componentId, onDecline]);

    const openPolicy = useCallback(() => {
        Linking.openURL('https://образцова.academy/privacy').catch(() => null);
    }, []);

    return (
        <SafeAreaView style={style.safeArea}>
            <View style={style.container}>
                <View style={style.header}>
                    <CompassIcon
                        name='shield-outline'
                        size={48}
                        color={theme.sidebarHeaderTextColor}
                        style={style.academyIcon}
                    />
                    <Text style={style.headerTitle}>
                        {'Согласие на обработку\nперсональных данных'}
                    </Text>
                    <Text style={style.headerSubtitle}>
                        {'Международная Академия музыки\nЕлены Образцовой'}
                    </Text>
                </View>

                <ScrollView
                    style={style.scroll}
                    contentContainerStyle={style.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={style.paragraph}>
                        {'Перед началом использования приложения, пожалуйста, ознакомьтесь с условиями обработки персональных данных.'}
                    </Text>

                    <Text style={style.sectionTitle}>{'Кто обрабатывает данные'}</Text>
                    <Text style={style.paragraph}>
                        {'Оператором персональных данных является АНО «Международная Академия музыки Елены Образцовой», ИНН 7710000000, Москва.'}
                    </Text>

                    <Text style={style.sectionTitle}>{'Какие данные собираются'}</Text>
                    {BULLET_POINTS_DATA.map((item, index) => (
                        <View
                            key={index}
                            style={style.bulletRow}
                        >
                            <Text style={style.bullet}>{'•'}</Text>
                            <Text style={style.bulletText}>{item}</Text>
                        </View>
                    ))}

                    <Text style={style.sectionTitle}>{'Цели обработки'}</Text>
                    <Text style={style.paragraph}>
                        {'Данные используются исключительно для организации учебного процесса, коммуникации внутри Академии и направления уведомлений.'}
                    </Text>
                    <Text style={style.paragraph}>
                        {'Данные не передаются третьим лицам без вашего согласия, за исключением случаев, предусмотренных законодательством РФ.'}
                    </Text>

                    <Text style={style.sectionTitle}>{'Ваши права'}</Text>
                    <Text style={style.paragraph}>
                        {'Вы вправе запросить доступ к своим данным, их исправление или удаление. Для этого обратитесь к администратору Академии или по адресу: privacy@образцова.academy'}
                    </Text>

                    <View style={style.divider}/>

                    <TouchableOpacity onPress={openPolicy}>
                        <Text style={[style.paragraph, style.linkText]}>
                            {'Полный текст Политики конфиденциальности →'}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={style.footer}>
                    <TouchableOpacity
                        style={style.checkRow}
                        onPress={() => setChecked1((v) => !v)}
                        accessibilityRole='checkbox'
                        accessibilityState={{checked: checked1}}
                    >
                        <View style={[style.checkbox, checked1 && style.checkboxChecked]}>
                            {checked1 && (
                                <CompassIcon
                                    name='check'
                                    size={14}
                                    color={theme.buttonColor}
                                />
                            )}
                        </View>
                        <Text style={style.checkText}>
                            {'Я ознакомился(-ась) с Политикой конфиденциальности и даю согласие на обработку моих персональных данных'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={style.checkRow}
                        onPress={() => setChecked2((v) => !v)}
                        accessibilityRole='checkbox'
                        accessibilityState={{checked: checked2}}
                    >
                        <View style={[style.checkbox, checked2 && style.checkboxChecked]}>
                            {checked2 && (
                                <CompassIcon
                                    name='check'
                                    size={14}
                                    color={theme.buttonColor}
                                />
                            )}
                        </View>
                        <Text style={style.checkText}>
                            {'Я подтверждаю, что мне исполнилось 14 лет (или действую с согласия законного представителя)'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[style.acceptButton, !canAccept && style.acceptButtonDisabled]}
                        onPress={handleAccept}
                        disabled={!canAccept}
                        accessibilityRole='button'
                    >
                        <Text style={style.acceptButtonText}>{'Принять и продолжить'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={style.declineButton}
                        onPress={handleDecline}
                        accessibilityRole='button'
                    >
                        <Text style={style.declineButtonText}>{'Отказаться и выйти'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

export default PrivacyConsentScreen;
