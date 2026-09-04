import type { Metadata } from 'next';
import { Cinzel, Geist, Geist_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'TCG Scout — Market Intelligence',
    template: '%s · TCG Scout',
  },
  description:
    'A conservative acquisition underwriter for trading-card listings, collections, releases and inventory.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${cinzel.variable}`}
    >
      <body className="antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
