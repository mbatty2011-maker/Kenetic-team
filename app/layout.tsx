import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "knetc — Your AI executive team",
  description: "knetc gives founders and operators a full AI leadership team — CFO, CTO, Head of Sales, and General Counsel — available instantly, around the clock.",
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
