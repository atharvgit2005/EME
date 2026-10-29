# Milestone CG-01: Color Pipeline Contract & Mathematical Specification

**Version**: 1.0.0  
**Schema Identifier**: `https://eme.local/schemas/eme-color-grade.v1.schema.json`  
**Milestone**: CG-01 / Phase 17  
**Status**: ACTIVE CONTRACT  

---

## 1. Execution Graph Topology

The canonical color grading pipeline executes as a strictly ordered, non-destructive directed acyclic graph:

```
[ Input RGB (Rec.709) ]
         │
         ▼
[ 1. Linearization (Rec.709 EOTF) ]
         │
         ▼
[ 2. Linear-Light Exposure (EV) & White Balance (Temp/Tint) ]
         │
         ▼
[ 3. Re-Encoding (Rec.709 OETF) ]
         │
         ▼
[ 4. Primary Correction (Lift / Gamma / Gain / Offset) ]
         │
         ▼
[ 5. Cubic Bézier Curves (RGB, Master, Luma) ]
         │
         ▼
[ 6. 8-Channel Selective HSL Adjustments ]
         │
         ▼
[ 7. Vectorscope Skin-Tone Protection Blend ]
         │
         ▼
[ 8. 3D LUT Tetrahedral Evaluation & Intensity Blend ]
         │
         ▼
[ 9. Gamut Clamping [0.0, 1.0] & Output Encoding ]
```

---

## 2. Mathematical Formulations

### Stage 1: Linear-Light Exposure & White Balance

Let $C \in \{R, G, B\}$ be the normalized input in $[0, 1]$. Linearization follows standard Rec.709:
$$C_{\text{linear}} = \begin{cases} \frac{C}{4.5}, & C < 0.081 \\ \left( \frac{C + 0.099}{1.099} \right)^{\frac{1}{0.45}}, & C \ge 0.081 \end{cases}$$

1. **Exposure ($\text{EV} \in [-6.0, +6.0]$)**:
   $$C_{\text{exp}} = C_{\text{linear}} \times 2^{\text{EV}}$$

2. **White Balance ($T \in [-1.0, 1.0]$, $M \in [-1.0, 1.0]$)**:
   $$R' = R_{\text{exp}} \times (1.0 + 0.4 \times T)$$
   $$B' = B_{\text{exp}} \times (1.0 - 0.4 \times T)$$
   $$G' = G_{\text{exp}} \times (1.0 - 0.4 \times M)$$

