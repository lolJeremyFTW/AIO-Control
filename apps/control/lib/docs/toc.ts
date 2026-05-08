// Table of contents for /docs. Single source of truth: defines all
// pages, their slugs, and titles in NL/EN/DE. The sidebar, landing
// page, prev/next navigation, and breadcrumbs all read from here.

import type { Locale } from "../i18n/dict";

export type DocLocale = Locale;

export type DocPage = {
  /** URL slug, identical across locales (e.g. "agents"). */
  slug: string;
  /** Page title per locale. */
  titles: Record<DocLocale, string>;
  /** Short description for the landing page card. */
  desc?: Record<DocLocale, string>;
};

export type DocSection = {
  id: string;
  titles: Record<DocLocale, string>;
  pages: DocPage[];
};

export const DOCS_TOC: DocSection[] = [
  {
    id: "getting-started",
    titles: {
      nl: "Aan de slag",
      en: "Getting started",
      de: "Erste Schritte",
    },
    pages: [
      {
        slug: "introduction",
        titles: {
          nl: "Introductie",
          en: "Introduction",
          de: "Einführung",
        },
        desc: {
          nl: "Wat AIO Control doet en voor wie het is.",
          en: "What AIO Control does and who it is for.",
          de: "Was AIO Control tut und für wen es gedacht ist.",
        },
      },
      {
        slug: "first-login",
        titles: {
          nl: "Eerste login",
          en: "First login",
          de: "Erste Anmeldung",
        },
        desc: {
          nl: "Account, login, onboarding wizard, eerste business.",
          en: "Account, login, onboarding wizard, first business.",
          de: "Konto, Anmeldung, Onboarding-Assistent, erste Business.",
        },
      },
      {
        slug: "concepts",
        titles: {
          nl: "Kernconcepten",
          en: "Core concepts",
          de: "Kernkonzepte",
        },
        desc: {
          nl: "Workspace, business, topic, agent, schedule, run, queue, skill.",
          en: "Workspace, business, topic, agent, schedule, run, queue, skill.",
          de: "Workspace, Business, Topic, Agent, Schedule, Run, Queue, Skill.",
        },
      },
    ],
  },
  {
    id: "interface",
    titles: {
      nl: "Interface",
      en: "Interface",
      de: "Oberfläche",
    },
    pages: [
      {
        slug: "main-screen",
        titles: {
          nl: "Het hoofdscherm",
          en: "The main screen",
          de: "Der Hauptbildschirm",
        },
        desc: {
          nl: "Rail, header, chat-paneel, runs-toaster.",
          en: "Rail, header, chat panel, runs toaster.",
          de: "Rail, Header, Chat-Panel, Runs-Toaster.",
        },
      },
      {
        slug: "workspace-dashboard",
        titles: {
          nl: "Workspace dashboard",
          en: "Workspace dashboard",
          de: "Workspace-Dashboard",
        },
      },
    ],
  },
  {
    id: "building-blocks",
    titles: {
      nl: "Bouwblokken",
      en: "Building blocks",
      de: "Bausteine",
    },
    pages: [
      {
        slug: "businesses",
        titles: { nl: "Businesses", en: "Businesses", de: "Businesses" },
      },
      {
        slug: "topics",
        titles: { nl: "Topics", en: "Topics", de: "Topics" },
      },
      {
        slug: "agents",
        titles: { nl: "Agents", en: "Agents", de: "Agenten" },
      },
    ],
  },
  {
    id: "working-with-agents",
    titles: {
      nl: "Werken met agents",
      en: "Working with agents",
      de: "Arbeiten mit Agenten",
    },
    pages: [
      {
        slug: "chat",
        titles: { nl: "Chat", en: "Chat", de: "Chat" },
      },
      {
        slug: "talk",
        titles: { nl: "Talk (voice)", en: "Talk (voice)", de: "Talk (Sprache)" },
      },
      {
        slug: "schedules",
        titles: { nl: "Schedules", en: "Schedules", de: "Schedules" },
      },
      {
        slug: "runs",
        titles: { nl: "Runs", en: "Runs", de: "Runs" },
      },
      {
        slug: "queue",
        titles: { nl: "Queue (HITL)", en: "Queue (HITL)", de: "Queue (HITL)" },
      },
    ],
  },
  {
    id: "operations",
    titles: {
      nl: "Operations",
      en: "Operations",
      de: "Betrieb",
    },
    pages: [
      {
        slug: "cost-and-limits",
        titles: {
          nl: "Cost & spend limits",
          en: "Cost & spend limits",
          de: "Kosten & Ausgabenlimits",
        },
      },
      {
        slug: "notifications",
        titles: {
          nl: "Notifications",
          en: "Notifications",
          de: "Benachrichtigungen",
        },
      },
      {
        slug: "activity-feed",
        titles: {
          nl: "Activity feed",
          en: "Activity feed",
          de: "Aktivitäts-Feed",
        },
      },
    ],
  },
  {
    id: "discovery",
    titles: {
      nl: "Ontdekken & hergebruik",
      en: "Discovery & reuse",
      de: "Entdecken & Wiederverwenden",
    },
    pages: [
      {
        slug: "marketplace",
        titles: {
          nl: "Marketplace",
          en: "Marketplace",
          de: "Marktplatz",
        },
      },
      {
        slug: "skills",
        titles: { nl: "Skills", en: "Skills", de: "Skills" },
      },
      {
        slug: "flows",
        titles: {
          nl: "AI Flow Builder",
          en: "AI Flow Builder",
          de: "AI Flow Builder",
        },
      },
      {
        slug: "self-improving",
        titles: {
          nl: "Self-Improving",
          en: "Self-Improving",
          de: "Self-Improving",
        },
      },
    ],
  },
  {
    id: "specialized",
    titles: {
      nl: "Specifieke modules",
      en: "Specialized modules",
      de: "Spezielle Module",
    },
    pages: [
      {
        slug: "outreach",
        titles: { nl: "Outreach", en: "Outreach", de: "Outreach" },
      },
    ],
  },
  {
    id: "configuration",
    titles: {
      nl: "Configuratie",
      en: "Configuration",
      de: "Konfiguration",
    },
    pages: [
      {
        slug: "settings",
        titles: {
          nl: "Settings (alle secties)",
          en: "Settings (all sections)",
          de: "Einstellungen (alle Bereiche)",
        },
      },
      {
        slug: "integrations",
        titles: {
          nl: "Integrations",
          en: "Integrations",
          de: "Integrationen",
        },
      },
    ],
  },
  {
    id: "reference",
    titles: {
      nl: "Reference",
      en: "Reference",
      de: "Referenz",
    },
    pages: [
      {
        slug: "api-and-webhooks",
        titles: {
          nl: "API & webhooks",
          en: "API & webhooks",
          de: "API & Webhooks",
        },
      },
      {
        slug: "plans",
        titles: { nl: "Plannen", en: "Plans", de: "Pläne" },
      },
      {
        slug: "shortcuts",
        titles: {
          nl: "Sneltoetsen & URLs",
          en: "Shortcuts & URLs",
          de: "Tastenkürzel & URLs",
        },
      },
      {
        slug: "faq",
        titles: { nl: "FAQ", en: "FAQ", de: "FAQ" },
      },
    ],
  },
];

