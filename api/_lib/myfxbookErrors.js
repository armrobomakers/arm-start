export class MyfxbookHttpError extends Error {
  constructor(message, { status, url, responseText } = {}) {
    super(message);
    this.name = "MyfxbookHttpError";
    this.status = status ?? null;
    this.url = url ?? null;
    this.responseText = responseText ?? null;
  }
}

export class MyfxbookApiError extends Error {
  constructor(message, { endpoint, payload } = {}) {
    super(message);
    this.name = "MyfxbookApiError";
    this.endpoint = endpoint ?? null;
    this.payload = payload ?? null;
  }
}

export class MyfxbookInvalidSessionError extends MyfxbookApiError {
  constructor(message, meta = {}) {
    super(message, meta);
    this.name = "MyfxbookInvalidSessionError";
  }
}

export class MyfxbookAccountNotFoundError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "MyfxbookAccountNotFoundError";
    this.meta = meta;
  }
}

export class MyfxbookInvalidPayloadError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "MyfxbookInvalidPayloadError";
    this.meta = meta;
  }
}

export class MyfxbookStaleDataError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "MyfxbookStaleDataError";
    this.meta = meta;
  }
}
