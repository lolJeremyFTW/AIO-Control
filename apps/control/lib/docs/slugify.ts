// Heading-anchor slugifier for the docs markdown renderer. Stable,
// pure, no side-effects. Mirrors how GitHub turns "## Foo bar?" into
// "#foo-bar" so links survive a switch to standard tooling later.

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
