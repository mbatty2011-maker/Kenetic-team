import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LineSkip Virtual Team",
  description: "Your AI-powered virtual team for LineSkip",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
