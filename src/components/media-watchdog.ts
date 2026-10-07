export function watchMediaLoad(input: { current(): boolean; ready(): boolean; timeout(): void }, timeoutMs = 20_000): () => void {
  const timer = setTimeout(() => { if (input.current() && !input.ready()) input.timeout(); }, timeoutMs);
  return () => clearTimeout(timer);
}

export async function waitForMediaPlay(play: () => Promise<void>, timeoutMs = 10_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DOMException("Video play confirmation timed out", "TimeoutError")), timeoutMs);
  });
  try { await Promise.race([play(), deadline]); }
  finally { clearTimeout(timer); }
}
