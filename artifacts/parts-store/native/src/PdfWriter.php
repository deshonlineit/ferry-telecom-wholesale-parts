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
    private const PAGE_WIDTH = 595.0;
    private const PAGE_HEIGHT = 842.0;
    private const LEFT = 48.0;
    private const BOTTOM = 48.0;

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
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.0F %.0F] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>',
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