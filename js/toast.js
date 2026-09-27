// toast.js — notificações toast no canto inferior direito.

/**
 * Exibe uma notificação toast.
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} type
 * @param {number} duration  ms antes de desaparecer (padrão 3500)
 */
export function showToast(message, type = "info", duration = 3500) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("leaving");
    toast.addEventListener("animationend", () => toast.remove());
  }, duration);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
