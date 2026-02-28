// audio/engine/scheduler.ts
export function now(ctx: AudioContext, dt = 0.01) {
  return ctx.currentTime + dt;
}

/**
 * 간단 ADSR(실제로는 A-D-(S*peak)-R까지 한번에 꺼짐)
 * WebAudio param scheduling 안전하게: cancel + setValueAtTime
 */
export function envADSR(
  param: AudioParam,
  t: number,
  A = 0.002,
  D = 0.05,
  S = 0.0,
  R = 0.03,
  peak = 1.0
) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + A);
  param.linearRampToValueAtTime(S * peak, t + A + D);
  param.linearRampToValueAtTime(0, t + A + D + R);
}

export function safeDisconnect(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    /* noop */
  }
}

export function safeStop(src: AudioScheduledSourceNode, t?: number) {
  try {
    if (t != null) src.stop(t);
    else src.stop();
  } catch {
    /* noop */
  }
}