import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRA_STORY_CONFIG,
  computeAiraRotationDeg,
  computeAiraStagePose,
  computeCameraScale,
  rotationDegToFrameIndex,
  stepSmoothedProgress,
} from './airaStoryTimeline';

test('rotation starts at 0 deg and returns seamlessly to 360 deg (matching seam)', () => {
  assert.equal(computeAiraRotationDeg(0), 0);
  assert.equal(computeAiraRotationDeg(0.1), 0);
  assert.equal(Math.round(computeAiraRotationDeg(0.35)), 120);
  assert.equal(Math.round(computeAiraRotationDeg(0.6)), 240);
  assert.equal(Math.round(computeAiraRotationDeg(0.85)), 330);
  assert.equal(Math.round(computeAiraRotationDeg(1)), 360);

  // Seam check: 0 deg and 360 deg resolve to the exact same frame index
  assert.equal(rotationDegToFrameIndex(0, 72), 0);
  assert.equal(rotationDegToFrameIndex(360, 72), 0);
});

test('camera zooms slightly in during middle beat and resets cleanly at 1.0', () => {
  const startScale = computeCameraScale(0);
  const midScale = computeCameraScale(0.6);
  const endScale = computeCameraScale(1);

  assert.equal(startScale, 1);
  assert.ok(midScale > 1.08, `Expected mid-section zoom-in > 1.08, got ${midScale}`);
  assert.equal(endScale, 1);
});

test('beat envelopes activate cleanly in sequence without overlaps hiding active beat', () => {
  const pIntro = computeAiraStagePose(0.0);
  assert.equal(pIntro.activeBeat, 'intro');
  assert.equal(pIntro.intro.opacity, 1);
  assert.equal(pIntro.edgeBeatIndex, 0);

  const pScreening = computeAiraStagePose(AIRA_STORY_CONFIG.beats.screening.focusP);
  assert.equal(pScreening.activeBeat, 'screening');
  assert.equal(pScreening.screening.opacity, 1);
  assert.equal(pScreening.screening.blurPx, 0);
  assert.equal(pScreening.edgeBeatIndex, 1);

  const pVoice = computeAiraStagePose(AIRA_STORY_CONFIG.beats.voice.focusP);
  assert.equal(pVoice.activeBeat, 'voice');
  assert.equal(pVoice.voice.opacity, 1);
  assert.equal(pVoice.edgeBeatIndex, 2);

  const pReport = computeAiraStagePose(AIRA_STORY_CONFIG.beats.report.focusP);
  assert.equal(pReport.activeBeat, 'report');
  assert.equal(pReport.report.opacity, 1);
  assert.equal(pReport.edgeBeatIndex, 3);

  const pClosing = computeAiraStagePose(1.0);
  assert.equal(pClosing.activeBeat, 'closing');
  assert.equal(pClosing.closing.opacity, 1);
  assert.equal(pClosing.parallaxRotateYDeg, 0);
  assert.equal(pClosing.parallaxShiftX, 0);
});

test('stepSmoothedProgress eases toward target without overshooting bounds', () => {
  const next = stepSmoothedProgress(0, 1, 0.15);
  assert.ok(Math.abs(next - 0.15) < 1e-9);
  assert.equal(stepSmoothedProgress(0.9999, 1, 0.15), 1);
  assert.equal(stepSmoothedProgress(-0.5, -0.2, 0.15), 0);
});
