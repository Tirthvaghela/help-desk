import { useState } from "react";
import styles from "./Landing.module.css";
import { LIFECYCLE, STATUS } from "./landingContent.js";

// Three selectable stage cards. Each bar is filled up to and including the selected stage.
export default function LifecycleSection() {
  const [selected, setSelected] = useState(LIFECYCLE.defaultStage);

  return (
    <section id="lifecycle" aria-labelledby="lifecycle-heading" className={styles.lifecycle}>
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>{LIFECYCLE.eyebrow}</span>
        <h2 id="lifecycle-heading" className={styles.h2}>{LIFECYCLE.title}</h2>
        <p className={styles.sectionText}>{LIFECYCLE.text}</p>
      </div>

      <div className={`${styles.stageBox} ${styles.glass}`}>
        {LIFECYCLE.stages.map((stage, index) => {
          const active = index === selected;
          const colour = STATUS[stage.label][2];
          return (
            <button
              key={stage.label}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(index)}
              className={`${styles.stage} ${active ? styles.stageActive : ""}`}
            >
              <span className={styles.stageTop}>
                <span aria-hidden="true" className={styles.stageDot} style={{ background: colour }} />
                <span className={styles.stageLabel}>{stage.label}</span>
                <span className={`${styles.mono} ${styles.stageNumber}`}>0{index + 1}</span>
              </span>
              <span
                aria-hidden="true"
                className={styles.stageBar}
                style={{ background: index <= selected ? colour : "#e3e9ec" }}
              />
              <span className={styles.stageText}>{stage.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
