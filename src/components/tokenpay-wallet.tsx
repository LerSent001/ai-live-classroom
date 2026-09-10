"use client";
import { useEffect, useState } from "react";
type Status = { connected: boolean; balanceYuan?: number; warning?: string };
export function TokenPayWallet({ ready }: { ready: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [manual, setManual] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready) return;
    const result = new URLSearchParams(location.search).get("wallet");
    void fetch("/api/tokenpay/status")
      .then(r => r.json())
      .then(data => {
        setStatus(data);
        if (result === "failed") setMessage("授权未完成或已过期，请重新连接。");
      })
      .catch(() => {
        setStatus({ connected: false });
        setMessage("钱包状态暂时无法读取。");
      });
    if (result) {
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("wallet");
      history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  }, [ready]);
  async function action(name: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/tokenpay/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(name === "key" ? { key } : {}) });
      setKey("");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "钱包操作失败。");
      if (data.url) { location.assign(data.url); return; }
      setStatus(data); setManual(false); setExpanded(!data.connected);
    } catch (error) { setMessage(error instanceof Error ? error.message : "连接失败。"); }
    finally { setBusy(false); }
  }
  if (!status) return null;
  if (status.connected && !expanded) {
    return <button aria-expanded="false" aria-label="打开 TokenPay 钱包" className="tokenpay-wallet-chip" onClick={() => setExpanded(true)} type="button">
      <span aria-hidden="true" />
      TokenPay 已连接
    </button>;
  }
  return <aside aria-label="TokenPay 钱包" className={`tokenpay-wallet-panel${status.connected ? " tokenpay-wallet-panel-connected" : ""}`}>
    <div className="tokenpay-wallet-header">
      <strong>TokenPay 钱包</strong>
      {status.connected && <button aria-label="收起钱包" className="tokenpay-wallet-close" onClick={() => setExpanded(false)} type="button">收起</button>}
    </div>
    <p className="tokenpay-wallet-status">{status.connected ? `已连接 · ${typeof status.balanceYuan === "number" ? `余额 ¥${status.balanceYuan.toFixed(4)}` : "余额暂不可用"}` : "连接自己的钱包，按实际调用扣费。"}</p>
    <p className="tokenpay-wallet-note">课程规划与视频均通过 TokenDance 调用。</p>
    <div className="tokenpay-wallet-actions">
      <button disabled={!ready || busy} onClick={() => void action(status.connected ? "disconnect" : "connect")}>{busy ? "处理中…" : status.connected ? "断开钱包" : "授权连接"}</button>
      {!status.connected && <button disabled={!ready || busy} onClick={() => setManual(!manual)}>粘贴 Key</button>}
    </div>
    {manual && <form className="tokenpay-wallet-form" onSubmit={e => { e.preventDefault(); void action("key"); }}>
      <input aria-label="TokenDance API Key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="粘贴 TokenDance Key" />
      <button disabled={busy || !key.trim()} type="submit">保存并验证</button>
    </form>}
    {(message || status.warning) && <p className="tokenpay-wallet-message" role="status">{message || status.warning}</p>}
  </aside>;
}
