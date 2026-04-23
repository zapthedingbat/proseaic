
export type ToolSchema = {
  type: "function";
  icon?: string; // Optional icon for UI representation
  instructions?: string; // Contributes to the system prompt; stripped before sending to the API
  requiredCapability?: string; // Excluded when the model lacks this capability
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};
