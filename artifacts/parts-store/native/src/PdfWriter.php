<?php
declare(strict_types=1);

/**
 * Tiny, dependency-free PDF writer for the test shop's text documents.
 * It deliberately supports only built-in Helvetica and authored text; it is
 * not a general HTML-to-PDF implementation.
 */
final class PdfWriter
{
    /** @var list<string> */
    private array $pages = [];
    /** @var list<string> */
    private array $lines = [];
    private float $cursorY = 790.0;
    private const PAGE_WIDTH = 595.28;
    private const PAGE_HEIGHT = 841.89;
    private const LEFT = 48.0;
    private const BOTTOM = 48.0;
    private const MM = 72 / 25.4;

    public function __construct(
        private readonly string $documentNumber,
        private readonly string $title,
    ) {
        $this->newPage();
    }

    public function heading(string $text, float $size = 16.0): void
    {
        $this->ensureSpace($size + 14.0);
        $this->writeLine($text, $size, true);
        $this->cursorY -= 5.0;
    }

    public function line(string $text = '', float $size = 10.0): void
    {
        $wrapped = $this->wrap($text, $size);
        foreach ($wrapped as $line) {
            $this->ensureSpace($size + 5.0);
            $this->writeLine($line, $size, false);
        }
    }

    public function rule(): void
    {
        $this->ensureSpace(12.0);
        $y = $this->cursorY;
        $this->lines[] = sprintf('0.72 G 0.5 w %.2F %.2F m %.2F %.2F l S', self::LEFT, $y, self::PAGE_WIDTH - self::LEFT, $y);
        $this->cursorY -= 10.0;
    }

    public function spacer(float $points = 8.0): void
    {
        $this->ensureSpace($points);
        $this->cursorY -= $points;
    }

