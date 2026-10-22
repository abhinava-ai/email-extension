import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mail Template Vault", template: "%s · Mail Template Vault" },
  description: "Manage shared Outlook email templates for your private workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
