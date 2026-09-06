import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminImportProducts, type ProductCsvReport } from '@workspace/api-client-react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const MAX_BYTES = 1024 * 1024;
const TEMPLATE = 'sku,name,brand,price,stock,quality,description\nEXAMPLE-LCD-01,iPhone 15 replacement OLED display,Apple,79.95,10,Aftermarket,"Replacement display, black"\nEXAMPLE-BAT-01,Galaxy S24 replacement battery,Samsung,19.50,20,Original,Replacement battery\n';

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Keep product text as text when a report is opened in spreadsheet software.
function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadReport(report: ProductCsvReport) {
  const rows = report.rows.map((row) => [
    row.row, row.sku, row.name, row.status, row.category ?? '', row.message, row.productId ?? '',
  ].map(csvCell).join(','));
  downloadCsv('product-import-report.csv', ['row,sku,name,status,category,message,productId', ...rows].join('\r\n'));
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return 'The import could not be confirmed. Check the product list before retrying. Retrying the same file will report existing SKUs without overwriting them.';
}

export function ProductCsvImport() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [report, setReport] = useState<ProductCsvReport | null>(null);
  const readVersion = useRef(0);
  const queryClient = useQueryClient();
  const mutation = useAdminImportProducts({ mutation: { retry: false } });
  const busy = reading || mutation.isPending;

  useEffect(() => {
    if (!mutation.isPending) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [mutation.isPending]);

  async function selectFile(file?: File) {
    const version = ++readVersion.current;
    setCsv('');
    setFilename(file?.name ?? '');
    setError('');
    setReport(null);
    mutation.reset();
    setReading(false);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('This file is larger than 1 MiB. Split it into files of at most 1,000 products and 1 MiB each.');
      return;
    }
    setReading(true);
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (version !== readVersion.current) return;
      if (!content.trim()) throw new Error('This CSV is empty.');
      setCsv(content);
    } catch (err) {
      if (version === readVersion.current) {
        setError(err instanceof TypeError ? 'Save the file as CSV UTF-8 and try again.' : 'This file is empty or could not be read.');
      }
    } finally {
      if (version === readVersion.current) setReading(false);
    }
  }

  async function importProducts() {
    if (!csv || busy || report) return;
    setError('');
    try {
      const result = await mutation.mutateAsync({ data: { csv } });
      setReport(result);
      // Imports affect catalog lists, category counts, brands, and dashboard totals.
      void queryClient.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err));
      // A disconnected response can arrive after commit; never leave stale lists.
      void queryClient.invalidateQueries();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!mutation.isPending) setOpen(value); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-import-csv">
          <Upload className="h-4 w-4" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className={`max-w-4xl max-h-[90vh] overflow-y-auto ${mutation.isPending ? '[&>button]:hidden' : ''}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Import products from CSV</DialogTitle>
          <DialogDescription>
            Add new products and let AI assign their categories. Existing products are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
          <p><strong>Required columns:</strong> <code>sku, name, brand, price, stock</code></p>
          <p className="text-muted-foreground">
            Optional: quality, description, imageUrl, featured, model. Quality defaults to Standard.
            New brand names are added automatically; models must already exist for that brand.
            Categories are always assigned automatically.
          </p>
          <p className="text-muted-foreground">
            UTF-8 CSV, comma or semicolon separated. Use decimal prices, not cents; quote decimal commas in comma-separated files.
            Up to 1,000 products / 1 MiB per file.
          </p>
          <Button variant="link" className="h-auto p-0 gap-2" onClick={() => downloadCsv('product-import-template.csv', TEMPLATE)}>
            <Download className="h-4 w-4" /> Download example CSV
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product-csv-file">{report ? 'Choose another CSV to start a new import' : 'Choose a CSV file'}</Label>
          <Input id="product-csv-file" data-testid="input-product-csv" type="file" accept=".csv,text/csv"
            disabled={mutation.isPending} onChange={(event) => void selectFile(event.target.files?.[0])} />
          {filename && <p className="text-xs text-muted-foreground break-all">{filename}</p>}
        </div>

        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
        </div>}

        {mutation.isPending && <div role="status" className="flex items-center gap-3 rounded-lg border p-4 text-sm">
          <Loader2 className="h-5 w-5 animate-spin shrink-0" />
          <div><p className="font-medium">Validating and classifying products…</p>
            <p className="text-muted-foreground">Categories are assigned in batches of 40. Large files may take several minutes. Keep this window open.</p>
          </div>
        </div>}

        {report && <section className="space-y-3" aria-label="Import report" data-testid="csv-import-report">
          <div role="status" className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Import finished — {report.totalRows} rows checked
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg border bg-green-50 p-3 text-green-800"><strong className="block text-xl">{report.imported}</strong>Imported</div>
            <div className="rounded-lg border bg-amber-50 p-3 text-amber-800"><strong className="block text-xl">{report.duplicates}</strong>Duplicate SKUs</div>
            <div className="rounded-lg border bg-muted p-3"><strong className="block text-xl">{report.invalid}</strong>Invalid rows</div>
          </div>
          {(report.duplicates > 0 || report.invalid > 0) && <p className="text-sm text-muted-foreground">
            Duplicate and invalid rows were not imported. The first occurrence of a SKU in the CSV is considered; later occurrences are reported as duplicates.
            Correct rejected rows and upload them again.
          </p>}
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-background"><TableRow>
                <TableHead>Row</TableHead><TableHead>SKU / product</TableHead><TableHead>Result</TableHead><TableHead>Details</TableHead>
              </TableRow></TableHeader>
              <TableBody>{report.rows.map((row) => <TableRow key={row.row}>
                <TableCell>{row.row}</TableCell>
                <TableCell className="min-w-40 max-w-64 whitespace-normal break-words"><span className="font-medium">{row.sku || '—'}</span><div className="text-xs text-muted-foreground">{row.name}</div></TableCell>
                <TableCell><Badge variant={row.status === 'imported' ? 'default' : 'secondary'}>{row.status === 'imported' ? 'Imported' : row.status === 'duplicate' ? 'Duplicate' : 'Invalid'}</Badge></TableCell>
                <TableCell className="min-w-48 whitespace-normal text-xs">{row.category && <div className="font-medium mb-1">{row.category}</div>}{row.message}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </section>}

        <DialogFooter className="gap-2">
          {report && <Button variant="outline" onClick={() => downloadReport(report)} className="gap-2" data-testid="button-download-import-report"><Download className="h-4 w-4" /> Download report</Button>}
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>{report ? 'Close' : 'Cancel'}</Button>
          {!report && <Button onClick={() => void importProducts()} disabled={!csv || busy} className="gap-2" data-testid="button-submit-csv-import">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {mutation.isPending ? 'Importing…' : reading ? 'Reading file…' : 'Import & classify'}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}