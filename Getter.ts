export const isMobile = () =>
  screenStore.state.breakpoint === Breakpoint.Mobile;

export const isTablet = () =>
  screenStore.state.breakpoint === Breakpoint.Tablet;

export const isDesktop = () =>
  screenStore.state.breakpoint === Breakpoint.Desktop;
