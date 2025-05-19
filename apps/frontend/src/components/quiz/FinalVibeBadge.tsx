import React from "react";
import { Badge } from "@/components/ui/badge";
import type { VibeDistribution } from "@/lib/VibeDisplayUtils";

interface FinalVibeBadgeProps {
  dominantVibe: VibeDistribution | null;
}

export function FinalVibeBadge({ dominantVibe }: FinalVibeBadgeProps) {
  if (!dominantVibe || dominantVibe.count === 0) {
    return null; // Or some placeholder like <Badge variant="outline">No dominant vibe</Badge>
  }

  // Basic styling for the badge, colors are applied via VibeDistribution.color which are Tailwind bg classes
  return (
    <Badge
      className={`${dominantVibe.color} text-white ml-2`}
      // style={{ backgroundColor: dominantVibe.color }} // Use this if color is a hex code
    >
      {dominantVibe.label.charAt(0).toUpperCase() + dominantVibe.label.slice(1)}
    </Badge>
  );
}
