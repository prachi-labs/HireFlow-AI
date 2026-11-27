import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileSearch, PhoneCall, Sparkles } from 'lucide-react';
import styles from './AiraStorySection.module.css';

interface DepthParticle {
  x: number;
  y: number;
  radius: number;
  depth: number; // 0.35 (far) .. 1.35 (near)
  alpha: number;
  speedY: number;
  driftPhase: number;
  kind: 'mote' | 'streak';
  length: number;
}

function createDepthParticles(count: number): DepthParticle[] {
  const list: DepthParticle[] = [];
  for (let i = 0; i < count; i++) {
    const isStreak = i % 7 === 0;
    list.push({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41 + 17) % 100) / 100,
      radius: isStreak ? 1.4 : 1.1 + (i % 4) * 0.75,
      depth: 0.4 + ((i * 19) % 10) * 0.095,
      alpha: isStreak ? 0.14 + (i % 3) * 0.06 : 0.18 + (i % 5) * 0.09,
      speedY: 0.00018 + (i % 5) * 0.00008,
      driftPhase: (i * 1.37) % (Math.PI * 2),
      kind: isStreak ? 'streak' : 'mote',
      length: 36 + (i % 4) * 18,
    });
  }
  return list;
}

const SAMPLE_SKILLS = ['TypeScript', 'PostgreSQL', 'Distributed APIs', 'System Design'];
const WAVE_HEIGHTS = [0.35, 0.7, 0.52, 0.95, 0.62, 0.85, 0.4, 0.92, 0.78, 0.48, 0.88, 0.58, 0.96, 0.68, 0.44, 0.74, 0.5, 0.36];
const RUBRIC_SCORES = [
  { label: 'Technical Depth', score: 4.6 },
  { label: 'Problem Solving', score: 4.4 },
  { label: 'Communication', score: 4.8 },
];

const EDGE_BEATS = [
  { label: '01', title: 'Meet Aira', focusP: AIRA_STORY_CONFIG.beats.intro.focusP },
  { label: '02', title: 'CV Match', focusP: AIRA_STORY_CONFIG.beats.screening.focusP },
  { label: '03', title: 'Voice Calls', focusP: AIRA_STORY_CONFIG.beats.voice.focusP },
  { label: '04', title: 'Scorecard', focusP: AIRA_STORY_CONFIG.beats.report.focusP },
];

