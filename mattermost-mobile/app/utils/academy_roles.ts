// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type AcademyRoleFlags = {
    isSystemAdmin: boolean;
    isTeamAdmin: boolean;
    isChannelAdmin: boolean;
    isStaff: boolean;
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

    return {
        isSystemAdmin,
        isTeamAdmin,
        isChannelAdmin,
        isStaff,
    };
}
