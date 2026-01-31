const MODULE_ID = "fp-infinite-z-los";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "losMode", {
    name: "Line of Sight Mode",
    hint: "Choose how vertical LOS is calculated",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "original": "Original",
      "vertical": "Vertical Column",
    },
    default: "vertical",
    requiresReload: false,
    onChange: () => refreshVision(),
  });

  game.settings.register(MODULE_ID, "checkVerticalLight", {
    name: "Check Vertical Light",
    hint: "When enabled, light range limits apply vertically like in normal Levels.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refreshVision(),
  });
});

function refreshVision() {
  if (canvas.ready) {
    canvas.perception.update({
      initializeLighting: true,
      initializeVision: true,
      refreshLighting: true,
      refreshVision: true,
    });
  }
}

Hooks.once("ready", () => {
  if (!globalThis.libWrapper || !CONFIG.Levels?.handlers?.SightHandler) return;

  try {
    // Wrap testCollision
    libWrapper.register(
      MODULE_ID,
      "CONFIG.Levels.handlers.SightHandler.testCollision",
      function (wrapped, p0, p1, type = "sight", options = {}) {
        const mode = game.settings.get(MODULE_ID, "losMode");
        const checkVerticalLight = game.settings.get(MODULE_ID, "checkVerticalLight");
        
        if (mode === "original") {
          return wrapped(p0, p1, type, options);
        } else if (mode === "vertical") {
          return verticalColumnLOS(wrapped, p0, p1, type, options, checkVerticalLight);
        } else if (mode === "angled") {
          return angledRayLOS(wrapped, p0, p1, type, options, checkVerticalLight);
        }
        
        return wrapped(p0, p1, type, options);
      },
      "WRAPPER"
    );

    // Override testInLight
    const originalTestInLight = CONFIG.Levels.handlers.SightHandler.testInLight;
    CONFIG.Levels.handlers.SightHandler.testInLight = function(object, testTarget, source, result) {
      const checkVerticalLight = game.settings.get(MODULE_ID, "checkVerticalLight");
      
      if (!checkVerticalLight) {
        if (result) return result;
        return result;
      }
      
      return originalTestInLight.call(this, object, testTarget, source, result);
    };

  } catch (err) {
    console.error(`${MODULE_ID} | Failed to wrap`, err);
  }
});

function verticalColumnLOS(wrapped, p0, p1, type, options, checkVerticalLight) {
  const sourceZ = p0.z;
  const targetZ = p1.z;
  
  if (sourceZ === targetZ) {
    return wrapped(p0, p1, type, options);
  }

  const minZ = Math.min(sourceZ, targetZ);
  const maxZ = Math.max(sourceZ, targetZ);
  const ALPHATTHRESHOLD = type === "sight" ? 0.99 : 0.1;

  const flatCheck = wrapped({ ...p0, z: sourceZ }, { ...p1, z: sourceZ }, type, options);
  if (flatCheck) {
    return flatCheck;
  }

  const bgElevation = canvas?.scene?.flags?.levels?.backgroundElevation ?? 0;
  if (minZ < bgElevation && bgElevation < maxZ) {
    return { x: p1.x, y: p1.y, z: bgElevation };
  }

  for (const tile of canvas.tiles.placeables) {
    if (tile.document.flags?.levels?.noCollision) continue;
    const tileBottom = tile.document.elevation ?? -Infinity;
    if (tileBottom === -Infinity) continue;

    if (minZ < tileBottom && tileBottom < maxZ) {
      if (tile.mesh?.containsCanvasPoint({ x: p1.x, y: p1.y }, ALPHATTHRESHOLD)) {
        return { x: p1.x, y: p1.y, z: tileBottom };
      }
    }
  }

  return false;
}

function angledRayLOS(wrapped, p0, p1, type, options, checkVerticalLight) {
  return wrapped(p0, p1, type, options);
}