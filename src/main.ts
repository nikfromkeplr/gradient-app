import { GradientRenderer, type GradientParams, type GlassParams } from './renderer';

// --- Palettes per flow type ---
interface Palette {
  id: string;
  name: string;
  colors: string[];
  flows: number[]; // which flow types this palette is available for
}

const palettes: Palette[] = [
  // Linear / Radial / Warp
  { id: 'keplr', name: 'Keplr Vivid', colors: ['#006EE5', '#14AFEB', '#797DFF', '#B2ACF4'], flows: [0, 1, 2] },
  { id: 'ocean', name: 'Keplr Blue', colors: ['#006EE5', '#14AFEB', '#3FBDED', '#89C2D8'], flows: [0, 1, 2] },
  { id: 'infra-green', name: 'Infra Green', colors: ['#034842', '#00796E', '#B8DD3F'], flows: [0, 1, 2] },
  { id: 'infra-bloom', name: 'Infra Bloom', colors: ['#034843', '#007F73', '#B7DD40', '#FFC983', '#EBA9FF'], flows: [0, 1, 2] },
  // Sky
  { id: 'aurora', name: 'Aurora', colors: ['#051629', '#003E82', '#006EE5', '#B2ACF4'], flows: [3] },
  { id: 'night', name: 'Night Sky', colors: ['#020714', '#0D2347', '#1C5599'], flows: [3] },
  { id: 'day', name: 'Day Sky', colors: ['#346EE2', '#14AFEB'], flows: [3] },
];

function getPalettesForFlow(flow: number): Palette[] {
  return palettes.filter(p => p.flows.includes(flow));
}

// --- State ---
let activePaletteId = 'keplr';

let params: GradientParams = {
  colors: [...palettes[0].colors],
  complexity: 35,
  smoothness: 80,
  distortion: 40,
  seed: 480,
  flow: 0,
  starAmount: 50,
  starGlow: 0,
  starScale: 100,
  cloudSize: 50,
  cloudAmount: 24,
  scale: 50,
  mixing: 50,
  waveX: 50,
  waveY: 50,
  warpProportion: 38,
  warpSoftness: 100,
  warpDistortion: 0,
  warpSwirl: 57,
  warpShapeScale: 40,
};

// --- Per-flow state snapshots (so randomizing one style doesn't affect others) ---
interface FlowSnapshot {
  params: GradientParams;
  paletteId: string;
}

const flowSnapshots: Record<number, FlowSnapshot> = {};

function saveFlowSnapshot() {
  flowSnapshots[params.flow] = {
    params: cloneParams(params),
    paletteId: activePaletteId,
  };
}

function restoreFlowSnapshot(flow: number): boolean {
  const snap = flowSnapshots[flow];
  if (!snap) return false;
  params = { ...cloneParams(snap.params), flow };
  activePaletteId = snap.paletteId;
  return true;
}

// --- Glass state ---
let glassParams: GlassParams = {
  enabled: false,
  size: 91,
  distortion: 15,
  angle: 114,
  stretch: 19,
};

// --- Undo history ---
const history: { params: GradientParams; paletteId: string }[] = [];
const MAX_HISTORY = 50;

function cloneParams(p: GradientParams): GradientParams {
  return { ...p, colors: [...p.colors] };
}

function pushHistory() {
  history.push({ params: cloneParams(params), paletteId: activePaletteId });
  if (history.length > MAX_HISTORY) history.shift();
  updateUndoButton();
}

function undo() {
  if (history.length === 0) return;
  const prev = history.pop()!;
  params = prev.params;
  activePaletteId = prev.paletteId;
  syncSlidersFromParams();
  updateFlowRadios();
  renderPalettes();
  renderGradient();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('btn-undo') as HTMLButtonElement;
  btn.disabled = history.length === 0;
  btn.style.opacity = history.length === 0 ? '0.3' : '1';
}

// --- Init renderer ---
const canvas = document.getElementById('gradient-canvas') as HTMLCanvasElement;
const renderer = new GradientRenderer(canvas);

function renderGradient() {
  renderer.resize();
  renderer.render(params, glassParams);
  // Keep per-flow snapshot in sync
  saveFlowSnapshot();
}

// --- Sliders ---
const sliders = {
  complexity: document.getElementById('slider-complexity') as HTMLInputElement,
  smoothness: document.getElementById('slider-smoothness') as HTMLInputElement,
  distortion: document.getElementById('slider-distortion') as HTMLInputElement,
  scale: document.getElementById('slider-scale') as HTMLInputElement,
  warpProportion: document.getElementById('slider-warp-proportion') as HTMLInputElement,
  warpShapeScale: document.getElementById('slider-warp-shapescale') as HTMLInputElement,
  seed: document.getElementById('slider-seed') as HTMLInputElement,
};

