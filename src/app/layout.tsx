import "~/styles/globals.css";
import type { PropsWithChildren } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html className="h-full" lang="en">
      <SpeedInsights />
      <Analytics />
      <body className="font-spaceGrotesk h-full">{children}</body>
    </html>
  );
}

export const metadata = {
  title: "Goals app",
  description: "Santiago Toscanini's goals app",
};
