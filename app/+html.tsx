import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// 自訂網頁版 <html>：加上 PWA 設定，讓「加到主畫面」可全螢幕開啟（無網址列）。
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        {/* 全螢幕 / 隱藏網址列（加到主畫面後生效） */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="旅遊小幫手" />
        <meta name="theme-color" content="#5A7A4A" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
