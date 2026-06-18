const elements = {
  fileInput: document.getElementById("fileInput"),
  processingMode: document.getElementById("processingMode"),
  binarySettings: document.getElementById("binarySettings"),
  ditherSettings: document.getElementById("ditherSettings"),
  threshold: document.getElementById("threshold"),
  thresholdLabel: document.getElementById("thresholdLabel"),
  thresholdValue: document.getElementById("thresholdValue"),
  invert: document.getElementById("invert"),
  ditherPixelSize: document.getElementById("ditherPixelSize"),
  ditherPixelSizeValue: document.getElementById("ditherPixelSizeValue"),
  despeckle: document.getElementById("despeckle"),
  despeckleValue: document.getElementById("despeckleValue"),
  dilate: document.getElementById("dilate"),
  dilateValue: document.getElementById("dilateValue"),
  erode: document.getElementById("erode"),
  erodeValue: document.getElementById("erodeValue"),
  maxSize: document.getElementById("maxSize"),
  maxSizeValue: document.getElementById("maxSizeValue"),
  stampWidth: document.getElementById("stampWidth"),
  baseThickness: document.getElementById("baseThickness"),
  reliefHeight: document.getElementById("reliefHeight"),
  rimWidth: document.getElementById("rimWidth"),
  padding: document.getElementById("padding"),
  mirrorX: document.getElementById("mirrorX"),
  handleWidth: document.getElementById("handleWidth"),
  handleDepth: document.getElementById("handleDepth"),
  handleHeight: document.getElementById("handleHeight"),
  neckHeight: document.getElementById("neckHeight"),
  neckWidth: document.getElementById("neckWidth"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  processedCanvas: document.getElementById("processedCanvas"),
  processedCaption: document.getElementById("processedCaption"),
  svgPreview: document.getElementById("svgPreview"),
  downloadSvg: document.getElementById("downloadSvg"),
  downloadStl: document.getElementById("downloadStl"),
  downloadScad: document.getElementById("downloadScad"),
  summary: document.getElementById("summary"),
};

const state = {
  originalImage: null,
  processedMask: null,
  processedSize: null,
  settings: null,
  svgMeta: null,
  svgText: "",
  svgPreviewUrl: null,
  stlText: "",
  scadText: "",
};

const sourceContext = elements.sourceCanvas.getContext("2d");
const processedContext = elements.processedCanvas.getContext("2d");

function setOutputValue(input, output) {
  output.value = input.value;
}

function initializeControls() {
  [
    [elements.threshold, elements.thresholdValue],
    [elements.ditherPixelSize, elements.ditherPixelSizeValue],
    [elements.despeckle, elements.despeckleValue],
    [elements.dilate, elements.dilateValue],
    [elements.erode, elements.erodeValue],
    [elements.maxSize, elements.maxSizeValue],
  ].forEach(([input, output]) => {
    setOutputValue(input, output);
    input.addEventListener("input", () => {
      setOutputValue(input, output);
      regenerate();
    });
  });

  [
    elements.processingMode,
    elements.invert,
    elements.stampWidth,
    elements.baseThickness,
    elements.reliefHeight,
    elements.rimWidth,
    elements.padding,
    elements.mirrorX,
    elements.handleWidth,
    elements.handleDepth,
    elements.handleHeight,
    elements.neckHeight,
    elements.neckWidth,
  ].forEach((input) => {
    input.addEventListener("input", regenerate);
    input.addEventListener("change", regenerate);
  });

  elements.processingMode.addEventListener("change", updateProcessingModeControls);
  elements.fileInput.addEventListener("change", handleFileSelect);
  elements.downloadSvg.addEventListener("click", () => {
    downloadText("stamp_art.svg", state.svgText, "image/svg+xml");
  });
  elements.downloadStl.addEventListener("click", handleStlDownload);
  elements.downloadScad.addEventListener("click", handleScadDownload);
  updateProcessingModeControls();
}

function updateProcessingModeControls() {
  const isBinary = elements.processingMode.value === "binary";
  elements.thresholdLabel.textContent = isBinary ? "しきい値" : "濃淡の基準";
  elements.binarySettings.hidden = !isBinary;
  elements.binarySettings.setAttribute("aria-hidden", String(!isBinary));
  elements.ditherSettings.hidden = isBinary;
  elements.ditherSettings.setAttribute("aria-hidden", String(isBinary));

  [elements.despeckle, elements.dilate, elements.erode].forEach((input) => {
    input.disabled = !isBinary;
  });
  elements.ditherPixelSize.disabled = isBinary;
}

function handleFileSelect(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.originalImage = image;
      drawSourceImage();
      regenerate();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function drawSourceImage() {
  const { originalImage } = state;
  if (!originalImage) {
    return;
  }

  const scale = Math.min(
    elements.sourceCanvas.width / originalImage.width,
    elements.sourceCanvas.height / originalImage.height
  );
  const width = originalImage.width * scale;
  const height = originalImage.height * scale;
  const x = (elements.sourceCanvas.width - width) / 2;
  const y = (elements.sourceCanvas.height - height) / 2;

  sourceContext.clearRect(0, 0, elements.sourceCanvas.width, elements.sourceCanvas.height);
  sourceContext.fillStyle = "#ffffff";
  sourceContext.fillRect(0, 0, elements.sourceCanvas.width, elements.sourceCanvas.height);
  sourceContext.drawImage(originalImage, x, y, width, height);
}

function regenerate() {
  if (!state.originalImage) {
    return;
  }

  const settings = getSettings();
  const processed = buildMaskFromImage(state.originalImage, settings);
  const mask = postProcessMask(processed.mask, processed.width, processed.height, settings);

  state.processedMask = mask;
  state.processedSize = { width: processed.width, height: processed.height };
  state.settings = settings;

  drawProcessedMask(mask, processed.width, processed.height);

  const svgData = generateSvg(mask, processed.width, processed.height, settings);
  state.svgMeta = svgData.meta;
  state.svgText = svgData.text;
  state.stlText = "";
  state.scadText = "";

  elements.downloadSvg.disabled = false;
  elements.downloadStl.disabled = false;
  elements.downloadScad.disabled = false;
  renderSvgPreview(svgData.preview);
  elements.summary.textContent = buildSummary(svgData.meta, settings);
}

function ensureStlOutput() {
  if (state.stlText) {
    return state.stlText;
  }

  if (!state.processedMask || !state.svgMeta || !state.settings) {
    throw new Error("STL出力に必要なデータがまだ準備できていません。");
  }

  state.stlText = generateStl(state.processedMask, state.svgMeta, state.settings);
  return state.stlText;
}

function ensureScadOutput() {
  if (state.scadText) {
    return state.scadText;
  }

  if (!state.svgMeta || !state.settings) {
    throw new Error("OpenSCAD出力に必要なデータがまだ準備できていません。");
  }

  state.scadText = generateScad(state.svgMeta, state.settings);
  return state.scadText;
}

function handleStlDownload() {
  setBusy(elements.downloadStl, true, "STL生成中...");
  try {
    const stlText = ensureStlOutput();
    downloadText("stamp_model.stl", stlText, "application/sla");
    elements.summary.textContent = "STLを生成して保存しました。Creality Print や Cura にそのまま読み込めます。";
  } catch (error) {
    console.error("STL export failed:", error);
    elements.summary.textContent = `STL生成に失敗しました: ${error.message}`;
  } finally {
    setBusy(elements.downloadStl, false, "STLを保存");
  }
}

function handleScadDownload() {
  try {
    const scadText = ensureScadOutput();
    downloadText("stamp_model.scad", scadText, "text/plain");
    elements.summary.textContent = "OpenSCADファイルを保存しました。必要ならOpenSCADで形状を調整できます。";
  } catch (error) {
    console.error("OpenSCAD export failed:", error);
    elements.summary.textContent = `OpenSCAD生成に失敗しました: ${error.message}`;
  }
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function getSettings() {
  return {
    processingMode: elements.processingMode.value,
    threshold: Number(elements.threshold.value),
    invert: elements.invert.checked,
    ditherPixelSize: Number(elements.ditherPixelSize.value),
    despeckle: Number(elements.despeckle.value),
    dilate: Number(elements.dilate.value),
    erode: Number(elements.erode.value),
    maxSize: Number(elements.maxSize.value),
    stampWidth: Number(elements.stampWidth.value),
    baseThickness: Number(elements.baseThickness.value),
    reliefHeight: Number(elements.reliefHeight.value),
    rimWidth: Number(elements.rimWidth.value),
    padding: Number(elements.padding.value),
    mirrorX: elements.mirrorX.checked,
    handleWidth: Number(elements.handleWidth.value),
    handleDepth: Number(elements.handleDepth.value),
    handleHeight: Number(elements.handleHeight.value),
    neckHeight: Number(elements.neckHeight.value),
    neckWidth: Number(elements.neckWidth.value),
  };
}

function buildMaskFromImage(image, settings) {
  const scale = Math.min(1, settings.maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  const grayValues = getGrayscaleValues(context.getImageData(0, 0, width, height).data);
  const mask =
    settings.processingMode === "dither"
      ? buildDitherMask(grayValues, width, height, settings)
      : buildBinaryMask(grayValues, settings);

  return { mask, width, height };
}

function getGrayscaleValues(imageData) {
  const grayValues = new Float32Array(imageData.length / 4);
  for (let index = 0; index < grayValues.length; index += 1) {
    const offset = index * 4;
    const r = imageData[offset];
    const g = imageData[offset + 1];
    const b = imageData[offset + 2];
    const a = imageData[offset + 3] / 255;
    grayValues[index] = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
  }
  return grayValues;
}

function buildBinaryMask(grayValues, settings) {
  const mask = new Uint8Array(grayValues.length);
  for (let index = 0; index < grayValues.length; index += 1) {
    const gray = grayValues[index];
    const isDark = gray < settings.threshold;
    mask[index] = settings.invert ? Number(!isDark) : Number(isDark);
  }

  return mask;
}

function buildDitherMask(grayValues, width, height, settings) {
  const blockSize = Math.max(1, Math.round(settings.ditherPixelSize));
  if (blockSize > 1) {
    return buildBlockDitherMask(grayValues, width, height, settings, blockSize);
  }

  const values = new Float32Array(grayValues);
  const mask = new Uint8Array(values.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const oldGray = clamp(values[index], 0, 255);
      const isDark = oldGray < settings.threshold;
      const newGray = isDark ? 0 : 255;
      const error = oldGray - newGray;

      mask[index] = settings.invert ? Number(!isDark) : Number(isDark);
      spreadDitherError(values, width, height, x + 1, y, error * (7 / 16));
      spreadDitherError(values, width, height, x - 1, y + 1, error * (3 / 16));
      spreadDitherError(values, width, height, x, y + 1, error * (5 / 16));
      spreadDitherError(values, width, height, x + 1, y + 1, error * (1 / 16));
    }
  }

  return mask;
}

function buildBlockDitherMask(grayValues, width, height, settings, blockSize) {
  const blockWidth = Math.ceil(width / blockSize);
  const blockHeight = Math.ceil(height / blockSize);
  const blockValues = new Float32Array(blockWidth * blockHeight);

  for (let blockY = 0; blockY < blockHeight; blockY += 1) {
    for (let blockX = 0; blockX < blockWidth; blockX += 1) {
      let total = 0;
      let count = 0;
      const startX = blockX * blockSize;
      const startY = blockY * blockSize;
      const endX = Math.min(width, startX + blockSize);
      const endY = Math.min(height, startY + blockSize);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          total += grayValues[y * width + x];
          count += 1;
        }
      }

      blockValues[blockY * blockWidth + blockX] = total / count;
    }
  }

  const blockMask = buildDitherMask(blockValues, blockWidth, blockHeight, {
    ...settings,
    ditherPixelSize: 1,
  });
  const mask = new Uint8Array(width * height);

  for (let blockY = 0; blockY < blockHeight; blockY += 1) {
    for (let blockX = 0; blockX < blockWidth; blockX += 1) {
      const value = blockMask[blockY * blockWidth + blockX];
      const startX = blockX * blockSize;
      const startY = blockY * blockSize;
      const endX = Math.min(width, startX + blockSize);
      const endY = Math.min(height, startY + blockSize);

      for (let y = startY; y < endY; y += 1) {
        mask.fill(value, y * width + startX, y * width + endX);
      }
    }
  }

  return mask;
}

function spreadDitherError(values, width, height, x, y, error) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  values[y * width + x] += error;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function postProcessMask(inputMask, width, height, settings) {
  let mask = new Uint8Array(inputMask);

  if (settings.processingMode === "dither") {
    return mask;
  }

  for (let pass = 0; pass < settings.despeckle; pass += 1) {
    mask = despeckle(mask, width, height);
  }

  for (let pass = 0; pass < settings.dilate; pass += 1) {
    mask = dilate(mask, width, height);
  }

  for (let pass = 0; pass < settings.erode; pass += 1) {
    mask = erode(mask, width, height);
  }

  return mask;
}

function despeckle(mask, width, height) {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const count = countNeighbors(mask, width, height, x, y);
      next[index] = count >= 3 ? 1 : 0;
    }
  }
  return next;
}

