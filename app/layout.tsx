import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "중간지점 찾기",
  description: "Find the midpoint between multiple places",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tmapKey = process.env.NEXT_PUBLIC_TMAP_APP_KEY;

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 
          TMAP JS v2 SDK는 내부에서 document.write()를 사용합니다.
          Next.js의 비동기 Script 주입과 충돌하므로, 초기 HTML에 동기 script로 삽입합니다.
        */}
        {tmapKey ? (
          // eslint-disable-next-line @next/next/no-sync-scripts -- TMAP JS v2는 document.write 기반이라 동기 로드 필요
          <script
            src={`https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${tmapKey}`}
          />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
