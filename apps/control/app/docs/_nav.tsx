import Link from "next/link";

import { docsNav } from "./_content";
import styles from "./docs.module.css";

export function DocsNav({ activeHref }: { activeHref: string }) {
  return (
    <nav className={styles.nav} aria-label="Documentation">
      <Link className={styles.brand} href="/docs">
        <span className={styles.brandMark}>A</span>
        <span>AIO Control Docs</span>
      </Link>
      <div className={styles.navLinks}>
        {docsNav.map((item) => (
          <Link
            className={item.href === activeHref ? styles.active : undefined}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
