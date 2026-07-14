import React, { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, todayISO, addDaysISO, addMonthsISO, EXPENSE_CATEGORIES, PAYMENT_MODES } from "../components.jsx";
import { addExpense, updateExpense, deleteExpense, addStaff, logActivity, uploadExpenseReceipt, getExpenseReceiptSignedUrl } from "../lib/api.js";

export default function Finance({ bookings, guests, expenses, staff, reload }) {
  const [expenseModal, setExpenseModal] = useState(null);
  const [modeModal, setModeModal] = useState(null); // "Cash" | "UPI" | "Other" | null
  const [granularity, setGranularity] = useState("monthly"); // daily | monthly | yearly
  const [monthsBack, setMonthsBack] = useState(6);
  const today = todayISO();
  const [cfStart, setCfStart] = useState(today);
  const [cfEnd, setCfEnd] = useState(today);

  const allPayments = useMemo(() => {
    const rows = [];
    bookings.forEach((b) => (b.payments || []).forEach((p) => rows.push({ ...p, booking_id: b.id })));
    return rows;
  }, [bookings]);

  const saveExpense = async (form) => {
    const { id, ...patch } = form;
    const { error } = id ? await updateExpense(id, patch) : await addExpense(patch);
    if (error) return alert(`Couldn't save this expense: ${error.message}`);
    if (!id) logActivity("Expense added", `${patch.category} — ${currency(patch.amount)}${patch.description ? ` (${patch.description})` : ""}`);
    setExpenseModal(null);
    reload();
  };
  const removeExpense = async (e) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await deleteExpense(e.id);
    if (error) return alert(`Couldn't delete this expense: ${error.message}`);
    reload();
  };

  const thisMonthPrefix = today.slice(0, 7);
  const incomeThisMonth = allPayments.filter((p) => p.paid_on?.startsWith(thisMonthPrefix)).reduce((s, p) => s + p.amount, 0);
  const expenseThisMonth = expenses.filter((e) => e.expense_date?.startsWith(thisMonthPrefix)).reduce((s, e) => s + e.amount, 0);
  const netThisMonth = incomeThisMonth - expenseThisMonth;

  // ---- Cash flow for the selected date range — by payment mode, expenses, net, and pending ----
  const cfPreset = (fromDaysAgo, toDaysAgo = 0) => {
    setCfStart(addDaysISO(today, -fromDaysAgo));
    setCfEnd(addDaysISO(today, -toDaysAgo));
  };
  const rangePayments = useMemo(
    () => allPayments.filter((p) => p.paid_on >= cfStart && p.paid_on <= cfEnd),
    [allPayments, cfStart, cfEnd]
  );
  const byModeRange = useMemo(() => {
    const map = {};
    rangePayments.forEach((p) => (map[p.mode] = (map[p.mode] || 0) + p.amount));
    return map;
  }, [rangePayments]);
  const cashInRange = byModeRange["Cash"] || 0;
  const upiInRange = byModeRange["UPI"] || 0;
  const otherModesInRange = Object.entries(byModeRange)
    .filter(([mode]) => mode !== "Cash" && mode !== "UPI")
    .reduce((s, [, amt]) => s + amt, 0);
  const totalReceivedInRange = cashInRange + upiInRange + otherModesInRange;

  const rangeExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date >= cfStart && e.expense_date <= cfEnd),
    [expenses, cfStart, cfEnd]
  );
  const expenseByModeRange = useMemo(() => {
    const map = {};
    rangeExpenses.forEach((e) => (map[e.mode || "Cash"] = (map[e.mode || "Cash"] || 0) + e.amount));
    return map;
  }, [rangeExpenses]);
  const cashExpenseInRange = expenseByModeRange["Cash"] || 0;
  const upiExpenseInRange = expenseByModeRange["UPI"] || 0;
  const otherExpenseInRange = Object.entries(expenseByModeRange)
    .filter(([mode]) => mode !== "Cash" && mode !== "UPI")
    .reduce((s, [, amt]) => s + amt, 0);
  const expensesInRange = cashExpenseInRange + upiExpenseInRange + otherExpenseInRange;

  const netCashInRange = cashInRange - cashExpenseInRange;
  const netUpiInRange = upiInRange - upiExpenseInRange;
  const netOtherInRange = otherModesInRange - otherExpenseInRange;
  const netInRange = totalReceivedInRange - expensesInRange;
  const totalPending = bookings.reduce((s, b) => s + Math.max(0, (b.total || 0) - (b.paid_amount || 0)), 0);

  // ---- Cash flow chart data ----
  const chartData = useMemo(() => {
    const buckets = [];
    if (granularity === "daily") {
      for (let i = 29; i >= 0; i--) buckets.push(addDaysISO(today, -i));
    } else if (granularity === "monthly") {
      const thisMonth = today.slice(0, 7);
      for (let i = monthsBack - 1; i >= 0; i--) buckets.push(addMonthsISO(thisMonth, -i));
    } else {
      const thisYear = Number(today.slice(0, 4));
      for (let i = 4; i >= 0; i--) buckets.push(String(thisYear - i));
    }
    const keyFor = (dateStr) => {
      if (granularity === "daily") return dateStr;
      if (granularity === "monthly") return dateStr.slice(0, 7);
      return dateStr.slice(0, 4);
    };
    return buckets.map((b) => {
      const income = allPayments.filter((p) => keyFor(p.paid_on || "") === b).reduce((s, p) => s + p.amount, 0);
      const expense = expenses.filter((e) => keyFor(e.expense_date || "") === b).reduce((s, e) => s + e.amount, 0);
      const label = granularity === "daily" ? b.slice(5) : granularity === "monthly" ? b.slice(2) : b;
      return { label, income, expense, net: income - expense };
    });
  }, [allPayments, expenses, granularity, monthsBack]);

  // ---- Expense category breakdown (this month) ----
  const byCategory = useMemo(() => {
    const map = {};
    expenses
      .filter((e) => e.expense_date?.startsWith(thisMonthPrefix))
      .forEach((e) => (map[e.category] = (map[e.category] || 0) + e.amount));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses, thisMonthPrefix]);

  const recentExpenses = expenses.slice(0, 30);

  return (
    <div>
      <SectionTitle eyebrow="Owner only" title="Finance" action={<Button onClick={() => setExpenseModal("new")}>+ Add expense</Button>} />

      <SectionTitle
        eyebrow="Cash flow"
        title={`${fmtDate(cfStart)} → ${fmtDate(cfEnd)}`}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => cfPreset(0, 0)}>Today</Button>
            <Button variant="ghost" onClick={() => cfPreset(1, 1)}>Yesterday</Button>
            <Button variant="ghost" onClick={() => cfPreset(6, 0)}>Last 7 days</Button>
            <Button variant="ghost" onClick={() => cfPreset(29, 0)}>Last 30 days</Button>
            <Field label="From">
              <input className="input" type="date" style={{ width: 140 }} value={cfStart} onChange={(e) => setCfStart(e.target.value)} />
            </Field>
            <Field label="To">
              <input className="input" type="date" style={{ width: 140 }} value={cfEnd} onChange={(e) => setCfEnd(e.target.value)} />
            </Field>
          </div>
        }
      />
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setModeModal("Cash")}>
          <div className="label">Cash received</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(cashInRange)}</div>
          <div className="sub">Spent: {currency(cashExpenseInRange)} · click to view all</div>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setModeModal("UPI")}>
          <div className="label">UPI received</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(upiInRange)}</div>
          <div className="sub">Spent: {currency(upiExpenseInRange)} · click to view all</div>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setModeModal("Other")}>
          <div className="label">Other (Bank/Card)</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(otherModesInRange)}</div>
          <div className="sub">Spent: {currency(otherExpenseInRange)} · click to view all</div>
        </div>
        <div className="stat-card">
          <div className="label">Total received</div>
          <div className="value">{currency(totalReceivedInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expenses</div>
          <div className="value" style={{ color: "var(--rust)" }}>{currency(expensesInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total pending (all bookings)</div>
          <div className="value" style={{ color: "var(--rust)" }}>{currency(totalPending)}</div>
        </div>
      </div>

      <SectionTitle eyebrow="By mode" title="Net cash on hand, by payment mode" />
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <div className="label">Net Cash</div>
          <div className="value" style={{ color: netCashInRange >= 0 ? "var(--sage)" : "var(--rust)" }}>{currency(netCashInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Net UPI</div>
          <div className="value" style={{ color: netUpiInRange >= 0 ? "var(--sage)" : "var(--rust)" }}>{currency(netUpiInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Net Other (Bank/Card)</div>
          <div className="value" style={{ color: netOtherInRange >= 0 ? "var(--sage)" : "var(--rust)" }}>{currency(netOtherInRange)}</div>
        </div>
        <div className="stat-card" style={{ background: netInRange >= 0 ? "rgba(95,136,99,0.08)" : "rgba(166,69,47,0.08)" }}>
          <div className="label">Total Net Profit / Loss</div>
          <div className="value" style={{ color: netInRange >= 0 ? "var(--sage)" : "var(--rust)", fontSize: 22 }}>
            {netInRange >= 0 ? "Profit " : "Loss "}
            {currency(Math.abs(netInRange))}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Income — this month</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(incomeThisMonth)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expenses — this month</div>
          <div className="value" style={{ color: "var(--rust)" }}>{currency(expenseThisMonth)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Net — this month</div>
          <div className="value" style={{ color: netThisMonth >= 0 ? "var(--sage)" : "var(--rust)" }}>{currency(netThisMonth)}</div>
        </div>
      </div>

      <SectionTitle
        eyebrow="Cash flow"
        title="Income vs expenses"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {["daily", "monthly", "yearly"].map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                  background: granularity === g ? "var(--ink)" : "transparent",
                  color: granularity === g ? "var(--parchment)" : "var(--ink70)",
                  border: "1px solid var(--hairline)", textTransform: "capitalize",
                }}
              >
                {g}
              </button>
            ))}
            {granularity === "monthly" && (
              <select className="input" style={{ width: 130 }} value={monthsBack} onChange={(e) => setMonthsBack(Number(e.target.value))}>
                {[3, 6, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    Last {n} months
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />
      <div className="stat-card" style={{ marginBottom: 30 }}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip formatter={(v) => currency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Income" fill="#5f8863" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" name="Expense" fill="#a6452f" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {byCategory.length > 0 && (
        <>
          <SectionTitle eyebrow="Breakdown" title="Expenses by category — this month" />
          <div className="stat-card" style={{ marginBottom: 30 }}>
            {byCategory.map(([cat, amt]) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--hairline)", fontSize: 13 }}>
                <span>{cat}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{currency(amt)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle eyebrow="Log" title="Recent expenses" />
      {recentExpenses.length === 0 ? (
        <EmptyState text="No expenses logged yet." action={<Button onClick={() => setExpenseModal("new")}>Add your first expense</Button>} />
      ) : (
        recentExpenses.map((e) => {
          const paidStaff = staff.find((s) => s.id === e.staff_id);
          return (
            <div className="card" key={e.id}>
              <span style={{ fontSize: 12.5, color: "var(--ink45)", width: 90 }}>{fmtDate(e.expense_date)}</span>
              <Pill color="#46536b">{e.category}</Pill>
              <Pill color="#b8863f">{e.mode || "Cash"}</Pill>
              <span style={{ flex: 1, fontSize: 13 }}>
                {e.description}
                {paidStaff && (
                  <span style={{ color: "var(--brass)", fontWeight: 600 }}>
                    {" "}
                    · {paidStaff.name}
                    {e.salary_period ? ` (${e.salary_period})` : ""}
                  </span>
                )}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--rust)" }}>{currency(e.amount)}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {e.receipt_path && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const { data, error } = await getExpenseReceiptSignedUrl(e.receipt_path);
                      if (error) return alert(`Couldn't open document: ${error.message}`);
                      window.open(data.signedUrl, "_blank");
                    }}
                  >
                    📎 Doc
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setExpenseModal(e)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => removeExpense(e)}>
                  Delete
                </Button>
              </div>
            </div>
          );
        })
      )}

      {expenseModal && (
        <ExpenseModal
          expense={expenseModal === "new" ? null : expenseModal}
          staff={staff}
          onClose={() => setExpenseModal(null)}
          onSave={saveExpense}
        />
      )}
      {modeModal && (
        <ModeDrillDownModal
          mode={modeModal}
          payments={rangePayments.filter((p) => (modeModal === "Other" ? p.mode !== "Cash" && p.mode !== "UPI" : p.mode === modeModal))}
          bookings={bookings}
          guests={guests}
          cfStart={cfStart}
          cfEnd={cfEnd}
          onClose={() => setModeModal(null)}
        />
      )}
    </div>
  );
}

function ModeDrillDownModal({ mode, payments, bookings, guests, cfStart, cfEnd, onClose }) {
  const rows = payments
    .map((p) => {
      const b = bookings.find((x) => x.id === p.booking_id);
      const g = b ? guests.find((x) => x.id === b.guest_id) : null;
      return { ...p, guestName: g ? g.name : "—", bookingRef: b ? b.booking_ref : "—" };
    })
    .sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1));
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${mode} payments — ${fmtDate(cfStart)} to ${fmtDate(cfEnd)}`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Date", "Guest", "Booking Ref", "Amount"]],
      body: rows.map((r) => [fmtDate(r.paid_on), r.guestName, r.bookingRef, currency(r.amount)]),
      foot: [["", "", "Total", currency(total)]],
    });
    doc.save(`${mode.toLowerCase()}-payments-${cfStart}-to-${cfEnd}.pdf`);
  };

  return (
    <Modal title={`${mode} payments (${fmtDate(cfStart)} → ${fmtDate(cfEnd)})`} onClose={onClose} width={480}>
      {rows.length === 0 ? (
        <EmptyState text="No payments in this range." />
      ) : (
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hairline)", fontSize: 13 }}>
              <span>
                {fmtDate(r.paid_on)} · {r.guestName} <span style={{ color: "var(--ink45)" }}>({r.bookingRef})</span>
              </span>
              <strong>{currency(r.amount)}</strong>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14 }}>
            <strong>Total</strong>
            <strong>{currency(total)}</strong>
          </div>
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={() => window.print()}>
          Print
        </Button>
        <Button onClick={downloadPdf}>Download PDF</Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

export function ExpenseModal({ expense, staff, onClose, onSave }) {
  const [form, setForm] = useState(
    expense || { category: EXPENSE_CATEGORIES[0], amount: 0, mode: PAYMENT_MODES[0], description: "", expense_date: todayISO(), staff_id: "", salary_period: "" }
  );
  const [addingStaff, setAddingStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isSalary = form.category === "Salaries";

  const uploadReceipt = async (file) => {
    if (!file) return;
    setUploading(true);
    const path = `receipts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await uploadExpenseReceipt(path, file);
    setUploading(false);
    if (error) return alert(`Couldn't upload receipt: ${error.message}`);
    setForm({ ...form, receipt_path: path });
  };

  const viewReceipt = async () => {
    const { data, error } = await getExpenseReceiptSignedUrl(form.receipt_path);
    if (error) return alert(`Couldn't open receipt: ${error.message}`);
    window.open(data.signedUrl, "_blank");
  };

  const createStaffInline = async () => {
    if (!newStaffName.trim()) return alert("Enter the staff member's name.");
    if (!newStaffPhone.trim()) return alert("Enter their WhatsApp/phone number.");
    setCreatingStaff(true);
    const { data, error } = await addStaff({ name: newStaffName.trim(), phone: newStaffPhone.trim(), role: "Front Desk", shift: "Morning" });
    setCreatingStaff(false);
    if (error) return alert(`Couldn't add staff member: ${error.message}`);
    setForm({ ...form, staff_id: data.id });
    setAddingStaff(false);
    setNewStaffName("");
    setNewStaffPhone("");
  };

  return (
    <Modal title={expense ? "Edit expense" : "Add expense"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Category">
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {isSalary && (
          <div className="grid-2">
            <Field label="Staff member">
              {addingStaff ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input className="input" placeholder="Name" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} />
                  <input className="input" placeholder="WhatsApp/phone" value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="ghost" onClick={() => setAddingStaff(false)}>
                      Cancel
                    </Button>
                    <Button disabled={creatingStaff} onClick={createStaffInline}>
                      {creatingStaff ? "Adding…" : "Add staff"}
                    </Button>
                  </div>
                </div>
              ) : (
                <select
                  className="input"
                  value={form.staff_id || ""}
                  onChange={(e) => {
                    if (e.target.value === "__new__") setAddingStaff(true);
                    else setForm({ ...form, staff_id: e.target.value });
                  }}
                >
                  <option value="">Select staff…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new__">+ Add new staff…</option>
                </select>
              )}
            </Field>
            <Field label="Salary period">
              <input
                className="input"
                value={form.salary_period || ""}
                onChange={(e) => setForm({ ...form, salary_period: e.target.value })}
                placeholder="e.g. July 2026"
              />
            </Field>
          </div>
        )}
        <Field label="Amount">
          <input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        </Field>
        <Field label="Paid via">
          <select className="input" value={form.mode || PAYMENT_MODES[0]} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {PAYMENT_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </Field>
        <Field label="Description (optional)">
          <input className="input" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Related document (optional — receipt, bill, invoice photo)">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => uploadReceipt(e.target.files[0])}
              style={{ fontSize: 12.5 }}
            />
            {uploading && <span style={{ fontSize: 12, color: "var(--ink45)" }}>Uploading…</span>}
            {form.receipt_path && !uploading && (
              <Button variant="ghost" onClick={viewReceipt}>
                View uploaded document
              </Button>
            )}
          </div>
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!form.amount || form.amount <= 0) return alert("Enter a valid amount.");
            if (isSalary && !form.staff_id) return alert("Select which staff member this salary is for.");
            onSave({ ...form, staff_id: form.staff_id || null });
          }}
        >
          Save expense
        </Button>
      </div>
    </Modal>
  );
}
