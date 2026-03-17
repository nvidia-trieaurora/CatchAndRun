import { PlayerRole } from "@catch-and-run/shared";

export class RoleAssigner {
  private previousHunters = new Set<string>();

  assignRoles(
    playerIds: string[],
    huntersPerPlayers: number
  ): Map<string, PlayerRole> {
    const roles = new Map<string, PlayerRole>();
    const count = playerIds.length;
    let numHunters: number;
    if (count <= 1) {
      numHunters = 1;
    } else if (count <= 3) {
      numHunters = 1;
    } else {
      numHunters = 3;
    }

    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

    const prioritized = shuffled.sort((a, b) => {
      const aWasHunter = this.previousHunters.has(a) ? 1 : 0;
      const bWasHunter = this.previousHunters.has(b) ? 1 : 0;
      return aWasHunter - bWasHunter;
    });

    this.previousHunters.clear();

    for (let i = 0; i < prioritized.length; i++) {
      if (i < numHunters) {
        roles.set(prioritized[i], PlayerRole.HUNTER);
        this.previousHunters.add(prioritized[i]);
      } else {
        roles.set(prioritized[i], PlayerRole.PROP);
      }
    }

    return roles;
  }
}