    /**
     * Draws a structured Ferry Telecom invoice page. The QR payment section is
     * added separately through swissQrPaymentPart().
     *
     * @param array{
     *   document_number:string,order_number:string,order_date:string,currency:string,
     *   customer:list<string>,items:list<array{sku:string,name:string,quantity:int,unit:string,tax:string,total:string}>,
     *   subtotal:string,shipping:string,tax_label:string,tax:string,total:string,
     *   payment_method:string,payment_terms?:string,customer_note?:string
     * } $data
     */
    public function invoiceLayout(array $data): void
    {
        $this->lines = ['0 g'];
        $blue = '0.047 0.486 0.929 rg 0.047 0.486 0.929 RG';
        $dark = '0.075 0.102 0.153 rg 0.075 0.102 0.153 RG';
        $muted = '0.39 0.44 0.52 rg 0.39 0.44 0.52 RG';
        $left = 42.0;
        $right = 553.0;

        // Compact vector brand mark plus wordmark.
        $this->lines[] = $blue;
        $this->lines[] = '1.8 w 48 786 m 63 801 l 68 796 l 58 786 l 68 776 l 63 771 l 48 786 l S';
        $this->lines[] = '1.8 w 58 786 m 73 801 l 78 796 l 68 786 l 78 776 l 73 771 l 58 786 l S';
        $this->lines[] = $dark;
        $this->textAt('ferrytelecom', 91, 782, 20, true);
        $this->textAt('WHOLESALE PARTS', 92, 768, 7, true);

        $company = [
            'ferrytelecom.com',
            'Ferry Telecom AG',
            'Industriestrasse 8',
            '6203 Sempach Station',
            'Switzerland',
            'info@ferrytelecom.com',
            'VAT CHE-254.271.185 MWST',
            '+41 78 204 56 55',
        ];
        $y = 802.0;
        foreach ($company as $index => $line) {
            $this->textAt($line, 395, $y, $index === 1 ? 8.5 : 8, $index === 1);
            $y -= 12;
        }

        $this->lines[] = $blue;
        $this->textAt('INVOICE', $left, 694, 18, true);
        $this->lines[] = $dark;
        $this->textAt((string) $data['document_number'], $left, 676, 8);

        $this->textAt('BILL TO', $left, 638, 7, true);
        $y = 622;
        foreach ($data['customer'] as $index => $line) {
            $this->textAt($line, $left, $y, $index === 0 ? 10 : 9, $index === 0);
            $y -= 14;
        }

        $metaX = 354.0;
        $meta = [
            ['Invoice number', (string) $data['document_number']],
            ['Order number', (string) $data['order_number']],
            ['Order date', (string) $data['order_date']],
            ['Currency', (string) $data['currency']],
            ['Payment method', (string) $data['payment_method']],
        ];
        $y = 638;
        foreach ($meta as [$label, $value]) {
            $this->lines[] = $muted;
            $this->textAt($label, $metaX, $y, 7, true);
            $this->lines[] = $dark;
            foreach ($this->wrapToWidth($value, 28) as $valueLine) {
                $this->textAt($valueLine, 444, $y, 8);
                $y -= 11;
            }
            $y -= 4;
        }

        $tableTop = min(530.0, $y - 18);
        $columns = [42, 108, 346, 390, 442, 491, 553];
        $this->lines[] = $dark;
        $this->lines[] = sprintf('%.2F %.2F %.2F 23 re f', $left, $tableTop, $right - $left);
        $headers = [
            ['SKU', 48], ['PRODUCT', 114], ['QTY', 351],
            ['PRICE', 397], ['VAT', 449], ['TOTAL', 498],
        ];
        foreach ($headers as [$label, $x]) {
            $this->lines[] = '1 1 1 rg';
            $this->textAt($label, $x, $tableTop + 8, 7, true);
        }
        $this->lines[] = $dark;

        $rowTop = $tableTop - 8;
        foreach ($data['items'] as $item) {
            $nameLines = $this->wrapToWidth((string) $item['name'], 44);
            $skuLines = $this->wrapToWidth((string) $item['sku'], 11);
            $rowLines = max(count($nameLines), count($skuLines), 1);
            $rowHeight = max(30, 12 + ($rowLines * 11));
            if ($rowTop - $rowHeight < 235) {
                $this->textAt('Additional order lines continue in the order overview.', 114, $rowTop - 12, 8);
                $rowTop -= 28;
                break;
            }
            $textY = $rowTop - 11;
            foreach ($skuLines as $index => $line) {
                $this->textAt($line, 48, $textY - ($index * 11), 7.5, $index === 0);
            }
            foreach ($nameLines as $index => $line) {
                $this->textAt($line, 114, $textY - ($index * 11), 8);
            }
            $this->textAt((string) $item['quantity'], 356, $textY, 8);
            $this->textAt((string) $item['unit'], 397, $textY, 8);
            $this->textAt((string) $item['tax'], 449, $textY, 8);
            $this->textAt((string) $item['total'], 498, $textY, 8, true);
            $rowBottom = $rowTop - $rowHeight;
            $this->lines[] = sprintf('0.86 G 0.4 w %.2F %.2F m %.2F %.2F l S', $left, $rowBottom, $right, $rowBottom);
            $rowTop = $rowBottom;
        }

        $summaryTop = $rowTop - 26;
        $summary = [
            ['Subtotal excl. VAT', (string) $data['subtotal'], false],
            ['Shipping excl. VAT', (string) $data['shipping'], false],
            [(string) $data['tax_label'], (string) $data['tax'], false],
            ['Total incl. VAT', (string) $data['total'], true],
        ];
        $y = $summaryTop;
        foreach ($summary as [$label, $value, $bold]) {
            if ($bold) {
                $this->lines[] = sprintf('0.047 0.486 0.929 RG 1.2 w 350 %.2F m 553 %.2F l S', $y + 9, $y + 9);
            }
            $this->textAt($label, 350, $y, $bold ? 10 : 8, $bold);
            $this->textAt($value, 493, $y, $bold ? 10 : 8, true);
            $y -= $bold ? 22 : 17;
        }

        $infoY = $summaryTop - 100;
        $this->lines[] = '0.96 0.97 0.99 rg';
        $this->lines[] = sprintf('42 %.2F 284 76 re f', $infoY - 55);
        $this->lines[] = $dark;
        $this->textAt('PAYMENT INFORMATION', 54, $infoY, 7, true);
        $terms = trim((string) ($data['payment_terms'] ?? ''));
        $note = trim((string) ($data['customer_note'] ?? ''));
        $lineY = $infoY - 18;
        if ($terms !== '') {
            $this->textAt('Payment terms', 54, $lineY, 8, true);
            $this->textAt($terms, 142, $lineY, 8);
            $lineY -= 16;
        }
        if ($note !== '') {
            $this->textAt('Customer note', 54, $lineY, 8, true);
            foreach (array_slice($this->wrapToWidth($note, 46), 0, 2) as $noteLine) {
                $this->textAt($noteLine, 142, $lineY, 8);
                $lineY -= 12;
            }
        }

        $this->lines[] = $muted;
        $this->textAt('Thank you for your business.', $left, 70, 8);
        $this->textAt('Ferry Telecom AG  |  ferrytelecom.com  |  info@ferrytelecom.com', $left, 54, 7);
        $this->lines[] = $dark;
    }

