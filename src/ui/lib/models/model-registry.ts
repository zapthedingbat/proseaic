import { IModelService } from "./model-service.js";
import { Model } from "./model.js";

export interface IModelRegistry {
  register(model: Model): void;
  registerMany(models: Model[]): void;
}

export class ModelRegistry implements IModelRegistry, IModelService {
  private _models: Map<string, Model> = new Map();

  register(model: Model): void {
    this._models.set(model.name, model);
  }

  registerMany(models: Model[]): void {
    models.forEach(model => this.register(model));
  }

  getModel(modelIdentifier: string): Model {
    const model = this._models.get(modelIdentifier);
    if (!model) {
      throw new Error(`Model not found: ${modelIdentifier}`);
    }
    return model;
  }
}