function dilate(mask, width, height) {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let filled = 0;
      for (let oy = -1; oy <= 1 && !filled; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx]) {
            filled = 1;
            break;
          }
        }
      }
      next[y * width + x] = filled;
    }
  }
  return next;
}

function erode(mask, width, height) {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let filled = 1;
      for (let oy = -1; oy <= 1 && filled; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            filled = 0;
            break;
          }
        }
      }
      next[y * width + x] = filled;
    }
  }
  return next;
}

function countNeighbors(mask, width, height, x, y) {
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      count += mask[ny * width + nx];
    }
  }
  return count;
}

function drawProcessedMask(mask, width, height) {
  elements.processedCaption.textContent =
    state.settings?.processingMode === "dither" ? "ディザ後" : "2値化後";

  const imageData = processedContext.createImageData(width, height);
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index] ? 0 : 255;
    const offset = index * 4;
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.putImageData(imageData, 0, 0);

  processedContext.clearRect(0, 0, elements.processedCanvas.width, elements.processedCanvas.height);
  processedContext.fillStyle = "#ffffff";
  processedContext.fillRect(0, 0, elements.processedCanvas.width, elements.processedCanvas.height);

  const scale = Math.min(
    elements.processedCanvas.width / width,
    elements.processedCanvas.height / height
  );
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const x = (elements.processedCanvas.width - drawWidth) / 2;
  const y = (elements.processedCanvas.height - drawHeight) / 2;
  processedContext.imageSmoothingEnabled = false;
  processedContext.drawImage(canvas, x, y, drawWidth, drawHeight);
}

