import * as THREE from 'three';

/**
 * Lightweight 3D Rigid-Body Impulse & Gravity Physics Engine for LEGO Bricks
 */
export class PhysicsEngine {
  constructor(soundEngine) {
    this.soundEngine = soundEngine;
    this.activeBodies = [];
    this.isSimulating = false;
    this.isReassembling = false;
    this.reassembleProgress = 0;
    this.gravity = -38.0;
  }

  /**
   * Detonate the entire visible LEGO build from its center of mass
   */
  explodeAll(brickMeshes) {
    if (!brickMeshes || brickMeshes.length === 0) return;
    this.isReassembling = false;
    this.isSimulating = true;
    this.activeBodies = [];

    // Compute center of mass
    const center = new THREE.Vector3();
    let count = 0;
    for (const mesh of brickMeshes) {
      if (!mesh.visible) continue;
      center.add(mesh.position);
      count++;
    }
    if (count > 0) center.divideScalar(count);
    center.y = Math.max(0.5, center.y * 0.4);

    for (const mesh of brickMeshes) {
      if (!mesh.visible) continue;
      const dir = new THREE.Vector3().subVectors(mesh.position, center);
      if (dir.lengthSq() < 0.01) {
        dir.set(Math.random() - 0.5, 0.6, Math.random() - 0.5);
      }
      dir.normalize();

      const speed = 10 + Math.random() * 18;
      const velocity = new THREE.Vector3(
        dir.x * speed + (Math.random() - 0.5) * 6,
        Math.abs(dir.y) * speed * 0.85 + 8 + Math.random() * 12,
        dir.z * speed + (Math.random() - 0.5) * 6
      );

      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );

      this.activeBodies.push({
        mesh,
        velocity,
        angularVelocity,
        bounces: 0,
        settled: false,
        startPos: mesh.position.clone(),
        startQuat: mesh.quaternion.clone()
      });
    }

    if (this.soundEngine) {
      this.soundEngine.playExplosion();
    }
  }

  /**
   * Localized kinetic smash around an impact point (Wrecking Ball / Smash click mode)
   */
  smashAtPoint(impactPoint, brickMeshes, radius = 6.5) {
    this.isReassembling = false;
    this.isSimulating = true;

    const existingSet = new Set(this.activeBodies.map(b => b.mesh));
    let hitCount = 0;

    for (const mesh of brickMeshes) {
      if (!mesh.visible) continue;
      const dist = mesh.position.distanceTo(impactPoint);
      if (dist <= radius) {
        hitCount++;
        const factor = Math.max(0.2, 1 - dist / radius);
        const dir = new THREE.Vector3().subVectors(mesh.position, impactPoint).normalize();
        const velocity = new THREE.Vector3(
          dir.x * 16 * factor + (Math.random() - 0.5) * 5,
          6 + 12 * factor + Math.random() * 5,
          dir.z * 16 * factor + (Math.random() - 0.5) * 5
        );
        const angularVelocity = new THREE.Vector3(
          (Math.random() - 0.5) * 15 * factor,
          (Math.random() - 0.5) * 15 * factor,
          (Math.random() - 0.5) * 15 * factor
        );

        if (existingSet.has(mesh)) {
          const body = this.activeBodies.find(b => b.mesh === mesh);
          body.velocity.add(velocity);
          body.angularVelocity.add(angularVelocity);
          body.settled = false;
        } else {
          this.activeBodies.push({
            mesh,
            velocity,
            angularVelocity,
            bounces: 0,
            settled: false,
            startPos: mesh.position.clone(),
            startQuat: mesh.quaternion.clone()
          });
        }
      }
    }

    if (hitCount > 0 && this.soundEngine) {
      this.soundEngine.playExplosion();
    }
    return hitCount;
  }

  /**
   * Smoothly time-reverse all scattered bricks back into their snapped LEGO positions
   */
  startReassemble() {
    if (this.activeBodies.length === 0) return;
    this.isReassembling = true;
    this.reassembleProgress = 0;
    for (const body of this.activeBodies) {
      body.startPos = body.mesh.position.clone();
      body.startQuat = body.mesh.quaternion.clone();
    }
  }

  clear() {
    this.activeBodies = [];
    this.isSimulating = false;
    this.isReassembling = false;
  }

  update(dt, onReassembleComplete) {
    if (!this.isSimulating) return;
    const clampedDt = Math.min(dt, 0.05);

    if (this.isReassembling) {
      this.reassembleProgress += clampedDt * 1.85;
      const t = Math.min(1.0, this.reassembleProgress);
      // Cubic ease-in-out
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const targetQuat = new THREE.Quaternion();
      for (const body of this.activeBodies) {
        const targetPos = body.mesh.userData.targetPosition;
        body.mesh.position.lerpVectors(body.startPos, targetPos, ease);
        body.mesh.quaternion.slerpQuaternions(body.startQuat, targetQuat, ease);
      }

      if (t >= 1.0) {
        this.clear();
        if (this.soundEngine) this.soundEngine.playBrickSnap(1.0, 1.1);
        if (onReassembleComplete) onReassembleComplete();
      }
      return;
    }

    // Forward physics simulation step
    for (const body of this.activeBodies) {
      if (body.settled) continue;

      body.velocity.y += this.gravity * clampedDt;
      body.mesh.position.addScaledVector(body.velocity, clampedDt);

      // Apply angular velocity
      body.mesh.rotation.x += body.angularVelocity.x * clampedDt;
      body.mesh.rotation.y += body.angularVelocity.y * clampedDt;
      body.mesh.rotation.z += body.angularVelocity.z * clampedDt;

      // Baseplate collision (y = 0)
      if (body.mesh.position.y <= 0.15) {
        body.mesh.position.y = 0.15;
        if (Math.abs(body.velocity.y) > 2.2) {
          body.velocity.y = -body.velocity.y * 0.42;
          body.velocity.x *= 0.78;
          body.velocity.z *= 0.78;
          body.angularVelocity.multiplyScalar(0.65);
          body.bounces++;
          if (body.bounces <= 2 && Math.random() < 0.25 && this.soundEngine) {
            this.soundEngine.playBrickSnap(0.3, 0.85 + Math.random() * 0.4);
          }
        } else {
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.mesh.rotation.x = Math.round(body.mesh.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
          body.mesh.rotation.z = Math.round(body.mesh.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
          body.settled = true;
        }
      }
    }
  }
}
