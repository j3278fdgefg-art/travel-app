import { create } from 'zustand';

export type BgVariant = 'mountain' | 'coast' | 'doodle' | 'none';

const KEY = 'app_background';

function loadBg(): BgVariant {
  try {
    const v = localStorage.getItem(KEY) as BgVariant | null;
    if (v === 'mountain' || v === 'coast' || v === 'doodle' || v === 'none') return v;
  } catch {}
  return 'mountain';
}

// 金鑰來源優先序：1) 使用者在設定頁手動輸入（localStorage）2) 建置環境變數（Vercel / .env.local）
// 金鑰不寫進原始碼，避免提交到公開 repo。
const ENV_GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';

function loadGoogleKey(): string {
  try {
    const stored = localStorage.getItem('google_maps_api_key');
    if (stored) return stored;
  } catch {}
  return ENV_GOOGLE_KEY;
}

interface SettingsState {
  background: BgVariant;
  setBackground: (b: BgVariant) => void;
  googleMapsApiKey: string;
  setGoogleMapsApiKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  background: typeof localStorage !== 'undefined' ? loadBg() : 'mountain',
  setBackground: (b) => {
    try { localStorage.setItem(KEY, b); } catch {}
    set({ background: b });
  },
  googleMapsApiKey: typeof localStorage !== 'undefined' ? loadGoogleKey() : ENV_GOOGLE_KEY,
  setGoogleMapsApiKey: (key) => {
    try { localStorage.setItem('google_maps_api_key', key); } catch {}
    set({ googleMapsApiKey: key });
  },
}));

export const BG_OPTIONS: Array<{ key: BgVariant; name: string; desc: string }> = [
  { key: 'mountain', name: '山稜層疊', desc: '沉穩、有層次' },
  { key: 'coast', name: '海岸線', desc: '清爽、海港感' },
  { key: 'doodle', name: '旅行塗鴉', desc: '活潑、手繪感' },
  { key: 'none', name: '無背景', desc: '純奶油米色（簡潔）' },
];
