const SPECIALISED =
  /image|imagen|tts|audio|live|embed|veo|vision|robotics|lyria|native-audio|computer-use/i;
const UNSTABLE = /preview|experimental|deprecated|exp\b/i;

export function supportsGenerateContent(model: {
  name?: string;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
}): boolean {
  const actions = [
    ...(model.supportedActions ?? []),
    ...(model.supportedGenerationMethods ?? []),
  ];
  if (actions.length === 0) return true;
  return actions.some((a) => a === 'generateContent' || a === 'generateContentStream');
}

function versionScore(name: string): number {
  const nums = [...name.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  let score = 0;
  for (const n of nums) score = score * 1000 + n;
  if (!UNSTABLE.test(name)) score += 1_000_000;
  return score;
}

export function pickDefaultModels(names: string[]): { fast: string; strong: string } {
  const usable = names
    .map((n) => n.replace(/^models\//, ''))
    .filter((n) => n && !SPECIALISED.test(n));

  const flashes = usable.filter((n) => /flash/i.test(n)).sort((a, b) => versionScore(b) - versionScore(a));
  const pros = usable.filter((n) => /pro/i.test(n)).sort((a, b) => versionScore(b) - versionScore(a));

  const stableFlash = flashes.find((n) => !UNSTABLE.test(n)) ?? flashes[0];
  const stablePro = pros.find((n) => !UNSTABLE.test(n)) ?? pros[0];

  return {
    fast: stableFlash ?? usable[0] ?? '',
    strong: stablePro ?? stableFlash ?? usable[0] ?? '',
  };
}
