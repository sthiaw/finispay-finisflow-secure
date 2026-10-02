"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import {
  BrowserMultiFormatReader,
  BrowserQRCodeReader,
  type IScannerControls,
} from "@zxing/browser";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Barcode,
  Bell,
  Boxes,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Eye,
  EyeOff,
  House,
  Leaf,
  LogOut,
  PackagePlus,
  QrCode,
  ReceiptText,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  TriangleAlert,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type {
  DashboardRecord,
  InventoryData,
  PaymentData,
  Profile,
  WalletData,
} from "@/lib/types";
import { emailPattern, validateSignup } from "@/lib/validation";

type Mode = "login" | "signup";
type Status = "loading" | "signedOut" | "signedIn" | "recovery" | "unavailable";
type View = "home" | "pay" | "inventory" | "insights" | "profile";
type Modal = "scan" | "receive" | "send" | "add" | null;
type InventoryRow = DashboardRecord & { item: InventoryData };
type PaymentRow = DashboardRecord & { payment: PaymentData };
const emptySignup = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const dateLabel = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const isoAfter = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysLeft = (date: string) =>
  Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);

const starterInventory: InventoryData[] = [
  {
    name: "Greek Yogurt 400g",
    sku: "8901030875612",
    batch: "GY-2410",
    location: "Main shelf",
    quantity: 8,
    unitPrice: 95,
    manufacturedAt: isoAfter(-12),
    expiryDate: isoAfter(3),
    category: "Dairy",
  },
  {
    name: "Whole Wheat Bread",
    sku: "8906001021134",
    batch: "WB-0842",
    location: "Bakery rack",
    quantity: 5,
    unitPrice: 55,
    manufacturedAt: isoAfter(-3),
    expiryDate: isoAfter(5),
    category: "Bakery",
  },
  {
    name: "Fresh Orange Juice",
    sku: "8901491102204",
    batch: "OJ-7721",
    location: "Chiller 1",
    quantity: 12,
    unitPrice: 120,
    manufacturedAt: isoAfter(-8),
    expiryDate: isoAfter(12),
    category: "Beverages",
  },
  {
    name: "Basmati Rice 1kg",
    sku: "8901058001482",
    batch: "BR-5194",
    location: "Aisle 4",
    quantity: 18,
    unitPrice: 180,
    manufacturedAt: isoAfter(-60),
    expiryDate: isoAfter(180),
    category: "Grocery",
  },
];

