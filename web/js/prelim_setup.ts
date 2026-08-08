/**
 * Dedicated prelim setup screen (/prelim-setup).
 *
 * Builds the roster client-side — one-click add/remove. Each dancer keeps a stable bib
 * number: it is assigned when they are added (the smallest unused positive number, or an
 * explicit one typed into the optional bib field next to the name) and never renumbers
 * when someone else is removed. Double-click a bib to change it to any unused number. On
 * start it creates an already-confirmed prelim (POST /api/prelims/start with confirm:true
 * + the explicit numbers) and routes straight into the heats.
 */
import { showToast } from './toast';

interface StartResponse {
    session_id: string;
}

interface Entry {
    name: string;
    role: 'lead' | 'follow';
    bib: string;
}

let roster: Entry[] = [];
let wired = false;

function $(id: string): HTMLElement | null {
    return document.getElementById(id);
}

function initPrelimSetup(): void {
    roster = [];
    wireOnce();
    render();
}

function wireOnce(): void {
    if (wired) return;
    wired = true;
    $('prelim-setup-add-lead-btn')?.addEventListener('click', () => addFromInput('lead'));
    $('prelim-setup-add-follow-btn')?.addEventListener('click', () => addFromInput('follow'));
    const onEnter = (id: string, role: 'lead' | 'follow') =>
        $(id)?.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') addFromInput(role);
        });
    onEnter('prelim-setup-add-lead', 'lead');
    onEnter('prelim-setup-add-follow', 'follow');
    onEnter('prelim-setup-add-lead-bib', 'lead');
    onEnter('prelim-setup-add-follow-bib', 'follow');
    $('prelim-setup-bulk-lead-btn')?.addEventListener('click', () => addBulk('lead'));
    $('prelim-setup-bulk-follow-btn')?.addEventListener('click', () => addBulk('follow'));
    const onCtrlEnter = (id: string, role: 'lead' | 'follow') =>
        $(id)?.addEventListener('keydown', (e) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Enter' && (ke.metaKey || ke.ctrlKey)) {
                ke.preventDefault();
                addBulk(role);
            }
        });
    onCtrlEnter('prelim-setup-bulk-lead', 'lead');
    onCtrlEnter('prelim-setup-bulk-follow', 'follow');
    $('prelim-setup-start')?.addEventListener('click', () => {
        void start();
    });
    $('prelim-setup-back')?.addEventListener('click', () => window.navigate?.('/'));
}

// Bib numbers currently in use (optionally excluding one entry being edited).
function usedBibs(exclude?: Entry): Set<string> {
    const s = new Set<string>();
    for (const e of roster) if (e !== exclude) s.add(e.bib);
    return s;
}

// Smallest positive integer not currently assigned to anyone (and not in `reserved`,
// used by bulk add to hold the explicit bibs that later lines in the paste claim).
function nextBib(reserved?: Set<string>): string {
    const used = usedBibs();
    let i = 1;
    while (used.has(String(i)) || reserved?.has(String(i))) i += 1;
    return String(i);
}

function addFromInput(role: 'lead' | 'follow'): void {
    const input = $(role === 'lead' ? 'prelim-setup-add-lead' : 'prelim-setup-add-follow') as HTMLInputElement | null;
    const bibInput = $(role === 'lead' ? 'prelim-setup-add-lead-bib' : 'prelim-setup-add-follow-bib') as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!name) return;
    if (roster.some((e) => e.role === role && e.name.toLowerCase() === name.toLowerCase())) {
        showToast(`${name} is already a ${role}.`, 'info');
        return;
    }
    const bibRaw = bibInput?.value.trim() || '';
    let bib: string;
    if (bibRaw === '') {
        bib = nextBib();
    } else if (!/^\d+$/.test(bibRaw) || parseInt(bibRaw, 10) < 1) {
        showToast('Enter a valid bib number.', 'error');
        return;
    } else {
        bib = String(parseInt(bibRaw, 10));
        if (usedBibs().has(bib)) {
            showToast(`Bib ${bib} is already taken.`, 'error');
            return;
        }
    }
    roster.push({ name, role, bib });
    if (input) input.value = '';
    if (bibInput) bibInput.value = '';
    render();
    input?.focus();
}

