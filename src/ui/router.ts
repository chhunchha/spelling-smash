export type ScreenName = 'home' | 'play' | 'words';

export interface Screen {
  el: HTMLElement;
  destroy?: () => void;
}

export type Nav = (screen: ScreenName) => void;
