// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {bookingApi, type RoomInfo} from './booking_api';

type Props = {
    userToken: string;
    serverUrl?: string;
    theme: Theme;
    onClose: () => void;
    onSaved: () => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1, backgroundColor: changeOpacity(theme.centerChannelColor, 0.02)},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    backBtn: {padding: 4, marginRight: 12},
    headerTitle: {fontSize: 18, fontWeight: '700', color: theme.centerChannelColor, flex: 1},
    addBtn: {padding: 8},
    scroll: {flex: 1},
    scrollContent: {padding: 12, paddingBottom: 40},
    hint: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.5),
        marginBottom: 12,
        paddingHorizontal: 4,
        lineHeight: 18,
    },
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardAccent: {width: 4, borderRadius: 4, alignSelf: 'stretch', marginRight: 12},
    cardBody: {flex: 1, minWidth: 0},
    cardTitle: {fontSize: 15, fontWeight: '700', color: theme.centerChannelColor},
    cardMeta: {fontSize: 12, color: changeOpacity(theme.centerChannelColor, 0.5), marginTop: 4},
    cardActions: {flexDirection: 'row', gap: 4},
    iconBtn: {padding: 8},
    empty: {alignItems: 'center', padding: 32},
    emptyText: {fontSize: 14, color: changeOpacity(theme.centerChannelColor, 0.4), textAlign: 'center'},
    loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 36,
        maxHeight: '92%',
    },
    modalTitle: {fontSize: 17, fontWeight: '700', color: theme.centerChannelColor, marginBottom: 16},
    label: {
        fontSize: 11,
        fontWeight: '700',
        color: changeOpacity(theme.centerChannelColor, 0.45),
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    input: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 10,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        padding: 12,
        fontSize: 15,
        color: theme.centerChannelColor,
        marginBottom: 14,
    },
    inputMultiline: {minHeight: 72, textAlignVertical: 'top'},
    row2: {flexDirection: 'row', gap: 10},
    row2Item: {flex: 1},
    saveBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    saveBtnText: {color: theme.buttonColor, fontWeight: '700', fontSize: 16},
    cancelBtn: {paddingVertical: 14, alignItems: 'center'},
    cancelText: {color: changeOpacity(theme.centerChannelColor, 0.45), fontSize: 15},
}));

