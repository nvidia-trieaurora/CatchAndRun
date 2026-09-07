import { describe, expect, it, vi } from "vitest";
import {
  enterLobbyPresentation,
  type LobbyPresentationActions,
} from "../src/game/lifecycle/LobbyPresentation";

function createActions(mapBuilt: boolean, hasMenuBackground = false) {
  const actions: LobbyPresentationActions = {
    hideMinimap: vi.fn(),
    hideHudButtons: vi.fn(),
    hideTouchInput: vi.fn(),
    exitPointerLock: vi.fn(),
    disableScope: vi.fn(),
    exitGrenadeMode: vi.fn(),
    stopVoice: vi.fn(),
    hasActiveMap: () => mapBuilt,
    clearGameEntities: vi.fn(),
    teardownMap: vi.fn(),
    hasMenuBackground: () => hasMenuBackground,
    setupMenuBackground: vi.fn(),
    resetMenuCamera: vi.fn(),
    showScreen: vi.fn(),
  };
  return actions;
}

describe("GameManager lobby presentation", () => {
  it("removes gameplay presentation before showing the room lobby", () => {
    const actions = createActions(true);

    enterLobbyPresentation(actions, "roomLobby");

    expect(actions.hideMinimap).toHaveBeenCalledOnce();
    expect(actions.hideHudButtons).toHaveBeenCalledOnce();
    expect(actions.hideTouchInput).toHaveBeenCalledOnce();
    expect(actions.exitPointerLock).toHaveBeenCalledOnce();
    expect(actions.clearGameEntities).toHaveBeenCalledOnce();
    expect(actions.teardownMap).toHaveBeenCalledOnce();
    expect(actions.setupMenuBackground).toHaveBeenCalledOnce();
    expect(actions.resetMenuCamera).toHaveBeenCalledOnce();
    expect(actions.showScreen).toHaveBeenCalledWith("roomLobby");
  });

  it("is idempotent during waiting-to-countdown lobby transitions", () => {
    const actions = createActions(false, true);

    enterLobbyPresentation(actions, "roomLobby");

    expect(actions.clearGameEntities).not.toHaveBeenCalled();
    expect(actions.teardownMap).not.toHaveBeenCalled();
    expect(actions.setupMenuBackground).not.toHaveBeenCalled();
    expect(actions.showScreen).toHaveBeenCalledWith("roomLobby");
  });
});
