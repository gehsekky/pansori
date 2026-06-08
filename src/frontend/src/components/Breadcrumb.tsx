import styles from '../styles.module.css';

// A clickable breadcrumb trail used as the page title across the creator
// surface: e.g. CREATOR › <campaign> › <region>. Each non-terminal crumb is a
// button that navigates there; the last crumb is the current page (rendered as
// plain text with aria-current). Crumbs without an onClick render as plain
// text too (e.g. a still-loading name).
export interface Crumb {
  label: string;
  onClick?: () => void;
}

function Breadcrumb({ crumbs, testId }: { crumbs: Crumb[]; testId?: string }) {
  return (
    <h1 className={styles.breadcrumb} data-testid={testId}>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className={styles.breadcrumbItem}>
            {i > 0 && (
              <span className={styles.breadcrumbSep} aria-hidden="true">
                ›
              </span>
            )}
            {c.onClick && !isLast ? (
              <button type="button" className={styles.breadcrumbLink} onClick={c.onClick}>
                {c.label}
              </button>
            ) : (
              <span
                className={isLast ? styles.breadcrumbCurrent : styles.breadcrumbLabel}
                aria-current={isLast ? 'page' : undefined}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </h1>
  );
}

export default Breadcrumb;
