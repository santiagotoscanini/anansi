"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
          <h1>Something went wrong</h1>
          <button onClick={reset} style={{ marginTop: "1rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
