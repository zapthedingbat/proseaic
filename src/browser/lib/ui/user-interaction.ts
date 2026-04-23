export interface IUserInteraction {
  alert(message: string): Promise<void>;
  confirm(message: string): Promise<boolean>;
  prompt(message: string, defaultValue?: string): Promise<string | null>;
}
