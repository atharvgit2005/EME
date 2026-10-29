"""
Timestamp-Aware Kalman Filter for 2D Bounding-Box Motion Prediction.
Adheres strictly to variable dt physics and explicit covariance growth.
"""

import numpy as np


class TimestampAwareKalmanBoxTracker:
    """
    Kalman Filter tracking [cx, cy, w, h, vx, vy]^T with variable dt.
    """

    def __init__(self, bbox, pts, initial_velocity=(0.0, 0.0)):
        """
        bbox: [x, y, w, h]
        pts: presentation timestamp in seconds
        """
        x, y, w, h = bbox
        cx = x + w / 2.0
        cy = y + h / 2.0
        vx, vy = initial_velocity

        # State vector: [cx, cy, w, h, vx, vy]^T
        self.x = np.array([cx, cy, w, h, vx, vy], dtype=np.float64)
        self.last_pts = float(pts)

        # State covariance P: high velocity variance initially to allow rapid adaptation
        self.P = np.diag([
            10.0, 10.0, 10.0, 10.0,     # Position and size variance
            10000.0, 10000.0            # Velocity variance (responsive to camera/object speed)
        ]).astype(np.float64)

        # Measurement matrix H (observes [cx, cy, w, h])
        self.H = np.zeros((4, 6), dtype=np.float64)
        self.H[0, 0] = 1.0
        self.H[1, 1] = 1.0
        self.H[2, 2] = 1.0
        self.H[3, 3] = 1.0

        # Measurement noise covariance R (precise detections from MobileSAM/saliency)
        self.R = np.diag([2.0, 2.0, 4.0, 4.0]).astype(np.float64)

        # Baseline acceleration spectral density for process noise Q
        self.q_pos = 50.0
        self.q_size = 10.0
        self.q_vel = 5000.0

        # Diagnostics & uncertainty tracking
        self.missed_observations = 0
        self.total_observations = 1
        self.prev_measurement = np.array([cx, cy, w, h], dtype=np.float64)
        self.prev_pts = float(pts)

    def predict(self, current_pts):
        """
        Advance state to current_pts with elapsed dt = current_pts - last_pts.
        """
        dt = float(current_pts - self.last_pts)
        if dt < 0:
            dt = 1.0 / 30.0  # Fallback monotonic safeguard
        elif dt == 0:
            dt = 1e-4

        # Transition matrix F
        F = np.eye(6, dtype=np.float64)
        F[0, 4] = dt
        F[1, 5] = dt

        # Process noise covariance Q(dt)
        Q = np.zeros((6, 6), dtype=np.float64)
        Q[0, 0] = self.q_pos * dt
        Q[1, 1] = self.q_pos * dt
        Q[2, 2] = self.q_size * dt
        Q[3, 3] = self.q_size * dt
        Q[4, 4] = self.q_vel * dt
        Q[5, 5] = self.q_vel * dt

        # Extrapolate state and covariance
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q
        self.last_pts = float(current_pts)

        # Return predicted bounding box [x, y, w, h]
        cx, cy, w, h = self.x[0], self.x[1], self.x[2], self.x[3]
        return [cx - w / 2.0, cy - h / 2.0, w, h]

    def update(self, bbox, pts=None):
        """
        Incorporate measured bounding box [x, y, w, h].
        """
        x, y, w, h = bbox
        cx = x + w / 2.0
        cy = y + h / 2.0
        z = np.array([cx, cy, w, h], dtype=np.float64)

        if pts is not None and self.total_observations == 1:
            dt = float(pts - self.prev_pts)
            if dt > 1e-4:
                self.x[4] = (cx - self.prev_measurement[0]) / dt
                self.x[5] = (cy - self.prev_measurement[1]) / dt

        # Innovation (residual) y = z - Hx
        y = z - (self.H @ self.x)

        # Innovation covariance S = H P H^T + R
        S = self.H @ self.P @ self.H.T + self.R

        # Kalman gain K = P H^T S^-1
        K = self.P @ self.H.T @ np.linalg.inv(S)

        # Updated state and covariance
        self.x = self.x + (K @ y)
        I = np.eye(6, dtype=np.float64)
        self.P = (I - K @ self.H) @ self.P

        self.missed_observations = 0
        self.total_observations += 1
        self.prev_measurement = z
        if pts is not None:
            self.prev_pts = float(pts)

    def get_state(self):
        """
        Returns [x, y, w, h], velocities [vx, vy], and positional uncertainty sigma.
        """
        cx, cy, w, h, vx, vy = self.x
        w = max(1.0, float(w))
        h = max(1.0, float(h))
        x = float(cx - w / 2.0)
        y = float(cy - h / 2.0)
        sigma_pos = float(np.sqrt(self.P[0, 0] + self.P[1, 1]))
        return [x, y, w, h], [float(vx), float(vy)], sigma_pos
