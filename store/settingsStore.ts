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

function loadKakaoKey(): string {
  try {
    return localStorage.getItem('kakao_app_key') || '';
  } catch {}
  return '';
}

interface SettingsState {
  background: BgVariant;
  setBackground: (b: BgVariant) => void;
  kakaoAppKey: string;
  setKakaoAppKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  background: typeof localStorage !== 'undefined' ? loadBg() : 'mountain',
  setBackground: (b) => {
    try { localStorage.setItem(KEY, b); } catch {}
    set({ background: b });
  },
  kakaoAppKey: typeof localStorage !== 'undefined' ? loadKakaoKey() : '',
  setKakaoAppKey: (key) => {
    try { localStorage.setItem('kakao_app_key', key); } catch {}
    set({ kakaoAppKey: key });
  },
}));

export const BG_OPTIONS: Array<{ key: BgVariant; name: string; desc: string }> = [
  { key: 'mountain', name: '山稜層疊', desc: '沉穩、有層次' },
  { key: 'coast', name: '海岸線', desc: '清爽、海港感' },
  { key: 'doodle', name: '旅行塗鴉', desc: '活潑、手繪感' },
  { key: 'none', name: '無背景', desc: '純奶油米色（簡潔）' },
];
