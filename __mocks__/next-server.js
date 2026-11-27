/**
 * Minimal stub for next/server used in Jest (Node environment).
 * Only the parts used by app/api/indexer/[...path]/route.ts are stubbed.
 */

class NextRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.method = init.method || 'GET';
    this.headers = new Map(Object.entries(init.headers || {}));
    this.ip = init.ip || '127.0.0.1';
  }
}

class NextResponse {
  constructor(body, init = {}) {
    this._body = body;
    this.status = init.status || 200;
    this.headers = new Map(Object.entries(init.headers || {}));
  }

  async json() {
    if (typeof this._body === 'string') return JSON.parse(this._body);
    return this._body;
  }

  async text() {
    return typeof this._body === 'string'
      ? this._body
      : JSON.stringify(this._body);
  }

  static json(data, init = {}) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }
}

module.exports = { NextRequest, NextResponse };
