import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';

function isDateInPeriod(date, startMonth, startDay, endMonth, endDay) {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (startMonth <= endMonth) {
    if (month < startMonth || month > endMonth) return false;
    if (month === startMonth && day < startDay) return false;
    if (month === endMonth && day > endDay) return false;
    return true;
  } else {
    if (month >= startMonth) {
      if (month === startMonth && day < startDay) return false;
      return true;
    }
    if (month <= endMonth) {
      if (month === endMonth && day > endDay) return false;
      return true;
    }
    return false;
  }
}

function getActiveThemeId(date = new Date()) {
  const valentines = { id: 'valentines', startMonth: 2, startDay: 13, endMonth: 2, endDay: 14 };
  const christmas = { id: 'christmas', startMonth: 12, startDay: 1, endMonth: 1, endDay: 1 };
  const stpatrick = { id: 'stpatrick', startMonth: 3, startDay: 17, endMonth: 3, endDay: 17 };

  if (isDateInPeriod(date, valentines.startMonth, valentines.startDay, valentines.endMonth, valentines.endDay)) return valentines.id;
  if (isDateInPeriod(date, christmas.startMonth, christmas.startDay, christmas.endMonth, christmas.endDay)) return christmas.id;
  if (isDateInPeriod(date, stpatrick.startMonth, stpatrick.startDay, stpatrick.endMonth, stpatrick.endDay)) return stpatrick.id;
  return null;
}

function ensureTmpDir(base) {
  const dir = path.join(base, '..', 'tmp');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
  return dir;
}

export function initializeThemePublisher() {
  console.log('⏰ [Cron] Initializing Theme Publisher (daily @ 00:00 server time)');

  const base = path.resolve(path.join(new URL(import.meta.url).pathname, '..'));
  const tmpDir = ensureTmpDir(base);
  const outPath = path.join(tmpDir, 'current_theme.json');

  const publish = () => {
    try {
      const now = new Date();
      const active = getActiveThemeId(now);
      const payload = { activeTheme: active, updatedAt: now.toISOString() };
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log('✅ [ThemePublisher] Wrote current theme:', payload);
    } catch (err) {
      console.error('❌ [ThemePublisher] Failed to write theme payload:', err?.message || err);
    }
  };

  // Run once at startup to ensure file exists
  publish();

  // Schedule at midnight server time every day
  cron.schedule('0 0 * * *', () => {
    console.log('⏰ [Cron] Theme Publisher triggered at midnight');
    publish();
  });
}

export function readPublishedTheme() {
  try {
    const base = path.resolve(path.join(new URL(import.meta.url).pathname, '..'));
    const outPath = path.join(base, '..', 'tmp', 'current_theme.json');
    if (!fs.existsSync(outPath)) return null;
    const raw = fs.readFileSync(outPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
