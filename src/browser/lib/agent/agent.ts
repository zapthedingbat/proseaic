export type Agent = {
  readonly id: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly requiredCapability?: string;
};
