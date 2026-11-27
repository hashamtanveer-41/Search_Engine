// General views: the shapes lesson widgets are made of, with no lesson or course types in them, so
// any course (or any other screen) can show the same thing. Each takes plain data and ReactNode labels;
// a lesson widget is an adapter that turns its spec into a view's props. Every view has a fixture
// (`<view>.fixture.tsx`, component `derived/views/<view>`) with examples from outside any course.
export * from './frame';
export * from './stepper';
export * from './pane';
export * from './question';
export * from './code-listing';
export * from './view-lock';