function generateSvg(mask, width, height, settings) {
  const filledBounds = findBounds(mask, width, height);
  const pixelSize = settings.stampWidth / width;
  const artWidth = width * pixelSize;
  const artHeight = height * pixelSize;
  const totalWidth = artWidth + settings.padding * 2;
  const totalHeight = artHeight + settings.padding * 2;
  const mirrorTransform = settings.mirrorX ? `translate(${totalWidth} 0) scale(-1 1)` : "";

  const rects = [];
  let filledCount = 0;

  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      if (!mask[y * width + x]) {
        x += 1;
        continue;
      }

      const start = x;
      while (x < width && mask[y * width + x]) {
        filledCount += 1;
        x += 1;
      }

      rects.push(
        `<rect x="${(settings.padding + start * pixelSize).toFixed(3)}" y="${(
          settings.padding + y * pixelSize
        ).toFixed(3)}" width="${((x - start) * pixelSize).toFixed(3)}" height="${pixelSize.toFixed(
          3
        )}" />`
      );
    }
  }

  const rimRect =
    settings.rimWidth > 0
      ? `<rect x="0" y="0" width="${totalWidth.toFixed(3)}" height="${totalHeight.toFixed(
          3
        )}" fill="none" stroke="black" stroke-width="${settings.rimWidth.toFixed(3)}" />`
      : "";

  const artGroup = mirrorTransform
    ? `<g transform="${mirrorTransform}">${rects.join("")}</g>`
    : rects.join("");
  const content = `${rimRect}${artGroup}`;
  const svgText =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth.toFixed(3)}mm" height="${totalHeight.toFixed(
      3
    )}mm" viewBox="0 0 ${totalWidth.toFixed(3)} ${totalHeight.toFixed(
      3
    )}" shape-rendering="crispEdges">\n` +
    `  <rect width="100%" height="100%" fill="white"/>\n` +
    `  <g fill="black">\n    ${content}\n  </g>\n` +
    `</svg>\n`;
  const previewText =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(
      3
    )} ${totalHeight.toFixed(3)}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="white"/>` +
    `<g fill="black">${content}</g>` +
    `</svg>`;

  return {
    text: svgText,
    preview: previewText,
    meta: {
      artWidth,
      artHeight,
      totalWidth,
      totalHeight,
      filledCount,
      bounds: filledBounds,
      pixelSize,
    },
  };
}

function findBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX === -1) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function renderSvgPreview(svgText) {
  try {
    if (state.svgPreviewUrl) {
      URL.revokeObjectURL(state.svgPreviewUrl);
      state.svgPreviewUrl = null;
    }

    const encoded = window.btoa(unescape(encodeURIComponent(svgText)));
    const dataUrl = `data:image/svg+xml;base64,${encoded}`;
    state.svgPreviewUrl = dataUrl;
    elements.svgPreview.innerHTML = `<img src="${dataUrl}" alt="SVG preview" />`;
  } catch (error) {
    console.error("SVG preview failed:", error);
    elements.svgPreview.textContent = "SVGプレビューを表示できませんでした。保存したSVGファイルで確認してください。";
  }
}

function generateScad(meta, settings) {
  const baseX = meta.totalWidth;
  const baseY = meta.totalHeight;
  const neckX = Math.min(settings.neckWidth, baseX - 4);
  const neckY = Math.min(settings.neckWidth, baseY - 4);

  return `stamp_base_x = ${baseX.toFixed(3)};
