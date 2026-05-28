import React from "react";
import { Text } from "ink";
import { Frame } from "../components/Frame.js";
import { exportSessionMarkdown } from "../../store/export.js";
import { SessionIndex } from "../../store/index.js";

interface ThreadsViewProps {
  exportId?: string;
}

export function ThreadsView({ exportId }: ThreadsViewProps) {
  if (exportId) {
    try {
      const exported = exportSessionMarkdown(exportId);
      return (
        <Frame title="kintsugi export">
          <Text>{exported.markdown}</Text>
        </Frame>
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return (
        <Frame title="kintsugi export">
          <Text color="red">{message}</Text>
        </Frame>
      );
    }
  }

  const sessions = new SessionIndex().list();
  return (
    <Frame title="kintsugi threads">
      {sessions.length === 0 ? (
        <Text>No sessions found.</Text>
      ) : (
        sessions.slice(0, 20).map((session) => (
          <Text key={session.id}>
            {session.id}  {session.startedAt}  {session.messageCount} messages  {formatProvider(session)}
          </Text>
        ))
      )}
    </Frame>
  );
}

function formatProvider(session: { provider?: string; model?: string }): string {
  if (!session.provider) {
    return "unknown";
  }
  return session.model ? `${session.provider}/${session.model}` : session.provider;
}
