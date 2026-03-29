// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Афиша мероприятий Академии
 * Фаза Б по ТЗ
 *
 * Для зрителей: список событий в виде красивых карточек-афиш
 * Для staff: кнопка «+» → создать афишу по шаблону → опубликовать в ленту
 * Шаблоны: «Концерт», «Мастер-класс», «Экзамен», «Открытый урок»
 */

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {parse, SvgAst} from 'react-native-svg';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {getServerCredentials} from '@init/credentials';
import {observeCurrentUser} from '@queries/servers/user';
import {getAcademyRoleFlags} from '@utils/academy_roles';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {exportAfishaAsImage, generateAfishaSVG, shareAfishaImage} from '@utils/afisha_export';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';

// ─────────────────────────── Типы и данные ───────────────────────────────────

type EventType = 'concert' | 'masterclass' | 'exam' | 'openlesson' | 'competition';

type AfishaTemplate = {
    id: EventType;
    label: string;
    emoji: string;
    color: string;
    accent: string;
    defaultTitle: string;
    defaultDescription: string;
    fields: string[];
}

const TEMPLATES: AfishaTemplate[] = [
    {
        id: 'concert',
        label: 'Концерт',
        emoji: '🎹',
        color: '#1a1a35',
        accent: '#c4973b',
        defaultTitle: 'Концерт студентов Академии',
        defaultDescription: 'Приглашаем всех на концерт студентов Международной Академии музыки Елены Образцовой. Вход свободный.',
        fields: ['Программа', 'Исполнители', 'Входной билет'],
    },
    {
        id: 'masterclass',
        label: 'Мастер-класс',
        emoji: '🎤',
        color: '#2d4a22',
        accent: '#7ec8a0',
        defaultTitle: 'Открытый мастер-класс',
        defaultDescription: 'Открытый мастер-класс для студентов и педагогов Академии. Количество мест ограничено.',
        fields: ['Ведущий', 'Тема', 'Целевая аудитория'],
    },
    {
        id: 'exam',
        label: 'Экзамен',
        emoji: '🏅',
        color: '#6b3570',
        accent: '#c89bd8',
        defaultTitle: 'Академический зачёт',
        defaultDescription: 'Открытый академический зачёт для студентов класса. Приглашаются педагоги и родители.',
        fields: ['Дисциплина', 'Преподаватель', 'Студенты'],
    },
    {
        id: 'openlesson',
        label: 'Открытый урок',
        emoji: '📖',
        color: '#8b4513',
        accent: '#e8a87c',
        defaultTitle: 'Открытый урок',
        defaultDescription: 'Открытый урок для педагогов и студентов Академии.',
        fields: ['Дисциплина', 'Педагог', 'Класс'],
    },
    {
        id: 'competition',
        label: 'Конкурс',
        emoji: '🏆',
        color: '#1a3a4a',
        accent: '#69b8e0',
        defaultTitle: 'Конкурс молодых исполнителей',
        defaultDescription: 'Академия приглашает к участию в конкурсе.',
        fields: ['Номинации', 'Возраст', 'Дедлайн заявок'],
    },
];

type AfishaEvent = {
    id: string;
    type: EventType;
    title: string;
    description: string;
    date: string;
    time: string;
    venue: string;
    extra: Record<string, string>;
    authorName: string;
    createdAt: number;
}

// Демо-события
const DEMO_EVENTS: AfishaEvent[] = [
    {
        id: 'ev1', type: 'concert',
        title: 'Весенний концерт студентов',
        description: 'Ежегодный весенний концерт. Программа включает произведения Баха, Шопена, Дебюсси. Вход свободный для всех желающих.',
        date: '15 марта 2026', time: '19:00', venue: 'Актовый зал',
        extra: {Программа: 'Классика и романтизм', Исполнители: '12 студентов', 'Входной билет': 'Бесплатно'},
        authorName: 'Администрация', createdAt: Date.now() - 86400000 * 3,
    },
    {
        id: 'ev2', type: 'masterclass',
        title: 'Мастер-класс: Техника педализации',
        description: 'Открытый мастер-класс профессора Марии Ивановой по технике педализации в исполнении Шопена.',
        date: '22 марта 2026', time: '14:00', venue: 'Класс № 3',
        extra: {Ведущий: 'М. Иванова', Тема: 'Педализация Шопена', 'Целевая аудитория': 'Пианисты 3–5 курс'},
        authorName: 'Учебный отдел', createdAt: Date.now() - 86400000,
    },
    {
        id: 'ev3', type: 'competition',
        title: 'Городской конкурс молодых исполнителей',
        description: 'Академия набирает участников для участия в городском конкурсе. Подать заявку — до 25 марта у менеджера.',
        date: '1 апреля 2026', time: '11:00', venue: 'Концертный зал г. Москвы',
        extra: {Номинации: 'Фортепиано, Вокал', Возраст: '14–25 лет', 'Дедлайн заявок': '25 марта'},
        authorName: 'Руководство', createdAt: Date.now() - 3600000,
    },
];

