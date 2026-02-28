// audio/modules/noise.ts
export function noiseBuffer(ctx: AudioContext, sec = 0.12) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function burstBuffer(ctx: AudioContext, ms = 6) {
  const n = Math.max(8, Math.floor((ctx.sampleRate * ms) / 1000));
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let a = 1.0;
  const tau = n / 6;
  for (let i = 0; i < n; i++) {
    d[i] = (Math.random() * 2 - 1) * a;
    a *= Math.exp(-1 / tau);
  }
  return b;
}