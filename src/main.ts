import './style.css';
import { stopSpeaking } from './engine/speech';
import { homeScreen } from './ui/home';
import { playScreen } from './ui/play';
import type { Nav, Screen, ScreenName } from './ui/router';
import { wordsScreen } from './ui/words';

const root = document.getElementById('app') as HTMLElement;
let current: Screen | null = null;

const screens: Record<ScreenName, (nav: Nav) => Screen> = {
  home: homeScreen,
  play: playScreen,
  words: wordsScreen,
};

const nav: Nav = (name) => {
  current?.destroy?.();
  stopSpeaking();
  current = screens[name](nav);
  root.replaceChildren(current.el);
  window.scrollTo(0, 0);
};

nav('home');
