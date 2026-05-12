import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '야장관리자',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
