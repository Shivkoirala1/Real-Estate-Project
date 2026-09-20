// Tiny event bus for opening the global contact modal from anywhere
// (floating button, footer, support card, CTAs) without prop drilling or a
// new global context. ContactModalHost subscribes; everyone else dispatches.

export const OPEN_CONTACT_MODAL_EVENT = 'open-contact-modal';

export const openContactModal = () => {
  window.dispatchEvent(new CustomEvent(OPEN_CONTACT_MODAL_EVENT));
};
