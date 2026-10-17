import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Factory Interviews | AI Builder Cup",
  description: "Turn factory conversations into reviewed workflows and evidence-backed pilot decisions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
