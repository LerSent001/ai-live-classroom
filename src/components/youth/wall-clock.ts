import { CanvasTexture, SRGBColorSpace, type Group } from 'three';

export function clockAngles(epochMs: number) {
  const seconds = ((Math.floor(epochMs / 1000) + 8 * 3600) % 86400 + 86400) % 86400;
  return { hour: seconds / 43200 * Math.PI * 2, minute: seconds / 3600 * Math.PI * 2, second: seconds / 60 * Math.PI * 2 };
}

export function createWallClock() {
  const dial = document.createElement('canvas'); dial.width = dial.height = 512;
  const ctx = dial.getContext('2d')!;
  ctx.translate(256, 256);
  const bezel = ctx.createLinearGradient(-220, -240, 220, 240);
  bezel.addColorStop(0, '#f4e9d3'); bezel.addColorStop(.35, '#aba7aa'); bezel.addColorStop(.6, '#eee5d8'); bezel.addColorStop(1, '#777887');
  ctx.fillStyle = bezel; ctx.beginPath(); ctx.arc(0, 0, 256, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#444052'; ctx.beginPath(); ctx.arc(0, 0, 239, 0, Math.PI * 2); ctx.fill();
  const face = ctx.createRadialGradient(-80, -100, 20, 0, 0, 245);
  face.addColorStop(0, '#fffcf2'); face.addColorStop(1, '#e6e0d3');
  ctx.fillStyle = face; ctx.beginPath(); ctx.arc(0, 0, 233, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#bdb3a0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 184, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 60; i++) {
    ctx.save(); ctx.rotate(i / 60 * Math.PI * 2);
    ctx.strokeStyle = i % 5 ? '#9c968c' : '#494552'; ctx.lineWidth = i % 5 ? 2 : 5;
    ctx.beginPath(); ctx.moveTo(0, -218); ctx.lineTo(0, i % 5 ? -209 : -199); ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = '#494552'; ctx.font = '500 34px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = i / 12 * Math.PI * 2; ctx.fillText(String(i), Math.sin(a) * 161, -Math.cos(a) * 161);
  }
  ctx.font = '12px Arial'; ctx.fillStyle = '#8d877b'; ctx.fillText('BEIJING', 0, 79);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const draw = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  let lastSecond = -1;
  function update(epochMs: number) {
    const second = Math.floor(epochMs / 1000);
    if (second === lastSecond) return false;
    lastSecond = second;
    draw.clearRect(0, 0, 512, 512); draw.drawImage(dial, 0, 0); draw.save(); draw.translate(256, 256);
    const angles = clockAngles(epochMs);
    const hand = (angle: number, length: number, width: number, color: string) => {
      draw.save(); draw.rotate(angle); draw.fillStyle = color;
      draw.shadowColor = '#35303b40'; draw.shadowBlur = 3; draw.shadowOffsetY = 2;
      draw.beginPath(); draw.moveTo(-width / 2, 24); draw.lineTo(-width / 2, -length + 20); draw.lineTo(0, -length); draw.lineTo(width / 2, -length + 20); draw.lineTo(width / 2, 24); draw.closePath(); draw.fill(); draw.restore();
    };
    hand(angles.hour, 112, 12, '#454453'); hand(angles.minute, 164, 8, '#555365');
    draw.save(); draw.rotate(angles.second); draw.strokeStyle = '#b76d58'; draw.lineWidth = 3; draw.lineCap = 'round';
    draw.beginPath(); draw.moveTo(0, 38); draw.lineTo(0, -190); draw.stroke(); draw.restore();
    draw.fillStyle = '#d4b38b'; draw.beginPath(); draw.arc(0, 0, 11, 0, Math.PI * 2); draw.fill();
    draw.fillStyle = '#595362'; draw.beginPath(); draw.arc(0, 0, 4, 0, Math.PI * 2); draw.fill();
    draw.restore(); texture.needsUpdate = true; return true;
  }
  update(Date.now());
  return { texture, update };
}

export function bindWallClock(room: Group, canvas: HTMLCanvasElement, invalidate: () => void) {
  const clock = room.userData.wallClock as ReturnType<typeof createWallClock>;
  let anchorEpoch = Date.now(), anchorMono = performance.now(), disposed = false;
  let controller: AbortController | undefined;
  const now = () => anchorEpoch + performance.now() - anchorMono;
  const tick = () => {
    if (document.hidden || disposed) return;
    const epoch = now();
    if (clock.update(epoch)) {
      canvas.dataset.clockEpoch = String(Math.floor(epoch / 1000) * 1000);
      canvas.dataset.clockZone = 'Asia/Shanghai'; invalidate();
    }
  };
  const sync = async () => {
    controller?.abort(); controller = new AbortController();
    const started = performance.now();
    try {
      const response = await fetch('/api/youth/time', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]) });
      if (!response.ok) throw new Error('Clock sync unavailable');
      const sample = await response.json();
      if (!Number.isFinite(sample.epochMs) || disposed) return;
      anchorEpoch = sample.epochMs + Math.max(0, performance.now() - started - (sample.processingMs ?? 0)) / 2; anchorMono = performance.now();
      canvas.dataset.clockSource = sample.source; tick();
    } catch { if (!disposed) canvas.dataset.clockSource = 'offline-holdover'; }
  };
  const visible = () => { if (!document.hidden) { tick(); void sync(); } };
  canvas.dataset.clockSource = 'local-pending'; tick(); void sync();
  // One texture upload and room render per second, not a perpetual 60fps loop.
  const ticks = setInterval(tick, 1000), resync = setInterval(() => { if (!document.hidden) void sync(); }, 300_000);
  document.addEventListener('visibilitychange', visible);
  return () => { disposed = true; controller?.abort(); clearInterval(ticks); clearInterval(resync); document.removeEventListener('visibilitychange', visible); };
}
