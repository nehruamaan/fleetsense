import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Truck, FileText, Bell, User } from "lucide-react";
import { ToastProvider } from "@/components/toast/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FleetSense — Dana's Fleet",
  description: "AI-native fleet operations console for small trucking fleets.",
};

const navLinks = [
  { href: "/dispatch", label: "Dispatch", icon: Truck },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/driver", label: "Driver view", icon: User },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <ToastProvider>
          <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
              <div className="flex items-center gap-8">
                <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <Truck className="h-5 w-5" aria-hidden />
                  FleetSense
                </span>
                <nav className="flex gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  {navLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="inline-flex items-center gap-1.5 hover:text-zinc-950 dark:hover:text-zinc-50"
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Dana&apos;s Fleet
              </span>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
