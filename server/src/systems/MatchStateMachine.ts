import {
  GamePhase,
  PlayerRole,
  COUNTDOWN_DURATION,
  HIDE_PHASE_DURATION,
  ROUND_END_DURATION,
  MATCH_END_DURATION,
  ServerMessage,
} from "@catch-and-run/shared";
import type { GameRoom } from "../rooms/GameRoom";

export class MatchStateMachine {
  private room: GameRoom;
  private phaseTimer: number = 0;

  constructor(room: GameRoom) {
    this.room = room;
  }

  update(dt: number) {
    const state = this.room.state;
    if (state.phase === GamePhase.WAITING) return;

    this.phaseTimer -= dt / 1000;
    state.timer = Math.max(0, Math.ceil(this.phaseTimer));

    if (this.phaseTimer <= 0) {
      this.onPhaseEnd();
    }
  }

  startMatch() {
    const state = this.room.state;
    state.currentRound = 1;
    state.totalRounds = state.config.totalRounds;
    this.transitionTo(GamePhase.COUNTDOWN, COUNTDOWN_DURATION);
  }

  private onPhaseEnd() {
    const state = this.room.state;

    switch (state.phase) {
      case GamePhase.COUNTDOWN:
        this.room.initRound();
        this.transitionTo(GamePhase.HIDING, HIDE_PHASE_DURATION);
        break;

      case GamePhase.HIDING:
        this.transitionTo(GamePhase.ACTIVE, state.config.roundTime);
        break;

      case GamePhase.ACTIVE:
        this.endRound("props");
        break;

      case GamePhase.ROUND_END:
        if (state.currentRound < state.totalRounds) {
          state.currentRound++;
          this.room.initRound();
          this.transitionTo(GamePhase.HIDING, HIDE_PHASE_DURATION);
        } else {
          this.transitionTo(GamePhase.MATCH_END, MATCH_END_DURATION);
          this.room.broadcast(ServerMessage.MATCH_RESULTS, this.getMatchResults());
        }
        break;

      case GamePhase.MATCH_END:
        this.resetToWaiting();
        break;
    }
  }

  private transitionTo(phase: GamePhase, duration: number) {
    this.room.state.phase = phase;
    this.phaseTimer = duration;
    this.room.state.timer = Math.ceil(duration);
  }

  checkRoundEndCondition() {
    const state = this.room.state;
    if (state.phase !== GamePhase.ACTIVE && state.phase !== GamePhase.HIDING) return;

    let aliveProps = 0;
    let aliveHunters = 0;
    state.players.forEach((player) => {
      if (!player.isAlive) return;
      if (player.role === PlayerRole.PROP) aliveProps++;
      if (player.role === PlayerRole.HUNTER) aliveHunters++;
    });

    if (aliveProps === 0) {
      this.endRound("hunters");
    } else if (aliveHunters === 0) {
      this.endRound("props");
    }
  }

  private endRound(winner: "hunters" | "props") {
    const state = this.room.state;

    state.players.forEach((player) => {
      if (winner === "props" && player.role === PlayerRole.PROP && player.isAlive) {
        player.score += 150;
      }
      if (winner === "hunters" && player.role === PlayerRole.HUNTER) {
        player.score += 200;
      }
    });

    this.room.broadcast(ServerMessage.ROUND_RESULTS, {
      round: state.currentRound,
      winner,
      scores: this.getScores(),
    });

    this.transitionTo(GamePhase.ROUND_END, ROUND_END_DURATION);
  }

  private resetToWaiting() {
    const state = this.room.state;
    state.phase = GamePhase.WAITING;
    state.timer = 0;
    state.currentRound = 0;
    state.players.forEach((player) => {
      player.isReady = false;
      player.role = PlayerRole.PROP;
      player.isAlive = true;
      player.health = 100;
      player.score = 0;
      player.kills = 0;
      player.ammo = 0;
      player.currentPropId = "";
      player.isLocked = false;
    });
  }

  private getScores(): Array<{ sessionId: string; nickname: string; score: number; kills: number }> {
    const scores: Array<{ sessionId: string; nickname: string; score: number; kills: number }> = [];
    this.room.state.players.forEach((player, sessionId) => {
      scores.push({
        sessionId,
        nickname: player.nickname,
        score: player.score,
        kills: player.kills,
      });
    });
    return scores.sort((a, b) => b.score - a.score);
  }

  private getMatchResults() {
    return {
      scores: this.getScores(),
      totalRounds: this.room.state.totalRounds,
    };
  }
}
