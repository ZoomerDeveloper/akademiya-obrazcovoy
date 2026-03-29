// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {cacheDirectory, EncodingType, writeAsStringAsync} from 'expo-file-system';
import {Share} from 'react-native';
import NativeShare from 'react-native-share';

import type {AfishaPreviewType} from '@screens/home/academy_afisha/afisha_preview';

/**
 * Share afisha image using native share dialog
 */
export const shareAfishaImage = async (
    imagePath: string,
    title: string,
): Promise<boolean> => {
    try {
        await NativeShare.open({
            title,
            url: imagePath,
            type: imagePath.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
            failOnCancel: false,
        });
        return true;
    } catch {
        try {
            await Share.share({
                url: imagePath,
                title,
            });
            return true;
        } catch {
            return false;
        }
    }
};

/**
 * Generate SVG markup for afisha poster in vertical 3:4 ratio (900x1200).
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

    const normalizeText = (str?: string) => {
        return (str || '').replace(/\s+/g, ' ').trim();
    };

    const wrapText = (text: string, maxCharsPerLine: number, maxLines: number) => {
        const clean = normalizeText(text);
        if (!clean) {
            return [''];
        }

        const words = clean.split(' ');
        const lines: string[] = [];
        let current = '';

        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= maxCharsPerLine) {
                current = candidate;
                continue;
            }

            if (current) {
                lines.push(current);
                current = word;
            } else {
                lines.push(word.slice(0, maxCharsPerLine));
                current = word.slice(maxCharsPerLine);
            }

            if (lines.length >= maxLines) {
                break;
            }
        }

        if (lines.length < maxLines && current) {
            lines.push(current);
        }

        if (lines.length > maxLines) {
            lines.length = maxLines;
        }

        if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
            const lastLine = lines[maxLines - 1] || '';
            lines[maxLines - 1] = `${lastLine.slice(0, Math.max(maxCharsPerLine - 1, 1)).trim()}...`;
        }

        return lines;
    };

    const toTspans = (lines: string[], x: number, lineHeight: number) => {
        return lines.map((line, idx) => {
            const dy = idx === 0 ? 0 : lineHeight;
            return `<tspan x="${x}" dy="${dy}">${escape(line)}</tspan>`;
        }).join('');
    };

    const titleLines = wrapText(data.title || 'Событие Академии', 20, 4);
    const descriptionLines = wrapText(data.description || '', 40, 14);
    const venueLines = wrapText(data.venue || '', 34, 2);

    const titleStartY = 250;
    const titleLineHeight = 54;
    const titleBottomY = titleStartY + ((titleLines.length - 1) * titleLineHeight);
    const infoRowY = titleBottomY + 64;
    const descStartY = 640;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
            <stop offset="55%" style="stop-color:${accent};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="hero" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#111827;stop-opacity:0.96" />
            <stop offset="100%" style="stop-color:#374151;stop-opacity:0.9" />
        </linearGradient>
        <linearGradient id="accentBar" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${accent};stop-opacity:0.95" />
            <stop offset="100%" style="stop-color:#f9fafb;stop-opacity:0.9" />
        </linearGradient>
    </defs>
    <rect width="900" height="1200" fill="url(#bg)" />
    <circle cx="120" cy="1080" r="260" fill="#ffffff" opacity="0.08" />
    <circle cx="840" cy="180" r="220" fill="#ffffff" opacity="0.08" />

    <rect x="44" y="44" width="812" height="1112" rx="40" fill="#ffffff" opacity="0.97" />
    <rect x="76" y="76" width="748" height="510" rx="30" fill="url(#hero)" />
    <rect x="76" y="560" width="748" height="26" rx="13" fill="url(#accentBar)" />

    <rect x="116" y="112" width="318" height="44" rx="22" fill="#ffffff" opacity="0.14" />
    <text x="275" y="140" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">СОБЫТИЕ АКАДЕМИИ</text>

    <circle cx="740" cy="136" r="38" fill="#ffffff" opacity="0.16" />
    <text x="740" font-size="38" text-anchor="middle" dominant-baseline="central"><tspan x="740" y="136" dy="0.35em">${escape(data.emoji || '🎭')}</tspan></text>

    <text x="116" y="${titleStartY}" font-size="58" font-weight="800" fill="#ffffff" text-anchor="start">
        ${toTspans(titleLines, 116, titleLineHeight)}
    </text>

    <text x="116" y="${infoRowY}" font-size="30" font-weight="600" fill="#f3f4f6" text-anchor="start">${escape(normalizeText(data.date) || 'Дата')} | ${escape(normalizeText(data.time) || 'Время')}</text>
    <text x="116" y="${infoRowY + 52}" font-size="30" fill="#e5e7eb" text-anchor="start">${toTspans(venueLines, 116, 42)}</text>

    <text x="116" y="640" font-size="28" font-weight="700" fill="#111827" text-anchor="start" letter-spacing="0.3">ПОДРОБНОСТИ</text>

    <text x="116" y="${descStartY + 38}" font-size="28" fill="#1f2937" text-anchor="start">${toTspans(descriptionLines, 116, 40)}</text>

    <rect x="116" y="1056" width="668" height="66" rx="14" fill="#f3f4f6" />
    <text x="450" y="1098" font-size="22" fill="#374151" font-weight="600" text-anchor="middle">Международная Академия музыки</text>
</svg>`;
};

/**
 * Export afisha as a local image file URI.
 * - SVG: writes SVG markup as UTF-8.
 * - PNG: writes provided base64 payload as PNG binary.
 */
export const exportAfishaAsImage = async (
    data: AfishaPreviewType,
    color: string,
    accent: string,
    format: 'svg' | 'png' = 'png',
    pngBase64?: string,
): Promise<string | null> => {
    try {
        const svg = generateAfishaSVG(data, color, accent);
        const baseDir = cacheDirectory || '';
        if (!baseDir) {
            return null;
        }

        // Save as a single local file so share sheets don't split payload into text + data.
        const ext = format === 'png' ? 'png' : 'svg';
        const fileUri = `${baseDir}afisha-export-${Date.now()}.${ext}`;
        if (format === 'png') {
            if (!pngBase64) {
                return null;
            }
            await writeAsStringAsync(fileUri, pngBase64, {encoding: EncodingType.Base64});
        } else {
            await writeAsStringAsync(fileUri, svg, {encoding: EncodingType.UTF8});
        }

        return fileUri;
    } catch {
        return null;
    }
};

export default {
    shareAfishaImage,
    generateAfishaSVG,
    exportAfishaAsImage,
};
