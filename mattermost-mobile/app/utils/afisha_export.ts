// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Share} from 'react-native';

import type {AfishaPreviewType} from '@screens/home/academy_afisha/afisha_preview';

/**
 * Share afisha image using native share dialog
 */
export const shareAfishaImage = async (
    imagePath: string,
    title: string,
): Promise<boolean> => {
    try {
        await Share.share({
            url: imagePath,
            title,
            message: `Check out this event: ${title}`,
        });
        return true;
    } catch {
        return false;
    }
};

/**
 * Generate SVG markup for afisha poster (800x1100)
 */
export const generateAfishaSVG = (
    data: AfishaPreviewType,
    color: string,
    accent: string,
): string => {
    const escape = (str: string) => {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(
            />/g,
            '&gt;',
        );
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${accent};stop-opacity:0.8" />
        </linearGradient>
    </defs>
    <rect width="800" height="1100" fill="white" />
    <rect width="800" height="250" fill="url(#grad)" />
    <text x="40" y="80" font-size="60" font-weight="bold" fill="white" text-anchor="start">
        ${escape(data.title)}
    </text>
    <text x="40" y="140" font-size="16" fill="#f0f0f0" text-anchor="start">
        ${escape(data.date)} at ${escape(data.time)}
    </text>
    <text x="40" y="160" font-size="16" fill="#f0f0f0" text-anchor="start">
        📍 ${escape(data.venue)}
    </text>
    <text x="40" y="350" font-size="16" fill="#333" text-anchor="start">
        ${escape(data.description)}
    </text>
</svg>`;
};

export default {
    shareAfishaImage,
    generateAfishaSVG,
};
