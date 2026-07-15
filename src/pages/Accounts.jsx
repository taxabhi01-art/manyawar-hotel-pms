import React, { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { SectionTitle, Field, Button, currency, fmtDate, todayISO, splitInclusiveGst, PAYMENT_MODES } from "../components.jsx";
import { getSettings } from "../lib/api.js";

const NAVY = [22, 35, 58];
const BRASS = [184, 134, 63];
const LIGHT = [246, 241, 231];

// ---------------------------------------------------------------
// Indian financial year (Apr–Mar) helpers — the app's own bill-numbering
// convention (Settings → Bill Numbering, e.g. "FY26-27Q3-") already assumes
// this fiscal calendar, so Quarter/Year presets here follow the same one
// rather than calendar quarters.
// ---------------------------------------------------------------
function fyStartYearOf(dateISO) {
  const [y, m] = dateISO.slice(0, 7).split("-").map(Number);
  return m >= 4 ? y : y - 1;
}
function fyLabel(startYear) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
function fyQuarterOf(dateISO) {
  const m = Number(dateISO.slice(5, 7));
  if (m >= 4 && m <= 6) return 1;
  if (m >= 7 && m <= 9) return 2;
  if (m >= 10 && m <= 12) return 3;
  return 4;
}
function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of month m (1-indexed) = last day of month m-1... i.e. last day of month m
}
function monthRange(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}` };
}
function fyYearRange(startYear) {
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}
function fyQuarterRange(startYear, q) {
  const defs = [
    [4, startYear, 6, startYear],
    [7, startYear, 9, startYear],
    [10, startYear, 12, startYear],
    [1, startYear + 1, 3, startYear + 1],
  ];
  const [sm, sy, em, ey] = defs[q - 1];
  return { start: `${sy}-${String(sm).padStart(2, "0")}-01`, end: `${ey}-${String(em).padStart(2, "0")}-${String(lastDayOfMonth(ey, em)).padStart(2, "0")}` };
}

// A self-contained "Month / Quarter / Year / Custom" range picker — used
// independently by the P&L and Cash Flow sections below (each keeps its own
// period so you can, say, view a full year's P&L next to last month's cash
// flow) via two separate calls to this hook.
function useDateRangePicker(pickerLabel) {
  const today = todayISO();
  const [mode, setMode] = useState("month");
  const [monthValue, setMonthValue] = useState(today.slice(0, 7));
  const [fyStart, setFyStart] = useState(fyStartYearOf(today));
  const [quarter, setQuarter] = useState(fyQuarterOf(today));
  const [customStart, setCustomStart] = useState(today.slice(0, 8) + "01");
  const [customEnd, setCustomEnd] = useState(today);

  const fyOptions = [];
  const currentFyStart = fyStartYearOf(today);
  for (let y = currentFyStart + 1; y >= currentFyStart - 5; y--) fyOptions.push(y);

  const range = useMemo(() => {
    if (mode === "month") {
      const { start, end } = monthRange(monthValue);
      const label = new Date(monthValue + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
      return { start, end, label };
    }
    if (mode === "quarter") {
      const { start, end } = fyQuarterRange(fyStart, quarter);
      return { start, end, label: `Q${quarter}, ${fyLabel(fyStart)} (${fmtDate(start)} – ${fmtDate(end)})` };
    }
    if (mode === "year") {
      const { start, end } = fyYearRange(fyStart);
      return { start, end, label: `${fyLabel(fyStart)} (${fmtDate(start)} – ${fmtDate(end)})` };
    }
    return { start: customStart, end: customEnd, label: `${fmtDate(customStart)} – ${fmtDate(customEnd)}` };
  }, [mode, monthValue, fyStart, quarter, customStart, customEnd]);

  const picker = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { key: "month", label: "Month" },
          { key: "quarter", label: "Quarter" },
          { key: "year", label: "Year" },
          { key: "custom", label: "Custom" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              background: mode === m.key ? "var(--ink)" : "transparent",
              color: mode === m.key ? "var(--parchment)" : "var(--ink70)",
              border: "1px solid var(--hairline)",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "month" && (
        <Field label={pickerLabel}>
          <input className="input" type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
        </Field>
      )}
      {mode === "quarter" && (
        <>
          <Field label="Financial year">
            <select className="input" value={fyStart} onChange={(e) => setFyStart(Number(e.target.value))}>
              {fyOptions.map((y) => (
                <option key={y} value={y}>{fyLabel(y)}</option>
              ))}
            </select>
          </Field>
          <Field label="Quarter">
            <select className="input" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              <option value={1}>Q1 (Apr–Jun)</option>
              <option value={2}>Q2 (Jul–Sep)</option>
              <option value={3}>Q3 (Oct–Dec)</option>
              <option value={4}>Q4 (Jan–Mar)</option>
            </select>
          </Field>
        </>
      )}
      {mode === "year" && (
        <Field label="Financial year">
          <select className="input" value={fyStart} onChange={(e) => setFyStart(Number(e.target.value))}>
            {fyOptions.map((y) => (
              <option key={y} value={y}>{fyLabel(y)}</option>
            ))}
          </select>
        </Field>
      )}
      {mode === "custom" && (
        <>
          <Field label="From">
            <input className="input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </Field>
        </>
      )}
    </div>
  );

  return { range, picker };
}

function pdfMoney(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function drawStatementHeader(doc, title, settings, rangeLabel) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(settings.hotel_name || "MANYAWAR HOTEL", 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 225);
  const addrLine = [settings.address, settings.gst_number ? `GSTIN: ${settings.gst_number}` : null].filter(Boolean).join("   ·   ");
  if (addrLine) doc.text(addrLine, 14, 22);

  doc.setTextColor(...BRASS);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 196, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 225);
  doc.text(rangeLabel, 196, 22, { align: "right" });
  doc.text(`Generated ${fmtDate(todayISO())}`, 196, 28, { align: "right" });

  return 40; // startY for content below the header band
}

export default function Accounts({ bookings, expenses, bookingServices, inventoryUsage }) {
  const [settings, setSettings] = useState({});
  useEffect(() => {
    getSettings().then(({ data }) => setSettings(data || {}));
  }, []);

  const pl = useProfitAndLoss(bookings, expenses, bookingServices, inventoryUsage, settings);
  const cf = useCashFlow(bookings, expenses);

  return (
    <div>
      <SectionTitle eyebrow="Owner only" title="Accounts" />
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -10, marginBottom: 24 }}>
        Profit &amp; Loss and Cash Flow statements. Balance Sheet isn't included yet — it needs asset/liability
        data (fixed assets, loans, opening capital) this app doesn't track today.
      </p>

      <ProfitAndLossSection pl={pl} settings={settings} />
      <div style={{ height: 36 }} />
      <CashFlowSection cf={cf} settings={settings} />
    </div>
  );
}

// ---------------------------------------------------------------
// PROFIT & LOSS
// ---------------------------------------------------------------
function useProfitAndLoss(bookings, expenses, bookingServices, inventoryUsage, settings) {
  const { range, picker } = useDateRangePicker("Month");
  const inRange = (d) => !!d && d >= range.start && d <= range.end;

  // Revenue is accrual-ish (earned/billed), not cash — a cancelled/no-show
  // booking never actually delivered a stay, so it contributes nothing here
  // even if a deposit was collected (that deposit still shows up in Cash
  // Flow below, which is cash-basis and doesn't care about status).
  // Attributed by check-in date, consistent with how the rest of the app
  // (Bookings tab's default filter, etc.) already buckets bookings by date —
  // note a stay that spans a period boundary is NOT prorated night-by-night,
  // its whole revenue lands in the check-in period.
  const revenueBookings = useMemo(
    () => (bookings || []).filter((b) => b.status !== "cancelled" && b.status !== "no-show" && inRange(b.check_in)),
    [bookings, range]
  );
  const revenueBookingIds = useMemo(() => new Set(revenueBookings.map((b) => b.id)), [revenueBookings]);

  const roomCharges = revenueBookings.reduce(
    (s, b) => s + ((b.subtotal ?? b.total ?? 0) - (b.discount || 0) + (b.early_checkin_fee || 0) + (b.late_checkout_fee || 0)),
    0
  );

  // Summed fresh from the line-item rows (not the cached services_total/
  // items_total columns on bookings) — same reasoning as sumPayments in
  // components.jsx: a cached rollup can drift, the raw rows can't.
  const extraServicesRevenue = useMemo(
    () => (bookingServices || []).filter((s) => revenueBookingIds.has(s.booking_id)).reduce((s, x) => s + x.price * x.quantity, 0),
    [bookingServices, revenueBookingIds]
  );

  // Only guest-billed inventory usage (booking_id set) is revenue — usage
  // logged as "self-use / internal" (booking_id null) was never billed to
  // anyone, so it's shown as a separate memo line below, not folded into
  // Total Revenue.
  const inventoryRevenueRows = useMemo(
    () => (inventoryUsage || []).filter((u) => u.booking_id && revenueBookingIds.has(u.booking_id)),
    [inventoryUsage, revenueBookingIds]
  );
  const inventoryRevenue = inventoryRevenueRows.reduce((s, u) => s + u.amount, 0);
  const inventoryByItem = useMemo(() => {
    const map = {};
    inventoryRevenueRows.forEach((u) => (map[u.item_name || "Item"] = (map[u.item_name || "Item"] || 0) + u.amount));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [inventoryRevenueRows]);

  const internalSelfUse = useMemo(
    () => (inventoryUsage || []).filter((u) => !u.booking_id && inRange((u.used_at || "").slice(0, 10))).reduce((s, u) => s + u.amount, 0),
    [inventoryUsage, range]
  );

  const totalRevenue = roomCharges + extraServicesRevenue + inventoryRevenue;
  const gstPercent = Number(settings.gst_percent || 0);
  const { gst: gstInRevenue } = splitInclusiveGst(totalRevenue, gstPercent);

  const rangeExpenses = useMemo(() => (expenses || []).filter((e) => inRange(e.expense_date)), [expenses, range]);
  const expensesByCategory = useMemo(() => {
    const map = {};
    rangeExpenses.forEach((e) => (map[e.category] = (map[e.category] || 0) + e.amount));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rangeExpenses]);
  const totalExpenses = rangeExpenses.reduce((s, e) => s + e.amount, 0);

  const netProfitLoss = totalRevenue - totalExpenses;

  return {
    range, picker, revenueBookings, roomCharges, extraServicesRevenue, inventoryRevenue, inventoryByItem,
    internalSelfUse, totalRevenue, gstPercent, gstInRevenue, rangeExpenses, expensesByCategory, totalExpenses, netProfitLoss,
  };
}

function ProfitAndLossSection({ pl, settings }) {
  return (
    <div>
      <SectionTitle
        eyebrow="Statement"
        title="Profit & Loss"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={() => downloadPnLPdf(pl, settings)}>Download PDF</Button>
            <Button variant="ghost" onClick={() => exportPnLExcel(pl, settings)}>Export to Excel</Button>
          </div>
        }
      />
      {pl.picker}
      <div className="stat-card" style={{ maxWidth: 620 }}>
        <StatementRow label="REVENUE" bold section />
        <StatementRow label="Room charges" value={pl.roomCharges} indent />
        <StatementRow label="Extra Services" value={pl.extraServicesRevenue} indent />
        <StatementRow label="Inventory usage (billed to guests)" value={pl.inventoryRevenue} indent />
        <StatementRow label="Total Revenue" value={pl.totalRevenue} bold total />
        {pl.gstPercent > 0 && (
          <div style={{ fontSize: 11, color: "var(--ink45)", padding: "2px 0 8px" }}>
            (of which GST {pl.gstPercent}%: {currency(pl.gstInRevenue)}, included in the total above — not added on top)
          </div>
        )}

        <div style={{ height: 14 }} />
        <StatementRow label="EXPENSES" bold section />
        {pl.expensesByCategory.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink45)", padding: "4px 0" }}>No expenses in this period.</div>
        ) : (
          pl.expensesByCategory.map(([cat, amt]) => <StatementRow key={cat} label={cat} value={amt} indent />)
        )}
        <StatementRow label="Total Expenses" value={pl.totalExpenses} bold total color="var(--rust)" />

        <div style={{ height: 14 }} />
        <StatementRow
          label={pl.netProfitLoss >= 0 ? "NET PROFIT" : "NET LOSS"}
          value={Math.abs(pl.netProfitLoss)}
          bold
          big
          color={pl.netProfitLoss >= 0 ? "var(--sage)" : "var(--rust)"}
        />

        {pl.internalSelfUse > 0 && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--hairline)", fontSize: 11.5, color: "var(--ink45)" }}>
            Memo: {currency(pl.internalSelfUse)} of inventory was self-used/internal in this period (staff/lobby use,
            never billed to a guest) — not counted as revenue above.
          </div>
        )}
      </div>
    </div>
  );
}

function StatementRow({ label, value, bold, section, indent, total, big, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: section ? "6px 0 4px" : "5px 0",
        borderBottom: total ? "1px solid var(--hairline)" : "none",
        fontSize: big ? 16 : 13,
        fontWeight: bold ? 700 : 400,
        color: color || (section ? "var(--ink70)" : "var(--ink)"),
        textTransform: section ? "uppercase" : "none",
        letterSpacing: section ? "0.03em" : "normal",
        paddingLeft: indent ? 12 : 0,
      }}
    >
      <span>{label}</span>
      {value !== undefined && <span style={{ fontFamily: "var(--font-mono)" }}>{currency(value)}</span>}
    </div>
  );
}

function downloadPnLPdf(pl, settings) {
  const doc = new jsPDF();
  const startY = drawStatementHeader(doc, "PROFIT & LOSS", settings, pl.range.label);

  const body = [
    ["REVENUE", ""],
    ["Room charges", pdfMoney(pl.roomCharges)],
    ["Extra Services", pdfMoney(pl.extraServicesRevenue)],
    ["Inventory usage (billed to guests)", pdfMoney(pl.inventoryRevenue)],
    ["Total Revenue", pdfMoney(pl.totalRevenue)],
    ["", ""],
    ["EXPENSES", ""],
    ...(pl.expensesByCategory.length ? pl.expensesByCategory.map(([cat, amt]) => [cat, pdfMoney(amt)]) : [["No expenses in this period", ""]]),
    ["Total Expenses", pdfMoney(pl.totalExpenses)],
    ["", ""],
    [pl.netProfitLoss >= 0 ? "NET PROFIT" : "NET LOSS", pdfMoney(Math.abs(pl.netProfitLoss))],
  ];
  const boldLabels = new Set(["REVENUE", "EXPENSES", "Total Revenue", "Total Expenses", "NET PROFIT", "NET LOSS"]);

  autoTable(doc, {
    startY,
    head: [["Description", "Amount"]],
    body,
    theme: "plain",
    styles: { fontSize: 10, textColor: NAVY, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      const label = data.row.raw[0];
      if (boldLabels.has(label)) data.cell.styles.fontStyle = "bold";
      if (label === "REVENUE" || label === "EXPENSES") data.cell.styles.fillColor = LIGHT;
      if (label === "NET PROFIT" || label === "NET LOSS") {
        data.cell.styles.fontSize = 11.5;
        data.cell.styles.textColor = pl.netProfitLoss >= 0 ? [95, 136, 99] : [166, 69, 47];
      }
    },
  });

  if (pl.internalSelfUse > 0) {
    const y = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Memo: ${pdfMoney(pl.internalSelfUse)} of inventory was self-used/internal (not billed, not counted as revenue).`, 14, y);
  }

  doc.save(`profit-loss_${pl.range.start}_to_${pl.range.end}.pdf`);
}

