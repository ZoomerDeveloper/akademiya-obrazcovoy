#!/usr/bin/env node
/**
 * Скрипт заполнения БД через REST API booking_service
 * Создаёт расписание на сегодня и ближайшие 2 дня
 * 
 * Использование:
 *   ADMIN_TOKEN="your-token" BASE_URL="https://vm268473.hosted-by-robovps.ru" node api-seed-lessons.js
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Конфиг
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.MATTERMOST_TOKEN || 'admin-token';

const INSTRUMENTS = ['Фортепиано', 'Скрипка', 'Виолончель', 'Флейта', 'Кларнет', 'Саксофон', 'Гитара', 'Вокал'];
const TEACHERS = [
    { id: 'teacher_1', name: 'Иванов А.' },
    { id: 'teacher_2', name: 'Сидорова М.' },
    { id: 'teacher_3', name: 'Петров И.' },
    { id: 'teacher_4', name: 'Кузнецова В.' },
    { id: 'teacher_5', name: 'Морозов С.' }
];

const STUDENTS = [
    { id: 'student_1', name: 'Александр М.', email: 'alex@example.ru' },
    { id: 'student_2', name: 'Виктория П.', email: 'vika@example.ru' },
    { id: 'student_3', name: 'Дмитрий С.', email: 'dmitry@example.ru' },
    { id: 'student_4', name: 'Евгения Л.', email: 'evgenia@example.ru' },
    { id: 'student_5', name: 'Фёдор К.', email: 'fedor@example.ru' },
    { id: 'student_6', name: 'Галина Р.', email: 'galina@example.ru' },
    { id: 'student_7', name: 'Ирина Н.', email: 'irina@example.ru' },
    { id: 'student_8', name: 'Юрий В.', email: 'yuri@example.ru' }
];

// HTTP helper
function apiRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const lib = url.protocol === 'https:' ? https : http;
        const data = body ? JSON.stringify(body) : null;

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json',
                ...(data && { 'Content-Length': Buffer.byteLength(data) })
            }
        };

        const req = lib.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw);
                    resolve({ status: res.statusCode, data: json });
                } catch {
                    resolve({ status: res.statusCode, data: raw });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function getDateString(daysFromNow = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split('T')[0];
}

async function fetchRooms() {
    console.log('▶️  Получаю список классов...');
    const { status, data } = await apiRequest('GET', '/booking-service/api/rooms');
    if (status !== 200) {
        console.error(`❌ Ошибка получения классов: HTTP ${status}`);
        return [];
    }
    console.log(`✅ Получено ${data.length} классов`);
    return data;
}

async function createBooking(booking) {
    const { status, data } = await apiRequest('POST', '/booking-service/api/bookings', booking);
    if (status !== 201 && status !== 200) {
        console.error(`❌ Ошибка создания бронирования: ${booking.purpose} → HTTP ${status}`);
        if (data?.error) console.error(`   ${data.error}`);
        return false;
    }
    return true;
}

async function seedLessons() {
    try {
        console.log('\n▶️  Инициализация расписания через API...\n');
        
        const rooms = await fetchRooms();
        if (!rooms || rooms.length === 0) {
            console.error('❌ Нет доступных классов. Сначала создайте классы через /api/rooms.');
            return;
        }

        let bookingCount = 0;
        let errorCount = 0;
        
        // Сегодня и 2 дня вперёд
        for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
            const date = getDateString(dayOffset);
            console.log(`📅 ${date}:`);
            
            const times = [
                { start: '09:00', end: '10:00' },
                { start: '10:00', end: '11:00' },
                { start: '11:00', end: '12:00' },
                { start: '12:00', end: '13:00' },
                { start: '14:00', end: '15:00' },
                { start: '15:00', end: '16:00' },
                { start: '16:00', end: '17:00' },
                { start: '17:00', end: '18:00' }
            ];

            // Распределяем занятия по классам
            rooms.forEach((room, roomIdx) => {
                if (times.length > 0) {
                    const time = times[roomIdx % times.length];
                    const teacher = TEACHERS[bookingCount % TEACHERS.length];
                    const student = STUDENTS[bookingCount % STUDENTS.length];
                    const instrument = INSTRUMENTS[bookingCount % INSTRUMENTS.length];

                    const booking = {
                        room_id: room.id,
                        room_name: room.name,
                        user_id: student.id,
                        user_name: student.name,
                        user_email: student.email,
                        date,
                        start_time: time.start,
                        end_time: time.end,
                        purpose: `${instrument} с ${teacher.name}`,
                        is_curriculum: 1,
                        student_visible: 1
                    };

                    apiRequest('POST', '/booking-service/api/bookings', booking)
                        .then(({ status }) => {
                            if (status === 201 || status === 200) {
                                bookingCount++;
                                console.log(`   ✅ ${room.name} ${time.start}-${time.end}: ${booking.purpose}`);
                            } else {
                                errorCount++;
                            }
                        })
                        .catch(err => {
                            errorCount++;
                            console.error(`   ❌ ${room.name} ${time.start}-${time.end}: ${err.message}`);
                        });
                }
            });
        }

        // Дождёмся завершения
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`\n✅ Инициализация завершена!`);
        console.log(`\n📊 Статистика:`);
        console.log(`   • Создано занятий: ${bookingCount}`);
        console.log(`   • Ошибок: ${errorCount}`);
        console.log(`   • Период: сегодня + 2 дня`);
        console.log(`\n🎵 Расписание готово!\n`);
        
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
        process.exit(1);
    }
}

seedLessons();
