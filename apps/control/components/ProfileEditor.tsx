// Full profile-settings editor. Renders on /[ws]/profile. Sections:
//   1. Identity   — display name + avatar (variant + uploaded image)
//   2. Account    — email + password change
//   3. Contact + invoicing — phone, address, company, KvK, BTW-ID
//   4. Preferences — timezone + language (cookie)
//   5. Security   — login history + sign out everywhere
//
// All mutations go through server actions; optimistic refresh after.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { ALL_VARIANTS, Node } from "@aio/ui/rail/Node";

import {
  changeEmail,
  changePassword,
  listMyLoginEvents,
  signOutEverywhere,
  updateProfile,
} from "../app/actions/profile";
import { setLocale } from "../app/actions/locale";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { translate, type Locale } from "../lib/i18n/dict";

type Profile = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_letter: string | null;
  avatar_variant: string | null;
  avatar_url: string | null;
  timezone: string | null;
  is_admin: boolean | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  company_name: string | null;
  business_number: string | null;
  tax_id: string | null;
};

type Props = {
  profile: Profile;
  workspaceId: string;
  /** Used as the upload-bucket prefix so the user's avatar lives next
   *  to their workspace's other logos. */
  uploadWorkspaceId: string;
  currentLocale: "nl" | "en" | "de";
};

