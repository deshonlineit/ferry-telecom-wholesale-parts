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