// Sky-specific sliders
const skySliders = {
  starAmount: document.getElementById('slider-star-amount') as HTMLInputElement,
  cloudSize: document.getElementById('slider-cloud-size') as HTMLInputElement,
  cloudAmount: document.getElementById('slider-cloud-amount') as HTMLInputElement,
};
const seedSkySlider = document.getElementById('slider-seed-sky') as HTMLInputElement;
const slidersNormal = document.getElementById('sliders-normal')!;
const slidersSky = document.getElementById('sliders-sky')!;

const sliderGroupComplexity = document.getElementById('slider-group-complexity')!;
const sliderGroupDistortion = document.getElementById('slider-group-distortion')!;
const sliderGroupScale = document.getElementById('slider-group-scale')!;
const sliderGroupSmoothness = document.getElementById('slider-group-smoothness')!;
const sliderGroupWarpProportion = document.getElementById('slider-group-warp-proportion')!;
const sliderGroupWarpShapeScale = document.getElementById('slider-group-warp-shapescale')!;
const btnReverseColors = document.getElementById('btn-reverse-colors') as HTMLButtonElement;

function updateSlidersVisibility() {
  const isSky = params.flow === 3;
  slidersNormal.style.display = isSky ? 'none' : '';
  slidersSky.style.display = isSky ? '' : 'none';

  // Hide reverse button for Sky
  btnReverseColors.style.display = isSky ? 'none' : '';

  // Radial: hide Complexity, Distortion max 30, Scale max 20 (default 10)
  // Linear: Complexity max 40, Distortion max 60
  // Hide mode-specific sliders by default, show shared sliders
  sliderGroupWarpProportion.style.display = 'none';
  sliderGroupWarpShapeScale.style.display = 'none';
  sliderGroupDistortion.style.display = '';
  sliderGroupSmoothness.style.display = '';
  sliderGroupComplexity.style.display = '';
  sliderGroupScale.style.display = '';

  if (params.flow === 0) {
    // Linear: restore defaults if coming from a mode that clamped them
    sliderGroupScale.style.display = 'none';
    sliders.complexity.max = '40';
    sliders.distortion.max = '60';
    params.scale = 0;
    sliders.scale.value = '0';
    if (params.complexity === 0) {
      params.complexity = 35;
      sliders.complexity.value = '35';
    }
    if (params.distortion < 10) {
      params.distortion = 40;
      sliders.distortion.value = '40';
    }
  } else if (params.flow === 1) {
    // Radial: hide Complexity and Scale, Distortion max 30
    sliderGroupComplexity.style.display = 'none';
    sliderGroupScale.style.display = 'none';
    params.complexity = 0;
    sliders.complexity.value = '0';
    params.scale = 0;
    sliders.scale.value = '0';
    sliders.distortion.max = '30';
  } else if (params.flow === 2) {
    // Warp: show Proportion + Shape Scale + Seed only
    sliderGroupComplexity.style.display = 'none';
    sliderGroupSmoothness.style.display = 'none';
    sliderGroupDistortion.style.display = 'none';
    sliderGroupScale.style.display = 'none';
    sliderGroupWarpProportion.style.display = '';
    sliderGroupWarpShapeScale.style.display = '';
  }

  // Clamp values to new max
  if (Number(sliders.complexity.value) > Number(sliders.complexity.max)) {
    sliders.complexity.value = sliders.complexity.max;
    params.complexity = Number(sliders.complexity.max);
  }
  if (Number(sliders.distortion.value) > Number(sliders.distortion.max)) {
    sliders.distortion.value = sliders.distortion.max;
    params.distortion = Number(sliders.distortion.max);
  }
  if (Number(sliders.scale.value) > Number(sliders.scale.max)) {
    sliders.scale.value = sliders.scale.max;
    params.scale = Number(sliders.scale.max);
  }
}

function syncSlidersFromParams() {
  // Set max limits first so values get clamped properly
  updateSlidersVisibility();
  sliders.complexity.value = String(params.complexity);
  sliders.smoothness.value = String(params.smoothness);
  sliders.distortion.value = String(params.distortion);
  sliders.scale.value = String(params.scale);
  sliders.warpProportion.value = String(params.warpProportion);
  sliders.warpShapeScale.value = String(params.warpShapeScale);
  sliders.seed.value = String(params.seed);
  skySliders.starAmount.value = String(params.starAmount);
  skySliders.cloudSize.value = String(params.cloudSize);
  skySliders.cloudAmount.value = String(params.cloudAmount);
  seedSkySlider.value = String(params.seed);
  // Update all value displays
  document.querySelectorAll('.slider-group').forEach(group => {
    const input = group.querySelector('input[type="range"]') as HTMLInputElement | null;
    const valueSpan = group.querySelector('.slider-value');
    if (input && valueSpan) valueSpan.textContent = input.value;
  });
}

