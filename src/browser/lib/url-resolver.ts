export class UrlResolver {
  private _base: string;
  private _baseURI: string;

  constructor(base: string, baseURI: string) {
    this._base = base;
    this._baseURI = baseURI;
  }

  resolve(url: string): URL {
    const baseUrl = new URL(this._baseURI).origin;
    const resolvedUrl = new URL(`${this._base}${url}`, baseUrl);
    return resolvedUrl;
  }
}