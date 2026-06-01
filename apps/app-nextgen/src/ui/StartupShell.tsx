/**
 * Milady startup splash — Milady-owned, with a REAL status line (the thing the
 * old splash never showed). Pure CSS, paints instantly.
 */
export function StartupShell({ status }: { status: string }) {
  return (
    <div className="startup" role="status" aria-live="polite" aria-busy="true">
      <div className="startup__inner">
        <div className="startup__wordmark">
          <span className="startup__dot" aria-hidden="true" />
          <span className="startup__name">Milady</span>
        </div>
        <p className="startup__status">{status}</p>
        <div className="startup__bars" aria-hidden="true">
          <span className="startup__bar startup__bar--1" />
          <span className="startup__bar startup__bar--2" />
          <span className="startup__bar startup__bar--3" />
        </div>
      </div>
    </div>
  );
}
