/**
 * Toast notification system, shared by app.js and the carved modules.
 */

export function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3000): void {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}
