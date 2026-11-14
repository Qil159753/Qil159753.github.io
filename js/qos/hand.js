// qOS window around the MIONEX webcam hand demo (js/mionex-hand.js), the same one the main page opens.
export async function mount(body) {
  const { mountHand } = await import('../mionex-hand.js');
  return mountHand(body, { compact: true });
}
