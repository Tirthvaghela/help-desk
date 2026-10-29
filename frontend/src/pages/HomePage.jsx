import styles from "../components/landing/Landing.module.css";
import { FINAL_CTA, HERO, NAV_LINKS, STEPS } from "../components/landing/landingContent.js";
import { ArrowRightIcon, LandingLink } from "../components/landing/landingIcons.jsx";
import LandingHeader, { LogoMark } from "../components/landing/LandingHeader.jsx";
import ProductPreview from "../components/landing/ProductPreview.jsx";
import RolesSection from "../components/landing/RolesSection.jsx";
import LifecycleSection from "../components/landing/LifecycleSection.jsx";
import FaqSection from "../components/landing/FaqSection.jsx";
import { useLandingLinks } from "../components/landing/useLandingLinks.js";

// Public landing page (design: "Help Desk Landing"). Copy and sample data live in
// landingContent.js; links adapt to who is signed in (useLandingLinks), and the protected
// pages still check access themselves.
export default function HomePage() {
  const links = useLandingLinks();

  return (
    <div id="top" className={styles.page}>
      <div className={styles.container}>
        <LandingHeader />

        <main className={styles.main}>
          <div>
            <section aria-labelledby="hero-heading" className={styles.hero}>
              <span className={`${styles.eyebrowPill} ${styles.glass}`}>
                <span aria-hidden="true" className={styles.pulseDot} />
                {HERO.eyebrow}
              </span>
              <h1 id="hero-heading" className={styles.heroTitle}>{HERO.title}</h1>
              <p className={styles.heroText}>{HERO.text}</p>
              <div className={styles.heroButtons}>
                <LandingLink link={links.openTicket} className={styles.btnPrimary}>
                  {HERO.primary}
                  <ArrowRightIcon />
                </LandingLink>
                <a href="#roles" className={styles.btnGlass}>{HERO.secondary}</a>
              </div>
            </section>
            <ProductPreview />
          </div>

          <section id="how" aria-labelledby="how-heading" className={styles.how}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>{STEPS.eyebrow}</span>
              <h2 id="how-heading" className={styles.h2}>{STEPS.title}</h2>
            </div>
            <ol className={styles.stepGrid}>
              {STEPS.items.map((step) => (
                <li key={step.n} className={`${styles.stepCard} ${styles.glass}`}>
                  <span
                    aria-hidden="true"
                    className={`${styles.stepTile} ${styles.mono}`}
                    style={{ background: step.tile[0], color: step.tile[1] }}
                  >
                    {step.n}
                  </span>
                  <div className={styles.stepBody}>
                    <h3 className={styles.stepTitle}>
                      <span className={styles.srOnly}>Step {step.n}: </span>
                      {step.title}
                    </h3>
                    <p className={styles.stepText}>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <RolesSection />
          <LifecycleSection />
          <FaqSection />

          <section aria-labelledby="final-heading" className={styles.finalCta}>
            <span aria-hidden="true" className={styles.finalGlow} />
            <LogoMark className={styles.finalMark} />
            <h2 id="final-heading" className={styles.finalTitle}>{FINAL_CTA.title}</h2>
            <p className={styles.finalText}>{FINAL_CTA.text}</p>
            <div className={styles.finalButtons}>
              <LandingLink link={links.finalPrimary} className={styles.btnPrimary}>
                {FINAL_CTA.primary}
              </LandingLink>
              {links.finalSecondary && (
                <LandingLink link={links.finalSecondary} className={styles.btnSoft}>
                  {FINAL_CTA.secondary}
                </LandingLink>
              )}
            </div>
          </section>

        </main>

        <footer className={styles.footer}>
          <span className={styles.footerBrand}>
            <LogoMark className={styles.footerMark} />
            Help Desk
          </span>
          <nav aria-label="Footer">
            <ul className={styles.footerLinks}>
              {NAV_LINKS.filter((item) => item.href !== "#lifecycle").map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
              <li>
                <LandingLink link={links.footerSignIn}>Sign in</LandingLink>
              </li>
            </ul>
          </nav>
          <span className={`${styles.mono} ${styles.copyright}`}>© {new Date().getFullYear()} Help Desk</span>
        </footer>
      </div>
    </div>
  );
}