function friendlyAuthError(message: string, mode: Mode) {
  const value = message.toLowerCase();
  if (value.includes("already") || value.includes("registered"))
    return "This email is already registered. Try logging in instead.";
  if (
    mode === "login" &&
    (value.includes("invalid login") || value.includes("credentials"))
  )
    return "Incorrect email or password.";
  if (value.includes("password"))
    return "The password is invalid. Check the requirements and try again.";
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
  const [view, setView] = useState<View>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const inventory = useMemo(
    () =>
      records
        .filter((r) => r.data_type === "inventory")
        .map((r) => ({ ...r, item: r.data as unknown as InventoryData }))
        .sort((a, b) => a.item.expiryDate.localeCompare(b.item.expiryDate)),
    [records],
  );
  const payments = useMemo(
    () =>
      records
        .filter((r) => r.data_type === "payment")
        .map((r) => ({ ...r, payment: r.data as unknown as PaymentData }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [records],
  );
  const walletRecord = records.find((r) => r.data_type === "wallet");
  const balance = Number(
    (walletRecord?.data as unknown as WalletData | undefined)?.balance ?? 2450,
  );
  const atRisk = inventory
    .filter(({ item }) => daysLeft(item.expiryDate) <= 30)
    .reduce((sum, { item }) => sum + item.quantity * item.unitPrice, 0);
  const urgentUnits = inventory
    .filter(({ item }) => daysLeft(item.expiryDate) <= 7)
    .reduce((sum, { item }) => sum + item.quantity, 0);
  const totalUnits = inventory.reduce(
    (sum, { item }) => sum + item.quantity,
    0,
  );

  async function seedWorkspace(currentUser: User, current: DashboardRecord[]) {
    if (current.some((r) => r.data_type === "inventory")) return current;
    const rows = [
      { user_id: currentUser.id, data_type: "wallet", data: { balance: 2450 } },
      ...starterInventory.map((item) => ({
        user_id: currentUser.id,
        data_type: "inventory",
        data: item,
      })),
      {
        user_id: currentUser.id,
        data_type: "payment",
        data: {
          title: "Welcome reward",
          counterparty: "FinisPay demo",
          amount: 250,
          direction: "received",
          reference: `FP-${Date.now().toString().slice(-8)}`,
        },
      },
    ];
    const { data, error } = await getSupabase()
      .from("user_dashboard_data")
      .insert(rows)
      .select("*");
    if (error) throw error;
    return [...(data || []), ...current];
  }
  async function loadPrivateData(currentUser: User) {
    const supabase = getSupabase();
    const [p, d] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentUser.id).single(),
      supabase
        .from("user_dashboard_data")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    if (p.error || d.error || !p.data)
      throw p.error || d.error || new Error("Profile unavailable");
    const hydrated = await seedWorkspace(currentUser, d.data || []);
    setUser(currentUser);
    setProfile(p.data);
    setEditName(p.data.full_name);
    setEditPhone(p.data.phone || "");
    setRecords(hydrated);
    setStatus("signedIn");
  }
  useEffect(() => {
    let mounted = true;
    try {
      const supabase = getSupabase();
      Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 8000),
        ),
      ])
        .then(async ({ data, error }) => {
          if (!mounted) return;
          if (error) throw error;
          if (data.session?.user) await loadPrivateData(data.session.user);
          else setStatus("signedOut");
        })
        .catch(() => mounted && setStatus("unavailable"));
      const { data: listener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) return;
          if (event === "PASSWORD_RECOVERY") setStatus("recovery");
          else if (event === "SIGNED_OUT") {
            setUser(null);
            setProfile(null);
            setRecords([]);
            setStatus("signedOut");
          } else if (session?.user && event !== "INITIAL_SESSION")
            setTimeout(
              () =>
                loadPrivateData(session.user).catch(() =>
                  setStatus("unavailable"),
                ),
              0,
            );
        },
      );
      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => setStatus("unavailable"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const validation = validateSignup(signup);
    if (validation) return setMessage(validation);
    setBusy(true);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email: signup.email.trim().toLowerCase(),
        password: signup.password,
        options: { data: { full_name: signup.fullName.trim() } },
      });
      if (error) throw error;
      if (!data.session || !data.user)
        throw new Error("Email confirmation is enabled");
      await loadPrivateData(data.user);
      setSignup(emptySignup);
    } catch (error) {
      setMessage(
        friendlyAuthError(
          error instanceof Error ? error.message : "",
          "signup",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!emailPattern.test(login.email.trim()))
      return setMessage("Enter a valid email address.");
    setBusy(true);
    try {
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: login.email.trim().toLowerCase(),
        password: login.password,
      });
      if (error || !data.user)
        throw error || new Error("Invalid login credentials");
      await loadPrivateData(data.user);
      setLogin({ email: "", password: "" });
    } catch (error) {
      setMessage(
        friendlyAuthError(error instanceof Error ? error.message : "", "login"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendReset() {
    setMessage("");
    if (!emailPattern.test(login.email.trim()))
      return setMessage(
        "Enter your email address first, then choose Forgot password.",
      );
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(
        login.email.trim().toLowerCase(),
        { redirectTo: window.location.origin },
      );
      if (error) throw error;
      setMessage(
        "If an account exists, a password-reset message has been sent.",
      );
    } catch {
      setMessage("Password reset is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password =
      new FormData(event.currentTarget).get("newPassword")?.toString() || "";
    const validation = validateSignup({
      fullName: "OK",
      email: "ok@example.com",
      password,
      confirmPassword: password,
    });
    if (validation) return setMessage(validation);
    setBusy(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage("Unable to update the password.");
    else {
      setMessage("Password updated.");
      setStatus("signedIn");
    }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const name = editName.trim();
    if (name.length < 2) {
      setBusy(false);
      return setMessage("Enter your full name.");
    }
    const { data, error } = await getSupabase()
      .from("profiles")
      .update({ full_name: name, phone: editPhone.trim() || null })
      .eq("id", user!.id)
      .select()
      .single();
    setBusy(false);
    if (error) setMessage("Profile could not be updated.");
    else {
      setProfile(data);
      setMessage("Profile updated securely.");
    }
  }
  async function saveRecord(type: string, data: Record<string, unknown>) {
    const result = await getSupabase()
      .from("user_dashboard_data")
      .insert({ user_id: user!.id, data_type: type, data })
      .select()
      .single();
    if (result.error) throw result.error;
    setRecords((current) => [result.data, ...current]);
    return result.data as DashboardRecord;
  }
  async function setWallet(next: number) {
    if (walletRecord) {
      const { data, error } = await getSupabase()
        .from("user_dashboard_data")
        .update({ data: { balance: next } })
        .eq("id", walletRecord.id)
        .select()
        .single();
      if (error) throw error;
      setRecords((current) =>
        current.map((r) => (r.id === data.id ? data : r)),
      );
    } else await saveRecord("wallet", { balance: next });
  }
  async function addInventory(item: InventoryData) {
    await saveRecord("inventory", item as unknown as Record<string, unknown>);
    setModal(null);
    setMessage(`${item.name} saved to your private inventory.`);
  }
  async function completePayment(
    payment: PaymentData,
    purchased?: InventoryData,
  ) {
    setBusy(true);
    try {
      await saveRecord(
        "payment",
        payment as unknown as Record<string, unknown>,
      );
      await setWallet(
        Math.max(
          0,
          balance +
            (payment.direction === "received"
              ? payment.amount
              : -payment.amount),
        ),
      );
      if (purchased)
        await saveRecord(
          "inventory",
          purchased as unknown as Record<string, unknown>,
        );
      setModal(null);
      setMessage(
        payment.direction === "sent"
          ? "Demo payment complete. Product details are now in FinisFlow."
          : "Demo payment received.",
      );
    } catch {
      setMessage("The transaction could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function markAction(record: DashboardRecord, action: string) {
    const { data, error } = await getSupabase()
      .from("user_dashboard_data")
      .update({ data: { ...record.data, actionStatus: action } })
      .eq("id", record.id)
      .select()
      .single();
    if (error) return setMessage("Action could not be saved.");
    setRecords((current) => current.map((r) => (r.id === data.id ? data : r)));
    setMessage(`${action} marked for ${String(record.data.name)}.`);
  }
  async function logout() {
    setBusy(true);
    await getSupabase().auth.signOut();
    setBusy(false);
    setMessage("");
  }

  if (status === "loading")
    return (
      <main className="center">
        <div className="loader" />
        <Brand />
        <p>Opening your secure workspace…</p>
      </main>
    );
  if (status === "unavailable")
    return (
      <main className="center error-card">
        <TriangleAlert />
        <h1>Service unavailable</h1>
        <p>We could not reach authentication or your private database.</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (status === "recovery")
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <h1>Choose a new password</h1>
          <form onSubmit={updatePassword}>
            <PasswordInput
              name="newPassword"
              label="New password"
              shown={showPassword}
              toggle={() => setShowPassword(!showPassword)}
            />
            <button disabled={busy}>Update password</button>
          </form>
        </section>
      </main>
    );
  if (status === "signedOut")
    return (
      <AuthScreen
        mode={mode}
        setMode={setMode}
        signup={signup}
        setSignup={setSignup}
        login={login}
        setLogin={setLogin}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        busy={busy}
        message={message}
        clearMessage={() => setMessage("")}
        handleLogin={handleLogin}
        handleSignup={handleSignup}
        sendReset={sendReset}
      />
    );

  const firstName = profile!.full_name.split(/\s+/)[0];
  const filteredInventory = inventory.filter(({ item }) => {
    const matches = `${item.name} ${item.sku} ${item.batch}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const days = daysLeft(item.expiryDate);
    return (
      matches &&
      (riskFilter === "all" ||
        (riskFilter === "critical" && days <= 7) ||
        (riskFilter === "watch" && days > 7 && days <= 30) ||
        (riskFilter === "safe" && days > 30))
    );
  });
  const nav: [View, typeof House, string][] = [
    ["home", House, "Home"],
    ["pay", WalletCards, "FinisPay"],
    ["inventory", Boxes, "Inventory"],
    ["insights", TrendingUp, "Insights"],
    ["profile", CircleUserRound, "Account"],
  ];
  return (
    <main className="product-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-chip">
          <div>{profile!.full_name[0]}</div>
          <span>
            <b>{profile!.full_name}</b>
            <small>Personal workspace</small>
          </span>
        </div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              <Icon />
              <span>{label}</span>
              {id === "inventory" && urgentUnits > 0 && <em>{urgentUnits}</em>}
            </button>
          ))}
        </nav>
        <div className="side-status">
          <ShieldCheck />
          <span>
            <b>Private by design</b>
            <small>Protected by row-level security.</small>
          </span>
        </div>
        <button className="side-logout" onClick={logout}>
          <LogOut /> Sign out
        </button>
      </aside>
      <section className="product-main">
        <header className="topbar">
          <div>
            <p>
              {view === "home"
                ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${firstName}`
                : view === "pay"
                  ? "FinisPay"
                  : view === "inventory"
                    ? "FinisFlow inventory"
                    : view === "insights"
                      ? "Shelf-life intelligence"
                      : "Your account"}
            </p>
            <small>{dateLabel.format(new Date())}</small>
          </div>
          <div className="top-actions">
            <button>
              <Bell />
              <i />
            </button>
            <button className="user-button" onClick={() => setView("profile")}>
              {profile!.full_name[0]}
            </button>
          </div>
        </header>
        <div className="content">
          {view === "home" && (
            <HomeView
              balance={balance}
              urgentUnits={urgentUnits}
              totalUnits={totalUnits}
              atRisk={atRisk}
              inventory={inventory}
              payments={payments}
              open={setModal}
              go={setView}
            />
          )}{" "}
          {view === "pay" && (
            <PayView balance={balance} payments={payments} open={setModal} />
          )}{" "}
          {view === "inventory" && (
            <InventoryView
              inventory={filteredInventory}
              search={search}
              setSearch={setSearch}
              riskFilter={riskFilter}
              setRiskFilter={setRiskFilter}
              open={setModal}
              action={markAction}
            />
          )}{" "}
          {view === "insights" && (
            <InsightsView
              inventory={inventory}
              atRisk={atRisk}
              urgentUnits={urgentUnits}
            />
          )}{" "}
          {view === "profile" && (
            <ProfileView
              profile={profile!}
              editName={editName}
              setEditName={setEditName}
              editPhone={editPhone}
              setEditPhone={setEditPhone}
              save={saveProfile}
              logout={logout}
              busy={busy}
            />
          )}
        </div>
        <nav className="mobile-nav">
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              <Icon />
              <span>{label === "Inventory" ? "Stock" : label}</span>
            </button>
          ))}
        </nav>
      </section>
      {modal && (
        <ActionModal
          type={modal}
          close={() => setModal(null)}
          inventory={inventory}
          balance={balance}
          profile={profile!}
          busy={busy}
          pay={completePayment}
          add={addInventory}
        />
      )}
      <Message text={message} floating />
    </main>
  );
}

function HomeView({
  balance,
  urgentUnits,
  totalUnits,
  atRisk,
  inventory,
  payments,
  open,
  go,
}: {
  balance: number;
  urgentUnits: number;
  totalUnits: number;
  atRisk: number;
  inventory: InventoryRow[];
  payments: PaymentRow[];
  open: (m: Modal) => void;
  go: (v: View) => void;
}) {
  return (
    <>
      <section className="welcome-row">
        <div>
          <span className="kicker">
            <Sparkles /> FINISPAY + FINISFLOW
          </span>
          <h1>Money moves. Product memory follows.</h1>
          <p>
            Every demo grocery payment can carry its batch, manufacturing date,
            and expiry into your private inventory.
          </p>
        </div>
        <div className="sync-badge">
          <Zap />
          <span>
            <b>Live workspace</b>
            <small>Saved to your account</small>
          </span>
        </div>
      </section>
      <section className="home-grid">
        <article className="balance-card">
          <div className="balance-top">
            <span>Available demo balance</span>
            <WalletCards />
          </div>
          <strong>{money.format(balance)}</strong>
          <small>For demonstration only · no real money moves</small>
          <div className="balance-actions">
            <Quick
              icon={<QrCode />}
              label="Scan & pay"
              onClick={() => open("scan")}
            />
            <Quick icon={<Send />} label="Send" onClick={() => open("send")} />
            <Quick
              icon={<ArrowDownLeft />}
              label="Receive"
              onClick={() => open("receive")}
            />
            <Quick
              icon={<PackagePlus />}
              label="Add stock"
              onClick={() => open("add")}
            />
          </div>
        </article>
        <article className="expiry-card">
          <div className="card-heading">
            <span>
              <Leaf /> FinisFlow snapshot
            </span>
            <button onClick={() => go("inventory")}>
              Open inventory <ChevronRight />
            </button>
          </div>
          <div className="expiry-metrics">
            <div>
              <small>Use first</small>
              <strong>{urgentUnits}</strong>
              <span>units in 7 days</span>
            </div>
            <div>
              <small>Tracked</small>
              <strong>{totalUnits}</strong>
              <span>across {inventory.length} batches</span>
            </div>
            <div>
              <small>Value at risk</small>
              <strong>{money.format(atRisk)}</strong>
              <span>next 30 days</span>
            </div>
          </div>
          <div className="health">
            <span>
              <b>Inventory health</b>
              <small>FEFO priorities are active</small>
            </span>
            <strong>
              {inventory.length
                ? Math.max(
                    58,
                    100 -
                      Math.round((urgentUnits / Math.max(1, totalUnits)) * 100),
                  )
                : 100}
              %
            </strong>
          </div>
        </article>
      </section>
      <section className="dashboard-grid">
        <PanelTitle
          kicker="FEFO QUEUE"
          title="Use or sell these first"
          action="View all"
          onClick={() => go("inventory")}
        >
          <div className="priority-list">
            {inventory.slice(0, 4).map(({ id, item }) => (
              <InventoryMini key={id} item={item} />
            ))}
          </div>
        </PanelTitle>
        <PanelTitle
          kicker="RECENT ACTIVITY"
          title="Payments & product updates"
          action="History"
          onClick={() => go("pay")}
        >
          <div className="payment-list">
            {payments.slice(0, 4).map(({ id, payment, created_at }) => (
              <PaymentMini key={id} payment={payment} date={created_at} />
            ))}
          </div>
        </PanelTitle>
      </section>
    </>
  );
}
function PayView({
  balance,
  payments,
  open,
}: {
  balance: number;
  payments: PaymentRow[];
  open: (m: Modal) => void;
}) {
  return (
    <>
      <PageHead
        kicker="PAYMENT-LINKED INVENTORY"
        title="Your FinisPay"
        copy="A familiar payment demo that remembers the products behind each transaction."
        action="Scan & pay"
        onClick={() => open("scan")}
      />
      <section className="pay-layout">
        <article className="wallet-card">
          <div>
            <span>FinisPay balance</span>
            <CreditCard />
          </div>
          <strong>{money.format(balance)}</strong>
          <small>Safe demonstration balance</small>
          <div className="wallet-buttons">
            <button onClick={() => open("send")}>
              <ArrowUpRight /> Send money
            </button>
            <button onClick={() => open("receive")}>
              <ArrowDownLeft /> Receive money
            </button>
          </div>
        </article>
        <article className="surface quick-surface">
          <span className="kicker">QUICK ACTIONS</span>
          <h2>Do more with each payment</h2>
          <div className="quick-tiles">
            <QuickTile
              icon={<QrCode />}
              title="Pay grocery QR"
              copy="Add products automatically"
              onClick={() => open("scan")}
            />
            <QuickTile
              icon={<Store />}
              title="Create checkout"
              copy="Receive and deduct stock"
              onClick={() => open("receive")}
            />
            <QuickTile
              icon={<Send />}
              title="Pay a contact"
              copy="Simple demo transfer"
              onClick={() => open("send")}
            />
            <QuickTile
              icon={<Barcode />}
              title="Capture product"
              copy="Barcode or manual details"
              onClick={() => open("add")}
            />
          </div>
        </article>
      </section>
      <PanelTitle kicker="PRIVATE LEDGER" title="Transaction history">
        <div className="payment-list large">
          {payments.length ? (
            payments.map(({ id, payment, created_at }) => (
              <PaymentMini key={id} payment={payment} date={created_at} />
            ))
          ) : (
            <Empty
              icon={<ReceiptText />}
              title="No payments yet"
              copy="Your simulated transactions will appear here."
            />
          )}
        </div>
      </PanelTitle>
    </>
  );
}
function InventoryView({
  inventory,
  search,
  setSearch,
  riskFilter,
  setRiskFilter,
  open,
  action,
}: {
  inventory: InventoryRow[];
  search: string;
  setSearch: (v: string) => void;
  riskFilter: string;
  setRiskFilter: (v: string) => void;
  open: (m: Modal) => void;
  action: (r: DashboardRecord, a: string) => void;
}) {
  return (
    <>
      <PageHead
        kicker="BATCH-LEVEL VISIBILITY"
        title="Inventory that knows its shelf life"
        copy="FEFO automatically puts the earliest-expiring batch first."
        action="Add inventory"
        onClick={() => open("add")}
      />
      <section className="inventory-tools">
        <label>
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, SKU or batch"
          />
        </label>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
        >
          <option value="all">All shelf-life states</option>
          <option value="critical">Critical · 0–7 days</option>
          <option value="watch">Watch · 8–30 days</option>
          <option value="safe">Safe · 31+ days</option>
        </select>
      </section>
      <section className="surface inventory-surface">
        <div className="inventory-header">
          <span>Product / batch</span>
          <span>Stock</span>
          <span>Expiry</span>
          <span>At-risk value</span>
          <span>Recommended action</span>
        </div>
        {inventory.length ? (
          inventory.map((row) => (
            <InventoryLine key={row.id} row={row} action={action} />
          ))
        ) : (
          <Empty
            icon={<Search />}
            title="No matching inventory"
            copy="Adjust the filter or add a new batch."
          />
        )}
      </section>
    </>
  );
}
function InsightsView({
  inventory,
  atRisk,
  urgentUnits,
}: {
  inventory: InventoryRow[];
  atRisk: number;
  urgentUnits: number;
}) {
  const recoverable = Math.round(atRisk * 0.72);
  return (
    <>
      <PageHead
        kicker="DECISIONS, NOT JUST DATES"
        title="Shelf-life intelligence"
        copy="See where value is at risk and what action can recover it."
      />
      <section className="metric-grid">
        <Metric
          icon={<TriangleAlert />}
          label="Inventory at risk"
          value={money.format(atRisk)}
          note={`${urgentUnits} units need priority`}
          tone="rust"
        />
        <Metric
          icon={<Leaf />}
          label="Value recoverable"
          value={money.format(recoverable)}
          note="with suggested actions"
          tone="green"
        />
        <Metric
          icon={<Store />}
          label="Locations tracked"
          value={String(
            new Set(inventory.map(({ item }) => item.location)).size,
          )}
          note="connected workspace"
          tone="amber"
        />
        <Metric
          icon={<Check />}
          label="FEFO compliance"
          value="94%"
          note="earliest expiry prioritised"
          tone="green"
        />
      </section>
      <section className="insight-grid">
        <PanelTitle kicker="RISK BY WINDOW" title="Where the risk sits">
          <RiskBars inventory={inventory} />
        </PanelTitle>
        <PanelTitle kicker="RECOMMENDED PLAYS" title="Recover more value">
          <div className="play-list">
            <Play
              icon="%"
              title="Discount"
              copy="Move short-dated stock"
              value={money.format(recoverable * 0.42)}
            />
            <Play
              icon="+"
              title="Bundle"
              copy="Pair with popular products"
              value={money.format(recoverable * 0.25)}
            />
            <Play
              icon="↗"
              title="Move"
              copy="Shift toward demand"
              value={money.format(recoverable * 0.2)}
            />
            <Play
              icon="↩"
              title="Return"
              copy="Flag supplier returns"
              value={money.format(recoverable * 0.13)}
            />
          </div>
        </PanelTitle>
      </section>
      <section className="network-banner">
        <div>
          <span className="kicker">BUILT TO SCALE</span>
          <h2>From one pantry to a supply-chain network</h2>
          <p>
            The same system can connect batch aging, demand signals, stock
            movement, and consumer behaviour—without repeated entry.
          </p>
        </div>
        <div className="network-flow">
          <span>Consumer</span>
          <i>→</i>
          <span>Retailer</span>
          <i>→</i>
          <span>Distributor</span>
          <i>→</i>
          <span>Manufacturer</span>
        </div>
      </section>
    </>
  );
}
function ProfileView({
  profile,
  editName,
  setEditName,
  editPhone,
  setEditPhone,
  save,
  logout,
  busy,
}: {
  profile: Profile;
  editName: string;
  setEditName: (v: string) => void;
  editPhone: string;
  setEditPhone: (v: string) => void;
  save: (e: FormEvent) => void;
  logout: () => void;
  busy: boolean;
}) {
  return (
    <>
      <PageHead
        kicker="CONNECTED ACCOUNT"
        title="Your profile"
        copy="One secure identity opens both FinisPay and FinisFlow."
      />
      <section className="profile-layout">
        <article className="profile-summary">
          <div className="big-avatar">{profile.full_name[0]}</div>
          <h2>{profile.full_name}</h2>
          <p>{profile.email}</p>
          <span>
            <ShieldCheck /> Authenticated account
          </span>
          <button onClick={logout}>
            <LogOut /> Secure logout
          </button>
        </article>
        <article className="surface profile-form">
          <div className="section-title">
            <div>
              <span className="kicker">PERSONAL DETAILS</span>
              <h2>Edit profile</h2>
            </div>
            <Settings2 />
          </div>
          <form onSubmit={save}>
            <label>
              Full name
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label>
              Email address
              <input value={profile.email} disabled />
            </label>
            <label>
              Phone number <small>optional</small>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </label>
            <button disabled={busy}>Save changes</button>
          </form>
          <div className="data-note">
            <ShieldCheck />
            <span>
              <b>Your records are isolated</b>
              <small>
                Only this account can access its profile, inventory, payments,
                and dashboard records.
              </small>
            </span>
          </div>
        </article>
      </section>
    </>
  );
}

function ActionModal({
  type,
  close,
  inventory,
  balance,
  profile,
  busy,
  pay,
  add,
}: {
  type: Exclude<Modal, null>;
  close: () => void;
  inventory: InventoryRow[];
  balance: number;
  profile: Profile;
  busy: boolean;
  pay: (p: PaymentData, i?: InventoryData) => void;
  add: (i: InventoryData) => void;
}) {
  const [receiveAmount, setReceiveAmount] = useState(180);
  const [selected, setSelected] = useState(inventory[0]?.id || "");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const selectedItem = inventory.find((r) => r.id === selected)?.item;
  const qrPayload = JSON.stringify({
    app: "FinisPay",
    recipient: profile.email,
    amount: receiveAmount,
    item: selectedItem?.name,
    sku: selectedItem?.sku,
    batch: selectedItem?.batch,
    manufacturedAt: selectedItem?.manufacturedAt,
    expiry: selectedItem?.expiryDate,
    code: `FP-${profile.id.slice(0, 6)}-${receiveAmount}`,
  });
  useEffect(() => {
    return () => {
      scannerControlsRef.current?.stop();
    };
  }, []);

  function stopCamera() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  function setScannedCheckout(rawValue: string) {
    try {
      const value = JSON.parse(rawValue) as Record<string, unknown>;
      const values: Record<string, string> = {
        counterparty: String(value.recipient || "FinisPay merchant"),
        amount: String(value.amount || 0),
        product: String(value.item || "Scanned product"),
        barcode: String(value.sku || value.code || rawValue),
        batch: String(value.batch || "SCANNED"),
        manufacturedAt: String(value.manufacturedAt || isoAfter(-1)),
        expiryDate: String(value.expiry || isoAfter(14)),
      };
      Object.entries(values).forEach(([name, fieldValue]) => {
        const field = document.querySelector<HTMLInputElement>(
          `.scan-payment-form [name="${name}"]`,
        );
        if (field) field.value = fieldValue;
      });
      setScanStatus("Checkout scanned. Review the details, then pay.");
    } catch {
      const field = document.querySelector<HTMLInputElement>(
        '.scan-payment-form [name="barcode"]',
      );
      if (field) field.value = rawValue;
      setScanStatus("Code scanned. Product barcode has been filled in.");
    }
    stopCamera();
  }

  async function startCamera() {
    setScanStatus("Requesting camera access…");
    try {
      setCameraOpen(true);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview unavailable");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 300,
      });
      scannerControlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video,
        (result, _error, controls) => {
          if (!result) return;
          controls.stop();
          scannerControlsRef.current = null;
          setScannedCheckout(result.getText());
        },
      );
      setScanStatus("Align the FinisPay QR inside the frame.");
    } catch (error) {
      stopCamera();
      const denied =
        error instanceof DOMException && error.name === "NotAllowedError";
      setScanStatus(
        denied
          ? "Camera permission was not granted. Allow camera access or upload a QR image."
          : "Camera could not start. Upload a QR image or enter the details manually.",
      );
    }
  }
  function submitPay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = Number(f.get("amount"));
    if (!amount || amount > balance) return;
    const purchase =
      type === "scan"
        ? {
            name: String(f.get("product")),
            sku: String(f.get("barcode")),
            batch: String(f.get("batch")),
            location: "My pantry",
            quantity: 1,
            unitPrice: amount,
            manufacturedAt: String(f.get("manufacturedAt")),
            expiryDate: String(f.get("expiryDate")),
            category: "Purchase",
          }
        : undefined;
    pay(
      {
        title: type === "scan" ? "Grocery checkout" : "Contact transfer",
        counterparty: String(f.get("counterparty")),
        amount,
        direction: "sent",
        reference: `FP-${Date.now().toString().slice(-10)}`,
        note: type === "scan" ? "Inventory-linked purchase" : "Demo transfer",
      },
      purchase,
    );
  }
  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    add({
      name: String(f.get("name")),
      sku: String(f.get("sku")),
      batch: String(f.get("batch")),
      location: String(f.get("location")),
      quantity: Number(f.get("quantity")),
      unitPrice: Number(f.get("unitPrice")),
      manufacturedAt: String(f.get("manufacturedAt")),
      expiryDate: String(f.get("expiryDate")),
      category: String(f.get("category")),
    });
  }
  async function scanImage(file?: File) {
    if (!file) return;
    const imageUrl = URL.createObjectURL(file);
    try {
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(
        imageUrl,
      );
      if (type === "scan") setScannedCheckout(result.getText());
      else {
        const field =
          document.querySelector<HTMLInputElement>("#barcode-field");
        if (field) field.value = result.getText();
        setScanStatus("Barcode read from image.");
      }
    } catch {
      setScanStatus("No readable barcode or QR was found. Enter it manually.");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.currentTarget === e.target && close()}
    >
      <section className="modal-panel">
        <button className="modal-close" onClick={close}>
          <X />
        </button>
        {type === "receive" ? (
          <>
            <span className="kicker">DYNAMIC CHECKOUT</span>
            <h2>Receive payment</h2>
            <p>
              Create a product-linked QR. Confirming it records demo income and
              reduces one unit.
            </p>
            <div className="qr-layout">
              <div className="qr-box">
                <QRCodeSVG
                  value={qrPayload}
                  size={184}
                  bgColor="#fffdf7"
                  fgColor="#123d2a"
                  includeMargin
                />
                <span>FINISPAY DEMO QR</span>
              </div>
              <div className="qr-controls">
                <label>
                  Amount (₹)
                  <input
                    type="number"
                    min="1"
                    value={receiveAmount}
                    onChange={(e) => setReceiveAmount(Number(e.target.value))}
                  />
                </label>
                <label>
                  Product to sell
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {inventory
                      .filter((r) => r.item.quantity > 0)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.item.name} · {r.item.quantity} left
                        </option>
                      ))}
                  </select>
                </label>
                <div className="checkout-note">
                  {selectedItem ? (
                    <>
                      <b>{selectedItem.name}</b>
                      <span>
                        Batch {selectedItem.batch} · expires{" "}
                        {dateLabel.format(
                          new Date(`${selectedItem.expiryDate}T12:00:00`),
                        )}
                      </span>
                    </>
                  ) : (
                    "Add inventory first."
                  )}
                </div>
                <button
                  className="primary full"
                  disabled={busy || !selectedItem}
                  onClick={async () => {
                    if (!selectedItem) return;
                    await pay({
                      title: `Sale · ${selectedItem.name}`,
                      counterparty: "Demo customer",
                      amount: receiveAmount,
                      direction: "received",
                      reference: `FP-${Date.now().toString().slice(-10)}`,
                      note: `Batch ${selectedItem.batch}`,
                    });
                    const row = inventory.find((r) => r.id === selected);
                    if (row)
                      await getSupabase()
                        .from("user_dashboard_data")
                        .update({
                          data: {
                            ...row.data,
                            quantity: Math.max(0, selectedItem.quantity - 1),
                          },
                        })
                        .eq("id", row.id);
                  }}
                >
                  Simulate payment received
                </button>
              </div>
            </div>
          </>
        ) : type === "add" ? (
          <>
            <span className="kicker">CAPTURE STOCK</span>
            <h2>Add inventory</h2>
            <p>Scan a barcode image or enter the batch details manually.</p>
            <form className="modal-form" onSubmit={submitAdd}>
              <div className="scan-upload">
                <Barcode />
                <span>
                  <b>Barcode capture</b>
                  <small>Read on this device when supported.</small>
                </span>
                <label>
                  <Camera /> Choose image
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => scanImage(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className="form-grid">
                <Field
                  name="name"
                  label="Product name"
                  placeholder="Greek Yogurt 400g"
                />
                <Field
                  name="sku"
                  id="barcode-field"
                  label="Barcode / SKU"
                  placeholder="Scan or enter value"
                />
                <Field
                  name="batch"
                  label="Batch ID"
                  placeholder="Batch number"
                />
                <Field name="category" label="Category" value="Grocery" />
                <Field name="location" label="Location" value="My pantry" />
                <Field
                  name="quantity"
                  label="Quantity"
                  type="number"
                  value="1"
                />
                <Field
                  name="unitPrice"
                  label="Unit price (₹)"
                  type="number"
                  value="100"
                />
                <Field
                  name="manufacturedAt"
                  label="Manufacturing date"
                  type="date"
                  value={isoAfter(-5)}
                />
                <Field
                  name="expiryDate"
                  label="Expiry date"
                  type="date"
                  value={isoAfter(20)}
                />
              </div>
              <button className="primary full">Save to inventory</button>
            </form>
          </>
        ) : (
          <>
            <span className="kicker">
              {type === "scan" ? "SCAN & PAY" : "DEMO TRANSFER"}
            </span>
            <h2>
              {type === "scan" ? "Pay and capture the product" : "Send money"}
            </h2>
            <p>
              {type === "scan"
                ? "The payment adds the product and expiry details to FinisFlow automatically."
                : "No real money or message is sent."}
            </p>
            {type === "scan" && (
              <div className="live-scan-card">
                <div className="live-scan-actions">
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={cameraOpen}
                  >
                    <Camera /> {cameraOpen ? "Camera open" : "Open camera"}
                  </button>
                  <label>
                    <QrCode /> Scan QR image
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => scanImage(e.target.files?.[0])}
                    />
                  </label>
                </div>
                {cameraOpen && (
                  <div className="camera-frame">
                    <video ref={videoRef} playsInline muted />
                    <div className="camera-guide" />
                    <button type="button" onClick={stopCamera}>
                      Stop camera
                    </button>
                  </div>
                )}
                <p className="scan-status" role="status" aria-live="polite">
                  {scanStatus ||
                    "Use your rear camera, upload a QR image, or enter details below."}
                </p>
              </div>
            )}
            <form
              className={`modal-form ${type === "scan" ? "scan-payment-form" : ""}`}
              onSubmit={submitPay}
            >
              <Field
                name="counterparty"
                label={type === "scan" ? "Merchant" : "Contact or mobile"}
                value={type === "scan" ? "Green Basket Store" : "98765 43210"}
              />
              <Field
                name="amount"
                label="Amount (₹)"
                type="number"
                value={type === "scan" ? "120" : "250"}
              />
              {type === "scan" && (
                <div className="form-grid product-fields">
                  <Field name="product" label="Product" value="Fresh Milk 1L" />
                  <Field name="barcode" label="Barcode" value="8901491501021" />
                  <Field name="batch" label="Batch" value="ML-DEMO" />
                  <Field
                    name="manufacturedAt"
                    label="Manufactured"
                    type="date"
                    value={isoAfter(-2)}
                  />
                  <Field
                    name="expiryDate"
                    label="Use before"
                    type="date"
                    value={isoAfter(7)}
                  />
                </div>
              )}
              <div className="pay-summary">
                <span>Available balance</span>
                <b>{money.format(balance)}</b>
              </div>
              <button className="primary full" disabled={busy}>
                {type === "scan" ? "Pay securely · demo" : "Send demo payment"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function Quick({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}
function QuickTile({
  icon,
  title,
  copy,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}>
      {icon}
      <b>{title}</b>
      <small>{copy}</small>
    </button>
  );
}
function PageHead({
  kicker,
  title,
  copy,
  action,
  onClick,
}: {
  kicker: string;
  title: string;
  copy: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <section className="page-head">
      <div>
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action && (
        <button className="primary" onClick={onClick}>
          <PackagePlus />
          {action}
        </button>
      )}
    </section>
  );
}
function PanelTitle({
  kicker,
  title,
  action,
  onClick,
  children,
}: {
  kicker: string;
  title: string;
  action?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <article className="surface">
      <div className="section-title">
        <div>
          <span className="kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        {action && <button onClick={onClick}>{action}</button>}
      </div>
      {children}
    </article>
  );
}
function Field({
  name,
  id,
  label,
  placeholder,
  type = "text",
  value,
}: {
  name: string;
  id?: string;
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={value}
        min={type === "number" ? 1 : undefined}
        required
      />
    </label>
  );
}
function InventoryMini({ item }: { item: InventoryData }) {
  const days = daysLeft(item.expiryDate);
  return (
    <div className="inventory-mini">
      <div
        className={`product-icon ${days <= 7 ? "urgent" : days <= 30 ? "watch" : "safe"}`}
      >
        {item.name[0]}
      </div>
      <span>
        <b>{item.name}</b>
        <small>
          {item.quantity} units · batch {item.batch}
        </small>
      </span>
      <div>
        <b>{days <= 0 ? "Use now" : `${days} days`}</b>
        <small>{money.format(item.quantity * item.unitPrice)} at risk</small>
      </div>
    </div>
  );
}
function PaymentMini({
  payment,
  date,
}: {
  payment: PaymentData;
  date: string;
}) {
  const received = payment.direction === "received";
  return (
    <div className="payment-mini">
      <div className={received ? "received" : "sent"}>
        {received ? <ArrowDownLeft /> : <ArrowUpRight />}
      </div>
      <span>
        <b>{payment.title}</b>
        <small>
          {payment.counterparty} ·{" "}
          {new Date(date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </small>
      </span>
      <strong className={received ? "positive" : ""}>
        {received ? "+" : "−"}
        {money.format(payment.amount)}
      </strong>
    </div>
  );
}
function InventoryLine({
  row,
  action,
}: {
  row: InventoryRow;
  action: (r: DashboardRecord, a: string) => void;
}) {
  const { item } = row;
  const days = daysLeft(item.expiryDate);
  const suggestion =
    days <= 3
      ? "Discount"
      : days <= 7
        ? "Bundle"
        : days <= 30
          ? "Move"
          : item.quantity < 4
            ? "Reorder"
            : "Hold";
  return (
    <div className="inventory-line">
      <div className="product-cell">
        <div
          className={`product-icon ${days <= 7 ? "urgent" : days <= 30 ? "watch" : "safe"}`}
        >
          {item.name[0]}
        </div>
        <span>
          <b>{item.name}</b>
          <small>
            {item.sku} · {item.batch}
            <br />
            {item.location}
          </small>
        </span>
      </div>
      <div>
        <b>{item.quantity}</b>
        <small>units</small>
      </div>
      <div>
        <b>{days <= 0 ? "Expired" : `${days} days`}</b>
        <small>
          {dateLabel.format(new Date(`${item.expiryDate}T12:00:00`))}
        </small>
      </div>
      <div>
        <b>{days <= 30 ? money.format(item.quantity * item.unitPrice) : "—"}</b>
        <small>{days <= 7 ? "priority" : days <= 30 ? "watch" : "safe"}</small>
      </div>
      <div>
        <button
          className={`action-chip ${item.actionStatus ? "done" : ""}`}
          onClick={() => action(row, suggestion)}
        >
          {item.actionStatus ? <Check /> : <Sparkles />}
          {item.actionStatus || suggestion}
        </button>
      </div>
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`metric ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Play({
  icon,
  title,
  copy,
  value,
}: {
  icon: string;
  title: string;
  copy: string;
  value: string;
}) {
  return (
    <div className="play">
      <i>{icon}</i>
      <span>
        <b>{title}</b>
        <small>{copy}</small>
      </span>
      <strong>{value}</strong>
    </div>
  );
}
function RiskBars({ inventory }: { inventory: InventoryRow[] }) {
  const bands = [
    ["0–3 days", -999, 3, "rust"],
    ["4–7 days", 4, 7, "amber"],
    ["8–30 days", 8, 30, "leaf"],
    ["31+ days", 31, 9999, "forest"],
  ] as const;
  const values = bands.map(([, min, max]) =>
    inventory
      .filter(
        ({ item }) =>
          daysLeft(item.expiryDate) >= min && daysLeft(item.expiryDate) <= max,
      )
      .reduce((s, { item }) => s + item.quantity * item.unitPrice, 0),
  );
  const maxValue = Math.max(1, ...values);
  return (
    <div className="risk-bars">
      {bands.map(([label, , , cls], i) => (
        <div key={label}>
          <span>{label}</span>
          <div>
            <i
              className={cls}
              style={{ width: `${Math.max(5, (values[i] / maxValue) * 100)}%` }}
            />
          </div>
          <b>{money.format(values[i])}</b>
        </div>
      ))}
    </div>
  );
}
function Empty({
  icon,
  title,
  copy,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <b>{title}</b>
      <p>{copy}</p>
    </div>
  );
}

type AuthProps = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  signup: typeof emptySignup;
  setSignup: (value: typeof emptySignup) => void;
  login: { email: string; password: string };
  setLogin: (value: { email: string; password: string }) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  busy: boolean;
  message: string;
  clearMessage: () => void;
  handleLogin: (event: FormEvent) => void;
  handleSignup: (event: FormEvent) => void;
  sendReset: () => void;
};
function AuthScreen(p: AuthProps) {
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand />
        <span className="kicker">ONE ACCOUNT · TWO CONNECTED EXPERIENCES</span>
        <h1>
          Pay once.
          <br />
          Remember every product.
        </h1>
        <p>
          FinisPay makes payment familiar. FinisFlow quietly carries the
          product, batch, and expiry details forward.
        </p>
        <div className="auth-flow">
          <div>
            <WalletCards />
            <span>
              <b>Pay or receive</b>
              <small>Simple actions</small>
            </span>
          </div>
          <i />
          <div>
            <Boxes />
            <span>
              <b>Inventory updates</b>
              <small>No repeated entry</small>
            </span>
          </div>
          <i />
          <div>
            <Leaf />
            <span>
              <b>Act before expiry</b>
              <small>Waste less</small>
            </span>
          </div>
        </div>
      </section>
      <section className="auth-card">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="tabs">
          <button
            className={p.mode === "login" ? "active" : ""}
            onClick={() => {
              p.setMode("login");
              p.clearMessage();
            }}
          >
            Login
          </button>
          <button
            className={p.mode === "signup" ? "active" : ""}
            onClick={() => {
              p.setMode("signup");
              p.clearMessage();
            }}
          >
            Sign up
          </button>
        </div>
        {p.mode === "login" ? (
          <form onSubmit={p.handleLogin}>
            <div>
              <h2>Welcome back</h2>
              <p>Open your connected workspace.</p>
            </div>
            <label>
              Email address
              <input
                type="email"
                value={p.login.email}
                onChange={(e) =>
                  p.setLogin({ ...p.login, email: e.target.value })
                }
                placeholder="you@example.com"
                required
              />
            </label>
            <PasswordInput
              name="password"
              label="Password"
              value={p.login.password}
              onChange={(v) => p.setLogin({ ...p.login, password: v })}
              shown={p.showPassword}
              toggle={() => p.setShowPassword(!p.showPassword)}
            />
            <button className="auth-submit" disabled={p.busy}>
              Login securely
            </button>
            <button className="text-button" type="button" onClick={p.sendReset}>
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={p.handleSignup}>
            <div>
              <h2>Create your account</h2>
              <p>Your name and dashboard stay personal.</p>
            </div>
            <label>
              Full name
              <input
                value={p.signup.fullName}
                onChange={(e) =>
                  p.setSignup({ ...p.signup, fullName: e.target.value })
                }
                required
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={p.signup.email}
                onChange={(e) =>
                  p.setSignup({ ...p.signup, email: e.target.value })
                }
                required
              />
            </label>
            <PasswordInput
              name="new-password"
              label="Password"
              value={p.signup.password}
              onChange={(v) => p.setSignup({ ...p.signup, password: v })}
              shown={p.showPassword}
              toggle={() => p.setShowPassword(!p.showPassword)}
            />
            <label>
              Confirm password
              <input
                type={p.showPassword ? "text" : "password"}
                value={p.signup.confirmPassword}
                onChange={(e) =>
                  p.setSignup({ ...p.signup, confirmPassword: e.target.value })
                }
                required
              />
            </label>
            <p className="hint">
              8+ characters · uppercase · lowercase · number
            </p>
            <button className="auth-submit" disabled={p.busy}>
              Create account & continue
            </button>
          </form>
        )}
        <Message text={p.message} />
        <p className="privacy">
          <ShieldCheck /> Passwords are handled only by Supabase Auth.
        </p>
      </section>
    </main>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">f</span>
      <span className="brand-word">
        finis<b>pay</b>
      </span>
      <i>× finisflow</i>
    </div>
  );
}
function Message({
  text,
  floating = false,
}: {
  text: string;
  floating?: boolean;
}) {
  return text ? (
    <p className={`message ${floating ? "floating" : ""}`} role="status">
      <Check />
      {text}
    </p>
  ) : null;
}
function PasswordInput({
  name,
  label,
  value,
  onChange,
  shown,
  toggle,
}: {
  name: string;
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  shown: boolean;
  toggle: () => void;
}) {
  return (
    <label>
      {label}
      <div className="password">
        <input
          name={name}
          type={shown ? "text" : "password"}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          required
        />
        <button type="button" onClick={toggle}>
          {shown ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </label>
  );
}

