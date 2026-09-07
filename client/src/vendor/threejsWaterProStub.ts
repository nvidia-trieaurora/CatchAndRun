export const WaterSystem = {
  create(): Promise<never> {
    return Promise.reject(new Error(
      "Three.js Water Pro private artifact is not configured. Using Gerstner ocean.",
    ));
  },
};