// ─────────────────────────── Стили ───────────────────────────────────────────

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: changeOpacity(theme.centerChannelColor, 0.02)},
    header: {
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerCloseBtn: {
        marginRight: 10,
        padding: 6,
        borderRadius: 20,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    headerTexts: {flex: 1, minWidth: 0, paddingRight: 12},
    headerLabel: {fontSize: 11, color: changeOpacity(theme.centerChannelColor, 0.45), textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2},
    headerTitle: {fontSize: 22, fontWeight: '700', color: theme.centerChannelColor, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif'},
    addBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 22,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    scroll: {flex: 1},
    scrollContent: {padding: 16, paddingBottom: 24},

    // Карточка афиши
    eventCard: {
        borderRadius: 18,
        marginBottom: 16,
        overflow: 'hidden',
    },
    cardBg: {
        padding: 22,
        paddingBottom: 18,
    },
    cardEmoji: {fontSize: 40, marginBottom: 12},
    cardTitle: {
        fontSize: 21,
        fontWeight: '700',
        color: '#fff',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        lineHeight: 27,
        marginBottom: 6,
    },
    cardDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
        lineHeight: 19,
        marginBottom: 14,
    },
    cardDateRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 10,
        columnGap: 14,
        marginBottom: 14,
    },
    cardDateItem: {flexDirection: 'row', alignItems: 'center', gap: 5},
    cardDateItemFull: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        width: '100%',
        marginTop: 2,
    },
    cardDateText: {fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)'},
    cardDivider: {height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 12},
    cardExtraRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14},
    cardExtraChip: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    cardExtraKey: {fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4},
    cardExtraVal: {fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600', marginTop: 1},
    cardFooter: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    cardAuthor: {fontSize: 11, color: 'rgba(255,255,255,0.5)'},
    cardShareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    cardShareText: {fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600'},
}));

// ─────────────────────────── Карточка афиши ──────────────────────────────────

