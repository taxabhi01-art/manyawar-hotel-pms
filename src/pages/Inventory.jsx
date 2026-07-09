import React, { useState, useMemo } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDateTime, computeBookingTotal } from "../components.jsx";
import {
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  addInventoryUsage,
  deleteInventoryUsage,
  updateBooking,
} from "../lib/api.js";

const UNITS = ["pcs", "bottle", "pack", "kg", "ltr", "plate"];

export default function Inventory({ items, usage, bookings, guests, rooms, reload }) {
  const [itemModal, setItemModal] = useState(null);
  const [useModal, setUseModal] = useState(false);

  const saveItem = async (form) => {
    const { id, ...patch } = form;
    const { error } = id ? await updateInventoryItem(id, patch) : await addInventoryItem(patch);
    if (error) return alert(`Couldn't save this item: ${error.message}`);
    setItemModal(null);
    reload();
  };

  const removeItem = async (item) => {
    if (!confirm(`Delete "${item.name}" from inventory?`)) return;
    const { error } = await deleteInventoryItem(item.id);
    if (error) return alert(`Couldn't delete this item: ${error.message}`);
    reload();
  };

  const logUsage = async ({ bookingId, item, quantity }) => {
    const amount = item.price * quantity;
    const { error: usageError } = await addInventoryUsage({
      booking_id: bookingId,
      item_id: item.id,
      item_name: item.name,
      quantity,
      unit_price: item.price,
      amount,
    });
    if (usageError) return alert(`Couldn't log this usage: ${usageError.message}`);

    // Auto-manage stock
    const newStock = Math.max(0, (item.stock_qty || 0) - quantity);
    await updateInventoryItem(item.id, { stock_qty: newStock });

    // Auto-add to the guest's bill
    const booking = bookings.find((b) => b.id === bookingId);
    if (booking) {
      const newItemsTotal = (booking.items_total || 0) + amount;
      const newTotal = computeBookingTotal({ ...booking, items_total: newItemsTotal });
      await updateBooking(bookingId, { items_total: newItemsTotal, total: newTotal });
    }
    setUseModal(false);
    reload();
  };

  const voidUsage = async (u) => {
    if (!confirm(`Undo this: ${u.item_name} ×${u.quantity} (${currency(u.amount)})? Stock and bill will be reversed.`)) return;
    const { error } = await deleteInventoryUsage(u.id);
    if (error) return alert(`Couldn't undo this: ${error.message}`);

    const item = items.find((i) => i.id === u.item_id);
    if (item) await updateInventoryItem(item.id, { stock_qty: (item.stock_qty || 0) + u.quantity });

    const booking = bookings.find((b) => b.id === u.booking_id);
    if (booking) {
      const newItemsTotal = Math.max(0, (booking.items_total || 0) - u.amount);
      const newTotal = computeBookingTotal({ ...booking, items_total: newItemsTotal });
      await updateBooking(booking.id, { items_total: newItemsTotal, total: newTotal });
    }
    reload();
  };

  const activeBookings = bookings.filter((b) => b.status === "reserved" || b.status === "checked-in");
  const recentUsage = usage.slice(0, 40);

  return (
    <div>
      <SectionTitle
        eyebrow="Stock"
        title="Inventory"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {activeBookings.length > 0 && items.length > 0 && <Button onClick={() => setUseModal(true)}>Log item used</Button>}
            <Button variant="ghost" onClick={() => setItemModal("new")}>
              + Add item
            </Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState text="No inventory items yet." action={<Button onClick={() => setItemModal("new")}>Add your first item</Button>} />
      ) : (
        items.map((item) => (
          <div className="card" key={item.id}>
            <div className="card-col">
              <div className="title">{item.name}</div>
              <div className="sub">{currency(item.price)} / {item.unit}</div>
            </div>
            <Pill color={item.stock_qty > 5 ? "#5f8863" : item.stock_qty > 0 ? "#c99a3c" : "#a6452f"}>
              {item.stock_qty} {item.unit} in stock
            </Pill>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <Button variant="ghost" onClick={() => setItemModal(item)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => removeItem(item)}>
                Delete
              </Button>
            </div>
          </div>
        ))
      )}

      <SectionTitle eyebrow="Log" title="Recent usage" />
      {recentUsage.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink45)" }}>No items logged against any guest yet.</p>
      ) : (
        recentUsage.map((u) => {
          const booking = bookings.find((b) => b.id === u.booking_id);
          const guest = booking ? guests.find((g) => g.id === booking.guest_id) : null;
          const room = booking ? rooms.find((r) => r.id === booking.room_id) : null;
          return (
            <div className="card" key={u.id}>
              <span style={{ fontSize: 12.5, color: "var(--ink45)", width: 130 }}>{fmtDateTime(u.used_at)}</span>
              <span style={{ flex: 1, fontSize: 13 }}>
                {u.item_name} ×{u.quantity}
                {guest && (
                  <span style={{ color: "var(--ink45)" }}>
                    {" "}
                    — {guest.name} (Room {room ? room.number : "—"})
                  </span>
                )}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--brass)" }}>{currency(u.amount)}</span>
              <Button variant="ghost" onClick={() => voidUsage(u)}>
                Undo
              </Button>
            </div>
          );
        })
      )}

      {itemModal && (
        <ItemModal item={itemModal === "new" ? null : itemModal} onClose={() => setItemModal(null)} onSave={saveItem} />
      )}
      {useModal && (
        <UseItemModal
          items={items}
          bookings={activeBookings}
          guests={guests}
          rooms={rooms}
          onClose={() => setUseModal(false)}
          onSave={logUsage}
        />
      )}
    </div>
  );
}

function ItemModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: "", price: 0, stock_qty: 0, unit: UNITS[0] });
  return (
    <Modal title={item ? "Edit item" : "Add inventory item"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Item name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mineral water bottle" />
        </Field>
        <div className="grid-2">
          <Field label="Price per unit">
            <input className="input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Current stock quantity">
          <input className="input" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!form.name.trim()) return alert("Item name is required.");
            onSave(form);
          }}
        >
          Save item
        </Button>
      </div>
    </Modal>
  );
}

function UseItemModal({ items, bookings, guests, rooms, onClose, onSave }) {
  const [bookingId, setBookingId] = useState(bookings[0]?.id || "");
  const [itemId, setItemId] = useState(items[0]?.id || "");
  const [quantity, setQuantity] = useState(1);

  const item = items.find((i) => i.id === itemId);
  const amount = item ? item.price * quantity : 0;

  const bookingLabel = (b) => {
    const g = guests.find((x) => x.id === b.guest_id);
    const r = rooms.find((x) => x.id === b.room_id);
    return `${g ? g.name : "Guest"} — Room ${r ? r.number : "—"}`;
  };

  return (
    <Modal title="Log item used" onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Guest / booking">
          <select className="input" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {bookingLabel(b)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Item">
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({currency(i.price)}/{i.unit}) — {i.stock_qty} in stock
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
        </Field>
        {item && (
          <div style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
            Amount to add to bill: <strong>{currency(amount)}</strong>
            {quantity > item.stock_qty && (
              <div style={{ color: "var(--rust)", fontSize: 11.5, marginTop: 4 }}>⚠ Only {item.stock_qty} in stock — this will go negative.</div>
            )}
          </div>
        )}
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!bookingId) return alert("Select a guest/booking.");
            if (!item) return alert("Select an item.");
            onSave({ bookingId, item, quantity });
          }}
        >
          Add to bill
        </Button>
      </div>
    </Modal>
  );
}
