export const BALANCE = {
  startingEnergy: 165,
  reactorIntegrity: 20,

  // Wave resolution rewards: Wave Completion Energy = 40 + 8 x Wave Number
  waveBonusBase: 40,
  waveBonusPerWave: 8,
  waveScoreBonus: 100,
  waveScorePerWave: 25,
  perfectEnergyBonus: 15,
  perfectScoreBonus: 150,
  actBonusEnergy: { 1: 60, 2: 80, 3: 100 } as Record<number, number>,

  comboWindow: 2.5,
  comboMax: 5,
  sellRefund: 0.7,
  upgradeCost2: 0.8,
  upgradeCost3: 1.3,

  // Onboarding
  tutorialCountdown: 5,        // seconds between first tower placement and wave 1
  firstTowerHint: { q: -1, r: -1 },

  // Disruptor
  disruptRadius: 2.2,          // hexes
  disruptDuration: 3.0,        // seconds towers stay disrupted
  disruptFirePenalty: 1.5,     // interval multiplier while disrupted
  disruptPeriod: 4.5,          // seconds between pulses
  disruptTelegraph: 1.2,       // warning ring window before a pulse

  // Amplifier
  ampBoost: 0.20,              // fire-rate bonus fraction

  // Commander abilities
  abilityCosts: { emp: 60, orbital: 90, overdrive: 80 },
  abilityCooldowns: { emp: 18, orbital: 22, overdrive: 25 },
  overdriveDur: 6,
  overdriveBoost: 0.35,
  empDur: 2.5,
  empRadius: 2.2,
  orbitalRadius: 1.6,
  orbitalDamage: 140,

  // Difficulty multipliers
  difficulty: {
    ROOKIE:    { hp: 0.80, speed: 0.92, reward: 1.10 },
    COMMANDER: { hp: 1.00, speed: 1.00, reward: 1.00 },
    NIGHTMARE: { hp: 1.30, speed: 1.08, reward: 1.00 },
  } as Record<string, { hp: number; speed: number; reward: number }>,

  particleBudgetDesktop: 1200,
  particleBudgetMobile: 600,

  // Campaign act scaling — late waves demand upgraded defenses (kept modest per spec:
  // new patterns carry the difficulty, this only paces the economy)
  actHpScale: { 1: 1.0, 2: 1.12, 3: 1.28, 4: 1.36 } as Record<number, number>,

  // Boss tuning
  colossusShieldFraction: 0.30,     // of max HP, applied at phase 2
  colossusPhase2: 0.65,
  colossusPhase3: 0.30,
  colossusPhase3Speed: 1.45,
  archonPhase2: 0.70,
  archonPhase3: 0.35,
  archonPhase3Speed: 1.55,
  archonStopDuration: 4.0,
  archonShieldFraction: 0.20,
};
