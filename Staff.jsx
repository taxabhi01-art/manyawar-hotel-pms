import React from "react";
import { SectionTitle, fmtDateTime } from "../components.jsx";

export default function Activity({ log }) {
  return (
    <div>
      <SectionTitle eyebrow="Owner only" title="Activity log" />
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -10, marginBottom: 20 }}>
        A record of significant actions taken by any staff login — cancellations, discounts, deposit
        refunds, expenses, staff changes, and more.
      </p>
      {log.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink45)" }}>No activity logged yet.</p>
      ) : (
        log.map((a) => (
          <div className="card" key={a.id}>
            <span style={{ fontSize: 12, color: "var(--ink45)", width: 130 }}>{fmtDateTime(a.created_at)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.action}</div>
              {a.details && <div style={{ fontSize: 12, color: "var(--ink70)" }}>{a.details}</div>}
            </div>
            <span style={{ fontSize: 11.5, color: "var(--ink45)" }}>{a.performed_by || "—"}</span>
          </div>
        ))
      )}
    </div>
  );
}
