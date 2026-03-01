import * as THREE from "three";

export class LightingSetup {
  private sunDirection = new THREE.Vector3(-30, 35, 40).normalize();

  setup(scene: THREE.Scene) {
    this.createGradientSky(scene);
    this.createSunMesh(scene);
    this.createClouds(scene);

    // Improved fog with warmer tone
    scene.fog = new THREE.FogExp2(0xc8d4e0, 0.0035);

    // Hemisphere light (sky + ground bounce)
    const hemi = new THREE.HemisphereLight(0x99bbdd, 0x886644, 0.9);
    scene.add(hemi);

    // Main sun light with higher quality shadows
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.8);
    sun.position.copy(this.sunDirection).multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // Fill light (cooler, from opposite side)
    const fill = new THREE.DirectionalLight(0x8899cc, 0.5);
    fill.position.set(30, 20, -30);
    scene.add(fill);

    // Rim light (subtle backlight for depth)
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.3);
    rim.position.set(-50, 15, -40);
    scene.add(rim);

    // === Point lights (warehouse interior) ===
    this.addPointLight(scene, 0xffddaa, 2.0, 40, -5, 6.5, 0);
    this.addPointLight(scene, 0xffddaa, 2.0, 40, 8, 6.5, 0);
    this.addPointLight(scene, 0xffeebb, 1.5, 30, 0, 6.5, -8);
    this.addPointLight(scene, 0xffeebb, 1.2, 25, -15, 6.5, 0);
    this.addPointLight(scene, 0xffeebb, 1.2, 25, 12, 6.5, 0);
    this.addPointLight(scene, 0xffeedd, 1.0, 20, 0, 6.5, 12);

    // === Office lights ===
    this.addPointLight(scene, 0xfff5dd, 1.5, 15, 26, 5.5, 5);
    this.addPointLight(scene, 0xfff8ee, 0.8, 10, 26, 4.5, 6);

    // === Container yard / outdoor ===
    this.addPointLight(scene, 0xddeeff, 1.0, 30, 35, 8, -15);

    // === Hunter spawn ===
    this.addPointLight(scene, 0xffccaa, 0.8, 18, -40, 3.5, 0);

    // === New areas ===
    // Storage alcove (dim warm light)
    this.addPointLight(scene, 0xffddaa, 0.6, 10, -16, 3.2, -14);
    // Loading bay
    this.addPointLight(scene, 0xffeebb, 1.0, 15, 28, 4.0, 0);
    // Dock shed
    this.addPointLight(scene, 0xffddaa, 0.5, 8, 43, 2.5, 34);
    // Break area
    this.addPointLight(scene, 0xfff0cc, 0.6, 12, -10, 3, 22);
    // Catwalk area
    this.addPointLight(scene, 0xddeeff, 0.4, 12, -20, 5.5, 0);
    // Dock warm light
    this.addPointLight(scene, 0xffeedd, 0.8, 20, 20, 5, 36);

    // === Spotlights for dramatic effect ===
    this.addSpotLight(scene, 0xffeecc, 1.5, 25, 0, 7.5, 15, 0, 0, 15, 0.6);
    this.addSpotLight(scene, 0xffeedd, 1.2, 20, 22, 7.5, 2, 22, 0, 2, 0.7);

    // Colored accent light at containers
    this.addPointLight(scene, 0xff8866, 0.4, 12, 38, 3, -12);
  }

  private createGradientSky(scene: THREE.Scene) {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#2a5da5");
    grad.addColorStop(0.1, "#4a7dba");
    grad.addColorStop(0.25, "#6a9dd0");
    grad.addColorStop(0.4, "#88b8e0");
    grad.addColorStop(0.55, "#a8cce8");
    grad.addColorStop(0.65, "#c0d8e8");
    grad.addColorStop(0.75, "#d8dde0");
    grad.addColorStop(0.83, "#e8ddd0");
    grad.addColorStop(0.90, "#f0d0a0");
    grad.addColorStop(0.96, "#e8b878");
    grad.addColorStop(1.0, "#d89050");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const skyGeo = new THREE.SphereGeometry(280, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
  }

  private createSunMesh(scene: THREE.Scene) {
    const sunPos = this.sunDirection.clone().multiplyScalar(200);

    // Outer glow (large, soft)
    const outerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(25, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.15, depthWrite: false })
    );
    outerGlow.position.copy(sunPos);
    scene.add(outerGlow);

    // Mid glow
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(18, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.3, depthWrite: false })
    );
    glow.position.copy(sunPos);
    scene.add(glow);

    // Core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffff0, transparent: true, opacity: 0.95 })
    );
    core.position.copy(sunPos);
    scene.add(core);

    // Outer ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(12, 35, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.position.copy(sunPos);
    ring.lookAt(0, 0, 0);
    scene.add(ring);
  }

  private createClouds(scene: THREE.Scene) {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide,
    });

    const cloudPositions = [
      [-80, 60, -40, 30, 6], [50, 55, -60, 25, 5], [120, 65, 20, 35, 7],
      [-40, 70, 80, 20, 4], [80, 58, 60, 28, 6], [-120, 62, -20, 22, 5],
      [0, 68, -90, 32, 7], [150, 60, -30, 26, 5],
    ];

    for (const [cx, cy, cz, w, h] of cloudPositions) {
      const cloudGeo = new THREE.PlaneGeometry(w, h);
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(cx, cy, cz);
      cloud.rotation.x = -Math.PI / 2;
      cloud.rotation.z = Math.random() * Math.PI;
      scene.add(cloud);

      // Secondary layer for volume
      const cloud2 = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.7, h * 0.8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide })
      );
      cloud2.position.set(cx + w * 0.1, cy - 1, cz + h * 0.1);
      cloud2.rotation.x = -Math.PI / 2;
      cloud2.rotation.z = Math.random() * Math.PI;
      scene.add(cloud2);
    }
  }

  private addPointLight(scene: THREE.Scene, color: number, intensity: number, distance: number, x: number, y: number, z: number) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, y, z);
    scene.add(light);
  }

  private addSpotLight(
    scene: THREE.Scene, color: number, intensity: number, distance: number,
    x: number, y: number, z: number,
    tx: number, ty: number, tz: number,
    angle: number
  ) {
    const spot = new THREE.SpotLight(color, intensity, distance, angle, 0.5, 1);
    spot.position.set(x, y, z);
    spot.target.position.set(tx, ty, tz);
    scene.add(spot);
    scene.add(spot.target);
  }
}
