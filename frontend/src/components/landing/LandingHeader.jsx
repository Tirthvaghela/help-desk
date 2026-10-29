import styles from "./Landing.module.css";
import { NAV_LINKS } from "./landingContent.js";
import { LandingLink } from "./landingIcons.jsx";
import { useLandingLinks } from "./useLandingLinks.js";

export function LogoMark({ className = "" }) {
  return (
    <span aria-hidden="true" className={`${styles.logoMark} ${className}`}>
      <span />
    </span>
  );
}

// Sticky header: logo, section links (960px and wider), sign-in actions.
export default function LandingHeader() {
  const links = useLandingLinks();

  return (
    <header className={styles.header}>
      <a href="#top" className={`${styles.logo} ${styles.glass}`}>
        <LogoMark />
        <span className={styles.logoText}>Help Desk</span>
      </a>

      <nav aria-label="Sections" className={`${styles.centerNav} ${styles.glass}`}>
        {NAV_LINKS.map((item) => (
          <a key={item.href} href={item.href} className={styles.navLink}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className={`${styles.actions} ${styles.glass}`}>
        {links.headerSecondary && (
          <LandingLink link={links.headerSecondary} className={styles.actionLink}>
            Sign in
          </LandingLink>
        )}
        <LandingLink link={links.headerPrimary} className={styles.actionPrimary}>
          Get started
        </LandingLink>
      </div>
    </header>
  );
}
