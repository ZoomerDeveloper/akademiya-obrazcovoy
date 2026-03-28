// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useSelector} from 'react-redux';

import type {Channel} from '@mattermost/types/channels';
import type {Post} from '@mattermost/types/posts';

import {Client4} from 'mattermost-redux/client';

import type {GlobalState} from 'types/store';

type AcademyTab = 'news_students' | 'news_staff' | 'afisha' | 'faq' | 'booking' | 'schedule' | 'organization' | 'profile' | 'admin';

type PostList = {
    order: string[];
    posts: Record<string, Post>;
};

type Booking = {
    id: string;
    room_id?: string;
    room_name: string;
    user_id?: string;
    user_name: string;
    user_email?: string;
    date: string;
    start_time: string;
    end_time: string;
    purpose?: string;
    status: string;
    payment_link?: string;
    reject_reason?: string;
    admin_note?: string;
    is_curriculum?: number;
    /** 1 — видно студентам в расписании; 0 — только staff (аренда/партнёры) */
    student_visible?: number;
};

type AlternativeSlot = {
    start: string;
    end: string;
};

type PostDraft = {
    id: string;
    tab: string;
    title: string;
    body: string;
    template_id?: string;
    image_file_id?: string;
    channel_id?: string;
    formatted_message?: string;
    author_id: string;
    author_name: string;
    status: 'pending' | 'approved' | 'rejected';
    reject_reason?: string;
    created_at: number;
};

type RecurringBooking = {
    id: string;
    room_id: string;
    room_name: string;
    day_of_week: number; // 0=Пн ... 6=Вс
    start_time: string;
    end_time: string;
    purpose?: string;
    note?: string;
    is_curriculum: number;
    student_visible: number;
    created_at: number;
};

type AfishaTemplate = {
    id: string;
    label: string;
    emoji: string;
    color: string;
    ticketLabel?: string; // метка поля «билет/вход»
};

const TABS: Array<{id: AcademyTab; label: string}> = [
    {id: 'news_students', label: 'Новости студентам'},
    {id: 'news_staff', label: 'Новости сотрудникам'},
    {id: 'afisha', label: 'Афиша'},
    {id: 'faq', label: 'FAQ'},
    {id: 'booking', label: 'Бронирование'},
    {id: 'schedule', label: 'Расписание'},
    {id: 'organization', label: 'Организация'},
    {id: 'profile', label: 'Личный кабинет'},
    {id: 'admin', label: 'Админ-панель'},
];

const WEEKDAY_LABELS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ORG_CHANNELS = [
    {name: 'resepchen', label: '🏢 Ресепшн'},
    {name: 'tehnicheskie-voprosy', label: '🔧 Технические вопросы'},
    {name: 'buhgalteriya', label: '💰 Бухгалтерия'},
    {name: 'raspisanie', label: '📅 Расписание'},
    {name: 'aktovyj-zal', label: '🎭 Актовый зал'},
];

const CHANNEL_BY_TAB: Record<'news_students' | 'news_staff' | 'afisha' | 'faq', string> = {
    news_students: 'novosti-studentam',
    news_staff: 'novosti-sotrudnikam',
    afisha: 'afisha',
    faq: 'faq',
};
const CHANNEL_SEED: Record<'news_students' | 'news_staff' | 'afisha' | 'faq', {display_name: string; type: 'O' | 'P'; purpose: string}> = {
    news_students: {
        display_name: '📰 Новости студентам',
        type: 'O',
        purpose: 'Новости, анонсы мероприятий, результаты для студентов.',
    },
    news_staff: {
        display_name: '📰 Новости сотрудникам',
        type: 'P',
        purpose: 'Внутренние новости и объявления для сотрудников и педагогов.',
    },
    afisha: {
        display_name: '🎪 Афиша мероприятий',
        type: 'O',
        purpose: 'Концерты, мастер-классы и события Академии.',
    },
    faq: {
        display_name: '❓ FAQ / Часто задаваемые вопросы',
        type: 'O',
        purpose: 'Ответы на частые вопросы для студентов и сотрудников.',
    },
};

const AFISHA_TEMPLATES: AfishaTemplate[] = [
    {id: 'concert', label: 'Концерт', emoji: '🎹', color: '#1a1a35', ticketLabel: 'Билеты / ссылка покупки'},
    {id: 'masterclass', label: 'Мастер-класс', emoji: '🎓', color: '#264653', ticketLabel: 'Участие (вход)'},
    {id: 'exam', label: 'Экзамен', emoji: '📝', color: '#8d0801'},
    {id: 'openlesson', label: 'Открытый урок', emoji: '📚', color: '#386641', ticketLabel: 'Вход свободный / билет'},
    {id: 'competition', label: 'Конкурс', emoji: '🏆', color: '#7b2cbf', ticketLabel: 'Регистрация / билеты'},
];

function isStaff(roles: string) {
    return roles.includes('team_admin') || roles.includes('system_admin');
}

function formatDate(epochMs: number) {
    if (!epochMs) {
        return '';
    }
    return new Date(epochMs).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getAcademyRoleLabel(roles: string) {
    if (roles.includes('system_admin')) {
        return 'Администратор Академии';
    }
    if (roles.includes('team_admin')) {
        return 'Педагог / Сотрудник';
    }
    return 'Студент';
}

function formatLocalISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
}

function addDaysLocal(d: Date, n: number): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}

function bookingDurationMin(b: Booking): number {
    const [sh, sm] = b.start_time.split(':').map(Number);
    const [eh, em] = b.end_time.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
}

function shiftMonthKeepFirst(isoYmd: string, deltaMonths: number): string {
    const [y, m] = isoYmd.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, (m - 1) + deltaMonths, 1);
    return formatLocalISODate(dt);
}

function isFaqStaffOnly(message: string) {
    const text = (message || '').toLowerCase();
    return text.includes('[staff_only]') ||
        text.includes('[staff]') ||
        text.includes('#staff') ||
        text.includes('только для сотрудников') ||
        text.includes('для сотрудников и педагогов');
}

// ─── PNG-экспорт афиши через Canvas (без сторонних зависимостей) ──────────────

function wrapTextToLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
    ctx.font = font;
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) { lines.push(current); }
    return lines;
}

