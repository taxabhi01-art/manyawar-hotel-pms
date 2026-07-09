import React, { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h2>MANYAWAR HOTEL</h2>
        <p>Staff sign-in</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={{ color: "#a6452f", fontSize: 12.5, margin: 0 }}>{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 11.5, color: "#46536b" }}>
          Don't have an account? Ask your admin to create one from the Supabase dashboard (Authentication → Users).
        </p>
      </form>
    </div>
  );
}
