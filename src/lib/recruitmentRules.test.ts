import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionStatus,
  normalizeSkill,
  scoreCandidateAgainstJob,
  validateOrchestratorDecision,
  isWithinCallingWindow,
} from './recruitmentRules';

test('skill normalization handles synonyms accurately', () => {
  assert.equal(normalizeSkill('JS'), 'javascript');
  assert.equal(normalizeSkill('ReactJS'), 'react');
  assert.equal(normalizeSkill('py'), 'python');
  assert.equal(normalizeSkill('Postgres'), 'postgresql');
  assert.equal(normalizeSkill('K8s'), 'kubernetes');
});

test('scoring matches synonyms and shortlists at >= 70% threshold', () => {
  const result = scoreCandidateAgainstJob(
    {
      skills: ['JS', 'ReactJS', 'Node.js', 'Postgres'],
      experienceYears: 4,
      qualification: 'B.Tech Computer Science',
    },
    {
      id: 'job-1',
      title: 'Full-Stack Developer',
      requiredSkills: ['JavaScript', 'React', 'NodeJS', 'PostgreSQL'],
      minExperienceYears: 3,
      qualification: 'B.Tech',
    },
    70
  );

  assert.equal(result.skillsMatch, 100);
  assert.equal(result.experienceMatch, 100);
  assert.equal(result.qualificationMatch, 100);
  assert.equal(result.overallScore, 100);
  assert.equal(result.shortlisted, true);
  assert.equal(result.recommendedStatus, 'Shortlisted');
});

test('scoring renormalizes weights when optional or unknown fields are absent without penalizing candidate', () => {
  const result = scoreCandidateAgainstJob(
    {
      skills: ['Python', 'FastAPI'],
      experienceYears: null,
      qualification: null,
    },
    {
      id: 'job-2',
      title: 'Python Developer',
      requiredSkills: ['Python', 'FastAPI'],
      minExperienceYears: 3,
      qualification: 'Bachelor',
      preferredSkills: [],
      certifications: [],
    },
    70
  );

  // Unknown experience & qualification must be excluded & renormalized, not scored as 0
  assert.equal(result.experienceMatch, null);
  assert.equal(result.qualificationMatch, null);
  assert.equal(result.overallScore, 100);
  assert.equal(result.weightsUsed.requiredSkills, 100);
});

test('candidates below threshold become Needs Review, never Rejected', () => {
  const result = scoreCandidateAgainstJob(
    {
      skills: ['HTML'],
      experienceYears: 1,
      qualification: 'B.Sc',
    },
    {
      id: 'job-3',
      title: 'Senior Python Architect',
      requiredSkills: ['Python', 'Django', 'Kubernetes', 'AWS'],
      minExperienceYears: 5,
      qualification: 'B.Tech',
    },
    70
  );

  assert.equal(result.shortlisted, false);
  assert.equal(result.recommendedStatus, 'Needs Review');
});

test('status transition graph enforces valid pipeline transitions', () => {
  assert.equal(canTransitionStatus('Applied', 'CV Screening'), true);
  assert.equal(canTransitionStatus('Shortlisted', 'Level 1 Pending'), true);
  assert.equal(canTransitionStatus('Applied', 'Selected'), false);
  assert.equal(canTransitionStatus('Needs Review', 'Level 2 Scheduled'), false);
});

test('orchestrator caps follow-ups at 2 and enforces hard time limit', () => {
  const capped = validateOrchestratorDecision(
    { action: 'follow_up', text: 'One more detail?', reason: 'Probing' },
    'technical',
    2,
    300,
    900
  );
  assert.equal(capped.action, 'advance');
  assert.equal(capped.nextStage, 'scenario');

  const ended = validateOrchestratorDecision(
    { action: 'ask', text: 'Another question?', reason: 'Continue' },
    'technical',
    0,
    905,
    900
  );
  assert.equal(ended.action, 'end');
  assert.equal(ended.nextStage, 'closing');
});

test('calling window check respects 09:00 to 21:00 local window', () => {
  // 14:00 IST = 08:30 UTC
  const daytimeIst = new Date('2026-11-17T08:30:00Z');
  // 23:00 IST = 17:30 UTC
  const lateNightIst = new Date('2026-11-17T17:30:00Z');
  assert.equal(isWithinCallingWindow(daytimeIst, 9, 21, 'Asia/Kolkata'), true);
  assert.equal(isWithinCallingWindow(lateNightIst, 9, 21, 'Asia/Kolkata'), false);
});
