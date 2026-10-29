/**
 * EME Tracking & 3D Camera Projection Module (Pure Mathematics)
 * 
 * Reusable, zero-dependency mathematical extraction of the ray-to-plane 3D camera
 * projection and coordinate tracking model from mrsarac/ff-tracking.
 * 
 * Coordinate System & Conventions:
 * - Canvas space: Flat source canvas, origin (0, 0) at top-left, dimensions (W, H).
 * - Camera space: 3D right-handed Cartesian space:
 *     +X: right
 *     +Y: down (matching standard screen-space raster coordinates)
 *     +Z: forward (away from camera towards plane, plane centered at Z = 1.0)
 * - Camera angles (Euler angles in radians):
 *     tilt_x (pitch): rotation around X-axis (+tips top of screen away)
 *     tilt_y (yaw):   rotation around Y-axis (+turns right side away)
 *     roll:           rotation around Z-axis (+clockwise roll)
 * - Rotation matrix order: Column-major R = Rz(roll) * Ry(tilt_y) * Rx(tilt_x)
 * - Screen space: Lens output viewport, origin (0, 0) at top-left, dimensions (res_w, res_h).
 */

const FOCAL_DEFAULT = 1.7;
const CANVAS_W_DEFAULT = 1920.0;
const CANVAS_H_DEFAULT = 1080.0;
const NEAR_PLANE_Z = 0.05;

/**
 * Multiply 3x3 matrix by 3D vector.
 * cols is array of 3 column vectors: cols[0] = col0, cols[1] = col1, cols[2] = col2.
 */
function matMulVec(cols, v) {
  return [
    cols[0][0] * v[0] + cols[1][0] * v[1] + cols[2][0] * v[2],
    cols[0][1] * v[0] + cols[1][1] * v[1] + cols[2][1] * v[2],
    cols[0][2] * v[0] + cols[1][2] * v[1] + cols[2][2] * v[2]
  ];
}

/**
 * 3x3 Matrix multiplication: A * B
 */
function matMulMat(A, B) {
  const result = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let c = 0; c < 3; c++) {
    result[c] = matMulVec(A, B[c]);
  }
  return result;
}

/**
 * Compute the 3x3 rotation matrix for given Euler angles.
 * Rotation order: R = Rz(roll) * Ry(tilt_y) * Rx(tilt_x)
 * Matches rotate() in hud/src/lib.rs and rotation() in lens.sksl.
 */
function computeRotationMatrix(tilt_x = 0, tilt_y = 0, roll = 0) {
  const cx = Math.cos(tilt_x), sx = Math.sin(tilt_x);
  const cy = Math.cos(tilt_y), sy = Math.sin(tilt_y);
  const cz = Math.cos(roll), sz = Math.sin(roll);

  // Column vectors for Rx, Ry, Rz
  const rx = [[1, 0, 0], [0, cx, sx], [0, -sx, cx]];
  const ry = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]];
  const rz = [[cz, sz, 0], [-sz, cz, 0], [0, 0, 1]];

  // R = Rz * (Ry * Rx)
  return matMulMat(rz, matMulMat(ry, rx));
}

/**
 * Project a 2D point from flat canvas coordinates to 2D screen viewport coordinates.
 * 
 * @param {Object|Array} point Canvas point { x, y } or [x, y]
 * @param {Object} camera Camera parameters { tilt_x, tilt_y, roll, zoom, aim: [x, y] }
 * @param {Object} options Configuration { focal, canvasH, res_w, res_h }
 * @returns {Array|null} Screen coordinate [x, y] or null if behind camera near plane.
 */