// --- Slider value displays ---
function initSliderValues(slider: HTMLInputElement) {
  const group = slider.closest('.slider-group');
  if (!group) return;
  const label = group.querySelector('label');
  if (!label) return;
  // Wrap label + value in a header row
  const header = document.createElement('div');
  header.className = 'slider-header';
  const valueSpan = document.createElement('span');
  valueSpan.className = 'slider-value';
  valueSpan.textContent = slider.value;
  group.insertBefore(header, label);
  header.appendChild(label);
  header.appendChild(valueSpan);
  slider.addEventListener('input', () => {
    valueSpan.textContent = slider.value;
  });
}

Object.entries(sliders).forEach(([key, slider]) => {
  initSliderValues(slider);
  slider.addEventListener('mousedown', () => pushHistory());
  slider.addEventListener('touchstart', () => pushHistory());
  slider.addEventListener('input', () => {
    (params as any)[key] = Number(slider.value);
    renderGradient();
  });
});

Object.entries(skySliders).forEach(([key, slider]) => {
  initSliderValues(slider);
  slider.addEventListener('mousedown', () => pushHistory());
  slider.addEventListener('touchstart', () => pushHistory());
  slider.addEventListener('input', () => {
    (params as any)[key] = Number(slider.value);
    renderGradient();
  });
});

initSliderValues(seedSkySlider);
seedSkySlider.addEventListener('mousedown', () => pushHistory());
seedSkySlider.addEventListener('touchstart', () => pushHistory());
seedSkySlider.addEventListener('input', () => {
  params.seed = Number(seedSkySlider.value);
  sliders.seed.value = seedSkySlider.value;
  renderGradient();
});

// --- Fluted Glass controls ---
const glassToggle = document.getElementById('toggle-glass') as HTMLInputElement;
const glassControlsEl = document.getElementById('glass-controls')!;

const glassSliders = {
  size: document.getElementById('slider-glass-size') as HTMLInputElement,
  distortion: document.getElementById('slider-glass-distortion') as HTMLInputElement,
  angle: document.getElementById('slider-glass-angle') as HTMLInputElement,
  stretch: document.getElementById('slider-glass-stretch') as HTMLInputElement,
};

glassToggle.addEventListener('change', () => {
  glassParams.enabled = glassToggle.checked;
  glassControlsEl.classList.toggle('hidden', !glassToggle.checked);
  renderGradient();
});

Object.entries(glassSliders).forEach(([key, slider]) => {
  initSliderValues(slider);
  slider.addEventListener('mousedown', () => pushHistory());
  slider.addEventListener('touchstart', () => pushHistory());
  slider.addEventListener('input', () => {
    (glassParams as any)[key] = Number(slider.value);
    renderGradient();
  });
});

// --- Flow radio buttons ---
const flowRadios = document.getElementById('flow-radios')!;

function updateFlowRadios() {
  flowRadios.querySelectorAll('.radio-pill').forEach(pill => {
    const flow = Number((pill as HTMLElement).dataset.flow);
    pill.classList.toggle('active', flow === params.flow);
  });
}

flowRadios.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest('.radio-pill') as HTMLElement | null;
  if (!pill) return;
  const flow = Number(pill.dataset.flow);
  if (flow === params.flow) return;

  pushHistory();

  // Save current flow state before switching
  saveFlowSnapshot();

  // Try to restore saved state for the target flow
  if (!restoreFlowSnapshot(flow)) {
    // No snapshot — set flow and pick appropriate palette
    params.flow = flow;
    const available = getPalettesForFlow(flow);
    const currentPalette = palettes.find(p => p.id === activePaletteId);
    if (!currentPalette || !currentPalette.flows.includes(flow)) {
      activePaletteId = available[0].id;
      params.colors = [...available[0].colors];
    }
  }

  updateFlowRadios();
  updateSlidersVisibility();
  syncSlidersFromParams();
  renderPalettes();
  renderGradient();
});

// --- Palettes ---
const paletteList = document.getElementById('palette-list')!;

