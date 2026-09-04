type WebMCPTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => unknown;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
};

interface Document {
  readonly modelContext?: {
    registerTool: (
      tool: WebMCPTool,
      options?: { signal?: AbortSignal },
    ) => void | Promise<void>;
  };
}
