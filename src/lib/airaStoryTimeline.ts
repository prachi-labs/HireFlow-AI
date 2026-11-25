/**
 * ============================================================================
 * AIRA SCROLL STORY — TUNABLE CONFIGURATION & PURE TIMELINE MATH
 * ============================================================================
 * Adjust scroll lengths, inertia smoothing, chapter ranges, copy, and asset
 * mode here without touching rendering logic.
 */

export type AiraAssetMode = 'turntable-video' | 'frame-sequence' | 'fallback-image';

export const AIRA_STORY_CONFIG = {
  /**
   * ASSET MODE SELECTION (Preference Order):
   * 1. 'turntable-video' -> /assets/aira-turntable.mp4 (blob preloaded, keyframe-every-frame scrub)
   * 2. 'frame-sequence'  -> /assets/frames/aira_0001.webp .. aira_0072.webp on <canvas>
   * 3. 'fallback-image'  -> Single transparent Aira cutout with layered 3D parallax & depth glow
   *
   * FALLBACK NOTICE: Only the single cutout image is currently supplied in the workspace.
   * Switch assetMode once true 360-degree turntable assets are added to public/assets/.
   */
  assetMode: 'fallback-image' as AiraAssetMode,
  assets: {
    turntableVideoUrl: '/assets/aira-turntable.mp4',
    frameCount: 72,
    frameUrlTemplate: '/assets/frames/aira_{index}.webp',
    fallbackImageUrl: '/assets/aistudio/Friendly_AI_Assistant_Presenting_Tablet_c095fa83.png',
  },

  /** Scroll track height in vh (desktop > 820px vs mobile <= 820px) */
  desktopScrollVh: 500,
  mobileScrollVh: 350,
  mobileBreakpointPx: 820,

  /** Per-frame easing factor toward target scroll progress (0.12 to 0.18) */
  smoothing: 0.15,

  /** Chapter / beat progress windows [start, end] across normalized scroll p in [0, 1] */
  beats: {
    intro: { start: 0.0, end: 0.1, focusP: 0.04, label: '01', shortTitle: 'Meet Aira' },
    screening: { start: 0.1, end: 0.35, focusP: 0.225, label: '02', shortTitle: 'CV Match' },
    voice: { start: 0.35, end: 0.6, focusP: 0.475, label: '03', shortTitle: 'Voice Calls' },
    report: { start: 0.6, end: 0.85, focusP: 0.725, label: '04', shortTitle: 'Scorecard' },
    closing: { start: 0.85, end: 1.0, focusP: 0.96, label: '05', shortTitle: 'Launch' },
  },

  /** Editorial copy */
  copy: {
    introEyebrow: 'Meet Aira',
    introHeadline: 'Meet Aira',
    introSubline: 'Your AI recruiter.',
    closingEyebrow: 'Ready when your team is',
    closingHeadline: 'Let Aira handle the first step',
    closingCtaLabel: 'Start Recruiting',
    closingCtaTo: '/signup',
  },
} as const;

export type BeatId = 'intro' | 'screening' | 'voice' | 'report' | 'closing';

export interface BeatEnvelope {
  active: boolean;
  visibility: number; // 0..1
  opacity: number; // 0..1
  blurPx: number; // 0..8
  offsetX: number; // px
  offsetY: number; // px
  tiltDeg: number; // deg
  localProgress: number; // 0..1 within beat
}

