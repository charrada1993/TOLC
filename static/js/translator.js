/**
 * translator.js — Arabic translation tool using MyMemory API
 * Fixed: no longer blocks navigation links or buttons
 */

function initTranslator() {
  // Create tooltip button
  const tooltipBtn = document.createElement('button');
  tooltipBtn.className = 'translation-tooltip';
  tooltipBtn.style.display = 'none';
  tooltipBtn.innerHTML = 'ترجم (Translate)';
  document.body.appendChild(tooltipBtn);

  // Create popover
  const popover = document.createElement('div');
  popover.className = 'translation-popover';
  popover.style.display = 'none';
  popover.innerHTML = `
    <div class="translation-popover-header">
      <span>Arabic Translation</span>
      <button class="translation-popover-close" id="closeTranslationPopover">×</button>
    </div>
    <div class="translation-popover-content" id="translationResult">Loading...</div>
  `;
  document.body.appendChild(popover);

  let selectedText = '';

  document.addEventListener('mouseup', (e) => {
    // Ignore clicks on the tooltip/popover themselves
    if (popover.contains(e.target) || tooltipBtn.contains(e.target)) return;

    // ✅ CRITICAL FIX: never interfere with links, buttons, nav elements
    if (e.target.closest('a, button, nav, .nav, .mobile-menu')) {
      tooltipBtn.style.display = 'none';
      popover.style.display = 'none';
      return;
    }

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (text.length > 0 && text.length < 100) {
      selectedText = text;
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const scrollX = window.scrollX || document.documentElement.scrollLeft;

        tooltipBtn.style.top = `${scrollY + rect.top - 38}px`;
        tooltipBtn.style.left = `${scrollX + rect.left}px`;
        tooltipBtn.style.display = 'block';
      } catch(_) {
        tooltipBtn.style.display = 'none';
      }
    } else {
      selectedText = '';
      tooltipBtn.style.display = 'none';
      popover.style.display = 'none';
    }
  });

  // Close popover on click elsewhere — does NOT block navigation
  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && !tooltipBtn.contains(e.target)) {
      popover.style.display = 'none';
    }
  });

  // Hide tooltip when selection clears
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.toString().trim() === '') {
      tooltipBtn.style.display = 'none';
    }
  });

  document.getElementById('closeTranslationPopover').addEventListener('click', () => {
    popover.style.display = 'none';
  });

  tooltipBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    tooltipBtn.style.display = 'none';
    if (!selectedText) return;

    // Position popover below the selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const scrollX = window.scrollX || document.documentElement.scrollLeft;

      popover.style.top = `${scrollY + rect.bottom + 8}px`;
      popover.style.left = `${scrollX + rect.left}px`;
    }

    popover.style.display = 'block';
    document.getElementById('translationResult').innerHTML =
      '<span style="font-size:0.9rem;color:var(--text-muted);">Translating...</span>';

    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=it|ar`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.responseData && data.responseData.translatedText) {
        document.getElementById('translationResult').textContent = data.responseData.translatedText;
      } else {
        document.getElementById('translationResult').textContent = 'Translation failed.';
      }
    } catch (err) {
      console.error('Translator error:', err);
      document.getElementById('translationResult').textContent = 'Error fetching translation.';
    }
  });
}

// Scripts are at bottom of <body> so DOM is already parsed — run immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTranslator);
} else {
  initTranslator();
}
