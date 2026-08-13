import bcrypt from 'bcryptjs';
import { kvGet, kvSet, kvPing, resetKVCache, hasKVConfigured } from './kv';

export interface AppSettings {
  sessionCookie: string;
  accessToken?: string;
  apiAccessKey?: string;
  adminPasswordHash?: string;
  defaultModel: string;
  rateLimitMaxRequests: number;
  rateLimitWindow: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  sessionCookie: '',
  accessToken: '',
  apiAccessKey: process.env.API_ACCESS_KEY || '',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  defaultModel: 'gpt-4o',
  rateLimitMaxRequests: 20,
  rateLimitWindow: '1 m',
};

const SETTINGS_KEY = 'app_settings';
let memoryCache: AppSettings = { ...DEFAULT_SETTINGS };
let memoryLoaded = false;

export async function getSettings(): Promise<AppSettings> {
  let settings = { ...DEFAULT_SETTINGS };

  if (process.env.CHATGPT_SESSION_COOKIE && !memoryCache.sessionCookie) {
    settings.sessionCookie = process.env.CHATGPT_SESSION_COOKIE;
  }
  if (process.env.CHATGPT_ACCESS_TOKEN && !memoryCache.accessToken) {
    settings.accessToken = process.env.CHATGPT_ACCESS_TOKEN;
  }

  try {
    const stored = await kvGet<AppSettings>(SETTINGS_KEY);
    if (stored) {
      settings = { ...settings, ...stored };
      memoryCache = settings;
      memoryLoaded = true;
      return settings;
    }
  } catch (error) {
    console.error('Error reading settings:', error);
  }

  if (memoryLoaded) {
    settings = { ...settings, ...memoryCache };
  }
  return settings;
}

export async function updateSettings(newSettings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...newSettings };
  memoryCache = updated;
  memoryLoaded = true;

  try {
    await kvSet(SETTINGS_KEY, updated);
  } catch (error) {
    console.error('Error saving settings:', error);
  }

  return updated;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.adminPasswordHash) {
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envPassword) return password === envPassword;
    if (!memoryCache.adminPasswordHash && !process.env.ADMIN_PASSWORD_HASH) {
      // أول استخدام - كلمة المرور الافتراضية
      return password === 'admin';
    }
    return false;
  }
  try {
    return bcrypt.compare(password, settings.adminPasswordHash);
  } catch {
    return false;
  }
}

export async function getStorageStatus() {
  return kvPing();
}

export function storageConfigured() {
  return hasKVConfigured();
}
