export const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// --- Fluted Glass post-process shader ---
export const glassFragmentShader = `
  precision highp float;
  varying vec2 v_uv;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_glassSize;        // 0..1
  uniform float u_glassDistortion;  // 0..1
  uniform float u_glassAngle;       // 0..180 degrees
  uniform float u_glassStretch;     // 0..1

  const float PI = 3.14159265359;

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;

    // Rotation
    float a = -u_glassAngle * PI / 180.0;
    float ca = cos(a);
    float sa = sin(a);

    // Pattern UV (rotated, aspect-corrected)
    vec2 p = uv - 0.5;
    p.x *= aspect;
    vec2 rp = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    // Fluted pattern — repeating glass ridges
    float patternSize = mix(200.0, 5.0, u_glassSize);
    float x = rp.x * patternSize;

    // Smooth sine-based ridge pattern
    float ridge = sin(x * PI);

    // Apply stretch (makes ridges sharper/flatter)
    float absRidge = abs(ridge);
    float sharpened = sign(ridge) * pow(absRidge, mix(1.0, 0.15, u_glassStretch));
    float stretched = mix(ridge, sharpened, u_glassStretch);

    // Prism-style distortion: shift perpendicular to ridges
    float distortStrength = u_glassDistortion * 0.1;
    vec2 offset = vec2(ca, sa) * stretched * distortStrength;
    vec2 distortedUV = clamp(uv + offset, 0.0, 1.0);

    // Sample the gradient texture
    vec3 color = texture2D(u_texture, distortedUV).rgb;

    // Shadow & highlight from ridge curvature
    float shadow = (1.0 - absRidge) * 0.25 * u_glassDistortion;
    float highlight = pow(max(ridge, 0.0), 4.0) * 0.12 * u_glassDistortion;

    color = color * (1.0 - shadow) + vec3(highlight);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export const fragmentShader = `
  precision highp float;

  varying vec2 v_uv;

  uniform float u_seed;
  uniform float u_complexity;   // 0..1
  uniform float u_smoothness;   // 0..1
  uniform float u_distortion;   // 0..1
  uniform float u_flow;         // 0=linear, 1=radial, 2=warp, 3=sky
  uniform float u_mixing;
  uniform float u_waveX;
  uniform float u_waveY;
  uniform float u_warpProportion;
  uniform float u_warpSoftness;
  uniform float u_warpDistortion;
  uniform float u_warpSwirl;
  uniform float u_warpShapeScale;
  uniform vec3 u_colors[6];
  uniform float u_colorCount;
  uniform vec2 u_resolution;

  // Sky mode uniforms
  uniform float u_starAmount;    // 0..1
  uniform float u_starGlow;      // 0..1
  uniform float u_starScale;     // 0..1
  uniform float u_cloudSize;     // 0..1
  uniform float u_cloudAmount;   // 0..1
  uniform float u_scale;         // 0..1

  // --- Simplex 2D noise ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m * m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // --- Flow pattern functions ---

  // Liquid: sin-wave based flowing ribbons
  // Radial: concentric rings from center
  float radialField(vec2 p, float seed) {
    vec2 center = vec2(0.5, 0.5) + vec2(
      snoise(vec2(seed * 1.3, seed * 2.7)) * 0.3,
      snoise(vec2(seed * 4.1, seed * 0.9)) * 0.3
    );
    float dist = length(p - center);
    float rings = sin(dist * 6.0 + snoise(p * 0.8 + seed * 5.0) * 1.5);
    return rings;
  }

  // Linear: parallel bands
  float linearField(vec2 p, float seed) {
    float angle = seed * 3.14159;
    vec2 dir = vec2(cos(angle), sin(angle));
    float bands = sin(dot(p, dir) * 5.0 + snoise(p * 0.5 + seed * 4.0) * 1.5);
    return bands;
  }

  // --- Hash for stars ---
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // FBM for clouds
  float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amp * snoise(p * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    return value;
  }

  // Stars: cell-based random bright dots with glow
  float starField(vec2 uv, float seed, float density, float glow, float starScale) {
    float stars = 0.0;
    // Scale: smaller value = bigger stars, more spread out
    float baseScale = mix(120.0, 15.0, starScale);
    // Two layers for depth
    for (int layer = 0; layer < 2; layer++) {
      float scale = baseScale + float(layer) * mix(80.0, 11.0, starScale);
      vec2 gridUV = uv * scale;
      vec2 cell = floor(gridUV);
      vec2 f = fract(gridUV);

      float h = hash(cell + seed * 17.3 + float(layer) * 100.0);

      // Threshold based on density (higher = more stars)
      float threshold = 1.0 - density * 0.15;
      if (h > threshold) {
        // Random position within cell
        vec2 starPos = vec2(
          hash(cell + vec2(1.0, 0.0) + float(layer) * 50.0),
          hash(cell + vec2(0.0, 1.0) + float(layer) * 50.0)
        );
        float d = length(f - starPos);
        float coreSize = mix(0.02, 0.06, hash(cell + vec2(7.7, 3.3)));

        // Core brightness
        float brightness = smoothstep(coreSize, 0.0, d);

        // Glow halo around stars
        float glowRadius = coreSize + mix(0.02, 0.18, glow);
        float glowBrightness = smoothstep(glowRadius, coreSize * 0.5, d) * mix(0.1, 0.6, glow);
        brightness = max(brightness, glowBrightness);

        // Twinkle variation
        float twinkle = 0.7 + 0.3 * sin(h * 50.0 + seed * 20.0);
        brightness *= twinkle;

        // Dimmer in second layer (distant stars)
        if (layer == 1) brightness *= 0.5;

        stars = max(stars, brightness);
      }
    }
    return stars;
  }

  // Clouds: single layer with natural shapes
  // octaves param controls quality (fewer = faster for distant layers)
  float cloudLayer(vec2 uv, float seed, float coverage, float size, float octaves) {
    float baseScale = mix(3.0, 1.0, size);
    vec2 p = uv * baseScale;

    // Large billowy shapes (always needed)
    float n1 = fbm(p * 0.7 + seed * 5.0, int(octaves));
    // Mid-frequency breakup
    float n2 = fbm(p * 1.5 + vec2(seed * 3.1 + 7.0, seed * 1.7 + 3.0), int(octaves));
    // Fine wispy detail (skip for low-quality layers)
    float n3 = 0.0;
    if (octaves > 3.0) {
      n3 = fbm(p * 3.2 + vec2(seed * 2.3, seed * 8.1), int(min(octaves, 4.0)));
    }

    float n = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
    n = n * 0.5 + 0.5;

    float threshold = mix(0.72, 0.2, coverage);
    n = smoothstep(threshold, threshold + 0.35, n);
    n = pow(n, 0.65);

    return n;
  }

  // Dispatch to the selected flow pattern (0=Linear, 1=Radial)
  float flowField(vec2 p, float seed, float flow) {
    if (flow < 0.5) return linearField(p, seed);
    return radialField(p, seed);
  }

  // --- Oklab helper: blend two sRGB colors in Oklab space ---
  vec3 oklabBlend(vec3 rgb0, vec3 rgb1, float t) {
    vec3 lin0 = pow(rgb0, vec3(2.2));
    vec3 lin1 = pow(rgb1, vec3(2.2));

    vec3 lms0 = vec3(
      0.4122214708 * lin0.r + 0.5363325363 * lin0.g + 0.0514459929 * lin0.b,
      0.2119034982 * lin0.r + 0.6806995451 * lin0.g + 0.1073969566 * lin0.b,
      0.0883024619 * lin0.r + 0.2817188376 * lin0.g + 0.6299787005 * lin0.b
    );
    vec3 lms1 = vec3(
      0.4122214708 * lin1.r + 0.5363325363 * lin1.g + 0.0514459929 * lin1.b,
      0.2119034982 * lin1.r + 0.6806995451 * lin1.g + 0.1073969566 * lin1.b,
      0.0883024619 * lin1.r + 0.2817188376 * lin1.g + 0.6299787005 * lin1.b
    );
    vec3 lms0_ = pow(max(lms0, vec3(0.0)), vec3(1.0/3.0));
    vec3 lms1_ = pow(max(lms1, vec3(0.0)), vec3(1.0/3.0));

    vec3 lab0 = vec3(
      0.2104542553 * lms0_.x + 0.7936177850 * lms0_.y - 0.0040720468 * lms0_.z,
      1.9779984951 * lms0_.x - 2.4285922050 * lms0_.y + 0.4505937099 * lms0_.z,
      0.0259040371 * lms0_.x + 0.7827717662 * lms0_.y - 0.8086757660 * lms0_.z
    );
    vec3 lab1 = vec3(
      0.2104542553 * lms1_.x + 0.7936177850 * lms1_.y - 0.0040720468 * lms1_.z,
      1.9779984951 * lms1_.x - 2.4285922050 * lms1_.y + 0.4505937099 * lms1_.z,
      0.0259040371 * lms1_.x + 0.7827717662 * lms1_.y - 0.8086757660 * lms1_.z
    );

    vec3 labMix = mix(lab0, lab1, t);

    vec3 lmsMix_ = vec3(
      labMix.x + 0.3963377774 * labMix.y + 0.2158037573 * labMix.z,
      labMix.x - 0.1055613458 * labMix.y - 0.0638541728 * labMix.z,
      labMix.x - 0.0894841775 * labMix.y - 1.2914855480 * labMix.z
    );
    vec3 lmsMix = lmsMix_ * lmsMix_ * lmsMix_;

    vec3 linResult = vec3(
       4.0767416621 * lmsMix.x - 3.3077115913 * lmsMix.y + 0.2309699292 * lmsMix.z,
      -1.2684380046 * lmsMix.x + 2.6097574011 * lmsMix.y - 0.3413193965 * lmsMix.z,
      -0.0041960863 * lmsMix.x - 0.7034186147 * lmsMix.y + 1.7076147010 * lmsMix.z
    );

    return pow(max(linResult, vec3(0.0)), vec3(1.0/2.2));
  }

  // Quintic smoothstep for ultra-smooth gradient transitions
  float quintic(float t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  // --- Linear gradient (no easing, for sky mode) ---
  vec3 colorGradientLinear(float t) {
    int colorCount = int(u_colorCount);
    vec3 c0 = u_colors[0];
    vec3 c1 = u_colors[0];
    float blend = t;

    if (colorCount == 2) {
      c0 = u_colors[0];
      c1 = u_colors[1];
    } else if (colorCount >= 3) {
      float seg = t * (u_colorCount - 1.0);
      int idx = int(floor(seg));
      blend = fract(seg);
      c0 = u_colors[0]; c1 = u_colors[1];
      if (idx == 0) { c0 = u_colors[0]; c1 = u_colors[1]; }
      if (idx == 1) { c0 = u_colors[1]; c1 = u_colors[2]; }
      if (idx == 2) { c0 = u_colors[2]; c1 = u_colors[3]; }
      if (idx == 3) { c0 = u_colors[3]; c1 = u_colors[4]; }
      if (idx == 4) { c0 = u_colors[4]; c1 = u_colors[5]; }
    }

    return oklabBlend(c0, c1, blend);
  }

  // --- Multi-color Oklab gradient lookup ---
  vec3 colorGradient(float t) {
    int colorCount = int(u_colorCount);
    vec3 c0 = u_colors[0];
    vec3 c1 = u_colors[0];
    float blend = t;

    if (colorCount == 2) {
      c0 = u_colors[0];
      c1 = u_colors[1];
      blend = quintic(t);
    } else if (colorCount >= 3) {
      float seg = t * (u_colorCount - 1.0);
      int idx = int(floor(seg));
      blend = quintic(fract(seg));
      c0 = u_colors[0]; c1 = u_colors[1];
      if (idx == 0) { c0 = u_colors[0]; c1 = u_colors[1]; }
      if (idx == 1) { c0 = u_colors[1]; c1 = u_colors[2]; }
      if (idx == 2) { c0 = u_colors[2]; c1 = u_colors[3]; }
      if (idx == 3) { c0 = u_colors[3]; c1 = u_colors[4]; }
      if (idx == 4) { c0 = u_colors[4]; c1 = u_colors[5]; }
    }

    return oklabBlend(c0, c1, blend);
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;
    float seed = u_seed;
    float flow = u_flow;

    // --- Sky mode (flow 3) ---
    if (flow > 2.5) {
      // Smooth top-to-bottom gradient with subtle noise to break banding
      float t = 1.0 - uv.y;
      // Add very subtle noise to break color banding
      float dither = (snoise(uv * u_resolution * 0.5) * 0.5 + 0.5) / 255.0;
      t = clamp(t + dither, 0.0, 1.0);
      vec3 skyColor = colorGradientLinear(t);

      vec2 cloudUV = uv * vec2(aspect, 1.0);

      // --- Multi-layer clouds (skip if amount is zero) ---
      float backClouds = 0.0;
      float midClouds = 0.0;
      float frontClouds = 0.0;
      vec3 color = skyColor;

      if (u_cloudAmount > 0.01) {
        // Cloud vertical mask - skip pixels outside cloud band
        float cloudMask = smoothstep(0.0, 0.2, uv.y) * smoothstep(0.82, 0.3, uv.y);

        if (cloudMask > 0.01) {
          // Large-scale scatter map: creates natural clusters of clouds vs clear patches
          float scatter = snoise(cloudUV * 0.4 + vec2(seed * 1.7, seed * 0.9));
          float scatter2 = snoise(cloudUV * 0.8 + vec2(seed * 3.1, seed * 2.3));
          float scatterMap = scatter * 0.6 + scatter2 * 0.4;
          scatterMap = scatterMap * 0.5 + 0.5; // normalize to 0..1
          // Vary cloud coverage per-area: some spots get full clouds, others clear
          float localCoverage = u_cloudAmount * smoothstep(0.15, 0.7, scatterMap);

          // Back layer: 3 octaves (fast, soft, distant) — spread wider
          backClouds = cloudLayer(cloudUV * 0.5 + vec2(seed * 0.3, 0.0), seed + 10.0, localCoverage * 0.8, u_cloudSize * 0.7 + 0.3, 3.0);
          backClouds *= smoothstep(0.0, 0.25, uv.y) * smoothstep(0.8, 0.4, uv.y) * 0.45;

          // Mid layer: 4 octaves — medium clusters
          midClouds = cloudLayer(cloudUV * 0.75 + vec2(seed * 0.7 + 3.0, 0.5), seed + 5.0, localCoverage * 0.9, u_cloudSize * 0.9 + 0.1, 4.0);
          midClouds *= smoothstep(0.0, 0.2, uv.y) * smoothstep(0.75, 0.38, uv.y) * 0.6;

          // Front layer: 5 octaves (full detail) — smaller individual clouds
          frontClouds = cloudLayer(cloudUV * 1.1, seed, localCoverage, u_cloudSize, 5.0);
          frontClouds *= smoothstep(0.0, 0.18, uv.y) * smoothstep(0.7, 0.32, uv.y);

          // Tint clouds with a brightened version of the sky gradient
          // Back clouds use a slightly different gradient position for depth
          vec3 cloudTintBack = colorGradientLinear(clamp(1.0 - uv.y * 0.6, 0.0, 1.0));
          vec3 cloudTintFront = colorGradientLinear(clamp(1.0 - uv.y * 0.4, 0.0, 1.0));
          // Brighten: push toward white but keep the hue
          cloudTintBack = mix(cloudTintBack, vec3(1.0), 0.55);
          cloudTintFront = mix(cloudTintFront, vec3(1.0), 0.7);

          // Layer blending: back clouds tinted deeper, front clouds lighter
          color = mix(skyColor, cloudTintBack, backClouds);
          color = mix(color, mix(cloudTintBack, cloudTintFront, 0.5), midClouds);
          color = mix(color, cloudTintFront, frontClouds);
        }
      }

      // Stars: concentrated in upper half, hidden behind clouds
      float totalCloud = max(backClouds, max(midClouds, frontClouds));
      float stars = starField(cloudUV, seed, u_starAmount, u_starGlow, u_starScale);
      stars *= smoothstep(0.35, 0.65, uv.y);
      stars *= (1.0 - totalCloud * 0.95);

      vec3 finalColor = color + vec3(stars);

      // Final dither to eliminate any remaining banding
      finalColor += (dither - 0.5 / 255.0);

      gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
      return;
    }

    // --- Warp mode (flow 2) ---
    if (flow > 1.5 && flow < 2.5) {
      vec2 wUV = v_uv * 0.5 * 2.0; // scale=2.0
      float t = seed * 6.28318;

      // Noise-based distortion
      float n1 = snoise(wUV * 1.0 + t) * 0.5 + 0.5;
      float n2 = snoise(wUV * 2.0 - t) * 0.5 + 0.5;
      float wAngle = n1 * 6.28318;
      wUV.x += 4.0 * u_warpDistortion * n2 * cos(wAngle);
      wUV.y += 4.0 * u_warpDistortion * n2 * sin(wAngle);

      // Swirl distortion (10 iterations)
      float swirl = u_warpSwirl;
      for (float i = 1.0; i <= 10.0; i++) {
        wUV.x += swirl / i * cos(t + i * 1.5 * wUV.y);
        wUV.y += swirl / i * cos(t + i * 1.0 * wUV.x);
      }

      float proportion = u_warpProportion;

      // Checks shape
      vec2 checksUV = wUV * (0.5 + 3.5 * u_warpShapeScale);
      float wShape = 0.5 + 0.5 * sin(checksUV.x) * cos(checksUV.y);
      wShape += 0.48 * sign(proportion - 0.5) * pow(abs(proportion - 0.5), 0.5);

      // Color blending with softness control
      float mixer = wShape * (u_colorCount - 1.0);
      vec3 wColor = u_colors[0];
      for (int i = 1; i < 6; i++) {
        if (float(i) >= u_colorCount) break;
        float m = clamp(mixer - float(i - 1), 0.0, 1.0);

        // Softness: 0 = hard step, 1 = smooth blend
        float localStart = floor(m);
        float softness = 0.5 * u_warpSoftness + 0.01;
        float smoothed = smoothstep(max(0.0, 0.5 - softness), min(1.0, 0.5 + softness), m - localStart);
        float stepped = localStart + smoothed;
        m = mix(stepped, m, u_warpSoftness);

        wColor = mix(wColor, u_colors[i], m);
      }

      // Dither
      float dither = (snoise(uv * u_resolution * 0.5) * 0.5 + 0.5) / 255.0;
      wColor += dither - 0.5 / 255.0;

      gl_FragColor = vec4(clamp(wColor, 0.0, 1.0), 1.0);
      return;
    }

    // --- Normal gradient modes ---
    // Scale: 0 = zoomed in (0.5x), 0.5 = default (1x), 1 = zoomed out (2x)
    float scaleFactor = mix(1.0, 2.0, u_scale);
    vec2 center = vec2(aspect * 0.5, 0.5);
    uv.x *= aspect;
    uv = center + (uv - center) * scaleFactor;
    vec2 p = uv * mix(0.8, 1.36, u_complexity);

    float flow1 = flowField(p, seed, flow);

    float warpAmt = mix(0.5, 0.95, u_distortion);
    vec2 warped = p + warpAmt * vec2(
      flowField(p + vec2(3.2, 1.3), seed + 1.0, flow),
      flowField(p + vec2(7.1, 4.7), seed + 2.0, flow)
    );

    float fold = flowField(warped, seed + 3.0, flow);

    float foldDepth = mix(0.3, 0.7, u_distortion);
    float n = mix(flow1, fold, foldDepth);

    if (u_complexity > 0.7) {
      float detail = snoise(warped * 2.5 + seed * 11.0) * 0.08;
      n += detail * smoothstep(0.7, 1.0, u_complexity);
    }

    n = n * 0.5 + 0.5;
    n = clamp(n, 0.0, 1.0);

    float gamma = mix(1.8, 0.6, u_smoothness);
    n = pow(n, gamma);
    n = smoothstep(0.05, 0.95, n);

    vec3 color = colorGradient(n);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;
