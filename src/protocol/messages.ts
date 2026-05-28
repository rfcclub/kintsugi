export interface RuntimeMessage {
  role: "user" | "assistant" | "runtime" | "tool";
  text: string;
  at: string;
}