    public function qrSvg(string $svg, float $size = 150.0): void
    {
        $this->ensureSpace($size + 10.0);
        $this->drawQrSvg($svg, self::LEFT, $this->cursorY - $size, $size);
        $this->cursorY -= $size + 10.0;
    }

    /**
     * Adds the official 210 x 105 mm Swiss receipt/payment-part block as a
     * dedicated final A4 page. Values are preformatted so the QR payload and
     * the human-readable section are guaranteed to use the same snapshot.
     *
     * @param array{account:string,creditor:list<string>,debtor:list<string>,currency:string,amount:string,reference?:string,information?:string} $data
     */
    public function swissQrPaymentPart(string $svg, array $data): void
    {
        $this->finishPage();
        $this->lines = [
            'q',
            '0.94 g',
            'BT /F1 42 Tf 0.707 0.707 -0.707 0.707 105 510 Tm (TEST) Tj ET',
            'Q',
            '0 g',
        ];

        $mm = self::MM;
        $sectionTop = 105 * $mm;
        $receiptWidth = 62 * $mm;

        // Official separation boundaries. Dashed marks are used because the
        // document itself cannot know whether the printer perforates the page.
        $this->lines[] = sprintf('[2.8 2.8] 0 d 0.5 w 0 G 0 %.3F m %.3F %.3F l S', $sectionTop, self::PAGE_WIDTH, $sectionTop);
        $this->lines[] = sprintf('[2.8 2.8] 0 d 0.5 w 0 G %.3F 0 m %.3F %.3F l S [] 0 d', $receiptWidth, $receiptWidth, $sectionTop);
        $this->drawScissors(3 * $mm, $sectionTop);
        $this->drawScissors($receiptWidth, $sectionTop - (4 * $mm), true);

        $this->textAt('Receipt', 5 * $mm, 100 * $mm, 11, true);
        $this->textAt('Payment part', 67 * $mm, 100 * $mm, 11, true);

        $this->labelAndLines('Account / Payable to', 5, 89, $data['account'], $data['creditor'], 6);
        $this->labelAndLines('Payable by', 5, 54, '', $data['debtor'], 6);
        $this->textAt('Currency', 5 * $mm, 18 * $mm, 6, true);
        $this->textAt($data['currency'], 5 * $mm, 13 * $mm, 8);
        $this->textAt('Amount', 18 * $mm, 18 * $mm, 6, true);
        $this->textAt($data['amount'], 18 * $mm, 13 * $mm, 8);
        $this->textAt('Acceptance point', 36 * $mm, 13 * $mm, 6, true);

        // SIX placement uses top-origin coordinates: x=67 mm and y=17.5 mm
        // within the 105 mm payment part. PDF coordinates start at the bottom,
        // so the lower edge is 105 - 17.5 - 46 = 41.5 mm.
        $qrX = 67 * $mm;
        $qrY = (105 - 17.5 - 46) * $mm;
        $this->drawQrSvg($svg, $qrX, $qrY, 46 * $mm);

        $this->textAt('Currency', 67 * $mm, 13 * $mm, 6, true);
        $this->textAt($data['currency'], 67 * $mm, 8 * $mm, 8);
        $this->textAt('Amount', 80 * $mm, 13 * $mm, 6, true);
        $this->textAt($data['amount'], 80 * $mm, 8 * $mm, 8);

        $rightX = 118 * $mm;
        $this->labelAndLines('Account / Payable to', 118, 89, $data['account'], $data['creditor'], 8);
        $nextY = 55;
        if (($data['reference'] ?? '') !== '') {
            $this->textAt('Reference', $rightX, $nextY * $mm, 8, true);
            $this->textAt((string) $data['reference'], $rightX, ($nextY - 5) * $mm, 10);
            $nextY -= 14;
        }
        if (($data['information'] ?? '') !== '') {
            $this->textAt('Additional information', $rightX, $nextY * $mm, 8, true);
            $this->textAt((string) $data['information'], $rightX, ($nextY - 5) * $mm, 10);
            $nextY -= 14;
        }
        $this->labelAndLines('Payable by', 118, $nextY, '', $data['debtor'], 8);

        $this->pages[] = implode("\n", $this->lines);
        $this->lines = [];
    }

