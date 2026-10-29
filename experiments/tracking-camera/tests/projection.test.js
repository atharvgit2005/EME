const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  FOCAL_DEFAULT,
  computeRotationMatrix,
  projectPoint,
  unprojectScreenPoint,
  projectRect,
  evaluateCameraAtTick,
  evaluateTrackingLock,
  computeAudioPan
} = require('../projection.js');

describe('Tracking & 3D Camera Projection Math Unit Tests', () => {

  test('Identity Camera - Canvas center maps to Viewport center', () => {
    const camera = {
      tilt_x: 0,
      tilt_y: 0,
      roll: 0,
      zoom: 1.0,
      aim: [960.0, 540.0]
    };
    const center = [960.0, 540.0];
    const projected = projectPoint(center, camera, { res_w: 1920.0, res_h: 1080.0, canvasH: 1080.0 });
    
    assert.ok(projected !== null);
    assert.ok(Math.abs(projected[0] - 960.0) < 1e-6, `Expected X ~ 960, got ${projected[0]}`);
    assert.ok(Math.abs(projected[1] - 540.0) < 1e-6, `Expected Y ~ 540, got ${projected[1]}`);
  });

  test('Identity Camera - Top-left and bottom-right corners with zoom=1', () => {
    const camera = {
      tilt_x: 0,
      tilt_y: 0,
      roll: 0,
      zoom: 1.0,
      aim: [960.0, 540.0]
    };
    const topLeft = [0.0, 0.0];
    const bottomRight = [1920.0, 1080.0];

    const pTL = projectPoint(topLeft, camera, { res_w: 1920.0, res_h: 1080.0 });
    const pBR = projectPoint(bottomRight, camera, { res_w: 1920.0, res_h: 1080.0 });

    assert.ok(Math.abs(pTL[0] - 0.0) < 1e-5, `TL X: ${pTL[0]}`);
    assert.ok(Math.abs(pTL[1] - 0.0) < 1e-5, `TL Y: ${pTL[1]}`);
    assert.ok(Math.abs(pBR[0] - 1920.0) < 1e-5, `BR X: ${pBR[0]}`);
    assert.ok(Math.abs(pBR[1] - 1080.0) < 1e-5, `BR Y: ${pBR[1]}`);
  });

  test('Zoom Doubling - Half extent from center', () => {
    const camera1 = { tilt_x: 0, tilt_y: 0, roll: 0, zoom: 1.0, aim: [960, 540] };
    const camera2 = { tilt_x: 0, tilt_y: 0, roll: 0, zoom: 2.0, aim: [960, 540] };

    const point = [1060.0, 540.0]; // +100px from center
    const p1 = projectPoint(point, camera1);
    const p2 = projectPoint(point, camera2);

    // Zoom=2 magnifies the distance from center by 2x
    const dist1 = p1[0] - 960.0;
    const dist2 = p2[0] - 960.0;
    assert.ok(Math.abs(dist2 - dist1 * 2.0) < 1e-5, `Expected 2x distance, got ${dist1} vs ${dist2}`);
  });

  test('Bidirectional Round-Trip Invertibility (project -> unproject within 1e-6)', () => {
    const camera = {
      tilt_x: 0.15,
      tilt_y: -0.25,
      roll: 0.05,
      zoom: 1.8,
      aim: [750.0, 480.0]
    };

    const originalPoints = [
      [500.0, 300.0],
      [960.0, 540.0],
      [1400.0, 800.0],
      [350.0, 620.0]
    ];

    for (const pt of originalPoints) {
      const projected = projectPoint(pt, camera);
      assert.ok(projected !== null, 'Projected point must not be null');

      const unprojected = unprojectScreenPoint(projected, camera);
      assert.ok(unprojected !== null, 'Unprojected point must not be null');

      const errX = Math.abs(unprojected[0] - pt[0]);
      const errY = Math.abs(unprojected[1] - pt[1]);

      assert.ok(errX < 1e-6, `Roundtrip X error: ${errX} for point (${pt[0]}, ${pt[1]})`);
      assert.ok(errY < 1e-6, `Roundtrip Y error: ${errY} for point (${pt[0]}, ${pt[1]})`);
    }
  });

  test('Rotation Order Non-Commutativity Test', () => {
    const pitch = 0.5;
    const yaw = 0.8;
    const roll = 0.3;

    const R = computeRotationMatrix(pitch, yaw, roll);

    // Alternative order: Rx * Ry * Rz (commutative comparison)
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cz = Math.cos(roll), sz = Math.sin(roll);
    const rx = [[1, 0, 0], [0, cx, sx], [0, -sx, cx]];
    const ry = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]];
    const rz = [[cz, sz, 0], [-sz, cz, 0], [0, 0, 1]];

    const matMulMat = (A, B) => {
      const res = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let c = 0; c < 3; c++) {
        res[c] = [
          A[0][0]*B[c][0] + A[1][0]*B[c][1] + A[2][0]*B[c][2],
          A[0][1]*B[c][0] + A[1][1]*B[c][1] + A[2][1]*B[c][2],
          A[0][2]*B[c][0] + A[1][2]*B[c][1] + A[2][2]*B[c][2]
        ];
      }
      return res;
    };

    const altR = matMulMat(rx, matMulMat(ry, rz));

    // Matrices must differ, proving non-commutativity
    let diffSum = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        diffSum += Math.abs(R[i][j] - altR[i][j]);
      }
    }
    assert.ok(diffSum > 0.1, `Rotation matrices must not commute, diffSum: ${diffSum}`);
  });

  test('Clipping - Point behind camera near plane returns null', () => {
    // Pitch tilt where points far above aim cross behind camera near plane (pz <= 0.05)
    const camera = {
      tilt_x: 1.2, // ~69 degrees pitch
      tilt_y: 0,
      roll: 0,
      zoom: 1.0,
      aim: [960, 540]
    };
    // For tilt_x = 1.2, ev[2] = sin(1.2) = 0.932. k = 1836.
    // At qy = -2000, ly = -2540 / 1836 = -1.383.
    // pz = 1.0 + 0.932 * (-1.383) = -0.289 <= 0.05 -> behind camera!
    const point = [960, -2000];
    const res = projectPoint(point, camera);
    assert.strictEqual(res, null, 'Points behind near plane must return null');
  });

  test('Invalid Input Validation - NaN and zero/negative zoom throw', () => {
    const validCam = { tilt_x: 0, tilt_y: 0, roll: 0, zoom: 1.0, aim: [960, 540] };
    
    assert.throws(() => projectPoint([NaN, 100], validCam), TypeError);
    assert.throws(() => projectPoint([100, 100], { ...validCam, zoom: 0 }), RangeError);
    assert.throws(() => projectPoint([100, 100], { ...validCam, zoom: -1.5 }), RangeError);
  });

  test('Projected Bounding Box - Computes 4 corners and valid bounds', () => {
    const camera = {
      tilt_x: 0.1,
      tilt_y: -0.15,
      roll: 0.02,
      zoom: 1.5,
      aim: [500, 400]
    };

    const rect = { x: 450, y: 350, width: 200, height: 80 };
    const projRect = projectRect(rect, camera);

    assert.ok(projRect !== null);
    assert.ok(projRect.width > 0, `Width must be positive, got ${projRect.width}`);
    assert.ok(projRect.height > 0, `Height must be positive, got ${projRect.height}`);
    assert.strictEqual(projRect.corners.length, 4);

    // Integer rounded bounds check (practical tolerance <= 1px)
    const roundedMinX = Math.round(projRect.x);
    const roundedMaxX = Math.round(projRect.x + projRect.width);
    assert.ok(roundedMaxX > roundedMinX);
  });

  test('Audio Panning - Formula p = 2x - 1', () => {
    assert.strictEqual(computeAudioPan(0.0), -1.0, 'Left edge must be -1.0');
    assert.strictEqual(computeAudioPan(0.5), 0.0, 'Center must be 0.0');
    assert.strictEqual(computeAudioPan(1.0), 1.0, 'Right edge must be +1.0');

    // Clamping outside bounds
    assert.strictEqual(computeAudioPan(-0.5), -1.0, 'Sub-zero must clamp to -1.0');
    assert.strictEqual(computeAudioPan(1.5), 1.0, 'Super-one must clamp to +1.0');
  });

  test('2-Frame Tracking Lock State Evaluation', () => {
    const lockAt = 10;
    const dur = 2;

    assert.deepStrictEqual(evaluateTrackingLock(8, lockAt, dur), { locked: false, locking: false, progress: 0.0 });
    assert.deepStrictEqual(evaluateTrackingLock(9, lockAt, dur), { locked: false, locking: false, progress: 0.0 });
    assert.deepStrictEqual(evaluateTrackingLock(10, lockAt, dur), { locked: false, locking: true, progress: 0.5 });
    assert.deepStrictEqual(evaluateTrackingLock(11, lockAt, dur), { locked: false, locking: true, progress: 1.0 });
    assert.deepStrictEqual(evaluateTrackingLock(12, lockAt, dur), { locked: true, locking: false, progress: 1.0 });
    assert.deepStrictEqual(evaluateTrackingLock(20, lockAt, dur), { locked: true, locking: false, progress: 1.0 });
  });

  test('Camera Keyframe Timeline Interpolation', () => {
    const kfs = [
      { offsetTick: 0, camera: { zoom: 1.0, tilt_x: 0.0 } },
      { offsetTick: 120000, camera: { zoom: 2.0, tilt_x: 0.4 } }
    ];

    const mid = evaluateCameraAtTick(kfs, 60000); // exactly halfway (0.5s)
    assert.ok(Math.abs(mid.zoom - 1.5) < 1e-5, `Expected zoom 1.5, got ${mid.zoom}`);
    assert.ok(Math.abs(mid.tilt_x - 0.2) < 1e-5, `Expected tilt_x 0.2, got ${mid.tilt_x}`);
  });
});
