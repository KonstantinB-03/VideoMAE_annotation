import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoMAE CCTV Annotation Studio',
  description: 'High-speed CCTV video frame preparation and behavior annotation for VideoMAE v2',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-slate-100 min-h-screen flex flex-col antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
