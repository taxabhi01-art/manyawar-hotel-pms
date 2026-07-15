import React, { useState } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency } from "../components.jsx";
import { addService, updateService, deleteService } from "../lib/api.js";

// Catalog management only — adding a service charge to a specific booking
// happens from the Billing tab (per-booking "+ Add service" button), the
// same way inventory usage is logged from Inventory.jsx but billed via
// Billing.jsx. Unlike inventory (hard-delete only, no stock concept here to
// protect), services get an active/inactive toggle so a seasonal/retired
// service can be hidden from new bookings without losing its history on
// bookings that already used it.
export default function Services({ services, reload }) {
  const [serviceModal, setServiceModal] = useState(null);

  const saveService = async (form) => {
    const { id, ...patch } = form;
    const { error } = id ? await updateService(id, patch) : await addService(patch);
    if (error) return alert(`Couldn't save this service: ${error.message}`);
    setServiceModal(null);
    reload();
  };

  const removeService = async (service) => {
    if (!confirm(`Delete "${service.name}" from services?`)) return;
    const { error } = await deleteService(service.id);
    if (error) return alert(`Couldn't delete this service: ${error.message}`);
    reload();
  };

  const toggleActive = async (service) => {
    const { error } = await updateService(service.id, { is_active: !service.is_active });
    if (error) return alert(`Couldn't update this service: ${error.message}`);
    reload();
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Extra charges"
        title="Services"
        action={
          <Button variant="ghost" onClick={() => setServiceModal("new")}>
            + Add service
          </Button>
        }
      />

      {services.length === 0 ? (
        <EmptyState text="No services yet." action={<Button onClick={() => setServiceModal("new")}>Add your first service</Button>} />
      ) : (
        services.map((service) => (
          <div className="card" key={service.id}>
            <div className="card-col">
              <div className="title">{service.name}</div>
              <div className="sub">{currency(service.price)}{service.description ? ` · ${service.description}` : ""}</div>
            </div>
            <Pill color={service.is_active !== false ? "#5f8863" : "#a6452f"}>{service.is_active !== false ? "Active" : "Inactive"}</Pill>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <Button variant="ghost" onClick={() => toggleActive(service)}>
                {service.is_active !== false ? "Deactivate" : "Activate"}
              </Button>
              <Button variant="ghost" onClick={() => setServiceModal(service)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => removeService(service)}>
                Delete
              </Button>
            </div>
          </div>
        ))
      )}

      {serviceModal && (
        <ServiceModal service={serviceModal === "new" ? null : serviceModal} onClose={() => setServiceModal(null)} onSave={saveService} />
      )}
    </div>
  );
}

function ServiceModal({ service, onClose, onSave }) {
  const [form, setForm] = useState(service || { name: "", price: 0, description: "" });
  return (
    <Modal title={service ? "Edit service" : "Add service"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Service name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Room service" />
        </Field>
        <Field label="Price">
          <input className="input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        </Field>
        <Field label="Description (optional)">
          <input className="input" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Per meal, delivered to room" />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!form.name.trim()) return alert("Service name is required.");
            onSave(form);
          }}
        >
          Save service
        </Button>
      </div>
    </Modal>
  );
}
