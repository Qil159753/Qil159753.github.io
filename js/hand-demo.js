// Main-page buttons ([data-hand-demo]) that open the MIONEX webcam hand demo. Nothing of the demo,
// three.js or MediaPipe loads until one is clicked.
for (const b of document.querySelectorAll('[data-hand-demo]')) {
  b.addEventListener('click', () => {
    b.disabled = true;
    import('./mionex-hand.js')
      .then((m) => m.openHandDialog())
      .catch((e) => console.warn('hand demo unavailable:', e))
      .finally(() => { b.disabled = false; });
  });
}
