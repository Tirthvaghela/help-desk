import { useRef, useState } from "react";
import styles from "./Landing.module.css";
import { ROLES, STATUS } from "./landingContent.js";
import { CheckIcon, LandingLink } from "./landingIcons.jsx";
import { useLandingLinks } from "./useLandingLinks.js";

const ROLE_NAMES = Object.keys(ROLES.tabs);
const tabId = (role) => `role-tab-${role.toLowerCase()}`;

// Dark "For your team" section: a tab per role, each with a lead, bullets, a call to action
// and a sample panel. Tabs follow the WAI-ARIA pattern (arrow keys, Home/End).
export default function RolesSection() {
  const links = useLandingLinks();
  const [active, setActive] = useState(ROLES.defaultRole);
  const tabRefs = useRef({});
  const role = ROLES.tabs[active];
  const cta = active === "Customer" ? links.openTicket : links.staffArea;

  const handleKeyDown = (event) => {
    const index = ROLE_NAMES.indexOf(active);
    const next = {
      ArrowRight: ROLE_NAMES[(index + 1) % ROLE_NAMES.length],
      ArrowLeft: ROLE_NAMES[(index - 1 + ROLE_NAMES.length) % ROLE_NAMES.length],
      Home: ROLE_NAMES[0],
      End: ROLE_NAMES[ROLE_NAMES.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="roles" aria-labelledby="roles-heading" className={styles.roles}>
      <span aria-hidden="true" className={styles.rolesGlow} />

      <div className={styles.rolesTop}>
        <div className={styles.sectionHead}>
          <span className={`${styles.eyebrow} ${styles.eyebrowDark}`}>{ROLES.eyebrow}</span>
          <h2 id="roles-heading" className={styles.h2}>{ROLES.title}</h2>
        </div>

        <div role="tablist" aria-label="Roles" className={styles.tabs} onKeyDown={handleKeyDown}>
          {ROLE_NAMES.map((name) => {
            const selected = name === active;
            return (
              <button
                key={name}
                ref={(node) => { tabRefs.current[name] = node; }}
                id={tabId(name)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="role-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(name)}
                className={`${styles.tab} ${selected ? styles.tabActive : ""}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      <div id="role-panel" role="tabpanel" aria-labelledby={tabId(active)} className={styles.rolesBody}>
        <div className={styles.rolesCopy}>
          <p className={styles.rolesLead}>{role.lead}</p>
          <ul className={styles.points}>
            {role.points.map((point) => (
              <li key={point} className={styles.point}>
                <span className={styles.pointCheck}><CheckIcon /></span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <LandingLink link={cta} className={styles.mintCta}>
            {role.cta}
          </LandingLink>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>{role.panelTitle}</span>
            <span className={`${styles.mono} ${styles.metaText}`}>{role.panelMeta}</span>
          </div>
          {role.stats && (
            <div className={styles.stats}>
              {role.stats.map(([label, value]) => (
                <div key={label} className={styles.stat}>
                  <span className={styles.statLabel}>{label}</span>
                  <span className={styles.statValue}>{value}</span>
                </div>
              ))}
            </div>
          )}
          <ul className={styles.rows}>
            {role.rows.map(([id, title, status]) => (
              <li key={id} className={styles.row}>
                <span className={`${styles.mono} ${styles.rowId}`}>{id}</span>
                <span className={`${styles.rowTitle} ${styles.ellipsis}`}>{title}</span>
                <span className={styles.rowTag} style={{ background: STATUS[status][0], color: STATUS[status][1] }}>
                  {status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
