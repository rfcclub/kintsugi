export type CancelAction =
  | "deny-permission"
  | "close-overlay"
  | "stop-turn"
  | "clear-draft"
  | "idle";

export interface CancelPriorityState {
  hasPendingPermission: boolean;
  hasOverlay: boolean;
  isStreaming: boolean;
  hasDraft: boolean;
}

export function determineCancelAction(state: CancelPriorityState): CancelAction {
  if (state.hasPendingPermission) {
    return "deny-permission";
  }
  if (state.hasOverlay) {
    return "close-overlay";
  }
  if (state.isStreaming) {
    return "stop-turn";
  }
  if (state.hasDraft) {
    return "clear-draft";
  }
  return "idle";
}
