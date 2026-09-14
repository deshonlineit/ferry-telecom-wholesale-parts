<?php
declare(strict_types=1);

function wcCategorySlug(string $categories, string $name): string
{
    $text = mb_strtolower($categories . ' ' . $name, 'UTF-8');
    $rules = [
        'screens' => '/\b(oled|lcd|display|touchscreen|screen|digitizer)\b/u',
        'batteries' => '/\b(battery|batteries|batterij|accu)\b/u',
        'charging' => '/\b(charging port|charge port|dock connector|laadpoort)\b/u',
        // Specific material/function wins over a broad assembly noun.
        'adhesive' => '/\b(adhesive|sticker|seal|tape|glue)\b/u',
        // A back-cover assembly remains housing even when a camera lens is included.
        'housing' => '/\b(housing|back glass|back cover|chassis|middle frame|battery cover)\b/u',
        'cameras' => '/\b(camera|camera lens)\b/u',
        'audio' => '/\b(speaker|earpiece|microphone|audio)\b/u',
        'tools' => '/\b(tool|tools|screwdriver|tweezer|pliers|solder)\b/u',
        'protection' => '/\b(case|cover|protector|tempered glass)\b/u',
        'flex' => '/\b(flex|button|vibrator|vibration|sim tray|antenna)\b/u',
        'accessories' => '/\b(cable|adapter|charger|holder|stand|accessor)\b/u',
    ];
    foreach ($rules as $slug => $pattern) {
        if (preg_match($pattern, $text)) {
            return $slug;
        }
    }
    return 'other';
}