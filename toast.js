// toast.js
export function showMessage(elementId, message, type = 'info') {
  const el = document.getElementById(elementId);
  if (el) {
    const icon = type === 'success' ? '' : type === 'error' ? '' : '️';
    el.innerHTML = `<div class="info-box ${type}" role="status">${icon} ${message}</div>`;
  }
}

/*
ENHANCED showToast:
- Preserves original API showToast(title, message, type)
- Adds swipe-to-dismiss (pointer-based) in any direction
- Keeps automatic timeout removal
- Returns the created toast element and stores the auto-remove timeout id on dataset
*/
export function showToast(title, message, type='info') {
  const container = document.getElementById('toastContainer');
  if (!container) return null;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('data-toast-title', title);
  toast.style.transition = 'transform 200ms ease, opacity 200ms ease';
  toast.style.willChange = 'transform, opacity';
  toast.innerHTML = `<strong>${title}</strong><div class="tiny" style="color:#ddd">${message}</div>`;
  container.appendChild(toast);

  let autoRemoveTimeout = setTimeout(()=> {
    try {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px) scale(0.98)';
    } catch(e){}
    setTimeout(()=> {
      try { toast.remove(); } catch(e){}
    }, 220);
  }, 4500);

  try { toast.dataset.toastTimeout = String(autoRemoveTimeout); } catch (e) {}

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const THRESHOLD = 80;

  function onPointerDown(e) {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastX = startX;
    lastY = startY;
    dragging = true;
    try { toast.setPointerCapture(pointerId); } catch(e){}
    clearTimeout(autoRemoveTimeout);
    toast.style.transition = '';
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    lastX = e.clientX;
    lastY = e.clientY;
    toast.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.03}deg)`;
    toast.style.opacity = `${Math.max(0.25, 1 - (Math.abs(dx) + Math.abs(dy)) / 300)}`;
  }

  function finalizeDismiss(shouldDismiss) {
    dragging = false;
    try { toast.releasePointerCapture(pointerId); } catch(e){}
    pointerId = null;
    if (shouldDismiss) {
      const dx = lastX - startX;
      const dy = lastY - startY;
      const dirX = dx === 0 ? 0 : dx / Math.abs(dx);
      const dirY = dy === 0 ? 0 : dy / Math.abs(dy);
      toast.style.transition = 'transform 200ms ease, opacity 200ms ease';
      toast.style.transform = `translate(${dirX * 400}px, ${dirY * 400}px) rotate(${dirX * 10}deg)`;
      toast.style.opacity = '0';
      try { clearTimeout(Number(toast.dataset.toastTimeout)); } catch (e){}
      setTimeout(()=> {
        try { toast.remove(); } catch(e){}
      }, 220);
      return;
    }
    toast.style.transition = 'transform 200ms ease, opacity 200ms ease';
    toast.style.transform = 'translate(0px, 0px) rotate(0deg)';
    toast.style.opacity = '1';
    autoRemoveTimeout = setTimeout(()=> {
      try {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px) scale(0.98)';
      } catch(e){}
      setTimeout(()=> { try { toast.remove(); } catch(e){} }, 220);
    }, 3000);
    try { toast.dataset.toastTimeout = String(autoRemoveTimeout); } catch (e) {}
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const totalDx = e.clientX - startX;
    const totalDy = e.clientY - startY;
    const distance = Math.sqrt(totalDx*totalDx + totalDy*totalDy);
    if (Math.abs(totalDx) > THRESHOLD || Math.abs(totalDy) > THRESHOLD || distance > THRESHOLD) {
      finalizeDismiss(true);
    } else {
      finalizeDismiss(false);
    }
  }

  toast.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  toast.addEventListener('click', () => {
    try { clearTimeout(Number(toast.dataset.toastTimeout)); } catch (e) {}
    toast.style.transition = 'opacity 150ms ease, transform 150ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px) scale(0.98)';
    setTimeout(()=> { try { toast.remove(); } catch(e){} }, 160);
  });

  return toast;
}

export function dismissToastByTitle(title) {
  try {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach(t => {
      try {
        if (String(t.getAttribute('data-toast-title')) === String(title)) {
          const tid = t.dataset.toastTimeout;
          if (tid) clearTimeout(Number(tid));
          t.style.transition = 'opacity 180ms ease, transform 180ms ease';
          t.style.opacity = '0';
          t.style.transform = 'translateY(-10px) scale(0.98)';
          setTimeout(()=> { try { t.remove(); } catch(e){} }, 200);
        }
      } catch (e) {
        console.warn('dismissToastByTitle inner error', e);
      }
    });
  } catch (err) {
    console.warn('dismissToastByTitle failed', err);
  }
}