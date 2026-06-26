import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// 自訂網頁版 <html>：加上 PWA 設定，讓「加到主畫面」可全螢幕開啟（無網址列）。
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* 鎖定縮放：手機上像 App 固定，不讓使用者放大縮小（地圖由 Google 自行接管手勢，不受影響） */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        {/* 全螢幕 / 隱藏網址列（加到主畫面後生效） */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="旅遊小幫手" />
        <meta name="theme-color" content="#5A7A4A" />
        {/* iOS Safari 會忽略 user-scalable=no，這裡擋掉雙指縮放手勢；地圖的手勢由 Google 用 touch 事件接管，已被攔截不會觸發這裡 */}
        <script dangerouslySetInnerHTML={{ __html: `
          document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, { passive: false });
          document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, { passive: false });
        ` }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
