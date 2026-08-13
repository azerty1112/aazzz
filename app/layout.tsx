import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatGPT Proxy',
  description: 'واجهة للتعامل مع ChatGPT عبر Vercel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
