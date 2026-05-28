import React from "react";
import { Text } from "ink";
import { initConfigTemplate, resolveConfig } from "../../config/config.js";
import { formatConfigShow, runConfigDoctor } from "../../config/doctor.js";
import { parseArgs } from "../../cli/args.js";
import { Frame } from "../components/Frame.js";

interface ConfigViewProps {
  initConfig?: boolean;
  show?: boolean;
  doctor?: boolean;
}

export function ConfigView({ initConfig, show, doctor }: ConfigViewProps) {
  try {
    if (initConfig) {
      const result = initConfigTemplate();
      return (
        <Frame title="kintsugi config">
          {result.created ? (
            <>
              <Text>Created config template:</Text>
              <Text>{result.path}</Text>
            </>
          ) : (
            <>
              <Text>Config already exists:</Text>
              <Text>{result.path}</Text>
            </>
          )}
        </Frame>
      );
    }

    const args = parseArgs(process.argv.slice(2));

    if (show) {
      const config = resolveConfig(args);
      const formatted = formatConfigShow(config);
      return (
        <Frame title="kintsugi config show">
          <Text>{formatted}</Text>
        </Frame>
      );
    }

    if (doctor) {
      const config = resolveConfig(args);
      const issues = runConfigDoctor(config);
      return (
        <Frame title="kintsugi config doctor">
          {issues.length === 0 ? (
            <Text color="green">Configuration looks good.</Text>
          ) : (
            issues.map((issue, i) => (
              <Text key={`${i}-${issue.severity}`}>
                <Text color={issueColor(issue.severity)}>{issue.severity.toUpperCase()}</Text>
                {": "}
                {issue.message}
              </Text>
            ))
          )}
        </Frame>
      );
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <Frame title="kintsugi config">
        <Text color="red">Error: {message}</Text>
      </Frame>
    );
  }
}

function issueColor(severity: string): string {
  if (severity === "error") return "red";
  if (severity === "warning") return "yellow";
  return "gray";
}
