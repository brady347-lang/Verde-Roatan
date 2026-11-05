// Reads the text layer of a PDF in the browser, page by page. No AI is involved, so this keeps
// working when AI services are unavailable. Scanned PDFs without a text layer return empty pages.

export interface PdfProgress { page: number; total: number }

export async function extractPdfPages(
  data: ArrayBuffer,
  onBatch: (pages: Array<{ page: number; text: string }>, done: boolean, total: number) => Promise<void>,
  onProgress?: (p: PdfProgress) => void,
  batchSize = 10
): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const total = doc.numPages;
  let batch: Array<{ page: number; text: string }> = [];
  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str !== 'string') continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
    batch.push({ page: n, text });
    page.cleanup();
    onProgress?.({ page: n, total });
    if (batch.length >= batchSize || n === total) {
      await onBatch(batch, n === total, total);
      batch = [];
    }
  }
  await doc.destroy();
  return total;
}
