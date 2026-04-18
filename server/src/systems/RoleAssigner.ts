import { PlayerRole } from "@catch-and-run/shared";

export class RoleAssigner {
  assignRoles(
    playerIds: string[],
    _huntersPerPlayers: number
  ): Map<string, PlayerRole> {
    const roles = new Map<string, PlayerRole>();
    const count = playerIds.length;
    let numHunters: number;
    if (count <= 1) {
      numHunters = 1;
    } else if (count <= 3) {
      numHunters = 1;
    } else if (count <= 5) {
      numHunters = 2;
    } else {
      numHunters = 3;
    }

    // Fisher-Yates shuffle for unbiased random assignment each round.
    // Every player has equal chance to be hunter or prop regardless of
    // previous round, ensuring fair role rolls per round.
    const shuffled = [...playerIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (let i = 0; i < shuffled.length; i++) {
      roles.set(shuffled[i], i < numHunters ? PlayerRole.HUNTER : PlayerRole.PROP);
    }

    return roles;
  }
}
