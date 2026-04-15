
export type ToolSchema = {
  type: "function";
  icon?: string; // Optional icon for UI representation
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