function renderPalettes() {
  const available = getPalettesForFlow(params.flow);
  paletteList.innerHTML = '';

  available.forEach(palette => {
    const item = document.createElement('div');
    item.className = `palette-item${palette.id === activePaletteId ? ' active' : ''}`;

    const preview = document.createElement('div');
    preview.className = 'palette-preview';
    preview.style.background = `linear-gradient(90deg, ${palette.colors.join(', ')})`;

    const name = document.createElement('span');
    name.className = 'palette-name';
    name.textContent = palette.name;

    item.appendChild(preview);
    item.appendChild(name);

    item.addEventListener('click', () => {
      if (palette.id === activePaletteId) return;
      pushHistory();
      activePaletteId = palette.id;
      params.colors = [...palette.colors];
      renderPalettes();
      renderGradient();
    });

    paletteList.appendChild(item);
  });
}

// --- Reverse colors ---
btnReverseColors.addEventListener('click', () => {
  if (params.flow === 3) return; // disabled for Sky
  pushHistory();
  params.colors = [...params.colors].reverse();
  renderGradient();
});

// --- Randomize ---
function randomizeNormal() {
  pushHistory();
  params.seed = Math.floor(Math.random() * 1000);

  if (params.flow === 0) {
    // Linear: Complexity (max 40), Smoothness, Distortion (max 60)
    params.complexity = 10 + Math.floor(Math.random() * 30);
    params.smoothness = 40 + Math.floor(Math.random() * 50);
    params.distortion = 10 + Math.floor(Math.random() * 50);
  } else if (params.flow === 1) {
    // Radial: Smoothness, Distortion (max 30)
    params.smoothness = 40 + Math.floor(Math.random() * 50);
    params.distortion = 5 + Math.floor(Math.random() * 25);
  } else if (params.flow === 2) {
    // Warp: Proportion (0-50), Shape Scale
    params.warpProportion = Math.floor(Math.random() * 50);
    params.warpShapeScale = 10 + Math.floor(Math.random() * 70);
  }

  syncSlidersFromParams();
  renderGradient();
}

function randomizeSky() {
  pushHistory();
  params.seed = Math.floor(Math.random() * 1000);
  params.starAmount = 20 + Math.floor(Math.random() * 70);
  params.cloudSize = 20 + Math.floor(Math.random() * 60);
  params.cloudAmount = 10 + Math.floor(Math.random() * 50);
  syncSlidersFromParams();
  renderGradient();
}

document.getElementById('btn-randomize-normal')!.addEventListener('click', randomizeNormal);
document.getElementById('btn-randomize-sky')!.addEventListener('click', randomizeSky);

// --- Undo button ---
document.getElementById('btn-undo')!.addEventListener('click', undo);

// --- Keyboard shortcut: Cmd+Z / Ctrl+Z ---
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
});

// --- Text overlay ---
const textOverlay = document.getElementById('text-overlay') as HTMLDivElement;
const borderSvg = document.getElementById('text-border-svg') as unknown as SVGSVGElement;
const borderRect = borderSvg.querySelector('.border-rect') as SVGRectElement;

// Keep SVG border positioned and sized to match the text overlay
function updateBorderSvg() {
  const w = textOverlay.offsetWidth + 6;
  const h = textOverlay.offsetHeight + 6;
  borderSvg.style.width = `${w}px`;
  borderSvg.style.height = `${h}px`;
  borderRect.setAttribute('x', '2.5');
  borderRect.setAttribute('y', '2.5');
  borderRect.setAttribute('width', String(w - 5));
  borderRect.setAttribute('height', String(h - 5));

  // Position: match the text overlay but offset by -3px on each side
  const overlayStyle = getComputedStyle(textOverlay);
  if (textOverlay.style.left) {
    borderSvg.style.left = `${parseFloat(textOverlay.style.left) - 3}px`;
  }
  if (textOverlay.style.right) {
    borderSvg.style.right = `${parseFloat(textOverlay.style.right) - 3}px`;
    borderSvg.style.left = '';
  } else {
    borderSvg.style.right = '';
  }
  if (textOverlay.style.top) {
    borderSvg.style.top = `${parseFloat(textOverlay.style.top) - 3}px`;
  }
  if (textOverlay.style.bottom) {
    borderSvg.style.bottom = `${parseFloat(textOverlay.style.bottom) - 3}px`;
    borderSvg.style.top = '';
  } else {
    borderSvg.style.bottom = '';
  }
  borderSvg.style.transform = textOverlay.style.transform;
}

const borderObserver = new ResizeObserver(updateBorderSvg);
borderObserver.observe(textOverlay);