    private function drawQrSvg(string $svg, float $x, float $y, float $size): void
    {
        if (!preg_match('/viewBox="0 0 ([\d.]+) ([\d.]+)"/', $svg, $view)
            || !preg_match('/<path[^>]+d="([^"]+)"/', $svg, $path)) {
            throw new RuntimeException('The generated QR image could not be embedded.');
        }
        $scale = $size / (float) $view[1];
        $commands = html_entity_decode($path[1], ENT_QUOTES | ENT_XML1);
        preg_match_all(
            '/M([\d.]+),([\d.]+)L([\d.]+),([\d.]+)L([\d.]+),([\d.]+)L([\d.]+),([\d.]+)Z/i',
            $commands,
            $matches,
            PREG_SET_ORDER
        );
        if ($matches === []) {
            throw new RuntimeException('The generated QR image contains no drawable modules.');
        }
        $this->lines[] = sprintf('q %.3F %.3F %.3F %.3F re W n 0 g', $x, $y, $size, $size);
        foreach ($matches as $match) {
            $this->lines[] = sprintf(
                '%.3F %.3F %.3F %.3F re f',
                $x + ((float) $match[1] * $scale),
                $y + ($size - ((float) $match[6] * $scale)),
                ((float) $match[3] - (float) $match[1]) * $scale,
                ((float) $match[6] - (float) $match[4]) * $scale
            );
        }
        $cross = $size * (7 / 46);
        $crossX = $x + (($size - $cross) / 2);
        $crossY = $y + (($size - $cross) / 2);
        $this->lines[] = sprintf('0 g %.3F %.3F %.3F %.3F re f', $crossX, $crossY, $cross, $cross);
        $this->lines[] = sprintf(
            '1 g %.3F %.3F %.3F %.3F re f %.3F %.3F %.3F %.3F re f',
            $crossX + ($cross * .39), $crossY + ($cross * .18), $cross * .22, $cross * .64,
            $crossX + ($cross * .18), $crossY + ($cross * .39), $cross * .64, $cross * .22
        );
        $this->lines[] = 'Q';
    }

    /** @param list<string> $lines */
    private function labelAndLines(string $label, float $xMm, float $yMm, string $first, array $lines, float $labelSize): void
    {
        $x = $xMm * self::MM;
        $y = $yMm * self::MM;
        $this->textAt($label, $x, $y, $labelSize, true);
        $y -= 4 * self::MM;
        foreach (array_filter(array_merge([$first], $lines), static fn(string $line): bool => trim($line) !== '') as $line) {
            $this->textAt($line, $x, $y, $labelSize + 2);
            $y -= 4 * self::MM;
        }
    }

    private function textAt(string $text, float $x, float $y, float $size, bool $bold = false): void
    {
        $encoded = $this->escape($text);
        $this->lines[] = sprintf('BT /F1 %.2F Tf 1 0 0 1 %.3F %.3F Tm (%s) Tj ET', $size, $x, $y, $encoded);
        if ($bold) {
            $this->lines[] = sprintf('BT /F1 %.2F Tf 1 0 0 1 %.3F %.3F Tm (%s) Tj ET', $size, $x + 0.2, $y, $encoded);
        }
    }

    private function drawScissors(float $x, float $y, bool $vertical = false): void
    {
        $r = 1.2 * self::MM;
        if ($vertical) {
            $this->lines[] = sprintf('0.5 w %.3F %.3F m %.3F %.3F l S %.3F %.3F m %.3F %.3F l S', $x - $r, $y - $r, $x + $r, $y + $r, $x - $r, $y + $r, $x + $r, $y - $r);
        } else {
            $this->lines[] = sprintf('0.5 w %.3F %.3F m %.3F %.3F l S %.3F %.3F m %.3F %.3F l S', $x - $r, $y - $r, $x + $r, $y + $r, $x - $r, $y + $r, $x + $r, $y - $r);
        }
    }

