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

/** lowercase, non-alphanumeric -> '-', trimmed; used for downloaded filenames. */
export function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'battle';
}
