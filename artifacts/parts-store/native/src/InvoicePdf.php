<?php
declare(strict_types=1);

use Dompdf\Dompdf;
use Dompdf\Options;

require_once __DIR__ . '/../vendor/autoload.php';

function invoiceHtmlEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function invoiceDataUri(string $path, string $mime): string
{
    $bytes = @file_get_contents($path);
    if (!is_string($bytes) || $bytes === '') {
        throw new RuntimeException('A required invoice asset is unavailable.');
    }
    return 'data:' . $mime . ';base64,' . base64_encode($bytes);
}

/**
 * @param array{
 *  invoice_number:string,order_number:string,invoice_date:string,due_date:string,currency:string,
 *  buyer:list<string>,buyer_email:string,buyer_registration_label:string,buyer_registration_number:string,
 *  items:list<array{sku:string,name:string,quantity:int,unit:string,tax:string,total:string}>,
 *  subtotal:string,shipping:string,tax_label:string,tax:string,total:string,payment_method:string,
 *  payment_terms:string,customer_note:string,test_mode:bool
 * } $invoice
 * @param array{svg:string,account:string,creditor:list<string>,debtor:list<string>,currency:string,amount:string,reference:string,information:string}|null $qr
 */
function renderProfessionalInvoicePdf(array $invoice, ?array $qr): string
{
    $assetRoot = dirname(__DIR__) . '/public/assets';
    $logo = invoiceDataUri($assetRoot . '/invoice-logo.png', 'image/png');
    $font = 'file://' . str_replace('\\', '/', $assetRoot . '/invoice-open-sans.ttf');
    $fontBold = 'file://' . str_replace('\\', '/', $assetRoot . '/invoice-open-sans-bold.ttf');
    $e = static fn(string $value): string => invoiceHtmlEscape($value);
    $buyerLines = array_map($e, $invoice['buyer']);
    $buyer = $buyerLines === []
        ? ''
        : '<strong>' . array_shift($buyerLines) . '</strong>'
            . ($buyerLines === [] ? '' : '<br>' . implode('<br>', $buyerLines));
    $buyerDetails = '';
    if (trim($invoice['buyer_email']) !== '') {
        $buyerDetails .= '<div><span>Email</span>' . $e($invoice['buyer_email']) . '</div>';
    }
    if (trim($invoice['buyer_registration_label']) !== '' && trim($invoice['buyer_registration_number']) !== '') {
        $buyerDetails .= '<div><span>' . $e($invoice['buyer_registration_label']) . '</span>'
            . $e($invoice['buyer_registration_number']) . '</div>';
    }
    if ($buyerDetails !== '') {
        $buyerDetails = '<div class="buyer-details">' . $buyerDetails . '</div>';
    }
    $rows = '';
    foreach ($invoice['items'] as $item) {
        $rows .= '<tr>'
            . '<td class="sku">' . $e($item['sku']) . '</td>'
            . '<td class="product">' . $e($item['name']) . '</td>'
            . '<td class="number">' . (int) $item['quantity'] . '</td>'
            . '<td class="money">' . $e($item['unit']) . '</td>'
            . '<td class="number">' . $e($item['tax']) . '</td>'
            . '<td class="money strong">' . $e($item['total']) . '</td>'
            . '</tr>';
    }
    $note = trim($invoice['customer_note']);
    $noteRow = $note === '' ? '' : '<div class="info-row"><span>Customer note</span><strong>' . nl2br($e($note)) . '</strong></div>';
    // The buyer decides what their purchase reference is called on the invoice.
    $reference = trim((string) ($invoice['customer_reference'] ?? ''));
    $referenceLabel = trim((string) ($invoice['reference_label'] ?? ''));
    $referenceRow = $reference === ''
        ? ''
        : '<div class="info-row"><span>' . $e($referenceLabel === '' ? 'Your reference' : $referenceLabel)
            . '</span><strong>' . $e($reference) . '</strong></div>';
    $watermark = $invoice['test_mode'] ? '<div class="watermark">TEST</div>' : '';
    $testFooter = $invoice['test_mode'] ? ' · <span class="test-note">TEST DOCUMENT</span>' : '';
    $qrPage = '';
    if ($qr !== null) {
        $creditor = implode('<br>', array_map($e, $qr['creditor']));
        $debtor = implode('<br>', array_map($e, $qr['debtor']));
        $reference = trim($qr['reference']) === '' ? '' : '<div class="qr-label">Reference</div><div>' . $e($qr['reference']) . '</div>';
        $qrImage = 'data:image/svg+xml;base64,' . base64_encode($qr['svg']);
        $qrPage = <<<HTML
        <section class="qr-page">
          {$watermark}
          <div class="separate">Separate before paying in</div>
          <div class="qr-part">
            <div class="receipt">
              <h2>Receipt</h2>
              <div class="qr-label">Account / Payable to</div>
              <div>{$e($qr['account'])}<br>{$creditor}</div>
              <div class="qr-spacer"></div>
              <div class="qr-label">Payable by</div>
              <div>{$debtor}</div>
              <div class="amount-grid">
                <div><span>Currency</span><strong>{$e($qr['currency'])}</strong></div>
                <div><span>Amount</span><strong>{$e($qr['amount'])}</strong></div>
              </div>
              <div class="acceptance">Acceptance point</div>
            </div>
            <div class="payment">
              <h2>Payment part</h2>
              <div class="qr-code-wrap">
                <img class="qr-code" src="{$qrImage}" alt="">
              </div>
              <div class="payment-details">
                <div class="qr-label">Account / Payable to</div>
                <div>{$e($qr['account'])}<br>{$creditor}</div>
                <div class="qr-gap"></div>
                {$reference}
                <div class="qr-label">Additional information</div>
                <div>{$e($qr['information'])}</div>
                <div class="qr-gap"></div>
                <div class="qr-label">Payable by</div>
                <div>{$debtor}</div>
              </div>
              <div class="payment-amount amount-grid">
                <div><span>Currency</span><strong>{$e($qr['currency'])}</strong></div>
                <div><span>Amount</span><strong>{$e($qr['amount'])}</strong></div>
              </div>
            </div>
          </div>
        </section>
        HTML;
    }

    $html = <<<HTML
    <!doctype html><html><head><meta charset="UTF-8"><style>
    @font-face{font-family:OpenSans;src:url('{$font}') format('truetype');font-weight:400}
    @font-face{font-family:OpenSans;src:url('{$fontBold}') format('truetype');font-weight:700}
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:OpenSans,DejaVu Sans,sans-serif;color:#172033;font-size:9pt;line-height:1.45}
    .invoice-page{height:274mm;padding:12mm 15mm 11mm;position:relative}.watermark{position:absolute;top:127mm;left:58mm;transform:rotate(-42deg);font-size:60pt;color:#eef1f5;z-index:-1}
    .header{display:table;width:100%;table-layout:fixed}.brand,.seller{display:table-cell;vertical-align:top}.brand{width:61%}.brand img{width:60mm;height:auto;margin-top:1mm}.seller{width:39%;padding-left:13mm;font-size:7.2pt;line-height:1.35}.seller strong{font-size:8pt}
    .title{margin:9mm 0 5mm;border-bottom:1px solid #dce3ec;padding-bottom:2.5mm}.title h1{margin:0;color:#176fba;font-size:21pt;letter-spacing:.3pt}.title .doc-id{margin-top:1mm;color:#687386;font-size:7pt}
    .parties{display:table;width:100%;table-layout:fixed;margin-bottom:5mm}.bill,.meta{display:table-cell;vertical-align:top;width:50%}.bill{padding-right:10mm}.eyebrow{font-size:6.5pt;font-weight:700;color:#687386;text-transform:uppercase;letter-spacing:.6pt;margin-bottom:1.6mm}.buyer{font-size:8.2pt;line-height:1.35}.buyer strong{font-size:9pt}.buyer-details{margin-top:2.2mm;padding-top:1.8mm;border-top:1px solid #e2e7ee;font-size:6.7pt;color:#334055}.buyer-details div{margin:.5mm 0}.buyer-details span{display:inline-block;width:29mm;color:#7a8494}
    .meta table{width:100%;border-collapse:collapse}.meta td{padding:.75mm 0;vertical-align:top}.meta td:first-child{width:43%;color:#687386;font-size:6.9pt}.meta td:last-child{font-weight:700;font-size:7.5pt}
    .items{width:100%;border-collapse:collapse;table-layout:fixed}.items thead{display:table-header-group}.items th{background:#111a2a;color:white;text-align:left;padding:2.2mm 2mm;font-size:6.4pt;text-transform:uppercase;letter-spacing:.45pt}.items td{padding:2.35mm 2mm;border-bottom:1px solid #dfe5ec;vertical-align:top;font-size:7.2pt;line-height:1.3}.items .sku{width:14%;font-weight:700}.items .product{width:40%}.items .number{width:9%;text-align:right}.items .money{width:14%;text-align:right;white-space:nowrap}.strong{font-weight:700}
    .after-items{display:table;width:100%;table-layout:fixed;margin-top:5mm}.payment-info,.totals{display:table-cell;vertical-align:top}.payment-info{width:51%;padding-right:10mm}.info-box{background:#f4f7fb;border-left:2px solid #1683e8;padding:3mm 4mm}.info-box h3{font-size:6.4pt;text-transform:uppercase;letter-spacing:.55pt;margin:0 0 2mm}.info-row{display:table;width:100%;margin:1.1mm 0}.info-row span,.info-row strong{display:table-cell;vertical-align:top}.info-row span{width:38%;color:#687386;font-size:6.8pt}.info-row strong{font-size:7.2pt}
    .totals{width:49%;font-size:7.6pt}.totals table{width:100%;border-collapse:collapse}.totals td{padding:1.2mm 0;border-bottom:1px solid #e5eaf0}.totals td:last-child{text-align:right;font-weight:700;white-space:nowrap}.totals tr.grand td{border-top:2px solid #1683e8;border-bottom:0;padding-top:2mm;font-size:10pt}
    .footer{position:absolute;left:15mm;right:15mm;bottom:8mm;border-top:1px solid #dce3ec;padding-top:2.2mm;color:#778194;font-size:6.5pt}.footer strong{color:#172033}.footer-right{float:right}.test-note{color:#9a6500;font-weight:700}
    .qr-page{height:297mm;position:relative}.qr-page .watermark{top:100mm}.separate{position:absolute;left:0;right:0;bottom:105mm;text-align:center;font-size:7pt;border-bottom:1px dashed #333;padding-bottom:1.5mm}
    .qr-part{position:absolute;left:0;bottom:0;width:210mm;height:105mm}.receipt,.payment{position:absolute;top:0;height:95mm;padding:5mm}.receipt{left:0;width:62mm;border-right:1px dashed #333}.payment{left:62mm;width:148mm}.qr-part h2{font-size:11pt;margin:0 0 4mm}.qr-label{font-size:6pt;font-weight:700;margin-top:2mm}.receipt{font-size:6.6pt;line-height:1.25}.payment{font-size:7.2pt;line-height:1.25}.qr-spacer{height:3mm}.amount-grid{display:table}.amount-grid>div{display:table-cell;padding-right:9mm}.amount-grid span,.amount-grid strong{display:block}.amount-grid span{font-size:6pt;font-weight:700}.amount-grid strong{font-size:8pt}.receipt .amount-grid{position:absolute;left:5mm;bottom:8mm}.acceptance{position:absolute;right:5mm;bottom:8mm;font-size:6pt}
    .qr-code-wrap{position:absolute;left:5mm;top:15mm;width:46mm;height:46mm}.qr-code{width:46mm;height:46mm}
    .payment-details{position:absolute;left:56mm;top:15mm;width:84mm}.qr-gap{height:2mm}.payment-amount{position:absolute;left:5mm;bottom:8mm}
    </style></head><body>
    <section class="invoice-page">{$watermark}
      <div class="header"><div class="brand"><img src="{$logo}" alt="Ferry Telecom"></div><div class="seller">
        ferrytelecom.com<br><strong>Ferry Telecom AG</strong><br>Industriestrasse 8<br>6203 Sempach Station<br>Switzerland<br>
        info@ferrytelecom.com<br>VAT CHE-254.271.185 MWST<br>+41 78 204 56 55
      </div></div>
      <div class="title"><h1>INVOICE</h1><div class="doc-id">{$e($invoice['invoice_number'])}</div></div>
      <div class="parties"><div class="bill"><div class="eyebrow">Invoice recipient</div><div class="buyer">{$buyer}{$buyerDetails}</div></div><div class="meta"><table>
        <tr><td>Invoice number</td><td>{$e($invoice['invoice_number'])}</td></tr>
        <tr><td>Order number</td><td>{$e($invoice['order_number'])}</td></tr>
        <tr><td>Invoice date</td><td>{$e($invoice['invoice_date'])}</td></tr>
        <tr><td>Due date</td><td>{$e($invoice['due_date'])}</td></tr>
        <tr><td>Currency</td><td>{$e($invoice['currency'])}</td></tr>
        <tr><td>Payment method</td><td>{$e($invoice['payment_method'])}</td></tr>
      </table></div></div>
      <table class="items"><thead><tr><th class="sku">SKU</th><th class="product">Product</th><th class="number">Qty</th><th class="money">Unit price</th><th class="number">VAT</th><th class="money">Total</th></tr></thead><tbody>{$rows}</tbody></table>
      <div class="after-items"><div class="payment-info"><div class="info-box"><h3>Payment information</h3>
        <div class="info-row"><span>Payment terms</span><strong>{$e($invoice['payment_terms'])}</strong></div>
        {$referenceRow}
        {$noteRow}
      </div></div><div class="totals"><table>
        <tr><td>Subtotal excl. VAT</td><td>{$e($invoice['subtotal'])}</td></tr>
        <tr><td>Shipping excl. VAT</td><td>{$e($invoice['shipping'])}</td></tr>
        <tr><td>{$e($invoice['tax_label'])}</td><td>{$e($invoice['tax'])}</td></tr>
        <tr class="grand"><td>Total incl. VAT</td><td>{$e($invoice['total'])}</td></tr>
      </table></div></div>
      <div class="footer"><strong>Ferry Telecom AG</strong> · ferrytelecom.com · info@ferrytelecom.com
        <span class="footer-right">{$e($invoice['invoice_number'])} · Page 1{$testFooter}</span>
      </div>
    </section>{$qrPage}</body></html>
    HTML;

    $options = new Options();
    $options->set('isRemoteEnabled', false);
    $options->set('isHtml5ParserEnabled', true);
    $options->set('defaultFont', 'OpenSans');
    $options->setChroot(dirname(__DIR__, 2));
    $dompdf = new Dompdf($options);
    $dompdf->loadHtml($html, 'UTF-8');
    $dompdf->setPaper('A4');
    $dompdf->render();
    return $dompdf->output();
}