const textControls = document.getElementById('text-controls')!;
const textVisibleToggle = document.getElementById('toggle-text-visible') as HTMLInputElement;
const textSizeRadios = document.getElementById('text-size-radios')!;
const textAlignRadios = document.getElementById('text-align-radios')!;
const textShadowToggle = document.getElementById('toggle-text-shadow') as HTMLInputElement;
const snapGuides = document.getElementById('snap-guides')!;

// Size presets
type TextSizeKey = 'xs' | 's' | 'm' | 'l';
const TEXT_SIZES: Record<TextSizeKey, number> = { xs: 70, s: 120, m: 180, l: 250 };

// Text state
let textX = 0.5;
let textY = 0.5;
let textAlign: 'left' | 'center' | 'right' = 'center';
let textShadow = false;
let textSize: TextSizeKey = 's';
let textVisible = true;
let activeSnap: SnapPoint | null = null; // currently snapped point

const SAFETY_GAP = 100; // px from each edge

// Snap points as pixel positions on the wrapper
// Corner snaps: text edge aligns to the snap point
// Center snap: text center aligns to the snap point
interface SnapPoint {
  name: string;
  wx: number; // wrapper pixel x
  wy: number; // wrapper pixel y
  anchorX: 'left' | 'center' | 'right';
  anchorY: 'top' | 'center' | 'bottom';
}

function getSnapPoints(): SnapPoint[] {
  const wrapper = textOverlay.parentElement!;
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  return [
    { name: 'left-top', wx: SAFETY_GAP, wy: SAFETY_GAP, anchorX: 'left', anchorY: 'top' },
    { name: 'right-top', wx: w - SAFETY_GAP, wy: SAFETY_GAP, anchorX: 'right', anchorY: 'top' },
    { name: 'center', wx: w / 2, wy: h / 2, anchorX: 'center', anchorY: 'center' },
    { name: 'left-bottom', wx: SAFETY_GAP, wy: h - SAFETY_GAP, anchorX: 'left', anchorY: 'bottom' },
    { name: 'right-bottom', wx: w - SAFETY_GAP, wy: h - SAFETY_GAP, anchorX: 'right', anchorY: 'bottom' },
  ];
}

const SNAP_THRESHOLD_PX = 30; // pixels

function getTextEdges(cx: number, cy: number): { left: number; right: number; top: number; bottom: number } {
  const rect = textOverlay.getBoundingClientRect();
  const wrapper = textOverlay.parentElement!;
  const wrapperRect = wrapper.getBoundingClientRect();
  return {
    left: cx - rect.width / 2,
    right: cx + rect.width / 2,
    top: cy - rect.height / 2,
    bottom: cy + rect.height / 2,
  };
}

function applyTextPosition() {
  const wrapper = textOverlay.parentElement!;

  // Reset all positioning
  textOverlay.style.left = '';
  textOverlay.style.right = '';
  textOverlay.style.top = '';
  textOverlay.style.bottom = '';

  if (activeSnap) {
    // Position from the snap anchor so text grows away from the anchor
    const snap = activeSnap;

    if (snap.anchorX === 'left') {
      textOverlay.style.left = `${snap.wx}px`;
    } else if (snap.anchorX === 'right') {
      textOverlay.style.right = `${wrapper.clientWidth - snap.wx}px`;
    } else {
      textOverlay.style.left = `${snap.wx}px`;
    }

    if (snap.anchorY === 'top') {
      textOverlay.style.top = `${snap.wy}px`;
    } else if (snap.anchorY === 'bottom') {
      textOverlay.style.bottom = `${wrapper.clientHeight - snap.wy}px`;
    } else {
      textOverlay.style.top = `${snap.wy}px`;
    }

    // Transform: right/bottom CSS already anchor from that edge, no translate needed
    const tx = snap.anchorX === 'center' ? '-50%' : '0';
    const ty = snap.anchorY === 'center' ? '-50%' : '0';
    textOverlay.style.transform = `translate(${tx}, ${ty})`;
  } else {
    // Default: position by center
    textOverlay.style.left = `${textX * wrapper.clientWidth}px`;
    textOverlay.style.top = `${textY * wrapper.clientHeight}px`;
    textOverlay.style.transform = 'translate(-50%, -50%)';
  }
  updateBorderSvg();
}

function clampToSafeArea(x: number, y: number): [number, number] {
  const wrapper = textOverlay.parentElement!;
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  const gapX = SAFETY_GAP / w;
  const gapY = SAFETY_GAP / h;
  return [
    Math.max(gapX, Math.min(1 - gapX, x)),
    Math.max(gapY, Math.min(1 - gapY, y)),
  ];
}

