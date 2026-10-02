"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { DashboardRecord, Profile } from "@/lib/types";
import { emailPattern, validateSignup } from "@/lib/validation";

type Mode = "login" | "signup";
type Status = "loading" | "signedOut" | "signedIn" | "recovery" | "unavailable";
const emptySignup = { fullName: "", email: "", password: "", confirmPassword: "" };

function friendlyAuthError(message: string, mode: Mode) {
  const value = message.toLowerCase();
  if (value.includes("already") || value.includes("registered")) return "This email is already registered. Try logging in instead.";
  if (mode === "login" && (value.includes("invalid login") || value.includes("credentials"))) return "Incorrect email or password.";
  if (value.includes("password")) return "The password is invalid. Check the requirements and try again.";
  return "Authentication is temporarily unavailable. Please try again.";
}

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<Mode>("login");
  const [signup, setSignup] = useState(emptySignup);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<DashboardRecord[]>([]);
  const [view, setView] = useState<"pay" | "flow">("pay");
  const [newActivity, setNewActivity] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const activity = useMemo(() => records.filter((item) => item.data_type === "activity"), [records]);

  async function loadPrivateData(currentUser: User) {
    const supabase = getSupabase();
    const [profileResult, dashboardResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).single(),
      supabase.from("user_dashboard_data").select("*").order("created_at", { ascending: false }),
    ]);
    if (profileResult.error || dashboardResult.error || !profileResult.data) throw profileResult.error || dashboardResult.error || new Error("Profile unavailable");
    setUser(currentUser);
    setProfile(profileResult.data);
    setEditName(profileResult.data.full_name);
    setEditPhone(profileResult.data.phone || "");
    setRecords(dashboardResult.data || []);
    setStatus("signedIn");
  }

  useEffect(() => {
    let mounted = true;
    try {
      const supabase = getSupabase();
      Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Authentication timeout")), 8000)),
      ]).then(async ({ data, error }) => {
        if (!mounted) return;
        if (error) throw error;
        if (data.session?.user) await loadPrivateData(data.session.user);
        else setStatus("signedOut");
      }).catch(() => mounted && setStatus("unavailable"));
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;
        if (event === "PASSWORD_RECOVERY") setStatus("recovery");
        else if (event === "SIGNED_OUT") { setUser(null); setProfile(null); setRecords([]); setStatus("signedOut"); }
        else if (session?.user && event !== "INITIAL_SESSION") setTimeout(() => loadPrivateData(session.user).catch(() => setStatus("unavailable")), 0);
      });
      return () => { mounted = false; listener.subscription.unsubscribe(); };
    } catch { queueMicrotask(() => setStatus("unavailable")); }
  }, []);

  async function handleSignup(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const validation = validateSignup(signup);
    if (validation) return setMessage(validation);
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({ email: signup.email.trim().toLowerCase(), password: signup.password, options: { data: { full_name: signup.fullName.trim() } } });
      if (error) throw error;
      if (!data.session || !data.user) throw new Error("Email confirmation is enabled");
      await loadPrivateData(data.user);
      setSignup(emptySignup);
    } catch (error) { setMessage(friendlyAuthError(error instanceof Error ? error.message : "", "signup")); }
    finally { setBusy(false); }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (!emailPattern.test(login.email.trim())) return setMessage("Enter a valid email address.");
    setBusy(true);
    try {
      const { data, error } = await getSupabase().auth.signInWithPassword({ email: login.email.trim().toLowerCase(), password: login.password });
      if (error || !data.user) throw error || new Error("Invalid login credentials");
      await loadPrivateData(data.user);
      setLogin({ email: "", password: "" });
    } catch (error) { setMessage(friendlyAuthError(error instanceof Error ? error.message : "", "login")); }
    finally { setBusy(false); }
  }

  async function sendReset() {
    setMessage("");
    if (!emailPattern.test(login.email.trim())) return setMessage("Enter your email address first, then choose Forgot password.");
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(login.email.trim().toLowerCase(), { redirectTo: window.location.origin });
      if (error) throw error;
      setMessage("If an account exists for that email, a password-reset message has been sent.");
    } catch { setMessage("Password reset is temporarily unavailable. Please try again."); }
    finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("newPassword")?.toString() || "";
    const validation = validateSignup({ fullName: "OK", email: "ok@example.com", password, confirmPassword: password });
    if (validation) return setMessage(validation);
    setBusy(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage("Unable to update the password. Request a new reset email.");
    else { setMessage("Password updated. Your dashboard is ready."); setStatus("signedIn"); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const name = editName.trim();
    if (name.length < 2) { setBusy(false); return setMessage("Enter your full name."); }
    const { data, error } = await getSupabase().from("profiles").update({ full_name: name, phone: editPhone.trim() || null }).eq("id", user!.id).select().single();
    setBusy(false);
    if (error) setMessage("Profile could not be updated.");
    else { setProfile(data); setEditing(false); setMessage("Profile updated securely."); }
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault();
    if (!newActivity.trim()) return;
    setBusy(true); setMessage("");
    const { data, error } = await getSupabase().from("user_dashboard_data").insert({ user_id: user!.id, data_type: "activity", data: { label: newActivity.trim(), source: view } }).select().single();
    setBusy(false);
    if (error) setMessage("Activity could not be saved.");
    else { setRecords((current) => [data, ...current]); setNewActivity(""); }
  }

  async function logout() { setBusy(true); await getSupabase().auth.signOut(); setBusy(false); setMessage(""); }

  if (status === "loading") return <main className="center"><div className="loader"/><p>Loading your secure account…</p></main>;
  if (status === "unavailable") return <main className="center error-card"><h1>Service unavailable</h1><p>We could not reach the authentication or database service. Refresh to try again.</p><button onClick={() => location.reload()}>Try again</button></main>;
  if (status === "recovery") return <main className="auth-shell"><section className="auth-card"><Brand/><h1>Choose a new password</h1><form onSubmit={updatePassword}><PasswordInput name="newPassword" label="New password" shown={showPassword} toggle={() => setShowPassword(!showPassword)}/><button disabled={busy}>{busy ? "Updating…" : "Update password"}</button><Message text={message}/></form></section></main>;

  if (status === "signedOut") return <AuthScreen mode={mode} setMode={setMode} signup={signup} setSignup={setSignup} login={login} setLogin={setLogin} showPassword={showPassword} setShowPassword={setShowPassword} busy={busy} message={message} clearMessage={() => setMessage("")} handleLogin={handleLogin} handleSignup={handleSignup} sendReset={sendReset}/>;

  return <main className="app-shell"><header><Brand/><nav><button className={view === "pay" ? "active" : ""} onClick={() => setView("pay")}>FinisPay</button><button className={view === "flow" ? "active" : ""} onClick={() => setView("flow")}>FinisFlow</button></nav><button className="logout" onClick={logout} disabled={busy}>Secure logout</button></header><section className="hero"><div><p className="eyebrow">{view === "pay" ? "YOUR CONNECTED ACCOUNT" : "YOUR PRIVATE INVENTORY"}</p><h1>Welcome, {profile!.full_name}</h1><p>{view === "pay" ? "Your payment-style home and inventory signals, protected by one account." : "Your shelf-life dashboard opens through the same FinisPay session—no second login."}</p></div><div className="avatar" aria-label="User profile">{profile!.full_name.slice(0, 1).toUpperCase()}</div></section><section className="cards"><article><span>Account</span><strong>{profile!.email}</strong><small>{profile!.phone || "No phone added"}</small></article><article><span>Saved activity</span><strong>{activity.length}</strong><small>Private records</small></article><article><span>{view === "pay" ? "Inventory connection" : "Expiry priority"}</span><strong>{view === "pay" ? "Ready" : "FEFO"}</strong><small>{view === "pay" ? "FinisFlow access included" : "Earliest expiry first"}</small></article></section><section className="workspace"><article className="panel"><div className="panel-head"><div><p className="eyebrow">PERSONAL PROFILE</p><h2>Saved account details</h2></div><button className="outline" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit profile"}</button></div>{editing ? <form onSubmit={saveProfile}><label>Full name<input value={editName} onChange={(e) => setEditName(e.target.value)}/></label><label>Phone (optional)<input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}/></label><button disabled={busy}>Save profile</button></form> : <dl><dt>Full name</dt><dd>{profile!.full_name}</dd><dt>Email</dt><dd>{profile!.email}</dd><dt>Phone</dt><dd>{profile!.phone || "Not provided"}</dd></dl>}</article><article className="panel"><p className="eyebrow">{view === "pay" ? "FINISPAY ACTIVITY" : "FINISFLOW ACTIVITY"}</p><h2>Your saved activity</h2><form className="activity-form" onSubmit={addActivity}><input aria-label="New activity" placeholder={view === "pay" ? "e.g. Grocery payment ₹420" : "e.g. Use yogurt before Friday"} value={newActivity} onChange={(e) => setNewActivity(e.target.value)}/><button disabled={busy}>Save</button></form><div className="activity-list">{activity.length ? activity.map((item) => <div key={item.id}><b>{String(item.data.label)}</b><small>{new Date(item.created_at).toLocaleString()} · {String(item.data.source)}</small></div>) : <p className="empty">No activity yet. Add your first private record.</p>}</div></article></section><Message text={message}/></main>;
}