function exportAfishaAsPNG(
    bgColor: string,
    emoji: string,
    title: string,
    body: string,
    imageDataUrl: string | null,
    ticketLink?: string,
): void {
    const W = 800;
    const H = 1100;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }

    const doExport = () => {
        ctx.fillStyle = bgColor || '#1a1a35';
        ctx.fillRect(0, 0, W, H);

        const grad = ctx.createLinearGradient(0, H * 0.3, 0, H);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.72)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';

        ctx.font = 'bold 90px sans-serif';
        ctx.fillText(emoji || '🎹', W / 2, H * 0.5);

        const titleLines = wrapTextToLines(ctx, title || 'Афиша', W - 100, 'bold 52px sans-serif');
        let ty = H * 0.60;
        ctx.font = 'bold 52px sans-serif';
        for (const line of titleLines) { ctx.fillText(line, W / 2, ty); ty += 64; }

        ctx.globalAlpha = 0.88;
        const bodyLines = wrapTextToLines(ctx, body || '', W - 100, '32px sans-serif');
        let by = ty + 18;
        ctx.font = '32px sans-serif';
        for (const line of bodyLines.slice(0, 5)) { ctx.fillText(line, W / 2, by); by += 42; }
        ctx.globalAlpha = 1;

        // Билет / ссылка продажи
        if (ticketLink) {
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#f0ead6';
            ctx.font = 'bold 26px sans-serif';
            const ticketText = ticketLink.startsWith('http') ? `🎟 Билеты: ${ticketLink}` : `🎟 ${ticketLink}`;
            const ticketLines = wrapTextToLines(ctx, ticketText, W - 120, 'bold 26px sans-serif');
            let tky = by + 18;
            for (const line of ticketLines.slice(0, 2)) { ctx.fillText(line, W / 2, tky); tky += 34; }
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 1;
        }

        ctx.font = '20px sans-serif';
        ctx.globalAlpha = 0.5;
        ctx.fillText('Международная академия музыки Елены Образцовой', W / 2, H - 28);
        ctx.globalAlpha = 1;

        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `afisha-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
    };

    if (imageDataUrl) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, W, Math.floor(H * 0.45));
            doExport();
        };
        img.onerror = doExport;
        img.src = imageDataUrl;
    } else {
        doExport();
    }
}

const DAY_LABELS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export default function AcademyHub() {
    const [activeTab, setActiveTab] = useState<AcademyTab>('news_students');
    const [channelsByName, setChannelsByName] = useState<Record<string, Channel>>({});
    const [postsByTab, setPostsByTab] = useState<Record<'news_students' | 'news_staff' | 'afisha' | 'faq', Post[]>>({
        news_students: [],
        news_staff: [],
        afisha: [],
        faq: [],
    });
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [users, setUsers] = useState<Array<{id: string; username: string; email: string; roles: string}>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [academyTeamId, setAcademyTeamId] = useState('');
    const [academyTeamName, setAcademyTeamName] = useState('');

    const [draftTitle, setDraftTitle] = useState('');
    const [draftText, setDraftText] = useState('');
    const [draftTicketLink, setDraftTicketLink] = useState('');
    const [templateId, setTemplateId] = useState(AFISHA_TEMPLATES[0].id);
    const [publishing, setPublishing] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [userQuery, setUserQuery] = useState('');
    const [bookingForm, setBookingForm] = useState({
        room_id: 'class-1',
        room_name: 'Класс №1',
        date: new Date().toISOString().slice(0, 10),
        start_time: '18:00',
        end_time: '19:00',
        purpose: '',
        is_curriculum: true,
        show_to_students: true,
    });
    const [myBookings, setMyBookings] = useState<Booking[]>([]);
    const [faqQuery, setFaqQuery] = useState('');
    const [bookingAlternatives, setBookingAlternatives] = useState<AlternativeSlot[]>([]);
    const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'staff' | 'admin'>('all');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
    const [bookingDateFilter, setBookingDateFilter] = useState('');
    const [bookingRoomFilter, setBookingRoomFilter] = useState('');

    const [scheduleBookings, setScheduleBookings] = useState<Booking[]>([]);
    const [scheduleView, setScheduleView] = useState<'week' | 'month'>('week');
    const [scheduleRefDate, setScheduleRefDate] = useState(() => formatLocalISODate(new Date()));
    const [scheduleRoomFilter, setScheduleRoomFilter] = useState('');
    const [scheduleFloorFilter, setScheduleFloorFilter] = useState('');
    const [scheduleMinDuration, setScheduleMinDuration] = useState(0);
    const [scheduleCurriculumFilter, setScheduleCurriculumFilter] = useState<'all' | 'curriculum' | 'extra'>('all');
    const [hidePartnerSlots, setHidePartnerSlots] = useState(true);
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [hallBookings, setHallBookings] = useState<Booking[]>([]);
    const [approveVisibleToStudents, setApproveVisibleToStudents] = useState<Record<string, boolean>>({});
    const [approvePaymentLink, setApprovePaymentLink] = useState<Record<string, string>>({});

    // ── Согласие на обработку ПДн ──────────────────────────────────────────────
    // Инициализируем false; читаем localStorage по userId-ключу в useEffect ниже
    const [pdnConsented, setPdnConsented] = useState<boolean>(false);

    // ── Изображение к афише ────────────────────────────────────────────────────
    const [afishaImageDataUrl, setAfishaImageDataUrl] = useState<string | null>(null);
    const [afishaImageFile, setAfishaImageFile] = useState<File | null>(null);

    // ── Черновики публикаций (workflow согласования) ───────────────────────────
    const [postDrafts, setPostDrafts] = useState<PostDraft[]>([]);
    const [draftsLoading, setDraftsLoading] = useState(false);
    const [draftRejectReason, setDraftRejectReason] = useState<Record<string, string>>({});

    // ── Регулярные слоты в расписании ─────────────────────────────────────────
    const [recurringList, setRecurringList] = useState<RecurringBooking[]>([]);
    const [recurringForm, setRecurringForm] = useState({
        room_id: 'class-1',
        room_name: 'Класс №1',
        day_of_week: 0,
        start_time: '10:00',
        end_time: '11:00',
        purpose: '',
        is_curriculum: true,
        student_visible: true,
    });

    // ── Реакции на посты афиши (счётчик) ──────────────────────────────────────
    const [postReactions, setPostReactions] = useState<Record<string, number>>({});

    // ── Статистика каналов (участники / кол-во постов) для Admin ──────────────
    const [channelStats, setChannelStats] = useState<Record<string, {member_count: number; post_count: number}>>({});

    // ── Закреплённые посты ─────────────────────────────────────────────────────
    const [pinnedPostIds, setPinnedPostIds] = useState<Set<string>>(new Set());

    // ── Закреплённые сообщения в служебных каналах (для Organisation tab) ─────
    const [orgPinnedPosts, setOrgPinnedPosts] = useState<Record<string, Array<{id: string; message: string; create_at: number}>>>({});

    const currentTeamId = useSelector((state: GlobalState) => state.entities.teams.currentTeamId);
    const currentUserId = useSelector((state: GlobalState) => state.entities.users.currentUserId);
    const currentUser = useSelector((state: GlobalState) => state.entities.users.profiles[currentUserId]);
    const currentTeam = useSelector((state: GlobalState) => state.entities.teams.teams[currentTeamId]);
    const canPublish = useMemo(() => isStaff(currentUser?.roles || ''), [currentUser?.roles]);
    const isSystemAdmin = useMemo(() => (currentUser?.roles || '').includes('system_admin'), [currentUser?.roles]);
    // team_admin (не system_admin) отправляет на согласование; system_admin публикует напрямую
    const canDraft = canPublish; // все staff могут создавать черновики/публикации
    const effectiveTeamId = academyTeamId || currentTeamId || '';

    // ── Читаем ПДн-согласие после получения userId ─────────────────────────────
    useEffect(() => {
        if (!currentUserId) {
            return;
        }
        const consented = Boolean(localStorage.getItem(`academy.privacy_consent.${currentUserId}`));
        setPdnConsented(consented);
    }, [currentUserId]);

    useEffect(() => {
        let mounted = true;
        const detectTeam = async () => {
            try {
                const resp = await fetch('/api/v4/users/me/teams', {credentials: 'include'});
                if (!resp.ok) {
                    return;
                }
                const teams = await resp.json() as Array<{id: string; name: string; display_name: string}>;
                if (!Array.isArray(teams) || teams.length === 0) {
                    return;
                }
                const academy = teams.find((t) =>
                    t.name.toLowerCase().includes('akadem') ||
                    t.display_name.toLowerCase().includes('академ'),
                );
                if (mounted) {
                    setAcademyTeamId(academy?.id || teams[0].id);
                    setAcademyTeamName(academy?.name || teams[0].name || '');
                }
            } catch {
                // ignore
            }
        };
        detectTeam();
        return () => {
            mounted = false;
        };
    }, []);

    const resolveChannelForTab = useCallback(async (
        tab: 'news_students' | 'news_staff' | 'afisha' | 'faq',
        mapped: Record<string, Channel>,
    ): Promise<Channel | undefined> => {
        const byName = mapped[CHANNEL_BY_TAB[tab]];
        if (byName) {
            return byName;
        }

        if (!effectiveTeamId) {
            return undefined;
        }

        try {
            // Team Edition-safe путь: берём доступные каналы пользователя в текущей команде
            const myChannelsResp = await fetch(
                `/api/v4/users/me/teams/${effectiveTeamId}/channels`,
                {credentials: 'include'},
            );
            if (!myChannelsResp.ok) {
                return undefined;
            }
            const myChannels = await myChannelsResp.json() as Channel[];
            const found = myChannels.find((c) => c.name === CHANNEL_BY_TAB[tab]);
            if (found) {
                return found;
            }

            // Канал может существовать, но пользователь не является участником.
            // Ищем канал по имени внутри команды и пытаемся вступить.
            const byNameResp = await fetch(
                `/api/v4/teams/${effectiveTeamId}/channels/name/${CHANNEL_BY_TAB[tab]}`,
                {credentials: 'include'},
            );
            if (byNameResp.ok) {
                const existing = await byNameResp.json() as Channel;
                if (existing?.id && currentUserId) {
                    await fetch(`/api/v4/channels/${existing.id}/members`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({user_id: currentUserId}),
                    });
                }
                return existing;
            }

            // Автовосстановление в текущей команде (если есть права)
            const seed = CHANNEL_SEED[tab];
            await fetch('/api/v4/channels', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    team_id: effectiveTeamId,
                    name: CHANNEL_BY_TAB[tab],
                    display_name: seed.display_name,
                    type: seed.type,
                    purpose: seed.purpose,
                }),
            });

            const retryResp = await fetch(
                `/api/v4/users/me/teams/${effectiveTeamId}/channels`,
                {credentials: 'include'},
            );
            if (!retryResp.ok) {
                return undefined;
            }
            const retried = await retryResp.json() as Channel[];
            const retryFound = retried.find((c) => c.name === CHANNEL_BY_TAB[tab]);
            if (retryFound) {
                return retryFound;
            }

            // Если канал создался, но не попал в список "my channels", пробуем повторно найти по имени
            const byNameAfterCreate = await fetch(
                `/api/v4/teams/${effectiveTeamId}/channels/name/${CHANNEL_BY_TAB[tab]}`,
                {credentials: 'include'},
            );
            if (!byNameAfterCreate.ok) {
                return undefined;
            }
            const created = await byNameAfterCreate.json() as Channel;
            if (created?.id && currentUserId) {
                await fetch(`/api/v4/channels/${created.id}/members`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({user_id: currentUserId}),
                });
            }
            return created;
        } catch {
            return undefined;
        }
    }, [effectiveTeamId, currentUserId]);

    const loadChannelsAndPosts = useCallback(async () => {
        if (!effectiveTeamId) {
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const channels = await Client4.getMyChannels(effectiveTeamId);
            const mapped: Record<string, Channel> = {};
            channels.forEach((ch) => {
                mapped[ch.name] = ch;
            });
            setChannelsByName(mapped);

            const nextPostsByTab: Record<'news_students' | 'news_staff' | 'afisha' | 'faq', Post[]> = {
                news_students: [],
                news_staff: [],
                afisha: [],
                faq: [],
            };

            await Promise.all((Object.keys(CHANNEL_BY_TAB) as Array<keyof typeof CHANNEL_BY_TAB>).map(async (id) => {
                const channel = await resolveChannelForTab(id, mapped);
                if (!channel) {
                    return;
                }
                const response = await Client4.getPosts(channel.id, 0, 20, true, false, false) as PostList;
                nextPostsByTab[id] = response.order.map((postId) => response.posts[postId]).filter(Boolean);
            }));

            setPostsByTab(nextPostsByTab);
        } catch {
            setError('Не удалось загрузить данные Академии. Проверьте доступ к каналам.');
        } finally {
            setLoading(false);
        }
    }, [effectiveTeamId, resolveChannelForTab]);

    const loadBookings = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:3001/api/bookings?status=pending', {headers: {Authorization: 'Bearer web'}});
            const data = await response.json();
            setBookings(Array.isArray(data) ? data : []);
        } catch {
            setError('Booking Service недоступен (порт 3001).');
        }
    }, []);

    const loadMyBookings = useCallback(async () => {
        if (!currentUserId) {
            setMyBookings([]);
            return;
        }
        try {
            const response = await fetch(`http://localhost:3001/api/bookings/my?user_id=${currentUserId}`, {headers: {Authorization: 'Bearer web'}});
            const data = await response.json();
            setMyBookings(Array.isArray(data) ? data : []);
        } catch {
            setError('Не удалось загрузить мои бронирования.');
        }
    }, [currentUserId]);

    const loadScheduleBookings = useCallback(async () => {
        setScheduleError(null);
        const base = new Date(`${scheduleRefDate}T12:00:00`);
        let from: string;
        let to: string;
        if (scheduleView === 'week') {
            const mon = startOfWeekMonday(base);
            from = formatLocalISODate(mon);
            to = formatLocalISODate(addDaysLocal(mon, 6));
        } else {
            const y = base.getFullYear();
            const mo = base.getMonth();
            from = formatLocalISODate(new Date(y, mo, 1));
            to = formatLocalISODate(new Date(y, mo + 1, 0));
        }
        const studentOnly = canPublish ? '0' : '1';
        try {
            const response = await fetch(
                `http://localhost:3001/api/bookings?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}&student_only=${studentOnly}`,
                {headers: {Authorization: 'Bearer web'}},
            );
            const data = await response.json();
            if (!response.ok) {
                setScheduleError((data && data.error) || 'Не удалось загрузить расписание.');
                setScheduleBookings([]);
                return;
            }
            setScheduleBookings(Array.isArray(data) ? data : []);
        } catch {
            setScheduleError('Booking Service недоступен (порт 3001).');
            setScheduleBookings([]);
        }
    }, [scheduleRefDate, scheduleView, canPublish]);

    const loadHallBookings = useCallback(async () => {
        try {
            const from = formatLocalISODate(addDaysLocal(new Date(), -14));
            const to = formatLocalISODate(addDaysLocal(new Date(), 120));
            const studentOnly = canPublish ? '0' : '1';
            const response = await fetch(
                `http://localhost:3001/api/bookings?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}&student_only=${studentOnly}`,
                {headers: {Authorization: 'Bearer web'}},
            );
            const data = await response.json();
            setHallBookings(Array.isArray(data) ? data : []);
        } catch {
            setHallBookings([]);
        }
    }, [canPublish]);

    const loadUsers = useCallback(async () => {
        if (!effectiveTeamId) {
            return;
        }
        try {
            const profiles = await Client4.getProfilesInTeam(effectiveTeamId, 0, 200, 'username', {});
            setUsers(profiles.map((u) => ({id: u.id, username: u.username, email: u.email || '', roles: u.roles || ''})));
        } catch {
            setError('Не удалось загрузить пользователей команды.');
        }
    }, [effectiveTeamId]);

    const loadOrgPinnedPosts = useCallback(async () => {
        try {
            const results: Record<string, Array<{id: string; message: string; create_at: number}>> = {};
            await Promise.all(
                ORG_CHANNELS.map(async (ch) => {
                    try {
                        const r = await fetch(`/api/v4/teams/${effectiveTeamId}/channels/name/${ch.name}`, {credentials: 'include'});
                        if (!r.ok) { return; }
                        const channelData = await r.json() as {id: string};
                        if (!channelData.id) { return; }
                        const pr = await fetch(`/api/v4/channels/${channelData.id}/pinned`, {credentials: 'include'});
                        if (!pr.ok) { return; }
                        const pinData = await pr.json() as {order?: string[]; posts?: Record<string, {id: string; message: string; create_at: number}>};
                        const posts = pinData.posts || {};
                        const order = pinData.order || [];
                        results[ch.name] = order.map((id) => posts[id]).filter(Boolean).slice(0, 3);
                    } catch {
                        // ignore
                    }
                }),
            );
            setOrgPinnedPosts(results);
        } catch {
            // ignore
        }
    }, [effectiveTeamId]);

    useEffect(() => {
        loadChannelsAndPosts();
    }, [loadChannelsAndPosts]);

    useEffect(() => {
        if (activeTab === 'booking') {
            loadBookings();
            loadMyBookings();
        }
        if (activeTab === 'organization') {
            loadHallBookings();
            loadOrgPinnedPosts();
        }
        if (activeTab === 'schedule') {
            loadScheduleBookings();
        }
        if (activeTab === 'profile') {
            loadMyBookings();
        }
        if (activeTab === 'admin' && canPublish) {
            loadUsers();
        }
    }, [activeTab, canPublish, loadBookings, loadHallBookings, loadMyBookings, loadOrgPinnedPosts, loadScheduleBookings, loadUsers]);

    const filteredUsers = useMemo(() => {
        const query = userQuery.trim().toLowerCase();
        return users.filter((u) => {
            const matchesQuery = !query || u.username.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
            const roles = u.roles || '';
            const matchesRole = roleFilter === 'all' ||
                (roleFilter === 'admin' && roles.includes('system_admin')) ||
                (roleFilter === 'staff' && roles.includes('team_admin')) ||
                (roleFilter === 'student' && !roles.includes('team_admin') && !roles.includes('system_admin'));
            return matchesQuery && matchesRole;
        });
    }, [users, userQuery, roleFilter]);

    const visibleFaqPosts = useMemo(() => {
        const base = postsByTab.faq.filter((post) => {
            if (!faqQuery.trim()) {
                return true;
            }
            return post.message.toLowerCase().includes(faqQuery.trim().toLowerCase());
        });

        if (canPublish) {
            return base;
        }

        return base.filter((post) => !isFaqStaffOnly(post.message));
    }, [postsByTab.faq, faqQuery, canPublish]);

    useEffect(() => {
        // Сбрасываем выделение, если текущий фильтр убрал часть пользователей из списка.
        setSelectedUserIds((prev) => prev.filter((id) => filteredUsers.some((u) => u.id === id)));
    }, [filteredUsers]);

    const pendingSortedBookings = useMemo(() => {
        return [...bookings].filter((b) => {
            const byStatus = bookingStatusFilter === 'all' || b.status === bookingStatusFilter;
            const byDate = !bookingDateFilter || b.date === bookingDateFilter;
            const byRoom = !bookingRoomFilter.trim() || b.room_name.toLowerCase().includes(bookingRoomFilter.trim().toLowerCase());
            return byStatus && byDate && byRoom;
        }).sort((a, b) => {
            const aTs = new Date(`${a.date}T${a.start_time}:00`).getTime();
            const bTs = new Date(`${b.date}T${b.start_time}:00`).getTime();
            return aTs - bTs;
        });
    }, [bookings, bookingDateFilter, bookingRoomFilter, bookingStatusFilter]);

    const statusBadgeStyle = (status: string): React.CSSProperties => {
        const map: Record<string, {bg: string; color: string}> = {
            pending: {bg: '#fef3c7', color: '#92400e'},
            approved: {bg: '#dcfce7', color: '#166534'},
            rejected: {bg: '#fee2e2', color: '#991b1b'},
            cancelled: {bg: '#e2e8f0', color: '#334155'},
        };
        const st = map[status] || map.pending;
        return {
            display: 'inline-flex',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: st.bg,
            color: st.color,
        };
    };

    const openChannel = useCallback((channelName: string) => {
        const teamNameForUrl = academyTeamName || currentTeam?.name || '';
        if (!teamNameForUrl) {
            setError('Не удалось определить команду для перехода в канал.');
            return;
        }
        window.location.href = `/${teamNameForUrl}/channels/${channelName}`;
    }, [academyTeamName, currentTeam?.name]);

    const hallReadonlyBookings = useMemo(() => {
        return [...hallBookings].filter((b) => {
            const room = (b.room_name || '').toLowerCase();
            const id = (b.room_id || '').toLowerCase();
            return room.includes('актов') || room.includes('hall') || room.includes('зал') || id.includes('aktov');
        }).sort((a, b) => {
            const aTs = new Date(`${a.date}T${a.start_time}:00`).getTime();
            const bTs = new Date(`${b.date}T${b.start_time}:00`).getTime();
            return aTs - bTs;
        }).slice(0, 16);
    }, [hallBookings]);

    const filteredScheduleBookings = useMemo(() => {
        return scheduleBookings.filter((b) => {
            if (scheduleRoomFilter.trim()) {
                const q = scheduleRoomFilter.trim().toLowerCase();
                const id = (b.room_id || '').toLowerCase();
                if (!b.room_name.toLowerCase().includes(q) && !id.includes(q)) {
                    return false;
                }
            }
            if (scheduleFloorFilter) {
                const nameAndId = `${b.room_name} ${b.room_id || ''}`.toLowerCase();
                if (!nameAndId.includes(scheduleFloorFilter.toLowerCase())) {
                    return false;
                }
            }
            if (scheduleMinDuration > 0 && bookingDurationMin(b) < scheduleMinDuration) {
                return false;
            }
            const isCurr = Number(b.is_curriculum) === 1;
            if (scheduleCurriculumFilter === 'curriculum' && !isCurr) {
                return false;
            }
            if (scheduleCurriculumFilter === 'extra' && isCurr) {
                return false;
            }
            if (canPublish && hidePartnerSlots) {
                const n = `${b.room_name} ${b.purpose || ''}`.toLowerCase();
                if (/аренд|партнер|внешн|коммерц|организатор/i.test(n)) {
                    return false;
                }
            }
            return true;
        });
    }, [scheduleBookings, scheduleRoomFilter, scheduleFloorFilter, scheduleMinDuration, scheduleCurriculumFilter, hidePartnerSlots, canPublish]);

    const weekColumnDates = useMemo(() => {
        const base = new Date(`${scheduleRefDate}T12:00:00`);
        const mon = startOfWeekMonday(base);
        return Array.from({length: 7}, (_, i) => formatLocalISODate(addDaysLocal(mon, i)));
    }, [scheduleRefDate]);

    const monthCalendarCells = useMemo(() => {
        const base = new Date(`${scheduleRefDate.slice(0, 7)}-01T12:00:00`);
        const y = base.getFullYear();
        const m = base.getMonth();
        const first = new Date(y, m, 1);
        const start = startOfWeekMonday(first);
        const cells: Array<{date: string; inMonth: boolean}> = [];
        for (let i = 0; i < 42; i++) {
            const d = addDaysLocal(start, i);
            cells.push({
                date: formatLocalISODate(d),
                inMonth: d.getMonth() === m,
            });
        }
        return cells;
    }, [scheduleRefDate]);

    const myPaymentRows = useMemo(() => {
        return [...myBookings].filter((b) => b.status === 'approved' || Boolean(b.payment_link)).sort((a, b) => {
            const aTs = new Date(`${a.date}T${a.start_time}:00`).getTime();
            const bTs = new Date(`${b.date}T${b.start_time}:00`).getTime();
            return bTs - aTs;
        }).slice(0, 8);
    }, [myBookings]);

    const paymentReminderText = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const reminderDate = new Date(year, month, 25);
        const ms = reminderDate.getTime() - now.getTime();
        const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
        if (days > 1) {
            return `До даты контрольной оплаты (25 число) осталось ${days} дн.`;
        }
        if (days === 1) {
            return 'Контрольная дата оплаты завтра (25 число).';
        }
        if (days === 0) {
            return 'Сегодня контрольная дата оплаты (25 число).';
        }
        return 'Контрольная дата оплаты в этом месяце уже прошла.';
    }, []);

    const exportBookingsCsv = useCallback(() => {
        const rows = [
            ['id', 'room_name', 'date', 'start_time', 'end_time', 'status', 'user_name'],
            ...pendingSortedBookings.map((b) => [b.id, b.room_name, b.date, b.start_time, b.end_time, b.status, b.user_name]),
        ];
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([`\uFEFF${csv}`], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `academy-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [pendingSortedBookings]);

    // ── Загрузка реакций для постов афиши ─────────────────────────────────────
    const loadAfishaReactions = useCallback(async (posts: PostList['posts']) => {
        const ids = Object.keys(posts);
        if (ids.length === 0) { return; }
        const counts: Record<string, number> = {};
        await Promise.allSettled(ids.map(async (id) => {
            const resp = await fetch(`/api/v4/posts/${id}/reactions`, {credentials: 'include'});
            if (resp.ok) {
                const reactions = await resp.json() as Array<unknown>;
                counts[id] = Array.isArray(reactions) ? reactions.length : 0;
            }
        }));
        setPostReactions((prev) => ({...prev, ...counts}));
    }, []);

    // ── Загрузка закреплённых постов ──────────────────────────────────────────
    const loadPinnedPosts = useCallback(async (channelId: string) => {
        try {
            const resp = await fetch(`/api/v4/channels/${channelId}/pinned`, {credentials: 'include'});
            if (!resp.ok) { return; }
            const data = await resp.json() as PostList;
            const ids = new Set(data?.order || []);
            setPinnedPostIds((prev) => new Set([...prev, ...ids]));
        } catch { /* ignore */ }
    }, []);

    // ── Переключить закрепление поста ─────────────────────────────────────────
    const togglePinPost = useCallback(async (postId: string, isPinned: boolean) => {
        const method = isPinned ? 'DELETE' : 'POST';
        const resp = await fetch(`/api/v4/posts/${postId}/pin`, {method, credentials: 'include'});
        if (resp.ok) {
            setPinnedPostIds((prev) => {
                const next = new Set(prev);
                if (isPinned) { next.delete(postId); } else { next.add(postId); }
                return next;
            });
        }
    }, []);

    // ── Черновики публикаций ───────────────────────────────────────────────────
    const loadPostDrafts = useCallback(async () => {
        setDraftsLoading(true);
        try {
            const resp = await fetch('http://localhost:3001/api/post-drafts?status=pending', {
                headers: {Authorization: 'Bearer web'},
            });
            const data = await resp.json();
            setPostDrafts(Array.isArray(data) ? data : []);
        } catch { /* booking service недоступен */ } finally {
            setDraftsLoading(false);
        }
    }, []);

    const approveDraft = useCallback(async (draftId: string) => {
        await fetch(`http://localhost:3001/api/post-drafts/${draftId}/approve`, {
            method: 'PUT',
            headers: {Authorization: 'Bearer web'},
        });
        await Promise.all([loadPostDrafts(), loadChannelsAndPosts()]);
    }, [loadChannelsAndPosts, loadPostDrafts]);

    const rejectDraft = useCallback(async (draftId: string) => {
        const reason = draftRejectReason[draftId] || '';
        await fetch(`http://localhost:3001/api/post-drafts/${draftId}/reject`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json', Authorization: 'Bearer web'},
            body: JSON.stringify({reject_reason: reason}),
        });
        await loadPostDrafts();
    }, [draftRejectReason, loadPostDrafts]);

    // ── Регулярные слоты ──────────────────────────────────────────────────────
    const loadRecurring = useCallback(async () => {
        try {
            const resp = await fetch('http://localhost:3001/api/recurring', {
                headers: {Authorization: 'Bearer web'},
            });
            const data = await resp.json();
            setRecurringList(Array.isArray(data) ? data : []);
        } catch { /* ignore */ }
    }, []);

    const createRecurring = useCallback(async () => {
        await fetch('http://localhost:3001/api/recurring', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Authorization: 'Bearer web'},
            body: JSON.stringify({
                ...recurringForm,
                day_of_week: Number(recurringForm.day_of_week),
                created_by: currentUser?.username || '',
            }),
        });
        setRecurringForm((p) => ({...p, purpose: ''}));
        await loadRecurring();
    }, [currentUser?.username, loadRecurring, recurringForm]);

    const deleteRecurring = useCallback(async (id: string) => {
        await fetch(`http://localhost:3001/api/recurring/${id}`, {
            method: 'DELETE',
            headers: {Authorization: 'Bearer web'},
        });
        await loadRecurring();
    }, [loadRecurring]);

    // useEffect для новых фич (объявлены после базовых callbacks)
    useEffect(() => {
        if (activeTab === 'schedule') { loadRecurring(); }
        if (activeTab === 'admin' && canPublish) {
            loadPostDrafts();
            // Загружаем статистику каналов (участники, публикации)
            const loadStats = async () => {
                try {
                    const entries = Object.entries(channelsByName);
                    const results = await Promise.all(
                        entries.map(async ([name, ch]) => {
                            try {
                                const r = await fetch(`/api/v4/channels/${ch.id}/stats`, {credentials: 'include'});
                                if (!r.ok) { return null; }
                                const s = await r.json() as {member_count: number; pinnedpost_count: number};
                                return {name, member_count: s.member_count || 0, post_count: s.pinnedpost_count || 0};
                            } catch {
                                return null;
                            }
                        }),
                    );
                    const map: Record<string, {member_count: number; post_count: number}> = {};
                    for (const res of results) {
                        if (res) { map[res.name] = {member_count: res.member_count, post_count: res.post_count}; }
                    }
                    setChannelStats(map);
                } catch {
                    // ignore
                }
            };
            loadStats();
        }
    }, [activeTab, canPublish, channelsByName, loadPostDrafts, loadRecurring]);

    useEffect(() => {
        if (activeTab === 'afisha' && postsByTab.afisha.length > 0) {
            const postsMap: PostList['posts'] = {};
            postsByTab.afisha.forEach((p) => { postsMap[p.id] = p; });
            loadAfishaReactions(postsMap);
        }
    }, [activeTab, loadAfishaReactions, postsByTab.afisha]);

    const postAnalytics = useMemo(() => {
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;

        const byTab = (Object.keys(postsByTab) as Array<keyof typeof postsByTab>).map((key) => {
            const posts = postsByTab[key];
            const latest = posts.length > 0 ? Math.max(...posts.map((p) => p.create_at || 0)) : 0;
            const weekCount = posts.filter((p) => (p.create_at || 0) >= (now - weekMs)).length;
            return {
                tab: key,
                total: posts.length,
                weekCount,
                latest,
            };
        });

        const total = byTab.reduce((acc, row) => acc + row.total, 0);
        const weekTotal = byTab.reduce((acc, row) => acc + row.weekCount, 0);
        const latestAny = Math.max(...byTab.map((row) => row.latest), 0);

        return {byTab, total, weekTotal, latestAny};
    }, [postsByTab]);

    const myClasses = useMemo(() => {
        return [...myBookings].filter((b) => b.status === 'approved' || b.status === 'pending').sort((a, b) => {
            const aTs = new Date(`${a.date}T${a.start_time}:00`).getTime();
            const bTs = new Date(`${b.date}T${b.start_time}:00`).getTime();
            return aTs - bTs;
        }).slice(0, 10);
    }, [myBookings]);

    const activeTemplate = AFISHA_TEMPLATES.find((t) => t.id === templateId) || AFISHA_TEMPLATES[0];
    const contentTab = activeTab === 'news_students' || activeTab === 'news_staff' || activeTab === 'afisha' || activeTab === 'faq';

    const publish = useCallback(async () => {
        if (!contentTab || !canDraft) {
            return;
        }
        const channel = await resolveChannelForTab(activeTab, channelsByName);
        if (!channel) {
            setError(`Целевой канал не найден или недоступен (teamId=${effectiveTeamId || 'n/a'}). Проверьте membership/права.`);
            return;
        }

        setPublishing(true);
        try {
            // Загружаем изображение, если выбрано
            let imageFileId: string | null = null;
            if (afishaImageFile && channel.id) {
                const form = new FormData();
                form.append('files', afishaImageFile);
                form.append('channel_id', channel.id);
                const uploadResp = await fetch('/api/v4/files', {
                    method: 'POST',
                    credentials: 'include',
                    body: form,
                });
                if (uploadResp.ok) {
                    const uploadData = await uploadResp.json() as {file_infos?: Array<{id: string}>};
                    imageFileId = uploadData?.file_infos?.[0]?.id ?? null;
                }
            }

            const msg = activeTab === 'afisha' ?
                `${activeTemplate.emoji} **${draftTitle || activeTemplate.label}**\n\n${draftText || 'Подробности будут опубликованы дополнительно.'}${draftTicketLink ? '\n\n🎟 ' + draftTicketLink : ''}` :
                `**${draftTitle || 'Публикация Академии'}**\n\n${draftText}`.trim();

            if (isSystemAdmin) {
                // Системный администратор публикует напрямую
                await Client4.createPost({
                    channel_id: channel.id,
                    message: msg,
                    file_ids: imageFileId ? [imageFileId] : [],
                } as Parameters<typeof Client4.createPost>[0]);
            } else {
                // Педагог/менеджер — отправляем на согласование
                const draftResp = await fetch('http://localhost:3001/api/post-drafts', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', Authorization: 'Bearer web'},
                    body: JSON.stringify({
                        tab: activeTab,
                        title: draftTitle,
                        body: draftText,
                        template_id: templateId,
                        image_file_id: imageFileId || '',
                        channel_id: channel.id,
                        formatted_message: msg,
                        author_id: currentUserId,
                        author_name: currentUser?.username || '',
                    }),
                });
                if (!draftResp.ok) {
                    setError('Не удалось отправить публикацию на согласование.');
                    return;
                }
                setError('');
                alert(`✅ Публикация «${draftTitle || msg.slice(0, 40)}» отправлена на согласование руководству.`);
            }

            setDraftTitle('');
            setDraftText('');
            setDraftTicketLink('');
            setAfishaImageDataUrl(null);
            setAfishaImageFile(null);
            await loadChannelsAndPosts();
        } catch {
            setError('Не удалось опубликовать пост.');
        } finally {
            setPublishing(false);
        }
    }, [activeTab, activeTemplate, afishaImageFile, canDraft, channelsByName, contentTab, currentUser?.username, currentUserId, draftText, draftTicketLink, draftTitle, effectiveTeamId, isSystemAdmin, loadChannelsAndPosts, resolveChannelForTab, templateId]);

    const createBooking = useCallback(async () => {
        if (!currentUserId || !currentUser?.username) {
            setError('Не удалось определить текущего пользователя.');
            return;
        }
        try {
            const {show_to_students, ...bookingPayload} = bookingForm;
            const response = await fetch('http://localhost:3001/api/bookings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Authorization: 'Bearer web'},
                body: JSON.stringify({
                    ...bookingPayload,
                    user_id: currentUserId,
                    user_name: currentUser.username,
                    user_email: currentUser.email || '',
                    student_visible: Boolean(show_to_students),
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({error: 'Ошибка запроса'})) as {error?: string; alternatives?: AlternativeSlot[]};
                setBookingAlternatives(Array.isArray(err.alternatives) ? err.alternatives : []);
                setError(err.error || 'Не удалось создать заявку.');
                return;
            }

            setBookingForm((prev) => ({...prev, purpose: ''}));
            setBookingAlternatives([]);
            await Promise.all([loadBookings(), loadMyBookings(), loadHallBookings(), loadScheduleBookings()]);
        } catch {
            setError('Не удалось создать бронирование.');
        }
    }, [bookingForm, currentUser?.email, currentUser?.username, currentUserId, loadBookings, loadHallBookings, loadMyBookings, loadScheduleBookings]);

    const pageStyle: React.CSSProperties = {
        minHeight: 'calc(100vh - 64px)',
        padding: 12,
        background: '#f1f5f9',
        color: '#0f172a',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flex: 1,
        alignSelf: 'stretch',
    };

    const shellStyle: React.CSSProperties = {
        width: '100%',
        minHeight: 'calc(100vh - 88px)',
        background: '#fff',
        border: '1px solid #dbe5ef',
        borderRadius: 14,
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
    };

    const cardStyle: React.CSSProperties = {
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 14,
        background: '#fff',
    };

    return (
        <div style={pageStyle}>
            {/* ─── Модальное согласие на обработку ПДн ─────────────────────── */}
            {!pdnConsented && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.88)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 18, padding: '40px 44px',
                        maxWidth: 580, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
                    }}>
                        <h2 style={{marginTop: 0, fontSize: 22, lineHeight: 1.35}}>
                            Согласие на обработку<br/>персональных данных
                        </h2>
                        <p style={{lineHeight: 1.75, color: '#475569', marginBottom: 18}}>
                            Используя данное приложение, вы соглашаетесь на обработку
                            ваших персональных данных (имя, контакты, информация об обучении)
                            Международной академией музыки Елены Образцовой в целях организации
                            учебного процесса, коммуникации и выставления счетов.
                        </p>
                        <p style={{lineHeight: 1.75, color: '#475569', marginBottom: 24, fontSize: 13}}>
                            Данные хранятся на защищённых серверах и не передаются третьим лицам.
                            Вы вправе отозвать согласие, обратившись к администратору Академии.
                        </p>
                        <div style={{display: 'flex', gap: 12}}>
                            <button
                                className='btn btn-primary'
                                onClick={() => {
                                    localStorage.setItem(`academy.privacy_consent.${currentUserId}`, '1');
                                    setPdnConsented(true);
                                }}
                            >
                                Согласен и продолжить
                            </button>
                            <button
                                className='btn btn-tertiary'
                                onClick={() => { window.location.href = '/'; }}
                            >
                                Не согласен (выйти)
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div style={shellStyle}>
                <aside style={{padding: 16, background: '#f8fafc', borderRight: '1px solid #e2e8f0', width: 280, flexShrink: 0}}>
                    <h1 style={{margin: 0, lineHeight: 1.05, fontSize: 36}}>Академия<br/>Образцовой</h1>
                    <div style={{marginTop: 8, opacity: 0.72, fontSize: 13}}>
                        {currentTeam?.display_name || 'Команда'} • @{currentUser?.username || 'user'}
                    </div>
                    <div style={{marginTop: 6, fontSize: 11, opacity: 0.55}}>
                        UI build: academy-v2.8
                    </div>

                    <div style={{display: 'grid', gap: 8, marginTop: 16}}>
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    borderRadius: 10,
                                    border: activeTab === tab.id ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                                    background: activeTab === tab.id ? '#dbeafe' : '#ffffff',
                                    color: '#0f172a',
                                    padding: '9px 10px',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button className='btn btn-secondary' onClick={loadChannelsAndPosts} disabled={loading}>
                            {loading ? 'Обновление...' : 'Обновить данные'}
                        </button>
                    </div>

                    <div style={{display: 'grid', gap: 8, marginTop: 16}}>
                        <div style={{...cardStyle, padding: 10}}>
                            <div style={{fontSize: 12, opacity: 0.75}}>Новости студентам</div>
                            <div style={{fontSize: 22, fontWeight: 700}}>{postsByTab.news_students.length}</div>
                        </div>
                        <div style={{...cardStyle, padding: 10}}>
                            <div style={{fontSize: 12, opacity: 0.75}}>Новости сотрудникам</div>
                            <div style={{fontSize: 22, fontWeight: 700}}>{postsByTab.news_staff.length}</div>
                        </div>
                        <div style={{...cardStyle, padding: 10}}>
                            <div style={{fontSize: 12, opacity: 0.75}}>Афиша / FAQ</div>
                            <div style={{fontSize: 22, fontWeight: 700}}>{postsByTab.afisha.length + postsByTab.faq.length}</div>
                        </div>
                    </div>
                </aside>

                <main style={{padding: 20, flex: 1, minWidth: 640, background: '#ffffff'}}>
                    <h2 style={{margin: 0, fontSize: 30}}>{TABS.find((t) => t.id === activeTab)?.label}</h2>
                    <div style={{opacity: 0.7, marginTop: 6, marginBottom: 14}}>
                        Единый рабочий экран для контента, расписания и администрирования.
                    </div>

                    {error && (
                        <div style={{...cardStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', marginBottom: 12}}>
                            {error}
                        </div>
                    )}

                    {contentTab && (
                        <>
                            {canDraft && (
                                <div style={{...cardStyle, marginBottom: 12}}>
                                    <h4 style={{marginTop: 0}}>
                                        {isSystemAdmin ? 'Создать публикацию' : 'Создать публикацию (отправить на согласование)'}
                                    </h4>
                                    {!isSystemAdmin && (
                                        <div style={{marginBottom: 8, padding: '8px 12px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e'}}>
                                            ✏️ Публикация будет отправлена на проверку администратору перед публикацией.
                                        </div>
                                    )}
                                    {activeTab === 'afisha' && (
                                        <select className='form-control' value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{maxWidth: 320, marginBottom: 8}}>
                                            {AFISHA_TEMPLATES.map((t) => (
                                                <option key={t.id} value={t.id}>{`${t.emoji} ${t.label}`}</option>
                                            ))}
                                        </select>
                                    )}
                                    <input className='form-control' placeholder='Заголовок' value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} style={{marginBottom: 8}}/>
                                    <textarea className='form-control' placeholder='Текст публикации' value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={4} style={{marginBottom: 8}}/>
                                    {activeTab === 'afisha' && (
                                        <>
                                            <div style={{marginBottom: 8}}>
                                                <label style={{display: 'block', fontSize: 13, marginBottom: 4, color: '#475569'}}>
                                                    Изображение к афише (опционально)
                                                </label>
                                                <input
                                                    type='file'
                                                    accept='image/*'
                                                    style={{fontSize: 13}}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] ?? null;
                                                        setAfishaImageFile(file);
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => setAfishaImageDataUrl(ev.target?.result as string ?? null);
                                                            reader.readAsDataURL(file);
                                                        } else {
                                                            setAfishaImageDataUrl(null);
                                                        }
                                                    }}
                                                />
                                                {afishaImageDataUrl && (
                                                    <img
                                                        src={afishaImageDataUrl}
                                                        alt='preview'
                                                        style={{marginTop: 8, maxHeight: 160, borderRadius: 8, objectFit: 'cover', width: '100%'}}
                                                    />
                                                )}
                                            </div>
                                            {activeTemplate.ticketLabel && (
                                                <div style={{marginBottom: 8}}>
                                                    <label style={{display: 'block', fontSize: 13, marginBottom: 4, color: '#475569'}}>
                                                        🎟 {activeTemplate.ticketLabel} (ссылка или текст, опционально)
                                                    </label>
                                                    <input
                                                        className='form-control'
                                                        placeholder='https://... или «Вход свободный»'
                                                        value={draftTicketLink}
                                                        onChange={(e) => setDraftTicketLink(e.target.value)}
                                                    />
                                                </div>
                                            )}
                                            <div style={{borderRadius: 10, padding: 10, background: activeTemplate.color, color: '#fff', marginBottom: 8}}>
                                                <b>{activeTemplate.emoji} {draftTitle || activeTemplate.label}</b>
                                                <div style={{opacity: 0.9, marginTop: 4}}>{draftText || 'Превью афиши'}</div>
                                                {draftTicketLink && (
                                                    <div style={{marginTop: 6, fontSize: 13, opacity: 0.85}}>🎟 {draftTicketLink}</div>
                                                )}
                                            </div>
                                            <button
                                                className='btn btn-tertiary'
                                                style={{marginBottom: 8}}
                                                onClick={() => exportAfishaAsPNG(
                                                    activeTemplate.color,
                                                    activeTemplate.emoji,
                                                    draftTitle || activeTemplate.label,
                                                    draftText,
                                                    afishaImageDataUrl,
                                                    draftTicketLink,
                                                )}
                                            >
                                                ⬇ Скачать PNG
                                            </button>
                                            {' '}
                                        </>
                                    )}
                                    <button className='btn btn-primary' onClick={publish} disabled={publishing}>
                                        {publishing ? 'Публикация...' : (isSystemAdmin ? 'Опубликовать' : 'Отправить на согласование')}
                                    </button>
                                </div>
                            )}

                            {activeTab === 'faq' && (
                                <div style={{...cardStyle, marginBottom: 10}}>
                                    <input
                                        className='form-control'
                                        placeholder='Поиск по FAQ...'
                                        value={faqQuery}
                                        onChange={(e) => setFaqQuery(e.target.value)}
                                    />
                                    <div style={{marginTop: 8}}>
                                        <button className='btn btn-tertiary btn-sm' onClick={() => openChannel('resepchen')}>
                                            Не нашли ответ? Написать администратору
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div style={{display: 'grid', gap: 10}}>
                                {postsByTab[activeTab].length === 0 && (
                                    <div style={{...cardStyle, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e'}}>
                                        Пока нет постов в канале <b>{CHANNEL_BY_TAB[activeTab]}</b>.
                                    </div>
                                )}
                                {(activeTab === 'faq' ? visibleFaqPosts : postsByTab[activeTab]).map((post) => (
                                    <article key={post.id} style={cardStyle}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6}}>
                                            <div style={{fontSize: 12, opacity: 0.7}}>{formatDate(post.create_at)} • @{post.user_id}</div>
                                            <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                                {postReactions[post.id] !== undefined && (
                                                    <span style={{fontSize: 12, opacity: 0.7}}>👍 {postReactions[post.id]}</span>
                                                )}
                                                {pinnedPostIds.has(post.id) && (
                                                    <span style={{fontSize: 12, color: '#2563eb'}}>📌 Закреплено</span>
                                                )}
                                                {canPublish && (
                                                    <button
                                                        className='btn btn-tertiary btn-sm'
                                                        style={{fontSize: 11, padding: '2px 7px'}}
                                                        onClick={() => togglePinPost(post.id, pinnedPostIds.has(post.id))}
                                                        title={pinnedPostIds.has(post.id) ? 'Открепить' : 'Закрепить'}
                                                    >
                                                        {pinnedPostIds.has(post.id) ? '📌 Открепить' : '📌 Закрепить'}
                                                    </button>
                                                )}
                                                {activeTab === 'afisha' && canPublish && (
                                                    <button
                                                        className='btn btn-tertiary btn-sm'
                                                        style={{fontSize: 11, padding: '2px 7px'}}
                                                        onClick={() => exportAfishaAsPNG('#1a1a35', '🎹', post.message.split('\n')[0].replace(/\*\*/g, ''), post.message.split('\n').slice(2).join(' ').slice(0, 200), null)}
                                                        title='Скачать PNG'
                                                    >
                                                        ⬇ PNG
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{whiteSpace: 'pre-wrap'}}>{post.message}</div>
                                    </article>
                                ))}
                            </div>
                        </>
                    )}

                    {activeTab === 'booking' && (
                        <div style={{display: 'grid', gap: 10}}>
                            <div style={{...cardStyle, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a'}}>
                                Интеграция с Booking Service (`localhost:3001`) активна.
                            </div>
                            <div style={{...cardStyle, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
                                <select
                                    className='form-control'
                                    style={{maxWidth: 180}}
                                    value={bookingStatusFilter}
                                    onChange={(e) => setBookingStatusFilter(e.target.value as 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled')}
                                >
                                    <option value='all'>Все статусы</option>
                                    <option value='pending'>pending</option>
                                    <option value='approved'>approved</option>
                                    <option value='rejected'>rejected</option>
                                    <option value='cancelled'>cancelled</option>
                                </select>
                                <input
                                    type='date'
                                    className='form-control'
                                    style={{maxWidth: 180}}
                                    value={bookingDateFilter}
                                    onChange={(e) => setBookingDateFilter(e.target.value)}
                                />
                                <input
                                    className='form-control'
                                    style={{maxWidth: 280}}
                                    placeholder='Фильтр по классу'
                                    value={bookingRoomFilter}
                                    onChange={(e) => setBookingRoomFilter(e.target.value)}
                                />
                                <button className='btn btn-tertiary' onClick={() => {
                                    setBookingStatusFilter('all');
                                    setBookingDateFilter('');
                                    setBookingRoomFilter('');
                                }}
                                >
                                    Сбросить фильтры
                                </button>
                                <button className='btn btn-secondary' onClick={exportBookingsCsv}>Экспорт CSV</button>
                            </div>
                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Новая заявка</h4>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8}}>
                                    <input className='form-control' placeholder='room_id' value={bookingForm.room_id} onChange={(e) => setBookingForm({...bookingForm, room_id: e.target.value})}/>
                                    <input className='form-control' placeholder='Название класса' value={bookingForm.room_name} onChange={(e) => setBookingForm({...bookingForm, room_name: e.target.value})}/>
                                    <input type='date' className='form-control' value={bookingForm.date} onChange={(e) => setBookingForm({...bookingForm, date: e.target.value})}/>
                                    <input className='form-control' placeholder='Начало (HH:mm)' value={bookingForm.start_time} onChange={(e) => setBookingForm({...bookingForm, start_time: e.target.value})}/>
                                    <input className='form-control' placeholder='Конец (HH:mm)' value={bookingForm.end_time} onChange={(e) => setBookingForm({...bookingForm, end_time: e.target.value})}/>
                                    <input className='form-control' placeholder='Цель (опционально)' value={bookingForm.purpose} onChange={(e) => setBookingForm({...bookingForm, purpose: e.target.value})}/>
                                </div>
                                <label style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 10}}>
                                    <input
                                        type='checkbox'
                                        checked={Boolean(bookingForm.show_to_students)}
                                        onChange={(e) => setBookingForm({...bookingForm, show_to_students: e.target.checked})}
                                    />
                                    <span>Показывать в общем расписании для студентов (снимите для аренды / партнёрских слотов)</span>
                                </label>
                                <div style={{marginTop: 10, display: 'flex', gap: 8}}>
                                    <button className='btn btn-primary' onClick={createBooking}>Отправить заявку</button>
                                    <button className='btn btn-secondary' onClick={() => { loadBookings(); loadMyBookings(); loadHallBookings(); loadScheduleBookings(); }}>Обновить</button>
                                </div>
                                {bookingAlternatives.length > 0 && (
                                    <div style={{marginTop: 10, padding: 10, border: '1px solid #fde68a', borderRadius: 10, background: '#fffbeb'}}>
                                        <div style={{fontWeight: 600, marginBottom: 6}}>Доступные альтернативные слоты:</div>
                                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                                            {bookingAlternatives.map((slot) => (
                                                <button
                                                    key={`${slot.start}-${slot.end}`}
                                                    className='btn btn-tertiary btn-sm'
                                                    onClick={() => setBookingForm((prev) => ({...prev, start_time: slot.start, end_time: slot.end}))}
                                                >
                                                    {slot.start} - {slot.end}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Мои заявки</h4>
                                {myBookings.length === 0 && <div style={{opacity: 0.7}}>У вас пока нет заявок.</div>}
                                <div style={{display: 'grid', gap: 8}}>
                                    {myBookings.slice(0, 8).map((b) => (
                                        <article key={`my-${b.id}`} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 10}}>
                                            <b>{b.room_name}</b> — {b.date} {b.start_time}-{b.end_time}
                                            <div style={{marginTop: 4}}>
                                                <span style={statusBadgeStyle(b.status)}>{b.status}</span>
                                            </div>
                                            {b.payment_link && <div><a href={b.payment_link} target='_blank' rel='noreferrer'>Ссылка на оплату</a></div>}
                                            {b.reject_reason && <div style={{color: '#b91c1c'}}>Причина отказа: {b.reject_reason}</div>}
                                            {b.status === 'pending' && (
                                                <div style={{marginTop: 8}}>
                                                    <button
                                                        className='btn btn-tertiary btn-sm'
                                                        onClick={async () => {
                                                            await fetch(`http://localhost:3001/api/bookings/${b.id}`, {
                                                                method: 'DELETE',
                                                                headers: {'Content-Type': 'application/json', Authorization: 'Bearer web'},
                                                                body: JSON.stringify({user_id: currentUserId}),
                                                            });
                                                            await Promise.all([loadBookings(), loadMyBookings(), loadHallBookings(), loadScheduleBookings()]);
                                                        }}
                                                    >
                                                        Отменить заявку
                                                    </button>
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            </div>

                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Ожидают подтверждения</h4>
                                {pendingSortedBookings.length === 0 && <div style={{opacity: 0.7}}>Нет заявок по выбранным фильтрам.</div>}
                                <div style={{display: 'grid', gap: 8}}>
                                    {pendingSortedBookings.map((b) => (
                                        <article key={b.id} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 10}}>
                                            <b>{b.room_name}</b> — {b.date} {b.start_time}-{b.end_time}
                                            <div style={{margin: '6px 0 8px'}}>
                                                <span style={statusBadgeStyle(b.status)}>{b.status}</span>
                                                <span style={{opacity: 0.72, marginLeft: 8}}>@{b.user_name}</span>
                                                {Number(b.student_visible) === 0 && (
                                                    <span style={{marginLeft: 8, fontSize: 11, opacity: 0.85}}>(скрыто от студентов)</span>
                                                )}
                                            </div>
                                            {canPublish && b.status === 'pending' && (
                                                <div>
                                                    <label style={{display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8}}>
                                                        <input
                                                            type='checkbox'
                                                            checked={approveVisibleToStudents[b.id] !== false}
                                                            onChange={(e) => setApproveVisibleToStudents((prev) => ({...prev, [b.id]: e.target.checked}))}
                                                        />
                                                        <span>После одобрения — видно студентам в расписании</span>
                                                    </label>
                                                    <input
                                                        className='form-control'
                                                        style={{maxWidth: 380, marginBottom: 8, fontSize: 13}}
                                                        placeholder='Ссылка на оплату (для внеурочного — необязательно)'
                                                        value={approvePaymentLink[b.id] || ''}
                                                        onChange={(e) => setApprovePaymentLink((prev) => ({...prev, [b.id]: e.target.value}))}
                                                    />
                                                    <div style={{display: 'flex', gap: 8}}>
                                                        <button
                                                            className='btn btn-primary btn-sm'
                                                            onClick={async () => {
                                                                await fetch(`http://localhost:3001/api/bookings/${b.id}/approve`, {
                                                                    method: 'PUT',
                                                                    headers: {'Content-Type': 'application/json'},
                                                                    body: JSON.stringify({
                                                                        actor_id: currentUserId,
                                                                        actor_name: currentUser?.username || 'admin',
                                                                        student_visible: approveVisibleToStudents[b.id] !== false,
                                                                        payment_link: approvePaymentLink[b.id] || '',
                                                                    }),
                                                                });
                                                                await Promise.all([loadBookings(), loadMyBookings(), loadHallBookings(), loadScheduleBookings()]);
                                                            }}
                                                        >
                                                            Одобрить
                                                        </button>
                                                        <button
                                                            className='btn btn-danger btn-sm'
                                                            onClick={async () => {
                                                                await fetch(`http://localhost:3001/api/bookings/${b.id}/reject`, {
                                                                    method: 'PUT',
                                                                    headers: {'Content-Type': 'application/json'},
                                                                    body: JSON.stringify({reject_reason: 'Отклонено в веб-панели', actor_id: currentUserId, actor_name: currentUser?.username || 'admin'}),
                                                                });
                                                                await Promise.all([loadBookings(), loadMyBookings(), loadHallBookings(), loadScheduleBookings()]);
                                                            }}
                                                        >
                                                            Отклонить
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'schedule' && (
                        <div style={{display: 'grid', gap: 10}}>
                            <div style={{...cardStyle, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#14532d'}}>
                                Занятость классов и залов (статусы <b>pending</b> и <b>approved</b>).
                                Для студентов скрыты слоты с флагом «только для staff» (аренда/партнёры). Чтобы отправить заявку — вкладка «Бронирование».
                            </div>

                            {scheduleError && (
                                <div style={{...cardStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b'}}>
                                    {scheduleError}
                                </div>
                            )}

                            <div style={{...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'}}>
                                <div style={{display: 'flex', gap: 6}}>
                                    <button
                                        className={scheduleView === 'week' ? 'btn btn-primary btn-sm' : 'btn btn-tertiary btn-sm'}
                                        onClick={() => setScheduleView('week')}
                                    >
                                        Неделя
                                    </button>
                                    <button
                                        className={scheduleView === 'month' ? 'btn btn-primary btn-sm' : 'btn btn-tertiary btn-sm'}
                                        onClick={() => {
                                            setScheduleView('month');
                                            setScheduleRefDate((prev) => `${prev.slice(0, 7)}-01`);
                                        }}
                                    >
                                        Месяц
                                    </button>
                                </div>
                                <input
                                    type='date'
                                    className='form-control'
                                    style={{maxWidth: 160}}
                                    value={scheduleRefDate}
                                    onChange={(e) => setScheduleRefDate(e.target.value)}
                                />
                                {scheduleView === 'week' && (
                                    <>
                                        <button
                                            className='btn btn-tertiary btn-sm'
                                            onClick={() => setScheduleRefDate((r) => formatLocalISODate(addDaysLocal(new Date(`${r}T12:00:00`), -7)))}
                                        >
                                            ← Пред. неделя
                                        </button>
                                        <button
                                            className='btn btn-tertiary btn-sm'
                                            onClick={() => setScheduleRefDate((r) => formatLocalISODate(addDaysLocal(new Date(`${r}T12:00:00`), 7)))}
                                        >
                                            След. неделя →
                                        </button>
                                    </>
                                )}
                                {scheduleView === 'month' && (
                                    <>
                                        <button
                                            className='btn btn-tertiary btn-sm'
                                            onClick={() => setScheduleRefDate((r) => shiftMonthKeepFirst(r, -1))}
                                        >
                                            ← Пред. месяц
                                        </button>
                                        <button
                                            className='btn btn-tertiary btn-sm'
                                            onClick={() => setScheduleRefDate((r) => shiftMonthKeepFirst(r, 1))}
                                        >
                                            След. месяц →
                                        </button>
                                    </>
                                )}
                                <button className='btn btn-secondary btn-sm' onClick={loadScheduleBookings}>
                                    Обновить
                                </button>
                                <button className='btn btn-primary btn-sm' onClick={() => setActiveTab('booking')}>
                                    Запросить бронь
                                </button>
                            </div>

                            <div style={{...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'}}>
                                <input
                                    className='form-control'
                                    style={{maxWidth: 220}}
                                    placeholder='Фильтр: класс / room_id'
                                    value={scheduleRoomFilter}
                                    onChange={(e) => setScheduleRoomFilter(e.target.value)}
                                />
                                <select
                                    className='form-control'
                                    style={{maxWidth: 170}}
                                    value={scheduleFloorFilter}
                                    onChange={(e) => setScheduleFloorFilter(e.target.value)}
                                >
                                    <option value=''>Все этажи</option>
                                    <option value='1 этаж'>1 этаж</option>
                                    <option value='2 этаж'>2 этаж</option>
                                    <option value='3 этаж'>3 этаж</option>
                                    <option value='актовый'>Актовый зал</option>
                                </select>
                                <select
                                    className='form-control'
                                    style={{maxWidth: 200}}
                                    value={scheduleMinDuration}
                                    onChange={(e) => setScheduleMinDuration(Number(e.target.value))}
                                >
                                    <option value={0}>Любая длительность</option>
                                    <option value={30}>от 30 мин</option>
                                    <option value={60}>от 60 мин</option>
                                    <option value={90}>от 90 мин</option>
                                    <option value={120}>от 120 мин</option>
                                </select>
                                <select
                                    className='form-control'
                                    style={{maxWidth: 220}}
                                    value={scheduleCurriculumFilter}
                                    onChange={(e) => setScheduleCurriculumFilter(e.target.value as 'all' | 'curriculum' | 'extra')}
                                >
                                    <option value='all'>Все типы</option>
                                    <option value='curriculum'>Только учебное</option>
                                    <option value='extra'>Только внеучебное</option>
                                </select>
                                {canPublish && (
                                    <label style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                        <input
                                            type='checkbox'
                                            checked={hidePartnerSlots}
                                            onChange={(e) => setHidePartnerSlots(e.target.checked)}
                                        />
                                        <span>Доп. фильтр по ключевым словам (аренда/партнёры)</span>
                                    </label>
                                )}
                            </div>

                            {scheduleView === 'week' && (
                                <div style={{overflowX: 'auto'}}>
                                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, minmax(140px, 1fr))', gap: 8, minWidth: 900}}>
                                        {weekColumnDates.map((day, idx) => (
                                            <div key={day} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, background: '#f8fafc'}}>
                                                <div style={{fontWeight: 700, marginBottom: 6}}>
                                                    {WEEKDAY_LABELS_SHORT[idx]}<br/>
                                                    <span style={{fontSize: 13, opacity: 0.75}}>{day}</span>
                                                </div>
                                                <div style={{display: 'grid', gap: 6}}>
                                                    {filteredScheduleBookings
                                                        .filter((b) => b.date === day)
                                                        .sort((a, b) => a.start_time.localeCompare(b.start_time))
                                                        .map((b) => (
                                                            <div key={b.id} style={{borderRadius: 8, padding: 8, background: '#fff', border: '1px solid #e2e8f0', fontSize: 12}}>
                                                                <div style={{fontWeight: 700}}>{b.start_time}–{b.end_time}</div>
                                                                <div>{b.room_name}</div>
                                                                <div style={{opacity: 0.75}}>@{b.user_name}</div>
                                                                <span style={statusBadgeStyle(b.status)}>{b.status}</span>
                                                            </div>
                                                        ))}
                                                    {filteredScheduleBookings.filter((b) => b.date === day).length === 0 && (
                                                        <div style={{opacity: 0.55, fontSize: 12}}>Нет записей</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {scheduleView === 'month' && (
                                <div style={cardStyle}>
                                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4, marginBottom: 4}}>
                                        {WEEKDAY_LABELS_SHORT.map((w) => (
                                            <div key={w} style={{fontWeight: 700, fontSize: 12, textAlign: 'center', opacity: 0.7}}>{w}</div>
                                        ))}
                                    </div>
                                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4}}>
                                        {monthCalendarCells.map((cell) => {
                                            const dayItems = filteredScheduleBookings.filter((b) => b.date === cell.date);
                                            return (
                                                <div
                                                    key={cell.date}
                                                    style={{
                                                        minHeight: 96,
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 8,
                                                        padding: 6,
                                                        background: cell.inMonth ? '#fff' : '#f1f5f9',
                                                        opacity: cell.inMonth ? 1 : 0.65,
                                                    }}
                                                >
                                                    <div style={{fontWeight: 700, fontSize: 12, marginBottom: 4}}>
                                                        {Number(cell.date.slice(8, 10))}
                                                    </div>
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                                                        {dayItems.slice(0, 3).map((b) => (
                                                            <div key={b.id} style={{fontSize: 10, lineHeight: 1.2, padding: 4, background: '#eff6ff', borderRadius: 4}}>
                                                                <b>{b.start_time}</b> {b.room_name}
                                                            </div>
                                                        ))}
                                                        {dayItems.length > 3 && (
                                                            <div style={{fontSize: 10, opacity: 0.7}}>+{dayItems.length - 3} ещё</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Регулярное расписание (еженедельные занятия) ── */}
                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Регулярное расписание (постоянная занятость)</h4>
                                <div style={{opacity: 0.7, fontSize: 13, marginBottom: 10}}>
                                    Еженедельные, постоянные занятия Академии. Не являются разовыми бронированиями.
                                </div>
                                {recurringList.length === 0 && (
                                    <div style={{opacity: 0.6, marginBottom: 8}}>Регулярных слотов нет.</div>
                                )}
                                <div style={{display: 'grid', gap: 6, marginBottom: 14}}>
                                    {recurringList.map((r) => (
                                        <div key={r.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px'}}>
                                            <div>
                                                <b>{DAY_LABELS[r.day_of_week] ?? r.day_of_week}</b>
                                                {' · '}{r.start_time}–{r.end_time}
                                                {' · '}<span style={{opacity: 0.8}}>{r.room_name}</span>
                                                {r.purpose ? <span style={{opacity: 0.65}}>{' · '}{r.purpose}</span> : null}
                                                {Number(r.student_visible) === 0 && (
                                                    <span style={{fontSize: 11, opacity: 0.6, marginLeft: 8}}>(скрыто от студентов)</span>
                                                )}
                                            </div>
                                            {canPublish && (
                                                <button
                                                    className='btn btn-danger btn-sm'
                                                    onClick={() => deleteRecurring(r.id)}
                                                >
                                                    Удалить
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {canPublish && (
                                    <details style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px'}}>
                                        <summary style={{cursor: 'pointer', fontWeight: 600}}>+ Добавить регулярный слот</summary>
                                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 10}}>
                                            <input className='form-control' placeholder='room_id' value={recurringForm.room_id} onChange={(e) => setRecurringForm({...recurringForm, room_id: e.target.value})}/>
                                            <input className='form-control' placeholder='Название класса' value={recurringForm.room_name} onChange={(e) => setRecurringForm({...recurringForm, room_name: e.target.value})}/>
                                            <select className='form-control' value={recurringForm.day_of_week} onChange={(e) => setRecurringForm({...recurringForm, day_of_week: Number(e.target.value)})}>
                                                {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                                            </select>
                                            <div style={{display: 'flex', gap: 6}}>
                                                <input className='form-control' placeholder='Начало' value={recurringForm.start_time} onChange={(e) => setRecurringForm({...recurringForm, start_time: e.target.value})}/>
                                                <input className='form-control' placeholder='Конец' value={recurringForm.end_time} onChange={(e) => setRecurringForm({...recurringForm, end_time: e.target.value})}/>
                                            </div>
                                            <input className='form-control' placeholder='Цель / название занятия' value={recurringForm.purpose} onChange={(e) => setRecurringForm({...recurringForm, purpose: e.target.value})}/>
                                            <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                                                <label style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                                    <input type='checkbox' checked={recurringForm.is_curriculum} onChange={(e) => setRecurringForm({...recurringForm, is_curriculum: e.target.checked})}/>
                                                    <span>Учебное</span>
                                                </label>
                                                <label style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                                    <input type='checkbox' checked={recurringForm.student_visible} onChange={(e) => setRecurringForm({...recurringForm, student_visible: e.target.checked})}/>
                                                    <span>Видно студентам</span>
                                                </label>
                                            </div>
                                        </div>
                                        <button className='btn btn-primary' style={{marginTop: 10}} onClick={createRecurring}>
                                            Добавить
                                        </button>
                                    </details>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'organization' && (
                        <div style={{display: 'grid', gap: 10}}>
                            <div style={{...cardStyle, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a'}}>
                                Служебные чаты и ознакомительное расписание Актового зала.
                            </div>

                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Служебные каналы</h4>
                                <div style={{display: 'grid', gap: 10}}>
                                    {ORG_CHANNELS.map((c) => {
                                        const pinned = orgPinnedPosts[c.name] || [];
                                        return (
                                            <div key={c.name} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 12}}>
                                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pinned.length > 0 ? 8 : 0}}>
                                                    <span style={{fontWeight: 700}}>{c.label}</span>
                                                    <button
                                                        className='btn btn-tertiary btn-sm'
                                                        onClick={() => openChannel(c.name)}
                                                    >
                                                        Открыть →
                                                    </button>
                                                </div>
                                                {pinned.length > 0 && (
                                                    <div style={{display: 'grid', gap: 6}}>
                                                        {pinned.map((p) => (
                                                            <div key={p.id} style={{background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', fontSize: 13}}>
                                                                <div style={{opacity: 0.6, fontSize: 11, marginBottom: 2}}>📌 {formatDate(p.create_at)}</div>
                                                                <div style={{whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical'}}>
                                                                    {p.message}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Актовый зал (readonly)</h4>
                                <div style={{opacity: 0.7, marginBottom: 8}}>
                                    Данные из Booking Service за ближайшие недели (одобренные и ожидающие; для студентов — только с признаком «видно студентам»).
                                    Утверждение брони — вкладка «Бронирование».
                                </div>
                                <button className='btn btn-tertiary btn-sm' style={{marginBottom: 8}} onClick={loadHallBookings}>
                                    Обновить расписание зала
                                </button>
                                {hallReadonlyBookings.length === 0 && (
                                    <div style={{...cardStyle, background: '#fffbeb', borderColor: '#fde68a'}}>
                                        Нет ближайших событий по Актовому залу.
                                    </div>
                                )}
                                <div style={{display: 'grid', gap: 8}}>
                                    {hallReadonlyBookings.map((b) => (
                                        <article key={`hall-${b.id}`} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 10}}>
                                            <b>{b.room_name}</b> — {b.date} {b.start_time}-{b.end_time}
                                            <div style={{marginTop: 4}}>
                                                <span style={statusBadgeStyle(b.status)}>{b.status}</span>
                                                <span style={{opacity: 0.72, marginLeft: 8}}>@{b.user_name}</span>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <div style={{display: 'grid', gap: 10}}>
                            <div style={{...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10}}>
                                <div style={{display: 'flex', gap: 16, alignItems: 'flex-start'}}>
                                    {currentUserId && (
                                        <img
                                            src={`/api/v4/users/${currentUserId}/image?_=${currentUser?.last_picture_update || 0}`}
                                            alt='avatar'
                                            style={{width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #e2e8f0'}}
                                        />
                                    )}
                                    <div>
                                        <h4 style={{marginTop: 0, marginBottom: 8}}>Профиль</h4>
                                        <div><b>Имя:</b> {`${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.username || '—'}</div>
                                        <div><b>Username:</b> @{currentUser?.username || '—'}</div>
                                        <div><b>Email:</b> {currentUser?.email || '—'}</div>
                                        <div><b>Роль:</b> {getAcademyRoleLabel(currentUser?.roles || '')}</div>
                                        <div><b>Команда:</b> {currentTeam?.display_name || '—'}</div>
                                    </div>
                                </div>
                                <div style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc'}}>
                                    <div style={{fontWeight: 700, marginBottom: 6}}>Краткая сводка</div>
                                    <div>Мои заявки: <b>{myBookings.length}</b></div>
                                    <div>Заявки к оплате: <b>{myPaymentRows.length}</b></div>
                                    <div style={{marginTop: 8, opacity: 0.8}}>{paymentReminderText}</div>
                                </div>
                            </div>

                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Мои оплаты (просмотр)</h4>
                                <div style={{opacity: 0.72, marginBottom: 8}}>
                                    История формируется по одобренным заявкам и записям со ссылкой на оплату.
                                </div>
                                {myPaymentRows.length === 0 && (
                                    <div style={{...cardStyle, background: '#fffbeb', borderColor: '#fde68a'}}>
                                        Пока нет записей по оплатам.
                                    </div>
                                )}
                                <div style={{display: 'grid', gap: 8}}>
                                    {myPaymentRows.map((row) => (
                                        <article key={`pay-${row.id}`} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 10}}>
                                            <div><b>{row.room_name}</b> — {row.date} {row.start_time}-{row.end_time}</div>
                                            <div style={{marginTop: 4}}>
                                                <span style={statusBadgeStyle(row.status)}>{row.status}</span>
                                            </div>
                                            {row.payment_link ? (
                                                <div style={{marginTop: 6}}>
                                                    <a href={row.payment_link} target='_blank' rel='noreferrer'>Открыть ссылку на оплату</a>
                                                </div>
                                            ) : (
                                                <div style={{marginTop: 6, opacity: 0.7}}>Ссылка на оплату пока не назначена.</div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            </div>

                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Мои занятия</h4>
                                <div style={{opacity: 0.72, marginBottom: 8}}>
                                    Ближайшие подтвержденные и ожидающие занятия/брони.
                                </div>
                                {myClasses.length === 0 && (
                                    <div style={{...cardStyle, background: '#fffbeb', borderColor: '#fde68a'}}>
                                        Нет ближайших занятий.
                                    </div>
                                )}
                                <div style={{display: 'grid', gap: 8}}>
                                    {myClasses.map((row) => (
                                        <article key={`class-${row.id}`} style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 10}}>
                                            <div><b>{row.room_name}</b> — {row.date} {row.start_time}-{row.end_time}</div>
                                            <div style={{marginTop: 4}}>
                                                <span style={statusBadgeStyle(row.status)}>{row.status}</span>
                                            </div>
                                            {row.purpose && <div style={{marginTop: 6, opacity: 0.8}}>Цель: {row.purpose}</div>}
                                        </article>
                                    ))}
                                </div>
                            </div>

                            <div style={{...cardStyle, background: '#eff6ff', borderColor: '#bfdbfe'}}>
                                <h4 style={{marginTop: 0}}>Напоминания</h4>
                                <div>{paymentReminderText}</div>
                                <div style={{marginTop: 6, opacity: 0.8}}>
                                    Для уточнений по начислениям используйте канал бухгалтерии во вкладке «Организация».
                                </div>
                                <div style={{marginTop: 8}}>
                                    <button className='btn btn-tertiary btn-sm' onClick={() => openChannel('buhgalteriya')}>
                                        Открыть канал бухгалтерии
                                    </button>
                                </div>
                            </div>

                            {/* ── Мой педагог и группа ─────────────────────────────────── */}
                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Мой педагог и группа</h4>
                                <div style={{opacity: 0.72, marginBottom: 10}}>
                                    Для связи с педагогом или вопросов по группе — напишите напрямую через Mattermost.
                                </div>
                                <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                                    <button className='btn btn-tertiary btn-sm' onClick={() => openChannel('raspisanie')}>
                                        📅 Мастер-расписание
                                    </button>
                                    <button className='btn btn-tertiary btn-sm' onClick={() => openChannel('tehnicheskie-voprosy')}>
                                        🔧 Технические вопросы
                                    </button>
                                    <button className='btn btn-tertiary btn-sm' onClick={() => openChannel('resepchen')}>
                                        🏢 Ресепшн (запись, справки)
                                    </button>
                                </div>
                                <div style={{marginTop: 10, fontSize: 13, opacity: 0.65}}>
                                    Чтобы написать педагогу напрямую — откройте список участников команды (кнопка «👤» вверху) и выберите нужного сотрудника.
                                </div>
                            </div>

                            {/* ── Документы ────────────────────────────────────────────── */}
                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Документы</h4>
                                <div style={{opacity: 0.72, marginBottom: 12}}>
                                    Запросить официальные документы Академии. Заявка отправляется в канал ресепшна — администратор подготовит документ в течение 2–3 рабочих дней.
                                </div>
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10}}>
                                    <div style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 14}}>
                                        <div style={{fontWeight: 700, marginBottom: 6}}>📄 Договор об обучении</div>
                                        <div style={{fontSize: 13, opacity: 0.72, marginBottom: 10}}>Копия или оригинал договора.</div>
                                        <button
                                            className='btn btn-secondary btn-sm'
                                            onClick={() => {
                                                openChannel('resepchen');
                                                setTimeout(() => {
                                                    // eslint-disable-next-line no-alert
                                                    alert('Перейдите в канал Ресепшн и напишите: «Прошу выдать копию договора об обучении для @' + (currentUser?.username || 'меня') + '»');
                                                }, 300);
                                            }}
                                        >
                                            Запросить
                                        </button>
                                    </div>
                                    <div style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 14}}>
                                        <div style={{fontWeight: 700, marginBottom: 6}}>📋 Справка об обучении</div>
                                        <div style={{fontSize: 13, opacity: 0.72, marginBottom: 10}}>Для предъявления по месту требования.</div>
                                        <button
                                            className='btn btn-secondary btn-sm'
                                            onClick={() => {
                                                openChannel('resepchen');
                                                setTimeout(() => {
                                                    // eslint-disable-next-line no-alert
                                                    alert('Перейдите в канал Ресепшн и напишите: «Прошу выдать справку об обучении для @' + (currentUser?.username || 'меня') + '»');
                                                }, 300);
                                            }}
                                        >
                                            Запросить
                                        </button>
                                    </div>
                                    <div style={{border: '1px solid #e2e8f0', borderRadius: 10, padding: 14}}>
                                        <div style={{fontWeight: 700, marginBottom: 6}}>🧾 Квитанция / Акт</div>
                                        <div style={{fontSize: 13, opacity: 0.72, marginBottom: 10}}>Подтверждение оплаты или акт выполненных работ.</div>
                                        <button
                                            className='btn btn-secondary btn-sm'
                                            onClick={() => openChannel('buhgalteriya')}
                                        >
                                            В бухгалтерию
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ── Настройки уведомлений ──────────────────────────────── */}
                            <div style={cardStyle}>
                                <h4 style={{marginTop: 0}}>Настройки</h4>
                                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                                    <a href='/account/notifications' style={{textDecoration: 'none'}}>
                                        <button className='btn btn-tertiary btn-sm'>🔔 Настройки уведомлений</button>
                                    </a>
                                    <a href='/account/security' style={{textDecoration: 'none'}}>
                                        <button className='btn btn-tertiary btn-sm'>🔐 Безопасность аккаунта</button>
                                    </a>
                                    <a href='/account/general' style={{textDecoration: 'none'}}>
                                        <button className='btn btn-tertiary btn-sm'>👤 Общие настройки профиля</button>
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'admin' && (
                        <div>
                            {!canPublish ? (
                                <div style={{...cardStyle, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b'}}>Доступ только для staff.</div>
                            ) : (
                                <>
                                    <div style={{...cardStyle, marginBottom: 10}}>
                                        <h4 style={{marginTop: 0}}>Аналитика контента</h4>
                                        <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8}}>
                                            <div>Всего публикаций: <b>{postAnalytics.total}</b></div>
                                            <div>За 7 дней: <b>{postAnalytics.weekTotal}</b></div>
                                            <div>Последняя публикация: <b>{postAnalytics.latestAny ? formatDate(postAnalytics.latestAny) : 'нет данных'}</b></div>
                                        </div>
                                        <div style={{display: 'grid', gap: 6}}>
                                            {postAnalytics.byTab.map((row) => {
                                                const chName = (['news_students', 'news_staff', 'afisha', 'faq'] as const).includes(row.tab as never)
                                                    ? ({news_students: 'novosti-studentam', news_staff: 'novosti-sotrudnikov', afisha: 'afisha', faq: 'faq'} as Record<string, string>)[row.tab]
                                                    : '';
                                                const stats = chName ? channelStats[chName] : undefined;
                                                return (
                                                    <div key={row.tab} style={{display: 'flex', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px'}}>
                                                        <span>{TABS.find((t) => t.id === row.tab)?.label || row.tab}</span>
                                                        <span>
                                                            Всего: <b>{row.total}</b> • 7д: <b>{row.weekCount}</b>
                                                            {stats && <> • 👥 <b>{stats.member_count}</b></>}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ── Черновики для согласования ─────────────── */}
                                    {isSystemAdmin && (
                                        <div style={{...cardStyle, marginBottom: 10}}>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                                                <h4 style={{margin: 0}}>
                                                    Черновики для согласования
                                                    {postDrafts.length > 0 && (
                                                        <span style={{
                                                            marginLeft: 8, background: '#dc2626', color: '#fff',
                                                            fontSize: 12, borderRadius: 999, padding: '2px 8px',
                                                        }}>
                                                            {postDrafts.length}
                                                        </span>
                                                    )}
                                                </h4>
                                                <button className='btn btn-secondary btn-sm' onClick={loadPostDrafts} disabled={draftsLoading}>
                                                    {draftsLoading ? 'Загрузка...' : 'Обновить'}
                                                </button>
                                            </div>

                                            {postDrafts.length === 0 && (
                                                <div style={{opacity: 0.65}}>Нет черновиков для согласования.</div>
                                            )}

                                            <div style={{display: 'grid', gap: 10}}>
                                                {postDrafts.map((draft) => (
                                                    <article key={draft.id} style={{border: '1px solid #e2e8f0', borderRadius: 12, padding: 14}}>
                                                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
                                                            <div>
                                                                <b>{draft.title || '(без заголовка)'}</b>
                                                                <span style={{marginLeft: 8, fontSize: 12, opacity: 0.7}}>
                                                                    {TABS.find((t) => t.id === draft.tab)?.label || draft.tab} · @{draft.author_name}
                                                                </span>
                                                            </div>
                                                            <span style={{fontSize: 12, opacity: 0.6}}>{formatDate(draft.created_at)}</span>
                                                        </div>
                                                        <div style={{whiteSpace: 'pre-wrap', marginBottom: 10, background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 13}}>
                                                            {draft.formatted_message || draft.body || '(пусто)'}
                                                        </div>
                                                        {draft.image_file_id && (
                                                            <div style={{fontSize: 12, opacity: 0.7, marginBottom: 8}}>📎 Вложение: {draft.image_file_id}</div>
                                                        )}
                                                        <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                                                            <button
                                                                className='btn btn-primary btn-sm'
                                                                onClick={() => approveDraft(draft.id)}
                                                            >
                                                                ✅ Одобрить и опубликовать
                                                            </button>
                                                            <input
                                                                className='form-control'
                                                                style={{maxWidth: 260, fontSize: 13}}
                                                                placeholder='Причина отказа (опционально)'
                                                                value={draftRejectReason[draft.id] || ''}
                                                                onChange={(e) => setDraftRejectReason((prev) => ({...prev, [draft.id]: e.target.value}))}
                                                            />
                                                            <button
                                                                className='btn btn-danger btn-sm'
                                                                onClick={() => rejectDraft(draft.id)}
                                                            >
                                                                ❌ Отклонить
                                                            </button>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{display: 'flex', gap: 8, marginBottom: 10}}>
                                        <input className='form-control' style={{maxWidth: 320}} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder='Поиск по имени/email'/>
                                        <select
                                            className='form-control'
                                            style={{maxWidth: 200}}
                                            value={roleFilter}
                                            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'student' | 'staff' | 'admin')}
                                        >
                                            <option value='all'>Все роли</option>
                                            <option value='student'>Студенты</option>
                                            <option value='staff'>Педагоги/Сотрудники</option>
                                            <option value='admin'>Админы</option>
                                        </select>
                                        <input className='form-control' style={{maxWidth: 320}} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder='email для приглашения'/>
                                        <button className='btn btn-primary' onClick={async () => {
                                            if (inviteEmail.trim() && effectiveTeamId) {
                                                await Client4.sendEmailInvitesToTeam(effectiveTeamId, [inviteEmail.trim()]);
                                                setInviteEmail('');
                                            }
                                        }}
                                        >
                                            + Пригласить
                                        </button>
                                        <button className='btn btn-secondary' onClick={loadUsers}>Обновить</button>
                                    </div>
                                    <div style={{...cardStyle, marginBottom: 10}}>
                                        <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                                            <label style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                                <input
                                                    type='checkbox'
                                                    checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedUserIds(filteredUsers.map((u) => u.id));
                                                        } else {
                                                            setSelectedUserIds([]);
                                                        }
                                                    }}
                                                />
                                                <span>Выбрать всех</span>
                                            </label>
                                            <span style={{opacity: 0.7}}>Выбрано: {selectedUserIds.length}</span>
                                            <button
                                                className='btn btn-primary btn-sm'
                                                disabled={selectedUserIds.length === 0}
                                                onClick={async () => {
                                                    await Promise.all(selectedUserIds.map((id) => Client4.updateUserRoles(id, 'system_user team_user team_admin')));
                                                    setSelectedUserIds([]);
                                                    await loadUsers();
                                                }}
                                            >
                                                Массово: повысить до staff
                                            </button>
                                            <button
                                                className='btn btn-danger btn-sm'
                                                disabled={selectedUserIds.length === 0}
                                                onClick={async () => {
                                                    await Promise.all(selectedUserIds.map((id) => Client4.updateUserActive(id, false)));
                                                    setSelectedUserIds([]);
                                                    await loadUsers();
                                                }}
                                            >
                                                Массово: деактивировать
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{display: 'grid', gap: 10}}>
                                        {filteredUsers.length === 0 && <div style={cardStyle}>Пользователи не найдены.</div>}
                                        {filteredUsers.map((u) => (
                                            <article key={u.id} style={cardStyle}>
                                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                                                    <label style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                                        <input
                                                            type='checkbox'
                                                            checked={selectedUserIds.includes(u.id)}
                                                            onChange={(e) => {
                                                                setSelectedUserIds((prev) => {
                                                                    if (e.target.checked) {
                                                                        return Array.from(new Set([...prev, u.id]));
                                                                    }
                                                                    return prev.filter((id) => id !== u.id);
                                                                });
                                                            }}
                                                        />
                                                        <span>Выбрать</span>
                                                    </label>
                                                </div>
                                                <div><b>@{u.username}</b> • {u.email}</div>
                                                <div style={{opacity: 0.7, marginBottom: 8}}>{u.roles || 'system_user'}</div>
                                                <button
                                                    className='btn btn-secondary btn-sm'
                                                    onClick={async () => {
                                                        const dmChannel = await Client4.createDirectChannel([currentUserId, u.id]);
                                                        if (dmChannel?.id) {
                                                            window.location.href = `/${currentTeam?.name || ''}/channels/${dmChannel.name}`;
                                                        }
                                                    }}
                                                >
                                                    Написать
                                                </button>
                                                <button className='btn btn-primary btn-sm' onClick={async () => {
                                                    await Client4.updateUserRoles(u.id, 'system_user team_user team_admin');
                                                    await loadUsers();
                                                }}
                                                >
                                                    Повысить до staff
                                                </button>
                                                <button
                                                    className='btn btn-tertiary btn-sm'
                                                    style={{marginLeft: 8}}
                                                    onClick={async () => {
                                                        const nextEmail = window.prompt(`Новый email для @${u.username}`, u.email || '');
                                                        if (!nextEmail || !nextEmail.includes('@')) {
                                                            return;
                                                        }
                                                        await Client4.patchUser({id: u.id, email: nextEmail});
                                                        await loadUsers();
                                                    }}
                                                >
                                                    Изменить email
                                                </button>
                                                <button className='btn btn-danger btn-sm' style={{marginLeft: 8}} onClick={async () => {
                                                    await Client4.updateUserActive(u.id, false);
                                                    await loadUsers();
                                                }}
                                                >
                                                    Деактивировать
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

