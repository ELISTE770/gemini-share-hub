<?php
/**
 * Gemini Share Hub — הגדרות מסד נתונים (Database Configuration)
 */
declare(strict_types=1);

return [
    // Database Driver: 'mysql' (מומלץ ב-cPanel) או 'sqlite'
    'driver' => 'mysql',

    // הגדרות חיבור ל-MySQL (שרת cPanel)
    'mysql' => [
        'host'     => 'localhost',
        'port'     => 3306,
        'user'     => 'eliste',
        'pass'     => 'Aa@smartbinary',
        'dbname'   => 'eliste', // המערכת תזהה אוטומטית גם eliste_gemini, eliste_eliste וכו'
        'charset'  => 'utf8mb4'
    ],

    // מסד נתונים SQLite (חלופי / מקומי)
    'sqlite' => [
        'path' => __DIR__ . '/data/gemini_share.sqlite'
    ],

    // קוד מנהל מאסטר שעובד בכל הפעולות
    'master_pin' => '1123355'
];
