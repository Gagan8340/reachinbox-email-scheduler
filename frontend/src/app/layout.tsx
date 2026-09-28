import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppDataProvider } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReachInbox | Campaign Workspace",
  description: "Compose, schedule, and monitor outbound email campaigns.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppDataProvider>{children}</AppDataProvider>
      </body>
    </html>
  );
}
