import { createStore } from '@stencil/store';

export enum Breakpoint {
  Mobile = 'mobile',
  Tablet = 'tablet',
  Desktop = 'desktop',
}

const getBreakpoint = (): Breakpoint => {
  const width = window.innerWidth;

  if (width <= 768) return Breakpoint.Mobile;
  if (width <= 1024) return Breakpoint.Tablet;

  return Breakpoint.Desktop;
};

export const screenStore = createStore({
  breakpoint: getBreakpoint(),
});

window.addEventListener('resize', () => {
  screenStore.state.breakpoint = getBreakpoint();
});
