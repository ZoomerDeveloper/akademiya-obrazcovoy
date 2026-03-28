// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Имена кастомных ролей Mattermost (поле roles у пользователя), дающих доступ ко второй ленте
 * «Сотрудникам» (`novosti-sotrudnikam`), если у пользователя нет team_admin / channel_admin / system_admin.
 * Добавьте сюда name роли с сервера (например через mmctl roles list), при необходимости.
 */
export const ACADEMY_STAFF_NEWS_EXTRA_ROLE_NAMES: readonly string[] = [];

type AcademyRoleFlags = {
    isSystemAdmin: boolean;
    isTeamAdmin: boolean;
    isChannelAdmin: boolean;
    isStaff: boolean;
    /** Две вкладки ленты: студенты — только первая; staff или extra-роли — обе. */
    canSeeStaffNewsFeed: boolean;
};

function toSet(roles?: string) {
    return new Set((roles || '').split(' ').filter(Boolean));
}

export function getAcademyRoleFlags(roles?: string): AcademyRoleFlags {
    const roleSet = toSet(roles);
    const isSystemAdmin = roleSet.has('system_admin');
    const isTeamAdmin = roleSet.has('team_admin');
    const isChannelAdmin = roleSet.has('channel_admin');
    const isStaff = isSystemAdmin || isTeamAdmin || isChannelAdmin;
    const hasExtraNewsRole = ACADEMY_STAFF_NEWS_EXTRA_ROLE_NAMES.some((n) => roleSet.has(n));
    const canSeeStaffNewsFeed = isStaff || hasExtraNewsRole;

    return {
        isSystemAdmin,
        isTeamAdmin,
        isChannelAdmin,
        isStaff,
        canSeeStaffNewsFeed,
    };
}
