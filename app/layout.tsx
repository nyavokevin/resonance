import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LOCALE_COOKIE, dictionaries, isLocale } from "@/lib/i18n/dictionaries";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(raw) ? raw : "fr";
    const t = dictionaries[locale];
    return {
      title: t.layout.title,
      description: t.layout.description,
      icons: { icon: "/logo.png", apple: "/logo.png" },
    };
  } catch {
    return {
      title: "Resonance — Lecteur multi-plateformes",
      description: "Lecteur de musique multi-plateformes",
      icons: { icon: "/logo.png", apple: "/logo.png" },
    };
  }
}

export const viewport: Viewport = {
  themeColor: "#1E1F22",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let lang = "fr";
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    if (isLocale(raw)) lang = raw;
  } catch {
    /* ignore */
  }
  return (
    <html
      lang={lang}
      className={`${inter.variable} ${jakarta.variable} antialiased`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-base text-ink-soft select-none text-[13px] leading-relaxed" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
