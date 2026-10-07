"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = { connected: boolean; balanceYuan?: number; warning?: string };
function statusOf(value: unknown): Status {
  if (!value || typeof value !== "object" || !("connected" in value) || typeof value.connected !== "boolean") throw new Error("钱包状态响应无效，请重试。");
  const balance = "balanceYuan" in value ? value.balanceYuan : undefined;
  const warning = "warning" in value ? value.warning : undefined;
  return { connected: value.connected,
    balanceYuan: typeof balance === "number" && Number.isFinite(balance) ? balance : undefined,
    warning: typeof warning === "string" ? warning : undefined };
}
const api = "/api/youth/tokenpay";
async function readStatus(signal?: AbortSignal, identityOnly = false): Promise<Status> {
  const timeout = AbortSignal.timeout(identityOnly ? 10_000 : 60_000);
  const response = await fetch(`${api}/status${identityOnly ? "?identity=1" : ""}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "钱包状态暂时无法读取。");
  return statusOf(data);
}

// Reuses the existing TokenPay authorization/manual-key flow. Only the server
// persists credentials; opening this panel never starts a lesson or tops up.
export function YouthTokenPayWallet({ ready, openRequest, active, onReady, onChanged }: {
  ready: boolean; openRequest: number; active: boolean;
  onReady: () => void; onChanged: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissedRequest, setDismissedRequest] = useState(0);
  const [manual, setManual] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const chip = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const messageElement = useRef<HTMLParagraphElement>(null);
  const requestInFlight = useRef(false);
  const refreshSequence = useRef(0);
  const callbackResult = useRef<string | null>(null);
  const isExpanded = expanded || openRequest > dismissedRequest;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++refreshSequence.current;
    requestInFlight.current = true;
    try {
      const data = await readStatus(signal);
      if (signal?.aborted || sequence !== refreshSequence.current) return;
      setStatus(data); onReady();
    } catch (error) {
      if (!signal?.aborted && sequence === refreshSequence.current) setMessage(error instanceof Error ? error.message : "钱包连接失败，请重试。");
    } finally { if (sequence === refreshSequence.current) { requestInFlight.current = false; if (!signal?.aborted) setBusy(false); } }
  }, [onReady]);

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(window.location.href);
    const result = url.searchParams.get("wallet") ?? callbackResult.current;
    callbackResult.current = result;
    if (result) {
      url.searchParams.delete("wallet"); window.history.replaceState(null, "", url);
    }
    // Mount only subscribes to the async status response; no immediate state
    // update or scene invalidation is necessary while the request is pending.
    void readStatus(controller.signal, true).then(async (data) => {
      if (controller.signal.aborted) return;
      setStatus(data); onReady();
      if (result === "failed") { setMessage("授权未完成或已过期，请重新连接。没有自动开始课程。"); setExpanded(true); }
      // Identity is local and available immediately. A slow, read-only balance
      // request must not prevent reconnecting an already submitted classroom.
      if (data.connected) {
        const detailed = await readStatus(controller.signal);
        if (!controller.signal.aborted) setStatus(detailed);
      }
    }).catch((error) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "钱包连接失败，请重试。");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [onReady]);

  useEffect(() => { if (isExpanded && ready) closeButton.current?.focus(); }, [isExpanded, ready]);
  useEffect(() => {
    if (isExpanded && (message || status?.warning)) messageElement.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [isExpanded, message, status?.warning]);

  const close = useCallback(() => {
    setExpanded(false); setDismissedRequest(openRequest); setManual(false); setKey("");
    requestAnimationFrame(() => chip.current?.focus());
  }, [openRequest]);
  useEffect(() => {
    if (!isExpanded) return;
    // A focused refresh button can temporarily become disabled, moving browser
    // focus to body; Escape must still work in that state.
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [close, isExpanded]);
  async function action(name: "connect" | "key" | "disconnect") {
    if (requestInFlight.current) return;
    requestInFlight.current = true; setBusy(true); setMessage("");
    const submittedKey = key; setKey("");
    try {
      const response = await fetch(`${api}/${name}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(name === "key" ? { key: submittedKey } : {}),
        signal: AbortSignal.timeout(name === "key" ? 60_000 : 25_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "钱包连接失败。");
      if (name === "connect") {
        const url = new URL(data.url);
        if (url.origin !== "https://tokendance.space" || url.pathname !== "/auth") throw new Error("授权地址无效。");
        window.location.assign(url.toString()); return;
      }
      setStatus(statusOf(data)); setManual(false); onChanged();
      if (data.connected) close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "钱包连接失败，请重试。"); }
    finally { requestInFlight.current = false; setBusy(false); }
  }

  if (!ready) return null;
  const balance = status?.balanceYuan;
  return <div className="youth-wallet" data-wallet-connected={Boolean(status?.connected)}>
    <button ref={chip} type="button" className="youth-wallet-chip" aria-label="打开 TokenDance 钱包"
      aria-expanded={isExpanded} aria-controls="youth-wallet-panel" onClick={() => isExpanded ? close() : setExpanded(true)}>
      <span className={`youth-wallet-dot ${status?.connected ? "is-connected" : ""}`} aria-hidden="true" />
      <span>TokenDance</span><span className="youth-wallet-chip-value">{status?.connected ? typeof balance === "number" ? `¥${balance.toFixed(2)}` : "已连接" : status ? "连接钱包" : busy ? "连接中…" : "重试"}</span>
    </button>
    {isExpanded && <section id="youth-wallet-panel" className="youth-wallet-panel" aria-label="TokenDance 钱包">
      <header><div><span className="youth-wallet-eyebrow">课程生成钱包</span><h2>TokenDance</h2></div>
        <button ref={closeButton} type="button" className="youth-wallet-close" aria-label="收起钱包" onClick={close}>×</button></header>
      <div className="youth-wallet-balance"><span>{status?.connected ? "账户余额" : "尚未连接"}</span>
        <strong>{status?.connected ? typeof balance === "number" ? `¥ ${balance.toFixed(4)}` : "暂时无法读取" : "使用自己的钱包"}</strong>
      </div>
      <p className="youth-wallet-note">连接和浏览教室不产生生成费用。开始课程后，规划与视频按 TokenDance 实际用量计费。</p>
      <p className="youth-wallet-note">未成年人请由家长或老师授权，并在授权页设置额度。</p>
      <div className="youth-wallet-actions">
        {status?.connected ? <><button type="button" disabled={busy} onClick={() => { setMessage(""); setBusy(true); void refresh(); }}>刷新余额</button>
          <button type="button" disabled={busy} onClick={() => void action("disconnect")}>断开连接</button></>
          : <button type="button" className="youth-wallet-primary" disabled={busy || !status} onClick={() => void action("connect")}>{busy ? "正在连接…" : "授权连接"}</button>}
        {!status && <button type="button" disabled={busy} onClick={() => { setMessage(""); setBusy(true); void refresh(); }}>重新读取状态</button>}
        {!active && status && <button type="button" disabled={busy} aria-expanded={manual} onClick={() => { setManual((value) => !value); setKey(""); }}>粘贴 API Key</button>}
      </div>
      {manual && <form className="youth-wallet-key" onSubmit={(event) => { event.preventDefault(); void action("key"); }}>
        <label htmlFor="youth-wallet-key">TokenDance API Key</label>
        <input id="youth-wallet-key" type="password" value={key} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={4096}
          placeholder="粘贴 Key，仅保存在服务器" disabled={busy} onChange={(event) => setKey(event.target.value)} />
        <button type="submit" disabled={busy || !key.trim()}>验证并连接</button>
      </form>}
      {active && status?.connected && <p className="youth-wallet-note">断开后不再提交新片段；已经提交的任务可能继续计费。</p>}
      {(message || status?.warning) && <p ref={messageElement} className="youth-wallet-message" role="status">{message || status?.warning}</p>}
    </section>}
  </div>;
}
