export type LobbyScreen = "mainMenu" | "roomLobby";

export interface LobbyPresentationActions {
  hideMinimap: () => void;
  hideHudButtons: () => void;
  hideTouchInput: () => void;
  exitPointerLock: () => void;
  disableScope: () => void;
  exitGrenadeMode: () => void;
  stopVoice: () => void;
  hasActiveMap: () => boolean;
  clearGameEntities: () => void;
  teardownMap: () => void;
  hasMenuBackground: () => boolean;
  setupMenuBackground: () => void;
  resetMenuCamera: () => void;
  showScreen: (screen: LobbyScreen) => void;
}

export function enterLobbyPresentation(
  actions: LobbyPresentationActions,
  screen: LobbyScreen,
) {
  actions.hideMinimap();
  actions.hideHudButtons();
  actions.hideTouchInput();
  actions.exitPointerLock();
  actions.disableScope();
  actions.exitGrenadeMode();
  actions.stopVoice();

  if (actions.hasActiveMap()) {
    actions.clearGameEntities();
    actions.teardownMap();
  }
  if (!actions.hasMenuBackground()) {
    actions.setupMenuBackground();
  }
  actions.resetMenuCamera();
  actions.showScreen(screen);
}