stamp_base_y = ${baseY.toFixed(3)};
base_thickness = ${settings.baseThickness.toFixed(3)};
relief_height = ${settings.reliefHeight.toFixed(3)};
handle_width = ${settings.handleWidth.toFixed(3)};
handle_depth = ${settings.handleDepth.toFixed(3)};
handle_height = ${settings.handleHeight.toFixed(3)};
neck_height = ${settings.neckHeight.toFixed(3)};
neck_width = ${Math.max(4, neckX).toFixed(3)};
neck_depth = ${Math.max(4, neckY).toFixed(3)};

$fn = 48;

module stamp_art() {
  linear_extrude(height = relief_height)
    import("stamp_art.svg");
}

module base_plate() {
  translate([0, 0, relief_height])
    cube([stamp_base_x, stamp_base_y, base_thickness], center = false);
}

module handle() {
  translate([stamp_base_x / 2, stamp_base_y / 2, relief_height + base_thickness])
    union() {
      if (neck_height > 0)
        linear_extrude(height = neck_height, scale = 0.7)
          square([neck_width, neck_depth], center = true);

      translate([0, 0, neck_height])
        hull() {
          translate([0, 0, 0])
            cylinder(h = 0.01, d = min(handle_width, handle_depth));
          translate([0, 0, handle_height])
            sphere(d = max(handle_width, handle_depth));
        }
    }
}

