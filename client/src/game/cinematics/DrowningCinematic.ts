import * as THREE from "three";

export interface DrowningCinematicState {
  elapsed: number;
  duration: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  target: THREE.Vector3;
}

export function sampleDrowningCinematic(
  state: DrowningCinematicState,
): {
  position: THREE.Vector3;
  target: THREE.Vector3;
  progress: number;
  completed: boolean;
} {
  const progress = Math.min(1, state.elapsed / state.duration);
  const eased = 1 - Math.pow(1 - progress, 3);
  const position = new THREE.Vector3().lerpVectors(
    state.start,
    state.end,
    eased,
  );
  position.y += Math.sin(progress * Math.PI) * 1.1;

  return {
    position,
    target: state.target.clone().add(new THREE.Vector3(0, 0.25, 0)),
    progress,
    completed: progress >= 1,
  };
}
