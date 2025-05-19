import type { VibePercent } from "@/lib/VibeDisplayUtils";

interface VibeBreakdownBarProps {
  vibePercentages: VibePercent[];
  totalAnswers: number;
}

export function VibeBreakdownBar({
  vibePercentages,
  totalAnswers,
}: VibeBreakdownBarProps) {
  if (totalAnswers === 0 || vibePercentages.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No answers submitted yet for this user.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="w-full h-6 flex rounded overflow-hidden bg-muted">
        {vibePercentages.map((vibe) => {
          if (vibe.percentage === 0) return null;
          return (
            <div
              key={vibe.label}
              className={`h-full ${vibe.color} transition-all duration-300 ease-in-out`}
              style={{ width: `${vibe.percentage}%` }}
              title={`${vibe.label}: ${vibe.count} (${vibe.percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {vibePercentages.map((vibe) => (
          <div key={vibe.label} className="flex items-center">
            <span className={`w-3 h-3 rounded-sm mr-1.5 ${vibe.color}`}></span>
            <span>
              {vibe.label.charAt(0).toUpperCase() + vibe.label.slice(1)}:{" "}
              {vibe.percentage.toFixed(1)}% ({vibe.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
