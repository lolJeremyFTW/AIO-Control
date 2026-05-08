const CANONICAL_DASHBOARD_ORIGIN = "https://aio.tromptech.life";

function dashboardEnvOrigin(): string | undefined {
  return (
    process.env.AIO_DASHBOARD_ORIGIN ??
    process.env.NEXT_PUBLIC_DASHBOARD_ORIGIN ??
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN
  );
}

export function dashboardOrigin(value?: string | null): string {
  const raw = (value || dashboardEnvOrigin() || CANONICAL_DASHBOARD_ORIGIN)
    .trim()
    .replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    const pathname = url.pathname || "/";
    if (
      url.hostname === "tromptech.life" &&
      (pathname === "/" || pathname === "/aio")
    ) {
      return CANONICAL_DASHBOARD_ORIGIN;
    }
    return url.origin + (pathname === "/" ? "" : pathname);
  } catch {
    return CANONICAL_DASHBOARD_ORIGIN;
  }
}

export function normalizeDashboardUrl(
  value: string,
  origin = dashboardOrigin(),
): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.startsWith("/d/")) return `${origin}${trimmed}`;
  if (trimmed.startsWith("/aio/d/")) return `${origin}${trimmed.slice(4)}`;

  try {
    const url = new URL(trimmed);
    const dashboardPath = url.pathname.startsWith("/aio/d/")
      ? url.pathname.slice(4)
      : url.pathname;
    if (dashboardPath.startsWith("/d/")) {
      return `${origin}${dashboardPath}${url.search}${url.hash}`;
    }
  } catch {
    // Keep malformed legacy rows untouched; callers may still surface them.
  }

  return value;
}

export function normalizeDashboardLinks(value: string): string {
  return value
    .replace(
      /https:\/\/tromptech\.life\/aio\/d\//g,
      `${CANONICAL_DASHBOARD_ORIGIN}/d/`,
    )
    .replace(
      /https:\/\/tromptech\.life\/d\//g,
      `${CANONICAL_DASHBOARD_ORIGIN}/d/`,
    );
}
