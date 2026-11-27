// jsdom has no ResizeObserver; Radix's popper (tooltips, menus) needs one to exist.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;
