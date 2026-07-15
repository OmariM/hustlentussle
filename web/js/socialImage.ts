/**
 * Shared canvas-drawing primitives for the "export as Instagram post" image
 * features (battle results, per-battle admin export, YTD top-8). Kept
 * dependency-free (no module state) so results.ts and ytd.ts can both
 * `import` it directly.
 */

// Instagram feed-post ratio (4:5), the max vertical space Instagram allows
// before cropping a feed post.
export const SOCIAL_W = 1080;
export const SOCIAL_H = 1350;

export interface SocialTheme {
    bg: string;
    bgCard: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    rowAlt: string;
    badgeWin: string;
    badgeWinBorder: string;
    badgeLose: string;
    badgeLoseBorder: string;
    badgeWinText: string;
    badgeLoseText: string;
    fontDisplay: string;
    fontBody: string;
    fontMono: string;
}

export function getSocialTheme(isDark: boolean): SocialTheme {
    return isDark ? {
        bg:            '#0a0a12',
        bgCard:        '#1a1a2e',
        accent:        '#7c3aed',
        textPrimary:   '#f1f5f9',
        textSecondary: '#94a3b8',
        textMuted:     '#64748b',
        border:        'rgba(148,163,184,0.12)',
        rowAlt:        'rgba(255,255,255,0.03)',
        badgeWin:      '#7c3aed',
        badgeWinBorder:'#9d5cf5',
        badgeLose:     'rgba(255,255,255,0.07)',
        badgeLoseBorder:'rgba(148,163,184,0.15)',
        badgeWinText:  '#ffffff',
        badgeLoseText: '#64748b',
        fontDisplay:   '"Space Grotesk","Inter",sans-serif',
        fontBody:      '"Inter","DM Sans",sans-serif',
        fontMono:      '"DM Mono",monospace',
    } : {
        bg:            '#f5f5f7',
        bgCard:        '#ffffff',
        accent:        '#1d4ed8',
        textPrimary:   '#0f172a',
        textSecondary: '#475569',
        textMuted:     '#94a3b8',
        border:        '#e2e8f0',
        rowAlt:        'rgba(0,0,0,0.03)',
        badgeWin:      '#1d4ed8',
        badgeWinBorder:'#1e40af',
        badgeLose:     '#f0f0f5',
        badgeLoseBorder:'#e2e8f0',
        badgeWinText:  '#ffffff',
        badgeLoseText: '#94a3b8',
        fontDisplay:   '"DM Sans",sans-serif',
        fontBody:      '"DM Sans",sans-serif',
        fontMono:      '"DM Mono",monospace',
    };
}

export function isDarkTheme(): boolean {
    return document.documentElement.getAttribute('data-color') === 'dark';
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string, onError?: () => void): void {
    canvas.toBlob(blob => {
        if (!blob) { onError?.(); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 'image/png');
}

/**
 * Baseline Y for a single line of text (rank number, points, etc.) vertically placed within
 * a row. Normal (single-line-name) rows keep the original "0.64 down from the row top"
 * placement rows have always used; a wrapped (two-line-name) row is taller than that formula
 * was tuned for, so it centers the text on the row's actual height instead.
 */
export function singleLineBaseline(rowY: number, rowHeight: number, fontSize: number, isWrapped: boolean): number {
    return isWrapped ? rowY + rowHeight / 2 + fontSize * 0.35 : rowY + rowHeight * 0.64;
}

/** lowercase, non-alphanumeric -> '-', trimmed; used for downloaded filenames. */
export function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'battle';
}

function fontString(size: number, family: string, bold: boolean): string {
    return `${bold ? 'bold' : '400'} ${size}px ${family}`;
}

/** Shrinks `text` (via binary search on measured width) until it plus an ellipsis fits `maxWidth`.
 * Assumes ctx.font is already set to the size/family the caller wants measured. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return text.slice(0, lo) + '…';
}

export interface FitNameResult {
    /** 1 or 2 lines to render, in order. */
    lines: string[];
    /** px size to use for every returned line. */
    fontSize: number;
}

/**
 * Fits a name into a box of `maxWidth`, in three tiers: shrink the font down to
 * `minFontSize` to fit on one line; if a multi-word name still doesn't fit even at
 * `minFontSize`, wrap it onto two lines; if it still doesn't fit (a single very long
 * word, or an overflowing second line), truncate with an ellipsis as the last resort.
 */
export function fitNameToBox(
    ctx: CanvasRenderingContext2D,
    name: string,
    maxWidth: number,
    baseFontSize: number,
    minFontSize: number,
    fontFamily: string,
    bold: boolean,
): FitNameResult {
    ctx.font = fontString(baseFontSize, fontFamily, bold);
    if (ctx.measureText(name).width <= maxWidth) {
        return { lines: [name], fontSize: baseFontSize };
    }

    const shrunk = Math.max(minFontSize, Math.min(baseFontSize - 1, Math.floor(baseFontSize * maxWidth / ctx.measureText(name).width)));
    ctx.font = fontString(shrunk, fontFamily, bold);
    if (ctx.measureText(name).width <= maxWidth) {
        return { lines: [name], fontSize: shrunk };
    }

    // Doesn't fit on one line even at the size floor - wrap onto two lines if possible.
    ctx.font = fontString(minFontSize, fontFamily, bold);
    const words = name.trim().split(/\s+/);
    if (words.length > 1) {
        let line1 = words[0];
        let i = 1;
        for (; i < words.length; i++) {
            const candidate = `${line1} ${words[i]}`;
            if (ctx.measureText(candidate).width > maxWidth) break;
            line1 = candidate;
        }
        const line2Raw = words.slice(i).join(' ');
        if (line2Raw) {
            if (ctx.measureText(line1).width > maxWidth) line1 = truncateToWidth(ctx, line1, maxWidth);
            return { lines: [line1, truncateToWidth(ctx, line2Raw, maxWidth)], fontSize: minFontSize };
        }
    }

    // Single unbreakable "word" (or wrapping produced no second line) - truncate as the last resort.
    return { lines: [truncateToWidth(ctx, name, maxWidth)], fontSize: minFontSize };
}
