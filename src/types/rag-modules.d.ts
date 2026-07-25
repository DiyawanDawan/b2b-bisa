declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages?: number;
  }
  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}

/**
 * Minimal chromadb surface used by chroma.service.
 * Avoids pulling broken transitive typings (@hey-api/client-fetch) from the package.
 */
declare module 'chromadb' {
  export class CloudClient {
    constructor(args: { apiKey: string; tenant: string; database: string });
    getOrCreateCollection(args: { name: string }): Promise<unknown>;
  }

  export class ChromaUnauthorizedError extends Error {
    constructor(message?: string);
  }
}
