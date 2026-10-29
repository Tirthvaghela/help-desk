import styles from "./Landing.module.css";
import { PREVIEW, STATUS } from "./landingContent.js";
import { CheckIcon } from "./landingIcons.jsx";

const colours = (pair) => ({ background: pair[0], color: pair[1] });

// Static mock of the agent inbox and a ticket conversation, built in HTML/CSS. It is an
// illustration with sample data, so assistive technology gets a one-line description instead.
export default function ProductPreview() {
  const { ticket } = PREVIEW;

  return (
    <div className={styles.previewWrap}>
      <div
        role="img"
        aria-label="Preview of the Help Desk agent inbox and a ticket conversation, with sample tickets"
        className={styles.previewFrame}
      >
        <div className={styles.previewCard}>
          <div className={styles.inbox}>
            <div className={styles.inboxHead}>
              <span className={styles.inboxTitle}>Inbox</span>
              <span className={`${styles.mono} ${styles.metaText}`}>{PREVIEW.inboxCount}</span>
            </div>
            <div className={styles.filters}>
              {PREVIEW.filters.map((filter, index) => (
                <span key={filter} className={`${styles.filter} ${index === 0 ? styles.filterActive : ""}`}>
                  {filter}
                </span>
              ))}
            </div>
            {PREVIEW.inbox.map((row, index) => (
              <div key={row.name} className={`${styles.inboxRow} ${index === 0 ? styles.inboxRowActive : ""}`}>
                <span className={styles.avatar} style={colours(row.avatar)}>{row.initials}</span>
                <div className={styles.inboxBody}>
                  <div className={styles.inboxTop}>
                    <span className={styles.inboxName}>{row.name}</span>
                    <span className={`${styles.mono} ${styles.inboxTime}`}>{row.time}</span>
                  </div>
                  <span className={`${styles.inboxSubject} ${styles.ellipsis}`}>{row.subject}</span>
                  <span className={styles.tag} style={colours(STATUS[row.status])}>{row.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.conversation}>
            <div className={styles.ticketHead}>
              <div className={styles.ticketHeadText}>
                <span className={`${styles.mono} ${styles.metaText}`}>{ticket.meta}</span>
                <span className={styles.ticketSubject}>{ticket.subject}</span>
              </div>
              <span className={styles.headTag} style={colours(STATUS[ticket.status])}>{ticket.status}</span>
              <span className={styles.headTag} style={{ background: "#fdecec", color: "#9b1c1c" }}>{ticket.priority}</span>
            </div>

            <div className={styles.thread}>
              <div className={styles.messageRow}>
                <span className={`${styles.avatar} ${styles.avatarSmall}`} style={colours(["#e3f0ff", "#2556a3"])}>PS</span>
                <div className={`${styles.bubble} ${styles.bubbleCustomer}`}>{PREVIEW.customerMessage}</div>
              </div>
              <div className={styles.statusEvent}>
                <span />
                {PREVIEW.statusEvent}
              </div>
              <div className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                <span className={`${styles.avatar} ${styles.avatarSmall}`} style={colours(["#15232b", "#7fdcae"])}>RM</span>
                <div className={`${styles.bubble} ${styles.bubbleAgent}`}>{PREVIEW.agentMessage}</div>
              </div>
            </div>

            <div className={styles.composer}>
              <span className={styles.fakeInput}>{PREVIEW.composerPlaceholder}</span>
              <span className={styles.fakeSend}>Send</span>
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className={`${styles.floatCard} ${styles.floatResolved}`}>
        <span className={styles.checkTile}>
          <CheckIcon size={18} strokeWidth={1.8} />
        </span>
        <div>
          <div className={styles.floatTitle}>{PREVIEW.resolvedCard.title}</div>
          <div className={styles.floatText}>{PREVIEW.resolvedCard.text}</div>
        </div>
      </div>
      <div aria-hidden="true" className={`${styles.floatCard} ${styles.floatAssigned}`}>
        <span className={styles.mono}>{PREVIEW.assignedCard.label}</span>
        <span>{PREVIEW.assignedCard.text}</span>
      </div>
    </div>
  );
}