/** Flatten the TOC into a list of pages in reading order. */
export function flattenPages(): Array<DocPage & { sectionId: string }> {
  const out: Array<DocPage & { sectionId: string }> = [];
  for (const section of DOCS_TOC) {
    for (const page of section.pages) {
      out.push({ ...page, sectionId: section.id });
    }
  }
  return out;
}

/** Resolve a slug to its page entry + neighbours for prev/next nav. */
export function resolvePage(slug: string): {
  page: (DocPage & { sectionId: string }) | null;
  prev: (DocPage & { sectionId: string }) | null;
  next: (DocPage & { sectionId: string }) | null;
} {
  const flat = flattenPages();
  const idx = flat.findIndex((p) => p.slug === slug);
  if (idx === -1) return { page: null, prev: null, next: null };
  return {
    page: flat[idx]!,
    prev: idx > 0 ? flat[idx - 1]! : null,
    next: idx < flat.length - 1 ? flat[idx + 1]! : null,
  };
}

/** UI strings used by the docs shell. NL is source-of-truth. */
export const DOCS_UI: Record<DocLocale, {
  brand: string;
  tagline: string;
  search: string;
  prev: string;
  next: string;
  onThisPage: string;
  edit: string;
  back: string;
  notFound: string;
  notFoundBody: string;
  langSwitch: string;
  toApp: string;
}> = {
  nl: {
    brand: "AIO Control Docs",
    tagline: "Volledige handleiding voor aio.tromptech.life",
    search: "Zoeken",
    prev: "Vorige",
    next: "Volgende",
    onThisPage: "Op deze pagina",
    edit: "Bewerk deze pagina",
    back: "Terug naar overzicht",
    notFound: "Pagina niet gevonden",
    notFoundBody:
      "Deze pagina bestaat niet (of nog niet) in deze taal. Probeer een andere taal of ga terug naar het overzicht.",
    langSwitch: "Taal",
    toApp: "Naar de app",
  },
  en: {
    brand: "AIO Control Docs",
    tagline: "Full handbook for aio.tromptech.life",
    search: "Search",
    prev: "Previous",
    next: "Next",
    onThisPage: "On this page",
    edit: "Edit this page",
    back: "Back to overview",
    notFound: "Page not found",
    notFoundBody:
      "This page does not exist (or not yet) in this language. Try another language or go back to the overview.",
    langSwitch: "Language",
    toApp: "Open the app",
  },
  de: {
    brand: "AIO Control Docs",
    tagline: "Komplettes Handbuch für aio.tromptech.life",
    search: "Suchen",
    prev: "Zurück",
    next: "Weiter",
    onThisPage: "Auf dieser Seite",
    edit: "Diese Seite bearbeiten",
    back: "Zur Übersicht",
    notFound: "Seite nicht gefunden",
    notFoundBody:
      "Diese Seite existiert (noch) nicht in dieser Sprache. Probieren Sie eine andere Sprache oder gehen Sie zurück zur Übersicht.",
    langSwitch: "Sprache",
    toApp: "Zur App",
  },
};
