type PdfJsTextItem = { str?: string };
type PdfJsTextContent = { items: PdfJsTextItem[] };
type PdfJsPage = { getTextContent(): Promise<PdfJsTextContent> };
type PdfJsDocument = { numPages: number; getPage(pageNumber: number): Promise<PdfJsPage> };
type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js';
const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';

let pdfJsPromise: Promise<PdfJsLib> | null = null;

export async function ensurePdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
    return window.pdfjsLib;
  }

  if (!pdfJsPromise) {
    pdfJsPromise = new Promise<PdfJsLib>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_JS_URL;
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error('pdf.js did not initialize'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('Unable to load pdf.js'));
      document.head.appendChild(script);
    });
  }

  return pdfJsPromise;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await ensurePdfJs();
  const documentRef = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = await Promise.all(
    Array.from({ length: documentRef.numPages }, async (_, index) => {
      const page = await documentRef.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => item.str ?? '').join(' ');
    }),
  );

  return pages.join('\n\n');
}
