// audio/engine/graph.ts
export interface GraphOptions {
  masterGain?: number; // default 0.8
}

/**
 * 표준 버스:
 * modules -> mixBus -> fxBus -> master -> destination
 */
export function createGraph(ctx: AudioContext, destination: AudioNode, opts: GraphOptions = {}) {
  const mixBus = ctx.createGain();
  mixBus.gain.value = 1.0;

  const fxBus = ctx.createGain();
  fxBus.gain.value = 1.0;

  const master = ctx.createGain();
  master.gain.value = opts.masterGain ?? 0.8;

  mixBus.connect(fxBus);
  fxBus.connect(master);
  master.connect(destination);

  return { mixBus, fxBus, master, destination };
}