function snapToPoints(rawX: number, rawY: number): [number, number] {
  const wrapper = textOverlay.parentElement!;
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  const snaps = getSnapPoints();

  // Current text center in pixels
  const cx = rawX * w;
  const cy = rawY * h;
  const edges = getTextEdges(cx, cy);

  let bestDist = Infinity;
  let snappedX = rawX;
  let snappedY = rawY;
  let matchedSnap: SnapPoint | null = null;

  // Clear all highlights
  snapGuides.querySelectorAll('.snap-crosshair').forEach(ch => ch.classList.remove('snapped'));

  for (const snap of snaps) {
    // Determine which edge of the text to compare
    let textAnchorX: number;
    if (snap.anchorX === 'left') textAnchorX = edges.left;
    else if (snap.anchorX === 'right') textAnchorX = edges.right;
    else textAnchorX = cx;

    let textAnchorY: number;
    if (snap.anchorY === 'top') textAnchorY = edges.top;
    else if (snap.anchorY === 'bottom') textAnchorY = edges.bottom;
    else textAnchorY = cy;

    const dx = Math.abs(textAnchorX - snap.wx);
    const dy = Math.abs(textAnchorY - snap.wy);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < SNAP_THRESHOLD_PX && dist < bestDist) {
      bestDist = dist;
      matchedSnap = snap;
      // When snapped, applyTextPosition uses snap anchor directly,
      // so just keep rawX/rawY as fallback (won't be used while snapped)
      snappedX = rawX;
      snappedY = rawY;
    }
  }

  // Set active snap for anchor-aware positioning
  activeSnap = matchedSnap;

  if (matchedSnap) {
    const el = snapGuides.querySelector(`[data-snap="${matchedSnap.name}"]`);
    if (el) el.classList.add('snapped');
  }

  return [snappedX, snappedY];
}

// Drag
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

textOverlay.addEventListener('mousedown', (e) => {
  if (textOverlay.classList.contains('editing')) return;
  isDragging = true;
  // When starting a drag, clear the snap so we revert to center-based dragging
  activeSnap = null;
  const rect = textOverlay.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left - rect.width / 2;
  dragOffsetY = e.clientY - rect.top - rect.height / 2;
  // Update textX/textY to center-based from current visual position
  const wrapper = textOverlay.parentElement!;
  const wrapperRect = wrapper.getBoundingClientRect();
  textX = (rect.left + rect.width / 2 - wrapperRect.left) / wrapperRect.width;
  textY = (rect.top + rect.height / 2 - wrapperRect.top) / wrapperRect.height;
  snapGuides.style.display = '';
  snapGuides.classList.add('visible');
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const wrapper = textOverlay.parentElement!;
  const wrapperRect = wrapper.getBoundingClientRect();
  let rawX = (e.clientX - dragOffsetX - wrapperRect.left) / wrapperRect.width;
  let rawY = (e.clientY - dragOffsetY - wrapperRect.top) / wrapperRect.height;
  [rawX, rawY] = clampToSafeArea(rawX, rawY);
  [textX, textY] = snapToPoints(rawX, rawY);
  applyTextPosition();
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    snapGuides.classList.remove('visible');
    setTimeout(() => {
      if (!isDragging) snapGuides.style.display = 'none';
    }, 200);
    // Clear snapped highlights
    snapGuides.querySelectorAll('.snap-crosshair').forEach(ch => ch.classList.remove('snapped'));
  }
});

// Double-click to edit
textOverlay.addEventListener('dblclick', () => {
  textOverlay.classList.add('editing');
  textOverlay.contentEditable = 'true';
  textOverlay.focus();
  const range = document.createRange();
  range.selectNodeContents(textOverlay);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
});

textOverlay.addEventListener('blur', () => {
  textOverlay.classList.remove('editing');
  textOverlay.contentEditable = 'false';
});

textOverlay.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    textOverlay.blur();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.stopPropagation();
  }
});

// Text visibility toggle
textVisibleToggle.addEventListener('change', () => {
  textVisible = textVisibleToggle.checked;
  textOverlay.style.display = textVisible ? '' : 'none';
  borderSvg.style.display = textVisible ? '' : 'none';
  textControls.classList.toggle('hidden', !textVisible);
});

// Font size pills
textSizeRadios.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest('.radio-pill') as HTMLElement | null;
  if (!pill) return;
  const size = pill.dataset.size as TextSizeKey;
  if (size === textSize) return;
  textSize = size;
  textOverlay.style.fontSize = `${TEXT_SIZES[size]}px`;
  textSizeRadios.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
});

// Set initial font size
textOverlay.style.fontSize = `${TEXT_SIZES[textSize]}px`;