    public function output(): string
    {
        $this->finishPage();
        $objects = [];
        $pageCount = count($this->pages);
        $fontId = 3 + ($pageCount * 2);
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';

        $kids = [];
        for ($i = 0; $i < $pageCount; $i++) {
            $pageId = 3 + ($i * 2);
            $contentId = $pageId + 1;
            $kids[] = $pageId . ' 0 R';
            $stream = $this->pages[$i];
            $objects[$pageId] = sprintf(
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>',
                self::PAGE_WIDTH,
                self::PAGE_HEIGHT,
                $fontId,
                $contentId
            );
            $objects[$contentId] = "<< /Length " . strlen($stream) . " >>\nstream\n" . $stream . "\nendstream";
        }
        $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . $pageCount . ' >>';
        $objects[$fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        ksort($objects);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [0];
        foreach ($objects as $id => $object) {
            $offsets[$id] = strlen($pdf);
            $pdf .= $id . " 0 obj\n" . $object . "\nendobj\n";
        }
        $xref = strlen($pdf);
        $max = max(array_keys($objects));
        $pdf .= "xref\n0 " . ($max + 1) . "\n0000000000 65535 f \n";
        for ($id = 1; $id <= $max; $id++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$id] ?? 0);
        }
        $pdf .= "trailer\n<< /Size " . ($max + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF\n";
        return $pdf;
    }

    private function newPage(): void
    {
        if ($this->lines !== []) {
            $this->finishPage();
        }
        $this->lines = [
            'q',
            '0.92 g',
            'BT /F1 52 Tf 0.707 0.707 -0.707 0.707 105 260 Tm (TEST) Tj ET',
            'Q',
            '0 g',
        ];
        $this->cursorY = 790.0;
        $this->writeLine($this->title . '  |  ' . $this->documentNumber, 9.0, true);
        $this->cursorY -= 8.0;
    }

    private function finishPage(): void
    {
        if ($this->lines === []) {
            return;
        }
        $pageNumber = count($this->pages) + 1;
        $footer = sprintf('TEST ENVIRONMENT - not a live financial document  |  Page %d', $pageNumber);
        $this->lines[] = sprintf(
            'BT /F1 8 Tf 1 0 0 1 %.2F 25 Tm (%s) Tj ET',
            self::LEFT,
            $this->escape($footer)
        );
        $this->pages[] = implode("\n", $this->lines);
        $this->lines = [];
    }

    private function ensureSpace(float $needed): void
    {
        if ($this->cursorY - $needed < self::BOTTOM) {
            $this->newPage();
        }
    }

    private function writeLine(string $text, float $size, bool $bold): void
    {
        // Helvetica-Bold would require another object; a double paint gives a
        // restrained synthetic bold while retaining the tiny writer.
        $encoded = $this->escape($text);
        $command = sprintf('BT /F1 %.2F Tf 1 0 0 1 %.2F %.2F Tm (%s) Tj ET', $size, self::LEFT, $this->cursorY, $encoded);
        $this->lines[] = $command;
        if ($bold) {
            $this->lines[] = sprintf('BT /F1 %.2F Tf 1 0 0 1 %.2F %.2F Tm (%s) Tj ET', $size, self::LEFT + 0.25, $this->cursorY, $encoded);
        }
        $this->cursorY -= $size + 4.0;
    }

    /** @return list<string> */
    private function wrap(string $text, float $size): array
    {
        if ($text === '') {
            return [''];
        }
        $maxCharacters = max(24, (int) floor(92 * (10 / $size)));
        $lines = [];
        foreach (preg_split('/\R/u', $text) ?: [''] as $paragraph) {
            $wrapped = wordwrap($paragraph, $maxCharacters, "\n", true);
            array_push($lines, ...explode("\n", $wrapped));
        }
        return $lines;
    }

    /** @return list<string> */
    private function wrapToWidth(string $text, int $characters): array
    {
        $wrapped = wordwrap(trim($text), max(1, $characters), "\n", true);
        return $wrapped === '' ? [''] : explode("\n", $wrapped);
    }

    private function escape(string $text): string
    {
        if (function_exists('iconv')) {
            $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
            if ($converted !== false) {
                $text = $converted;
            }
        }
        $text = preg_replace('/[^\x20-\xFF]/', '?', $text) ?? $text;
        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', '', ' '], $text);
    }
}