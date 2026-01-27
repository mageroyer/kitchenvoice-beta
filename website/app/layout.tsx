import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KitchenCommand',
  description: 'Fresh prepared foods from local stores',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