function RoomsAdminScreen({userToken, serverUrl, theme, onClose, onSaved}: Props) {
    const style = getStyleSheet(theme);
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [editorOpen, setEditorOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);

    const [editId, setEditId] = useState('');
    const [name, setName] = useState('');
    const [area, setArea] = useState('');
    const [floor, setFloor] = useState('');
    const [equipmentText, setEquipmentText] = useState('');
    const [color, setColor] = useState('#555555');
    const [sortOrder, setSortOrder] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await bookingApi.getRooms(userToken, serverUrl);
            setRooms(Array.isArray(rows) ? rows : []);
        } catch (e) {
            Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось загрузить классы');
            setRooms([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl, userToken]);

    useEffect(() => {
        load();
    }, [load]);

    const openNew = useCallback(() => {
        setCreating(true);
        setEditId('');
        setName('');
        setArea('');
        setFloor('1');
        setEquipmentText('');
        setColor('#1a1a35');
        setSortOrder('');
        setEditorOpen(true);
    }, []);

    const openEdit = useCallback((r: RoomInfo) => {
        setCreating(false);
        setEditId(r.id);
        setName(r.name);
        setArea(String(r.area));
        setFloor(String(r.floor));
        setEquipmentText((r.equipment || []).join('\n'));
        setColor(r.color || '#555555');
        setSortOrder(r.sort_order !== undefined ? String(r.sort_order) : '');
        setEditorOpen(true);
    }, []);

    const closeEditor = useCallback(() => {
        setEditorOpen(false);
    }, []);

    const handleSave = useCallback(async () => {
        const areaNum = parseFloat(area.replace(',', '.'));
        const floorNum = parseInt(floor, 10);
        const sortNum = sortOrder.trim() === '' ? undefined : parseInt(sortOrder, 10);
        if (!name.trim()) {
            Alert.alert('Проверьте', 'Укажите название');
            return;
        }
        if (Number.isNaN(areaNum) || areaNum < 0) {
            Alert.alert('Проверьте', 'Некорректная площадь (м²)');
            return;
        }
        if (Number.isNaN(floorNum)) {
            Alert.alert('Проверьте', 'Некорректный этаж');
            return;
        }
        const equip = equipmentText.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
        setSaving(true);
        try {
            if (creating) {
                const id = editId.trim() || `r${Date.now().toString(36)}`;
                if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
                    Alert.alert('Проверьте', 'id: латиница, цифры, _ и -, до 64 символов');
                    return;
                }
                await bookingApi.createRoom({
                    id,
                    name: name.trim(),
                    area: areaNum,
                    floor: floorNum,
                    equipment: equip,
                    color: color.trim() || '#555555',
                    sort_order: sortNum !== undefined && !Number.isNaN(sortNum) ? sortNum : undefined,
                }, userToken, serverUrl);
            } else {
                await bookingApi.updateRoom(editId, {
                    name: name.trim(),
                    area: areaNum,
                    floor: floorNum,
                    equipment: equip,
                    color: color.trim() || '#555555',
                    sort_order: sortNum !== undefined && !Number.isNaN(sortNum) ? sortNum : undefined,
                }, userToken, serverUrl);
            }
            closeEditor();
            await load();
            onSaved();
        } catch (e) {
            Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не сохранено');
        } finally {
            setSaving(false);
        }
    }, [area, color, creating, editId, equipmentText, floor, load, name, onSaved, serverUrl, sortOrder, userToken, closeEditor]);

    const handleDelete = useCallback((r: RoomInfo) => {
        Alert.alert(
            'Удалить класс?',
            `${r.name} (${r.id})`,
            [
                {text: 'Отмена', style: 'cancel'},
                {
                    text: 'Удалить',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await bookingApi.deleteRoom(r.id, userToken, serverUrl);
                            await load();
                            onSaved();
                        } catch (e) {
                            Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось удалить');
                        }
                    },
                },
            ],
        );
    }, [load, onSaved, serverUrl, userToken]);

    if (loading) {
        return (
            <SafeAreaView style={style.container}>
                <View style={style.header}>
                    <TouchableOpacity
                        style={style.backBtn}
                        onPress={onClose}
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={22}
                            color={theme.centerChannelColor}
                        />
                    </TouchableOpacity>
                    <Text style={style.headerTitle}>{'Классы'}</Text>
                </View>
                <View style={style.loading}>
                    <ActivityIndicator
                        size='large'
                        color={theme.sidebarTextActiveBorder}
                    />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={style.container}>
            <View style={style.header}>
                <TouchableOpacity
                    style={style.backBtn}
                    onPress={onClose}
                >
                    <CompassIcon
                        name='arrow-left'
                        size={22}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <Text style={style.headerTitle}>{'Классы'}</Text>
                <TouchableOpacity
                    style={style.addBtn}
                    onPress={openNew}
                    accessibilityLabel='Добавить класс'
                >
                    <CompassIcon
                        name='plus'
                        size={24}
                        color={theme.sidebarTextActiveBorder}
                    />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={style.scroll}
                contentContainerStyle={style.scrollContent}
                keyboardShouldPersistTaps='handled'
            >
                <Text style={style.hint}>
                    {'Справочник аудиторий для бронирования. Удаление возможно, только если нет активных заявок (pending / approved).'}
                </Text>
                {rooms.length === 0 ? (
                    <View style={style.empty}>
                        <Text style={style.emptyText}>
                            {'Нет классов. Нажмите + чтобы добавить.'}
                        </Text>
                    </View>
                ) : (
                    rooms.map((r) => (
                        <View
                            key={r.id}
                            style={style.card}
                        >
                            <View style={[style.cardAccent, {backgroundColor: r.color || '#555'}]}/>
                            <View style={style.cardBody}>
                                <Text
                                    style={style.cardTitle}
                                    numberOfLines={2}
                                >
                                    {r.name}
                                </Text>
                                <Text style={style.cardMeta}>
                                    {`${r.id}  •  ${r.area} м²  •  ${r.floor} эт.`}
                                </Text>
                            </View>
                            <View style={style.cardActions}>
                                <TouchableOpacity
                                    style={style.iconBtn}
                                    onPress={() => openEdit(r)}
                                    accessibilityLabel='Редактировать'
                                >
                                    <CompassIcon
                                        name='pencil-outline'
                                        size={22}
                                        color={changeOpacity(theme.centerChannelColor, 0.65)}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={style.iconBtn}
                                    onPress={() => handleDelete(r)}
                                    accessibilityLabel='Удалить'
                                >
                                    <CompassIcon
                                        name='close'
                                        size={22}
                                        color={changeOpacity('#d24b4e', 0.85)}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            <Modal
                visible={editorOpen}
                transparent
                animationType='slide'
                onRequestClose={closeEditor}
            >
                <View style={style.modalOverlay}>
                    <TouchableOpacity
                        style={{flex: 1}}
                        activeOpacity={1}
                        onPress={closeEditor}
                    />
                    <View style={style.modalSheet}>
                        <ScrollView keyboardShouldPersistTaps='handled'>
                            <Text style={style.modalTitle}>
                                {creating ? 'Новый класс' : 'Редактирование'}
                            </Text>

                            {creating ? (
                                <>
                                    <Text style={style.label}>{'ID (латиница, r7)'}</Text>
                                    <TextInput
                                        style={style.input}
                                        value={editId}
                                        onChangeText={setEditId}
                                        placeholder='r7'
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                        autoCapitalize='none'
                                        autoCorrect={false}
                                    />
                                </>
                            ) : (
                                <Text style={{fontSize: 13, color: changeOpacity(theme.centerChannelColor, 0.5), marginBottom: 12}}>
                                    {`id: ${editId}`}
                                </Text>
                            )}

                            <Text style={style.label}>{'Название'}</Text>
                            <TextInput
                                style={style.input}
                                value={name}
                                onChangeText={setName}
                                placeholder='Класс № 1'
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                            />

                            <View style={style.row2}>
                                <View style={style.row2Item}>
                                    <Text style={style.label}>{'Площадь м²'}</Text>
                                    <TextInput
                                        style={style.input}
                                        value={area}
                                        onChangeText={setArea}
                                        keyboardType='decimal-pad'
                                        placeholder='24'
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                    />
                                </View>
                                <View style={style.row2Item}>
                                    <Text style={style.label}>{'Этаж'}</Text>
                                    <TextInput
                                        style={style.input}
                                        value={floor}
                                        onChangeText={setFloor}
                                        keyboardType='number-pad'
                                        placeholder='1'
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                    />
                                </View>
                            </View>

                            <Text style={style.label}>{'Оборудование (строка или через запятую)'}</Text>
                            <TextInput
                                style={[style.input, style.inputMultiline]}
                                value={equipmentText}
                                onChangeText={setEquipmentText}
                                multiline
                                placeholder={'Рояль\nЗеркала'}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                            />

                            <View style={style.row2}>
                                <View style={style.row2Item}>
                                    <Text style={style.label}>{'Цвет (#hex)'}</Text>
                                    <TextInput
                                        style={style.input}
                                        value={color}
                                        onChangeText={setColor}
                                        placeholder='#1a1a35'
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                        autoCapitalize='none'
                                    />
                                </View>
                                <View style={style.row2Item}>
                                    <Text style={style.label}>{'Порядок'}</Text>
                                    <TextInput
                                        style={style.input}
                                        value={sortOrder}
                                        onChangeText={setSortOrder}
                                        keyboardType='number-pad'
                                        placeholder='1'
                                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.35)}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[style.saveBtn, saving && {opacity: 0.6}]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color={theme.buttonColor}/>
                                ) : (
                                    <Text style={style.saveBtnText}>{'Сохранить'}</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={style.cancelBtn}
                                onPress={closeEditor}
                            >
                                <Text style={style.cancelText}>{'Отмена'}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

export default RoomsAdminScreen;
