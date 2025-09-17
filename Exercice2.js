AFRAME.registerComponent('player-controls', {
        schema: {
          maxSpeed: { type: 'number', default: 4 },    // m/s
          accel: { type: 'number', default: 12 },      // accel rate
          jumpSpeed: { type: 'number', default: 6 }    // impulsion du saut
        },
        init: function () {
          const THREE = AFRAME.THREE;
          this.THREE = THREE;
          this.velocity = new THREE.Vector3(0, 0, 0); // m/s
          this.keys = {};
          this.isGrounded = true;

          window.addEventListener('keydown', e => this.keys[e.code] = true);
          window.addEventListener('keyup', e => this.keys[e.code] = false);
        },
        tick: function (time, delta) {
          const dt = Math.max(0.001, delta / 1000); // secondes
          const el = this.el;
          const pos = el.object3D.position;
          const THREE = this.THREE;

          // INPUT
          let ix = 0, iz = 0;
        if (this.keys['KeyW']) iz -= 1;  
        if (this.keys['KeyS']) iz += 1;  

          if (this.keys['KeyD']) ix += 1;
          if (this.keys['KeyA']) ix -= 1;

          // direction selon la caméra
          const camEl = document.querySelector('[camera]');
          let desiredVelXZ = new THREE.Vector3(0,0,0);
          if (camEl) {
            const cam = camEl.object3D;
            const forward = new THREE.Vector3();
            cam.getWorldDirection(forward); // direction "regard" de la caméra
            forward.y = 0;
            forward.normalize();

            const up = new THREE.Vector3(0,1,0);
            const right = new THREE.Vector3();
            right.crossVectors(up, forward).normalize(); // vecteur droite caméra

            desiredVelXZ.add(forward.multiplyScalar(iz));
            desiredVelXZ.add(right.multiplyScalar(ix));
            if (desiredVelXZ.lengthSq() > 0) desiredVelXZ.normalize();
            desiredVelXZ.multiplyScalar(this.data.maxSpeed);
          } else {
            // fallback : mouvement selon axes monde
            desiredVelXZ.set(ix, 0, iz).normalize().multiplyScalar(this.data.maxSpeed);
          }

          // Appliquer accélération (lerp vers la vitesse désirée)
          const accelFactor = Math.min(1, this.data.accel * dt);
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, desiredVelXZ.x, accelFactor);
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, desiredVelXZ.z, accelFactor);

          // Saut (uniquement si au sol)
          if (this.keys['Space'] && this.isGrounded) {
            this.velocity.y = this.data.jumpSpeed;
            this.isGrounded = false;
          }

          // Gravité
          const GRAVITY = -20; // m/s^2 (ajuste si besoin)
          this.velocity.y += GRAVITY * dt;

          // Déplacer la position (intégration simple)
          const deltaPos = this.velocity.clone().multiplyScalar(dt);
          pos.add(deltaPos);

          // Collision sol très simple (sol y = 0.5 pour garder la boîte au-dessus)
          const groundY = 0.5;
          if (pos.y <= groundY) {
            pos.y = groundY;
            this.velocity.y = 0;
            this.isGrounded = true;
          }
        }
      });

      // ------- ROBLOX-LIKE CAMERA (3rd person, orbit sans clic, molette zoom) -------
      AFRAME.registerComponent('roblox-camera', {
        schema: {
          target: { type: 'selector' },
          distance: { type: 'number', default: 6 },
          minDistance: { type: 'number', default: 2 },
          maxDistance: { type: 'number', default: 12 },
          sensitivity: { type: 'number', default: 0.002 },
          pitchLimitDeg: { type: 'number', default: 80 },
          smooth: { type: 'number', default: 0.12 } // interpolation smoothing
        },
        init: function () {
          const THREE = AFRAME.THREE;
          this.THREE = THREE;
          this.targetYaw = 0;
          this.targetPitch = 0;
          this.currentYaw = 0;
          this.currentPitch = 0;
          this.currentDistance = this.data.distance;
          this.targetDistance = this.data.distance;

          // souris (déplacement sans clique)
          window.addEventListener('mousemove', e => {
            this.targetYaw -= e.movementX * this.data.sensitivity;
            this.targetPitch -= e.movementY * this.data.sensitivity;
            const limitRad = THREE.MathUtils.degToRad(this.data.pitchLimitDeg);
            this.targetPitch = Math.max(-limitRad, Math.min(limitRad, this.targetPitch));
          });

          // molette pour zoom
          window.addEventListener('wheel', e => {
            this.targetDistance += e.deltaY * 0.01;
            this.targetDistance = Math.max(this.data.minDistance, Math.min(this.data.maxDistance, this.targetDistance));
          });
        },
        tick: function (time, delta) {
          const THREE = this.THREE;
          const smooth = this.data.smooth;

          // trouver la cible (cube)
          const targetEl = this.data.target || document.querySelector('#player');
          if (!targetEl) return;
          const tPos = targetEl.object3D.position;

          // lisser yaw/pitch/distance
          this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, smooth);
          this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, smooth);
          this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.targetDistance, smooth);

          // conversion sphérique -> cartésiennes
          const r = this.currentDistance;
          const cosP = Math.cos(this.currentPitch);
          const offset = new THREE.Vector3(
            r * cosP * Math.sin(this.currentYaw),
            r * Math.sin(this.currentPitch),
            r * cosP * Math.cos(this.currentYaw)
          );

          // position désirée de la caméra = target + offset
          const desired = new THREE.Vector3().copy(tPos).add(offset);

          // empêche la caméra de passer sous le sol (sol y = 0)
          const minCamY = 0.5;
          if (desired.y < minCamY) desired.y = minCamY;

          // appliquer position lissée (lerp)
          const curPos = this.el.object3D.position;
          curPos.lerp(desired, 0.15);

          // regarder légèrement au-dessus du centre du cube (pour mieux voir)
          const lookAt = new THREE.Vector3(tPos.x, tPos.y + 0.8, tPos.z);
          this.el.object3D.lookAt(lookAt);
        }
      });