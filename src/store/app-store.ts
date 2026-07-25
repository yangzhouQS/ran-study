import { defineStore } from 'pinia';

interface AppState {
  rootDir: string;
}

export const useAppStore = defineStore('appStore', {
  state: (): AppState => ({ rootDir: '' }),
  actions: {
    setRootDir(rootDir: string) {
      this.rootDir = rootDir;
    },
  },
});
