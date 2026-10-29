import { useState } from "react";
import styles from "./Landing.module.css";
import { FAQ } from "./landingContent.js";
import { PlusIcon } from "./landingIcons.jsx";

// Accordion: at most one answer open; the first is open by default, and clicking the open
// question closes it.
export default function FaqSection() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" aria-labelledby="faq-heading" className={styles.faq}>
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>{FAQ.eyebrow}</span>
        <h2 id="faq-heading" className={styles.h2}>{FAQ.title}</h2>
      </div>

      <div className={styles.faqList}>
        {FAQ.items.map((item, index) => {
          const expanded = open === index;
          return (
            <div key={item.q} className={styles.faqItem}>
              <h3>
                <button
                  type="button"
                  id={`faq-q-${index}`}
                  aria-expanded={expanded}
                  aria-controls={`faq-a-${index}`}
                  onClick={() => setOpen(expanded ? -1 : index)}
                  className={styles.faqButton}
                >
                  <span>{item.q}</span>
                  <span className={`${styles.faqIcon} ${expanded ? styles.faqIconOpen : ""}`}>
                    <PlusIcon />
                  </span>
                </button>
              </h3>
              <p
                id={`faq-a-${index}`}
                role="region"
                aria-labelledby={`faq-q-${index}`}
                hidden={!expanded}
                className={styles.faqAnswer}
              >
                {item.a}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
