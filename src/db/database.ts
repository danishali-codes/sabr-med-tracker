import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// Everything lives in one local SQLite file on the phone. No account, no server.

let db: SQLiteDatabase | null = null;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS meds (
     id TEXT PRIMARY KEY NOT NULL,
     data TEXT NOT NULL,
     archived INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS dose_log (
     slot TEXT PRIMARY KEY NOT NULL,
     med_id TEXT NOT NULL,
     date TEXT NOT NULL,
     time TEXT NOT NULL,
     status TEXT NOT NULL,
     at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS dose_log_date ON dose_log(date);
   CREATE TABLE IF NOT EXISTS day_summary (
     date TEXT PRIMARY KEY NOT NULL,
     data TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS snooze (
     grp TEXT PRIMARY KEY NOT NULL,
     until TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS purchase (
     item_id TEXT PRIMARY KEY NOT NULL,
     price INTEGER NOT NULL,
     at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS placement (
     slot_id TEXT PRIMARY KEY NOT NULL,
     item_id TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS kv (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  // How many units a "taken" log removed from stock, so Undo puts back exactly that.
  `ALTER TABLE dose_log ADD COLUMN stock_used INTEGER NOT NULL DEFAULT 0;`,
  // Mood, symptoms and a few words for a day.
  `CREATE TABLE IF NOT EXISTS day_note (
     date TEXT PRIMARY KEY NOT NULL,
     data TEXT NOT NULL
   );`,
  // How a night on a machine (CPAP...) went: hours, AHI, mask fit. One row per machine and day.
  `CREATE TABLE IF NOT EXISTS machine_night (
     med_id TEXT NOT NULL,
     date TEXT NOT NULL,
     data TEXT NOT NULL,
     PRIMARY KEY (med_id, date)
   );`,
  // Blood sugar and blood pressure readings.
  `CREATE TABLE IF NOT EXISTS reading (
     id TEXT PRIMARY KEY NOT NULL,
     date TEXT NOT NULL,
     at TEXT NOT NULL,
     data TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS reading_date ON reading (date);`,
];

export function getDb(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync('medtracker.db');
  db.execSync('PRAGMA journal_mode = WAL;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    db.withTransactionSync(() => {
      db!.execSync(MIGRATIONS[version]);
      db!.execSync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
  return db;
}
