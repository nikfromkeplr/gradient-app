import { vertexShader, fragmentShader } from './shaders';

export interface GradientParams {
  colors: string[];
  complexity: number;   // 0..100
  smoothness: number;   // 0..100
  distortion: number;   // 0..100
  seed: number;         // 0..1000
  flow: number;         // 0=liquid, 1=radial, 2=linear, 3=sky
  starAmount: number;   // 0..100
  starGlow: number;     // 0..100
  starScale: number;    // 0..100
  cloudSize: number;    // 0..100
  cloudAmount: number;  // 0..100
  scale: number;        // 0..100
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

export class GradientRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: true,
    });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Build program
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    this.program = createProgram(gl, vs, fs);

    // Full-screen quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    gl.useProgram(this.program);
    const uniformNames = [
      'u_time', 'u_seed', 'u_complexity', 'u_smoothness',
      'u_distortion', 'u_flow', 'u_colorCount', 'u_resolution',
      'u_starAmount', 'u_starGlow', 'u_starScale', 'u_cloudSize', 'u_cloudAmount', 'u_scale',
    ];
    for (const name of uniformNames) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    for (let i = 0; i < 6; i++) {
      this.uniforms[`u_colors[${i}]`] = gl.getUniformLocation(this.program, `u_colors[${i}]`);
    }
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(params: GradientParams) {
    const gl = this.gl;
    gl.useProgram(this.program);

    gl.uniform1f(this.uniforms['u_time'], 0);
    gl.uniform1f(this.uniforms['u_seed'], params.seed / 1000);
    gl.uniform1f(this.uniforms['u_complexity'], params.complexity / 100);
    gl.uniform1f(this.uniforms['u_smoothness'], params.smoothness / 100);
    gl.uniform1f(this.uniforms['u_distortion'], params.distortion / 100);
    gl.uniform1f(this.uniforms['u_flow'], params.flow);
    gl.uniform1f(this.uniforms['u_colorCount'], params.colors.length);
    gl.uniform2f(this.uniforms['u_resolution'], this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms['u_starAmount'], (params.starAmount ?? 50) / 100);
    gl.uniform1f(this.uniforms['u_starGlow'], (params.starGlow ?? 30) / 100);
    gl.uniform1f(this.uniforms['u_starScale'], (params.starScale ?? 50) / 100);
    gl.uniform1f(this.uniforms['u_cloudSize'], (params.cloudSize ?? 50) / 100);
    gl.uniform1f(this.uniforms['u_cloudAmount'], (params.cloudAmount ?? 40) / 100);
    gl.uniform1f(this.uniforms['u_scale'], (params.scale ?? 50) / 100);

    // Set colors (pad to 6)
    for (let i = 0; i < 6; i++) {
      const color = i < params.colors.length
        ? hexToRgb(params.colors[i])
        : [0, 0, 0] as [number, number, number];
      gl.uniform3f(this.uniforms[`u_colors[${i}]`], color[0], color[1], color[2]);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Export at fixed 1920x1080 resolution
   */
  exportImage(params: GradientParams, format: 'png' | 'jpeg' | 'webp'): string {
    // Create offscreen canvas at export resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = 1920;
    offscreen.height = 1080;

    const gl = offscreen.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: true,
    });
    if (!gl) throw new Error('WebGL not supported for export');

    // Rebuild program for offscreen context
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = createProgram(gl, vs, fs);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);
    gl.viewport(0, 0, 1920, 1080);

    // Set uniforms
    gl.uniform1f(gl.getUniformLocation(program, 'u_time'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), params.seed / 1000);
    gl.uniform1f(gl.getUniformLocation(program, 'u_complexity'), params.complexity / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_smoothness'), params.smoothness / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_distortion'), params.distortion / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_flow'), params.flow);
    gl.uniform1f(gl.getUniformLocation(program, 'u_colorCount'), params.colors.length);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 1920, 1080);
    gl.uniform1f(gl.getUniformLocation(program, 'u_starAmount'), (params.starAmount ?? 50) / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_starGlow'), (params.starGlow ?? 30) / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_cloudSize'), (params.cloudSize ?? 50) / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_cloudAmount'), (params.cloudAmount ?? 40) / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), (params.scale ?? 50) / 100);

    for (let i = 0; i < 6; i++) {
      const color = i < params.colors.length
        ? hexToRgb(params.colors[i])
        : [0, 0, 0] as [number, number, number];
      gl.uniform3f(gl.getUniformLocation(program, `u_colors[${i}]`), color[0], color[1], color[2]);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
    return offscreen.toDataURL(mimeMap[format], 1.0);
  }
}