function projectPoint(point, camera, options = {}) {
  const qx = Array.isArray(point) ? point[0] : point.x;
  const qy = Array.isArray(point) ? point[1] : point.y;

  if (isNaN(qx) || isNaN(qy)) {
    throw new TypeError(`Invalid point coordinates: (${qx}, ${qy})`);
  }

  const focal = options.focal !== undefined ? options.focal : FOCAL_DEFAULT;
  const canvasH = options.canvasH !== undefined ? options.canvasH : CANVAS_H_DEFAULT;
  const resW = options.res_w !== undefined ? options.res_w : 1920.0;
  const resH = options.res_h !== undefined ? options.res_h : 1080.0;

  const zoom = (camera && camera.zoom !== undefined) ? camera.zoom : 1.0;
  if (zoom <= 0) {
    throw new RangeError(`Camera zoom must be positive, got ${zoom}`);
  }

  const aimX = (camera && camera.aim) ? (Array.isArray(camera.aim) ? camera.aim[0] : camera.aim.x) : canvasH * 0.5 * (resW / resH);
  const aimY = (camera && camera.aim) ? (Array.isArray(camera.aim) ? camera.aim[1] : camera.aim.y) : canvasH * 0.5;

  const tilt_x = (camera && camera.tilt_x) || 0;
  const tilt_y = (camera && camera.tilt_y) || 0;
  const roll = (camera && camera.roll) || 0;

  const k = focal * canvasH / zoom;
  const lx = (qx - aimX) / k;
  const ly = (qy - aimY) / k;

  const R = computeRotationMatrix(tilt_x, tilt_y, roll);
  const eu = matMulVec(R, [1.0, 0.0, 0.0]);
  const ev = matMulVec(R, [0.0, 1.0, 0.0]);

  // Point in 3D camera space: center p0 is (0, 0, 1)
  const px3 = eu[0] * lx + ev[0] * ly;
  const py3 = eu[1] * lx + ev[1] * ly;
  const pz3 = 1.0 + eu[2] * lx + ev[2] * ly;

  // Near clipping plane check
  if (pz3 <= NEAR_PLANE_Z) {
    return null;
  }

  // Perspective divide
  const sx = focal * px3 / pz3;
  const sy = focal * py3 / pz3;

  return [
    sx * resH + 0.5 * resW,
    sy * resH + 0.5 * resH
  ];
}

/**
 * Inverse project a screen point [px_x, px_y] back to flat canvas space [qx, qy].
 * Implements the ray-to-plane intersection from lens.sksl.
 */
function unprojectScreenPoint(screenPoint, camera, options = {}) {
  const pxX = Array.isArray(screenPoint) ? screenPoint[0] : screenPoint.x;
  const pxY = Array.isArray(screenPoint) ? screenPoint[1] : screenPoint.y;

  const focal = options.focal !== undefined ? options.focal : FOCAL_DEFAULT;
  const canvasH = options.canvasH !== undefined ? options.canvasH : CANVAS_H_DEFAULT;
  const resW = options.res_w !== undefined ? options.res_w : 1920.0;
  const resH = options.res_h !== undefined ? options.res_h : 1080.0;

  const zoom = (camera && camera.zoom !== undefined) ? camera.zoom : 1.0;
  const aimX = (camera && camera.aim) ? (Array.isArray(camera.aim) ? camera.aim[0] : camera.aim.x) : canvasH * 0.5 * (resW / resH);
  const aimY = (camera && camera.aim) ? (Array.isArray(camera.aim) ? camera.aim[1] : camera.aim.y) : canvasH * 0.5;

  const tilt_x = (camera && camera.tilt_x) || 0;
  const tilt_y = (camera && camera.tilt_y) || 0;
  const roll = (camera && camera.roll) || 0;

  // Normalized ray direction in camera space
  const sX = (pxX - 0.5 * resW) / resH;
  const sY = (pxY - 0.5 * resH) / resH;
  const d = [sX, sY, focal];

  const R = computeRotationMatrix(tilt_x, tilt_y, roll);
  const eu = matMulVec(R, [1.0, 0.0, 0.0]);
  const ev = matMulVec(R, [0.0, 1.0, 0.0]);
  const n = matMulVec(R, [0.0, 0.0, 1.0]);
  const p0 = [0.0, 0.0, 1.0];

  const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  if (dn <= 0.0001) {
    return null; // Ray parallel or away from plane
  }

  const p0DotN = p0[0] * n[0] + p0[1] * n[1] + p0[2] * n[2];
  const hitDist = p0DotN / dn;
  const hit3 = [d[0] * hitDist, d[1] * hitDist, d[2] * hitDist];

  const diff = [hit3[0] - p0[0], hit3[1] - p0[1], hit3[2] - p0[2]];
  const localX = diff[0] * eu[0] + diff[1] * eu[1] + diff[2] * eu[2];
  const localY = diff[0] * ev[0] + diff[1] * ev[1] + diff[2] * ev[2];

  const K = focal * canvasH / zoom;
  return [
    aimX + localX * K,
    aimY + localY * K
  ];
}

/**
 * Project a 2D axis-aligned bounding box from canvas space to screen space.
 * Projects all 4 corners and computes the axis-aligned screen-space bounding box.
 * 
 * @param {Object} rect { x, y, width, height }
 * @param {Object} camera Camera parameters
 * @param {Object} options Configuration
 * @returns {Object|null} Projected rectangle { x, y, width, height, corners } or null if clipped.
 */
