declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages?: number;
  }
  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'chromadb' {
  export class CloudClient {
    constructor(args: { apiKey: string; tenant: string; database: string });
    getOrCreateCollection(args: { name: string }): Promise<unknown>;
  }
}
