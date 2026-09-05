"use client";
import { useEffect, useState } from "react";
type Status = { connected: boolean; balanceYuan?: number; warning?: string };
export function TokenPayWallet({ ready }: { ready: boolean }) {
  const [status, setStatus] = useState<Status>({ connected: false });
  const [key, setKey] = useState("");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready) return;
    void fetch("/api/tokenpay/status").then(r => r.json()).then(data => { setStatus(data); if (new URLSearchParams(location.search).get("wallet") === "failed") setMessage("授权未完成或已过期，请重新连接。"); }).catch(() => setMessage("钱包状态暂时无法读取。"));
  }, [ready]);
  async function action(name: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/tokenpay/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(name === "key" ? { key } : {}) });
      setKey("");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "钱包操作失败。");
      if (data.url) { location.assign(data.url); return; }
      setStatus(data); setManual(false);
      location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "连接失败。"); }
    finally { setBusy(false); }
  }
  return <aside aria-label="TokenPay 钱包" style={{ position: "fixed", top: 16, right: 16, zIndex: 80, width: 285, padding: 14, borderRadius: 16, background: "rgba(18,20,27,.92)", color: "white", fontSize: 13, boxShadow: "0 8px 30px #0003" }}>
    <strong>TokenPay 钱包</strong>
    <p style={{ margin: "8px 0" }}>{status.connected ? `已连接 · ${typeof status.balanceYuan === "number" ? `余额 ¥${status.balanceYuan.toFixed(4)}` : "余额暂不可用"}` : "连接自己的钱包，按实际调用扣费。"}</p>
    <p style={{ opacity: .65, fontSize: 11 }}>课程规划与视频均通过 TokenDance 调用。</p>
    <div style={{ display: "flex", gap: 12 }}>
      <button disabled={!ready || busy} onClick={() => void action(status.connected ? "disconnect" : "connect")}>{busy ? "处理中…" : status.connected ? "断开钱包" : "授权连接"}</button>
      {!status.connected && <button disabled={!ready || busy} onClick={() => setManual(!manual)}>粘贴 Key</button>}
    </div>
    {manual && <form onSubmit={e => { e.preventDefault(); void action("key"); }} style={{ marginTop: 12 }}>
      <input aria-label="TokenDance API Key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="粘贴 TokenDance Key" style={{ width: "100%", padding: 8, color: "#111", background: "white", borderRadius: 6 }} />
      <button disabled={busy || !key.trim()} type="submit" style={{ marginTop: 8 }}>保存并验证</button>
    </form>}
    {(message || status.warning) && <p role="status">{message || status.warning}</p>}
  </aside>;
}
