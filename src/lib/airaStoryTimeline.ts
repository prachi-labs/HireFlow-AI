
/**
 * ============================================================================
 * AIRA SCROLL STORY — CONFIGURATION & PURE TIMELINE MATH
 * ============================================================================
 * 300 transparent WebP frames:
 * public/assets/aira-frames/aira0001.webp ... aira0300.webp
 */

export type AiraAssetMode =
  | 'turntable-video'
  | 'frame-sequence'
  | 'fallback-image';

export const AIRA_STORY_CONFIG = {
  /**
   * frame-sequence renders 300 transparent WebP frames on a canvas.
   * turntable-video and fallback-image remain available as alternatives.
   */
  assetMode: 'frame-sequence' as AiraAssetMode,

  assets: {
    turntableVideoUrl: '/assets/aira-turntable.mp4',
    frameCount: 300,
    frameUrlTemplate: '/assets/aira-frames/aira{index}.webp',
    fallbackImageUrl:
      '/assets/aistudio/Friendly_AI_Assistant_Presenting_Tablet_c095fa83.png',
  },

  /** Scroll track height in vh. */
  desktopScrollVh: 500,
  mobileScrollVh: 350,
  mobileBreakpointPx: 820,

  /** Per-frame scroll smoothing. */
  smoothing: 0.15,

  /** Story chapter progress windows. */
  beats: {
    intro: {
      start: 0.0,
      end: 0.1,
      focusP: 0.04,
      label: '01',
      shortTitle: 'Meet Aira',
    },
    screening: {
      start: 0.1,
      end: 0.35,
      focusP: 0.225,
      label: '02',
      shortTitle: 'CV Match',
    },
    voice: {
      start: 0.35,
      end: 0.6,
      focusP: 0.475,
      label: '03',
      shortTitle: 'Voice Calls',
    },
    report: {
      start: 0.6,
      end: 0.85,
      focusP: 0.725,
      label: '04',
      shortTitle: 'Scorecard',
    },
    closing: {
      start: 0.85,
      end: 1.0,
      focusP: 0.96,
      label: '05',
      shortTitle: 'Launch',
    },
  },

  /** Editorial copy. */
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

export type BeatId =
  | 'intro'
  | 'screening'
  | 'voice'
  | 'report'
  | 'closing';

export interface BeatEnvelope {
  active: boolean;
  visibility: number;
  opacity: number;
  blurPx: number;
  offsetX: number;
  offsetY: number;
  tiltDeg: number;
  localProgress: number;
}

export interface AiraStagePose {
  progress: number;
  rotationDeg: number;
  cameraScale: number;
  parallaxRotateYDeg: number;
  parallaxRotateXDeg: number;
  parallaxShiftX: number;
  glowOffsetX: number;
  glowScale: number;
  shadowOffsetX: number;
  shadowScaleX: number;
  activeBeat: BeatId;
  edgeBeatIndex: number;
  intro: BeatEnvelope;
  screening: BeatEnvelope;
  voice: BeatEnvelope;
  report: BeatEnvelope;
  closing: BeatEnvelope;
}

/** Clamp a value to the range 0–1. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Cubic ease-out. */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/** Cubic ease-in-out. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);

  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Smooth displayed scroll progress toward actual scroll progress.
 */
export function stepSmoothedProgress(
  current: number,
  target: number,
  smoothing: number = AIRA_STORY_CONFIG.smoothing
): number {
  const clampedTarget = clamp01(target);
  const clampedCurrent = clamp01(current);
  const safeSmoothing = clamp01(smoothing);

  const next =
    clampedCurrent +
    (clampedTarget - clampedCurrent) * safeSmoothing;

  if (Math.abs(clampedTarget - next) < 0.00025) {
    return clampedTarget;
  }

  return clamp01(next);
}

/**
 * Convert scroll progress into 0–360 degree Aira rotation.
 *
 * 0.00–0.10: Front view
 * 0.10–0.35: 0–120 degrees
 * 0.35–0.60: 120–240 degrees
 * 0.60–0.85: 240–330 degrees
 * 0.85–1.00: 330–360 degrees
 *
 * 360 degrees returns to the same visual position as 0 degrees.
 */
export function computeAiraRotationDeg(progress: number): number {
  const p = clamp01(progress);

  const { intro, screening, voice, report, closing } =
    AIRA_STORY_CONFIG.beats;

  if (p <= intro.end) {
    return 0;
  }

  if (p <= screening.end) {
    const t = easeInOutCubic(
      (p - screening.start) /
        (screening.end - screening.start)
    );

    return lerp(0, 120, t);
  }

  if (p <= voice.end) {
    const t = easeInOutCubic(
      (p - voice.start) /
        (voice.end - voice.start)
    );

    return lerp(120, 240, t);
  }

  if (p <= report.end) {
    const t = easeInOutCubic(
      (p - report.start) /
        (report.end - report.start)
    );

    return lerp(240, 330, t);
  }

  const t = easeInOutCubic(
    (p - closing.start) /
      (closing.end - closing.start)
  );

  return lerp(330, 360, t);
}

/**
 * Calculate camera zoom scale.
 */
export function computeCameraScale(progress: number): number {
  const p = clamp01(progress);

  const { intro, screening, voice, report, closing } =
    AIRA_STORY_CONFIG.beats;

  if (p <= intro.end) {
    return lerp(
      1.0,
      1.04,
      easeOutCubic(p / intro.end)
    );
  }

  if (p <= screening.end) {
    return lerp(
      1.04,
      1.06,
      easeInOutCubic(
        (p - screening.start) /
          (screening.end - screening.start)
      )
    );
  }

  if (p <= voice.end) {
    return lerp(
      1.06,
      1.11,
      easeInOutCubic(
        (p - voice.start) /
          (voice.end - voice.start)
      )
    );
  }

  if (p <= report.end) {
    return lerp(
      1.11,
      1.06,
      easeInOutCubic(
        (p - report.start) /
          (report.end - report.start)
      )
    );
  }

  return lerp(
    1.06,
    1.0,
    easeInOutCubic(
      (p - closing.start) /
        (closing.end - closing.start)
    )
  );
}

/**
 * Convert rotation degrees into a zero-based frame index.
 *
 * Frame array indexes: 0–299
 * Image filenames: aira0001.webp–aira0300.webp
 *
 * Both 0 and 360 degrees map to frame index 0.
 */
export function rotationDegToFrameIndex(
  rotationDeg: number,
  frameCount: number
): number {
  if (!Number.isFinite(rotationDeg) || frameCount <= 1) {
    return 0;
  }

  const wrapped =
    ((rotationDeg % 360) + 360) % 360;

  const index =
    Math.round((wrapped / 360) * frameCount) % frameCount;

  return Math.max(
    0,
    Math.min(frameCount - 1, index)
  );
}

/**
 * Calculate the enter, hold and exit envelope for a story beat.
 *
 * side = -1: left-docked card
 * side =  1: right-docked card
 * side =  0: centered copy
 */
export function computeBeatEnvelope(
  progress: number,
  start: number,
  end: number,
  side: -1 | 0 | 1,
  options?: {
    stayVisibleAtStart?: boolean;
    stayVisibleAtEnd?: boolean;
  }
): BeatEnvelope {
  const p = clamp01(progress);
  const span = Math.max(0.001, end - start);

  const localProgress = clamp01(
    (p - start) / span
  );

  if (
    options?.stayVisibleAtStart &&
    p <= start + span * 0.72
  ) {
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

  if (
    options?.stayVisibleAtEnd &&
    p >= start + span * 0.35
  ) {
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

  // Small overlap outside the beat window.
  const margin = span * 0.08;

  if (
    p < start - margin ||
    p > end + margin
  ) {
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

  const normalized = clamp01(
    (p - (start - margin)) /
      (span + margin * 2)
  );

  const enterEnd = 0.24;
  const exitStart = 0.76;

  if (normalized < enterEnd) {
    const t = easeOutCubic(
      normalized / enterEnd
    );

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

  const exitT = easeInOutCubic(
    (normalized - exitStart) /
      (1 - exitStart)
  );

  const visibility = 1 - exitT;

  return {
    active: visibility > 0.04,
    visibility,
    opacity: visibility,
    blurPx: exitT * 7,
    offsetX: side * exitT * 18,
    offsetY: -exitT * 22,
    tiltDeg: side * exitT * 6,
    localProgress,
  };
}

/**
 * Calculate the complete visual pose for a scroll position
 * and pointer offset.
 *
 * pointerX and pointerY are expected to be between -1 and 1.
 */
export function computeAiraStagePose(
  progress: number,
  pointerX: number = 0,
  pointerY: number = 0
): AiraStagePose {
  const p = clamp01(progress);

  const px = Math.max(
    -1,
    Math.min(
      1,
      Number.isFinite(pointerX) ? pointerX : 0
    )
  );

  const py = Math.max(
    -1,
    Math.min(
      1,
      Number.isFinite(pointerY) ? pointerY : 0
    )
  );

  const rotationDeg = computeAiraRotationDeg(p);
  const cameraScale = computeCameraScale(p);

  const angleRad =
    (rotationDeg * Math.PI) / 180;

  // Fallback 3D parallax transformations.
  const rawSin = Math.sin(angleRad);
  const rawCos = Math.cos(angleRad);

  const sinA =
    Math.abs(rawSin) < 1e-12 ? 0 : rawSin;

  const cosA =
    Math.abs(rawCos - 1) < 1e-12 ? 1 : rawCos;

  const parallaxRotateYDeg =
    sinA * 9.5 + px * 5.5;

  const parallaxRotateXDeg =
    (1 - cosA) * 2.2 - py * 3.5;

  const parallaxShiftX =
    sinA * 14 + px * 10;

  const glowOffsetX =
    -sinA * 46 - px * 22;

  const glowScale =
    0.96 +
    (cameraScale - 1) * 1.4 +
    (1 - cosA) * 0.06;

  const shadowOffsetX =
    sinA * 12 + px * 6;

  const shadowScaleX =
    1 -
    Math.abs(sinA) * 0.06 +
    (cameraScale - 1) * 0.4;

  const { intro, screening, voice, report, closing } =
    AIRA_STORY_CONFIG.beats;

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

    intro: computeBeatEnvelope(
      p,
      intro.start,
      intro.end,
      0,
      { stayVisibleAtStart: true }
    ),

    screening: computeBeatEnvelope(
      p,
      screening.start,
      screening.end,
      -1
    ),

    voice: computeBeatEnvelope(
      p,
      voice.start,
      voice.end,
      1
    ),

    report: computeBeatEnvelope(
      p,
      report.start,
      report.end,
      -1
    ),

    closing: computeBeatEnvelope(
      p,
      closing.start,
      closing.end,
      0,
      { stayVisibleAtEnd: true }
    ),
  };
}