interface BulkEntry {
    name: string;
    bib: string | null;
}

function unquote(s: string): string {
    const t = s.trim();
    return /^".*"$/.test(t) ? t.slice(1, -1).trim() : t;
}

/**
 * Parse a pasted roster into name (+ optional bib) entries.
 *
 * Text containing a newline is one dancer per line; a single line is treated as a
 * comma-separated list of names. Within a line a bib may lead ("12 Alice", "12. Alice",
 * "12,Alice", "12<tab>Alice") or trail after an explicit comma/tab ("Alice, 12") — a bare
 * trailing number stays part of the name, so "Alice 2" survives intact. Entries that are
 * only digits are dropped (a stray number is not a name).
 */
export function parseBulkList(text: string): BulkEntry[] {
    const raw = (text || '').replace(/\r/g, '');
    const chunks = raw.includes('\n') ? raw.split('\n') : raw.split(',');
    const out: BulkEntry[] = [];
    for (const chunk of chunks) {
        const line = unquote(chunk);
        if (!line || /^\d+$/.test(line)) continue;
        let bib: string | null = null;
        let name = line;
        const lead = /^(\d{1,5})\s*(?:[.)\-:,\t]\s*|\s+)(.+)$/.exec(line);
        const trail = /^(.+?)[,\t]\s*(\d{1,5})$/.exec(line);
        if (lead) {
            bib = String(parseInt(lead[1], 10));
            name = lead[2];
        } else if (trail) {
            name = trail[1];
            bib = String(parseInt(trail[2], 10));
        }
        name = unquote(name).replace(/\s+/g, ' ');
        if (!name) continue;
        out.push({ name, bib });
    }
    return out;
}

function summarize(names: string[]): string {
    return names.length > 5 ? names.slice(0, 5).join(', ') + ` +${names.length - 5} more` : names.join(', ');
}

function addBulk(role: 'lead' | 'follow'): void {
    const ta = $(role === 'lead' ? 'prelim-setup-bulk-lead' : 'prelim-setup-bulk-follow') as HTMLTextAreaElement | null;
    const entries = parseBulkList(ta?.value || '');
    if (entries.length === 0) {
        showToast('Nothing to add — paste some names first.', 'error');
        return;
    }
    // Hold every bib the paste asks for up front, so an auto-numbered dancer earlier in the
    // list can't steal a number a later line spells out explicitly.
    const alreadyOnList = (name: string) =>
        roster.some((r) => r.role === role && r.name.toLowerCase() === name.toLowerCase());
    const reserved = new Set(entries.filter((e) => e.bib !== null && !alreadyOnList(e.name)).map((e) => e.bib as string));

    let added = 0;
    const dupes: string[] = [];
    const clashes: string[] = [];
    for (const e of entries) {
        if (alreadyOnList(e.name)) {
            dupes.push(e.name);
            continue;
        }
        if (e.bib !== null && usedBibs().has(e.bib)) {
            clashes.push(`${e.name} (bib ${e.bib})`);
            continue;
        }
        if (e.bib !== null) reserved.delete(e.bib);
        roster.push({ name: e.name, role, bib: e.bib ?? nextBib(reserved) });
        added += 1;
    }
    render();

    const skipped = dupes.length + clashes.length;
    if (added > 0 && ta) {
        ta.value = '';
        if (skipped === 0) {
            const details = ta.closest('details') as HTMLDetailsElement | null;
            if (details) details.open = false;
        }
    }
    const parts = [`Added ${added} ${role}${added === 1 ? '' : 's'}.`];
    if (dupes.length) parts.push(`Already on the list: ${summarize(dupes)}.`);
    if (clashes.length) parts.push(`Bib already taken: ${summarize(clashes)}.`);
    const type = added === 0 ? 'error' : skipped > 0 ? 'info' : 'success';
    showToast(parts.join(' '), type, skipped > 0 ? 6000 : 3000);
}

function remove(entry: Entry): void {
    const i = roster.indexOf(entry);
    if (i >= 0) roster.splice(i, 1);
    render(); // other bibs are untouched — no renumbering
}

