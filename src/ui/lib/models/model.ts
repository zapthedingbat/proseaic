export type Model = {
  name: string;
  platform: string;
  version?: string;
  capabilities?: Array<string>;
  supportsStreamingToolCalls?: boolean;
};
