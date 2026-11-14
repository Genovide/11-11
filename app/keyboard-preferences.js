// Keep Tab from moving focus, including inside dialogs and dynamic menus.
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);
