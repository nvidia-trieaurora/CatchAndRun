import { GameManager } from "./game/GameManager";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const _game = new GameManager(canvas);