// Alignment
textAlignRadios.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest('.radio-pill') as HTMLElement | null;
  if (!pill) return;
  const align = pill.dataset.align as 'left' | 'center' | 'right';
  if (align === textAlign) return;
  textAlign = align;
  textOverlay.style.textAlign = align;
  textAlignRadios.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
});

// Shadow toggle
textShadowToggle.addEventListener('change', () => {
  textShadow = textShadowToggle.checked;
  textOverlay.classList.toggle('has-shadow', textShadow);
});

// --- Text state helpers ---
interface TextState {
  text: string;
  size: TextSizeKey;
  align: 'left' | 'center' | 'right';
  shadow: boolean;
  visible: boolean;
  x: number;
  y: number;
}

const FLOW_NAMES = ['Linear', 'Radial', 'Warp', 'Sky'];

function getTextState(): TextState {
  return {
    text: '',
    size: textSize,
    align: textAlign,
    shadow: textShadow,
    visible: textVisible,
    x: 0.5,
    y: 0.5,
  };
}

function applyTextState(state: TextState) {
  textOverlay.textContent = state.text;
  textSize = state.size || 's';
  textOverlay.style.fontSize = `${TEXT_SIZES[textSize]}px`;
  textSizeRadios.querySelectorAll('.radio-pill').forEach(p => {
    p.classList.toggle('active', (p as HTMLElement).dataset.size === textSize);
  });
  textAlign = state.align;
  textOverlay.style.textAlign = state.align;
  textAlignRadios.querySelectorAll('.radio-pill').forEach(p => {
    p.classList.toggle('active', (p as HTMLElement).dataset.align === state.align);
  });
  textShadow = state.shadow;
  textShadowToggle.checked = state.shadow;
  textOverlay.classList.toggle('has-shadow', state.shadow);
  textVisible = state.visible !== false;
  textVisibleToggle.checked = textVisible;
  textOverlay.style.display = textVisible ? '' : 'none';
  textControls.classList.toggle('hidden', !textVisible);
  textX = state.x;
  textY = state.y;
  activeSnap = null; // reset snap anchor on preset load
  applyTextPosition();
}

// --- Presets (save/load with full state) ---
interface SavedPreset {
  id: string;
  name: string;
  params: GradientParams;
  paletteId: string;
  textState: TextState;
}

function loadSavedPresets(): SavedPreset[] {
  try {
    const data = localStorage.getItem('gradient-app-presets-v2');
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveSavedPresets(presets: SavedPreset[]) {
  localStorage.setItem('gradient-app-presets-v2', JSON.stringify(presets));
}

const presetsListEl = document.getElementById('presets-list')!;

function renderPresets() {
  const presets = loadSavedPresets();
  presetsListEl.innerHTML = '';

  presets.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'preset-item';

    const preview = document.createElement('div');
    preview.className = 'preset-preview';
    preview.style.background = `linear-gradient(90deg, ${preset.params.colors.join(', ')})`;

    const info = document.createElement('div');
    info.className = 'preset-info';

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = preset.name;

    // Build meta info
    const flowName = FLOW_NAMES[preset.params.flow] || 'Mesh';
    const paletteName = palettes.find(p => p.id === preset.paletteId)?.name || '—';
    const sizeName = (preset.textState?.size || 's').toUpperCase();
    const meta = document.createElement('span');
    meta.className = 'preset-meta';
    meta.textContent = `${flowName} · ${paletteName} · ${sizeName}`;

    info.appendChild(name);
    info.appendChild(meta);

    const del = document.createElement('button');
    del.className = 'preset-delete';
    del.textContent = '\u00d7';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      const all = loadSavedPresets().filter(p => p.id !== preset.id);
      saveSavedPresets(all);
      renderPresets();
    });

    item.appendChild(preview);
    item.appendChild(info);
    item.appendChild(del);

    item.addEventListener('click', () => {
      pushHistory();
      params = { ...preset.params, colors: [...preset.params.colors] };
      activePaletteId = preset.paletteId;
      applyTextState(preset.textState);
      syncSlidersFromParams();
      updateFlowRadios();
      updateSlidersVisibility();
      renderPalettes();
      renderGradient();
    });

    presetsListEl.appendChild(item);
  });
}

document.getElementById('btn-save-preset')!.addEventListener('click', () => {
  const name = prompt('Preset name:');
  if (!name) return;
  const presets = loadSavedPresets();
  presets.push({
    id: `preset-${Date.now()}`,
    name,
    params: cloneParams(params),
    paletteId: activePaletteId,
    textState: getTextState(),
  });
  saveSavedPresets(presets);
  renderPresets();
});

