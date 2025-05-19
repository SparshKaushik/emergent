export const VIBE_COLORS = [
  "bg-red-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
];

export function getVibeColor(
  vibeLabel: string,
  allVibeLabels: string[],
  index?: number
): string {
  const labelIndex = index ?? allVibeLabels.indexOf(vibeLabel.toLowerCase());
  return VIBE_COLORS[labelIndex % VIBE_COLORS.length] || "bg-gray-500";
}

export interface VibePercent extends VibeDistribution {
  percentage: number;
}

export interface VibeDistribution {
  label: string;
  count: number;
  color: string;
}

export function calculateVibeDistributions(
  vibeDistributionInput: { [vibeLabel: string]: number } | undefined | null,
  allVibeLabels: string[]
): VibeDistribution[] {
  const createDefaultEntry = (label: string, index: number) => ({
    label,
    count: 0,
    color: getVibeColor(label, allVibeLabels, index),
  });

  if (
    !vibeDistributionInput ||
    Object.keys(vibeDistributionInput).length === 0
  ) {
    return allVibeLabels.map(createDefaultEntry);
  }

  // Process provided vibeDistribution and ensure allVibeLabels are represented
  const processedDistributions = allVibeLabels.map((label, index) => {
    const count =
      vibeDistributionInput[label.toLowerCase()] ||
      vibeDistributionInput[label] ||
      0;
    return {
      label,
      count,
      color: getVibeColor(label, allVibeLabels, index),
    };
  });

  return processedDistributions.sort((a, b) => b.count - a.count);
}

export function calculateVibePercentages(
  vibeDistributionInput: { [vibeLabel: string]: number } | undefined | null,
  totalAnswers: number,
  allVibeLabels: string[]
): VibePercent[] {
  const distributions = calculateVibeDistributions(
    vibeDistributionInput,
    allVibeLabels
  );

  if (totalAnswers === 0) {
    return distributions.map((dist) => ({
      ...dist,
      percentage: 0,
    }));
  }

  return distributions.map((dist) => ({
    ...dist,
    percentage: totalAnswers > 0 ? (dist.count / totalAnswers) * 100 : 0,
  }));
}

export function getDominantVibe(
  vibeDistributionInput: { [vibeLabel: string]: number } | undefined | null,
  allVibeLabels: string[]
): VibeDistribution | null {
  const distributions = calculateVibeDistributions(
    vibeDistributionInput,
    allVibeLabels
  );

  if (distributions.length > 0 && distributions[0].count > 0) {
    return distributions[0];
  }
  return null;
}
