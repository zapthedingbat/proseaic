import { Model } from "./model.js";

export interface IModelService {
  getModel(modelIdentifier: string): Model;
}