function exportPnLExcel(pl, settings) {
  const wb = XLSX.utils.book_new();

  const rows = [
    [settings.hotel_name || "MANYAWAR HOTEL", "Profit & Loss Statement"],
    [pl.range.label],
    [],
    ["REVENUE"],
    ["Room charges", pl.roomCharges],
    ["Extra Services", pl.extraServicesRevenue],
    ["Inventory usage (billed to guests)", pl.inventoryRevenue],
    ["Total Revenue", pl.totalRevenue],
    [],
    ["EXPENSES"],
    ...(pl.expensesByCategory.length ? pl.expensesByCategory : [["No expenses in this period", 0]]),
    ["Total Expenses", pl.totalExpenses],
    [],
    [pl.netProfitLoss >= 0 ? "NET PROFIT" : "NET LOSS", Math.abs(pl.netProfitLoss)],
  ];
  if (pl.internalSelfUse > 0) {
    rows.push([]);
    rows.push(["Memo: internal/self-use inventory (not revenue)", pl.internalSelfUse]);
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(rows);
  summarySheet["!cols"] = [{ wch: 42 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "P&L Summary");

  if (pl.inventoryByItem.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(pl.inventoryByItem.map(([item, amt]) => ({ Item: item, "Revenue": amt }))),
      "Inventory Revenue Detail"
    );
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(pl.rangeExpenses.map((e) => ({ Date: e.expense_date, Category: e.category, Mode: e.mode || "Cash", Amount: e.amount, Description: e.description || "" }))),
    "Expense Detail"
  );

  XLSX.writeFile(wb, `profit-loss_${pl.range.start}_to_${pl.range.end}.xlsx`);
}

// ---------------------------------------------------------------
// CASH FLOW
// ---------------------------------------------------------------
function useCashFlow(bookings, expenses) {
  const { range, picker } = useDateRangePicker("Month");
  const inRange = (d) => !!d && d >= range.start && d <= range.end;

  // Cash basis — every payment actually collected counts, regardless of the
  // booking's status (a cancelled booking's forfeited deposit is still real
  // cash that moved), unlike P&L's accrual/earned basis above.
  const allPayments = useMemo(() => {
    const rows = [];
    (bookings || []).forEach((b) => (b.payments || []).forEach((p) => rows.push(p)));
    return rows;
  }, [bookings]);
  const rangePayments = useMemo(() => allPayments.filter((p) => inRange(p.paid_on)), [allPayments, range]);
  const rangeExpenses = useMemo(() => (expenses || []).filter((e) => inRange(e.expense_date)), [expenses, range]);

  const modeOf = (m) => (PAYMENT_MODES.includes(m) ? m : "Other");

  const inflowByMode = useMemo(() => {
    const map = {};
    PAYMENT_MODES.forEach((m) => (map[m] = 0));
    rangePayments.forEach((p) => (map[modeOf(p.mode)] += p.amount));
    return map;
  }, [rangePayments]);
  const outflowByMode = useMemo(() => {
    const map = {};
    PAYMENT_MODES.forEach((m) => (map[m] = 0));
    rangeExpenses.forEach((e) => (map[modeOf(e.mode)] += e.amount));
    return map;
  }, [rangeExpenses]);

  const totalInflow = rangePayments.reduce((s, p) => s + p.amount, 0);
  const totalOutflow = rangeExpenses.reduce((s, e) => s + e.amount, 0);
  const netCashFlow = totalInflow - totalOutflow;

  // Day-by-day ledger with a running balance — cumulative from zero AT THE
  // START of the selected period (this app doesn't track an actual opening
  // cash/bank balance, so "running" here means "net movement so far within
  // this period," not a real till/bank reconciliation).
  const dailyRows = useMemo(() => {
    const dateSet = new Set();
    rangePayments.forEach((p) => dateSet.add(p.paid_on));
    rangeExpenses.forEach((e) => dateSet.add(e.expense_date));
    const dates = Array.from(dateSet).sort();
    let running = 0;
    return dates.map((d) => {
      const inflow = rangePayments.filter((p) => p.paid_on === d).reduce((s, p) => s + p.amount, 0);
      const outflow = rangeExpenses.filter((e) => e.expense_date === d).reduce((s, e) => s + e.amount, 0);
      const net = inflow - outflow;
      running += net;
      return { date: d, inflow, outflow, net, running };
    });
  }, [rangePayments, rangeExpenses]);

  return { range, picker, rangePayments, rangeExpenses, inflowByMode, outflowByMode, totalInflow, totalOutflow, netCashFlow, dailyRows };
}

function CashFlowSection({ cf, settings }) {
  return (
    <div>
      <SectionTitle
        eyebrow="Statement"
        title="Cash Flow"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={() => downloadCashFlowPdf(cf, settings)}>Download PDF</Button>
            <Button variant="ghost" onClick={() => exportCashFlowExcel(cf, settings)}>Export to Excel</Button>
          </div>
        }
      />
      {cf.picker}

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        {PAYMENT_MODES.map((m) => (
          <div className="stat-card" key={m}>
            <div className="label">{m}</div>
            <div className="value" style={{ fontSize: 16 }}>
              <span style={{ color: "var(--sage)" }}>{currency(cf.inflowByMode[m])}</span>
              {" / "}
              <span style={{ color: "var(--rust)" }}>{currency(cf.outflowByMode[m])}</span>
            </div>
            <div className="sub">In / Out</div>
          </div>
        ))}
        <div className="stat-card" style={{ background: cf.netCashFlow >= 0 ? "rgba(95,136,99,0.08)" : "rgba(166,69,47,0.08)" }}>
          <div className="label">Net Cash Flow</div>
          <div className="value" style={{ color: cf.netCashFlow >= 0 ? "var(--sage)" : "var(--rust)" }}>{currency(cf.netCashFlow)}</div>
          <div className="sub">In {currency(cf.totalInflow)} − Out {currency(cf.totalOutflow)}</div>
        </div>
      </div>

      <div className="stat-card" style={{ maxWidth: 720, padding: 0, overflow: "hidden" }}>
        {cf.dailyRows.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12.5, color: "var(--ink45)" }}>No cash movement in this period.</div>
        ) : (
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "var(--parchment)", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Date</th>
                  <th style={{ padding: "8px 12px" }}>Inflow</th>
                  <th style={{ padding: "8px 12px" }}>Outflow</th>
                  <th style={{ padding: "8px 12px" }}>Net</th>
                  <th style={{ padding: "8px 12px" }}>Running</th>
                </tr>
              </thead>
              <tbody>
                {cf.dailyRows.map((r) => (
                  <tr key={r.date} style={{ borderTop: "1px solid var(--hairline)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    <td style={{ textAlign: "left", padding: "6px 12px", fontFamily: "inherit" }}>{fmtDate(r.date)}</td>
                    <td style={{ padding: "6px 12px", color: "var(--sage)" }}>{currency(r.inflow)}</td>
                    <td style={{ padding: "6px 12px", color: "var(--rust)" }}>{currency(r.outflow)}</td>
                    <td style={{ padding: "6px 12px" }}>{currency(r.net)}</td>
                    <td style={{ padding: "6px 12px", fontWeight: 700 }}>{currency(r.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function downloadCashFlowPdf(cf, settings) {
  const doc = new jsPDF();
  const startY = drawStatementHeader(doc, "CASH FLOW", settings, cf.range.label);

  autoTable(doc, {
    startY,
    head: [["", ...PAYMENT_MODES, "Total"]],
    body: [
      ["Inflows", ...PAYMENT_MODES.map((m) => pdfMoney(cf.inflowByMode[m])), pdfMoney(cf.totalInflow)],
      ["Outflows", ...PAYMENT_MODES.map((m) => pdfMoney(cf.outflowByMode[m])), pdfMoney(cf.totalOutflow)],
    ],
    theme: "plain",
    styles: { fontSize: 9, textColor: NAVY, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { halign: "right" }])),
    margin: { left: 14, right: 14 },
  });

  let y = doc.lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...(cf.netCashFlow >= 0 ? [95, 136, 99] : [166, 69, 47]));
  doc.text(`Net Cash Flow: ${pdfMoney(cf.netCashFlow)}`, 14, y);
  y += 10;

  if (cf.dailyRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Inflow", "Outflow", "Net", "Running"]],
      body: cf.dailyRows.map((r) => [fmtDate(r.date), pdfMoney(r.inflow), pdfMoney(r.outflow), pdfMoney(r.net), pdfMoney(r.running)]),
      theme: "striped",
      styles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`cash-flow_${cf.range.start}_to_${cf.range.end}.pdf`);
}

function exportCashFlowExcel(cf, settings) {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    [settings.hotel_name || "MANYAWAR HOTEL", "Cash Flow Statement"],
    [cf.range.label],
    [],
    ["", ...PAYMENT_MODES, "Total"],
    ["Inflows", ...PAYMENT_MODES.map((m) => cf.inflowByMode[m]), cf.totalInflow],
    ["Outflows", ...PAYMENT_MODES.map((m) => cf.outflowByMode[m]), cf.totalOutflow],
    [],
    ["Net Cash Flow", cf.netCashFlow],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 20 }, ...PAYMENT_MODES.map(() => ({ wch: 14 })), { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Cash Flow Summary");

  const dailySheet = XLSX.utils.json_to_sheet(
    cf.dailyRows.map((r) => ({ Date: r.date, Inflow: r.inflow, Outflow: r.outflow, Net: r.net, "Running balance": r.running }))
  );
  XLSX.utils.book_append_sheet(wb, dailySheet, "Daily Ledger");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cf.rangePayments.map((p) => ({ Date: p.paid_on, Mode: p.mode, Amount: p.amount }))),
    "Inflow Detail"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(cf.rangeExpenses.map((e) => ({ Date: e.expense_date, Category: e.category, Mode: e.mode || "Cash", Amount: e.amount }))),
    "Outflow Detail"
  );

  XLSX.writeFile(wb, `cash-flow_${cf.range.start}_to_${cf.range.end}.xlsx`);
}