Re-encoding back to the non-linear working space:
$$C_{\text{work}} = \begin{cases} 4.5 \times C', & C' < 0.018 \\ 1.099 \times (C')^{0.45} - 0.099, & C' \ge 0.018 \end{cases}$$

---

### Stage 2: Primary Correction (Lift / Gamma / Gain / Offset)

For each color channel $c \in \{R, G, B\}$:
$$\text{lifted}_c = \text{Lift}_c \times (1.0 - C_{\text{work}, c}) + C_{\text{work}, c}$$
$$\text{gammaCorrected}_c = \operatorname{sign}(\text{lifted}_c) \times \left| \text{lifted}_c \right|^{\frac{1}{\text{Gamma}_c}}$$
$$C_{\text{lggo}, c} = \operatorname{clamp}\left( \text{Gain}_c \times \text{gammaCorrected}_c + \text{Offset}_c, 0.0, 1.0 \right)$$

*Identity invariant*: When $\text{Lift}=[0,0,0], \text{Gamma}=[1,1,1], \text{Gain}=[1,1,1], \text{Offset}=[0,0,0]$, $C_{\text{lggo}} \equiv C_{\text{work}}$.

---

### Stage 3: Cubic Bézier Curves

Given a sequence of control knot points $P_0, P_1, \dots, P_k$ with left and right control handles:
The segment between $P_i$ and $P_{i+1}$ is parameterized by $t \in [0, 1]$:
$$x(t) = (1-t)^3 x_0 + 3(1-t)^2 t x_1 + 3(1-t) t^2 x_2 + t^3 x_3$$
$$y(t) = (1-t)^3 y_0 + 3(1-t)^2 t y_1 + 3(1-t) t^2 y_2 + t^3 y_3$$

For any input value $x$, $t$ is solved via monotonic root finding ($|x(t) - x| < 10^{-5}$), and $y(t)$ is evaluated. Curves are evaluated in the order:
1. Individual channel curves: $R' = \text{eval}(R), G' = \text{eval}(G), B' = \text{eval}(B)$.
2. Master curve: $R'' = \text{eval}_{\text{master}}(R'), \dots$
3. Luma curve: Luminance $Y = 0.2126 R'' + 0.7152 G'' + 0.0722 B''$ is mapped to $Y' = \text{eval}_{\text{luma}}(Y)$, preserving chromaticity:
   $$C_{\text{curve}} = C'' \times \frac{Y'}{Y}$$

---

### Stage 4: 8-Channel Selective HSL

The image is transformed into cylindrical HSL coordinates. The 8 canonical channel centers are defined as:
- Red: $0^\circ$
- Orange: $30^\circ$
- Yellow: $60^\circ$
- Green: $120^\circ$
- Cyan: $180^\circ$
- Blue: $240^\circ$
- Purple: $280^\circ$
- Magenta: $320^\circ$

For an input hue $H \in [0^\circ, 360^\circ]$, the circular distance to channel center $k$ is:
$$\Delta \theta_k = \min(|H - \theta_k|, 360^\circ - |H - \theta_k|)$$
Smooth overlapping weights with $45^\circ$ support:
$$w_k = \begin{cases} \cos\left( \frac{\Delta \theta_k}{45^\circ} \times \frac{\pi}{2} \right), & \Delta \theta_k < 45^\circ \\ 0, & \Delta \theta_k \ge 45^\circ \end{cases}$$

The accumulated adjustments shift hue, saturation, and lightness:
$$H' = (H + \sum w_k \cdot \Delta H_k) \pmod{360^\circ}$$
$$S' = \operatorname{clamp}\left( S \times (1.0 + \sum w_k \cdot \Delta S_k), 0.0, 1.0 \right)$$
$$L' = \operatorname{clamp}\left( L \times (1.0 + \sum w_k \cdot \Delta L_k), 0.0, 1.0 \right)$$

---

### Stage 5: Skin-Tone Protection

Skin tones are localized in Rec.709 YCbCr space:
$$Y = 0.2126 R + 0.7152 G + 0.0722 B$$
$$Cb = \frac{B - Y}{1.8556}, \quad Cr = \frac{R - Y}{1.5748}$$

The skin locus bounds: $Cb \in [-0.22, -0.04]$, $Cr \in [0.06, 0.24]$, $Y \in [0.15, 0.90]$.  
When enabled with protection weight $w_{\text{skin}} \in [0, 1]$, graded pixels falling within the skin locus are blended back toward the uncorrupted source:
$$C_{\text{protected}} = (1.0 - w_{\text{skin}}) \cdot C_{\text{graded}} + w_{\text{skin}} \cdot C_{\text{orig}}$$

---

### Stage 6: 3D LUT Tetrahedral Interpolation

Given a 3D LUT grid of dimension $N \times N \times N$ with fractional normalized coordinates $(\Delta r, \Delta g, \Delta b) \in [0, 1]^3$, the unit cell is partitioned into 6 tetrahedra:

- **Case 1 ($\Delta r \ge \Delta g \ge \Delta b$)**:
  $$C = (1-\Delta r) v_{000} + (\Delta r - \Delta g) v_{100} + (\Delta g - \Delta b) v_{110} + \Delta b v_{111}$$
- **Case 2 ($\Delta r \ge \Delta b > \Delta g$)**:
  $$C = (1-\Delta r) v_{000} + (\Delta r - \Delta b) v_{100} + (\Delta b - \Delta g) v_{101} + \Delta g v_{111}$$
- **Case 3 ($\Delta g > \Delta r \ge \Delta b$)**:
  $$C = (1-\Delta g) v_{000} + (\Delta g - \Delta r) v_{010} + (\Delta r - \Delta b) v_{110} + \Delta b v_{111}$$
- **Case 4 ($\Delta g \ge \Delta b > \Delta r$)**:
  $$C = (1-\Delta g) v_{000} + (\Delta g - \Delta b) v_{010} + (\Delta b - \Delta r) v_{011} + \Delta r v_{111}$$
- **Case 5 ($\Delta b > \Delta r \ge \Delta g$)**:
  $$C = (1-\Delta b) v_{000} + (\Delta b - \Delta r) v_{001} + (\Delta r - \Delta g) v_{101} + \Delta g v_{111}$$
- **Case 6 ($\Delta b > \Delta g > \Delta r$)**:
  $$C = (1-\Delta b) v_{000} + (\Delta b - \Delta g) v_{001} + (\Delta g - \Delta r) v_{011} + \Delta r v_{111}$$

Intensity blending follows:
$$C_{\text{final}} = (1.0 - w_{\text{lut}}) \cdot C_{\text{in}} + w_{\text{lut}} \cdot C_{\text{lut}}$$
Where $w_{\text{lut}} \in [0.0, 1.0]$. At $w=0.0$, the LUT is bypassed exactly; at $w=1.0$, full LUT output is rendered.
