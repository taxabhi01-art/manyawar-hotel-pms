import React, { useState } from "react";
import { supabase } from "../supabaseClient";

const QUICK_ISSUES = ["AC not cooling", "No hot water", "WiFi not working", "Room not cleaned", "TV not working", "Noise disturbance", "Other"];

export default function GuestReport({ roomNumber }) {
  const [issue, setIssue] = useState("");
  const [customIssue, setCustomIssue] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [status, setStatus] = useState("form"); // form | sending | done | error
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async () => {
    const finalIssue = issue === "Other" ? customIssue.trim() : issue;
    if (!finalIssue) return alert("Please select or describe the issue.");
    setStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("guest-report", {
        body: { room_number: roomNumber, issue: finalIssue, priority: urgent ? "Urgent" : "Medium" },
      });
      if (error || data?.error) throw new Error(data?.error || error.message);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e.message || "Something went wrong. Please call the front desk instead.");
      setStatus("error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F6F1E7", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 22, color: "#16233A" }}>MANYAWAR HOTEL</div>
          <div style={{ fontSize: 13, color: "#8a8578", marginTop: 4 }}>Room {roomNumber} — Report an issue</div>
        </div>

        {status === "done" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#16233A", marginBottom: 6 }}>Thank you!</div>
            <p style={{ fontSize: 13.5, color: "#5a5648" }}>
              Our staff has been notified and will attend to this shortly. If it's urgent, you can also call the front desk directly.
            </p>
          </div>
        ) : status === "error" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 10, color: "#A6452F" }}>⚠</div>
            <p style={{ fontSize: 13.5, color: "#5a5648" }}>{errorMsg}</p>
            <button onClick={() => setStatus("form")} style={{ marginTop: 14, background: "#16233A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14 }}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#16233A", marginBottom: 8 }}>What's the issue?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {QUICK_ISSUES.map((q) => (
                <button
                  key={q}
                  onClick={() => setIssue(q)}
                  style={{
                    padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                    border: issue === q ? "1.5px solid #16233A" : "1px solid #ddd",
                    background: issue === q ? "#16233A" : "#fff",
                    color: issue === q ? "#fff" : "#333",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            {issue === "Other" && (
              <textarea
                value={customIssue}
                onChange={(e) => setCustomIssue(e.target.value)}
                placeholder="Describe the issue…"
                rows={3}
                style={{ width: "100%", border: "1px solid #ddd", borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
              />
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#5a5648", marginBottom: 20 }}>
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              This is urgent, please prioritize
            </label>
            <button
              onClick={submit}
              disabled={status === "sending" || !issue}
              style={{
                width: "100%", background: "#16233A", color: "#fff", border: "none", borderRadius: 8,
                padding: "12px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: status === "sending" || !issue ? 0.6 : 1,
              }}
            >
              {status === "sending" ? "Sending…" : "Report issue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
