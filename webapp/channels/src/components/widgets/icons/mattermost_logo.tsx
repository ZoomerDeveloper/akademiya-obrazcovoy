// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

/**
 * Логотип Академии Образцовой — нотный ключ в круге (SVG).
 * Заменяет стандартный логотип Mattermost во всём веб-интерфейсе.
 */
export default function MattermostLogo(props: React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span {...props}>
            <svg
                viewBox='0 0 100 100'
                xmlns='http://www.w3.org/2000/svg'
                role='img'
                aria-label='Академия Образцовой'
            >
                {/* Внешний круг */}
                <circle cx='50' cy='50' r='48' fill='#1a1a35'/>
                {/* Золотое кольцо */}
                <circle cx='50' cy='50' r='48' fill='none' stroke='#c4973b' strokeWidth='3'/>

                {/* Нотный ключ (скрипичный) */}
                <text
                    x='50'
                    y='70'
                    textAnchor='middle'
                    fontSize='58'
                    fontFamily='Georgia, serif'
                    fill='#c4973b'
                    letterSpacing='-2'
                >
                    {'𝄞'}
                </text>
            </svg>
        </span>
    );
}
