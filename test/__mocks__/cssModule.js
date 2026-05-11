// Jest mock for CSS modules: export an object with the same keys as class names
// so component tests can assert className includes the key (e.g. "animating").
module.exports = new Proxy(
  {},
  {
    get(_, key) {
      return key;
    },
  }
);