function EventCard({event, theme}: {event: AfishaEvent; theme: Theme}) {
    const style = getStyleSheet(theme);
    const tmpl = TEMPLATES.find((t) => t.id === event.type) || TEMPLATES[0];

    const handleShare = useCallback(async () => {
        try {
            await Share.share({
                title: event.title,
                message: [
                    `🎭 ${event.title}`,
                    `📅 ${event.date}  🕐 ${event.time}`,
                    `📍 ${event.venue}`,
                    ``,
                    event.description,
                    ``,
                    `— Международная Академия музыки Елены Образцовой`,
                ].join('\n'),
            });
        } catch {}
    }, [event]);

    return (
        <View style={style.eventCard}>
            <View style={[style.cardBg, {backgroundColor: tmpl.color}]}>
                <Text style={style.cardEmoji}>{tmpl.emoji}</Text>
                <Text style={style.cardTitle}>{event.title}</Text>
                <Text style={style.cardDescription}>{event.description}</Text>

                <View style={style.cardDateRow}>
                    <View style={style.cardDateItem}>
                        <CompassIcon name='calendar-outline' size={14} color='rgba(255,255,255,0.7)'/>
                        <Text style={style.cardDateText}>{event.date}</Text>
                    </View>
                    <View style={style.cardDateItem}>
                        <CompassIcon name='clock-outline' size={14} color='rgba(255,255,255,0.7)'/>
                        <Text style={style.cardDateText}>{event.time}</Text>
                    </View>
                    <View style={style.cardDateItemFull}>
                        <CompassIcon name='map-marker-outline' size={14} color='rgba(255,255,255,0.7)'/>
                        <Text
                            style={[style.cardDateText, {flex: 1}]}
                            numberOfLines={2}
                        >
                            {event.venue}
                        </Text>
                    </View>
                </View>

                {Object.keys(event.extra).length > 0 && (
                    <>
                        <View style={style.cardDivider}/>
                        <View style={style.cardExtraRow}>
                            {Object.entries(event.extra).map(([k, v]) => (
                                <View key={k} style={style.cardExtraChip}>
                                    <Text style={style.cardExtraKey}>{k}</Text>
                                    <Text style={style.cardExtraVal}>{v}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                <View style={style.cardFooter}>
                    <Text style={style.cardAuthor}>{`Опубликовал: ${event.authorName}`}</Text>
                    <TouchableOpacity style={style.cardShareBtn} onPress={handleShare}>
                        <CompassIcon name='share-variant-outline' size={14} color='rgba(255,255,255,0.9)'/>
                        <Text style={style.cardShareText}>{'Поделиться'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────── Форма создания афиши ────────────────────────────

const getFormStyle = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: theme.centerChannelBg},
    header: {
        flexDirection: 'row', alignItems: 'center',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    backBtn: {padding: 4, marginRight: 12},
    headerTitle: {fontSize: 18, fontWeight: '700', color: theme.centerChannelColor, flex: 1},
    publishBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    publishBtnText: {color: theme.buttonColor, fontWeight: '700', fontSize: 14},
    scroll: {flex: 1},
    scrollContent: {padding: 20, paddingBottom: 40},
    sectionLabel: {
        fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
        color: changeOpacity(theme.centerChannelColor, 0.45),
        textTransform: 'uppercase', marginBottom: 10, marginTop: 20,
    },
    templateRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
    templateChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1.5, borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    templateChipSelected: {borderWidth: 1.5},
    templateEmoji: {fontSize: 16},
    templateLabel: {fontSize: 13, fontWeight: '600', color: changeOpacity(theme.centerChannelColor, 0.65)},
    templateLabelSelected: {color: '#fff'},
    input: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 10, borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: theme.centerChannelColor,
    },
    inputMulti: {minHeight: 90, textAlignVertical: 'top'},
    row: {flexDirection: 'row', gap: 10},
    flex1: {flex: 1},
    extraField: {marginBottom: 14},
    extraLabel: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginBottom: 6},
    preview: {
        marginTop: 20,
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    previewInner: {padding: 18},
    previewTitle: {fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 8, marginBottom: 4},
    previewDate: {fontSize: 13, color: 'rgba(255,255,255,0.7)'},
    channelNote: {
        marginTop: 16, padding: 12,
        backgroundColor: changeOpacity(theme.sidebarTextActiveBorder, 0.08),
        borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    channelNoteText: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.6), flex: 1},
    exportHidden: {
        position: 'absolute',
        left: -10000,
        top: -10000,
        width: 900,
        height: 1200,
        opacity: 0,
    },
}));

function getApiBase(serverUrl: string): string {
    const t = serverUrl.trim().replace(/\/$/, '');
    if (!/^http:\/\//i.test(t)) {
        return t;
    }

    const rest = t.replace(/^http:\/\//i, '');
    if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(rest)) {
        return t;
    }

    return `https://${rest}`;
}

function CreateAfishaModal({
    userId, userName, userToken, serverUrl, theme, onClose, onPublished,
}: {
    userId: string; userName: string; userToken: string;
    serverUrl: string; theme: Theme;
    onClose: () => void; onPublished: (event: AfishaEvent) => void;
}) {
    const style = getFormStyle(theme);
    const [selectedTemplate, setSelectedTemplate] = useState<AfishaTemplate>(TEMPLATES[0]);
    const [title, setTitle] = useState(TEMPLATES[0].defaultTitle);
    const [description, setDescription] = useState(TEMPLATES[0].defaultDescription);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('19:00');
    const [venue, setVenue] = useState('Актовый зал');
    const [extraValues, setExtraValues] = useState<Record<string, string>>({});
    const [publishing, setPublishing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportAst, setExportAst] = useState<ReturnType<typeof parse> | null>(null);
    const exportSvgRef = useRef<Svg | null>(null);

    const selectTemplate = useCallback((tmpl: AfishaTemplate) => {
        setSelectedTemplate(tmpl);
        setTitle(tmpl.defaultTitle);
        setDescription(tmpl.defaultDescription);
        setExtraValues({});
    }, []);

    const waitForRender = useCallback(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }, []);

    const renderPngBase64 = useCallback(async () => {
        const svgNode = exportSvgRef.current as unknown as {
            toDataURL: (
                callback: (base64: string) => void,
                options?: {width: number; height: number},
            ) => void;
        } | null;

        if (!svgNode?.toDataURL) {
            throw new Error('Рендер PNG недоступен на этом устройстве');
        }

        return new Promise<string>((resolve, reject) => {
            try {
                svgNode.toDataURL((base64) => {
                    if (base64) {
                        resolve(base64);
                    } else {
                        reject(new Error('Пустой PNG после рендера'));
                    }
                }, {width: 900, height: 1200});
            } catch {
                reject(new Error('Не удалось отрендерить PNG'));
            }
        });
    }, []);

    const handleExport = useCallback(async () => {
        if (!title.trim()) {
            Alert.alert('Заполните название афиши');
            return;
        }
        setExporting(true);

        try {
            const afishaData = {
                emoji: selectedTemplate.emoji,
                title: title.trim(),
                description: description.trim(),
                date,
                time,
                venue,
                ticket: extraValues['Входной билет'] || extraValues['Цена входа'] || '',
                authorName: userName,
            };

            const svgMarkup = generateAfishaSVG(
                afishaData,
                selectedTemplate.color,
                selectedTemplate.accent,
            );

            let parsedAst: ReturnType<typeof parse> | null = null;
            try {
                parsedAst = parse(svgMarkup);
            } catch {
                Alert.alert('Ошибка экспорта', 'Не удалось подготовить шаблон для PNG');
                return;
            }

            setExportAst(parsedAst);
            await waitForRender();
            const pngBase64 = await renderPngBase64();

            const exportPath = await exportAfishaAsImage(
                afishaData,
                selectedTemplate.color,
                selectedTemplate.accent,
                'png',
                pngBase64,
            );

            if (exportPath) {
                const shared = await shareAfishaImage(exportPath, title.trim());
                if (!shared) {
                    Alert.alert('ℹ️ Файл готов', `Афиша сохранена: ${exportPath}`);
                } else {
                    Alert.alert('✅ Поделился!', 'Афиша готова для публикации');
                }
            } else {
                Alert.alert('Ошибка', 'Не удалось создать изображение');
            }
        } catch (err) {
            Alert.alert('Ошибка экспорта', (err as Error).message);
        } finally {
            setExportAst(null);
            setExporting(false);
        }
    }, [
        title,
        description,
        selectedTemplate,
        extraValues,
        date,
        time,
        venue,
        userName,
        waitForRender,
        renderPngBase64,
    ]);

    const handlePublish = useCallback(async () => {
        if (!title.trim() || !date.trim()) {
            Alert.alert('Заполните название и дату');
            return;
        }
        if (!userToken) {
            Alert.alert('Ошибка публикации', 'Нет активной сессии. Войдите заново.');
            return;
        }
        setPublishing(true);

        const newEvent: AfishaEvent = {
            id: String(Date.now()),
            type: selectedTemplate.id,
            title: title.trim(),
            description: description.trim(),
            date, time, venue,
            extra: extraValues,
            authorName: userName,
            createdAt: Date.now(),
        };

        // Формируем текст поста для Mattermost
        const postText = [
            `## ${selectedTemplate.emoji} ${newEvent.title}`,
            ``,
            `📅 **${newEvent.date}** · 🕐 **${newEvent.time}** · 📍 ${newEvent.venue}`,
            ``,
            newEvent.description,
            Object.keys(newEvent.extra).length > 0
                ? '\n' + Object.entries(newEvent.extra).map(([k, v]) => `• **${k}:** ${v}`).join('\n')
                : '',
            ``,
            `_— ${userName}, Академия Образцовой_`,
        ].join('\n');

        try {
            const apiBase = getApiBase(serverUrl);

            // Получаем список команд для поиска канала afisha
            const teamsRes = await fetch(`${apiBase}/api/v4/teams`, {
                headers: {Authorization: `Bearer ${userToken}`},
            });

            if (!teamsRes.ok) {
                throw new Error('Не удалось получить список команд');
            }

            const teams = await teamsRes.json();
            if (!Array.isArray(teams)) {
                throw new Error('Неожиданный ответ сервера при загрузке команд');
            }

            let channelId = '';
            for (const team of teams) {
                if (!team?.id) {
                    continue;
                }
                const chRes = await fetch(
                    `${apiBase}/api/v4/teams/${team.id}/channels/name/afisha`,
                    {headers: {Authorization: `Bearer ${userToken}`}},
                );
                if (chRes.ok) {
                    const ch = await chRes.json();
                    channelId = ch.id;
                    break;
                }
            }

            if (!channelId) { throw new Error('Канал #afisha не найден'); }

            const publishRes = await fetch(`${apiBase}/api/v4/posts`, {
                method: 'POST',
                headers: {'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json'},
                body: JSON.stringify({channel_id: channelId, message: postText}),
            });

            if (!publishRes.ok) {
                throw new Error('Не удалось опубликовать пост в #afisha');
            }

            onPublished(newEvent);
            Alert.alert('✅ Опубликовано!', 'Афиша опубликована в канал #afisha и добавлена в ленту.');
        } catch (err: unknown) {
            Alert.alert('Ошибка публикации', (err as Error).message);
        } finally {
            setPublishing(false);
        }
    }, [title, date, time, venue, description, selectedTemplate, extraValues, userName, userToken, serverUrl, onPublished]);

    return (
        <SafeAreaView style={style.container}>
            <View style={style.header}>
                <TouchableOpacity style={style.backBtn} onPress={onClose}>
                    <CompassIcon name='close' size={22} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>{'Создать афишу'}</Text>
                <View style={{flexDirection: 'row', gap: 8}}>
                    <TouchableOpacity style={style.publishBtn} onPress={handleExport} disabled={exporting || publishing}>
                        {exporting
                            ? <ActivityIndicator size='small' color={theme.buttonColor}/>
                            : <>
                                <CompassIcon name='download-outline' size={14} color={theme.buttonColor} style={{marginRight: 4}}/>
                                <Text style={style.publishBtnText}>{'PNG'}</Text>
                            </>
                        }
                    </TouchableOpacity>
                    <TouchableOpacity style={style.publishBtn} onPress={handlePublish} disabled={publishing || exporting}>
                        {publishing
                            ? <ActivityIndicator size='small' color={theme.buttonColor}/>
                            : <Text style={style.publishBtnText}>{'Опубликовать'}</Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={style.scroll} contentContainerStyle={style.scrollContent} keyboardShouldPersistTaps='handled'>
                {/* Выбор шаблона */}
                <Text style={style.sectionLabel}>{'Тип мероприятия'}</Text>
                <View style={style.templateRow}>
                    {TEMPLATES.map((tmpl) => (
                        <TouchableOpacity
                            key={tmpl.id}
                            style={[
                                style.templateChip,
                                selectedTemplate.id === tmpl.id && {
                                    ...style.templateChipSelected,
                                    backgroundColor: tmpl.color,
                                    borderColor: tmpl.accent,
                                },
                            ]}
                            onPress={() => selectTemplate(tmpl)}
                        >
                            <Text style={style.templateEmoji}>{tmpl.emoji}</Text>
                            <Text style={[style.templateLabel, selectedTemplate.id === tmpl.id && style.templateLabelSelected]}>
                                {tmpl.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Основные поля */}
                <Text style={style.sectionLabel}>{'Название'}</Text>
                <TextInput style={style.input} value={title} onChangeText={setTitle} placeholder='Название мероприятия' placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}/>

                <Text style={style.sectionLabel}>{'Описание'}</Text>
                <TextInput style={[style.input, style.inputMulti]} value={description} onChangeText={setDescription} multiline placeholder='Описание для афиши...' placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}/>

                <Text style={style.sectionLabel}>{'Дата и время'}</Text>
                <View style={style.row}>
                    <TextInput style={[style.input, style.flex1]} value={date} onChangeText={setDate} placeholder='15 марта 2026' placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}/>
                    <TextInput style={[style.input, {width: 80}]} value={time} onChangeText={setTime} placeholder='19:00' placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}/>
                </View>

                <Text style={style.sectionLabel}>{'Место проведения'}</Text>
                <TextInput style={style.input} value={venue} onChangeText={setVenue} placeholder='Актовый зал' placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}/>

                {/* Поля шаблона */}
                {selectedTemplate.fields.length > 0 && (
                    <>
                        <Text style={style.sectionLabel}>{'Дополнительные поля'}</Text>
                        {selectedTemplate.fields.map((field) => (
                            <View key={field} style={style.extraField}>
                                <Text style={style.extraLabel}>{field}</Text>
                                <TextInput
                                    style={style.input}
                                    value={extraValues[field] || ''}
                                    onChangeText={(v) => setExtraValues((prev) => ({...prev, [field]: v}))}
                                    placeholder={`${field}...`}
                                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                                />
                            </View>
                        ))}
                    </>
                )}

                {/* Предпросмотр */}
                <Text style={style.sectionLabel}>{'Предпросмотр'}</Text>
                <View style={style.preview}>
                    <View style={[style.previewInner, {backgroundColor: selectedTemplate.color}]}>
                        <Text style={{fontSize: 32}}>{selectedTemplate.emoji}</Text>
                        <Text style={style.previewTitle}>{title || 'Название мероприятия'}</Text>
                        <Text style={style.previewDate}>{[date, time, venue].filter(Boolean).join('  ·  ')}</Text>
                    </View>
                </View>

                {/* Куда публикуется */}
                <View style={style.channelNote}>
                    <CompassIcon name='information-outline' size={16} color={theme.sidebarTextActiveBorder}/>
                    <Text style={style.channelNoteText}>{'Афиша будет опубликована в канал #afisha и появится в ленте новостей'}</Text>
                </View>
            </ScrollView>

            {exportAst && (
                <View pointerEvents='none' style={style.exportHidden}>
                    <SvgAst
                        ast={exportAst}
                        override={{
                            width: 900,
                            height: 1200,
                            ref: exportSvgRef,
                        }}
                    />
                </View>
            )}
        </SafeAreaView>
    );
}

// ─────────────────────────── Основной экран ──────────────────────────────────

type Props = {
    currentUser?: UserModel;
    /** Закрытие при открытии из модалки (например, из ленты) */
    onRequestClose?: () => void;
}

function AcademyAfishaScreen({currentUser, onRequestClose}: Props) {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();
    const style = getStyleSheet(theme);

    const [events, setEvents] = useState<AfishaEvent[]>(DEMO_EVENTS);
    const [showCreate, setShowCreate] = useState(false);
    const [sessionToken, setSessionToken] = useState((currentUser as UserModel & {token?: string})?.token || '');

    const isStaff = useMemo(
        () => getAcademyRoleFlags(currentUser?.roles).isStaff,
        [currentUser?.roles],
    );

    useEffect(() => {
        let cancelled = false;
        const loadCredentials = async () => {
            const credentials = await getServerCredentials(serverUrl);
            if (!cancelled) {
                setSessionToken(credentials?.token || (currentUser as UserModel & {token?: string})?.token || '');
            }
        };
        loadCredentials();
        return () => {
            cancelled = true;
        };
    }, [serverUrl, currentUser]);

    const handlePublished = useCallback((newEvent: AfishaEvent) => {
        setEvents((prev) => [newEvent, ...prev]);
        setShowCreate(false);
    }, []);

    return (
        <View style={[style.container, {paddingTop: insets.top}]}>
            <View style={style.header}>
                {onRequestClose ? (
                    <TouchableOpacity
                        style={style.headerCloseBtn}
                        onPress={onRequestClose}
                        accessibilityLabel='Закрыть'
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    >
                        <CompassIcon name='close' size={22} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                ) : null}
                <View style={style.headerTexts}>
                    <Text style={style.headerLabel}>{'Академия'}</Text>
                    <Text style={style.headerTitle}>{'Афиша'}</Text>
                </View>
                {isStaff ? (
                    <TouchableOpacity style={style.addBtn} onPress={() => setShowCreate(true)}>
                        <CompassIcon name='plus' size={20} color={theme.buttonColor}/>
                    </TouchableOpacity>
                ) : onRequestClose ? (
                    <View style={{width: 40}}/>
                ) : null}
            </View>

            <ScrollView
                style={style.scroll}
                contentContainerStyle={[
                    style.scrollContent,
                    {paddingBottom: Math.max(insets.bottom, 12) + 56},
                ]}
                showsVerticalScrollIndicator={false}
            >
                {events.map((event) => (
                    <EventCard key={event.id} event={event} theme={theme}/>
                ))}
            </ScrollView>

            {isStaff && (
                <Modal visible={showCreate} animationType='slide' presentationStyle='fullScreen'>
                    <CreateAfishaModal
                        userId={currentUser?.id || ''}
                        userName={currentUser?.username || ''}
                        userToken={sessionToken}
                        serverUrl={serverUrl}
                        theme={theme}
                        onClose={() => setShowCreate(false)}
                        onPublished={handlePublished}
                    />
                </Modal>
            )}
        </View>
    );
}

const enhance = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhance(AcademyAfishaScreen));
