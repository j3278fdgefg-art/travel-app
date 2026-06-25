import { Platform } from 'react-native';
import { BgVariant } from '../store/settingsStore';

// 各背景的 SVG 內容（依「背景設計.dc.html」）。低彩度、低 opacity，確保卡片與文字清晰。
const MOUNTAIN = `
  <circle cx="312" cy="96" r="40" fill="#EBC76A" opacity="0.28"/>
  <circle cx="312" cy="96" r="40" fill="none" stroke="#D9B65A" stroke-width="1.5" opacity="0.35"/>
  <path d="M70 120 q9 -8 18 0 q9 -8 18 0" fill="none" stroke="#5A7A4A" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <path d="M110 150 q7 -6 14 0 q7 -6 14 0" fill="none" stroke="#5A7A4A" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <path d="M0 560 Q70 470 150 520 Q240 580 320 500 Q360 462 390 492 L390 720 L0 720 Z" fill="#CBD8BC" opacity="0.55"/>
  <path d="M0 620 Q90 540 180 588 Q270 636 360 560 Q378 545 390 556 L390 720 L0 720 Z" fill="#A8BE92" opacity="0.6"/>
  <path d="M0 678 Q100 610 210 660 Q300 700 390 644 L390 720 L0 720 Z" fill="#7C9A6B" opacity="0.55"/>
  <path d="M0 560 Q70 470 150 520 Q240 580 320 500 Q360 462 390 492" fill="none" stroke="#5A7A4A" stroke-width="1.5" opacity="0.25"/>
`;

const COAST = `
  <circle cx="300" cy="430" r="34" fill="#E9C36A" opacity="0.3"/>
  <path d="M285 470 h30 M280 482 h40 M288 494 h24" stroke="#E0B85C" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <path d="M80 360 q8 -7 16 0 q8 -7 16 0" fill="none" stroke="#5A7A4A" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <path d="M120 388 q6 -5 12 0 q6 -5 12 0" fill="none" stroke="#5A7A4A" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <g opacity="0.4" stroke="#5A7A4A" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M150 452 l0 -42 l30 32 z" fill="#CBD8BC"/>
    <path d="M150 410 l-22 42 l44 0"/>
  </g>
  <rect x="0" y="500" width="390" height="220" fill="#C7D7DE" opacity="0.45"/>
  <path d="M0 500 H390" stroke="#A9C0C9" stroke-width="2" opacity="0.5"/>
  <path d="M0 540 q40 -10 80 0 q40 10 80 0 q40 -10 80 0 q40 10 80 0 q40 -10 80 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  <path d="M0 580 q40 -10 80 0 q40 10 80 0 q40 -10 80 0 q40 10 80 0 q40 -10 80 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <path d="M0 622 q40 -10 80 0 q40 10 80 0 q40 -10 80 0 q40 10 80 0 q40 -10 80 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.32"/>
  <path d="M0 664 q40 -10 80 0 q40 10 80 0 q40 -10 80 0 q40 10 80 0 q40 -10 80 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.26"/>
`;

const DOODLE = `
  <g fill="none" stroke="#7C9A6B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">
    <g transform="translate(50,70) rotate(-20)"><path d="M0 6 l24 -4 l8 -8 l4 0 l-4 10 l12 -1 l5 -5 l3 0 l-2 7 l2 7 l-3 0 l-5 -5 l-12 -1 l4 10 l-4 0 l-8 -8 z"/></g>
    <g transform="translate(300,120)"><circle cx="0" cy="0" r="16"/><path d="M-6 6 L2 -2 L6 -6 L-2 2 Z" fill="#7C9A6B" stroke="none"/></g>
    <g transform="translate(120,210)"><path d="M0 18 l14 -22 l9 12 l7 -9 l12 19 z"/></g>
    <g transform="translate(310,260)"><path d="M0 0 C-9 0 -9 -12 0 -20 C9 -12 9 0 0 0 Z"/><circle cx="0" cy="-12" r="3" fill="#7C9A6B" stroke="none"/></g>
    <g transform="translate(55,300)"><rect x="0" y="4" width="34" height="22" rx="4"/><path d="M11 4 l3 -5 l6 0 l3 5"/><circle cx="17" cy="15" r="6"/></g>
    <g transform="translate(250,360)"><path d="M0 0 q8 -8 16 0 q8 8 16 0 q8 -8 16 0"/></g>
    <g transform="translate(140,400)"><path d="M0 24 C0 10 2 0 2 0 M2 4 C-6 0 -12 2 -16 8 M2 8 C-4 6 -10 9 -13 14 M2 6 C8 2 14 4 18 9 M2 10 C7 8 12 11 15 16"/></g>
    <g transform="translate(312,420)"><path d="M0 0 a12 14 0 1 1 0.01 0 Z M-5 13 l4 6 l4 0 l4 -6 M-4 17 l8 0"/></g>
    <g transform="translate(45,470)"><path d="M0 4 l30 0 a3 3 0 0 0 3 3 a3 3 0 0 0 -3 3 l-30 0 a3 3 0 0 0 -3 -3 a3 3 0 0 0 3 -3 Z"/></g>
    <g transform="translate(230,500)"><path d="M0 18 l12 -20 l10 13 l8 -8 l10 15 z"/></g>
    <g transform="translate(120,540)"><circle cx="0" cy="0" r="14"/><path d="M-5 5 L2 -2 L5 -5 L-2 2 Z" fill="#7C9A6B" stroke="none"/></g>
    <g transform="translate(300,580) rotate(15)"><path d="M0 6 l24 -4 l8 -8 l4 0 l-4 10 l12 -1 l5 -5 l3 0 l-2 7 l2 7 l-3 0 l-5 -5 l-12 -1 l4 10 l-4 0 l-8 -8 z"/></g>
    <g transform="translate(60,620)"><path d="M0 0 C-9 0 -9 -12 0 -20 C9 -12 9 0 0 0 Z"/><circle cx="0" cy="-12" r="3" fill="#7C9A6B" stroke="none"/></g>
    <g transform="translate(180,650)"><circle cx="0" cy="0" r="9"/><path d="M0 -15 v4 M0 11 v4 M-15 0 h4 M11 0 h4 M-11 -11 l3 3 M8 8 l3 3 M11 -11 l-3 3 M-8 8 l-3 3"/></g>
  </g>
`;

const SVGS: Record<Exclude<BgVariant, 'none'>, { body: string; opacity: number }> = {
  mountain: { body: MOUNTAIN, opacity: 1 },
  coast: { body: COAST, opacity: 1 },
  doodle: { body: DOODLE, opacity: 0.5 },
};

/** 共用背景圖層：放在頁面容器最上層（content 之前），絕對定位鋪滿、不攔截點擊。 */
export function PageBackground({ variant }: { variant: BgVariant }) {
  if (Platform.OS !== 'web' || variant === 'none') return null;
  const svg = SVGS[variant];
  const html = `<svg viewBox="0 0 390 720" preserveAspectRatio="xMidYMax slice" style="position:absolute;inset:0;width:100%;height:100%;opacity:${svg.opacity}">${svg.body}</svg>`;
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
