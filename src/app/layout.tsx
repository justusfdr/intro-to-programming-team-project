import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app-name";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Calendar, goals and focused work in one place.",
  applicationName: APP_NAME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