// --- Export helper: composite text onto gradient ---
// --- Export resolution ---
let exportWidth = 1920;
let exportHeight = 1080;

const resolutionRadios = document.getElementById('resolution-radios')!;
resolutionRadios.addEventListener('click', (e) => {
  const pill = (e.target as HTMLElement).closest('.radio-pill') as HTMLElement | null;
  if (!pill) return;
  const res = pill.dataset.res;
  if (!res) return;
  const [w, h] = res.split('x').map(Number);
  exportWidth = w;
  exportHeight = h;
  resolutionRadios.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
});

function compositeTextOnCanvas(gradientDataUrl: string, format: 'png' | 'jpeg' | 'webp'): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = exportWidth;
      c.height = exportHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      const text = textVisible ? (textOverlay.innerText || '') : '';
      if (text.trim()) {
        const wrapper = textOverlay.parentElement!;
        const wrapperW = wrapper.clientWidth;
        const wrapperH = wrapper.clientHeight;
        const scaleX = exportWidth / wrapperW;
        const scaleY = exportHeight / wrapperH;
        const screenFontSize = TEXT_SIZES[textSize];
        const exportFontSize = screenFontSize * scaleX;
        const tracking = -0.01; // -1% letter-spacing

        ctx.font = `400 ${exportFontSize}px Kilimanjaro, sans-serif`;
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';

        // Try native letterSpacing (Chrome 99+)
        if ('letterSpacing' in ctx) {
          (ctx as any).letterSpacing = `${exportFontSize * tracking}px`;
        }

        // Get actual rendered position from DOM
        const overlayRect = textOverlay.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const screenLeft = overlayRect.left - wrapperRect.left;
        const screenTop = overlayRect.top - wrapperRect.top;
        const screenCenterX = screenLeft + overlayRect.width / 2;
        const screenCenterY = screenTop + overlayRect.height / 2;

        // Alignment anchor in export space
        ctx.textAlign = textAlign;
        let anchorX: number;
        if (textAlign === 'left') {
          anchorX = screenLeft * scaleX + 32 * scaleX; // account for padding
        } else if (textAlign === 'right') {
          anchorX = (screenLeft + overlayRect.width) * scaleX - 32 * scaleX;
        } else {
          anchorX = screenCenterX * scaleX;
        }

        // Shadow (if enabled)
        if (textShadow) {
          ctx.shadowColor = 'rgba(10, 25, 160, 0.5)';
          ctx.shadowOffsetY = 50 * scaleX;
          ctx.shadowBlur = 100 * scaleX;
        }

        const lines = text.split('\n');
        const lineHeight = exportFontSize * 1.0;
        const totalHeight = lines.length * lineHeight;
        const exportCenterY = screenCenterY * scaleY;
        const startY = exportCenterY - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line, i) => {
          ctx.fillText(line, anchorX, startY + i * lineHeight);
        });
      }

      const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
      resolve(c.toDataURL(mimeMap[format], 1.0));
    };
    img.src = gradientDataUrl;
  });
}

// --- Copy to clipboard (with text) ---
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
btnCopy.addEventListener('click', async () => {
  const gradientDataUrl = renderer.exportImage(params, 'png', exportWidth, exportHeight, glassParams);
  const dataUrl = await compositeTextOnCanvas(gradientDataUrl, 'png');
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    const originalHTML = btnCopy.innerHTML;
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.innerHTML = originalHTML; }, 1500);
  } catch {
    alert('Copy failed — your browser may not support clipboard image writing.');
  }
});

// --- Export (with text) ---
document.querySelectorAll('.btn-export[data-format]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const format = (btn as HTMLElement).dataset.format as 'png' | 'jpeg' | 'webp';
    const gradientDataUrl = renderer.exportImage(params, format, exportWidth, exportHeight, glassParams);
    const dataUrl = await compositeTextOnCanvas(gradientDataUrl, format);
    const link = document.createElement('a');
    link.download = `gradient.${format}`;
    link.href = dataUrl;
    link.click();
  });
});

// --- Resize handler ---
let resizeTimeout: ReturnType<typeof setTimeout>;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    renderGradient();
    applyTextPosition();
  }, 50);
});

// --- Boot ---
// Sync glass toggle (prevent browser caching checked state)
glassToggle.checked = glassParams.enabled;
glassControlsEl.classList.toggle('hidden', !glassParams.enabled);

syncSlidersFromParams();
updateFlowRadios();
renderPalettes();
renderPresets();
renderGradient();
updateUndoButton();
applyTextPosition();
