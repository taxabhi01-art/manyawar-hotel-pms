import React, { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, todayISO, EXPENSE_CATEGORIES } from "../components.jsx";
import { addExpense, updateExpense, deleteExpense, addStaff, logActivity } from "../lib/api.js";

export default function Finance({ bookings, expenses, staff, reload }) {
  const [expenseModal, setExpenseModal] = useState(null);
  const [granularity, setGranularity] = useState("monthly"); // daily | monthly | yearly
  const [monthsBack, setMonthsBack] = useState(6);
  const today = todayISO();
  const [cfStart, setCfStart] = useState(today);
  const [cfEnd, setCfEnd] = useState(today);

  const allPayments = useMemo(() => {
    const rows = [];
    bookings.forEach((b) => (b.payments || []).forEach((p) => rows.push(p)));
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
    setCfStart(new Date(Date.now() - fromDaysAgo * 86400000).toISOString().slice(0, 10));
    setCfEnd(new Date(Date.now() - toDaysAgo * 86400000).toISOString().slice(0, 10));
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
  const expensesInRange = expenses.filter((e) => e.expense_date >= cfStart && e.expense_date <= cfEnd).reduce((s, e) => s + e.amount, 0);
  const netInRange = totalReceivedInRange - expensesInRange;
  const totalPending = bookings.reduce((s, b) => s + Math.max(0, (b.total || 0) - (b.paid_amount || 0)), 0);


  // ---- Cash flow chart data ----
  const chartData = useMemo(() => {
    const buckets = [];
    if (granularity === "daily") {
      for (let i = 29; i >= 0; i--) buckets.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    } else if (granularity === "monthly") {
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        buckets.push(d.toISOString().slice(0, 7));
      }
    } else {
      const thisYear = new Date().getFullYear();
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
      <div className="stat-grid" style={{ marginBottom: 30 }}>
        <div className="stat-card">
          <div className="label">Cash received</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(cashInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">UPI received</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(upiInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Other (Bank/Card)</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(otherModesInRange)}</div>
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
          <div className="label">Net</div>
          <div className="value" style={{ color: netInRange >= 0 ? "var(--sage)" : "var(--rust)" }}>{currency(netInRange)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total pending (all bookings)</div>
          <div className="value" style={{ color: "var(--rust)" }}>{currency(totalPending)}</div>
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
    </div>
  );
}

function ExpenseModal({ expense, staff, onClose, onSave }) {
  const [form, setForm] = useState(
    expense || { category: EXPENSE_CATEGORIES[0], amount: 0, description: "", expense_date: todayISO(), staff_id: "", salary_period: "" }
  );
  const [addingStaff, setAddingStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [creatingStaff, setCreatingStaff] = useState(false);
  const isSalary = form.category === "Salaries";

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
        <Field label="Date">
          <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </Field>
        <Field label="Description (optional)">
          <input className="input" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
