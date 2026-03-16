import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "LectureLens",
  description: "Live transcript + notes scaffold"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
