// Tiny "bel aan / bel uit" component that registers the service worker,
// asks for Notification permission, subscribes via PushManager, and
// uploads the result to /api/push/subscribe. Lives in Settings — the
// rail bell stays informational for now.

"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "unsupported" | "off" | "on" | "denied" | "no-vapid";

function urlBase64ToUint8Array(b64: string) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const keyRes = await fetch(`${base}/api/push/key`).catch(() => null);
      if (!keyRes || keyRes.status === 503) {
        setStatus("no-vapid");
        return;
      }
      // The SW lives under the same basePath the app does. Scope MUST start
      // at or above the SW URL — `${base}/` covers everything served at
      // /aio/* (and falls back to "/" when there's no basePath).
      const reg = await navigator.serviceWorker.register(`${base}/sw.js`, {
        scope: `${base}/`,
      });
      const existing = await reg.pushManager.getSubscription();
      if (existing) setStatus("on");
      else if (Notification.permission === "denied") setStatus("denied");
      else setStatus("off");
    })().catch((err) => {
      setError(err instanceof Error ? err.message : "init failed");
    });
  }, []);

  const apiUrl = (path: string) =>
    (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + path;

  const subscribe = async () => {
    try {
      setError(null);

      // 1. Ask for OS-level notification permission FIRST. Chrome on
      //    desktop will otherwise throw "Registration failed -
      //    permission denied" when pushManager.subscribe is called
      //    before the user has been prompted. Calling this from inside
      //    a click handler keeps it as a valid user-gesture.
      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          setStatus(result === "denied" ? "denied" : "off");
          setError(
            result === "denied"
              ? "Toestemming geweigerd. Sta toe via het slot-icoon links van het adres en probeer opnieuw."
              : "Toestemming nog niet gegeven.",
          );
          return;
        }
      } else if (Notification.permission === "denied") {
        setStatus("denied");
        setError(
          "Notificaties zijn geblokkeerd door de browser. Sta toe via het slot-icoon links van het adres.",
        );
        return;
      }

      // 2. Get the VAPID public key so the push service knows which
      //    server is sending pushes.
      const keyRes = await fetch(apiUrl("/api/push/key"));
      if (!keyRes.ok) throw new Error("VAPID key endpoint gaf " + keyRes.status);
      const { key } = (await keyRes.json()) as { key: string };

      // 3. Register the SW (idempotent — re-running is fine).
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      await navigator.serviceWorker.register(`${base}/sw.js`, {
        scope: `${base}/`,
      });
      const reg = await navigator.serviceWorker.ready;

      // 4. Subscribe to push. If a stale subscription exists from a
      //    previous VAPID key, drop it first — pushManager refuses to
      //    re-subscribe with a different applicationServerKey.
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      // 5. Persist on the server so it can fan out push events to us.
      const json = sub.toJSON();
      const res = await fetch(apiUrl("/api/push/subscribe"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("on");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "subscribe failed";
      // Translate common browser errors into something actionable.
      if (/permission denied/i.test(msg)) {
        setStatus("denied");
        setError(
          "Browser blokkeerde de subscription. Check OS-instellingen: " +
            "macOS → Systeem → Meldingen → Chrome (of jouw browser) op AAN. " +
            "Op Windows: Instellingen → Systeem → Meldingen → Chrome aan.",
        );
      } else {
        setError(msg);
      }
    }
  };

  const unsubscribe = async () => {
    try {
      setError(null);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          apiUrl(
            `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          ),
          { method: "DELETE" },
        );
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "unsubscribe failed");
    }
  };

  const sendTest = async () => {
    setError(null);
    const res = await fetch(apiUrl("/api/push/test"), { method: "POST" });
    if (!res.ok) setError(await res.text());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Status status={status} />
      <div style={{ display: "flex", gap: 8 }}>
        {status === "off" && <Btn onClick={subscribe} primary>Notificaties aanzetten</Btn>}
        {status === "on" && (
          <>
            <Btn onClick={sendTest} primary>Stuur test</Btn>
            <Btn onClick={unsubscribe}>Uitzetten</Btn>
          </>
        )}
      </div>
      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12 }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Status({ status }: { status: Status }) {
  const text =
    status === "loading"
      ? "Laden…"
      : status === "unsupported"
        ? "Deze browser ondersteunt geen Web Push."
        : status === "no-vapid"
          ? "Server heeft nog geen VAPID-keys. Vul VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in .env.production."
          : status === "denied"
            ? "Notificaties zijn geblokkeerd door de browser. Sta toe via de slot-icoon links van het adres."
            : status === "on"
              ? "Notificaties staan AAN voor dit apparaat."
              : "Notificaties uit. Klik om aan te zetten.";
  return <p style={{ fontSize: 12.5, color: "var(--app-fg-3)", margin: 0 }}>{text}</p>;
}

function Btn({
  onClick,
  primary,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        border: `1.5px solid ${primary ? "var(--tt-green)" : "var(--app-border)"}`,
        background: primary ? "var(--tt-green)" : "var(--app-card-2)",
        color: primary ? "#fff" : "var(--app-fg)",
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 12.5,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
