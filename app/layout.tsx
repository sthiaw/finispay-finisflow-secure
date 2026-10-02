import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FinisPay × FinisFlow", description: "One secure account for payments and shelf-life intelligence." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