function ScreeningPreviewCard({ ringRef }: { ringRef?: React.RefObject<SVGCircleElement | null> }) {
  return (
    <div className={`${styles.glassCard} p-5 sm:p-6 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C26A8A]">
          <FileSearch className="w-3.5 h-3.5" aria-hidden="true" />
          CV-to-JD Match
        </span>
        <span className="text-[11px] text-[#C8B9C0]/80 font-medium">Sample preview</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
            <circle
              ref={ringRef}
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="url(#airaMatchGrad)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="163.36"
              strokeDashoffset="13.07"
            />
            <defs>
              <linearGradient id="airaMatchGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#C26A8A" />
                <stop offset="100%" stopColor="#39C98A" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute font-data text-sm font-bold text-white">92%</span>
        </div>

        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white leading-snug">CV matched to the job description</h3>
          <p className="text-xs text-[#C8B9C0] mt-1">Senior Backend Engineer · Weighted JD Fit</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Matched sample skills">
        {SAMPLE_SKILLS.map((skill) => (
          <span
            key={skill}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium text-[#F5ECEF] bg-white/8 border border-white/12"
          >
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

function VoiceCallPreviewCard() {
  return (
    <div className={`${styles.glassCard} p-5 sm:p-6 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C26A8A]">
          <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
          Level 1 Screening
        </span>
        <span className="text-[11px] text-[#C8B9C0]/80 font-medium">Sample preview</span>
      </div>

      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white leading-snug">Aira calls shortlisted candidates</h3>
        <p className="text-xs text-[#C8B9C0] leading-relaxed">
          Structured voice interview with consent disclosure, natural turn-taking, and English or Hindi support.
        </p>
      </div>

      <div className="rounded-xl bg-[#10090D]/60 border border-white/10 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#39C98A]/15 text-[#39C98A] border border-[#39C98A]/35">
            Call Active · Consent Verified
          </span>
          <span className="font-mono-num text-[11px] text-[#C8B9C0]">02:14</span>
        </div>

        <div className="h-9 flex items-end justify-between gap-1 px-1" aria-hidden="true">
          {WAVE_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={`${styles.waveBar} flex-1 rounded-full bg-gradient-to-t from-[#7B2948] via-[#C26A8A] to-[#FFFFFF]/90`}
              style={{
                height: `${Math.round(h * 100)}%`,
                animationDelay: `${(i % 6) * 0.14}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function InterviewReportPreviewCard({
  barRefs,
}: {
  barRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
}) {
  return (
    <div className={`${styles.glassCard} p-5 sm:p-6 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C26A8A]">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Recruiter Scorecard
        </span>
        <span className="text-[11px] text-[#C8B9C0]/80 font-medium">Sample preview</span>
      </div>

      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white leading-snug">Transcript-verified interview report</h3>
        <p className="text-xs text-[#C8B9C0]">Evidence-anchored rubric scores — recruiters always hold final approval.</p>
      </div>

      <div className="space-y-2.5">
        {RUBRIC_SCORES.map((item, idx) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#E6D8DE] font-medium">{item.label}</span>
              <span className="font-data text-white font-semibold">{item.score.toFixed(1)} / 5.0</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                ref={(el) => {
                  if (barRefs) barRefs.current[idx] = el;
                }}
                className="h-full rounded-full bg-gradient-to-r from-[#7B2948] via-[#C26A8A] to-[#39C98A] origin-left"
                style={{ width: `${(item.score / 5) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="pt-1 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#39C98A]/15 text-[#39C98A] border border-[#39C98A]/35">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          Advance to Level 2
        </span>
        <span className="text-[11px] text-[#C8B9C0]">PDF Ready</span>
      </div>
    </div>
  );
}

export function AiraStorySection() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [activeBeatIdx, setActiveBeatIdx] = useState(0);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [turntableObjectUrl, setTurntableObjectUrl] = useState<string | null>(null);

  const sectionRef = useRef<HTMLElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Direct DOM refs updated inside rAF to keep 60fps with zero React re-renders
  const farGlowRef = useRef<HTMLDivElement | null>(null);
  const rimGlowRef = useRef<HTMLDivElement | null>(null);
  const floorShadowRef = useRef<HTMLDivElement | null>(null);
  const airaRigRef = useRef<HTMLDivElement | null>(null);

  const introRef = useRef<HTMLDivElement | null>(null);
  const screeningRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef<HTMLDivElement | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef<HTMLDivElement | null>(null);
  const edgeFillRef = useRef<HTMLDivElement | null>(null);
  const matchRingRef = useRef<SVGCircleElement | null>(null);
  const scoreBarRefs = useRef<(HTMLDivElement | null)[]>([]);

  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const lastFrameIdxRef = useRef<number>(-1);
  const activeBeatIdxRef = useRef<number>(0);

  // Wake the animation loop when an image finishes loading.
  const wakeRenderLoopRef = useRef<(() => void) | null>(null);

  // Ensure html/body overflow-x: clip while this landing section is mounted so position: sticky works in Chromium
  useEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlOverflowX = htmlEl.style.overflowX;
    const prevBodyOverflowX = bodyEl.style.overflowX;
    htmlEl.style.overflowX = 'clip';
    bodyEl.style.overflowX = 'clip';
    return () => {
      htmlEl.style.overflowX = prevHtmlOverflowX;
      bodyEl.style.overflowX = prevBodyOverflowX;
    };
  }, []);

  // Track prefers-reduced-motion & mobile <= 820px breakpoint
  useEffect(() => {
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileMq = window.matchMedia(`(max-width: ${AIRA_STORY_CONFIG.mobileBreakpointPx}px)`);

    const syncMotion = () => setReducedMotion(motionMq.matches);
    const syncMobile = () => setIsMobileLayout(mobileMq.matches);

    syncMotion();
    syncMobile();

    motionMq.addEventListener('change', syncMotion);
    mobileMq.addEventListener('change', syncMobile);
    return () => {
      motionMq.removeEventListener('change', syncMotion);
      mobileMq.removeEventListener('change', syncMobile);
    };
  }, []);

  
  // Option 1 & Option 2 Asset Preloaders
  useEffect(() => {
    if (reducedMotion) return;

    // Option 1: Turntable video
    if (AIRA_STORY_CONFIG.assetMode === 'turntable-video') {
      let active = true;
      let objectUrl: string | null = null;

      fetch(AIRA_STORY_CONFIG.assets.turntableVideoUrl)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error('Unable to load Aira turntable video.');
          }

          const blob = await res.blob();

          if (!active) return;

          objectUrl = URL.createObjectURL(blob);
          setTurntableObjectUrl(objectUrl);
          setAssetError(null);
        })
        .catch(() => {
          if (active) {
            setAssetError('Aira 3D turntable video could not be loaded.');
          }
        });

      return () => {
        active = false;

        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }

    // Option 2: Frame sequence with batch loading
    if (AIRA_STORY_CONFIG.assetMode === 'frame-sequence') {
      let active = true;

      const total = AIRA_STORY_CONFIG.assets.frameCount;
      const batchSize = 12;

      framesRef.current = new Array<HTMLImageElement | null>(total).fill(null);
      lastFrameIdxRef.current = -1;

      const urlFor = (index: number) =>
        AIRA_STORY_CONFIG.assets.frameUrlTemplate.replace(
          '{index}',
          String(index).padStart(4, '0')
        );

      const loadFrame = (index: number): Promise<void> =>
        new Promise((resolve) => {
          const img = new Image();

          img.onload = () => {
            if (active) {
              framesRef.current[index - 1] = img;
              wakeRenderLoopRef.current?.();
            }

            resolve();
          };

          img.onerror = () => {
            console.warn(`Aira frame ${index} failed to load.`);
            resolve();
          };

          img.src = urlFor(index);
        });

      const preloadFrames = async () => {
        // Load the first frame immediately.
        await loadFrame(1);

        if (!active) return;

        if (framesRef.current[0]) {
          setAssetError(null);
        } else {
          setAssetError('Aira turntable frame sequence failed to load.');
          return;
        }

        // Load the remaining frames in batches of 12.
        for (let start = 2; start <= total; start += batchSize) {
          if (!active) return;

          const end = Math.min(start + batchSize - 1, total);
          const batch: Promise<void>[] = [];

          for (let i = start; i <= end; i++) {
            batch.push(loadFrame(i));
          }

          await Promise.all(batch);
        }
      };

      void preloadFrames();

          return () => {
        active = false;
      };
    }
  }, [reducedMotion]);

  // Main Scroll-Driven rAF Loop (paused automatically when section is off-screen)
  useEffect(() => {
    if (reducedMotion) return;

    const sectionEl = sectionRef.current;
    if (!sectionEl) return;

    let isOnScreen = true;
    let isPageVisible = !document.hidden;
    let rafId = 0;

    let targetP = 0;
    let smoothedP = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let smoothedPointerX = 0;
    let smoothedPointerY = 0;

    const particles = createDepthParticles(34);
    let lastTimestamp = performance.now();

    const syncCanvasSize = () => {
      const canvas = particleCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = Math.max(1, Math.round(rect.width * dpr));
      const nextH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
    };

    const readScrollProgress = () => {
      const rect = sectionEl.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      targetP = clamp01(-rect.top / scrollable);
    };

    const applyCardEnvelope = (
      el: HTMLDivElement | null,
      env: { opacity: number; blurPx: number; offsetX: number; offsetY: number; tiltDeg: number },
      centeredTop: boolean,
      centeredLeft: boolean
    ) => {
      if (!el) return;
      const isVisible = env.opacity > 0.015;
      el.style.visibility = isVisible ? 'visible' : 'hidden';
      el.style.opacity = env.opacity.toFixed(3);
      if (!isVisible) {
        el.style.pointerEvents = 'none';
        return;
      }
      const baseX = centeredLeft ? '-50%' : '0px';
      const baseY = centeredTop ? '-50%' : '0px';
      el.style.transform = `translate3d(calc(${baseX} + ${env.offsetX.toFixed(1)}px), calc(${baseY} + ${env.offsetY.toFixed(
        1
      )}px), 0) perspective(900px) rotateY(${env.tiltDeg.toFixed(2)}deg)`;
      el.style.filter = env.blurPx > 0.25 ? `blur(${env.blurPx.toFixed(1)}px)` : 'none';
      el.style.pointerEvents = env.opacity > 0.35 ? 'auto' : 'none';
    };

    let idleUntil = performance.now() + 800;

    const renderFrame = (now: number) => {
    const dt = Math.min(50, Math.max(1, now - lastTimestamp));
    lastTimestamp = now;

    // Frame-rate independent smoothing
    const progressEase = 1 - Math.exp(-dt / 85);
    const pointerEase = 1 - Math.exp(-dt / 120);
      // Read layout geometry once per frame before DOM writes (no layout thrash)
      const prevTargetP = targetP;
      readScrollProgress();
      if (Math.abs(targetP - prevTargetP) > 0.0001) {
        idleUntil = now + 450;
      }

     smoothedP += (targetP - smoothedP) * progressEase;

     smoothedPointerX += (targetPointerX - smoothedPointerX) * pointerEase;
     smoothedPointerY += (targetPointerY - smoothedPointerY) * pointerEase;

      const pose = computeAiraStagePose(smoothedP, smoothedPointerX, smoothedPointerY);
      sectionEl.dataset.progress = pose.progress.toFixed(3);
      sectionEl.dataset.beat = pose.activeBeat;

      if (pose.edgeBeatIndex !== activeBeatIdxRef.current) {
        activeBeatIdxRef.current = pose.edgeBeatIndex;
        setActiveBeatIdx(pose.edgeBeatIndex);
      }

      // Layer 0 & 2: Far glow, rim light, floor shadow & Aira rig transforms
      if (farGlowRef.current) {
        farGlowRef.current.style.transform = `translate3d(${(-pose.parallaxShiftX * 0.85).toFixed(1)}px, ${(
          (0.5 - pose.progress) *
          26
        ).toFixed(1)}px, 0) scale(${(1 + (pose.cameraScale - 1) * 0.6).toFixed(4)})`;
      }
      if (rimGlowRef.current) {
        rimGlowRef.current.style.transform = `translate3d(calc(-50% + ${pose.glowOffsetX.toFixed(1)}px), 0, 0) scale(${pose.glowScale.toFixed(
          4
        )})`;
      }
      if (floorShadowRef.current) {
        floorShadowRef.current.style.transform = `translate3d(calc(-50% + ${pose.shadowOffsetX.toFixed(
          1
        )}px), 0, 0) scaleX(${pose.shadowScaleX.toFixed(4)})`;
      }
      if (airaRigRef.current) {
        airaRigRef.current.style.transform = `translate3d(${pose.parallaxShiftX.toFixed(1)}px, 0, 0) scale(${pose.cameraScale.toFixed(
          4
        )}) rotateY(${pose.parallaxRotateYDeg.toFixed(2)}deg) rotateX(${pose.parallaxRotateXDeg.toFixed(2)}deg)`;
      }

      // Optional Option 1: Scrub preloaded turntable MP4
      const vid = videoRef.current;
      if (AIRA_STORY_CONFIG.assetMode === 'turntable-video' && vid && Number.isFinite(vid.duration) && vid.duration > 0) {
        const targetTime = (pose.rotationDeg / 360) * vid.duration;
        if (!vid.seeking && Math.abs(vid.currentTime - targetTime) > 0.01) {
          vid.currentTime = targetTime;
        }
      }

      // Draw the requested frame, using frame 1 as the initial fallback.
      const fCanvas = frameCanvasRef.current;

      if (AIRA_STORY_CONFIG.assetMode === 'frame-sequence' && fCanvas) {
        const idx = rotationDegToFrameIndex(
          pose.rotationDeg,
          AIRA_STORY_CONFIG.assets.frameCount
        );

        const requestedFrame = framesRef.current[idx];

        const usingFallback =
          !requestedFrame && lastFrameIdxRef.current === -1;

        const frameImg = requestedFrame || (
          usingFallback ? framesRef.current[0] : null
        );

        if (frameImg) {
          const actualFrameIdx = requestedFrame ? idx : 0;

          if (actualFrameIdx !== lastFrameIdxRef.current) {
            const ctx = fCanvas.getContext('2d');

            if (ctx) {
              const dpr = Math.min(window.devicePixelRatio || 1, 2);
              const scale = Math.min(1, dpr * 0.75);

              const targetW = Math.max(
                1,
                Math.round(frameImg.naturalWidth * scale)
              );

              const targetH = Math.max(
                1,
                Math.round(frameImg.naturalHeight * scale)
              );

              if (
                fCanvas.width !== targetW ||
                fCanvas.height !== targetH
              ) {
                fCanvas.width = targetW;
                fCanvas.height = targetH;
              }

              ctx.clearRect(0, 0, fCanvas.width, fCanvas.height);

              ctx.drawImage(
                frameImg,
                0,
                0,
                fCanvas.width,
                fCanvas.height
              );

              lastFrameIdxRef.current = actualFrameIdx;
            }
          }
        }
      }

      // Beat Cards & Headlines
      applyCardEnvelope(introRef.current, pose.intro, false, true);
      applyCardEnvelope(screeningRef.current, pose.screening, !isMobileLayout, false);
      applyCardEnvelope(voiceRef.current, pose.voice, !isMobileLayout, false);
      applyCardEnvelope(reportRef.current, pose.report, !isMobileLayout, false);
      applyCardEnvelope(closingRef.current, pose.closing, !isMobileLayout, false);

      // Edge rail fill + animated card gauges
      if (edgeFillRef.current) {
        edgeFillRef.current.style.transform = `scaleY(${Math.max(0.06, pose.progress).toFixed(4)})`;
      }
      if (matchRingRef.current) {
        const ringFill = Math.max(0.15, pose.screening.visibility);
        const offset = 163.36 * (1 - 0.92 * ringFill);
        matchRingRef.current.style.strokeDashoffset = offset.toFixed(2);
      }
      for (let b = 0; b < scoreBarRefs.current.length; b++) {
        const barEl = scoreBarRefs.current[b];
        if (barEl) {
          barEl.style.transform = `scaleX(${Math.max(0.15, pose.report.visibility).toFixed(3)})`;
        }
      }

      // Layer 1: DPR-capped depth particles & subtle light streaks
      const pCanvas = particleCanvasRef.current;
      if (pCanvas) {
        const ctx = pCanvas.getContext('2d');
        if (ctx) {
          const w = pCanvas.width;
          const h = pCanvas.height;
          ctx.clearRect(0, 0, w, h);

          const scrollShift = pose.progress * 0.65;
          for (let i = 0; i < particles.length; i++) {
            const pt = particles[i];
            const driftX = Math.sin(now * 0.00045 + pt.driftPhase) * 0.014 * pt.depth;
            const rawX = (pt.x + driftX - smoothedPointerX * 0.018 * pt.depth + 1) % 1;
            const rawY = (pt.y - now * pt.speedY * 0.28 - scrollShift * pt.depth + 10) % 1;
            const px = rawX * w;
            const py = rawY * h;

            if (pt.kind === 'streak') {
              const grad = ctx.createLinearGradient(px, py, px + pt.length * pt.depth, py - pt.length * 0.65 * pt.depth);
              grad.addColorStop(0, 'rgba(194, 106, 138, 0)');
              grad.addColorStop(0.5, `rgba(194, 106, 138, ${pt.alpha})`);
              grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
              ctx.strokeStyle = grad;
              ctx.lineWidth = 1.35 * Math.min(window.devicePixelRatio || 1, 2);
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + pt.length * pt.depth, py - pt.length * 0.65 * pt.depth);
              ctx.stroke();
            } else {
              ctx.fillStyle = `rgba(245, 224, 232, ${pt.alpha})`;
              ctx.beginPath();
              ctx.arc(px, py, pt.radius * pt.depth, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      const isSettled =
        Math.abs(targetP - smoothedP) < 0.00025 &&
        Math.abs(targetPointerX - smoothedPointerX) < 0.002 &&
        Math.abs(targetPointerY - smoothedPointerY) < 0.002 &&
        now > idleUntil;

      if (isOnScreen && isPageVisible && !isSettled) {
        rafId = requestAnimationFrame(renderFrame);
      } else {
        rafId = 0;
      }
    };

    const startLoop = () => {
      idleUntil = performance.now() + 450;
      if (!rafId && isOnScreen && isPageVisible) {
        lastTimestamp = performance.now();
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    wakeRenderLoopRef.current = startLoop;

    const onScroll = () => {
      startLoop();
    };

    const onPointerMove = (e: PointerEvent) => {
      targetPointerX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      targetPointerY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      startLoop();
    };

    const onVisibilityChange = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) startLoop();
      else stopLoop();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isOnScreen = Boolean(entry && entry.isIntersecting);
        if (isOnScreen) {
          syncCanvasSize();
          startLoop();
        } else {
          stopLoop();
        }
      },
      { rootMargin: '120px 0px' }
    );

    const onResize = () => {
      syncCanvasSize();
      startLoop();
    };

    syncCanvasSize();
    observer.observe(sectionEl);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    startLoop();

    return () => {
      stopLoop();
      if (wakeRenderLoopRef.current === startLoop) {
        wakeRenderLoopRef.current = null;
      }
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isMobileLayout, reducedMotion]);

  const jumpToBeat = (focusP: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const sectionTop = window.scrollY + el.getBoundingClientRect().top;
    const scrollable = Math.max(1, el.offsetHeight - window.innerHeight);
    window.scrollTo({
      top: Math.round(sectionTop + focusP * scrollable),
      behavior: 'smooth',
    });
  };

  // --- ACCESSIBLE REDUCED-MOTION STATIC VIEW ---
  if (reducedMotion) {
    return (
      <section
        id="aira-showcase"
        aria-label="Meet Aira — Product Walkthrough"
        className="bg-[#10090D] border-t border-white/10 py-20 px-6"
        data-reduced-motion="true"
      >
        <div className="max-w-[1200px] mx-auto space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-center">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#C26A8A]">
                {AIRA_STORY_CONFIG.copy.introEyebrow}
              </p>
              <h2 className={`${styles.displayHeadline} text-4xl sm:text-5xl`}>
                {AIRA_STORY_CONFIG.copy.introHeadline}
              </h2>
              <p className="text-lg text-[#C8B9C0] max-w-xl">
                {AIRA_STORY_CONFIG.copy.introSubline} Automated CV matching, structured Level 1 voice interviews, and verified recruiter scorecards.
              </p>
            </div>

            <div className="relative flex justify-center">
              <div
                aria-hidden="true"
                className="absolute inset-4 rounded-full bg-radial from-[#7B2948]/45 via-[#4B1528]/20 to-transparent blur-2xl"
              />
              {assetError ? (
                <div className={`${styles.glassCard} p-6 text-sm text-[#C8B9C0]`}>{assetError}</div>
              ) : (
                <img
                  src={AIRA_STORY_CONFIG.assets.fallbackImageUrl}
                  alt="Aira, HireFlow AI recruiter wearing round thin-framed glasses, brown blazer, and cream turtleneck holding a tablet"
                  className="relative h-80 w-auto object-contain drop-shadow-2xl"
                  onError={() => setAssetError('Aira visual asset failed to load.')}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ScreeningPreviewCard />
            <VoiceCallPreviewCard />
            <InterviewReportPreviewCard />
          </div>

          <div className={`${styles.glassCard} p-8 flex flex-col sm:flex-row items-center justify-between gap-6`}>
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#C26A8A]">
                {AIRA_STORY_CONFIG.copy.closingEyebrow}
              </p>
              <h3 className={`${styles.displayHeadline} text-2xl sm:text-3xl`}>
                {AIRA_STORY_CONFIG.copy.closingHeadline}
              </h3>
            </div>
            <Link
              to={AIRA_STORY_CONFIG.copy.closingCtaTo}
              className="px-6 py-3 rounded-xl burgundy-cta text-sm font-semibold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              {AIRA_STORY_CONFIG.copy.closingCtaLabel}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      id="aira-showcase"
      aria-label="Meet Aira — Scroll-driven recruitment walkthrough"
      className={styles.storyTrack}
      style={
        {
          '--story-height-desktop': `${AIRA_STORY_CONFIG.desktopScrollVh}vh`,
          '--story-height-mobile': `${AIRA_STORY_CONFIG.mobileScrollVh}vh`,
        } as React.CSSProperties
      }
      data-asset-mode={AIRA_STORY_CONFIG.assetMode}
      data-progress="0.000"
      data-beat="intro"
    >
      <div className={styles.stickyStage}>
        {/* Layer 0: Far Burgundy Radial Glow */}
        <div ref={farGlowRef} className={styles.farGlow} aria-hidden="true" />

        {/* Layer 1: DPR-Capped Ambient Depth Particles & Light Streaks */}
        <canvas
          ref={particleCanvasRef}
          className={styles.particleCanvas}
          aria-label="Ambient burgundy depth particles and light streaks framing Aira"
        />

        {/* Layer 2: Aira Character Stage (Centered, Bottom-Aligned on Floor Shadow) */}
        <div className={styles.characterViewport}>
          <div ref={rimGlowRef} className={styles.rimGlow} aria-hidden="true" />
          <div ref={floorShadowRef} className={styles.floorShadow} aria-hidden="true" />

          <div ref={airaRigRef} className={styles.airaRig}>
            {assetError ? (
              <div className={`${styles.glassCard} p-6 max-w-sm text-center pointer-events-auto`}>
                <p className="text-sm font-semibold text-white">Aira visual unavailable</p>
                <p className="text-xs text-[#C8B9C0] mt-1">{assetError}</p>
              </div>
            ) : AIRA_STORY_CONFIG.assetMode === 'turntable-video' ? (
              <video
                ref={videoRef}
                src={turntableObjectUrl || undefined}
                muted
                playsInline
                preload="auto"
                aria-label="Aira 360-degree turntable view"
                className={styles.airaVideo}
                onError={() => setAssetError('Aira turntable video failed to render.')}
              />
            ) : AIRA_STORY_CONFIG.assetMode === 'frame-sequence' ? (
              <canvas
                ref={frameCanvasRef}
                aria-label="Aira 360-degree interactive turntable canvas"
                className={styles.airaFrameCanvas}
              />
            ) : (
              /*
               * OPTION 3 FALLBACK ACTIVE:
               * Only the single transparent cutout image of Aira is currently supplied.
               * This renders Aira with layered 3D perspective parallax, depth-shifted
               * burgundy rim glow, and floor shadow synchronized to scroll & pointer.
               * Replace AIRA_STORY_CONFIG.assetMode with 'turntable-video' or
               * 'frame-sequence' when true 360-degree turntable assets are provided.
               */
              <img
                src={AIRA_STORY_CONFIG.assets.fallbackImageUrl}
                alt="Aira, AI Recruiter in a brown blazer and cream turtleneck holding a tablet"
                className={styles.airaCutout}
                draggable={false}
                onError={() => setAssetError('Aira cutout image failed to load.')}
              />
            )}
          </div>
        </div>

        <div className={styles.floorFade} aria-hidden="true" />

        {/* Beat 0 (0.00 - 0.10): Intro Headline */}
        <div ref={introRef} className={styles.centerBeatCopy}>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#C26A8A] mb-2">
            Scroll to explore
          </p>
          <h2 className={`${styles.displayHeadline} text-4xl sm:text-5xl lg:text-6xl`}>
            {AIRA_STORY_CONFIG.copy.introHeadline}
          </h2>
          <p className="text-base sm:text-lg text-[#C8B9C0] font-medium mt-2">
            {AIRA_STORY_CONFIG.copy.introSubline}
          </p>
        </div>

        {/* Beat 1 (0.10 - 0.35): CV Match Glass Card (Left on desktop, bottom panel <= 820px) */}
        <div ref={screeningRef} className={styles.desktopCardLeft} style={{ opacity: 0 }}>
          <ScreeningPreviewCard ringRef={matchRingRef} />
        </div>

        {/* Beat 2 (0.35 - 0.60): Voice Call Glass Card (Right on desktop, bottom panel <= 820px) */}
        <div ref={voiceRef} className={styles.desktopCardRight} style={{ opacity: 0 }}>
          <VoiceCallPreviewCard />
        </div>

        {/* Beat 3 (0.60 - 0.85): Interview Report Glass Card (Left on desktop, bottom panel <= 820px) */}
        <div ref={reportRef} className={styles.desktopCardLeft} style={{ opacity: 0 }}>
          <InterviewReportPreviewCard barRefs={scoreBarRefs} />
        </div>

        {/* Beat 4 (0.85 - 1.00): Closing Headline & Start Recruiting CTA */}
        <div ref={closingRef} className={styles.closingBeatCopy} style={{ opacity: 0 }}>
          <div className={`${styles.glassCard} p-6 sm:p-7 space-y-4`}>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#C26A8A]">
              {AIRA_STORY_CONFIG.copy.closingEyebrow}
            </p>
            <h2 className={`${styles.displayHeadline} text-3xl sm:text-4xl`}>
              {AIRA_STORY_CONFIG.copy.closingHeadline}
            </h2>
            <p className="text-sm text-[#C8B9C0] leading-relaxed">
              Launch CV-to-JD screening and structured Level 1 interviews with your team in complete control.
            </p>
            <div>
              <Link
                to={AIRA_STORY_CONFIG.copy.closingCtaTo}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl burgundy-cta text-sm font-semibold text-white whitespace-nowrap"
              >
                {AIRA_STORY_CONFIG.copy.closingCtaLabel}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right-Edge Thin Vertical 4-Beat Progress Indicator */}
        <nav aria-label="Story chapter progress" className={styles.edgeRail}>
          <div className="flex flex-col items-end gap-2">
            {EDGE_BEATS.map((beat, idx) => {
              const isCurrent = activeBeatIdx === idx;
              return (
                <button
                  key={beat.label}
                  type="button"
                  onClick={() => jumpToBeat(beat.focusP)}
                  aria-label={`Jump to chapter ${beat.label}: ${beat.title}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`group flex items-center gap-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    isCurrent ? 'text-white' : 'text-[#C8B9C0]/55 hover:text-[#C8B9C0]'
                  }`}
                >
                  <span className="hidden md:inline tracking-wide">{beat.title}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-transform ${
                      isCurrent ? 'bg-[#39C98A] scale-125' : 'bg-white/30 group-hover:bg-white/60'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <div className={styles.edgeTrack} aria-hidden="true">
            <div ref={edgeFillRef} className={styles.edgeFill} style={{ transform: 'scaleY(0.06)' }} />
          </div>
        </nav>
      </div>
    </section>
  );
}
