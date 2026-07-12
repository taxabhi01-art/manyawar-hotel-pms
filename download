import React, { useState } from "react";
import { SectionTitle, Button } from "../components.jsx";
import { addExpense, logActivity } from "../lib/api.js";
import { ExpenseModal } from "./Finance.jsx";

// A deliberately minimal page: staff can log an expense (so day-to-day cash
// outflows like buying supplies get recorded) without seeing the full
// financial ledger — that stays owner-only in the Finance tab.
export default function AddExpense({ staff, reload }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const saveExpense = async (form) => {
    const { error } = await addExpense(form);
    if (error) return alert(`Couldn't save this expense: ${error.message}`);
    logActivity("Expense added", `${form.category} — ${form.mode} — ₹${form.amount}${form.description ? ` (${form.description})` : ""}`);
    setModalOpen(false);
    setLastSaved(form);
    reload();
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Log a cost"
        title="Add expense"
        action={<Button onClick={() => setModalOpen(true)}>+ Add expense</Button>}
      />
      <p style={{ fontSize: 13, color: "var(--ink45)", maxWidth: 480 }}>
        Use this whenever you spend hotel cash — buying supplies, paying a repair person, etc. The
        owner sees the full expense ledger and reports in the Finance tab.
      </p>
      {lastSaved && (
        <div style={{ marginTop: 16, background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "12px 16px", maxWidth: 420 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--sage)" }}>✓ Saved</div>
          <div style={{ fontSize: 12.5, color: "var(--ink70)", marginTop: 4 }}>
            {lastSaved.category} · ₹{lastSaved.amount} · {lastSaved.mode}
            {lastSaved.description ? ` · ${lastSaved.description}` : ""}
          </div>
        </div>
      )}
      {modalOpen && <ExpenseModal expense={null} staff={staff} onClose={() => setModalOpen(false)} onSave={saveExpense} />}
    </div>
  );
}
