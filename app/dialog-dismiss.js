(() => {
  let pressedOutside = null;
  function outside(event, dialog) {
    const r = dialog.getBoundingClientRect();
    return (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    );
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      const dialog = event.target;
      pressedOutside =
        event.button === 0 &&
        dialog instanceof HTMLDialogElement &&
        dialog.open &&
        outside(event, dialog)
          ? dialog
          : null;
    },
    true
  );
  document.addEventListener(
    'pointercancel',
    () => {
      pressedOutside = null;
    },
    true
  );
  document.addEventListener(
    'click',
    (event) => {
      const dialog = pressedOutside;
      pressedOutside = null;
      if (!dialog || event.target !== dialog || !dialog.open || !outside(event, dialog)) return;
      event.preventDefault();
      event.stopPropagation();
      // Use the same cancellation path as Escape, including import cleanup.
      if (typeof dialog.requestClose === 'function') dialog.requestClose();
      else if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    },
    true
  );
})();
