import { vertexShader, fragmentShader, glassFragmentShader } from './shaders';

export interface GradientParams {
  colors: string[];
  complexity: number;   // 0..100
  smoothness: number;   // 0..100
  distortion: number;   // 0..100
  seed: number;         // 0..1000
  flow: number;         // 0=linear, 1=radial, 2=warp, 3=sky
  starAmount: number;   // 0..100
  starGlow: number;     // 0..100
  starScale: number;    // 0..100
  cloudSize: number;    // 0..100
  cloudAmount: number;  // 0..100
  scale: number;        // 0..100
  mixing: number;       // 0..75
  waveX: number;        // 0..100
  waveY: number;        // 0..100
  warpProportion: number;  // 0..100
  warpSoftness: number;    // 0..100
  warpDistortion: number;  // 0..100
  warpSwirl: number;       // 0..100
  warpShapeScale: number;  // 0..100
}

export interface GlassParams {
  enabled: boolean;
  size: number;        // 70..100 (mapped to 0.7..1.0)
  distortion: number;  // 0..100
  angle: number;       // 0..180
  stretch: number;     // 0..100
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

function setupQuad(gl: WebGLRenderingContext, program: WebGLProgram) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  return buffer;
}

function setGradientUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  params: GradientParams,
  width: number,
  height: number,
  useGetLocation = false,
  uniforms?: Record<string, WebGLUniformLocation | null>,
) {
  const loc = (name: string) =>
    useGetLocation ? gl.getUniformLocation(program, name) : uniforms![name];

  gl.uniform1f(loc('u_time'), 0);
  gl.uniform1f(loc('u_seed'), params.seed / 1000);
  gl.uniform1f(loc('u_complexity'), params.complexity / 100);
  gl.uniform1f(loc('u_smoothness'), params.smoothness / 100);
  gl.uniform1f(loc('u_distortion'), params.distortion / 100);
  gl.uniform1f(loc('u_flow'), params.flow);
  gl.uniform1f(loc('u_colorCount'), params.colors.length);
  gl.uniform2f(loc('u_resolution'), width, height);
  gl.uniform1f(loc('u_starAmount'), (params.starAmount ?? 50) / 100);
  gl.uniform1f(loc('u_starGlow'), (params.starGlow ?? 30) / 100);
  gl.uniform1f(loc('u_starScale'), (params.starScale ?? 50) / 100);
  gl.uniform1f(loc('u_cloudSize'), (params.cloudSize ?? 50) / 100);
  gl.uniform1f(loc('u_cloudAmount'), (params.cloudAmount ?? 40) / 100);
  gl.uniform1f(loc('u_scale'), (params.scale ?? 50) / 100);
  gl.uniform1f(loc('u_mixing'), (params.mixing ?? 50) / 100);
  gl.uniform1f(loc('u_waveX'), (params.waveX ?? 50) / 100);
  gl.uniform1f(loc('u_waveY'), (params.waveY ?? 50) / 100);
  gl.uniform1f(loc('u_warpProportion'), (params.warpProportion ?? 38) / 100);
  gl.uniform1f(loc('u_warpSoftness'), (params.warpSoftness ?? 100) / 100);
  gl.uniform1f(loc('u_warpDistortion'), (params.warpDistortion ?? 0) / 100);
  gl.uniform1f(loc('u_warpSwirl'), (params.warpSwirl ?? 57) / 100);
  gl.uniform1f(loc('u_warpShapeScale'), (params.warpShapeScale ?? 40) / 100);

  for (let i = 0; i < 6; i++) {
    const color = i < params.colors.length
      ? hexToRgb(params.colors[i])
      : [0, 0, 0] as [number, number, number];
    const colorLoc = useGetLocation
      ? gl.getUniformLocation(program, `u_colors[${i}]`)
      : uniforms![`u_colors[${i}]`];
    gl.uniform3f(colorLoc, color[0], color[1], color[2]);
  }
}

export class GradientRenderer {
  private gl: WebGLRenderingContext;
  private gradientProgram: WebGLProgram;
  private glassProgram: WebGLProgram;
  private gradientUniforms: Record<string, WebGLUniformLocation | null> = {};
  private glassUniforms: Record<string, WebGLUniformLocation | null> = {};
  private canvas: HTMLCanvasElement;

  // Framebuffer for two-pass rendering
  private fb: WebGLFramebuffer | null = null;
  private fbTexture: WebGLTexture | null = null;
  private fbWidth = 0;
  private fbHeight = 0;

