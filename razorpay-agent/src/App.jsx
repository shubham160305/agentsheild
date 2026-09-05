import { useCallback, useRef, useState } from "react";

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0a0f",
  surface: "#12121a",
  elevated: "#1a1a28",
  border: "#2a2a40",
  accent: "#3d6bff",
  accentDim: "#1e3080",
  accentText: "#8aaeff",
  success: "#22c55e",
  successDim: "#14532d",
  warn: "#f59e0b",
  warnDim: "#78350f",
  danger: "#ef4444",
  dangerDim: "#7f1d1d",
  text: "#e8e8f0",
  muted: "#6b6b8a",
  faint: "#2e2e45",
};

// ── Razorpay mock API ──────────────────────────────────────────────────────
const MOCK_RESPONSES = {
  validate_store: (url) => ({
    ok: true,
    platform: url.includes("shopify") ? "Shopify" : url.includes("woo") ? "WooCommerce" : "Custom",
    merchant_id: "rzp_live_" + Math.random().toString(36).slice(2, 10).toUpperCase(),
    products: Math.floor(Math.random() * 200) + 40,
    monthly_orders: Math.floor(Math.random() * 800) + 120,
  }),
  check_kyc: (gstin) => ({
    ok: !!gstin && gstin.length === 15,
    business_name: "Luminos Skincare Pvt. Ltd.",
    category: "Health & Beauty",
    risk_tier: "LOW",
  }),
  generate_sdk_key: () => ({
    key_id: "rzp_agent_" + Math.random().toString(36).slice(2, 14).toUpperCase(),
    webhook_secret: "whsec_" + Math.random().toString(36).slice(2, 34),
    sandbox: true,
  }),
  deploy_agent: (config) => ({
    ok: true,
    agent_id: "agt_" + Math.random().toString(36).slice(2, 12),
    endpoint: `https://agent.razorpay.com/${config.merchant_id}/invoke`,
    capabilities: config.capabilities,
    status: "LIVE",
  }),
};

// ── Claude API call ──────────────────────────────────────────────────────
async function callClaude(systemPrompt, userMsg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  return data.content?.map((b) => b.text || "").join("") || "No response";
}

// ── Step definitions ───────────────────────────────────────────────────────
const STEPS = [
  { id: "connect", label: "Connect Store", icon: "🔗" },
  { id: "kyc", label: "Verify Business", icon: "🏢" },
  { id: "configure", label: "Configure Agent", icon: "⚙️" },
  { id: "sdk", label: "Get Credentials", icon: "🔑" },
  { id: "deploy", label: "Go Live", icon: "🚀" },
];

const CAPABILITIES = [
  { id: "abandoned_cart", label: "Abandoned Cart Recovery", desc: "Nudge buyers who left without paying", icon: "🛒" },
  { id: "payment_retry", label: "Payment Failure Retry", desc: "Auto-retry failed UPI / card transactions", icon: "🔄" },
  { id: "refund_bot", label: "Refund & Dispute Bot", desc: "Handle refund requests autonomously", icon: "↩️" },
  { id: "cod_nudge", label: "COD → Prepaid Nudge", desc: "Convert cash-on-delivery to prepaid", icon: "💳" },
  { id: "sub_reminder", label: "Subscription Reminder", desc: "Remind subscribers before renewal", icon: "🔔" },
];

