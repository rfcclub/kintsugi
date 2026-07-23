/**
 * Interaction modes control how tool permission prompts behave.
 *
 * - auto:     all tools run without asking (resolve "allow" immediately)
 * - approve:  every tool call requires explicit user approval
 * - plan:     first tool call in a turn shows a plan; user approves once,
 *             then the rest of the turn runs as "allow"
 */

export type InteractionMode = "auto" | "approve" | "plan";

export const INTERACTION_MODES: readonly InteractionMode[] = ["auto", "approve", "plan"];

export function isInteractionMode(value: string): value is InteractionMode {
  return (INTERACTION_MODES as readonly string[]).includes(value);
}

export interface ModeDescription {
  name: InteractionMode;
  label: string;
  summary: string;
}

export const MODE_DESCRIPTIONS: ModeDescription[] = [
  {
    name: "auto",
    label: "Auto",
    summary: "All tools run without asking. Fast but no guardrails.",
  },
  {
    name: "approve",
    label: "Approve",
    summary: "Every tool call requires your approval. Safest, most verbose.",
  },
  {
    name: "plan",
    label: "Plan",
    summary: "Agent shows its plan on first tool call; approve once per turn.",
  },
];

export function formatMode(mode: InteractionMode): string {
  const desc = MODE_DESCRIPTIONS.find((d) => d.name === mode);
  return desc ? `[${desc.label}] ${desc.summary}` : mode;
}

export function formatModeList(): string {
  return MODE_DESCRIPTIONS
    .map((d) => `  ${d.name.padEnd(10)} ${d.summary}`)
    .join("\n");
}
