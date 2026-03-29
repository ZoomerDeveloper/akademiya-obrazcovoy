#!/usr/bin/env node
/**
 * Скрипт заполнения БД реальными данными уроков на сегодня и ближайшие дни
 * 
 * Использование:
 *   node seed-lessons.js          # Заполняет данные за сегодня и 2 дня вперёд
 *   CLEAR_BOOKINGS=1 node seed-lessons.js   # Очищает БД перед заполнением
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bookings.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON');

// Инструменты и предметы
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

function generateId() {
    return crypto.randomBytes(12).toString('hex');
}

function getDateString(daysFromNow) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split('T')[0];
}

function createBookings() {
    // Получаем все классы из БД
    const roomsQuery = db.prepare('SELECT id, name FROM rooms ORDER BY sort_order');
    const rooms = roomsQuery.all();
    
    if (!rooms || rooms.length === 0) {
        console.log('⚠️  Классы не найдены в БД. Используются значения по умолчанию.');
    }

    const insertBooking = db.prepare(`
        INSERT OR IGNORE INTO bookings 
        (id, room_id, room_name, user_id, user_name, user_email, 
         date, start_time, end_time, purpose, is_curriculum, status, 
         student_visible, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let bookingCount = 0;

    // Сегодня и 2 дня вперёд - реальное расписание
    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
        const date = getDateString(dayOffset);
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

        // Распределяем занятия по классам и временным слотам
        rooms.forEach((room, roomIdx) => {
            for (let slotIdx = 0; slotIdx < Math.min(2, times.length); slotIdx++) {
                const time = times[slotIdx];
                const teacher = TEACHERS[bookingCount % TEACHERS.length];
                const student = STUDENTS[bookingCount % STUDENTS.length];
                const instrument = INSTRUMENTS[bookingCount % INSTRUMENTS.length];

                const purpose = `${instrument} с ${teacher.name}`;

                insertBooking.run(
                    generateId(),           // id
                    room.id,                // room_id
                    room.name,              // room_name
                    student.id,             // user_id (student)
                    student.name,           // user_name
                    student.email,          // user_email
                    date,                   // date
                    time.start,             // start_time
                    time.end,               // end_time
                    purpose,                // purpose
                    1,                      // is_curriculum
                    'confirmed',            // status
                    1,                      // student_visible
                    Date.now(),             // created_at
                    Date.now()              // updated_at
                );

                bookingCount++;
            }
        });
    }

    console.log(`✅ Созданы занятия: ${bookingCount}`);
    return bookingCount;
}

function createRecurringBookings() {
    // Получаем все классы из БД
    const roomsQuery = db.prepare('SELECT id, name FROM rooms ORDER BY sort_order');
    const rooms = roomsQuery.all();

    const insertRecurring = db.prepare(`
        INSERT OR IGNORE INTO recurring_bookings 
        (id, room_id, room_name, day_of_week, start_time, end_time, 
         purpose, is_curriculum, student_visible, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let recurCount = 0;

    // Каждый класс доступен Пн-Пт с 9:00 до 18:00
    rooms.forEach(room => {
        [0, 1, 2, 3, 4].forEach(dayOfWeek => { // Пн-Пт
            insertRecurring.run(
                generateId(),
                room.id,
                room.name,
                dayOfWeek,
                '09:00',
                '18:00',
                `Регулярные занятия в ${room.name}`,
                1,
                1,
                'admin',
                Date.now()
            );
            recurCount++;
        });
    });

    console.log(`✅ Созданы регулярные слоты: ${recurCount}`);
    return recurCount;
}

try {
    console.log('\n▶️  Инициализация расписания уроков...\n');
    
    // Опционально очищаем существующие бронирования
    if (process.env.CLEAR_BOOKINGS === '1') {
        console.log('⚠️  Очищаем существующие данные...');
        db.exec('DELETE FROM recurring_bookings');
        db.exec('DELETE FROM booking_log');
        db.exec('DELETE FROM bookings');
        console.log('✅ Данные очищены\n');
    }
    
    const bookingCount = createBookings();
    const recurCount = createRecurringBookings();
    
    console.log('\n✅ Данные успешно инициализированы!');
    console.log(`\n📊 Статистика:`);
    console.log(`   • Показано классов: ${db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c}`);
    console.log(`   • Занятия созданы: ${bookingCount}`);
    console.log(`   • Регулярные слоты: ${recurCount}`);
    console.log(`   • Период: сегодня + 2 дня`);
    console.log(`   • Время занятий: 09:00-18:00 (с перерывом 13:00-14:00)`);
    console.log(`\n🎵 Расписание готово!\n`);
    
} catch (err) {
    console.error('❌ Ошибка:', err.message);
    console.error(err.stack);
    process.exit(1);
}