// Validate + apply an edited bib. Must be a positive number that no one else holds.
function applyBib(entry: Entry, raw: string): void {
    const t = (raw || '').trim();
    if (!/^\d+$/.test(t) || parseInt(t, 10) < 1) {
        showToast('Enter a bib number.', 'error');
        return;
    }
    const val = String(parseInt(t, 10));
    if (val === entry.bib) return;
    if (usedBibs(entry).has(val)) {
        showToast(`Bib ${val} is already taken.`, 'error');
        return;
    }
    entry.bib = val;
}

function startBibEdit(entry: Entry, badge: HTMLElement): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.className = 'prelims-bib-edit';
    input.value = entry.bib;
    badge.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (save: boolean) => {
        if (done) return;
        done = true;
        if (save) applyBib(entry, input.value);
        render();
    };
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            commit(false);
        }
    });
    input.addEventListener('blur', () => commit(true));
}

function render(): void {
    const leadContainer = $('prelim-setup-leads');
    const followContainer = $('prelim-setup-follows');
    if (leadContainer) leadContainer.innerHTML = '';
    if (followContainer) followContainer.innerHTML = '';

    let nLeads = 0;
    let nFollows = 0;
    for (const entry of roster) {
        if (entry.role === 'lead') nLeads += 1;
        else nFollows += 1;
        const container = entry.role === 'lead' ? leadContainer : followContainer;
        container?.appendChild(rosterRow(entry));
    }

    const lc = $('prelim-setup-lead-count');
    if (lc) lc.textContent = String(nLeads);
    const fc = $('prelim-setup-follow-count');
    if (fc) fc.textContent = String(nFollows);
}

function rosterRow(entry: Entry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prelims-number-row';
    const badge = document.createElement('span');
    badge.className = 'prelims-bib prelims-bib--editable';
    badge.textContent = entry.bib;
    badge.title = 'Double-click to change the bib number';
    badge.addEventListener('dblclick', () => startBibEdit(entry, badge));
    const label = document.createElement('span');
    label.className = 'prelims-roster-name';
    label.textContent = entry.name;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'prelims-remove-btn';
    rm.textContent = '✕';
    rm.title = `Remove ${entry.name}`;
    rm.addEventListener('click', () => remove(entry));
    row.appendChild(badge);
    row.appendChild(label);
    row.appendChild(rm);
    return row;
}

function spotsValue(id: string): number | null {
    const raw = ($(id) as HTMLInputElement | null)?.value.trim() || '';
    return raw === '' ? null : parseInt(raw, 10);
}

async function start(): Promise<void> {
    const leadEntries = roster.filter((e) => e.role === 'lead');
    const followEntries = roster.filter((e) => e.role === 'follow');
    if (leadEntries.length < 1 || followEntries.length < 1) {
        showToast('Add at least one lead and one follow.', 'error');
        return;
    }
    const leadNumbers: Record<string, string> = {};
    const followNumbers: Record<string, string> = {};
    for (const e of leadEntries) leadNumbers[e.name] = e.bib;
    for (const e of followEntries) followNumbers[e.name] = e.bib;

    const groupRaw = ($('prelim-setup-group-size') as HTMLInputElement | null)?.value.trim() || '';
    const group_size = groupRaw === '' ? 8 : parseInt(groupRaw, 10);
    const judges = ($('prelim-setup-judges') as HTMLTextAreaElement | null)?.value.trim() || '';

    const btn = $('prelim-setup-start') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
        const resp = await fetch('/api/prelims/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                leads: leadEntries.map((e) => e.name),
                follows: followEntries.map((e) => e.name),
                judges,
                lead_numbers: leadNumbers,
                follow_numbers: followNumbers,
                lead_spots: spotsValue('prelim-setup-lead-spots'),
                follow_spots: spotsValue('prelim-setup-follow-spots'),
                group_size,
                confirm: true,
            }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to start prelims');
        }
        const data = (await resp.json()) as StartResponse;
        window.navigate?.('/prelims/' + encodeURIComponent(data.session_id));
    } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to start prelims', 'error');
        if (btn) btn.disabled = false;
    }
}

window.initPrelimSetup = initPrelimSetup;