function projectRect(rect, camera, options = {}) {
  const { x, y, width, height } = rect;

  const c1 = projectPoint([x, y], camera, options);
  const c2 = projectPoint([x + width, y], camera, options);
  const c3 = projectPoint([x + width, y + height], camera, options);
  const c4 = projectPoint([x, y + height], camera, options);

  // If all corners are behind camera, completely clipped
  if (!c1 && !c2 && !c3 && !c4) {
    return null;
  }

  const validCorners = [c1, c2, c3, c4].filter(c => c !== null);
  if (validCorners.length === 0) return null;

  const xs = validCorners.map(c => c[0]);
  const ys = validCorners.map(c => c[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    corners: [c1, c2, c3, c4]
  };
}

/**
 * Evaluate camera properties at a specific timeline tick with linear/easing interpolation.
 */
function evaluateCameraAtTick(cameraKeyframes, tick) {
  if (!Array.isArray(cameraKeyframes) || cameraKeyframes.length === 0) {
    return {
      tilt_x: 0,
      tilt_y: 0,
      roll: 0,
      zoom: 1.0,
      aim: [960.0, 540.0],
      blur: 1.0
    };
  }

  const sorted = [...cameraKeyframes].sort((a, b) => a.offsetTick - b.offsetTick);

  if (tick <= sorted[0].offsetTick) return sorted[0].camera;
  if (tick >= sorted[sorted.length - 1].offsetTick) return sorted[sorted.length - 1].camera;

  // Find surrounding keyframes
  let idx = 0;
  while (idx < sorted.length - 1 && sorted[idx + 1].offsetTick <= tick) {
    idx++;
  }

  const kfA = sorted[idx];
  const kfB = sorted[idx + 1];
  const progress = (tick - kfA.offsetTick) / (kfB.offsetTick - kfA.offsetTick);

  const lerp = (a, b, t) => a + (b - a) * t;

  return {
    tilt_x: lerp(kfA.camera.tilt_x || 0, kfB.camera.tilt_x || 0, progress),
    tilt_y: lerp(kfA.camera.tilt_y || 0, kfB.camera.tilt_y || 0, progress),
    roll: lerp(kfA.camera.roll || 0, kfB.camera.roll || 0, progress),
    zoom: lerp(kfA.camera.zoom || 1.0, kfB.camera.zoom || 1.0, progress),
    aim: [
      lerp(kfA.camera.aim ? kfA.camera.aim[0] : 960, kfB.camera.aim ? kfB.camera.aim[0] : 960, progress),
      lerp(kfA.camera.aim ? kfA.camera.aim[1] : 540, kfB.camera.aim ? kfB.camera.aim[1] : 540, progress)
    ],
    blur: lerp(kfA.camera.blur !== undefined ? kfA.camera.blur : 1.0, kfB.camera.blur !== undefined ? kfB.camera.blur : 1.0, progress)
  };
}

/**
 * Evaluate the tracking lock state for an active target.
 * Returns lock state: 'idle', 'locking' (2-frame acquire), 'locked'.
 */
function evaluateTrackingLock(currentFrame, lockAtFrame, lockDurationFrames = 2) {
  if (currentFrame < lockAtFrame) {
    return { locked: false, locking: false, progress: 0.0 };
  }
  const elapsed = currentFrame - lockAtFrame;
  if (elapsed < lockDurationFrames) {
    return {
      locked: false,
      locking: true,
      progress: (elapsed + 1) / lockDurationFrames
    };
  }
  return { locked: true, locking: false, progress: 1.0 };
}

/**
 * Compute stereo audio pan from normalized horizontal screen coordinate x in [0, 1].
 * Formula: p = 2x - 1 (yielding -1.0 for Left, 0.0 for Center, +1.0 for Right).
 */
function computeAudioPan(normalizedX) {
  const clampedX = Math.max(0.0, Math.min(1.0, normalizedX));
  return 2.0 * clampedX - 1.0;
}

module.exports = {
  FOCAL_DEFAULT,
  CANVAS_W_DEFAULT,
  CANVAS_H_DEFAULT,
  NEAR_PLANE_Z,
  computeRotationMatrix,
  projectPoint,
  unprojectScreenPoint,
  projectRect,
  evaluateCameraAtTick,
  evaluateTrackingLock,
  computeAudioPan
};
