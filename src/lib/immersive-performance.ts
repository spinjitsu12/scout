/** Render quality timing, kept separate from the fixed physics clock. */
export type ImmersiveGraphicsQuality = 'auto' | 'low' | 'high';
export type ImmersivePerformance = {
  quality: ImmersiveGraphicsQuality;
  devicePixelRatio: number;
  pixelRatio: number;
  shadows: boolean;
  averageFrameSeconds: number;
  slowSeconds: number;
  severeSeconds: number;
  severeSamples: number;
  fastSeconds: number;
  cooldownSeconds: number;
};
export type ImmersivePerformanceOptions = {
  quality?: ImmersiveGraphicsQuality;
  devicePixelRatio?: number;
  /** True only when the interval belongs to a rendered, visible, active world. */
  active?: boolean;
};

const deviceRatio = (value: number) => Number.isFinite(value) && value > 0 ? Math.max(.25, Math.min(4, value)) : 1;
const ratioCap = (quality: ImmersiveGraphicsQuality, ratio: number) => Math.min(ratio, quality === 'high' ? 1.65 : quality === 'low' ? 1 : 1.25);
const resetEvidence = (state: ImmersivePerformance): ImmersivePerformance => ({
  ...state, averageFrameSeconds: 1 / 60, slowSeconds: 0, severeSeconds: 0, severeSamples: 0, fastSeconds: 0,
});

export function createImmersivePerformance(quality: ImmersiveGraphicsQuality = 'auto', devicePixelRatio = 1): ImmersivePerformance {
  const ratio = deviceRatio(devicePixelRatio);
  return {
    quality, devicePixelRatio: ratio, pixelRatio: ratioCap(quality, ratio), shadows: quality !== 'low',
    averageFrameSeconds: 1 / 60, slowSeconds: 0, severeSeconds: 0, severeSamples: 0, fastSeconds: 0, cooldownSeconds: 0,
  };
}

/**
 * Observe real render intervals, including frames longer than 250 ms. Evidence
 * uses at most half a second per frame and severe pressure requires three slow
 * samples, so an isolated shader/display stall cannot immediately lower quality.
 * Paused intervals clear the evidence and never consume a recovery cooldown.
 */
export function advanceImmersivePerformance(previous: ImmersivePerformance, seconds: number, options: ImmersivePerformanceOptions = {}): {
  state: ImmersivePerformance; pixelRatio: number; shadows: boolean; changed: boolean;
} {
  const quality = options.quality ?? previous.quality;
  const ratio = deviceRatio(options.devicePixelRatio ?? previous.devicePixelRatio);
  let state = quality !== previous.quality || ratio !== previous.devicePixelRatio
    ? createImmersivePerformance(quality, ratio) : { ...previous };

  if (options.active === false) state = resetEvidence(state);
  else if (quality === 'auto' && Number.isFinite(seconds) && seconds > 0) {
    const frameSeconds = Math.min(seconds, 1), evidenceSeconds = Math.min(seconds, .5);
    state.averageFrameSeconds += (frameSeconds - state.averageFrameSeconds) * (1 - Math.exp(-2 * evidenceSeconds));
    state.cooldownSeconds = Math.max(0, state.cooldownSeconds - evidenceSeconds);

    const slow = frameSeconds > .023 && state.averageFrameSeconds > .023;
    const severe = frameSeconds >= .05 && state.averageFrameSeconds >= .045;
    state.slowSeconds = slow ? state.slowSeconds + evidenceSeconds : Math.max(0, state.slowSeconds - 2 * evidenceSeconds);
    state.severeSeconds = severe ? state.severeSeconds + evidenceSeconds : 0;
    state.severeSamples = severe ? state.severeSamples + 1 : 0;
    state.fastSeconds = frameSeconds <= .018 && state.averageFrameSeconds <= .018 ? state.fastSeconds + evidenceSeconds : 0;

    const cap = ratioCap(quality, ratio), floor = Math.min(.7, cap);
    const severePressure = state.severeSamples >= 3 && state.severeSeconds >= 1;
    if (state.cooldownSeconds === 0 && (severePressure || state.slowSeconds >= 3)) {
      const nextRatio = Math.max(floor, state.pixelRatio * (severePressure ? .8 : .9));
      const nextShadows = state.shadows && !severePressure && nextRatio >= 1 && nextRatio > floor;
      if (nextRatio < state.pixelRatio - 1e-8 || nextShadows !== state.shadows) {
        state.pixelRatio = nextRatio; state.shadows = nextShadows; state.cooldownSeconds = 2;
      }
      state.slowSeconds = 0; state.severeSeconds = 0; state.severeSamples = 0; state.fastSeconds = 0;
    } else if (state.cooldownSeconds === 0 && state.fastSeconds >= 12) {
      state.pixelRatio = Math.min(cap, state.pixelRatio * 1.08);
      if (state.pixelRatio >= Math.min(cap, 1.05) - 1e-8) state.shadows = true;
      state.cooldownSeconds = 3; state.fastSeconds = 0; state.slowSeconds = 0;
    }
  }

  return { state, pixelRatio: state.pixelRatio, shadows: state.shadows,
    changed: Math.abs(state.pixelRatio - previous.pixelRatio) > 1e-8 || state.shadows !== previous.shadows };
}
