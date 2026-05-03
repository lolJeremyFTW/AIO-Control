import type { Metadata } from "next";
import { Caveat, Inter, Kalam, Space_Grotesk } from "next/font/google";

import "./globals.css";

const kalam = Kalam({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-kalam",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AIO Control",
  description: "The solo operator's agent command center.",
};

// Inline script that runs BEFORE React hydration so the chosen
// theme is applied immediately — no flash of dark UI when the user
// has light selected. Reads localStorage (client-side only); the
// initial server render defaults to data-theme="dark".
const themeBoot = `
try {
  var saved = localStorage.getItem('aio-theme');
  if (saved === 'light' || (!saved && window.matchMedia('(prefers-color-scheme: light)').matches)) {
    document.body.setAttribute('data-theme', saved || 'light');
    document.documentElement.style.colorScheme = saved || 'light';
  }
} catch (_) {}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body
        data-theme="dark"
        className={`${kalam.variable} ${caveat.variable} ${spaceGrotesk.variable} ${inter.variable}`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {children}
      </body>
    </html>
  );
}
