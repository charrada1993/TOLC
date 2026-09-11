/**
 * main.js — Global scripts (Nav, Dark Mode, Toasts)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu Toggle
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.contains('open');
      mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', !isOpen);
    });
  }

  // Dark Mode Toggle
  const darkToggle = document.getElementById('darkToggle');
  if (darkToggle) {
    // Check saved preference or OS preference
    const savedTheme = localStorage.getItem('tolc_theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateToggleIcon(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
      updateToggleIcon('dark');
    }

    darkToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tolc_theme', next);
      updateToggleIcon(next);
    });
  }
});

function updateToggleIcon(theme) {
  const btn = document.getElementById('darkToggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error')   icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span aria-hidden="true">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(24px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