export function ProfileEditor({
  profile,
  uploadWorkspaceId,
  currentLocale,
}: Props) {
  const router = useRouter();

  // Tiny in-component translator. We follow the same pattern as the
  // WorkspaceShell so we don't need a global provider — the parent
  // page hands us the active locale and we look up keys directly.
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(currentLocale as Locale, key, vars);

  // ── Identity state ──────────────────────────────────────
  const [name, setName] = useState(profile.display_name ?? "");
  const [avatarVariant, setAvatarVariant] = useState(
    profile.avatar_variant ?? "orange",
  );
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityInfo, setIdentityInfo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (file: File) => {
    setIdentityError(null);
    if (file.size > 524288) {
      setIdentityError("Avatar te groot (max 512 KiB).");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setIdentityError("Alleen afbeeldingen.");
      return;
    }
    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "png";
      const path = `${uploadWorkspaceId}/avatar-${profile.id}-${Date.now()}.${safeExt}`;
      const { error } = await supabase.storage
        .from("node-logos")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) {
        setIdentityError(error.message);
        return;
      }
      const { data } = supabase.storage.from("node-logos").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  // ── Account state ───────────────────────────────────────
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<string | null>(null);

  // ── Preferences state ───────────────────────────────────
  const [timezone, setTimezone] = useState(
    profile.timezone ?? "Europe/Amsterdam",
  );
  const [locale, setLocaleState] = useState(currentLocale);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [prefInfo, setPrefInfo] = useState<string | null>(null);

  // ── Contact + invoicing state ───────────────────────────
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [addr1, setAddr1] = useState(profile.address_line1 ?? "");
  const [addr2, setAddr2] = useState(profile.address_line2 ?? "");
  const [postal, setPostal] = useState(profile.postal_code ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  const [company, setCompany] = useState(profile.company_name ?? "");
  const [bizNumber, setBizNumber] = useState(profile.business_number ?? "");
  const [taxId, setTaxId] = useState(profile.tax_id ?? "");
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactInfo, setContactInfo] = useState<string | null>(null);

  // ── Login history state ─────────────────────────────────
  type LoginRow = {
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    device_label: string | null;
    method: string;
    created_at: string;
  };
  const [loginRows, setLoginRows] = useState<LoginRow[]>([]);
  const [loginLoading, setLoginLoading] = useState(true);
  const refreshLoginEvents = () => {
    setLoginLoading(true);
    listMyLoginEvents()
      .then((res) => {
        if (res.ok) setLoginRows(res.data as LoginRow[]);
      })
      .finally(() => setLoginLoading(false));
  };
  useEffect(() => {
    refreshLoginEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pending, startTransition] = useTransition();

  const saveIdentity = () =>
    startTransition(async () => {
      setIdentityError(null);
      setIdentityInfo(null);
      const res = await updateProfile({
        display_name: name,
        avatar_variant: avatarVariant,
        avatar_url: avatarUrl || null,
      });
      if (!res.ok) setIdentityError(res.error);
      else {
        setIdentityInfo("Identiteit opgeslagen.");
        router.refresh();
      }
    });

  const savePassword = () =>
    startTransition(async () => {
      setAccountError(null);
      setAccountInfo(null);
      const res = await changePassword({ new_password: newPassword });
      if (!res.ok) setAccountError(res.error);
      else {
        setAccountInfo("Wachtwoord gewijzigd.");
        setNewPassword("");
      }
    });

  const saveEmail = () =>
    startTransition(async () => {
      setAccountError(null);
      setAccountInfo(null);
      const res = await changeEmail({ new_email: newEmail });
      if (!res.ok) setAccountError(res.error);
      else {
        setAccountInfo(
          "Bevestiging-email verstuurd naar het nieuwe adres. Check je inbox.",
        );
        setNewEmail("");
      }
    });

  const savePrefs = () =>
    startTransition(async () => {
      setPrefError(null);
      setPrefInfo(null);
      const res = await updateProfile({ timezone });
      if (!res.ok) setPrefError(res.error);
      else {
        if (locale !== currentLocale) await setLocale(locale);
        setPrefInfo("Voorkeuren opgeslagen.");
        router.refresh();
      }
    });

  const saveContact = () =>
    startTransition(async () => {
      setContactError(null);
      setContactInfo(null);
      const res = await updateProfile({
        phone,
        address_line1: addr1,
        address_line2: addr2,
        postal_code: postal,
        city,
        country,
        company_name: company,
        business_number: bizNumber,
        tax_id: taxId,
      });
      if (!res.ok) setContactError(res.error);
      else {
        setContactInfo("Contactgegevens opgeslagen.");
        router.refresh();
      }
    });

  const signOutAll = () =>
    startTransition(async () => {
      if (!confirm(t("profile.security.signOutAll.confirm"))) return;
      await signOutEverywhere();
      router.push("/login");
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Identity ─────────────────────────────────────────── */}
      <Section
        title={t("profile.section.identity")}
        desc={t("profile.section.identity.desc")}
      >
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "center" }}>
          <div>
            <Node
              variant={avatarVariant as Parameters<typeof Node>[0]["variant"]}
              logoUrl={avatarUrl || null}
              letter={
                avatarUrl ? undefined : (name || "U").slice(0, 1).toUpperCase()
              }
              size={88}
              selected
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inp}
              />
            </Field>
            <Field label="Avatar kleur">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ALL_VARIANTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAvatarVariant(v)}
                    className={`node ${v}`}
                    style={{
                      width: 28,
                      height: 28,
                      fontSize: 11,
                      outline:
                        avatarVariant === v ? "2.5px solid var(--tt-green)" : "0",
                      outlineOffset: 2,
                      cursor: "pointer",
                      ["--size" as string]: "28px",
                    }}
                  >
                    {(name || "U").slice(0, 1).toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Avatar foto (optioneel — overschrijft letter)">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickFile(f);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={btnSec}
                >
                  {uploading
                    ? "Uploaden…"
                    : avatarUrl
                      ? "Vervang"
                      : "Upload foto"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    style={btnGhost}
                  >
                    ✕ verwijder
                  </button>
                )}
                <span style={{ fontSize: 10.5, color: "var(--app-fg-3)" }}>
                  ≤ 512 KiB
                </span>
              </div>
            </Field>
          </div>
        </div>
        {identityError && <Err>{identityError}</Err>}
        {identityInfo && <Info>{identityInfo}</Info>}
        <div style={{ marginTop: 10 }}>
          <button onClick={saveIdentity} disabled={pending} style={btnPrimary(pending)}>
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </Section>

      {/* ── Account ──────────────────────────────────────────── */}
      <Section
        title={t("profile.section.account")}
        desc={t("profile.section.account.desc")}
      >
        <Field label="Huidig email">
          <input value={profile.email ?? ""} disabled style={{ ...inp, opacity: 0.6 }} />
        </Field>
        <Field label="Nieuw email (optioneel)">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              placeholder="nieuw@adres.com"
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={saveEmail}
              disabled={pending || !newEmail.trim()}
              style={btnSec}
            >
              Wissel
            </button>
          </div>
        </Field>
        <Field label="Nieuw wachtwoord (min 8 tekens)">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={savePassword}
              disabled={pending || newPassword.length < 8}
              style={btnSec}
            >
              Wijzig
            </button>
          </div>
        </Field>
        {accountError && <Err>{accountError}</Err>}
        {accountInfo && <Info>{accountInfo}</Info>}
      </Section>

      {/* ── Contact + invoicing ──────────────────────────────── */}
      <Section
        title={t("profile.section.contact")}
        desc={t("profile.section.contact.desc")}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Telefoon">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+31 6 1234 5678"
              style={inp}
              autoComplete="tel"
            />
          </Field>
          <Field label="Bedrijfsnaam">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="TrompTech"
              style={inp}
              autoComplete="organization"
            />
          </Field>
        </div>
        <Field label="Adres regel 1">
          <input
            value={addr1}
            onChange={(e) => setAddr1(e.target.value)}
            placeholder="Straat + huisnr"
            style={inp}
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Adres regel 2 (optioneel)">
          <input
            value={addr2}
            onChange={(e) => setAddr2(e.target.value)}
            placeholder="Toevoeging / unit"
            style={inp}
            autoComplete="address-line2"
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12 }}>
          <Field label="Postcode">
            <input
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="4811 AA"
              style={inp}
              autoComplete="postal-code"
            />
          </Field>
          <Field label="Stad">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Breda"
              style={inp}
              autoComplete="address-level2"
            />
          </Field>
          <Field label="Land">
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="NL"
              style={inp}
              autoComplete="country"
            />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="KvK / Business number">
            <input
              value={bizNumber}
              onChange={(e) => setBizNumber(e.target.value)}
              placeholder="12345678"
              style={inp}
            />
          </Field>
          <Field label="BTW-ID / Tax-ID">
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="NL000099998B57"
              style={inp}
            />
          </Field>
        </div>
        {contactError && <Err>{contactError}</Err>}
        {contactInfo && <Info>{contactInfo}</Info>}
        <div style={{ marginTop: 10 }}>
          <button
            onClick={saveContact}
            disabled={pending}
            style={btnPrimary(pending)}
          >
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </Section>

      {/* ── Preferences ──────────────────────────────────────── */}
      <Section
        title={t("profile.section.prefs")}
        desc={t("profile.section.prefs.desc")}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Tijdzone (IANA)">
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Amsterdam"
              style={inp}
              list="tz-suggestions"
            />
            <datalist id="tz-suggestions">
              <option value="Europe/Amsterdam" />
              <option value="Europe/London" />
              <option value="Europe/Berlin" />
              <option value="UTC" />
              <option value="America/New_York" />
              <option value="America/Los_Angeles" />
              <option value="Asia/Singapore" />
            </datalist>
          </Field>
          <Field label="Taal">
            <select
              value={locale}
              onChange={(e) =>
                setLocaleState(e.target.value as "nl" | "en" | "de")
              }
              style={inp}
            >
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </Field>
        </div>
        {prefError && <Err>{prefError}</Err>}
        {prefInfo && <Info>{prefInfo}</Info>}
        <div style={{ marginTop: 10 }}>
          <button onClick={savePrefs} disabled={pending} style={btnPrimary(pending)}>
            {pending ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </Section>

      {/* ── Login history ────────────────────────────────────── */}
      <Section
        title={t("profile.section.history")}
        desc={t("profile.section.history.desc")}
      >
        {loginLoading ? (
          <p style={{ fontSize: 12.5, color: "var(--app-fg-3)" }}>
            {t("common.loading")}
          </p>
        ) : loginRows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--app-fg-3)" }}>
            {t("profile.history.empty")}
          </p>
        ) : (
          <div
            style={{
              border: "1px solid var(--app-border-2)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <thead>
                <tr style={{ background: "var(--app-card-2)" }}>
                  <Th>{t("profile.history.col.when")}</Th>
                  <Th>{t("profile.history.col.device")}</Th>
                  <Th>{t("profile.history.col.ip")}</Th>
                  <Th>{t("profile.history.col.method")}</Th>
                </tr>
              </thead>
              <tbody>
                {loginRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderTop: "1px solid var(--app-border-2)",
                    }}
                  >
                    <Td>
                      <span title={row.created_at}>
                        {formatTimestamp(row.created_at)}
                      </span>
                    </Td>
                    <Td>
                      {row.device_label ?? (
                        <span style={{ color: "var(--app-fg-3)" }}>
                          onbekend
                        </span>
                      )}
                    </Td>
                    <Td>
                      <code
                        style={{
                          fontSize: 11.5,
                          fontFamily: "var(--mono, monospace)",
                          color: "var(--app-fg-2)",
                        }}
                      >
                        {row.ip_address ?? "—"}
                      </code>
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: "var(--app-card-2)",
                          border: "1px solid var(--app-border-2)",
                        }}
                      >
                        {row.method}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <button
            onClick={refreshLoginEvents}
            disabled={loginLoading}
            style={btnSec}
          >
            {loginLoading
              ? `${t("profile.history.refresh")}…`
              : t("profile.history.refresh")}
          </button>
        </div>
      </Section>

      {/* ── Security ─────────────────────────────────────────── */}
      <Section
        title={t("profile.section.security")}
        desc={t("profile.section.security.desc")}
      >
        <button
          onClick={signOutAll}
          disabled={pending}
          style={{
            padding: "9px 14px",
            border: "1.5px solid var(--rose)",
            background: "transparent",
            color: "var(--rose)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? t("common.busy") : t("profile.security.signOutAll")}
        </button>
      </Section>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        padding: 22,
      }}
    >
      <h3
        style={{
          fontFamily: "var(--hand)",
          fontSize: 22,
          fontWeight: 700,
          margin: "0 0 4px",
        }}
      >
        {title}
      </h3>
      {desc && (
        <p
          style={{ color: "var(--app-fg-3)", fontSize: 13, margin: "0 0 14px" }}
        >
          {desc}
        </p>
      )}
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
      <span style={{ display: "block", marginBottom: 4, color: "var(--app-fg-2)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "var(--type)",
};

const btnSec: React.CSSProperties = {
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "7px 10px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-3)",
  borderRadius: 8,
  fontSize: 11,
  cursor: "pointer",
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "9px 16px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

function Err({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        color: "var(--rose)",
        background: "rgba(230,82,107,0.08)",
        border: "1px solid rgba(230,82,107,0.4)",
        borderRadius: 8,
        padding: "8px 10px",
        margin: "10px 0 0",
        fontSize: 12.5,
      }}
    >
      {children}
    </p>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 12px",
        fontWeight: 700,
        fontSize: 11,
        color: "var(--app-fg-3)",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>{children}</td>
  );
}
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function Info({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        color: "var(--tt-green)",
        background: "rgba(57,178,85,0.08)",
        border: "1px solid var(--tt-green)",
        borderRadius: 8,
        padding: "8px 10px",
        margin: "10px 0 0",
        fontSize: 12.5,
      }}
    >
      {children}
    </p>
  );
}
