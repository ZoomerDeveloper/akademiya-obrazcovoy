// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {
    Text,
    View,
} from 'react-native';

export type AfishaPreviewType = {
    emoji: string;
    color: string;
    accent: string;
    title: string;
    description: string;
    date: string;
    time: string;
    venue: string;
    ticket?: string;
}

interface AfishaPreviewProps {
    data: AfishaPreviewType;
}

const getStyleSheet = () => ({
    container: {
        backgroundColor: '#ffffff',
        width: 800,
        height: 1100,
        padding: 40,
        flexDirection: 'column' as const,
    },
    gradient: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        height: 300,
        zIndex: 1,
    },
    header: {
        zIndex: 2,
        marginBottom: 30,
    },
    emoji: {
        fontSize: 120,
        textAlign: 'center' as const,
        marginBottom: 20,
    },
    title: {
        fontSize: 56,
        fontWeight: 'bold' as const,
        color: '#ffffff',
        textAlign: 'center' as const,
        marginBottom: 10,
        lineHeight: 65,
    },
    eventLine: {
        fontSize: 16,
        color: '#f0ead6',
        textAlign: 'center' as const,
        marginBottom: 4,
    },
    body: {
        flex: 1,
        zIndex: 2,
    },
    description: {
        fontSize: 18,
        color: '#333333',
        lineHeight: 28,
        marginBottom: 30,
        textAlign: 'justify' as const,
    },
    details: {
        marginBottom: 30,
    },
    detailRow: {
        flexDirection: 'row' as const,
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e8e8e8',
    },
    detailLabel: {
        fontSize: 14,
        fontWeight: '600' as const,
        color: '#666666',
        flex: 0.3,
    },
    detailValue: {
        fontSize: 14,
        color: '#333333',
        flex: 1,
    },
    ticket: {
        backgroundColor: '#f0ead6',
        borderRadius: 8,
        padding: 12,
        marginTop: 20,
        marginBottom: 20,
    },
    ticketLabel: {
        fontSize: 12,
        fontWeight: '600' as const,
        color: '#8b6914',
        marginBottom: 6,
        textTransform: 'uppercase' as const,
    },
    ticketLink: {
        fontSize: 14,
        color: '#1a47a0',
        textDecorationLine: 'underline' as const,
    },
    footer: {
        textAlign: 'center' as const,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: '#e8e8e8',
        zIndex: 2,
    },
    watermark: {
        fontSize: 12,
        color: '#999999',
        fontStyle: 'italic' as const,
    },
});

/**
 * Афиша компонент для экспорта в PNG (800x1100)
 */
function AfishaPreview({data}: AfishaPreviewProps) {
    const style = getStyleSheet();

    return (
        <View style={style.container}>
            {/* Gradient overlay (simulated with colored View) */}
            <View
                style={[
                    style.gradient,
                    {backgroundColor: data.color},
                ]}
            />

            {/* Header with emoji and title */}
            <View style={style.header}>
                <Text style={style.emoji}>{data.emoji}</Text>
                <Text style={style.title}>{data.title}</Text>
                <Text style={style.eventLine}>{data.date}</Text>
                <Text style={style.eventLine}>
                    {data.time}
                    {' \u2022 '}
                    {data.venue}
                </Text>
            </View>

            {/* Main body */}
            <View style={style.body}>
                <Text style={style.description}>{data.description}</Text>

                {/* Details */}
                <View style={style.details}>
                    <View style={style.detailRow}>
                        <Text style={style.detailLabel}>
                            {'📅 Дата'}
                        </Text>
                        <Text style={style.detailValue}>{data.date}</Text>
                    </View>
                    <View style={style.detailRow}>
                        <Text style={style.detailLabel}>
                            {'⏰ Время'}
                        </Text>
                        <Text style={style.detailValue}>{data.time}</Text>
                    </View>
                    <View style={style.detailRow}>
                        <Text style={style.detailLabel}>
                            {'📍 Место'}
                        </Text>
                        <Text style={style.detailValue}>{data.venue}</Text>
                    </View>
                </View>

                {/* Ticket link */}
                {data.ticket && (
                    <View style={style.ticket}>
                        <Text style={style.ticketLabel}>
                            {'🎟 Ссылка на билеты'}
                        </Text>
                        <Text style={style.ticketLink}>{data.ticket}</Text>
                    </View>
                )}
            </View>

            {/* Footer */}
            <View style={style.footer}>
                <Text style={style.watermark}>
                    {'Международная Академия музыки Елены Образцовой'}
                </Text>
            </View>
        </View>
    );
}

export default AfishaPreview;
