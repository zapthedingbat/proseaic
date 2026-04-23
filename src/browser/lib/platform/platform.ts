import { IPlatformService } from "./platform-service.js";

export interface IPlatform extends IPlatformService {
  get name(): string;
}