// ── Agent Log entry ────────────────────────────────────────────────────────
function LogEntry({ entry }) {
  const colors = {
    info: C.accentText,
    success: C.success,
    warn: C.warn,
    error: C.danger,
    claude: "#c084fc",
    api: C.muted,
  };
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
      <span style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap", paddingTop: 1 }}>
        {entry.ts}
      </span>
      <span style={{ color: colors[entry.type] || C.text, fontSize: 12, fontFamily: "monospace", lineHeight: 1.5 }}>
        {entry.msg}
      </span>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(0);
  const [useRealAI, setUseRealAI] = useState(false);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const logRef = useRef(null);

  // Form state
  const [storeUrl, setStoreUrl] = useState("");
  const [gstin, setGstin] = useState("");
  const [agentName, setAgentName] = useState("");
  const [selectedCaps, setSelectedCaps] = useState(["abandoned_cart", "payment_retry"]);
  const [budget, setBudget] = useState(5000);

  // Results
  const [storeInfo, setStoreInfo] = useState(null);
  const [kycInfo, setKycInfo] = useState(null);
  const [sdkInfo, setSdkInfo] = useState(null);
  const [deployInfo, setDeployInfo] = useState(null);
  const [aiInsight, setAiInsight] = useState("");

  const addLog = useCallback((msg, type = "info") => {
    const ts = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLog((prev) => [...prev, { ts, msg, type }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Step handlers ──────────────────────────────────────────────────────
  async function handleConnectStore() {
    if (!storeUrl.trim()) return;
    setLoading(true);
    addLog("→ Initiating store validation...", "info");
    await delay(600);
    addLog(`   GET ${storeUrl}`, "api");
    await delay(800);
    const data = MOCK_RESPONSES.validate_store(storeUrl);
    addLog(`   Platform detected: ${data.platform}`, "api");
    addLog(`   Merchant ID: ${data.merchant_id}`, "api");
    await delay(400);

    if (useRealAI) {
      addLog("→ Asking Claude to assess merchant profile...", "claude");
      const insight = await callClaude(
        "You are a Razorpay merchant onboarding assistant. Analyse the store data and give a 2-sentence assessment of the merchant's agentic commerce readiness. Be specific and practical.",
        `Store: ${storeUrl}, Platform: ${data.platform}, Products: ${data.products}, Monthly orders: ${data.monthly_orders}`
      );
      setAiInsight(insight);
      addLog(`   Claude: ${insight.slice(0, 80)}...`, "claude");
    } else {
      setAiInsight(`This ${data.platform} store with ${data.monthly_orders} monthly orders is a strong candidate for agentic automation — abandoned cart recovery alone could recover 15–22% of lost revenue. Priority capability: Payment Retry.`);
    }

    addLog("✓ Store validated successfully", "success");
    setStoreInfo(data);
    setLoading(false);
    setStep(1);
  }

  async function handleKYC() {
    if (!gstin.trim()) return;
    setLoading(true);
    addLog("→ Verifying GSTIN with RBI-compliant KYC...", "info");
    await delay(500);
    addLog(`   GSTIN: ${gstin}`, "api");
    await delay(1000);
    const data = MOCK_RESPONSES.check_kyc(gstin);
    if (!data.ok) {
      addLog("✗ Invalid GSTIN format. Must be 15 characters.", "error");
      setLoading(false);
      return;
    }
    addLog(`   Business: ${data.business_name}`, "api");
    addLog(`   Category: ${data.category}`, "api");
    addLog(`   Risk tier: ${data.risk_tier}`, "api");

    if (useRealAI) {
      addLog("→ Claude checking regulatory compliance...", "claude");
      const insight = await callClaude(
        "You are a Razorpay compliance officer. Given merchant KYC data, advise in 2 sentences on agentic commerce risk posture and any DPDP / RBI concerns to flag. Be concise.",
        `Business: ${data.business_name}, Category: ${data.category}, Risk: ${data.risk_tier}, GSTIN: ${gstin}`
      );
      setAiInsight(insight);
      addLog(`   Claude: ${insight.slice(0, 80)}...`, "claude");
    } else {
      setAiInsight(`${data.business_name} qualifies for LOW-risk agentic access. Autonomous refunds capped at ₹2,000 per transaction — standard DPDP-compliant limit for Health & Beauty merchants.`);
    }

    addLog("✓ KYC verified. Business approved for Agent Studio.", "success");
    setKycInfo(data);
    setLoading(false);
    setStep(2);
  }

  async function handleConfigure() {
    if (!agentName.trim() || selectedCaps.length === 0) return;
    setLoading(true);
    addLog(`→ Configuring agent "${agentName}"...`, "info");
    await delay(400);
    addLog(`   Capabilities: ${selectedCaps.join(", ")}`, "api");
    addLog(`   Monthly budget ceiling: ₹${budget.toLocaleString("en-IN")}`, "api");
    await delay(600);

    if (useRealAI) {
      addLog("→ Claude generating optimal agent configuration...", "claude");
      const insight = await callClaude(
        "You are a Razorpay AI commerce strategist. Given the merchant's chosen capabilities and budget, write 2 sentences recommending priority order and expected ROI. Be specific with numbers.",
        `Agent: ${agentName}, Capabilities: ${selectedCaps.join(", ")}, Budget: ₹${budget}/month, Business: ${kycInfo?.business_name}, Category: ${kycInfo?.category}, Monthly orders: ${storeInfo?.monthly_orders}`
      );
      setAiInsight(insight);
      addLog(`   Claude: ${insight.slice(0, 80)}...`, "claude");
    } else {
      const topCap = selectedCaps[0] === "abandoned_cart" ? "Abandoned Cart Recovery" : "Payment Retry";
      setAiInsight(`Start with ${topCap} — at ${storeInfo?.monthly_orders} orders/month, even a 12% recovery rate adds ~₹${Math.floor(storeInfo?.monthly_orders * 0.12 * 850).toLocaleString("en-IN")} monthly revenue. Activate remaining capabilities in week 3 once baseline is established.`);
    }

    addLog("✓ Agent configuration locked.", "success");
    setLoading(false);
    setStep(3);
  }

  async function handleGenerateSDK() {
    setLoading(true);
    addLog("→ Generating API credentials...", "info");
    await delay(700);
    const data = MOCK_RESPONSES.generate_sdk_key();
    addLog(`   Key ID: ${data.key_id}`, "api");
    addLog(`   Webhook secret: ${data.webhook_secret.slice(0, 14)}...`, "api");
    addLog("   Sandbox mode: active", "api");
    await delay(500);
    addLog("✓ Credentials generated. Keep webhook secret private.", "success");
    addLog("→ Generating integration snippet...", "info");
    await delay(800);
    addLog("✓ SDK snippet ready.", "success");
    setSdkInfo(data);
    setLoading(false);
    setStep(4);
  }

  async function handleDeploy() {
    setLoading(true);
    addLog("→ Running pre-deployment checks...", "info");
    await delay(400);
    addLog("   ✓ Consent flow registered", "api");
    await delay(300);
    addLog("   ✓ Webhook endpoint reachable", "api");
    await delay(300);
    addLog("   ✓ Rate limits configured", "api");
    await delay(300);
    addLog("   ✓ DPDP audit log enabled", "api");
    await delay(500);
    addLog("→ Deploying to Razorpay Agent Studio...", "info");
    await delay(1200);
    const data = MOCK_RESPONSES.deploy_agent({ merchant_id: storeInfo?.merchant_id, capabilities: selectedCaps });

    if (useRealAI) {
      addLog("→ Claude writing your launch briefing...", "claude");
      const insight = await callClaude(
        "You are a Razorpay success manager. The merchant has just gone live with their AI agent. Write a 2-sentence launch message: what to watch in the first 48 hours, and what success looks like in 30 days. Be specific.",
        `Agent ID: ${data.agent_id}, Capabilities: ${data.capabilities.join(", ")}, Business: ${kycInfo?.business_name}, Orders/month: ${storeInfo?.monthly_orders}, Budget: ₹${budget}`
      );
      setAiInsight(insight);
      addLog(`   Claude: ${insight.slice(0, 80)}...`, "claude");
    } else {
      setAiInsight(`Watch your first 48 hours: you're looking for >0% trigger rate on ${CAPABILITIES.find(c => c.id === selectedCaps[0])?.label} and zero false-positive refund requests. At 30 days, a healthy agent recovers 10–18% of flagged transactions with a <0.5% complaint rate.`);
    }

    addLog(`✓ Agent ${data.agent_id} is LIVE.`, "success");
    setDeployInfo(data);
    setLoading(false);
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <div style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, padding: "28px 0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: 0.3 }}>Razorpay</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>SME Agent Studio</div>
      </div>
      <div style={{ padding: "20px 12px", flex: 1 }}>
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, marginBottom: 2, background: active ? C.accentDim : "transparent", cursor: done ? "pointer" : "default" }}
              onClick={() => done && setStep(i)}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: done ? C.success : active ? C.accent : C.faint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                {done ? "✓" : <span style={{ opacity: 0.8 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 12.5, color: done ? C.text : active ? C.text : C.muted, fontWeight: active ? 600 : 400 }}>{s.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Real Claude AI</span>
          <div onClick={() => setUseRealAI(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: useRealAI ? C.accent : C.faint, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
            <div style={{ position: "absolute", top: 2, left: useRealAI ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: C.text, transition: "left 0.2s" }} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>
          {useRealAI ? "Live Claude API active" : "Mock responses (demo)"}
        </div>
      </div>
    </div>
  );

  // ── Log panel ────────────────────────────────────────────────────────────
  const LogPanel = () => (
    <div style={{ width: 300, background: C.surface, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? C.warn : log.length > 0 ? C.success : C.muted }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Agent Log</span>
      </div>
      <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {log.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", opacity: 0.6 }}>Agent idle. Awaiting action...</div>
        ) : (
          log.map((e, i) => <LogEntry key={i} entry={e} />)
        )}
        {loading && <div style={{ color: C.warn, fontSize: 12, fontFamily: "monospace" }}>⟳ Processing...</div>}
      </div>
      {aiInsight && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}`, background: "#1a0d2e" }}>
          <div style={{ fontSize: 10, color: "#c084fc", fontWeight: 600, marginBottom: 6 }}>
            {useRealAI ? "✦ Claude's Assessment" : "✦ AI Insight (Mock)"}
          </div>
          <div style={{ fontSize: 11, color: "#d8b4fe", lineHeight: 1.55 }}>{aiInsight}</div>
        </div>
      )}
    </div>
  );

  // ── Input ────────────────────────────────────────────────────────────────
  const Input = ({ label, value, onChange, placeholder, helper }) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 12px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
      {helper && <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>{helper}</div>}
    </div>
  );

  const Btn = ({ onClick, disabled, children, variant = "primary" }) => (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ padding: "10px 22px", borderRadius: 7, border: "none", cursor: disabled || loading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, background: variant === "primary" ? C.accent : C.faint, color: C.text, opacity: disabled || loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
      {loading ? "Working..." : children}
    </button>
  );

  // ── Screen renderers ─────────────────────────────────────────────────────
  const screens = {
    // Step 0 — Connect store
    connect: () => (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect your store</h2>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 28, lineHeight: 1.6 }}>
          Razorpay's agent will validate your storefront, detect your platform, and scope the right agentic capabilities for your order volume.
        </p>
        <Input label="Store URL" value={storeUrl} onChange={setStoreUrl} placeholder="https://yourstore.myshopify.com" helper="Shopify, WooCommerce, or any custom domain" />
        <Btn onClick={handleConnectStore} disabled={!storeUrl.trim()}>Validate Store →</Btn>
        {storeInfo && (
          <div style={{ marginTop: 20, padding: "14px 16px", background: C.elevated, borderRadius: 8, border: `1px solid ${C.successDim}` }}>
            <div style={{ fontSize: 12, color: C.success, fontWeight: 600, marginBottom: 8 }}>Store connected</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["Platform", storeInfo.platform], ["Merchant ID", storeInfo.merchant_id], ["Products", storeInfo.products], ["Monthly Orders", storeInfo.monthly_orders]].map(([k, v]) => (
                <div key={k}><div style={{ fontSize: 10, color: C.muted }}>{k}</div><div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{v}</div></div>
              ))}
            </div>
          </div>
        )}
      </div>
    ),

    // Step 1 — KYC
    kyc: () => (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Verify your business</h2>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 28, lineHeight: 1.6 }}>
          RBI and DPDP guidelines require a verified merchant before autonomous payment actions can be enabled. This takes under 60 seconds.
        </p>
        <Input label="GSTIN" value={gstin} onChange={setGstin} placeholder="22AAAAA0000A1Z5" helper="15-character GST Identification Number" />
        <Btn onClick={handleKYC} disabled={!gstin.trim()}>Verify Business →</Btn>
        {kycInfo && (
          <div style={{ marginTop: 20, padding: "14px 16px", background: C.elevated, borderRadius: 8, border: `1px solid ${C.successDim}` }}>
            <div style={{ fontSize: 12, color: C.success, fontWeight: 600, marginBottom: 8 }}>Business verified</div>
            {[["Name", kycInfo.business_name], ["Category", kycInfo.category], ["Risk Tier", kycInfo.risk_tier]].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 6 }}><span style={{ fontSize: 10, color: C.muted }}>{k}: </span><span style={{ fontSize: 12, color: C.text }}>{v}</span></div>
            ))}
          </div>
        )}
      </div>
    ),

    // Step 2 — Configure
    configure: () => (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Configure your agent</h2>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
          Choose what your agent does autonomously. Each capability maps to a real Razorpay API action.
        </p>
        <Input label="Agent name" value={agentName} onChange={setAgentName} placeholder="Luminos Commerce Agent" />
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Capabilities</div>
          {CAPABILITIES.map(cap => {
            const on = selectedCaps.includes(cap.id);
            return (
              <div key={cap.id} onClick={() => setSelectedCaps(prev => on ? prev.filter(c => c !== cap.id) : [...prev, cap.id])}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 6, borderRadius: 8, border: `1px solid ${on ? C.accent : C.border}`, background: on ? "#0d1a3a" : C.elevated, cursor: "pointer" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: on ? C.accent : C.faint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {on && <span style={{ fontSize: 10, color: "#fff" }}>✓</span>}
                </div>
                <span style={{ fontSize: 14 }}>{cap.icon}</span>
                <div>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{cap.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{cap.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Monthly budget ceiling — ₹{budget.toLocaleString("en-IN")}</div>
          <input type="range" min={1000} max={50000} step={500} value={budget} onChange={e => setBudget(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 4 }}>
            <span>₹1,000</span><span>₹50,000</span>
          </div>
        </div>
        <Btn onClick={handleConfigure} disabled={!agentName.trim() || selectedCaps.length === 0}>Save Configuration →</Btn>
      </div>
    ),

    // Step 3 — SDK
    sdk: () => (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Your credentials</h2>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
          Add these to your store's environment. Your webhook secret lets Razorpay verify every agent action it sends.
        </p>
        <Btn onClick={handleGenerateSDK}>Generate credentials →</Btn>
        {sdkInfo && (
          <div style={{ marginTop: 20 }}>
            {[["Key ID", sdkInfo.key_id], ["Webhook Secret", sdkInfo.webhook_secret]].map(([k, v]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{k}</div>
                <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 7, padding: "9px 12px", fontFamily: "monospace", fontSize: 11, color: C.accentText, wordBreak: "break-all" }}>{v}</div>
              </div>
            ))}
            <div style={{ marginTop: 16, background: "#0f1a0f", border: `1px solid #1e3d1e`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Integration snippet — add to your store</div>
              <pre style={{ margin: 0, fontSize: 11, color: "#86efac", fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{`// Shopify / Node.js
const { RazorpayAgent } = require('@razorpay/agent-sdk');

const agent = new RazorpayAgent({
  keyId: '${sdkInfo.key_id}',
  webhookSecret: process.env.RZP_WEBHOOK_SECRET,
  capabilities: ${JSON.stringify(selectedCaps, null, 2)
    .split('\n').join('\n  ')},
});

agent.listen(3000);`}</pre>
            </div>
          </div>
        )}
      </div>
    ),

    // Step 4 — Deploy
    deploy: () => (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 }}>Go live</h2>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
          All checks passed. Deploy runs one final pre-flight validation — consent flow, webhook reachability, rate limits, audit logging — then your agent goes live on Razorpay's infrastructure.
        </p>
        {!deployInfo ? (
          <Btn onClick={handleDeploy}>Deploy agent →</Btn>
        ) : (
          <div>
            <div style={{ padding: "20px", background: "#0a1f0a", border: `1px solid ${C.success}`, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 15, color: C.success, fontWeight: 700, marginBottom: 12 }}>🚀 Agent is LIVE</div>
              {[["Agent ID", deployInfo.agent_id], ["Endpoint", deployInfo.endpoint], ["Status", deployInfo.status]].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>{k}: </span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: C.text }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Active capabilities", value: deployInfo.capabilities.length, unit: "enabled" },
                { label: "Budget ceiling", value: `₹${budget.toLocaleString("en-IN")}`, unit: "/month" },
                { label: "Consent flow", value: "DPDP", unit: "compliant" },
                { label: "Mode", value: "Sandbox", unit: "→ go prod" },
              ].map(({ label, value, unit }) => (
                <div key={label} style={{ padding: "12px 14px", background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{value}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{unit}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ),
  };

  const stepKeys = ["connect", "kyc", "configure", "sdk", "deploy"];
  const currentKey = stepKeys[step];

  // ── Root layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "Inter, system-ui, sans-serif", color: C.text, overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px" }}>
        {/* Header breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 32, fontSize: 12, color: C.muted }}>
          <span>Agent Studio</span>
          <span>/</span>
          <span style={{ color: C.text }}>SME Onboarding</span>
          <span>/</span>
          <span style={{ color: C.accent }}>{STEPS[step].label}</span>
        </div>
        {screens[currentKey]?.()}
      </div>
      <LogPanel />
    </div>
  );
}
