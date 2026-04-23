export class UrlResolver {
  private _base: string;
  private _node: Node;

  constructor(base: string, component: Node) {
    this._base = base;
    this._node = component;
  }

  resolve(url: string): URL {
    const baseUrl = new URL(this._node.baseURI).origin;
    const resolvedUrl = new URL(`${this._base}${url}`, baseUrl);
    return resolvedUrl;
  }
}