union() {
  stamp_art();
  base_plate();
  handle();
}
`;
}

function generateStl(mask, meta, settings) {
  const facets = [];
  const baseX = meta.totalWidth;
  const baseY = meta.totalHeight;
  const baseZ = settings.baseThickness;
  const reliefZ = settings.reliefHeight;
  const pixelSize = meta.pixelSize;

  addBox(facets, [0, 0, reliefZ], [baseX, baseY, baseZ]);

  for (let y = 0; y < state.processedSize.height; y += 1) {
    let x = 0;
    while (x < state.processedSize.width) {
      if (!mask[y * state.processedSize.width + x]) {
        x += 1;
        continue;
      }

      const start = x;
      while (x < state.processedSize.width && mask[y * state.processedSize.width + x]) {
        x += 1;
      }

      const runStart = settings.padding + start * pixelSize;
      const runWidth = (x - start) * pixelSize;
      const runY = settings.padding + y * pixelSize;
      const mirroredX = settings.mirrorX ? baseX - runStart - runWidth : runStart;
      addBox(
        facets,
        [mirroredX, runY, 0],
        [runWidth, pixelSize, settings.reliefHeight]
      );
    }
  }

  const neckWidth = Math.max(4, Math.min(settings.neckWidth, baseX - 4));
  const neckDepth = Math.max(4, Math.min(settings.neckWidth, baseY - 4));
  const neckX = (baseX - neckWidth) / 2;
  const neckY = (baseY - neckDepth) / 2;
  const neckZ = reliefZ + baseZ;

  if (settings.neckHeight > 0) {
    addBox(facets, [neckX, neckY, neckZ], [neckWidth, neckDepth, settings.neckHeight]);
  }

  const handleBaseZ = reliefZ + baseZ + settings.neckHeight;
  addFrustum(
    facets,
    [baseX / 2, baseY / 2, handleBaseZ],
    Math.max(neckWidth, neckDepth) * 0.42,
    Math.max(settings.handleWidth, settings.handleDepth) * 0.28,
    Math.max(3, settings.handleHeight * 0.3),
    24
  );
  addEllipticCylinder(
    facets,
    [baseX / 2, baseY / 2, handleBaseZ + Math.max(3, settings.handleHeight * 0.3)],
    settings.handleWidth / 2,
    settings.handleDepth / 2,
    Math.max(4, settings.handleHeight * 0.7),
    32
  );

  const lines = ["solid stamp_model"];
  for (const facet of facets) {
    lines.push(
      `  facet normal ${facet.normal.map(formatStlNumber).join(" ")}`,
      "    outer loop",
      `      vertex ${facet.a.map(formatStlNumber).join(" ")}`,
      `      vertex ${facet.b.map(formatStlNumber).join(" ")}`,
      `      vertex ${facet.c.map(formatStlNumber).join(" ")}`,
      "    endloop",
      "  endfacet"
    );
  }
  lines.push("endsolid stamp_model", "");
  return lines.join("\n");
}

function addBox(facets, origin, size) {
  const [x, y, z] = origin;
  const [sx, sy, sz] = size;
  const p = {
    "000": [x, y, z],
    "100": [x + sx, y, z],
    "110": [x + sx, y + sy, z],
    "010": [x, y + sy, z],
    "001": [x, y, z + sz],
    "101": [x + sx, y, z + sz],
    "111": [x + sx, y + sy, z + sz],
    "011": [x, y + sy, z + sz],
  };

  addQuad(facets, p["001"], p["101"], p["111"], p["011"]);
  addQuad(facets, p["000"], p["010"], p["110"], p["100"]);
  addQuad(facets, p["000"], p["001"], p["011"], p["010"]);
  addQuad(facets, p["100"], p["110"], p["111"], p["101"]);
  addQuad(facets, p["010"], p["011"], p["111"], p["110"]);
  addQuad(facets, p["000"], p["100"], p["101"], p["001"]);
}

function addFrustum(facets, center, rBottom, rTop, height, segments) {
  const [cx, cy, cz] = center;
  const bottom = [];
  const top = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    bottom.push([cx + cos * rBottom, cy + sin * rBottom, cz]);
    top.push([cx + cos * rTop, cy + sin * rTop, cz + height]);
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    addQuad(facets, bottom[i], bottom[next], top[next], top[i]);
  }

  addFan(facets, [cx, cy, cz], bottom, true);
  addFan(facets, [cx, cy, cz + height], top, false);
}

function addEllipticCylinder(facets, center, rx, ry, height, segments) {
  const [cx, cy, cz] = center;
  const bottom = [];
  const top = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    bottom.push([cx + cos * rx, cy + sin * ry, cz]);
    top.push([cx + cos * rx, cy + sin * ry, cz + height]);
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    addQuad(facets, bottom[i], bottom[next], top[next], top[i]);
  }

  addFan(facets, [cx, cy, cz], bottom, true);
  addFan(facets, [cx, cy, cz + height], top, false);
}

function addFan(facets, center, ring, flip) {
  for (let i = 0; i < ring.length; i += 1) {
    const next = (i + 1) % ring.length;
    if (flip) {
      addTriangle(facets, center, ring[next], ring[i]);
    } else {
      addTriangle(facets, center, ring[i], ring[next]);
    }
  }
}

function addQuad(facets, a, b, c, d) {
  addTriangle(facets, a, b, c);
  addTriangle(facets, a, c, d);
}

function addTriangle(facets, a, b, c) {
  const normal = computeNormal(a, b, c);
  facets.push({ normal, a, b, c });
}

function computeNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function formatStlNumber(value) {
  return Number(value).toFixed(6);
}

function buildSummary(meta, settings) {
  if (!meta.bounds) {
    return "黒い画素が見つかりませんでした。しきい値や反転設定を見直してください。";
  }

  return [
    `変換方式は ${settings.processingMode === "dither" ? "ディザ" : "2値化"} です。`,
    settings.processingMode === "dither" ? `ディザ画素サイズは ${settings.ditherPixelSize}px です。` : "",
    `加工後サイズは ${meta.totalWidth.toFixed(1)}mm x ${meta.totalHeight.toFixed(1)}mm です。`,
    `模様部分の高さは ${settings.reliefHeight.toFixed(1)}mm、ベース厚は ${settings.baseThickness.toFixed(
      1
    )}mm に設定されています。`,
    `STLはブラウザ内で直接生成し、SVGとOpenSCADも必要に応じて保存できます。`,
  ]
    .filter(Boolean)
    .join(" ");
}

function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

initializeControls();
