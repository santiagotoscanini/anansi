import "~/styles/globals.css";
import type { PropsWithChildren } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html className="h-full" lang="en">
      {/* https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons */}
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" href="/icon?<generated>" type="image/<generated>" sizes="<generated>" />
      <link rel="apple-touch-icon" href="/apple-icon?<generated>" type="image/<generated>" sizes="<generated>" />

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
