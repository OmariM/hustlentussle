/**
 * Dedicated prelim setup screen (/prelim-setup).
 *
 * Builds the roster client-side — one-click add/remove — with bib numbers assigned in
 * the order dancers are added, regardless of role (add L, F, L -> 1, 2, 3). Sets the
 * advancing counts, group size, and judges, then creates an already-confirmed prelim
 * (POST /api/prelims/start with confirm:true + the explicit numbers) and routes straight
 * into the heats.
 */
import { showToast } from './toast';

interface StartResponse {
    session_id: string;
}

interface Entry {
    name: string;
    role: 'lead' | 'follow';
}

// Single ordered roster so bib numbers follow the global add order across both roles.
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
    $('prelim-setup-start')?.addEventListener('click', () => {
        void start();
    });
    $('prelim-setup-back')?.addEventListener('click', () => window.navigate?.('/'));
}

function addFromInput(role: 'lead' | 'follow'): void {
    const input = $(role === 'lead' ? 'prelim-setup-add-lead' : 'prelim-setup-add-follow') as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!name) return;
    if (roster.some((e) => e.role === role && e.name.toLowerCase() === name.toLowerCase())) {
        showToast(`${name} is already a ${role}.`, 'info');
        return;
    }
    roster.push({ name, role });
    if (input) input.value = '';
    render();
    input?.focus();
}

function remove(entry: Entry): void {
    const i = roster.indexOf(entry);
    if (i >= 0) roster.splice(i, 1);
    render();
}

function render(): void {
    const leadContainer = $('prelim-setup-leads');
    const followContainer = $('prelim-setup-follows');
    if (leadContainer) leadContainer.innerHTML = '';
    if (followContainer) followContainer.innerHTML = '';

    let nLeads = 0;
    let nFollows = 0;
    roster.forEach((entry, i) => {
        const container = entry.role === 'lead' ? leadContainer : followContainer;
        if (entry.role === 'lead') nLeads += 1;
        else nFollows += 1;
        container?.appendChild(rosterRow(entry, i + 1));
    });

    const lc = $('prelim-setup-lead-count');
    if (lc) lc.textContent = String(nLeads);
    const fc = $('prelim-setup-follow-count');
    if (fc) fc.textContent = String(nFollows);
}

function rosterRow(entry: Entry, bib: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prelims-number-row';
    const badge = document.createElement('span');
    badge.className = 'prelims-bib';
    badge.textContent = String(bib);
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
    const leads = roster.filter((e) => e.role === 'lead').map((e) => e.name);
    const follows = roster.filter((e) => e.role === 'follow').map((e) => e.name);
    if (leads.length < 1 || follows.length < 1) {
        showToast('Add at least one lead and one follow.', 'error');
        return;
    }
    // Bib numbers follow the global add order (1-based index into the roster).
    const leadNumbers: Record<string, string> = {};
    const followNumbers: Record<string, string> = {};
    roster.forEach((entry, i) => {
        (entry.role === 'lead' ? leadNumbers : followNumbers)[entry.name] = String(i + 1);
    });

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
                leads,
                follows,
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