export interface AiraStagePose {
  progress: number;
  rotationDeg: number; // 0..360 (0 and 360 match seam)
  cameraScale: number; // ~1.00..1.11
  parallaxRotateYDeg: number; // fallback 3D perspective yaw
  parallaxRotateXDeg: number; // fallback 3D perspective pitch
  parallaxShiftX: number; // px horizontal drift
  glowOffsetX: number; // px depth-shifted rim glow
  glowScale: number;
  shadowOffsetX: number;
  shadowScaleX: number;
  activeBeat: BeatId;
  edgeBeatIndex: number; // 0..3 for the 4-beat edge rail
  intro: BeatEnvelope;
  screening: BeatEnvelope;
  voice: BeatEnvelope;
  report: BeatEnvelope;
  closing: BeatEnvelope;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Smoothly steps displayed scroll progress toward real scroll progress.
 */
export function stepSmoothedProgress(
  current: number,
  target: number,
  smoothing: number = AIRA_STORY_CONFIG.smoothing
): number {
  const clampedTarget = clamp01(target);
  const clampedCurrent = clamp01(current);
  const next = clampedCurrent + (clampedTarget - clampedCurrent) * smoothing;
  if (Math.abs(clampedTarget - next) < 0.00025) {
    return clampedTarget;
  }
  return clamp01(next);
}

/**
 * Computes turntable rotation in degrees [0..360] aligned with Section 4:
 * 0.00..0.10 -> 0 deg (front)
 * 0.10..0.35 -> 0..120 deg
 * 0.35..0.60 -> 120..240 deg
 * 0.60..0.85 -> 240..330 deg
 * 0.85..1.00 -> 330..360 deg (returns to front; 360 === 0 seam)
 */
export function computeAiraRotationDeg(p: number): number {
  const x = clamp01(p);
  const { intro, screening, voice, report, closing } = AIRA_STORY_CONFIG.beats;

  if (x <= intro.end) return 0;
  if (x <= screening.end) {
    const t = easeInOutCubic((x - screening.start) / (screening.end - screening.start));
    return lerp(0, 120, t);
  }
  if (x <= voice.end) {
    const t = easeInOutCubic((x - voice.start) / (voice.end - voice.start));
    return lerp(120, 240, t);
  }
  if (x <= report.end) {
    const t = easeInOutCubic((x - report.start) / (report.end - report.start));
    return lerp(240, 330, t);
  }
  const t = easeInOutCubic((x - closing.start) / (closing.end - closing.start));
  return lerp(330, 360, t);
}

/**
 * Computes camera scale aligned with Section 4:
 * 0.00..0.10 -> slight zoom-in (1.00 -> 1.04)
 * 0.10..0.35 -> 1.04 -> 1.06
 * 0.35..0.60 -> eases slightly closer (1.06 -> 1.11)
 * 0.60..0.85 -> 1.11 -> 1.06
 * 0.85..1.00 -> eases back to normal scale (1.06 -> 1.00)
 */
export function computeCameraScale(p: number): number {
  const x = clamp01(p);
  const { intro, screening, voice, report, closing } = AIRA_STORY_CONFIG.beats;

  if (x <= intro.end) {
    return lerp(1.0, 1.04, easeOutCubic(x / intro.end));
  }
  if (x <= screening.end) {
    return lerp(1.04, 1.06, easeInOutCubic((x - screening.start) / (screening.end - screening.start)));
  }
  if (x <= voice.end) {
    return lerp(1.06, 1.11, easeInOutCubic((x - voice.start) / (voice.end - voice.start)));
  }
  if (x <= report.end) {
    return lerp(1.11, 1.06, easeInOutCubic((x - report.start) / (report.end - report.start)));
  }
  return lerp(1.06, 1.0, easeInOutCubic((x - closing.start) / (closing.end - closing.start)));
}

/**
 * Maps rotation degrees [0..360] onto a seamless frame index [0..frameCount-1]
 * where frame 0 corresponds to both 0 deg and 360 deg (zero seam flicker).
 */
export function rotationDegToFrameIndex(rotationDeg: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const wrapped = ((rotationDeg % 360) + 360) % 360;
  const idx = Math.round((wrapped / 360) * frameCount) % frameCount;
  return idx;
}

/**
 * Computes card/headline enter -> hold -> exit envelope for a beat window.
 * Side = -1 for left-docked cards, +1 for right-docked cards, 0 for centered copy.
 */
export function computeBeatEnvelope(
  p: number,
  start: number,
  end: number,
  side: -1 | 0 | 1,
  options?: { stayVisibleAtStart?: boolean; stayVisibleAtEnd?: boolean }
): BeatEnvelope {
  const span = Math.max(0.001, end - start);
  const rawLocal = (p - start) / span;
  const localProgress = clamp01(rawLocal);

  if (options?.stayVisibleAtStart && p <= start + span * 0.72) {
    const enterT = p <= start ? 1 : 1;
    return {
      active: true,
      visibility: enterT,
      opacity: enterT,
      blurPx: 0,
      offsetX: 0,
      offsetY: 0,
      tiltDeg: 0,
      localProgress,
    };
  }

  if (options?.stayVisibleAtEnd && p >= start + span * 0.35) {
    return {
      active: true,
      visibility: 1,
      opacity: 1,
      blurPx: 0,
      offsetX: 0,
      offsetY: 0,
      tiltDeg: 0,
      localProgress,
    };
  }

  // Slight soft bleed outside nominal beat window for overlap smoothness
  const margin = span * 0.08;
  if (p < start - margin || p > end + margin) {
    return {
      active: false,
      visibility: 0,
      opacity: 0,
      blurPx: 8,
      offsetX: side * 26,
      offsetY: 28,
      tiltDeg: side * -8,
      localProgress,
    };
  }

  const normalized = clamp01((p - (start - margin)) / (span + margin * 2));
  const enterEnd = 0.24;
  const exitStart = 0.76;

  if (normalized < enterEnd) {
    const t = easeOutCubic(normalized / enterEnd);
    return {
      active: t > 0.04,
      visibility: t,
      opacity: t,
      blurPx: (1 - t) * 8,
      offsetX: side * (1 - t) * 28,
      offsetY: (1 - t) * 26,
      tiltDeg: side * (1 - t) * -9,
      localProgress,
    };
  }

  if (normalized <= exitStart) {
    return {
      active: true,
      visibility: 1,
      opacity: 1,
      blurPx: 0,
      offsetX: 0,
      offsetY: 0,
      tiltDeg: 0,
      localProgress,
    };
  }

  const exitT = easeInOutCubic((normalized - exitStart) / (1 - exitStart));
  const vis = 1 - exitT;
  return {
    active: vis > 0.04,
    visibility: vis,
    opacity: vis,
    blurPx: exitT * 7,
    offsetX: side * exitT * 18,
    offsetY: -exitT * 22,
    tiltDeg: side * exitT * 6,
    localProgress,
  };
}

/**
 * Computes full stage pose for a given smoothed scroll progress and pointer offset (-1..1).
 */
export function computeAiraStagePose(
  progress: number,
  pointerX: number = 0,
  pointerY: number = 0
): AiraStagePose {
  const p = clamp01(progress);
  const px = Math.max(-1, Math.min(1, pointerX));
  const py = Math.max(-1, Math.min(1, pointerY));

  const rotationDeg = computeAiraRotationDeg(p);
  const cameraScale = computeCameraScale(p);
  const angleRad = (rotationDeg * Math.PI) / 180;

  // Fallback 3D parallax rig transforms (always returns to exact 0 at p=0 and p=1)
  const rawSinA = Math.sin(angleRad);
  const rawCosA = Math.cos(angleRad);
  const sinA = Math.abs(rawSinA) < 1e-12 ? 0 : rawSinA;
  const cosA = Math.abs(rawCosA - 1) < 1e-12 ? 1 : rawCosA;
  const parallaxRotateYDeg = sinA * 9.5 + px * 5.5;
  const parallaxRotateXDeg = (1 - cosA) * 2.2 - py * 3.5;
  const parallaxShiftX = sinA * 14 + px * 10;

  const glowOffsetX = -sinA * 46 - px * 22;
  const glowScale = 0.96 + (cameraScale - 1) * 1.4 + (1 - cosA) * 0.06;

  const shadowOffsetX = sinA * 12 + px * 6;
  const shadowScaleX = 1 - Math.abs(sinA) * 0.06 + (cameraScale - 1) * 0.4;

  const { intro, screening, voice, report, closing } = AIRA_STORY_CONFIG.beats;

  let activeBeat: BeatId = 'intro';
  let edgeBeatIndex = 0;
  if (p >= closing.start) {
    activeBeat = 'closing';
    edgeBeatIndex = 3;
  } else if (p >= report.start) {
    activeBeat = 'report';
    edgeBeatIndex = 3;
  } else if (p >= voice.start) {
    activeBeat = 'voice';
    edgeBeatIndex = 2;
  } else if (p >= screening.start) {
    activeBeat = 'screening';
    edgeBeatIndex = 1;
  }

  return {
    progress: p,
    rotationDeg,
    cameraScale,
    parallaxRotateYDeg,
    parallaxRotateXDeg,
    parallaxShiftX,
    glowOffsetX,
    glowScale,
    shadowOffsetX,
    shadowScaleX,
    activeBeat,
    edgeBeatIndex,
    intro: computeBeatEnvelope(p, intro.start, intro.end, 0, { stayVisibleAtStart: true }),
    screening: computeBeatEnvelope(p, screening.start, screening.end, -1),
    voice: computeBeatEnvelope(p, voice.start, voice.end, 1),
    report: computeBeatEnvelope(p, report.start, report.end, -1),
    closing: computeBeatEnvelope(p, closing.start, closing.end, 0, { stayVisibleAtEnd: true }),
  };
}
