// Minimal auth layout — no rail/header. Centered card on a paper background.

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>{children}</div>
    </div>
  );
}