  // Quad buffers
  private gradientBuffer: WebGLBuffer | null = null;
  private glassBuffer: WebGLBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: true,
    });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // --- Gradient program ---
    const vs1 = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs1 = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    this.gradientProgram = createProgram(gl, vs1, fs1);

    gl.useProgram(this.gradientProgram);
    this.gradientBuffer = setupQuad(gl, this.gradientProgram);

    const gradientUniformNames = [
      'u_time', 'u_seed', 'u_complexity', 'u_smoothness',
      'u_distortion', 'u_flow', 'u_colorCount', 'u_resolution',
      'u_starAmount', 'u_starGlow', 'u_starScale', 'u_cloudSize', 'u_cloudAmount', 'u_scale',
      'u_mixing', 'u_waveX', 'u_waveY',
      'u_warpProportion', 'u_warpSoftness', 'u_warpDistortion', 'u_warpSwirl', 'u_warpShapeScale',
    ];
    for (const name of gradientUniformNames) {
      this.gradientUniforms[name] = gl.getUniformLocation(this.gradientProgram, name);
    }
    for (let i = 0; i < 6; i++) {
      this.gradientUniforms[`u_colors[${i}]`] = gl.getUniformLocation(this.gradientProgram, `u_colors[${i}]`);
    }

    // --- Glass program ---
    const vs2 = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs2 = createShader(gl, gl.FRAGMENT_SHADER, glassFragmentShader);
    this.glassProgram = createProgram(gl, vs2, fs2);

    gl.useProgram(this.glassProgram);
    this.glassBuffer = setupQuad(gl, this.glassProgram);

    const glassUniformNames = [
      'u_texture', 'u_resolution',
      'u_glassSize', 'u_glassDistortion', 'u_glassAngle', 'u_glassStretch',
    ];
    for (const name of glassUniformNames) {
      this.glassUniforms[name] = gl.getUniformLocation(this.glassProgram, name);
    }
  }

  private ensureFramebuffer(width: number, height: number) {
    const gl = this.gl;
    if (this.fb && this.fbWidth === width && this.fbHeight === height) return;

    // Clean up old
    if (this.fb) gl.deleteFramebuffer(this.fb);
    if (this.fbTexture) gl.deleteTexture(this.fbTexture);

    // Create texture
    this.fbTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fbTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create framebuffer
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTexture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.fbWidth = width;
    this.fbHeight = height;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(params: GradientParams, glass?: GlassParams) {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (glass?.enabled) {
      // --- Two-pass: gradient → framebuffer, glass → screen ---
      this.ensureFramebuffer(w, h);

      // Pass 1: render gradient to framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.viewport(0, 0, w, h);

      gl.useProgram(this.gradientProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gradientBuffer);
      const posLoc1 = gl.getAttribLocation(this.gradientProgram, 'a_position');
      gl.enableVertexAttribArray(posLoc1);
      gl.vertexAttribPointer(posLoc1, 2, gl.FLOAT, false, 0, 0);

      setGradientUniforms(gl, this.gradientProgram, params, w, h, false, this.gradientUniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: render glass to screen, sampling framebuffer texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);

      gl.useProgram(this.glassProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glassBuffer);
      const posLoc2 = gl.getAttribLocation(this.glassProgram, 'a_position');
      gl.enableVertexAttribArray(posLoc2);
      gl.vertexAttribPointer(posLoc2, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbTexture);
      gl.uniform1i(this.glassUniforms['u_texture'], 0);
      gl.uniform2f(this.glassUniforms['u_resolution'], w, h);
      gl.uniform1f(this.glassUniforms['u_glassSize'], glass.size / 100);
      gl.uniform1f(this.glassUniforms['u_glassDistortion'], glass.distortion / 100);
      gl.uniform1f(this.glassUniforms['u_glassAngle'], glass.angle);
      gl.uniform1f(this.glassUniforms['u_glassStretch'], glass.stretch / 100);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      // --- Single pass: gradient directly to screen ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.gradientProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gradientBuffer);
      const posLoc = gl.getAttribLocation(this.gradientProgram, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      setGradientUniforms(gl, this.gradientProgram, params, w, h, false, this.gradientUniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  /**
   * Export at specified resolution
   */
  exportImage(params: GradientParams, format: 'png' | 'jpeg' | 'webp', width = 1920, height = 1080, glass?: GlassParams): string {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;

    const gl = offscreen.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: true,
    });
    if (!gl) throw new Error('WebGL not supported for export');

    // --- Gradient program ---
    const vs1 = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs1 = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const gradientProg = createProgram(gl, vs1, fs1);

    if (glass?.enabled) {
      // Two-pass export

      // Create framebuffer
      const fbTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, fbTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTex, 0);

      // Pass 1: gradient → framebuffer
      gl.viewport(0, 0, width, height);
      gl.useProgram(gradientProg);
      setupQuad(gl, gradientProg);
      setGradientUniforms(gl, gradientProg, params, width, height, true);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: glass → screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);

      const vs2 = createShader(gl, gl.VERTEX_SHADER, vertexShader);
      const fs2 = createShader(gl, gl.FRAGMENT_SHADER, glassFragmentShader);
      const glassProg = createProgram(gl, vs2, fs2);
      gl.useProgram(glassProg);
      setupQuad(gl, glassProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbTex);
      gl.uniform1i(gl.getUniformLocation(glassProg, 'u_texture'), 0);
      gl.uniform2f(gl.getUniformLocation(glassProg, 'u_resolution'), width, height);
      gl.uniform1f(gl.getUniformLocation(glassProg, 'u_glassSize'), glass.size / 100);
      gl.uniform1f(gl.getUniformLocation(glassProg, 'u_glassDistortion'), glass.distortion / 100);
      gl.uniform1f(gl.getUniformLocation(glassProg, 'u_glassAngle'), glass.angle);
      gl.uniform1f(gl.getUniformLocation(glassProg, 'u_glassStretch'), glass.stretch / 100);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      // Single pass
      gl.useProgram(gradientProg);
      setupQuad(gl, gradientProg);
      gl.viewport(0, 0, width, height);
      setGradientUniforms(gl, gradientProg, params, width, height, true);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
    return offscreen.toDataURL(mimeMap[format], 1.0);
  }
}