type AuthProps = { mode: Mode; setMode: (mode: Mode) => void; signup: typeof emptySignup; setSignup: (value: typeof emptySignup) => void; login: { email: string; password: string }; setLogin: (value: { email: string; password: string }) => void; showPassword: boolean; setShowPassword: (value: boolean) => void; busy: boolean; message: string; clearMessage: () => void; handleLogin: (event: FormEvent) => void; handleSignup: (event: FormEvent) => void; sendReset: () => void };
function AuthScreen(props: AuthProps) { return <main className="auth-shell"><section className="auth-story"><Brand/><p className="eyebrow">ONE ACCOUNT · TWO CONNECTED EXPERIENCES</p><h1>Pay once. Remember every product.</h1><p>FinisPay securely opens your personal payment and expiry dashboards. Sign in here once—FinisFlow will not ask again.</p><div className="flowline"><span>Pay</span><b>→</b><span>Update inventory</span><b>→</b><span>Act before expiry</span></div></section><section className="auth-card"><div className="tabs"><button className={props.mode === "login" ? "active" : ""} onClick={() => { props.setMode("login"); props.clearMessage(); }}>Login</button><button className={props.mode === "signup" ? "active" : ""} onClick={() => { props.setMode("signup"); props.clearMessage(); }}>Sign up</button></div>{props.mode === "login" ? <form onSubmit={props.handleLogin}><h2>Welcome back</h2><label>Email address<input type="email" autoComplete="email" value={props.login.email} onChange={(e) => props.setLogin({ ...props.login, email: e.target.value })} required/></label><PasswordInput name="password" label="Password" value={props.login.password} onChange={(value) => props.setLogin({ ...props.login, password: value })} shown={props.showPassword} toggle={() => props.setShowPassword(!props.showPassword)}/><button disabled={props.busy}>{props.busy ? "Signing in…" : "Login securely"}</button><button className="text-button" type="button" onClick={props.sendReset} disabled={props.busy}>Forgot password?</button></form> : <form onSubmit={props.handleSignup}><h2>Create your account</h2><label>Full name<input autoComplete="name" value={props.signup.fullName} onChange={(e) => props.setSignup({ ...props.signup, fullName: e.target.value })} required/></label><label>Email address<input type="email" autoComplete="email" value={props.signup.email} onChange={(e) => props.setSignup({ ...props.signup, email: e.target.value })} required/></label><PasswordInput name="new-password" label="Password" value={props.signup.password} onChange={(value) => props.setSignup({ ...props.signup, password: value })} shown={props.showPassword} toggle={() => props.setShowPassword(!props.showPassword)}/><label>Confirm password<input type={props.showPassword ? "text" : "password"} autoComplete="new-password" value={props.signup.confirmPassword} onChange={(e) => props.setSignup({ ...props.signup, confirmPassword: e.target.value })} required/></label><p className="hint">8+ characters · uppercase · lowercase · number</p><button disabled={props.busy}>{props.busy ? "Creating account…" : "Create account"}</button></form>}<Message text={props.message}/><p className="privacy">Passwords are handled only by Supabase Auth and are never stored in FinisPay tables.</p></section></main>; }
function Brand() { return <div className="brand">finis<span>pay</span> <i>× finisflow</i></div>; }
function Message({ text }: { text: string }) { return text ? <p className="message" role="status">{text}</p> : null; }
function PasswordInput({ name, label, value, onChange, shown, toggle }: { name: string; label: string; value?: string; onChange?: (value: string) => void; shown: boolean; toggle: () => void }) { return <label>{label}<div className="password"><input name={name} type={shown ? "text" : "password"} autoComplete={name.includes("new") ? "new-password" : "current-password"} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} required/><button type="button" onClick={toggle}>{shown ? "Hide" : "Show"}</button></div></label>; }
