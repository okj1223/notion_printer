(function () {
  function showRuntimeFailure(message) {
    try {
      var body = document.body || document.documentElement;
      if (!body) return;
      var box = document.createElement('div');
      box.className = 'print-runtime-error-banner';
      box.textContent = 'Notion Printer runtime error: ' + message;
      body.insertBefore(box, body.firstChild);
    } catch (error) {
      console.error('Notion Printer runtime error:', message);
    }
  }

  window.addEventListener('error', function (event) {
    var detail = event && (event.message || (event.error && event.error.message)) || 'unknown error';
    showRuntimeFailure(detail);
  });

  try {
  if (document.documentElement.dataset.notionPrinterReady === 'true') return;
  document.documentElement.dataset.notionPrinterReady = 'true';

  var properties = document.querySelector('header > .properties');
  if (properties) properties.remove();
  var pageHeaderIcon = document.querySelector('header > .page-header-icon');
  if (pageHeaderIcon) pageHeaderIcon.remove();
  var breakCandidates = [];
  var breakOverrideMap = {};
  var spaceOverrideMap = {};
  var pullUpOverrideMap = {};
  var viewSettings = { font: 'normal', spacing: 'normal' };
  var textOverrideMap = {};
  var deletedNodeMap = {};
  var manualGapMap = {};
  var imageScaleMap = {};
  var editorList = null;
  var editorPageSelect = null;
  var editorBlockSelect = null;
  var editorFontSelect = null;
  var editorSpacingSelect = null;
  var editorPanel = null;
  var editorLauncher = null;
  var editorPanelToggleButton = null;
  var editorBannerRecommendationButton = null;
  var editorBannerSummary = null;
  var editorPanelSummary = null;
  var editorListMeta = null;
  var editorNote = null;
  var editorTextEditToggle = null;
  var editorFilterButtons = {};
  var editorUiState = { open: false, filter: 'all' };
  var draggingCandidateId = null;
  var editorBanner = null;
  var editorUiBootstrapped = false;
  var directManipulationObserver = null;
  var directManipulationRetryTimer = null;
  var directManipulationRefreshQueuedWhileDragging = false;
  var editorBootstrapObserver = null;
  var textEditModeEnabled = false;
  var pageSidebar = null;
  var pageSidebarList = null;
  var pageSidebarToggleButton = null;
  var pageSidebarOpen = true;
  var pageSidebarSyncScheduled = false;
  var pageSidebarActivePageNumber = '';
  var pageSidebarRefreshTimer = null;
  var pageSidebarEmptyAttemptCount = 0;
  var pagedReadyObserver = null;
  var pageSidebarHydrationTimer = null;
  var pageSidebarHydrationVersion = 0;
  var storageVersion = 'v8';
  var renderedDomHistory = [];
  var reloadFocusRestoreScheduled = false;
  var autoOptimizeResumeScheduled = false;
  var manifestStorageSalt = '';
  var manifestDocumentId = '';
  var manifestOutputName = '';
  var manifestVariantName = '';
  var manifestSourceHash = '';
  var manifestIsCompactVariant = false;
  var manifestUiDefaultMode = 'minimal';
  var uiMode = 'minimal';
  var selectedTargetState = { kind: '', candidateId: '', persistId: '', pageNumber: 0 };
  var selectedImageIds = [];
  var imageResizeDragState = null;
  var imageScaleSliderDragState = null;
  var figureToolRefreshScheduled = false;
  var pendingFigureToolRefreshIds = {};
  var listBreakRootCounter = 0;
  var queuedReloadNotice = '';
  var storedRenderedLayoutApplied = false;
  var minimumImageScalePct = 5;
  var imageScaleStepPct = 0.1;

  function readManifestPayload() {
    try {
      var node = document.getElementById('notion-printer-manifest');
      if (!node || !node.textContent) return null;
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  }

  function storageDocumentKey() {
    var base = location.pathname || document.title || 'document';
    if (manifestDocumentId) {
      return manifestDocumentId + '::' + (manifestIsCompactVariant ? 'compact' : 'print');
    }
    if (!manifestStorageSalt) return base;
    return base + '::' + manifestStorageSalt;
  }

  (function primeManifestStorageSalt() {
    var manifest = readManifestPayload();
    if (!manifest || typeof manifest !== 'object') return;
    manifestDocumentId = typeof manifest.document_id === 'string' ? manifest.document_id : '';
    manifestOutputName = typeof manifest.output_name === 'string' ? manifest.output_name : '';
    manifestVariantName = typeof manifest.variant === 'string' ? manifest.variant : '';
    manifestSourceHash = typeof manifest.source_hash === 'string' ? manifest.source_hash : '';
    manifestIsCompactVariant = !!manifest.is_compact_variant;
    manifestUiDefaultMode = /^(full|minimal)$/.test(String(manifest.ui_default_mode || '')) ? String(manifest.ui_default_mode) : 'minimal';
    var generatedAt = typeof manifest.generated_at === 'string' ? manifest.generated_at : '';
    var outputName = typeof manifest.output_name === 'string' ? manifest.output_name : '';
    var sourceHash = typeof manifest.source_hash === 'string' ? manifest.source_hash : '';
    manifestStorageSalt = generatedAt || [outputName, sourceHash].filter(Boolean).join('::');
  })();

  function resolveUiMode() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var requested = String(params.get('np_ui') || '').trim();
      if (/^(full|minimal)$/.test(requested)) {
        return requested;
      }
    } catch (error) {
      // Ignore query parsing issues and continue with manifest defaults.
    }
    return manifestUiDefaultMode || 'minimal';
  }

  function applyUiMode(mode) {
    uiMode = /^(full|minimal)$/.test(String(mode || '')) ? String(mode) : 'minimal';
    if (document.body) {
      document.body.classList.toggle('print-ui-minimal', uiMode === 'minimal');
      document.body.classList.toggle('print-ui-full', uiMode === 'full');
    }
    pruneEditorBannerForMinimalMode();
  }

  function uniqueNonEmptyStrings(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(function (value) {
      var normalized = String(value || '');
      if (!normalized || seen[normalized]) return false;
      seen[normalized] = true;
      return true;
    });
  }

  function siblingVariantOutputNames(outputName) {
    var name = String(outputName || '');
    if (!name) return [];
    if (/_print_compact_fast\.html$/i.test(name)) {
      return [name.replace(/_print_compact_fast\.html$/i, '_print_compact.html')];
    }
    if (/_print_compact\.html$/i.test(name)) {
      return [name.replace(/_print_compact\.html$/i, '_print_compact_fast.html')];
    }
    if (/_print_fast\.html$/i.test(name)) {
      return [name.replace(/_print_fast\.html$/i, '_print.html')];
    }
    if (/_print\.html$/i.test(name)) {
      return [name.replace(/_print\.html$/i, '_print_fast.html')];
    }
    return [];
  }

  function legacyStorageMatchTokens() {
    var tokens = [];
    if (location.pathname) tokens.push(location.pathname);
    if (manifestOutputName) tokens.push(manifestOutputName);
    siblingVariantOutputNames(manifestOutputName).forEach(function (name) {
      tokens.push(name);
    });
    if (manifestVariantName) tokens.push(manifestVariantName);
    if (manifestSourceHash) tokens.push(manifestSourceHash.slice(0, 12));
    return uniqueNonEmptyStrings(tokens);
  }

  function parsedStoredValue(raw) {
    if (typeof raw !== 'string' || !raw.length) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw;
    }
  }

  function storedValueHasContent(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return !!value;
  }

  function legacyStorageTimestamp(key) {
    var match = String(key || '').match(/::(\d{4}-\d{2}-\d{2}T[^:]+:[^:]+:[^Z]+Z)$/);
    return match ? match[1] : '';
  }

  function compareLegacyStorageKeys(leftKey, rightKey) {
    var leftTimestamp = legacyStorageTimestamp(leftKey);
    var rightTimestamp = legacyStorageTimestamp(rightKey);
    if (leftTimestamp && rightTimestamp && leftTimestamp !== rightTimestamp) {
      return leftTimestamp.localeCompare(rightTimestamp);
    }
    if (leftTimestamp && !rightTimestamp) return 1;
    if (!leftTimestamp && rightTimestamp) return -1;
    return String(leftKey || '').localeCompare(String(rightKey || ''));
  }

  function renderedOrderScore(layout) {
    if (!Array.isArray(layout)) return 0;
    return layout.reduce(function (score, pageEntry) {
      var ids = Array.isArray(pageEntry && pageEntry.ids) ? pageEntry.ids.filter(Boolean) : [];
      return score + ids.length + (ids.length ? 1 : 0);
    }, 0);
  }

  function mergeHistoryEntries(values) {
    var merged = [];
    var seen = {};
    (Array.isArray(values) ? values : []).forEach(function (entryList) {
      if (!Array.isArray(entryList)) return;
      entryList.forEach(function (entry) {
        var signature = '';
        try {
          signature = JSON.stringify(entry);
        } catch (error) {
          signature = '';
        }
        if (!signature || seen[signature]) return;
        seen[signature] = true;
        merged.push(entry);
      });
    });
    if (merged.length > 80) {
      return merged.slice(merged.length - 80);
    }
    return merged;
  }

  function mergedLegacyStorageValue(namespacePrefix, currentValue, matchedEntries) {
    var entries = (Array.isArray(matchedEntries) ? matchedEntries : []).slice().sort(function (left, right) {
      return compareLegacyStorageKeys(left.key, right.key);
    });

    if (namespacePrefix.indexOf('notion-printer-rendered-order::') === 0) {
      var bestLayout = Array.isArray(currentValue) ? currentValue : [];
      var bestScore = renderedOrderScore(bestLayout);
      entries.forEach(function (entry) {
        var score = renderedOrderScore(entry.value);
        if (score > bestScore) {
          bestLayout = entry.value;
          bestScore = score;
        }
      });
      return bestLayout;
    }

    if (namespacePrefix.indexOf('notion-printer-history::') === 0) {
      var historySources = entries.map(function (entry) { return entry.value; });
      if (Array.isArray(currentValue) && currentValue.length) {
        historySources.push(currentValue);
      }
      return mergeHistoryEntries(historySources);
    }

    if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      var mergedObject = {};
      entries.forEach(function (entry) {
        if (!entry.value || typeof entry.value !== 'object' || Array.isArray(entry.value)) return;
        Object.keys(entry.value).forEach(function (key) {
          mergedObject[key] = entry.value[key];
        });
      });
      Object.keys(currentValue).forEach(function (key) {
        mergedObject[key] = currentValue[key];
      });
      return mergedObject;
    }

    if (!storedValueHasContent(currentValue)) {
      var lastValue = null;
      entries.forEach(function (entry) {
        if (storedValueHasContent(entry.value)) lastValue = entry.value;
      });
      return lastValue;
    }

    return currentValue;
  }

  function migrateLegacyStorageNamespace(namespacePrefix, targetKey) {
    try {
      var existingTargetRaw = localStorage.getItem(targetKey);
      var existingTargetValue = parsedStoredValue(existingTargetRaw);
      var tokens = legacyStorageMatchTokens();
      var matched = [];
      for (var index = 0; index < localStorage.length; index += 1) {
        var key = localStorage.key(index);
        if (!key || key === targetKey) continue;
        if (key.indexOf(namespacePrefix) !== 0) continue;
        if (tokens.length && !tokens.some(function (token) { return key.indexOf(token) >= 0; })) continue;
        var raw = localStorage.getItem(key);
        var parsed = parsedStoredValue(raw);
        if (!storedValueHasContent(parsed)) continue;
        matched.push({
          key: key,
          value: parsed
        });
      }
      if (!matched.length && storedValueHasContent(existingTargetValue)) return;
      var mergedValue = mergedLegacyStorageValue(namespacePrefix, existingTargetValue, matched);
      if (!storedValueHasContent(mergedValue)) return;
      var nextRaw = JSON.stringify(mergedValue);
      if (nextRaw === existingTargetRaw) return;
      localStorage.setItem(targetKey, nextRaw);
    } catch (error) {
      // Ignore migration issues and continue with best-effort state.
    }
  }

  function migrateLegacyStorageKeys() {
    var namespaceBase = [
      'notion-printer-breaks::',
      'notion-printer-spaces::',
      'notion-printer-view::',
      'notion-printer-text::',
      'notion-printer-delete::',
      'notion-printer-gaps::',
      'notion-printer-pull-up::',
      'notion-printer-images::',
      'notion-printer-history::',
      'notion-printer-rendered-order::',
      'notion-printer-editor-ui::'
    ];
    namespaceBase.forEach(function (prefix) {
      var targetKey = prefix + storageVersion + '::' + storageDocumentKey();
      migrateLegacyStorageNamespace(prefix + storageVersion + '::', targetKey);
    });
  }

  migrateLegacyStorageKeys();

  function clearLegacyStorageNamespace(namespacePrefix, targetKey) {
    try {
      var tokens = legacyStorageMatchTokens();
      var keysToRemove = [];
      for (var index = 0; index < localStorage.length; index += 1) {
        var key = localStorage.key(index);
        if (!key || key === targetKey) continue;
        if (key.indexOf(namespacePrefix) !== 0) continue;
        if (tokens.length && !tokens.some(function (token) { return key.indexOf(token) >= 0; })) continue;
        keysToRemove.push(key);
      }
      keysToRemove.forEach(function (key) {
        localStorage.removeItem(key);
      });
    } catch (error) {
      // Ignore storage cleanup issues and continue with best-effort reset.
    }
  }

  function breakStorageKey() {
    return 'notion-printer-breaks::' + storageVersion + '::' + storageDocumentKey();
  }

  function spaceStorageKey() {
    return 'notion-printer-spaces::' + storageVersion + '::' + storageDocumentKey();
  }

  function viewSettingsStorageKey() {
    return 'notion-printer-view::' + storageVersion + '::' + storageDocumentKey();
  }

  function textStorageKey() {
    return 'notion-printer-text::' + storageVersion + '::' + storageDocumentKey();
  }

  function deleteStorageKey() {
    return 'notion-printer-delete::' + storageVersion + '::' + storageDocumentKey();
  }

  function gapStorageKey() {
    return 'notion-printer-gaps::' + storageVersion + '::' + storageDocumentKey();
  }

  function pullUpStorageKey() {
    return 'notion-printer-pull-up::' + storageVersion + '::' + storageDocumentKey();
  }

  function imageScaleStorageKey() {
    return 'notion-printer-images::' + storageVersion + '::' + storageDocumentKey();
  }

  function historyStorageKey() {
    return 'notion-printer-history::' + storageVersion + '::' + storageDocumentKey();
  }

  function renderedOrderStorageKey() {
    return 'notion-printer-rendered-order::' + storageVersion + '::' + storageDocumentKey();
  }

  function editorUiStorageKey() {
    return 'notion-printer-editor-ui::' + storageVersion + '::' + storageDocumentKey();
  }

  function reloadFocusStorageKey() {
    return 'notion-printer-reload-focus::' + storageVersion + '::' + storageDocumentKey();
  }

  function autoOptimizeStorageKey() {
    return 'notion-printer-auto-optimize::' + storageVersion + '::' + storageDocumentKey();
  }

  function sanitizeBreakMode(mode) {
    return /^(auto|force)$/.test(mode || '') ? mode : 'auto';
  }

  function sanitizeSpaceMode(mode) {
    return /^(auto|tight|wide)$/.test(mode || '') ? mode : 'auto';
  }

  function sanitizeViewFont(font) {
    return /^(xsmall|small|normal|large|xlarge)$/.test(font || '') ? font : 'normal';
  }

  function sanitizeViewSpacing(spacing) {
    return /^(compact|normal|relaxed|airy)$/.test(spacing || '') ? spacing : 'normal';
  }

  function sanitizeEditorFilter(mode) {
    return /^(all|recommended|changed)$/.test(mode || '') ? mode : 'all';
  }

  function readStoredBreakOverrides() {
    try {
      return JSON.parse(localStorage.getItem(breakStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredBreakOverrides() {
    try {
      localStorage.setItem(breakStorageKey(), JSON.stringify(breakOverrideMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredSpaceOverrides() {
    try {
      return JSON.parse(localStorage.getItem(spaceStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredSpaceOverrides() {
    try {
      localStorage.setItem(spaceStorageKey(), JSON.stringify(spaceOverrideMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredViewSettings() {
    try {
      var stored = JSON.parse(localStorage.getItem(viewSettingsStorageKey()) || '{}') || {};
      return {
        font: sanitizeViewFont(stored.font),
        spacing: sanitizeViewSpacing(stored.spacing)
      };
    } catch (error) {
      return { font: 'normal', spacing: 'normal' };
    }
  }

  function writeStoredViewSettings() {
    try {
      localStorage.setItem(viewSettingsStorageKey(), JSON.stringify(viewSettings));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredTextOverrides() {
    try {
      return JSON.parse(localStorage.getItem(textStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredTextOverrides() {
    try {
      localStorage.setItem(textStorageKey(), JSON.stringify(textOverrideMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredDeletedNodes() {
    try {
      return JSON.parse(localStorage.getItem(deleteStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredDeletedNodes() {
    try {
      localStorage.setItem(deleteStorageKey(), JSON.stringify(deletedNodeMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredGaps() {
    try {
      return JSON.parse(localStorage.getItem(gapStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredGaps() {
    try {
      localStorage.setItem(gapStorageKey(), JSON.stringify(manualGapMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredPullUpOverrides() {
    try {
      return JSON.parse(localStorage.getItem(pullUpStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredPullUpOverrides() {
    try {
      localStorage.setItem(pullUpStorageKey(), JSON.stringify(pullUpOverrideMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function persistedIdFromCandidateId(candidateId) {
    var text = String(candidateId || '');
    return text.indexOf('candidate::') === 0 ? text.slice('candidate::'.length) : '';
  }

  function sanitizeImageScale(level) {
    var parsed = parseFloat(level);
    if (isNaN(parsed)) return 100;
    var legacyValue = Math.round(parsed);
    if (Math.abs(parsed - legacyValue) < 0.001 && legacyValue >= 0 && legacyValue <= 4) {
      if (legacyValue === 1) return 92;
      if (legacyValue === 2) return 84;
      if (legacyValue === 3) return 76;
      if (legacyValue === 4) return 68;
      return 100;
    }
    if (parsed < minimumImageScalePct) return minimumImageScalePct;
    if (parsed > 100) return 100;
    if (parsed > 100 - (imageScaleStepPct / 2)) return 100;
    return Math.round(parsed / imageScaleStepPct) * imageScaleStepPct;
  }

  function formatImageScaleLabel(level) {
    var safeLevel = sanitizeImageScale(level);
    var text = Math.abs(safeLevel - Math.round(safeLevel)) < 0.001
      ? String(Math.round(safeLevel))
      : safeLevel.toFixed(2).replace(/\.?0+$/, '');
    return text + '%';
  }

  function imageSliderRatio(level) {
    var safeLevel = sanitizeImageScale(level);
    var span = 100 - minimumImageScalePct;
    if (!(span > 0)) return 1;
    var ratio = (safeLevel - minimumImageScalePct) / span;
    if (ratio < 0) return 0;
    if (ratio > 1) return 1;
    return ratio;
  }

  function imageSliderValue(slider) {
    if (!slider || !slider.dataset) return 100;
    return sanitizeImageScale(slider.dataset.value || 100);
  }

  function imageSliderRawRatioFromPointer(slider, event) {
    if (!slider || !event || !slider.getBoundingClientRect) return imageSliderRatio(imageSliderValue(slider));
    var rect = slider.getBoundingClientRect();
    if (!(rect.width > 0)) return imageSliderRatio(imageSliderValue(slider));
    return (event.clientX - rect.left) / rect.width;
  }

  function updateImageSliderVisual(slider, level) {
    if (!slider) return;
    var safeLevel = sanitizeImageScale(level);
    var ratio = imageSliderRatio(safeLevel);
    var fill = slider.querySelector('.print-image-scale-fill');
    var thumb = slider.querySelector('.print-image-scale-thumb');
    slider.dataset.value = String(safeLevel);
    slider.setAttribute('aria-valuemin', String(minimumImageScalePct));
    slider.setAttribute('aria-valuemax', '100');
    slider.setAttribute('aria-valuenow', String(safeLevel));
    slider.setAttribute('aria-valuetext', formatImageScaleLabel(safeLevel));
    if (fill) fill.style.width = (ratio * 100) + '%';
    if (thumb) thumb.style.left = (ratio * 100) + '%';
  }

  function imageSliderValueFromPointer(slider, event) {
    if (!slider || !event || !slider.getBoundingClientRect) return imageSliderValue(slider);
    var rect = slider.getBoundingClientRect();
    if (!(rect.width > 0)) return imageSliderValue(slider);
    var ratio = (event.clientX - rect.left) / rect.width;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    return sanitizeImageScale(minimumImageScalePct + ((100 - minimumImageScalePct) * ratio));
  }

  function setImageSliderDraggingState(figure, active) {
    if (!figure || !figure.classList) return;
    figure.classList.toggle('print-image-slider-active', !!active);
  }

  function readStoredImageScales() {
    try {
      return JSON.parse(localStorage.getItem(imageScaleStorageKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredImageScales() {
    try {
      localStorage.setItem(imageScaleStorageKey(), JSON.stringify(imageScaleMap));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredEditorUiState() {
    try {
      var stored = JSON.parse(localStorage.getItem(editorUiStorageKey()) || '{}') || {};
      var defaultOpen = window.innerWidth >= 1480;
      return {
        open: typeof stored.open === 'boolean' ? stored.open : defaultOpen,
        filter: sanitizeEditorFilter(stored.filter || 'all')
      };
    } catch (error) {
      return {
        open: window.innerWidth >= 1480,
        filter: 'all'
      };
    }
  }

  function writeStoredEditorUiState() {
    try {
      localStorage.setItem(editorUiStorageKey(), JSON.stringify({
        open: !!editorUiState.open,
        filter: sanitizeEditorFilter(editorUiState.filter || 'all')
      }));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function readStoredReloadFocus() {
    try {
      return JSON.parse(sessionStorage.getItem(reloadFocusStorageKey()) || 'null');
    } catch (error) {
      return null;
    }
  }

  function writeStoredReloadFocus(payload) {
    try {
      sessionStorage.setItem(reloadFocusStorageKey(), JSON.stringify(payload || {}));
    } catch (error) {
      // Ignore storage issues and continue with best-effort reload.
    }
  }

  function clearStoredReloadFocus() {
    try {
      sessionStorage.removeItem(reloadFocusStorageKey());
    } catch (error) {
      // Ignore storage issues and continue.
    }
  }

  function readStoredAutoOptimize() {
    try {
      return JSON.parse(sessionStorage.getItem(autoOptimizeStorageKey()) || 'null');
    } catch (error) {
      return null;
    }
  }

  function writeStoredAutoOptimize(payload) {
    try {
      sessionStorage.setItem(autoOptimizeStorageKey(), JSON.stringify(payload || {}));
    } catch (error) {
      // Ignore storage issues and continue with best-effort auto optimize.
    }
  }

  function clearStoredAutoOptimize() {
    try {
      sessionStorage.removeItem(autoOptimizeStorageKey());
    } catch (error) {
      // Ignore storage issues and continue.
    }
  }

  function learningRuntime() {
    return window.NotionPrinterLearning || null;
  }

  function recommendationRuntime() {
    return null;
  }

  function logLearningAction(actionType, payload) {
    try {
      var learning = learningRuntime();
      if (!learning || typeof learning.logAction !== 'function') return '';
      var safePayload = Object.assign({}, payload || {});
      var targetNode = safePayload.targetNode || safePayload.node || null;
      if (!safePayload.selection) {
        safePayload.selection = Object.assign({ active_edit_id: activeEditableId() }, currentSelectedTarget());
      }
      if (!safePayload.viewport) {
        safePayload.viewport = captureViewportMetrics(targetNode);
      }
      return learning.logAction(actionType, safePayload);
    } catch (error) {
      return '';
    }
  }

  function flushLearningEvents(useBeacon) {
    try {
      var learning = learningRuntime();
      if (!learning || typeof learning.flushEvents !== 'function') return;
      learning.flushEvents(!!useBeacon);
    } catch (error) {
      // Ignore logging failures and continue editing.
    }
  }

  function lastLearningActionEventId() {
    try {
      var learning = learningRuntime();
      if (!learning || typeof learning.getLastActionEventId !== 'function') return '';
      return learning.getLastActionEventId() || '';
    } catch (error) {
      return '';
    }
  }

  function persistedNodeById(persistId) {
    if (!persistId) return null;
    return document.querySelector('.pagedjs_pages [data-print-persist-id="' + persistId + '"]') ||
      document.querySelector('[data-print-persist-id="' + persistId + '"]');
  }

  function isTableLikeNode(node) {
    if (!node || node.nodeType !== 1 || !node.matches) return false;
    return node.matches('.print-table-block, .print-table-block *, table, table *');
  }

  function fallbackBlockType(node) {
    if (!node || node.nodeType !== 1 || !node.matches) return 'unknown';
    if (node.matches('.page-title, .page-title *')) return 'page_title';
    if (node.matches('figure.image, figure.image *')) return 'image';
    if (isTableLikeNode(node)) return 'table';
    if (node.matches('.print-major-title, .print-major-title *')) return 'list_item_heading';
    if (node.matches('.print-inline-block, .print-inline-block *')) return 'list_item_text';
    if (node.matches('h1:not(.page-title), h2, h3')) return 'section_heading';
    if (node.matches('h4, h5, h6')) return 'subheading';
    if (node.matches('.callout, .callout *')) return 'callout';
    if (node.matches('blockquote, blockquote *')) return 'quote_block';
    if (node.matches('pre, pre *')) return 'code_block';
    if (node.matches('li, li *')) return 'list_item';
    return (node.tagName || 'node').toLowerCase();
  }

  function sectionHeadingSelector() {
    return '[data-print-block-type="section_heading"], h1:not(.page-title), h2, h3';
  }

  function atomicCandidateSelector() {
    return 'article.page > header [data-print-atomic="true"], .page-body [data-print-atomic="true"]';
  }

  function blockMetadata(node) {
    try {
      var learning = learningRuntime();
      if (!learning || typeof learning.getBlockMeta !== 'function') return null;
      return learning.getBlockMeta(node);
    } catch (error) {
      return null;
    }
  }

  function blockContractNode(node) {
    var meta = blockMetadata(node);
    if (meta && meta.contract_node) return meta.contract_node;
    if (!node || node.nodeType !== 1 || !node.closest) return node || null;
    if (node.hasAttribute && node.hasAttribute('data-print-persist-id')) return node;
    return node.closest('[data-print-persist-id]') || node;
  }

  function blockTypeFromContract(node) {
    var meta = blockMetadata(node);
    return meta && meta.block_type ? meta.block_type : '';
  }

  function blockRoleFromContract(node) {
    var meta = blockMetadata(node);
    return meta && meta.block_role ? meta.block_role : '';
  }

  function blockIsAtomic(node) {
    var meta = blockMetadata(node);
    return !!(meta && meta.atomic);
  }

  function blockLabelFromContract(node) {
    var meta = blockMetadata(node);
    return meta && meta.label ? meta.label : '';
  }

  function learningNodeKind(node) {
    var blockType = blockTypeFromContract(node);
    if (blockType) return blockType;
    return fallbackBlockType(node);
  }

  function candidateRecommendation(candidate) {
    try {
      var recommendation = recommendationRuntime();
      if (!recommendation || typeof recommendation.recommendCandidate !== 'function') return null;
      var node = findRenderedBreakNode(candidate);
      if (!node) return null;
      return recommendation.recommendCandidate(node);
    } catch (error) {
      return null;
    }
  }

  function figureRecommendation(figureId) {
    try {
      var recommendation = recommendationRuntime();
      if (!recommendation || typeof recommendation.recommendFigure !== 'function') return null;
      var figure = persistedNodeById(figureId);
      if (!figure) return null;
      return recommendation.recommendFigure(figure);
    } catch (error) {
      return null;
    }
  }

  function candidateSuggestionBadgeText(recommendation) {
    if (!recommendation) return '';
    if (recommendation.break && recommendation.break.mode === 'force') {
      return '새 페이지 추천';
    }
    if (recommendation.gap && recommendation.gap.units > 0) {
      return '빈칸 추천';
    }
    return '';
  }

  function joinRecommendationReasons(section) {
    if (!section || !Array.isArray(section.reasons) || !section.reasons.length) return '';
    return section.reasons.join(', ');
  }

  function suggestionSourceForBreak(candidate, nextMode) {
    var recommendation = candidateRecommendation(candidate);
    if (!recommendation || !recommendation.break) return 'manual';
    if (recommendation.break.mode === nextMode) {
      return recommendation.break.source || 'rules';
    }
    return 'manual';
  }

  function suggestionSourceForGap(candidate, delta) {
    var recommendation = candidateRecommendation(candidate);
    if (!recommendation || !recommendation.gap) return 'manual';
    if (delta > 0 && recommendation.gap.units > 0) {
      return recommendation.gap.source || 'rules';
    }
    return 'manual';
  }

  function suggestionSourceForImageScale(figureId, nextLevel) {
    var recommendation = figureRecommendation(figureId);
    if (!recommendation || !(recommendation.targetScalePct < 100)) return 'manual';
    if (Math.abs(recommendation.targetScalePct - nextLevel) <= 4) {
      return recommendation.source || 'rules';
    }
    return 'manual';
  }

  function captureHistorySnapshot() {
    return {
      breaks: JSON.parse(JSON.stringify(breakOverrideMap || {})),
      spaces: JSON.parse(JSON.stringify(spaceOverrideMap || {})),
      pulls: JSON.parse(JSON.stringify(pullUpOverrideMap || {})),
      view: JSON.parse(JSON.stringify(viewSettings || {})),
      text: JSON.parse(JSON.stringify(textOverrideMap || {})),
      deleted: JSON.parse(JSON.stringify(deletedNodeMap || {})),
      gaps: JSON.parse(JSON.stringify(manualGapMap || {})),
      images: JSON.parse(JSON.stringify(imageScaleMap || {})),
      renderedLayout: JSON.parse(JSON.stringify(snapshotRenderedLayout() || []))
    };
  }

  function applyCapturedStateSnapshot(state) {
    var safeState = state || {};
    breakOverrideMap = safeState.breaks || {};
    spaceOverrideMap = safeState.spaces || {};
    pullUpOverrideMap = safeState.pulls || {};
    viewSettings = safeState.view || { font: 'normal', spacing: 'normal' };
    textOverrideMap = safeState.text || {};
    deletedNodeMap = safeState.deleted || {};
    manualGapMap = safeState.gaps || {};
    imageScaleMap = safeState.images || {};
    var renderedLayout = Array.isArray(safeState.renderedLayout) ? safeState.renderedLayout : [];

    writeStoredBreakOverrides();
    writeStoredSpaceOverrides();
    writeStoredPullUpOverrides();
    writeStoredViewSettings();
    writeStoredTextOverrides();
    writeStoredDeletedNodes();
    writeStoredGaps();
    writeStoredImageScales();
    writeStoredRenderedOrder(renderedLayout);

    applyViewSettings();
    applyResolvedBreakModes();
    applyStoredManualGaps();
    applyStoredImageScales();
    syncEditorUiControls();
    refreshEditorList();
    syncSelectedRenderedState();
  }

  function readHistoryStack() {
    try {
      var raw = JSON.parse(localStorage.getItem(historyStorageKey()) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (error) {
      return [];
    }
  }

  function writeHistoryStack(stack) {
    try {
      localStorage.setItem(historyStorageKey(), JSON.stringify(Array.isArray(stack) ? stack : []));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function pushHistorySnapshot(reason) {
    var stack = readHistoryStack();
    stack.push({
      reason: reason || 'change',
      at: Date.now(),
      state: captureHistorySnapshot()
    });
    if (stack.length > 40) {
      stack = stack.slice(stack.length - 40);
    }
    writeHistoryStack(stack);
  }

  function restoreLatestHistorySnapshot() {
    var stack = readHistoryStack();
    if (!stack.length) return false;
    var entry = stack.pop();
    writeHistoryStack(stack);
    applyCapturedStateSnapshot(entry && entry.state ? entry.state : {});
    return true;
  }

  function readStoredRenderedOrder() {
    try {
      return JSON.parse(localStorage.getItem(renderedOrderStorageKey()) || '[]') || [];
    } catch (error) {
      return [];
    }
  }

  function writeStoredRenderedOrder(layout) {
    try {
      localStorage.setItem(renderedOrderStorageKey(), JSON.stringify(layout || []));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function clearLegacyOrderStorage() {
    try {
      localStorage.removeItem('notion-printer-order::' + (location.pathname || document.title || 'document'));
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function clearRenderedOrderStorage() {
    try {
      localStorage.removeItem(renderedOrderStorageKey());
    } catch (error) {
      // Ignore storage issues and continue with in-memory state.
    }
  }

  function clearDocumentEditStorage() {
    breakOverrideMap = {};
    spaceOverrideMap = {};
    pullUpOverrideMap = {};
    textOverrideMap = {};
    deletedNodeMap = {};
    manualGapMap = {};
    imageScaleMap = {};
    storedRenderedLayoutApplied = false;

    writeStoredBreakOverrides();
    writeStoredSpaceOverrides();
    writeStoredPullUpOverrides();
    writeStoredTextOverrides();
    writeStoredDeletedNodes();
    writeStoredGaps();
    writeStoredImageScales();
    writeStoredRenderedOrder([]);

    clearLegacyStorageNamespace('notion-printer-breaks::' + storageVersion + '::', breakStorageKey());
    clearLegacyStorageNamespace('notion-printer-spaces::' + storageVersion + '::', spaceStorageKey());
    clearLegacyStorageNamespace('notion-printer-text::' + storageVersion + '::', textStorageKey());
    clearLegacyStorageNamespace('notion-printer-delete::' + storageVersion + '::', deleteStorageKey());
    clearLegacyStorageNamespace('notion-printer-gaps::' + storageVersion + '::', gapStorageKey());
    clearLegacyStorageNamespace('notion-printer-pull-up::' + storageVersion + '::', pullUpStorageKey());
    clearLegacyStorageNamespace('notion-printer-images::' + storageVersion + '::', imageScaleStorageKey());
    clearLegacyStorageNamespace('notion-printer-rendered-order::' + storageVersion + '::', renderedOrderStorageKey());
    clearLegacyOrderStorage();
  }

  function resetAllEdits(options) {
    var config = options || {};
    if (config.confirm !== false) {
      var confirmed = window.confirm('지금까지의 나누기, 합치기, 삭제, 텍스트, 이미지 조정을 모두 초기화할까요? 되돌리기로 복구할 수 있습니다.');
      if (!confirmed) return;
    }

    var targetNode = currentSelectedRenderedNode() || document.querySelector('.pagedjs_pages [data-print-break-id]') || document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number]');
    pushHistorySnapshot('reset-all');
    var eventId = logLearningAction('reset_all_edits', {
      targetNode: targetNode,
      candidateId: targetNode && targetNode.getAttribute ? (targetNode.getAttribute('data-print-break-id') || '') : '',
      persistId: targetNode && targetNode.dataset ? (targetNode.dataset.printPersistId || '') : '',
      before: {
        has_manual_breaks: Object.keys(breakOverrideMap || {}).length,
        has_manual_spaces: Object.keys(spaceOverrideMap || {}).length,
        has_pullups: Object.keys(pullUpOverrideMap || {}).length,
        has_text_edits: Object.keys(textOverrideMap || {}).length,
        has_deleted_nodes: Object.keys(deletedNodeMap || {}).length,
        has_manual_gaps: Object.keys(manualGapMap || {}).length,
        has_image_scales: Object.keys(imageScaleMap || {}).length,
        rendered_page_count: snapshotRenderedLayout().length
      },
      after: {
        reset_requested: true
      },
      ui: {
        source: config.uiSource || 'reset_all_button',
        suggestion_source: 'manual'
      },
      meta: buildRuntimeActionMeta(targetNode, {
        intent: 'reset_all_edits',
        effect: {
          reset_all_edits: true,
          layout_before: snapshotRenderedLayout()
        }
      })
    });

    clearDocumentEditStorage();
    clearStoredAutoOptimize();
    updateEditorBannerStatus('편집 내용을 초기화하는 중…');
    reloadWithPreservedFocus({
      intent: 'reset_all_edits',
      actionEventId: eventId,
      targetNode: targetNode
    });
  }

  function applyViewSettings() {
    if (!document.body) return;
    document.body.dataset.printPreviewFont = sanitizeViewFont(viewSettings.font);
    document.body.dataset.printPreviewSpacing = sanitizeViewSpacing(viewSettings.spacing);
  }

  function isFigureBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.tagName === 'FIGURE' && node.classList.contains('image')) return true;
    var children = Array.from(node.children || []).filter(function (child) {
      return child.nodeType === 1;
    });
    return children.length === 1 &&
      children[0].tagName === 'FIGURE' &&
      children[0].classList.contains('image');
  }

  function normalizePrintText(text) {
    return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isAppendixDetailsBlock(details) {
    if (!details || !details.querySelector) return false;
    var summary = details.querySelector(':scope > summary');
    var summaryText = normalizePrintText(summary ? summary.textContent || '' : '');
    if (/단축키|shortcut|부록|appendix/i.test(summaryText)) return true;
    var tableCount = details.querySelectorAll('table.simple-table, table.collection-content, table').length;
    return tableCount >= 3;
  }

  function flattenDetailsBlocks() {
    Array.from(document.querySelectorAll('details')).forEach(function (details) {
      var isAppendix = isAppendixDetailsBlock(details);
      var replacement = document.createElement('div');
      replacement.className = isAppendix ? 'print-details-block print-appendix-block' : 'print-details-block';
      ensurePersistentId(replacement, isAppendix ? 'appendix-block' : 'details-block');

      Array.from(details.attributes || []).forEach(function (attr) {
        if (!attr || !attr.name) return;
        if (attr.name === 'open' || attr.name === 'class') return;
        replacement.setAttribute(attr.name, attr.value);
      });

      var summary = Array.from(details.children || []).find(function (child) {
        return child.tagName === 'SUMMARY';
      });
      if (summary) {
        var summaryReplacement = document.createElement('div');
        summaryReplacement.className = isAppendix ? 'print-details-summary print-appendix-summary' : 'print-details-summary';
        Array.from(summary.attributes || []).forEach(function (attr) {
          if (!attr || !attr.name || attr.name === 'class') return;
          summaryReplacement.setAttribute(attr.name, attr.value);
        });
        summaryReplacement.innerHTML = summary.innerHTML;
        replacement.appendChild(summaryReplacement);
      }

      Array.from(details.childNodes || []).forEach(function (node) {
        if (node === summary) return;
        replacement.appendChild(node);
      });

      details.parentNode.replaceChild(replacement, details);
    });
  }

  function wrapStandaloneTables() {
    Array.from(document.querySelectorAll('.collection-content-wrapper')).forEach(function (wrapper) {
      if (!wrapper || !wrapper.classList) return;
      if (wrapper.classList.contains('print-table-block')) return;
      if (wrapper.closest && wrapper.closest('td, th')) return;

      var directChildren = Array.from(wrapper.children || []).filter(function (child) {
        return child && child.nodeType === 1;
      });
      if (directChildren.length !== 1) return;

      var onlyChild = directChildren[0];
      if (onlyChild.classList && onlyChild.classList.contains('print-table-block')) {
        var nestedTable = Array.from(onlyChild.children || []).find(function (child) {
          return child && child.nodeType === 1 && child.tagName === 'TABLE';
        });
        if (nestedTable) {
          wrapper.insertBefore(nestedTable, onlyChild);
        }
        onlyChild.remove();
      }

      if (!(wrapper.querySelector && wrapper.querySelector('table'))) return;
      wrapper.classList.add('print-table-block');
      if (wrapper.style && wrapper.style.display === 'contents') {
        wrapper.style.removeProperty('display');
      }
      wrapper.dataset.printBlockType = 'table';
      wrapper.dataset.printBlockRole = 'table';
      wrapper.dataset.printAtomic = 'true';
      ensurePersistentId(wrapper, 'table');
    });

    Array.from(document.querySelectorAll('table.simple-table, table.collection-content, table')).forEach(function (table) {
      if (!table || !table.parentNode || !table.parentNode.insertBefore) return;
      if (table.closest && table.closest('.print-table-block')) return;
      if (table.closest && table.closest('td, th')) return;

      var wrapper = document.createElement('div');
      wrapper.className = 'print-table-block';
      wrapper.dataset.printBlockType = 'table';
      wrapper.dataset.printBlockRole = 'table';
      wrapper.dataset.printAtomic = 'true';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
      ensurePersistentId(wrapper, 'table');
    });
  }

  function containsFigureDescendant(node) {
    return !!(node && node.querySelector && node.querySelector('figure.image'));
  }

  function isTextBlock(node) {
    if (!node || node.nodeType !== 1 || !node.querySelector) return false;
    if (node.querySelector('figure, table, .print-table-block, h1, h2, h3, h4, h5, h6, details, .print-details-block, .print-details-summary, blockquote, pre, .callout')) return false;
    var text = normalizePrintText(node.textContent || '');
    return text.length > 0;
  }

  function wrapLeadingTextNodes(container, className) {
    if (!container) return null;

    var nodes = [];
    var children = Array.from(container.childNodes || []);
    for (var i = 0; i < children.length; i += 1) {
      var node = children[i];
      if (node.nodeType === 3) {
        if (node.textContent.replace(/\u00a0/g, ' ').trim() || nodes.length > 0) {
          nodes.push(node);
        }
        continue;
      }
      if (node.nodeType === 1 && node.tagName === 'BR') {
        if (nodes.length > 0) nodes.push(node);
        continue;
      }
      if (node.nodeType === 1) {
        var tag = node.tagName;
        var inlineTag = /^(MARK|CODE|STRONG|EM|SPAN|A|B|I|U|S|SMALL|SUP|SUB)$/i.test(tag);
        var blockDescendant = node.querySelector && node.querySelector('figure, table, .print-table-block, ul, ol, details, h1, h2, h3, h4, h5, h6, hr, .print-details-block, .print-details-summary, blockquote, pre, .callout');
        if (inlineTag && !blockDescendant) {
          nodes.push(node);
          continue;
        }
      }
      break;
    }

    if (!nodes.length) return null;

    var wrapper = document.createElement('div');
    wrapper.className = className;
    container.insertBefore(wrapper, nodes[0]);
    nodes.forEach(function (node) {
      wrapper.appendChild(node);
    });
    return wrapper;
  }

  function isSegmentableListChild(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.tagName === 'UL' || node.tagName === 'OL') return false;
    if (node.classList && (
      node.classList.contains('print-inline-tools') ||
      node.classList.contains('print-insert-actions')
    )) return false;
    if (isFigureBlock(node) || isTableLikeNode(node)) return true;
    if (node.matches && node.matches('p, figure.image, .print-inline-block, .print-table-block, blockquote, pre, .callout, .print-shortcut-block')) {
      return true;
    }
    return normalizePrintText(node.textContent || '').length > 0 || containsFigureDescendant(node);
  }

  function cloneBulletListSegmentShell(sourceLi) {
    var clone = document.createElement('li');
    Array.from(sourceLi.attributes || []).forEach(function (attr) {
      if (!attr || !attr.name) return;
      if (attr.name === 'class') return;
      if (attr.name === 'id' || attr.name === 'data-print-persist-id' || attr.name === 'data-print-break-id' || attr.name === 'data-print-edit-id') return;
      clone.setAttribute(attr.name, attr.value);
    });
    clone.className = sourceLi.className || '';
    clone.classList.remove('print-bullet-item');
    clone.classList.remove('print-detached-list-head');
    clone.classList.add('print-bulletless-item');
    clone.classList.add('print-detached-list-segment');
    clone.classList.add('print-detached-list-continued');
    clone.classList.add('print-breakable-item');
    return clone;
  }

  function splitMultiBlockBulletItems() {
    Array.from(document.querySelectorAll('ul.bulleted-list > li')).forEach(function (li) {
      if (!li || li.nodeType !== 1) return;
      if (li.classList.contains('print-major-item')) return;
      if (Array.from(li.children || []).some(function (child) {
        return child && child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL');
      })) return;

      var parts = Array.from(li.children || []).filter(isSegmentableListChild);
      if (parts.length <= 1) return;

      li.classList.add('print-detached-list-segment');
      li.classList.add('print-detached-list-head');

      var insertionPoint = li;
      parts.slice(1).forEach(function (part) {
        var sibling = cloneBulletListSegmentShell(li);
        if (!li.parentNode) return;
        li.parentNode.insertBefore(sibling, insertionPoint.nextSibling);
        sibling.appendChild(part);
        insertionPoint = sibling;
      });
    });
  }

  function cloneIndentedFlowSegmentShell(wrapper) {
    if (!wrapper || wrapper.nodeType !== 1) return null;
    var segment = document.createElement(wrapper.tagName || 'div');
    Array.from(wrapper.attributes || []).forEach(function (attr) {
      if (!attr || !attr.name) return;
      if (attr.name === 'class') return;
      if (attr.name === 'id' || attr.name === 'data-print-persist-id' || attr.name === 'data-print-break-id' || attr.name === 'data-print-edit-id') return;
      if (/^data-print-(root|break-root|flow-segment)/.test(attr.name)) return;
      segment.setAttribute(attr.name, attr.value);
    });
    segment.className = wrapper.className || '';
    segment.classList.add('print-flow-segment');
    segment.dataset.printFlowSegmentRoot = 'true';
    return segment;
  }

  function splitIndentedFlowSegments() {
    Array.from(document.querySelectorAll('article.page .indented')).forEach(function (wrapper) {
      if (!wrapper || wrapper.nodeType !== 1 || !wrapper.parentNode) return;
      if (wrapper.dataset && wrapper.dataset.printFlowSegmentRoot === 'true') return;

      var elementChildren = Array.from(wrapper.children || []).filter(function (child) {
        return child && child.nodeType === 1 && !(child.classList && (
          child.classList.contains('print-inline-tools') ||
          child.classList.contains('print-insert-actions')
        ));
      });

      if (elementChildren.length <= 1) return;

      var insertionPoint = wrapper;
      elementChildren.forEach(function (child) {
        var segment = cloneIndentedFlowSegmentShell(wrapper);
        if (!segment || !wrapper.parentNode) return;
        wrapper.parentNode.insertBefore(segment, insertionPoint);
        segment.appendChild(child);
        insertionPoint = segment.nextSibling || segment;
      });

      wrapper.remove();
    });
  }

  function clearListBreakRootHints() {
    Array.from(document.querySelectorAll('[data-print-root-id]')).forEach(function (node) {
      if (node && node.dataset) delete node.dataset.printRootId;
    });
    Array.from(document.querySelectorAll('[data-print-break-root-id], [data-print-break-root-mode]')).forEach(function (node) {
      if (!node || !node.dataset) return;
      delete node.dataset.printBreakRootId;
      delete node.dataset.printBreakRootMode;
    });
  }

  function ensureListBreakRootId(node, prefix) {
    if (!node || node.nodeType !== 1 || !node.dataset) return '';
    if (node.dataset.printRootId) return node.dataset.printRootId;
    listBreakRootCounter += 1;
    node.dataset.printRootId = String(prefix || 'list-root') + '-' + String(listBreakRootCounter);
    return node.dataset.printRootId;
  }

  function directSplitBlocksForListItem(listItem) {
    if (!listItem || !listItem.children) return [];
    return Array.from(listItem.children || []).filter(function (child) {
      return child && child.nodeType === 1 && child.classList && child.classList.contains('print-split-block');
    });
  }

  function annotateListBreakRoots() {
    clearListBreakRootHints();
    Array.from(document.querySelectorAll('article.page li[data-print-block-type="list_item"], article.page ul.bulleted-list > li, article.page ol.numbered-list > li')).forEach(function (li) {
      if (!li || li.nodeType !== 1) return;
      var splitBlocks = directSplitBlocksForListItem(li);
      if (!splitBlocks.length) return;
      var rootId = ensureListBreakRootId(li);
      if (!rootId) return;
      splitBlocks[0].dataset.printBreakRootId = rootId;
      splitBlocks[0].dataset.printBreakRootMode = 'list_item';
    });

    Array.from(document.querySelectorAll('article.page .indented')).forEach(function (wrapper) {
      if (!wrapper || wrapper.nodeType !== 1 || !wrapper.parentElement) return;
      if (!wrapper.previousElementSibling) return;
      var firstSplit = Array.from(wrapper.querySelectorAll('.print-split-block')).find(function (node) {
        return node && node.nodeType === 1 && node.closest && node.closest('.indented') === wrapper;
      }) || null;
      if (!firstSplit) return;
      var rootId = ensureListBreakRootId(wrapper, 'wrapper-root');
      if (!rootId) return;
      firstSplit.dataset.printBreakRootId = rootId;
      firstSplit.dataset.printBreakRootMode = 'wrapper_segment';
    });
  }

  function ensurePersistentId(node, role) {
    if (!node || node.nodeType !== 1) return '';
    if (node.dataset && node.dataset.printPersistId) return node.dataset.printPersistId;

    var base = node.getAttribute('data-ref') || node.id || '';
    if (!base) {
      var owner = node.closest('[data-ref], [id], [data-print-persist-id]');
      if (owner && owner !== node) {
        base = owner.getAttribute('data-ref') || owner.id || owner.dataset.printPersistId || '';
      }
    }
    if (!base) {
      base = (node.tagName || 'node').toLowerCase();
    }

    var suffix = role || (node.tagName || 'node').toLowerCase();
    var index = 0;
    if (node.parentElement) {
      var siblings = Array.from(node.parentElement.children || []).filter(function (child) {
        return child.tagName === node.tagName;
      });
      index = siblings.indexOf(node);
      if (index < 0) index = 0;
    }

    var id = base + '::' + suffix + ':' + index;
    node.dataset.printPersistId = id;
    return id;
  }

  function ensureEditId(node, role) {
    if (!node || node.nodeType !== 1) return '';
    if (node.dataset && node.dataset.printEditId) return node.dataset.printEditId;
    var id = ensurePersistentId(node, role || 'edit');
    node.dataset.printEditId = id;
    return id;
  }

  function pairFigureBlocks(root) {
    return;
    Array.from(root.children || []).forEach(function (child) {
      pairFigureBlocks(child);
    });

    var children = Array.from(root.children || []);
    children.forEach(function (child) {
      if (!isFigureBlock(child) || child.parentElement !== root) return;
      if (child.parentElement && child.parentElement.classList && child.parentElement.classList.contains('print-figure-pair')) return;

      var previous = child.previousElementSibling;
      var partner = null;

      if (isTextBlock(previous) && !(previous.classList && previous.classList.contains('print-figure-pair'))) {
        partner = previous;
      }

      if (!partner) return;

      var pair = document.createElement('div');
      pair.className = 'print-figure-pair';

      root.insertBefore(pair, partner);
      pair.appendChild(partner);
      pair.appendChild(child);
    });
  }

  function isInlineFlowNode(node) {
    if (!node) return false;
    if (node.nodeType === 3) {
      return !!node.textContent.replace(/\u00a0/g, ' ').trim();
    }
    if (node.nodeType !== 1) return false;
    if (node.tagName === 'BR') return true;
    if (/^(MARK|CODE|STRONG|EM|SPAN|A|B|I|U|S|SMALL|SUP|SUB)$/i.test(node.tagName)) return true;
    return false;
  }

  function pullTrailingInlineNodesAheadOfFigures(root) {
    Array.from(root.children || []).forEach(function (child) {
      pullTrailingInlineNodesAheadOfFigures(child);
    });

    Array.from(root.children || []).forEach(function (child) {
      if (!isFigureBlock(child) || child.parentElement !== root) return;

      var cursor = child.nextSibling;
      var trailing = [];
      while (cursor && isInlineFlowNode(cursor)) {
        trailing.push(cursor);
        cursor = cursor.nextSibling;
      }

      if (!trailing.length) return;

      trailing.forEach(function (node) {
        root.insertBefore(node, child);
      });
    });
  }

  function directChildByClass(node, className) {
    return Array.from(node.children || []).find(function (child) {
      return child.classList && child.classList.contains(className);
    }) || null;
  }

  function isNumberedStepText(text) {
    return /^(?:\d+(?:-\d+)+\.?|\d+[.)]|\(\d+\)|[①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺❻❼❽❾❿])(?:\s|$)/.test(normalizePrintText(text));
  }

  function isNumberedStepBlock(node) {
    if (!node || node.nodeType !== 1 || !node.querySelector) return false;
    if (node.classList && (node.classList.contains('print-major-title') || node.classList.contains('print-major-item'))) return false;
    if (node.querySelector('table, .print-table-block, h1, h2, h3, h4, h5, h6, details, .print-details-block, .print-details-summary')) return false;
    return isNumberedStepText(node.textContent || '');
  }

  function isMediaCompanionBlock(node) {
    if (!node || node.nodeType !== 1 || !node.querySelector) return false;
    if (node.classList && (node.classList.contains('print-numbered-step-pair') || node.classList.contains('print-figure-pair'))) return true;
    if (isFigureBlock(node)) return true;
    if (!containsFigureDescendant(node)) return false;
    if (node.querySelector('table, .print-table-block, h1, h2, h3, h4, h5, h6, details, hr, .print-details-block, .print-details-summary')) return false;
    return true;
  }

  function pairNumberedStepBlocks(root) {
    return;
    Array.from(root.children || []).forEach(function (child) {
      pairNumberedStepBlocks(child);
    });

    Array.from(root.children || []).forEach(function (child) {
      if (!child || child.parentElement !== root) return;

      if (child.classList && child.classList.contains('print-figure-pair')) {
        var pairText = directChildByClass(child, 'print-inline-block') || Array.from(child.children || []).find(function (node) {
          return node.nodeType === 1 && !containsFigureDescendant(node);
        }) || child;
        if (isNumberedStepText(pairText.textContent || '')) {
          child.classList.add('print-numbered-step-pair');
        }
        return;
      }

      if (child.classList && child.classList.contains('print-numbered-step-pair')) return;
      if (!isNumberedStepBlock(child)) return;

      var next = child.nextElementSibling;
      if (!next || next.parentElement !== root) return;
      if (!isMediaCompanionBlock(next)) return;

      var pair = document.createElement('div');
      pair.className = 'print-numbered-step-pair';
      root.insertBefore(pair, child);
      pair.appendChild(child);
      pair.appendChild(next);
    });
  }

  function createGenericMajorOpenings() {
    return;
    Array.from(document.querySelectorAll('li.print-major-item')).forEach(function (li) {
      if (directChildByClass(li, 'print-major-opening')) return;

      var title = directChildByClass(li, 'print-major-title');
      var body = directChildByClass(li, 'print-major-body');
      if (!title || !body) return;

      var firstKeepBlock = Array.from(body.children || []).find(function (child) {
        return child.nodeType === 1 &&
          child.classList &&
          (child.classList.contains('print-numbered-step-pair') || child.classList.contains('print-figure-pair'));
      });
      if (!firstKeepBlock) return;

      var opening = document.createElement('div');
      opening.className = 'print-major-opening';
      li.insertBefore(opening, title);
      opening.appendChild(title);
      opening.appendChild(firstKeepBlock);
    });
  }

  function createNestedMajorOpenings() {
    return;
    Array.from(document.querySelectorAll('li.print-major-item')).forEach(function (li) {
      if (directChildByClass(li, 'print-major-opening')) return;

      var title = directChildByClass(li, 'print-major-title');
      var body = directChildByClass(li, 'print-major-body');
      if (!title || !body) return;

      var contentLi = body.querySelector('ul.bulleted-list > li, ol.numbered-list > li');
      if (!contentLi) return;

      var introBlock = directChildByClass(contentLi, 'print-inline-block');
      var firstPair = directChildByClass(contentLi, 'print-numbered-step-pair') ||
        directChildByClass(contentLi, 'print-figure-pair');
      if (!introBlock || !firstPair) return;

      var opening = document.createElement('div');
      opening.className = 'print-major-opening';
      li.insertBefore(opening, title);
      opening.appendChild(title);
      opening.appendChild(introBlock);
      opening.appendChild(firstPair);
    });
  }

  function createNestedMajorLeadOpenings() {
    return;
    Array.from(document.querySelectorAll('li.print-major-item.print-nested-bullet-group')).forEach(function (li) {
      if (directChildByClass(li, 'print-major-opening')) return;

      var title = directChildByClass(li, 'print-major-title');
      var body = directChildByClass(li, 'print-major-body');
      if (!title || !body) return;

      var firstNestedList = Array.from(body.children || []).find(function (child) {
        return child && child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL');
      });
      if (!firstNestedList) return;

      var opening = document.createElement('div');
      opening.className = 'print-major-opening';
      li.insertBefore(opening, title);
      opening.appendChild(title);
      opening.appendChild(firstNestedList);
    });
  }

  function annotateEditableNodes() {
    Array.from(document.querySelectorAll('.page-title')).forEach(function (node) {
      ensureEditId(node, 'page-title');
    });
    Array.from(document.querySelectorAll('h1:not(.page-title), h2, h3, h4, h5, h6')).forEach(function (node) {
      ensureEditId(node, 'section-heading');
    });
    Array.from(document.querySelectorAll('p')).forEach(function (node) {
      if (node.querySelector('figure, table')) return;
      ensureEditId(node, 'paragraph');
    });
    Array.from(document.querySelectorAll('.callout, blockquote, pre')).forEach(function (node) {
      ensureEditId(node, 'rich-block');
    });
    Array.from(document.querySelectorAll('.print-major-title')).forEach(function (node) {
      ensureEditId(node, 'major-title');
    });
    Array.from(document.querySelectorAll('.print-inline-block')).forEach(function (node) {
      ensureEditId(node, 'inline-block');
    });
    Array.from(document.querySelectorAll('figure.image')).forEach(function (node) {
      ensurePersistentId(node, 'image');
    });
    Array.from(document.querySelectorAll('.print-table-block')).forEach(function (node) {
      ensurePersistentId(node, 'table');
    });
    Array.from(document.querySelectorAll('.print-shortcut-block, li.print-major-item, li.print-bullet-item, li.print-bulletless-item')).forEach(function (node) {
      ensurePersistentId(node, 'candidate');
    });
  }

  function isMeaningfulSplitChild(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.classList && node.classList.contains('print-inline-tools')) return false;
    if (node.tagName === 'UL' || node.tagName === 'OL') return true;
    if (node.classList && (
      node.classList.contains('print-inline-block') ||
      node.classList.contains('print-shortcut-block') ||
      node.classList.contains('print-major-title')
    )) return true;
    if (node.classList && (
      node.classList.contains('print-section') ||
      node.classList.contains('print-major-body') ||
      node.classList.contains('print-nested-bullet-bundle') ||
      node.classList.contains('print-major-opening') ||
      node.classList.contains('print-figure-pair') ||
      node.classList.contains('print-numbered-step-pair')
    )) return false;
    if (node.tagName === 'P' || node.tagName === 'FIGURE' || node.tagName === 'DIV') {
      return normalizePrintText(node.textContent || '').length > 0 || containsFigureDescendant(node);
    }
    return false;
  }

  function markSplitBlocks() {
    function addSplitBlock(node, role) {
      if (!node || node.nodeType !== 1) return;
      if (node.classList.contains('print-split-block')) return;
      node.classList.add('print-split-block');
      ensurePersistentId(node, role || 'split-block');
    }

    function pushUnique(bucket, node) {
      if (!node || node.nodeType !== 1) return;
      if (bucket.indexOf(node) !== -1) return;
      bucket.push(node);
    }

    function isUiArtifact(node) {
      return !!(node && node.classList && (
        node.classList.contains('print-inline-tools') ||
        node.classList.contains('print-insert-actions')
      ));
    }

    function isAtomicSplitNode(node) {
      if (!node || node.nodeType !== 1) return false;
      if (isUiArtifact(node)) return false;
      if (node.classList && node.classList.contains('print-table-block')) return true;
      if (node.classList && node.classList.contains('print-inline-block')) return true;
      if (node.tagName === 'P' || node.tagName === 'FIGURE' || node.tagName === 'TABLE') return true;
      if (node.tagName === 'DIV' && !node.children.length) {
        return normalizePrintText(node.textContent || '').length > 0;
      }
      return false;
    }

    function collectSplitTargets(container, bucket) {
      if (!container || !container.children) return;
      var initialLength = bucket.length;
      Array.from(container.children || []).forEach(function (child) {
        if (!child || child.nodeType !== 1 || isUiArtifact(child)) return;

        if (child.tagName === 'UL' || child.tagName === 'OL') {
          Array.from(child.children || []).forEach(function (nestedLi) {
            if (nestedLi.tagName === 'LI') splitListItem(nestedLi);
          });
          return;
        }

        if (isAtomicSplitNode(child)) {
          if (normalizePrintText(child.textContent || '').length > 0 || containsFigureDescendant(child) || isTableLikeNode(child) || !!child.querySelector('table, .print-table-block')) {
            pushUnique(bucket, child);
          }
          return;
        }

        if (child.tagName === 'DIV' || child.tagName === 'SECTION' || child.tagName === 'DETAILS' || child.tagName === 'ARTICLE' || child.tagName === 'BLOCKQUOTE') {
          var before = bucket.length;
          collectSplitTargets(child, bucket);
          if (bucket.length === before) {
            var hasElementChildren = Array.from(child.children || []).some(function (grandChild) {
              return grandChild && grandChild.nodeType === 1 && !isUiArtifact(grandChild);
            });
            if (!hasElementChildren && (normalizePrintText(child.textContent || '').length > 0 || containsFigureDescendant(child) || isTableLikeNode(child) || !!child.querySelector('table, .print-table-block'))) {
              pushUnique(bucket, child);
            }
          }
          return;
        }

        if (normalizePrintText(child.textContent || '').length > 0 && !child.querySelector('h1, h2, h3, h4, h5, h6, hr')) {
          pushUnique(bucket, child);
        }
      });
      return bucket.length > initialLength;
    }

    function splitListItem(li) {
      if (!li || li.nodeType !== 1) return;

      var directBlocks = [];
      collectSplitTargets(li, directBlocks);

      if (directBlocks.length) {
        directBlocks.forEach(function (child) {
          addSplitBlock(child, 'li-block');
        });
      } else if (normalizePrintText(li.textContent || '').length > 0) {
        addSplitBlock(li, 'li');
      }
    }

    var declaredAtomicBlocks = Array.from(document.querySelectorAll(atomicCandidateSelector())).filter(function (node) {
      if (!node || node.nodeType !== 1 || isUiArtifact(node)) return false;
      if (node.closest && node.closest('table') && !isTableLikeNode(node)) return false;
      var declaredType = blockTypeFromContract(node);
      return !!declaredType;
    }).sort(function (left, right) {
      var leftMeta = blockMetadata(left);
      var rightMeta = blockMetadata(right);
      var leftOrder = leftMeta && typeof leftMeta.order_index === 'number' ? leftMeta.order_index : 999999;
      var rightOrder = rightMeta && typeof rightMeta.order_index === 'number' ? rightMeta.order_index : 999999;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return 0;
    });

    declaredAtomicBlocks.forEach(function (node) {
      if (!node || node.nodeType !== 1 || isUiArtifact(node)) return;
      addSplitBlock(node, blockRoleFromContract(node) || 'declared-block');
    });

    if (declaredAtomicBlocks.length) {
      Array.from(document.querySelectorAll('article.page li[data-print-block-type="list_item"]')).forEach(function (li) {
        splitListItem(li);
      });
      return;
    }

    var rootContainers = Array.from(document.querySelectorAll('.print-section'));
    if (!rootContainers.length) {
      var fallbackPageBody = document.querySelector('.page-body');
      if (fallbackPageBody) rootContainers = [fallbackPageBody];
    }

    rootContainers.forEach(function (section) {
      var sectionBlocks = [];
      collectSplitTargets(section, sectionBlocks);
      sectionBlocks.forEach(function (child) {
        if (child.tagName === 'H1' || child.tagName === 'H2' || child.tagName === 'H3' || child.tagName === 'HR') return;
        addSplitBlock(child, 'section-block');
      });
    });

    Array.from(document.querySelectorAll('.print-appendix-block > .indented > ol.numbered-list > li, .print-appendix-block > .indented > div > ol.numbered-list > li')).forEach(function (li) {
      splitListItem(li);
    });

    Array.from(document.querySelectorAll('article.page > header .page-title, article.page > header .print-table-block, .page-body .print-details-summary, .page-body .print-inline-block, .page-body .print-major-title, .page-body p, .page-body figure.image, .page-body .print-table-block')).forEach(function (node) {
      if (!node || node.nodeType !== 1 || isUiArtifact(node)) return;
      if (node.closest && node.closest('table')) return;
      if (node.tagName === 'P' && !normalizePrintText(node.textContent || '')) return;
      if (node.tagName === 'FIGURE' && !containsFigureDescendant(node) && !node.querySelector('img')) return;
      addSplitBlock(node, 'element-block');
    });
  }

  function applyStoredTextOverrides() {
    Array.from(document.querySelectorAll('[data-print-edit-id]')).forEach(function (node) {
      var id = node.dataset.printEditId;
      if (!id) return;
      if (Object.prototype.hasOwnProperty.call(textOverrideMap, id)) {
        node.innerHTML = textOverrideMap[id];
      }
    });
  }

  function applyStoredDeletedNodes() {
    Array.from(document.querySelectorAll('[data-print-persist-id]')).forEach(function (node) {
      var id = node.dataset.printPersistId;
      if (!id) return;
      if (deletedNodeMap[id]) {
        node.remove();
      }
    });
  }

  function applyStoredManualGaps() {
    Array.from(document.querySelectorAll('[data-print-break-id], [data-print-persist-id]')).forEach(function (node) {
      var key = (node.dataset && (node.dataset.printBreakId || node.dataset.printPersistId)) || '';
      if (!key) return;
      var amount = parseInt(manualGapMap[key] || '0', 10);
      node.style.removeProperty('--print-manual-gap');
      node.classList.remove('print-has-manual-gap');
      if (!(amount > 0)) return;
      node.style.setProperty('--print-manual-gap', String(amount * 0.9) + 'em');
      node.classList.add('print-has-manual-gap');
    });
  }

  function pullUpContainerForCandidate(candidate) {
    if (!candidate || !candidate.node || !candidate.node.closest) return null;
    return candidate.node.closest('[data-print-flow-segment-root="true"], li, details, blockquote, .callout, .print-table-block, .print-details-block');
  }

  function candidatePullUpEnabled(candidate) {
    if (!candidate || !candidate.node) return false;
    return !!(pullUpOverrideMap[candidate.id] || candidate.node.dataset.printPullUpMode === 'pull_up');
  }

  function figureBaseScaleFactor(figure) {
    var availableWidth = figureAvailableWidthPx(figure);
    if (!(availableWidth > 0)) return 1;
    var image = imageElementForFigure(figure);
    if (image) {
      var inlineWidth = image.style && typeof image.style.width === 'string' ? image.style.width.trim() : '';
      if (inlineWidth) {
        if (/%$/i.test(inlineWidth)) {
          return clampNumber(parseFloat(inlineWidth) / 100, 0.01, 1);
        }
        var inlineWidthPx = parseFloat(inlineWidth);
        if (inlineWidthPx > 0) {
          return clampNumber(Math.min(inlineWidthPx, availableWidth) / availableWidth, 0.01, 1);
        }
      }
      var widthAttr = parseFloat(image.getAttribute('width') || '');
      if (widthAttr > 0) {
        return clampNumber(Math.min(widthAttr, availableWidth) / availableWidth, 0.01, 1);
      }
    }
    var cachedBaseScale = parseFloat((figure.dataset && figure.dataset.printImageBaseScale) || '');
    if (cachedBaseScale > 0) {
      return clampNumber(cachedBaseScale, 0.01, 1);
    }
    var renderedWidth = figureRenderedWidthPx(figure);
    var fallbackScale = renderedWidth > 0 ? clampNumber(renderedWidth / availableWidth, 0.01, 1) : 1;
    if (figure.dataset) {
      figure.dataset.printImageBaseScale = String(fallbackScale);
    }
    return fallbackScale;
  }

  function maximumFigureWidthPx(figure) {
    var availableWidth = figureAvailableWidthPx(figure);
    if (!(availableWidth > 0)) return 1;
    return Math.max(1, Math.round(availableWidth * figureBaseScaleFactor(figure)));
  }

  function imageScaleValue(level, figure) {
    return figureBaseScaleFactor(figure) * (sanitizeImageScale(level) / 100);
  }

  function imageSelectionIds() {
    selectedImageIds = uniqueTruthyStrings(selectedImageIds || []).filter(function (figureId) {
      return !!document.querySelector('figure.image[data-print-persist-id="' + figureId + '"]');
    });
    return selectedImageIds.slice();
  }

  function imageSelectionIncludes(figureId) {
    return imageSelectionIds().indexOf(String(figureId || '')) >= 0;
  }

  function imageSelectionTargetIds(primaryFigureId) {
    return uniqueTruthyStrings(imageSelectionIds().concat(primaryFigureId ? [String(primaryFigureId)] : []));
  }

  function setImageSelectionIds(nextIds) {
    selectedImageIds = uniqueTruthyStrings(nextIds || []);
    syncSelectedRenderedState();
  }

  function toggleImageSelectionId(figureId) {
    var nextIds = imageSelectionIds();
    var normalized = String(figureId || '');
    if (!normalized) return false;
    var index = nextIds.indexOf(normalized);
    if (index >= 0) {
      nextIds.splice(index, 1);
      setImageSelectionIds(nextIds);
      return false;
    }
    nextIds.push(normalized);
    setImageSelectionIds(nextIds);
    return true;
  }

  function imageElementForFigure(figure) {
    return figure && figure.querySelector ? figure.querySelector('img') : null;
  }

  function figureAvailableWidthPx(figure) {
    if (!figure || !figure.getBoundingClientRect) return 0;
    return Math.max(0, Math.round(figure.getBoundingClientRect().width || 0));
  }

  function figureRenderedWidthPx(figure) {
    var image = imageElementForFigure(figure);
    if (!image || !image.getBoundingClientRect) return 0;
    return Math.max(0, Math.round(image.getBoundingClientRect().width || 0));
  }

  function figureNaturalWidthPx(figure) {
    var image = imageElementForFigure(figure);
    if (!image) return 0;
    return Math.max(0, Math.round(image.naturalWidth || image.width || 0));
  }

  function minimumFigureWidthPx(figure) {
    return Math.max(1, Math.round((maximumFigureWidthPx(figure) * minimumImageScalePct) / 100));
  }

  function targetScaleForFigureWidthPx(figure, widthPx) {
    var maximumWidth = maximumFigureWidthPx(figure);
    if (!(maximumWidth > 0)) return 100;
    var safeWidth = clampNumber(widthPx, minimumFigureWidthPx(figure), maximumWidth);
    return sanitizeImageScale((safeWidth / maximumWidth) * 100);
  }

  function currentFigureWidthInfo(figure) {
    return {
      renderedWidthPx: figureRenderedWidthPx(figure),
      availableWidthPx: figureAvailableWidthPx(figure),
      maximumWidthPx: maximumFigureWidthPx(figure),
      naturalWidthPx: figureNaturalWidthPx(figure)
    };
  }

  function figureWidthInfoText(figure) {
    var info = currentFigureWidthInfo(figure);
    var parts = [];
    if (info.renderedWidthPx > 0) parts.push('현재 ' + info.renderedWidthPx + 'px');
    if (info.availableWidthPx > 0) parts.push('최소 ' + minimumFigureWidthPx(figure) + 'px');
    if (info.maximumWidthPx > 0) parts.push('최대 ' + info.maximumWidthPx + 'px');
    if (info.naturalWidthPx > 0) parts.push('원본 ' + info.naturalWidthPx + 'px');
    return parts.length ? parts.join(' · ') : '이미지 크기 정보를 계산하는 중';
  }

  function updateFigureSelectionUi(figure, selectionIds) {
    if (!figure || !figure.dataset) return;
    var figureId = figure.dataset.printPersistId || '';
    var currentSelectionIds = Array.isArray(selectionIds) ? selectionIds : imageSelectionIds();
    var selectionCount = currentSelectionIds.length;
    var inSelection = !!(figureId && currentSelectionIds.indexOf(String(figureId || '')) >= 0);
    figure.classList.toggle('print-image-group-selected', inSelection);

    var selectionButton = figure.querySelector('.print-image-selection-button');
    if (selectionButton) {
      selectionButton.textContent = inSelection ? '선택 해제' : '선택 추가';
      selectionButton.title = inSelection ? '이 이미지를 너비 통일 선택에서 제외' : '이 이미지를 너비 통일 선택 목록에 추가';
    }

    var countBadge = figure.querySelector('.print-image-selection-count');
    if (countBadge) {
      countBadge.textContent = selectionCount > 0 ? ('선택 ' + selectionCount + '개') : '단일';
    }

    var unifyButton = figure.querySelector('.print-image-unify-button');
    if (unifyButton) {
      var targetCount = uniqueTruthyStrings(currentSelectionIds.concat(figureId ? [String(figureId)] : [])).length;
      unifyButton.disabled = targetCount < 2;
      unifyButton.title = targetCount >= 2 ? '현재 이미지 너비를 선택한 이미지들에 맞춰 적용' : '먼저 통일할 이미지를 두 개 이상 선택하세요';
    }
  }

  function updateFigureWidthUi(figure) {
    if (!figure) return;
    var infoText = figureWidthInfoText(figure);
    var infoNode = figure.querySelector('.print-image-width-live');
    if (infoNode) infoNode.textContent = infoText;

    var widthInput = figure.querySelector('.print-image-width-input');
    if (widthInput) {
      widthInput.min = String(minimumFigureWidthPx(figure));
      widthInput.max = String(maximumFigureWidthPx(figure));
    }
    if (widthInput && document.activeElement !== widthInput) {
      var currentWidth = figureRenderedWidthPx(figure);
      if (currentWidth > 0) widthInput.value = String(currentWidth);
    }
  }

  function figureToolStateTargets(figures) {
    if (!figures || !figures.length) {
      return Array.from(document.querySelectorAll('figure.image[data-print-persist-id]'));
    }
    return uniqueTruthyStrings((figures || []).map(function (figure) {
      return figure && figure.dataset ? figure.dataset.printPersistId || '' : '';
    })).map(function (figureId) {
      return persistedNodeById(figureId);
    }).filter(Boolean);
  }

  function refreshFigureToolState(figures) {
    var selectionIds = imageSelectionIds();
    figureToolStateTargets(figures).forEach(function (figure) {
      updateFigureSelectionUi(figure, selectionIds);
      updateFigureWidthUi(figure);
    });
  }

  function scheduleFigureToolStateRefresh(figures) {
    if (figures && figures.length) {
      figureToolStateTargets(figures).forEach(function (figure) {
        var figureId = figure && figure.dataset ? figure.dataset.printPersistId || '' : '';
        if (figureId) pendingFigureToolRefreshIds[figureId] = true;
      });
    } else {
      pendingFigureToolRefreshIds.__all__ = true;
    }
    if (figureToolRefreshScheduled) return;
    figureToolRefreshScheduled = true;
    var flush = function () {
      figureToolRefreshScheduled = false;
      var refreshAll = !!pendingFigureToolRefreshIds.__all__;
      var ids = Object.keys(pendingFigureToolRefreshIds).filter(function (key) {
        return key && key !== '__all__';
      });
      pendingFigureToolRefreshIds = {};
      if (refreshAll || !ids.length) {
        refreshFigureToolState();
        return;
      }
      refreshFigureToolState(ids.map(function (figureId) {
        return persistedNodeById(figureId);
      }).filter(Boolean));
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(flush);
      return;
    }
    setTimeout(flush, 16);
  }

  function updateFigureScaleUi(figure, level) {
    if (!figure) return;
    var safeLevel = sanitizeImageScale(level);
    var slider = figure.querySelector('.print-image-scale-range');
    var value = figure.querySelector('.print-image-scale-value');
    if (slider) updateImageSliderVisual(slider, safeLevel);
    if (value) value.textContent = formatImageScaleLabel(safeLevel);
  }

  function closeImageToolPanels(exceptFigure) {
    Array.from(document.querySelectorAll('figure.image.print-image-tools-open')).forEach(function (figure) {
      if (exceptFigure && figure === exceptFigure) return;
      figure.classList.remove('print-image-tools-open');
    });
  }

  function openImageToolPanel(figure) {
    if (!figure) return;
    closeImageToolPanels(figure);
    figure.classList.add('print-image-tools-open');
  }

  function applyFigureScaleToFigure(figure, level, options) {
    if (!figure) return;
    var config = options || {};
    var safeLevel = sanitizeImageScale(level);
    var factor = imageScaleValue(safeLevel, figure);
    figure.dataset.printImageScale = String(safeLevel);
    figure.style.setProperty('--print-image-scale', String(factor));
    figure.classList.toggle('print-image-resized', safeLevel < 100);
    if (!config.skipUi) {
      updateFigureScaleUi(figure, safeLevel);
    }
  }

  function applyFigureScalePreview(figureId, level) {
    var safeLevel = sanitizeImageScale(level);
    var figure = persistedNodeById(figureId);
    applyFigureScaleToFigure(figure, safeLevel);
  }

  function currentStoredImageScale(figureId) {
    return sanitizeImageScale(imageScaleMap[figureId] || 100);
  }

  function applyStoredImageScales() {
    var touchedFigures = [];
    Array.from(document.querySelectorAll('figure.image[data-print-persist-id]')).forEach(function (figure) {
      var key = figure.dataset && figure.dataset.printPersistId ? figure.dataset.printPersistId : '';
      if (!key) return;
      figureBaseScaleFactor(figure);
      applyFigureScaleToFigure(figure, currentStoredImageScale(key));
      touchedFigures.push(figure);
    });
    if (touchedFigures.length) {
      scheduleFigureToolStateRefresh(touchedFigures);
    }
  }

  function breakLabelText(node, fallback) {
    var text = normalizePrintText((node && node.textContent) || '');
    if (!text) return fallback;
    return text.length > 72 ? text.slice(0, 72) + '…' : text;
  }

  function candidateLabelFromBlock(node, fallback) {
    if (!node) return fallback;
    var declaredLabel = blockLabelFromContract(node);
    if (declaredLabel) return declaredLabel;
    if (isTableLikeNode(node)) {
      var tableLabelNode = node.querySelector && node.querySelector('caption, th, td');
      var tableLabel = breakLabelText(tableLabelNode || node, fallback);
      if (!tableLabel || tableLabel === fallback) return '표 블록';
      return '표 - ' + tableLabel;
    }
    var labelNode = directChildByClass(node, 'print-inline-block') ||
      Array.from(node.querySelectorAll('.print-inline-block, p')).find(function (child) {
        return !containsFigureDescendant(child);
      }) ||
      node;
    return breakLabelText(labelNode, fallback);
  }

  function clearBreakAnchors() {
    Array.from(document.querySelectorAll('[data-print-break-anchor-for]')).forEach(function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function clearManualForceAnchors() {
    Array.from(document.querySelectorAll('[data-print-manual-force-for]')).forEach(function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function firstSplitBlockInListItem(listItem) {
    if (!listItem || !listItem.querySelectorAll) return null;
    return Array.from(listItem.querySelectorAll('.print-split-block')).find(function (node) {
      return node && node.nodeType === 1 && node.closest && node.closest('li') === listItem;
    }) || null;
  }

  function explicitBreakRootForNode(node) {
    if (!node || node.nodeType !== 1 || !node.dataset) return null;
    var rootId = node.dataset.printBreakRootId || '';
    if (!rootId) return null;
    return document.querySelector('[data-print-root-id="' + rootId + '"]');
  }

  function physicalBreakRootForNode(node) {
    if (!node || node.nodeType !== 1 || !node.closest) return node;
    var explicitRoot = explicitBreakRootForNode(node);
    if (explicitRoot) return explicitRoot;
    var flowSegmentRoot = node.closest('[data-print-flow-segment-root="true"]');
    if (flowSegmentRoot) return flowSegmentRoot;
    var blockType = blockTypeFromContract(node);
    if (blockType === 'details_summary') {
      var details = node.closest('details');
      if (details) return details;
    }
    var listItem = node.closest('li[data-print-block-type="list_item"], li');
    if (listItem && listItem.closest('article.page')) {
      var firstSplitBlock = firstSplitBlockInListItem(listItem);
      var isFirstListBlock = !!(firstSplitBlock && (firstSplitBlock === node || firstSplitBlock.contains(node)));
      if (blockType === 'list_item_heading' || isFirstListBlock) {
        return listItem;
      }
      listItem.classList.add('print-breakable-item');
      return node;
    }
    return node;
  }

  function ensureBreakAnchor(rootNode, candidateId) {
    if (!rootNode || !rootNode.parentNode || !candidateId) return rootNode;
    var previous = rootNode.previousElementSibling;
    if (previous && previous.getAttribute('data-print-break-anchor-for') === candidateId) {
      return previous;
    }
    var anchor = document.createElement('div');
    anchor.className = 'print-break-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    anchor.dataset.printBreakAnchorFor = candidateId;
    rootNode.parentNode.insertBefore(anchor, rootNode);
    return anchor;
  }

  function ensureManualForceAnchor(rootNode, candidate) {
    if (!rootNode || !rootNode.parentNode || !candidate || !candidate.id) return rootNode;
    var previous = rootNode.previousElementSibling;
    if (previous && previous.getAttribute('data-print-manual-force-for') === candidate.id) {
      previous.className = 'print-break-anchor print-manual-force-anchor ' + String(candidate.className || '');
      return previous;
    }
    var anchor = document.createElement('div');
    anchor.className = 'print-break-anchor print-manual-force-anchor ' + String(candidate.className || '');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.dataset.printManualForceFor = candidate.id;
    rootNode.parentNode.insertBefore(anchor, rootNode);
    return anchor;
  }

  function manualForceRootForCandidate(candidate) {
    if (!candidate || !candidate.node) return null;
    return physicalBreakRootForNode(candidate.node) || candidate.node;
  }

  function shouldUseDirectBreakRoot(rootNode) {
    if (!rootNode || rootNode.nodeType !== 1 || !rootNode.closest) return false;
    if (rootNode.matches('li, p, figure, table, section, details, blockquote, h1, h2, h3, h4, h5, h6')) return true;
    if (rootNode.matches('.indented')) return true;
    if (rootNode.matches('.print-inline-block, .print-major-title, .print-table-block, .print-shortcut-block')) return true;
    return !!rootNode.closest('li[data-print-block-type="list_item"], li');
  }

  function registerCandidate(node, options) {
    if (!node || node.hasAttribute('data-print-break-id')) return;
    var id = options.id;
    ensurePersistentId(node, options.kind || 'candidate');
    var physicalRoot = options.breakNode || physicalBreakRootForNode(node);
    var breakRoot = physicalRoot;
    var breakRootMode = node.dataset ? String(node.dataset.printBreakRootMode || '') : '';
    var preferAnchorBreakRoot = !options.breakNode && breakRootMode === 'list_item';
    if (!options.breakNode && (preferAnchorBreakRoot || !shouldUseDirectBreakRoot(physicalRoot))) {
      breakRoot = ensureBreakAnchor(physicalRoot, id);
    }
    node.dataset.printBreakId = id;
    node.dataset.printBreakKind = options.kind;
    node.dataset.printBreakClass = options.className;
    breakCandidates.push({
      id: id,
      node: node,
      breakNode: breakRoot,
      className: options.className,
      kind: options.kind,
      label: options.label
    });
  }

  function candidateRegistrationFallback() {
    Array.from(document.querySelectorAll('article.page > header .page-title, article.page > header .print-table-block')).forEach(function (block, index) {
      if (!block || block.hasAttribute('data-print-break-id')) return;
      registerCandidate(block, {
        id: 'header-' + index + '-' + breakCandidates.length,
        kind: 'block',
        className: 'print-block-page-start',
        label: candidateLabelFromBlock(block, index === 0 ? '페이지 제목' : '헤더 블록 ' + (index + 1))
      });
    });

    var sectionNodes = Array.from(document.querySelectorAll('.page-body > .print-section'));
    if (sectionNodes.length) {
      sectionNodes.forEach(function (section, index) {
        if (index === 0) return;
        var heading = section.querySelector(sectionHeadingSelector());
        var id = 'section-' + index;
        registerCandidate(section, {
          id: id,
          kind: 'section',
          className: 'print-page-start',
          label: breakLabelText(heading, '섹션 ' + (index + 1))
        });
      });
    } else {
      Array.from(document.querySelectorAll('.page-body > h1:not(.page-title), .page-body > h2, .page-body > h3')).forEach(function (heading, index) {
        if (index === 0) return;
        registerCandidate(heading, {
          id: 'heading-' + index,
          kind: 'section',
          className: 'print-page-start',
          label: breakLabelText(heading, '섹션 ' + (index + 1))
        });
      });
    }

    Array.from(document.querySelectorAll('.print-split-block')).forEach(function (block, index) {
      if (block.hasAttribute('data-print-break-id')) return;
      registerCandidate(block, {
        id: 'split-' + index + '-' + breakCandidates.length,
        kind: 'block',
        className: 'print-block-page-start',
        label: candidateLabelFromBlock(block, '세부 블록 ' + (index + 1))
      });
    });
  }

  function candidateIdForNode(node) {
    var meta = blockMetadata(node);
    if (meta && meta.persist_id) return 'candidate::' + meta.persist_id;
    if (node && node.dataset && node.dataset.printPersistId) return 'candidate::' + node.dataset.printPersistId;
    return 'candidate::' + String(breakCandidates.length + 1);
  }

  function registerBreakCandidates() {
    breakCandidates = [];
    clearBreakAnchors();
    var declaredBlocks = Array.from(document.querySelectorAll(atomicCandidateSelector())).filter(function (node) {
      if (!node || node.nodeType !== 1) return false;
      var blockType = blockTypeFromContract(node);
      if (!blockType) return false;
      if (node.closest && node.closest('table') && !isTableLikeNode(node)) return false;
      return true;
    }).sort(function (left, right) {
      var leftMeta = blockMetadata(left);
      var rightMeta = blockMetadata(right);
      var leftOrder = leftMeta && typeof leftMeta.order_index === 'number' ? leftMeta.order_index : 999999;
      var rightOrder = rightMeta && typeof rightMeta.order_index === 'number' ? rightMeta.order_index : 999999;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return 0;
    });

    if (!declaredBlocks.length) {
      candidateRegistrationFallback();
      return;
    }

    declaredBlocks.forEach(function (node) {
      if (node.hasAttribute('data-print-break-id')) return;
      var blockType = blockTypeFromContract(node);
      var meta = blockMetadata(node);
      var isSectionHeading = blockType === 'section_heading';
      var sectionIndex = meta && typeof meta.section_index === 'number' ? meta.section_index : -1;
      registerCandidate(node, {
        id: candidateIdForNode(node),
        kind: isSectionHeading ? 'section' : 'block',
        className: isSectionHeading ? 'print-page-start' : 'print-block-page-start',
        label: candidateLabelFromBlock(node, isSectionHeading ? '섹션 ' + String(sectionIndex + 1) : '블록')
      });
    });
  }

  function applyBreakModeToCandidate(candidate) {
    var manualMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
    var autoBreak = candidate.node.dataset.printAutoBreak === 'on';
    var resolved = manualMode === 'auto' && autoBreak;
    var breakNode = candidate.breakNode || candidate.node;

    candidate.node.dataset.printBreakMode = manualMode;
    candidate.node.classList.remove(candidate.className);
    if (breakNode && breakNode !== candidate.node) {
      breakNode.classList.remove(candidate.className);
    }
    if (breakNode) {
      breakNode.classList.toggle(candidate.className, resolved);
    }
    candidate.node.dataset.printBreakResolved = (manualMode === 'force' || resolved) ? 'on' : 'off';
  }

  function applyPullUpModeToCandidate(candidate) {
    if (!candidate || !candidate.node) return;
    var enabled = candidatePullUpEnabled(candidate);
    var container = pullUpContainerForCandidate(candidate);
    candidate.node.dataset.printPullUpMode = enabled ? 'pull_up' : 'auto';
    candidate.node.classList.toggle('print-merge-pull-up', enabled);
    if (container) {
      container.classList.toggle('print-merge-pull-up-container', enabled);
    }
  }

  function applySpaceModeToCandidate(candidate) {
    var spaceMode = sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || spaceOverrideMap[candidate.id] || 'auto');
    candidate.node.dataset.printSpaceMode = spaceMode;
    candidate.node.classList.toggle('print-space-tight', spaceMode === 'tight');
    candidate.node.classList.toggle('print-space-wide', spaceMode === 'wide');
  }

  function clearForcedBreakAfterMarkers() {
    Array.from(document.querySelectorAll('.print-force-break-after')).forEach(function (node) {
      node.classList.remove('print-force-break-after');
    });
  }

  function applyManualForceAnchors() {
    clearManualForceAnchors();
    breakCandidates.forEach(function (candidate) {
      if (!candidate || !candidate.node || !candidate.node.dataset) return;
      var manualMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
      if (manualMode !== 'force') return;
      var root = manualForceRootForCandidate(candidate);
      if (!root || !root.parentNode) return;
      ensureManualForceAnchor(root, candidate);
    });
  }

  function physicalBreakAfterRootForCandidate(candidate) {
    if (!candidate || !candidate.node) return null;
    var root = physicalBreakRootForNode(candidate.node);
    if (root && root.nodeType === 1 && root.matches && root.matches('.print-break-anchor')) {
      return candidate.node;
    }
    return root || candidate.node;
  }

  function applyForcedBreakAfterMarkers() {
    clearForcedBreakAfterMarkers();
    breakCandidates.forEach(function (candidate) {
      if (!candidate || !candidate.node || !candidate.node.dataset) return;
      var manualMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
      if (manualMode !== 'force') return;
      var breakRootMode = String(candidate.node.dataset.printBreakRootMode || '');
      var blockType = blockTypeFromContract(candidate.node);
      if (breakRootMode !== 'wrapper_segment' && blockType !== 'list_item_heading') return;
      var previous = previousCandidateInOrder(candidate);
      if (!previous || !previous.node) return;
      var previousRoot = physicalBreakAfterRootForCandidate(previous);
      if (!previousRoot || !previousRoot.classList) return;
      previousRoot.classList.add('print-force-break-after');
    });
  }

  function applyResolvedBreakModes() {
    breakCandidates.forEach(function (candidate) {
      applyBreakModeToCandidate(candidate);
      applyPullUpModeToCandidate(candidate);
      applySpaceModeToCandidate(candidate);
    });
    applyManualForceAnchors();
    applyForcedBreakAfterMarkers();
  }

  function getPrintMetrics() {
    if (document.body.classList.contains('print-compact')) {
      return { pageWidth: 718, pageHeight: 1032 };
    }
    return { pageWidth: 688, pageHeight: 1001 };
  }

  function buildMeasurementClone() {
    var article = document.querySelector('article.page');
    if (!article) return null;

    var host = document.createElement('div');
    host.className = 'print-measure-root';

    var clone = article.cloneNode(true);
    host.appendChild(clone);
    document.body.appendChild(host);

    Array.from(clone.querySelectorAll('.print-page-start')).forEach(function (node) {
      node.classList.remove('print-page-start');
    });
    Array.from(clone.querySelectorAll('.print-major-page-start')).forEach(function (node) {
      node.classList.remove('print-major-page-start');
    });

    return { host: host, article: clone };
  }

  function relativeTop(node, root) {
    return node.getBoundingClientRect().top - root.getBoundingClientRect().top;
  }

  function shouldForcePageStart(top, pageHeight) {
    var used = top % pageHeight;
    return used >= pageHeight * (2 / 3);
  }

  function applyConditionalPageStarts() {
    breakCandidates.forEach(function (candidate) {
      candidate.node.classList.remove(candidate.className);
      if (candidate.breakNode && candidate.breakNode !== candidate.node) {
        candidate.breakNode.classList.remove(candidate.className);
      }
      candidate.node.dataset.printAutoBreak = 'off';
    });
    applyResolvedBreakModes();
  }

  function candidateAutoLabel(candidate) {
    var recommendation = candidateRecommendation(candidate);
    if (!recommendation) return '자동 추천 없음';
    var parts = [];
    if (recommendation.break && recommendation.break.mode === 'force') {
      parts.push(recommendation.break.label);
    }
    if (recommendation.gap && recommendation.gap.units > 0) {
      parts.push(recommendation.gap.label);
    }
    return parts.length ? parts.join(', ') : '자동 추천 없음';
  }

  function candidateManualLabel(candidate) {
    var mode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || 'auto');
    if (mode === 'force') return '수동: 여기서 시작';
    if (candidatePullUpEnabled(candidate)) return '수동: 앞에 붙이기';
    return '수동: 기본 흐름';
  }

  function candidateSpaceLabel(candidate) {
    var mode = sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || 'auto');
    if (mode === 'tight') return '공백: 좁게';
    if (mode === 'wide') return '공백: 넓게';
    return '공백: 기본';
  }

  function candidateGapLabel(candidate) {
    var id = candidate.node.dataset.printBreakId || candidate.node.dataset.printPersistId || '';
    var amount = parseInt(manualGapMap[id] || '0', 10);
    return '빈칸: ' + (amount > 0 ? String(amount) : '0');
  }

  function highlightAndScrollToNode(node, options) {
    if (!node) return;
    var config = options || {};
    scrollNodeToOffset(node, typeof config.offsetTopPx === 'number' ? config.offsetTopPx : 96, config.behavior || 'smooth');
    node.classList.remove('print-editor-target-highlight');
    void node.offsetWidth;
    node.classList.add('print-editor-target-highlight');
    setTimeout(function () {
      node.classList.remove('print-editor-target-highlight');
    }, 1800);
  }

  function findRenderedBreakNode(candidate) {
    if (!candidate) return null;
    return document.querySelector('.pagedjs_pages [data-print-break-id="' + candidate.id + '"]') || candidate.node;
  }

  function clampNumber(value, min, max) {
    var parsed = Number(value);
    if (!isFinite(parsed)) return min;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  function scrollNodeToOffset(node, offsetTopPx, behavior) {
    if (!node || !node.getBoundingClientRect) return;
    var rect = node.getBoundingClientRect();
    var currentTop = window.scrollY || window.pageYOffset || 0;
    var desiredOffset = clampNumber(offsetTopPx, 48, Math.max(96, (window.innerHeight || 720) - 96));
    window.scrollTo({
      top: Math.max(0, currentTop + rect.top - desiredOffset),
      behavior: behavior || 'auto'
    });
  }

  function findCandidateByPersistId(persistId) {
    if (!persistId) return null;
    return breakCandidates.find(function (candidate) {
      return candidate && candidate.node && candidate.node.dataset && candidate.node.dataset.printPersistId === persistId;
    }) || null;
  }

  function currentSelectedTarget() {
    return {
      kind: String(selectedTargetState.kind || ''),
      candidate_id: String(selectedTargetState.candidateId || ''),
      persist_id: String(selectedTargetState.persistId || ''),
      page_number: parseInt(selectedTargetState.pageNumber || '0', 10) || 0,
      has_selection: !!(selectedTargetState.candidateId || selectedTargetState.persistId)
    };
  }

  function clearSelectedRenderedState() {
    Array.from(document.querySelectorAll('.print-selected-target')).forEach(function (node) {
      node.classList.remove('print-selected-target');
    });
  }

  function currentSelectedRenderedNode() {
    if (selectedTargetState.kind === 'page' && selectedTargetState.pageNumber) {
      var pageNode = document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number="' + String(selectedTargetState.pageNumber) + '"]');
      if (pageNode) return pageNode;
    }
    if (selectedTargetState.kind === 'image' && selectedTargetState.persistId) {
      var imageNode = persistedNodeById(selectedTargetState.persistId);
      if (imageNode) return imageNode;
    }
    if (selectedTargetState.candidateId) {
      var candidateNode = findRenderedCandidateNode(selectedTargetState.candidateId);
      if (candidateNode) return candidateNode;
    }
    if (selectedTargetState.persistId) {
      return persistedNodeById(selectedTargetState.persistId);
    }
    return null;
  }

  function syncSelectedRenderedState() {
    clearSelectedRenderedState();
    var targetNode = currentSelectedRenderedNode();
    if (targetNode && targetNode.classList) {
      targetNode.classList.add('print-selected-target');
    }
    if (editorBlockSelect && selectedTargetState.candidateId) {
      editorBlockSelect.value = selectedTargetState.candidateId;
    }
    if (editorPageSelect && selectedTargetState.pageNumber) {
      editorPageSelect.value = String(selectedTargetState.pageNumber);
    }
    scheduleFigureToolStateRefresh();
  }

  function setSelectedTarget(nextState, options) {
    var config = options || {};
    var normalized = nextState || {};
    selectedTargetState = {
      kind: String(normalized.kind || ''),
      candidateId: String(normalized.candidateId || ''),
      persistId: String(normalized.persistId || ''),
      pageNumber: parseInt(normalized.pageNumber || '0', 10) || 0
    };
    if (!selectedTargetState.candidateId && selectedTargetState.persistId) {
      var fallbackCandidate = findCandidateByPersistId(selectedTargetState.persistId);
      if (fallbackCandidate) {
        selectedTargetState.candidateId = fallbackCandidate.id;
      }
    }
    syncSelectedRenderedState();
    if (!config.silent) {
      if (selectedTargetState.kind === 'page' && selectedTargetState.pageNumber) {
        updateEditorBannerStatus(selectedTargetState.pageNumber + '페이지를 기준으로 보고 있습니다');
      } else if (selectedTargetState.persistId) {
        updateEditorBannerStatus('선택한 블록을 기준으로 편집합니다');
      }
    }
  }

  function clearSelectedTarget(options) {
    setSelectedTarget({ kind: '', candidateId: '', persistId: '', pageNumber: 0 }, options || { silent: true });
  }

  function setSelectedCandidate(candidate, options) {
    if (!candidate) {
      clearSelectedTarget(options);
      return;
    }
    setSelectedTarget({
      kind: 'block',
      candidateId: candidate.id,
      persistId: candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : '',
      pageNumber: pageNumberForRenderedCandidate(candidate.id)
    }, options);
  }

  function setSelectedPersistedNode(node, kind, options) {
    if (!node || !node.dataset) {
      clearSelectedTarget(options);
      return;
    }
    var persistId = node.dataset.printPersistId || '';
    var candidate = findCandidateByPersistId(persistId);
    setSelectedTarget({
      kind: String(kind || 'block'),
      candidateId: candidate ? candidate.id : '',
      persistId: persistId,
      pageNumber: pageNumberFromNode(closestRenderedPageNode(node))
    }, options);
  }

  function selectionForNode(node) {
    if (!node || !node.closest) return null;
    var image = node.closest('figure.image[data-print-persist-id]');
    if (image) {
      return {
        kind: 'image',
        candidateId: '',
        persistId: image.dataset && image.dataset.printPersistId ? image.dataset.printPersistId : '',
        pageNumber: pageNumberFromNode(closestRenderedPageNode(image))
      };
    }
    var candidateNode = node.closest('[data-print-break-id]');
    if (candidateNode) {
      var candidateId = candidateNode.getAttribute('data-print-break-id') || '';
      var candidate = findCandidateById(candidateId);
      return {
        kind: 'block',
        candidateId: candidateId,
        persistId: candidateNode.getAttribute('data-print-persist-id') || (candidate && candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : ''),
        pageNumber: pageNumberFromNode(closestRenderedPageNode(candidateNode))
      };
    }
    var persistedNode = node.closest('[data-print-persist-id]');
    if (persistedNode) {
      var fallbackCandidate = findCandidateByPersistId(persistedNode.dataset && persistedNode.dataset.printPersistId ? persistedNode.dataset.printPersistId : '');
      return {
        kind: 'block',
        candidateId: fallbackCandidate ? fallbackCandidate.id : '',
        persistId: persistedNode.dataset && persistedNode.dataset.printPersistId ? persistedNode.dataset.printPersistId : '',
        pageNumber: pageNumberFromNode(closestRenderedPageNode(persistedNode))
      };
    }
    var pageNode = node.closest('.pagedjs_page[data-page-number]');
    if (!pageNode) return null;
    return {
      kind: 'page',
      candidateId: '',
      persistId: '',
      pageNumber: pageNumberFromNode(pageNode)
    };
  }

  function isInteractiveCanvasTarget(node) {
    return !!(node && node.closest && node.closest('a, button, input, textarea, select, label, .print-page-action-group, .print-insert-actions, .print-inline-tools, .print-image-tools, .print-editor-banner, .print-editor-panel'));
  }

  function captureViewportAnchor(options) {
    var config = options || {};
    var explicitNode = config.preferredNode || null;
    var anchorNode = explicitNode || currentSelectedRenderedNode() || nearestRenderedCandidateToViewport() || visibleRenderedPageNode();
    var rect = anchorNode && anchorNode.getBoundingClientRect ? anchorNode.getBoundingClientRect() : null;
    var pageNode = anchorNode && anchorNode.classList && anchorNode.classList.contains('pagedjs_page') ? anchorNode : closestRenderedPageNode(anchorNode);
    return {
      candidate_id: anchorNode && anchorNode.getAttribute ? anchorNode.getAttribute('data-print-break-id') || '' : '',
      persist_id: anchorNode && anchorNode.getAttribute ? anchorNode.getAttribute('data-print-persist-id') || '' : '',
      page_number: pageNode && pageNode.getAttribute ? pageNode.getAttribute('data-page-number') || '' : '',
      offset_top_px: rect ? Math.round(rect.top) : null
    };
  }

  function resolveViewportAnchorNode(anchor) {
    if (!anchor || typeof anchor !== 'object') return null;
    if (anchor.candidate_id) {
      var candidateNode = findRenderedCandidateNode(anchor.candidate_id);
      if (candidateNode) return candidateNode;
    }
    if (anchor.persist_id) {
      var persistedNode = persistedNodeById(anchor.persist_id);
      if (persistedNode) return persistedNode;
    }
    if (anchor.page_number) {
      return document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number="' + String(anchor.page_number) + '"]');
    }
    return null;
  }

  function restoreViewportAnchor(anchor, fallbackNode, options) {
    var config = options || {};
    var node = fallbackNode || resolveViewportAnchorNode(anchor);
    if (!node) return false;
    var desiredOffset = typeof config.offsetTopPx === 'number'
      ? config.offsetTopPx
      : (anchor && typeof anchor.offset_top_px === 'number' ? anchor.offset_top_px : 96);
    scrollNodeToOffset(node, desiredOffset, config.behavior || 'auto');
    if (config.highlight === false) {
      return true;
    }
    if (node.classList && node.classList.contains('pagedjs_page')) {
      node.classList.remove('print-page-target-highlight');
      void node.offsetWidth;
      node.classList.add('print-page-target-highlight');
      setTimeout(function () {
        node.classList.remove('print-page-target-highlight');
      }, 1800);
      return true;
    }
    highlightAndScrollToNode(node, { offsetTopPx: desiredOffset, behavior: config.behavior || 'smooth' });
    return true;
  }

  function captureViewportMetrics(preferredNode) {
    return {
      scroll_top_px: Math.round(window.scrollY || window.pageYOffset || 0),
      viewport_height_px: Math.round(window.innerHeight || 0),
      viewport_width_px: Math.round(window.innerWidth || 0),
      anchor: captureViewportAnchor({ preferredNode: preferredNode || null })
    };
  }

  function captureRenderedNodePosition(node) {
    if (!node || !node.getBoundingClientRect) return null;
    var rect = node.getBoundingClientRect();
    var pageNode = closestRenderedPageNode(node);
    return {
      candidate_id: node.getAttribute ? node.getAttribute('data-print-break-id') || '' : '',
      persist_id: node.getAttribute ? node.getAttribute('data-print-persist-id') || '' : '',
      page_number: pageNumberFromNode(pageNode),
      viewport_top_px: Math.round(rect.top),
      viewport_bottom_px: Math.round(rect.bottom),
      viewport_height_px: Math.round(rect.height),
      viewport_width_px: Math.round(rect.width)
    };
  }

  function captureRenderedPageSnapshot(pageNode) {
    if (!pageNode) return null;
    var meta = describeRenderedPage(pageNode);
    return {
      page_number: meta.pageNumber,
      first_candidate_id: meta.firstCandidateId || '',
      last_candidate_id: meta.lastCandidateId || '',
      first_persist_id: meta.firstPersistId || '',
      last_persist_id: meta.lastPersistId || '',
      page_label: meta.primaryLabel || '',
      page_role: meta.role || 'page',
      continued_from_previous: !!meta.continuedFromPrevious,
      continues_to_next: !!meta.continuesToNext,
      shared_persist_ids: uniqueTruthyStrings(meta.sharedWithPrevious.concat(meta.sharedWithNext)),
      candidate_count: meta.candidateCount,
      persist_count: meta.persistCount
    };
  }

  function buildRuntimeActionMeta(targetNode, extra) {
    var pageNode = closestRenderedPageNode(targetNode) || visibleRenderedPageNode();
    return Object.assign({
      viewport_before: captureViewportMetrics(targetNode),
      focus_before: currentSelectedTarget(),
      target_before: captureRenderedNodePosition(targetNode),
      page_before: captureRenderedPageSnapshot(pageNode)
    }, extra || {});
  }

  function activeEditableId() {
    var active = document.activeElement;
    return active && active.dataset ? active.dataset.printEditId || '' : '';
  }

  function closestRenderedPageNode(node) {
    return node && node.closest ? node.closest('.pagedjs_page[data-page-number]') : null;
  }

  function pageNumberFromNode(pageNode) {
    if (!pageNode || !pageNode.getAttribute) return 0;
    return parseInt(pageNode.getAttribute('data-page-number') || '0', 10) || 0;
  }

  function visibleRenderedPageNode() {
    var viewportTop = window.scrollY || window.pageYOffset || 0;
    var viewportBottom = viewportTop + (window.innerHeight || 0);
    var viewportCenter = viewportTop + ((window.innerHeight || 0) / 2);
    var pages = Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]'));
    if (!pages.length) return null;
    var best = null;
    pages.forEach(function (pageNode) {
      var rect = pageNode.getBoundingClientRect();
      var top = rect.top + viewportTop;
      var bottom = rect.bottom + viewportTop;
      var center = top + ((bottom - top) / 2);
      var intersects = bottom > viewportTop && top < viewportBottom;
      var score = Math.abs(center - viewportCenter) - (intersects ? 1000 : 0);
      if (!best || score < best.score) {
        best = { node: pageNode, score: score };
      }
    });
    return best ? best.node : null;
  }

  function nearestRenderedCandidateToViewport() {
    var viewportTop = window.scrollY || window.pageYOffset || 0;
    var viewportBottom = viewportTop + (window.innerHeight || 0);
    var viewportCenter = viewportTop + ((window.innerHeight || 0) / 2);
    var nodes = Array.from(document.querySelectorAll('.pagedjs_pages [data-print-break-id]'));
    if (!nodes.length) return null;
    var best = null;
    nodes.forEach(function (node) {
      var rect = node.getBoundingClientRect();
      var top = rect.top + viewportTop;
      var bottom = rect.bottom + viewportTop;
      var center = top + ((bottom - top) / 2);
      var intersects = bottom > viewportTop && top < viewportBottom;
      var score = Math.abs(center - viewportCenter) - (intersects ? 1000 : 0);
      if (!best || score < best.score) {
        best = { node: node, score: score };
      }
    });
    return best ? best.node : null;
  }

  function buildReloadFocusPayload(options) {
    var config = options || {};
    var explicitNode = config.targetNode || null;
    var fallbackNode = explicitNode || nearestRenderedCandidateToViewport();
    var pageNode = config.pageNode || closestRenderedPageNode(explicitNode) || closestRenderedPageNode(fallbackNode) || visibleRenderedPageNode();
    var candidateId = config.candidateId ||
      (explicitNode && explicitNode.getAttribute && explicitNode.getAttribute('data-print-break-id')) ||
      (fallbackNode && fallbackNode.getAttribute && fallbackNode.getAttribute('data-print-break-id')) || '';
    var persistId = config.persistId ||
      (explicitNode && explicitNode.getAttribute && explicitNode.getAttribute('data-print-persist-id')) ||
      (fallbackNode && fallbackNode.getAttribute && fallbackNode.getAttribute('data-print-persist-id')) ||
      persistedIdFromCandidateId(candidateId) || '';
    var pageNumber = config.pageNumber || (pageNode && pageNode.getAttribute ? (pageNode.getAttribute('data-page-number') || '') : '');
    var targetOffsetPx = typeof config.targetOffsetPx === 'number'
      ? config.targetOffsetPx
      : (explicitNode && explicitNode.getBoundingClientRect ? Math.round(explicitNode.getBoundingClientRect().top) : 96);
    return {
      at: Date.now(),
      candidate_id: String(candidateId || ''),
      persist_id: String(persistId || ''),
      page_number: String(pageNumber || ''),
      intent: String(config.intent || ''),
      action_event_id: String(config.actionEventId || lastLearningActionEventId() || ''),
      blocker_attempt: parseInt(config.blockerAttempt || '0', 10) || 0,
      target_offset_px: clampNumber(targetOffsetPx, 56, Math.max(96, (window.innerHeight || 720) - 96)),
      viewport_anchor: captureViewportAnchor({ preferredNode: fallbackNode || pageNode || null }),
      selection: currentSelectedTarget(),
      layout_before: snapshotRenderedLayout()
    };
  }

  function reloadDocumentWithCacheBust() {
    try {
      var nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('np_reload', String(Date.now()));
      window.location.replace(nextUrl.toString());
      return;
    } catch (error) {
      window.location.reload();
    }
  }

  function reloadWithPreservedFocus(options) {
    var payload = buildReloadFocusPayload(options || {});
    writeStoredReloadFocus(payload);
    setTimeout(function () {
      reloadDocumentWithCacheBust();
    }, 120);
  }

  function previousCandidateInOrder(candidate) {
    if (!candidate) return null;
    var index = breakCandidates.findIndex(function (entry) {
      return entry && entry.id === candidate.id;
    });
    if (index <= 0) return null;
    return breakCandidates[index - 1] || null;
  }

  function forcedBreakBlockerForCandidate(candidate) {
    if (!candidate || !candidate.node) return null;
    var mode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
    if (mode !== 'force') return null;

    var previous = previousCandidateInOrder(candidate);
    if (!previous || !previous.node) return null;

    var currentPage = pageNumberForRenderedCandidate(candidate.id);
    var previousPage = pageNumberForRenderedCandidate(previous.id);
    if (!currentPage || !previousPage || currentPage !== previousPage) return null;

    var blockType = blockTypeFromContract(previous.node);
    if (blockType === 'image') {
      return {
        type: 'image',
        candidate: previous,
        pageNumber: currentPage
      };
    }
    return null;
  }

  function nextImageScaleForForcedBreakBlocker(figureId) {
    if (!figureId) return 0;
    var current = currentStoredImageScale(figureId);
    var recommendation = figureRecommendation(figureId);
    var recommended = recommendation && recommendation.targetScalePct ? sanitizeImageScale(recommendation.targetScalePct) : current;
    var stepped = sanitizeImageScale(current - 8);
    var next = Math.min(recommended, stepped);
    if (!(next < current)) return 0;
    return next;
  }

  function maybeResolveForcedBreakBlocker(pending, targetNode) {
    if (!pending || !targetNode) return false;
    if (!/^(break_toggle|split_page)$/.test(String(pending.intent || ''))) return false;

    var candidate = pending.candidate_id ? findCandidateById(pending.candidate_id) : null;
    if (!candidate && pending.persist_id) {
      candidate = findCandidateByPersistId(pending.persist_id);
    }
    if (!candidate) return false;

    var blocker = forcedBreakBlockerForCandidate(candidate);
    if (!blocker || blocker.type !== 'image' || !blocker.candidate || !blocker.candidate.node || !blocker.candidate.node.dataset) {
      return false;
    }
    queueReloadNotice('위 사진이 페이지 안에서 안 잘리는 블록이라 같이 넘어옵니다. 사진 크기를 직접 줄이거나 위쪽 공백을 줄여야 분리됩니다');
    return false;
  }

  function restorePendingReloadFocus() {
    if (!document.body || document.body.dataset.printReloadFocusRestored === 'true') return true;
    var pending = readStoredReloadFocus();
    if (!pending) return false;
    if (pending.at && Date.now() - pending.at > 120000) {
      clearStoredReloadFocus();
      return false;
    }

    var targetNode = null;
    var restoreMode = '';
    if (pending.candidate_id) {
      targetNode = document.querySelector('.pagedjs_pages [data-print-break-id="' + pending.candidate_id + '"]');
    }
    if (!targetNode && pending.persist_id) {
      targetNode = document.querySelector('.pagedjs_pages [data-print-persist-id="' + pending.persist_id + '"]');
    }
    if (targetNode) {
      if (maybeResolveForcedBreakBlocker(pending, targetNode)) {
        return true;
      }
      document.body.dataset.printReloadFocusRestored = 'true';
      clearStoredReloadFocus();
      setTimeout(function () {
        restoreMode = 'target';
        setSelectedTarget(selectionForNode(targetNode) || {
          kind: 'block',
          candidateId: pending.candidate_id || '',
          persistId: pending.persist_id || '',
          pageNumber: pageNumberFromNode(closestRenderedPageNode(targetNode))
        }, { silent: true });
        highlightAndScrollToNode(targetNode, {
          offsetTopPx: typeof pending.target_offset_px === 'number' ? pending.target_offset_px : 96
        });
        logLearningAction('layout_reflow', {
          targetNode: targetNode,
          candidateId: pending.candidate_id || '',
          persistId: pending.persist_id || '',
          before: {
            requested_event_id: pending.action_event_id || '',
            requested_page_number: parseInt(pending.page_number || '0', 10) || 0,
            requested_intent: pending.intent || ''
          },
          after: {
            restored: true,
            landed_page_number: pageNumberFromNode(closestRenderedPageNode(targetNode)),
            page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
          },
          ui: {
            source: 'reload_focus_restore',
            suggestion_source: 'system'
          },
          meta: {
            restore_mode: restoreMode,
            requested_focus: pending,
            layout_effect: diffRenderedLayouts(pending.layout_before, snapshotRenderedLayout()),
            viewport_after: captureViewportMetrics(targetNode),
            focus_after: currentSelectedTarget()
          }
        });
        updateEditorBannerStatus('방금 수정한 위치로 돌아왔습니다');
        flushQueuedReloadNotice();
      }, 90);
      return true;
    }

    if (pending.viewport_anchor) {
      var anchorNode = resolveViewportAnchorNode(pending.viewport_anchor);
      if (anchorNode) {
        document.body.dataset.printReloadFocusRestored = 'true';
        clearStoredReloadFocus();
        setTimeout(function () {
          restoreMode = 'anchor';
          restoreViewportAnchor(pending.viewport_anchor, anchorNode, {
            offsetTopPx: typeof pending.target_offset_px === 'number' ? pending.target_offset_px : 96,
            behavior: 'smooth',
            highlight: true
          });
          if (pending.selection && pending.selection.persist_id) {
            setSelectedTarget({
              kind: pending.selection.kind || 'block',
              candidateId: pending.selection.candidate_id || '',
              persistId: pending.selection.persist_id || '',
              pageNumber: pending.selection.page_number || 0
            }, { silent: true });
          }
          logLearningAction('layout_reflow', {
            targetNode: anchorNode,
            candidateId: pending.candidate_id || '',
            persistId: pending.persist_id || '',
            before: {
              requested_event_id: pending.action_event_id || '',
              requested_page_number: parseInt(pending.page_number || '0', 10) || 0,
              requested_intent: pending.intent || ''
            },
            after: {
              restored: true,
              landed_page_number: pageNumberFromNode(closestRenderedPageNode(anchorNode)),
              page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
            },
            ui: {
              source: 'reload_focus_restore',
              suggestion_source: 'system'
            },
            meta: {
              restore_mode: restoreMode,
              requested_focus: pending,
              layout_effect: diffRenderedLayouts(pending.layout_before, snapshotRenderedLayout()),
              viewport_after: captureViewportMetrics(anchorNode),
              focus_after: currentSelectedTarget()
            }
          });
          updateEditorBannerStatus('방금 보던 위치로 돌아왔습니다');
          flushQueuedReloadNotice();
        }, 90);
        return true;
      }
    }

    if (pending.page_number) {
      var pageNode = document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number="' + pending.page_number + '"]');
      if (pageNode) {
        document.body.dataset.printReloadFocusRestored = 'true';
        clearStoredReloadFocus();
        setTimeout(function () {
          restoreMode = 'page';
          restoreViewportAnchor({ page_number: pending.page_number, offset_top_px: 72 }, pageNode, {
            offsetTopPx: 72,
            behavior: 'smooth',
            highlight: true
          });
          clearSelectedTarget({ silent: true });
          logLearningAction('layout_reflow', {
            targetNode: pageNode,
            pageNode: pageNode,
            pageNumber: parseInt(pending.page_number || '0', 10) || 0,
            nodeKind: 'page',
            before: {
              requested_event_id: pending.action_event_id || '',
              requested_page_number: parseInt(pending.page_number || '0', 10) || 0,
              requested_intent: pending.intent || ''
            },
            after: {
              restored: true,
              landed_page_number: parseInt(pageNode.getAttribute('data-page-number') || '0', 10) || 0,
              page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
            },
            ui: {
              source: 'reload_focus_restore',
              suggestion_source: 'system'
            },
            meta: {
              restore_mode: restoreMode,
              requested_focus: pending,
              layout_effect: diffRenderedLayouts(pending.layout_before, snapshotRenderedLayout()),
              viewport_after: captureViewportMetrics(pageNode),
              focus_after: currentSelectedTarget()
            }
          });
          updateEditorBannerStatus('방금 수정한 페이지로 돌아왔습니다');
          flushQueuedReloadNotice();
        }, 90);
        return true;
      }
    }
    return false;
  }

  function scheduleReloadFocusRestore() {
    if (reloadFocusRestoreScheduled) return;
    reloadFocusRestoreScheduled = true;
    [40, 180, 500, 1100, 2200].forEach(function (delay) {
      setTimeout(function () {
        if (restorePendingReloadFocus()) {
          reloadFocusRestoreScheduled = false;
        }
      }, delay);
    });
  }

  function jumpToCandidate(candidate) {
    if (!candidate) return;
    setSelectedCandidate(candidate, { silent: true });
    highlightAndScrollToNode(findRenderedBreakNode(candidate), { offsetTopPx: 96 });
  }

  function pageLabelText(pageNode) {
    if (!pageNode) return '페이지';
    var meta = describeRenderedPage(pageNode);
    var labels = [String(meta.pageNumber || '?') + '페이지', meta.primaryLabel || '페이지'];
    if (meta.continuedFromPrevious) labels.push('앞에서 이어짐');
    if (meta.continuesToNext) labels.push('다음으로 이어짐');
    return labels.filter(Boolean).join(' · ');
  }

  function pagedRenderReady() {
    if (actualRenderedPageNodes().length) return true;
    return !!(document.documentElement && document.documentElement.getAttribute('data-notion-printer-paged-ready') === 'true');
  }

  function actualRenderedPageNodes() {
    return Array.from(document.querySelectorAll('.pagedjs_page')).filter(function (node) {
      return !!(node && node.nodeType === 1 && !(node.closest && node.closest('.print-page-sidebar')));
    });
  }

  function normalizedRenderedPageNodes() {
    return actualRenderedPageNodes().map(function (node, index) {
      var pageNumber = String(index + 1);
      if (node && node.getAttribute && node.getAttribute('data-page-number') !== pageNumber) {
        node.setAttribute('data-page-number', pageNumber);
      }
      return node;
    });
  }

  function resetPageSidebarDom() {
    pageSidebarHydrationVersion += 1;
    if (pageSidebarHydrationTimer) {
      clearTimeout(pageSidebarHydrationTimer);
      pageSidebarHydrationTimer = null;
    }
    Array.from(document.querySelectorAll('.print-page-sidebar, .print-page-sidebar-toggle')).forEach(function (node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
    pageSidebar = null;
    pageSidebarList = null;
    pageSidebarToggleButton = null;
  }

  function handlePagedRenderReady() {
    resetPageSidebarDom();
    ensurePageSidebar();
    refreshPageSidebar();
    [120, 400, 1200].forEach(function (delay) {
      setTimeout(refreshPageSidebar, delay);
    });
    if (bootstrapEditorUi()) {
      refreshNavigatorOptions();
    }
  }

  function watchPagedRenderReady() {
    if (pagedReadyObserver) return;
    var root = document.documentElement || document.body;
    if (!root) return;
    pagedReadyObserver = new MutationObserver(function () {
      if (!pagedRenderReady()) return;
      if (pagedReadyObserver) {
        pagedReadyObserver.disconnect();
        pagedReadyObserver = null;
      }
      handlePagedRenderReady();
    });
    pagedReadyObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-notion-printer-paged-ready'],
      childList: true,
      subtree: true
    });
  }

  function renderedPageNodes() {
    var pages = normalizedRenderedPageNodes();
    if (pages.length) return pages;
    if (pagedRenderReady()) return [];
    return Array.from(document.querySelectorAll('article.page'));
  }

  function sidebarRenderedPageNodes() {
    return normalizedRenderedPageNodes();
  }

  function schedulePageSidebarRefresh(delay) {
    if (pageSidebarRefreshTimer) {
      clearTimeout(pageSidebarRefreshTimer);
    }
    pageSidebarRefreshTimer = setTimeout(function () {
      pageSidebarRefreshTimer = null;
      refreshPageSidebar();
    }, typeof delay === 'number' ? delay : 160);
  }

  function currentViewportPageNumber() {
    var pages = renderedPageNodes();
    if (!pages.length) return '';
    var viewportAnchor = Math.max(120, Math.round((window.innerHeight || 0) * 0.28));
    var bestPage = null;
    var bestDistance = Number.POSITIVE_INFINITY;
    pages.forEach(function (pageNode) {
      if (!pageNode || !pageNode.getBoundingClientRect) return;
      var rect = pageNode.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > (window.innerHeight || 0)) return;
      var distance = Math.abs(rect.top - viewportAnchor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = pageNode;
      }
    });
    if (!bestPage) bestPage = pages[0];
    if (!bestPage) return '';
    return String(bestPage.getAttribute('data-page-number') || (pages.indexOf(bestPage) + 1));
  }

  function pageSidebarSummaryText(pageNode) {
    if (!pageNode) return '페이지 미리보기';
    var text = String(pageNode.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return '페이지 미리보기';
    return text.slice(0, 96);
  }

  function parseSidebarCssPx(value) {
    var text = String(value || '').trim();
    if (!text) return 0;
    if (/px$/i.test(text)) {
      var parsed = parseFloat(text);
      return isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    if (!document.body) return 0;
    var probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.width = text;
    probe.style.height = '0';
    probe.style.overflow = 'hidden';
    document.body.appendChild(probe);
    var pixels = probe.getBoundingClientRect ? probe.getBoundingClientRect().width : probe.offsetWidth;
    if (probe.parentNode) {
      probe.parentNode.removeChild(probe);
    }
    return isFinite(pixels) && pixels > 0 ? pixels : 0;
  }

  function sidebarPageMetrics(pageNode) {
    var width = 0;
    var height = 0;
    if (pageNode && window.getComputedStyle) {
      var style = window.getComputedStyle(pageNode);
      var widthVars = ['--pagedjs-width', '--pagedjs-pagebox-width', '--pagedjs-width-right', '--pagedjs-width-left'];
      var heightVars = ['--pagedjs-height', '--pagedjs-pagebox-height', '--pagedjs-height-right', '--pagedjs-height-left'];
      if (pageNode.classList && pageNode.classList.contains('pagedjs_right_page')) {
        widthVars = ['--pagedjs-width-right', '--pagedjs-width', '--pagedjs-pagebox-width', '--pagedjs-width-left'];
        heightVars = ['--pagedjs-height-right', '--pagedjs-height', '--pagedjs-pagebox-height', '--pagedjs-height-left'];
      } else if (pageNode.classList && pageNode.classList.contains('pagedjs_left_page')) {
        widthVars = ['--pagedjs-width-left', '--pagedjs-width', '--pagedjs-pagebox-width', '--pagedjs-width-right'];
        heightVars = ['--pagedjs-height-left', '--pagedjs-height', '--pagedjs-pagebox-height', '--pagedjs-height-right'];
      }
      widthVars.some(function (name) {
        var value = parseSidebarCssPx(style.getPropertyValue(name));
        if (!value) return false;
        width = value;
        return true;
      });
      heightVars.some(function (name) {
        var value = parseSidebarCssPx(style.getPropertyValue(name));
        if (!value) return false;
        height = value;
        return true;
      });
    }
    var rect = pageNode && pageNode.getBoundingClientRect ? pageNode.getBoundingClientRect() : null;
    return {
      pageWidth: Math.max(1, Math.round(width || (rect && rect.width) || (pageNode && pageNode.offsetWidth) || 794)),
      pageHeight: Math.max(1, Math.round(height || (rect && rect.height) || (pageNode && pageNode.offsetHeight) || 1123))
    };
  }

  function sanitizePageSidebarPreview(root) {
    if (!root || !root.nodeType || root.nodeType !== 1) return null;
    clearEditorArtifacts(root);
    Array.from(root.querySelectorAll('script, style, .print-page-sidebar, .print-page-sidebar-toggle, .print-editor-banner, .print-editor-panel, .print-editor-launcher, .print-image-tools, .print-image-resize-handle, .print-insert-actions, .print-page-dropzone, .print-inline-dropzone, .print-dropzone-active-indicator, .print-page-target-highlight, .print-editor-target-highlight')).forEach(function (node) {
      node.remove();
    });
    Array.from([root].concat(Array.from(root.querySelectorAll('*')))).forEach(function (node) {
      if (!node || node.nodeType !== 1) return;
      if (node.classList) {
        node.classList.remove('print-selected-target');
        node.classList.remove('print-editor-target-highlight');
        node.classList.remove('print-page-continued-top');
        node.classList.remove('print-page-continued-bottom');
        node.classList.remove('print-screen-page');
      }
      if (node.removeAttribute) {
        node.removeAttribute('id');
        node.removeAttribute('data-print-page-selection-bound');
        node.removeAttribute('data-print-selection-bound');
        node.removeAttribute('data-print-page-role');
        node.removeAttribute('data-print-page-label');
        node.removeAttribute('data-print-page-signature');
        node.removeAttribute('data-print-page-anchor-persist-id');
      }
    });
    root.setAttribute('aria-hidden', 'true');
    root.style.pointerEvents = 'none';
    return root;
  }

  function buildPageSidebarPreviewContent(pageNode) {
    if (!pageNode || !pageNode.querySelector) return null;
    var sourceArticle = pageNode.querySelector('article.page');
    if (!sourceArticle || !sourceArticle.cloneNode) {
      var fallbackRoot = renderedFlowRootForPage(pageNode);
      if (!fallbackRoot || !fallbackRoot.cloneNode) return null;
      var fallbackClone = fallbackRoot.cloneNode(true);
      return sanitizePageSidebarPreview(fallbackClone);
    }

    var article = document.createElement('article');
    article.className = 'page print-page-sidebar-preview-content';

    var sourceHeader = Array.from(sourceArticle.children || []).find(function (child) {
      return !!(child && child.matches && child.matches('header'));
    }) || null;
    if (sourceHeader) {
      article.appendChild(sourceHeader.cloneNode(true));
    }

    var sourceBody = directChildByClass(sourceArticle, 'page-body');
    if (sourceBody) {
      article.appendChild(sourceBody.cloneNode(true));
    } else {
      Array.from(sourceArticle.childNodes || []).forEach(function (child) {
        if (child === sourceHeader) return;
        article.appendChild(child.cloneNode(true));
      });
    }
    return sanitizePageSidebarPreview(article);
  }

  function buildPageSidebarThumbnail(pageNode, pageNumber) {
    var thumb = document.createElement('span');
    thumb.className = 'print-page-sidebar-thumb';

    var viewport = document.createElement('span');
    viewport.className = 'print-page-sidebar-thumb-viewport';
    thumb.appendChild(viewport);

    var metrics = sidebarPageMetrics(pageNode);
    var pageWidth = metrics.pageWidth;
    var pageHeight = metrics.pageHeight;
    var viewportWidth = 148;
    var viewportHeight = Math.max(196, Math.round(viewportWidth * (pageHeight / pageWidth)));
    var scale = viewportWidth / pageWidth;

    thumb.style.height = viewportHeight + 'px';
    viewport.style.height = viewportHeight + 'px';
    var sheet = document.createElement('span');
    sheet.className = 'print-page-sidebar-sheet';
    sheet.style.width = pageWidth + 'px';
    sheet.style.height = pageHeight + 'px';
    sheet.style.transform = 'scale(' + scale.toFixed(6) + ')';
    sheet.style.pointerEvents = 'none';
    viewport.appendChild(sheet);

    var preview = document.createElement('span');
    preview.className = 'print-page-sidebar-preview';
    preview.style.width = pageWidth + 'px';
    preview.style.minHeight = pageHeight + 'px';

    var clone = buildPageSidebarPreviewContent(pageNode);
    if (!clone) throw new Error('page sidebar preview content unavailable');
    preview.appendChild(clone);
    sheet.appendChild(preview);
    return thumb;
  }

  function buildPageSidebarFallbackThumbnail() {
    var thumb = document.createElement('span');
    thumb.className = 'print-page-sidebar-thumb';
    var viewport = document.createElement('span');
    viewport.className = 'print-page-sidebar-thumb-viewport';
    thumb.appendChild(viewport);
    thumb.style.height = '208px';
    viewport.style.height = '208px';
    var sheet = document.createElement('span');
    sheet.className = 'print-page-sidebar-sheet';
    sheet.style.width = '148px';
    sheet.style.height = '196px';
    viewport.appendChild(sheet);
    return thumb;
  }

  function schedulePageSidebarHydration(pages) {
    pageSidebarHydrationVersion += 1;
    if (pageSidebarHydrationTimer) {
      clearTimeout(pageSidebarHydrationTimer);
      pageSidebarHydrationTimer = null;
    }
    var snapshotPages = Array.isArray(pages) ? pages.slice() : [];
    var hydrationVersion = pageSidebarHydrationVersion;
    var run = function () {
      pageSidebarHydrationTimer = null;
      if (!pageSidebarList || hydrationVersion !== pageSidebarHydrationVersion) return;
      snapshotPages.forEach(function (pageNode, index) {
        if (!pageNode || hydrationVersion !== pageSidebarHydrationVersion) return;
        var pageNumber = String(pageNode.getAttribute('data-page-number') || (index + 1));
        var item = pageSidebarList.querySelector('.print-page-sidebar-item[data-page-number="' + pageNumber + '"]');
        if (!item) return;
        var thumb = null;
        try {
          thumb = buildPageSidebarThumbnail(pageNode, pageNumber);
        } catch (error) {
          thumb = buildPageSidebarFallbackThumbnail();
        }
        var currentThumb = item.querySelector('.print-page-sidebar-thumb');
        if (currentThumb && currentThumb.parentNode === item) {
          item.replaceChild(thumb, currentThumb);
        } else {
          item.insertBefore(thumb, item.firstChild || null);
        }
      });
      schedulePageSidebarSync();
    };
    if (window.requestAnimationFrame) {
      pageSidebarHydrationTimer = setTimeout(function () {
        window.requestAnimationFrame(run);
      }, 24);
      return;
    }
    pageSidebarHydrationTimer = setTimeout(run, 24);
  }

  function ensurePageSidebar() {
    if (pageSidebar && pageSidebarList && pageSidebarToggleButton) {
      if (pageSidebar.isConnected && pageSidebarList.isConnected && pageSidebarToggleButton.isConnected) return;
      pageSidebar = null;
      pageSidebarList = null;
      pageSidebarToggleButton = null;
    }
    if (!document.body) return;

    if (!pageSidebarToggleButton) {
      pageSidebarToggleButton = document.createElement('button');
      pageSidebarToggleButton.type = 'button';
      pageSidebarToggleButton.className = 'print-page-sidebar-toggle';
      pageSidebarToggleButton.setAttribute('data-pagedjs-ignore', 'true');
      pageSidebarToggleButton.addEventListener('click', function () {
        setPageSidebarOpen(!pageSidebarOpen);
      });
      document.body.appendChild(pageSidebarToggleButton);
    }

    if (!pageSidebar) {
      pageSidebar = document.createElement('aside');
      pageSidebar.className = 'print-page-sidebar';
      pageSidebar.setAttribute('data-pagedjs-ignore', 'true');

      var header = document.createElement('div');
      header.className = 'print-page-sidebar-header';

      var title = document.createElement('div');
      title.className = 'print-page-sidebar-title';
      title.textContent = '페이지';
      header.appendChild(title);

      var subtitle = document.createElement('div');
      subtitle.className = 'print-page-sidebar-subtitle';
      subtitle.textContent = '';
      header.appendChild(subtitle);

      pageSidebar.appendChild(header);

      pageSidebarList = document.createElement('div');
      pageSidebarList.className = 'print-page-sidebar-list';
      pageSidebar.appendChild(pageSidebarList);
      document.body.appendChild(pageSidebar);
    }

    setPageSidebarOpen(pageSidebarOpen);
  }

  function setPageSidebarOpen(nextOpen) {
    pageSidebarOpen = !!nextOpen;
    if (document.body) {
      document.body.classList.toggle('print-page-sidebar-open', pageSidebarOpen);
    }
    if (pageSidebarToggleButton) {
      pageSidebarToggleButton.textContent = pageSidebarOpen ? '페이지 목록 숨기기' : '페이지 목록';
      pageSidebarToggleButton.setAttribute('aria-expanded', pageSidebarOpen ? 'true' : 'false');
    }
  }

  function pruneEditorBannerForMinimalMode() {
    if (!editorBanner) return;
    Array.from(editorBanner.querySelectorAll('button')).forEach(function (button) {
      var label = String(button.textContent || '').replace(/\s+/g, ' ').trim();
      var role = String(button.getAttribute('data-editor-role') || '').trim();
      var shouldHide = uiMode === 'minimal' && (role === 'panel-toggle' || /자동\s*정리|문제\s*없음|추천|수동\s*조정|이미지\s*추천|블록\s*조정|조정\s*닫기/.test(label));
      button.style.display = shouldHide ? 'none' : '';
    });
    var summary = editorBanner.querySelector('.print-editor-banner-summary');
    if (summary) summary.style.display = uiMode === 'minimal' ? 'none' : '';
    var status = editorBanner.querySelector('.print-editor-banner-status');
    if (status) status.style.display = uiMode === 'minimal' ? 'none' : '';
  }

  function syncPageSidebarActiveState() {
    if (!pageSidebarList) return;
    var currentPageNumber = currentViewportPageNumber();
    pageSidebarActivePageNumber = currentPageNumber;
    Array.from(pageSidebarList.querySelectorAll('.print-page-sidebar-item')).forEach(function (button) {
      var isActive = currentPageNumber && button.getAttribute('data-page-number') === currentPageNumber;
      button.classList.toggle('is-active', !!isActive);
      if (isActive && pageSidebarOpen && button.scrollIntoView) {
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  function schedulePageSidebarSync() {
    if (pageSidebarSyncScheduled) return;
    pageSidebarSyncScheduled = true;
    var run = function () {
      pageSidebarSyncScheduled = false;
      syncPageSidebarActiveState();
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
      return;
    }
    setTimeout(run, 16);
  }

  function refreshPageSidebar() {
    ensurePageSidebar();
    if (!pageSidebarList) return;
    var pages = sidebarRenderedPageNodes();
    pageSidebarList.innerHTML = '';
    if (!pages.length) {
      pageSidebarEmptyAttemptCount += 1;
      schedulePageSidebarRefresh(pagedRenderReady() ? 900 : 260);
      return;
    }
    pageSidebarEmptyAttemptCount = 0;
    pages.forEach(function (pageNode, index) {
      var pageNumber = String(pageNode.getAttribute('data-page-number') || (index + 1));
      if (!pageNumber) return;

      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'print-page-sidebar-item';
      item.setAttribute('data-page-number', pageNumber);

      var thumb = buildPageSidebarFallbackThumbnail();
      item.appendChild(thumb);

      var numberLabel = document.createElement('span');
      numberLabel.className = 'print-page-sidebar-number';
      numberLabel.textContent = pageNumber;
      item.appendChild(numberLabel);
      item.setAttribute('aria-label', '페이지 ' + pageNumber);
      item.addEventListener('click', function () {
        pageNode.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        pageSidebarActivePageNumber = pageNumber;
        schedulePageSidebarSync();
      });
      pageSidebarList.appendChild(item);
    });
    if (!pageSidebarList.children.length && pageSidebarEmptyAttemptCount < 12) {
      schedulePageSidebarRefresh(260);
      return;
    }
    schedulePageSidebarHydration(pages);
    schedulePageSidebarSync();
  }

  function refreshNavigatorOptions() {
    pruneEditorBannerForMinimalMode();
    if (editorBlockSelect) {
      var previousBlockValue = editorBlockSelect.value;
      editorBlockSelect.innerHTML = '';
      activeBreakCandidates().forEach(function (candidate) {
        var option = document.createElement('option');
        option.value = candidate.id;
        var prefix = '[블록] ';
        if (candidate.kind === 'section') prefix = '[섹션] ';
        else if (candidate.kind === 'major') prefix = '[상위 항목] ';
        option.textContent = prefix + candidate.label;
        editorBlockSelect.appendChild(option);
      });
      if (previousBlockValue) {
        editorBlockSelect.value = previousBlockValue;
      }
      if (selectedTargetState.candidateId) {
        editorBlockSelect.value = selectedTargetState.candidateId;
      }
    }

    if (editorPageSelect) {
      var previousPageValue = editorPageSelect.value;
      editorPageSelect.innerHTML = '';
      Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]')).forEach(function (pageNode) {
        var option = document.createElement('option');
        option.value = pageNode.getAttribute('data-page-number') || '';
        option.textContent = pageLabelText(pageNode);
        editorPageSelect.appendChild(option);
      });
      if (previousPageValue) {
        editorPageSelect.value = previousPageValue;
      }
      if (selectedTargetState.pageNumber) {
        editorPageSelect.value = String(selectedTargetState.pageNumber);
      }
    }
    refreshPageSidebar();
    updateEditorUiSummary();
  }

  function scheduleNavigatorRefresh() {
    refreshNavigatorOptions();
    setTimeout(refreshNavigatorOptions, 300);
    setTimeout(refreshNavigatorOptions, 1200);
    setTimeout(refreshNavigatorOptions, 3200);
  }

  function updateEditorBannerStatus(text) {
    if (!editorBanner) return;
    var status = editorBanner.querySelector('.print-editor-banner-status');
    if (!status) return;
    status.textContent = text;
  }

  function queueReloadNotice(text) {
    queuedReloadNotice = String(text || '');
  }

  function flushQueuedReloadNotice() {
    if (!queuedReloadNotice) return;
    updateEditorBannerStatus(queuedReloadNotice);
    queuedReloadNotice = '';
  }

  function recommendationEngineSource() {
    var runtime = recommendationRuntime();
    var model = runtime && runtime.model && runtime.model.tasks ? runtime.model.tasks : {};
    return Object.keys(model).some(function (taskName) {
      var section = model[taskName];
      return section && typeof section.sample_count === 'number' && section.sample_count > 0;
    }) ? 'rules+model' : 'rules';
  }

  function sortAutoOptimizeEntries(entries) {
    return (entries || []).slice().sort(function (left, right) {
      var leftScore = typeof left.score === 'number' ? left.score : 0;
      var rightScore = typeof right.score === 'number' ? right.score : 0;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return (left.pageNumber || 0) - (right.pageNumber || 0);
    });
  }

  function pickTopEntriesPerPage(entries, limit) {
    var picked = [];
    var seenPages = {};
    sortAutoOptimizeEntries(entries).forEach(function (entry) {
      if (!entry) return;
      if (limit && picked.length >= limit) return;
      var pageKey = String(entry.pageNumber || 0);
      if (seenPages[pageKey]) return;
      seenPages[pageKey] = true;
      picked.push(entry);
    });
    return picked;
  }

  function autoOptimizePlan() {
    var breakEntries = [];
    var gapEntries = [];
    activeBreakCandidates().forEach(function (candidate) {
      var recommendation = candidateRecommendation(candidate);
      if (!recommendation) return;
      var pageNumber = pageNumberForRenderedCandidate(candidate.id);
      if (recommendation.break && recommendation.break.mode === 'force' && candidateCurrentBreakMode(candidate) !== 'force') {
        breakEntries.push({
          kind: 'break',
          candidate: candidate,
          recommendation: recommendation.break,
          score: typeof recommendation.break.score === 'number' ? recommendation.break.score : 0,
          pageNumber: pageNumber
        });
      }
      if (recommendation.gap && recommendation.gap.units > candidateCurrentGapUnits(candidate)) {
        gapEntries.push({
          kind: 'gap',
          candidate: candidate,
          recommendation: recommendation.gap,
          score: typeof recommendation.gap.score === 'number' ? recommendation.gap.score : 0,
          pageNumber: pageNumber
        });
      }
    });

    var selectedBreaks = pickTopEntriesPerPage(breakEntries, 4);
    var pagesWithBreak = {};
    selectedBreaks.forEach(function (entry) {
      pagesWithBreak[String(entry.pageNumber || 0)] = true;
    });

    var selectedGaps = pickTopEntriesPerPage(gapEntries.filter(function (entry) {
      return !pagesWithBreak[String(entry.pageNumber || 0)];
    }), 4);

    var imageEntries = [];
    distinctRenderedFigureIds().forEach(function (figureId) {
      var recommendation = figureRecommendation(figureId);
      if (!recommendation || !(recommendation.targetScalePct < currentStoredImageScale(figureId) - 2)) return;
      var figure = persistedNodeById(figureId);
      imageEntries.push({
        kind: 'image',
        figureId: figureId,
        recommendation: recommendation,
        score: typeof recommendation.score === 'number' ? recommendation.score : 0,
        pageNumber: pageNumberFromNode(closestRenderedPageNode(figure))
      });
    });

    var selectedImages = pickTopEntriesPerPage(imageEntries.filter(function (entry) {
      return !pagesWithBreak[String(entry.pageNumber || 0)];
    }), 4);

    return {
      breaks: selectedBreaks,
      gaps: selectedGaps,
      images: selectedImages
    };
  }

  function autoOptimizeSummaryText(plan, passIndex, maxPasses) {
    var parts = [];
    if (plan.breaks.length) parts.push('새 페이지 ' + plan.breaks.length + '개');
    if (plan.gaps.length) parts.push('빈칸 ' + plan.gaps.length + '개');
    if (plan.images.length) parts.push('이미지 ' + plan.images.length + '개');
    if (!parts.length) {
      return '자동 정리 ' + passIndex + '/' + maxPasses + '회차: 더 적용할 추천이 없습니다';
    }
    return '자동 정리 ' + passIndex + '/' + maxPasses + '회차: ' + parts.join(', ') + ' 적용';
  }

  function runAutoOptimizePass(options) {
    var config = options || {};
    var passIndex = Math.max(1, parseInt(config.passIndex || '1', 10) || 1);
    var maxPasses = Math.max(passIndex, parseInt(config.maxPasses || '3', 10) || 3);
    var uiSource = String(config.uiSource || 'auto_optimize');
    var plan = autoOptimizePlan();
    var totalActions = plan.breaks.length + plan.gaps.length + plan.images.length;

    if (!totalActions) {
      clearStoredAutoOptimize();
      updateEditorUiSummary();
      updateEditorBannerStatus('자동 정리 완료: 더 적용할 추천이 없습니다');
      return false;
    }

    pushHistorySnapshot('auto-optimize');
    var targetNode = currentSelectedRenderedNode() || visibleRenderedPageNode();
    var eventId = logLearningAction('auto_optimize', {
      targetNode: targetNode,
      before: {
        pass_index: passIndex,
        max_passes: maxPasses
      },
      after: {
        break_count: plan.breaks.length,
        gap_count: plan.gaps.length,
        image_count: plan.images.length
      },
      ui: {
        source: uiSource,
        suggestion_source: recommendationEngineSource()
      },
      meta: buildRuntimeActionMeta(targetNode, {
        intent: 'auto_optimize',
        effect: {
          pass_index: passIndex,
          max_passes: maxPasses,
          planned_break_count: plan.breaks.length,
          planned_gap_count: plan.gaps.length,
          planned_image_count: plan.images.length,
          layout_before: snapshotRenderedLayout()
        }
      })
    });

    plan.breaks.forEach(function (entry) {
      if (!entry || !entry.candidate) return;
      entry.candidate.node.dataset.printBreakMode = 'force';
      breakOverrideMap[entry.candidate.id] = 'force';
      delete pullUpOverrideMap[entry.candidate.id];
    });

    plan.gaps.forEach(function (entry) {
      if (!entry || !entry.candidate || !entry.recommendation) return;
      var gapKey = entry.candidate.node && entry.candidate.node.dataset ? (entry.candidate.node.dataset.printBreakId || entry.candidate.node.dataset.printPersistId || '') : '';
      if (!gapKey) return;
      manualGapMap[gapKey] = Math.max(candidateCurrentGapUnits(entry.candidate), entry.recommendation.units);
    });

    plan.images.forEach(function (entry) {
      if (!entry) return;
      if (entry.recommendation.targetScalePct >= 100) {
        delete imageScaleMap[entry.figureId];
      } else {
        imageScaleMap[entry.figureId] = entry.recommendation.targetScalePct;
      }
    });

    writeStoredBreakOverrides();
    writeStoredPullUpOverrides();
    writeStoredGaps();
    writeStoredImageScales();
    applyResolvedBreakModes();
    applyStoredManualGaps();
    applyStoredImageScales();
    refreshEditorList();
    refreshNavigatorOptions();
    flushLearningEvents(true);

    var summaryText = autoOptimizeSummaryText(plan, passIndex, maxPasses);
    var nextPass = passIndex + 1;
    if (nextPass <= maxPasses) {
      writeStoredAutoOptimize({
        at: Date.now(),
        mode: 'continue',
        next_pass: nextPass,
        max_passes: maxPasses,
        message: summaryText,
        ui_source: uiSource
      });
    } else {
      writeStoredAutoOptimize({
        at: Date.now(),
        mode: 'complete',
        message: summaryText + ' 후 다시 계산을 마쳤습니다'
      });
    }
    updateEditorBannerStatus(summaryText + ' 후 다시 계산 중…');
    reloadWithPreservedFocus({ intent: 'auto_optimize', actionEventId: eventId });
    return true;
  }

  function startAutoOptimize(uiSource) {
    clearStoredAutoOptimize();
    runAutoOptimizePass({
      passIndex: 1,
      maxPasses: 3,
      uiSource: uiSource || 'auto_optimize_button'
    });
  }

  function restorePendingAutoOptimize() {
    var pending = readStoredAutoOptimize();
    if (!pending) return false;
    if (pending.at && Date.now() - pending.at > 120000) {
      clearStoredAutoOptimize();
      return false;
    }
    if (pending.mode === 'complete') {
      clearStoredAutoOptimize();
      updateEditorUiSummary();
      updateEditorBannerStatus(pending.message || '자동 정리 완료');
      return true;
    }
    if (pending.mode !== 'continue') {
      clearStoredAutoOptimize();
      return false;
    }
    clearStoredAutoOptimize();
    runAutoOptimizePass({
      passIndex: pending.next_pass || 1,
      maxPasses: pending.max_passes || 3,
      uiSource: pending.ui_source || 'auto_optimize_resume'
    });
    return true;
  }

  function scheduleAutoOptimizeResume() {
    if (autoOptimizeResumeScheduled) return;
    autoOptimizeResumeScheduled = true;
    [140, 420, 1200].forEach(function (delay, index, delays) {
      setTimeout(function () {
        if (restorePendingAutoOptimize()) {
          autoOptimizeResumeScheduled = false;
          return;
        }
        if (index === delays.length - 1) {
          autoOptimizeResumeScheduled = false;
        }
      }, delay);
    });
  }

  function renderedCandidateLookup() {
    var pagesRoot = document.querySelector('.pagedjs_pages');
    if (!pagesRoot) return null;
    var lookup = {};
    Array.from(pagesRoot.querySelectorAll('[data-print-break-id]')).forEach(function (node) {
      var id = node.getAttribute('data-print-break-id') || '';
      if (id) lookup[id] = true;
    });
    return lookup;
  }

  function activeBreakCandidates() {
    var lookup = renderedCandidateLookup();
    return breakCandidates.filter(function (candidate) {
      if (!candidate || !candidate.node) return false;
      if (lookup) return !!lookup[candidate.id];
      return !!candidate.node.isConnected;
    });
  }

  function candidateCurrentBreakMode(candidate) {
    if (!candidate || !candidate.node) return 'auto';
    return sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
  }

  function candidateCurrentSpaceMode(candidate) {
    if (!candidate || !candidate.node) return 'auto';
    return sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || spaceOverrideMap[candidate.id] || 'auto');
  }

  function candidateCurrentGapUnits(candidate) {
    var gapId = candidate && candidate.node && candidate.node.dataset ? (candidate.node.dataset.printBreakId || candidate.node.dataset.printPersistId || '') : '';
    if (!gapId) return 0;
    return parseInt(manualGapMap[gapId] || '0', 10) || 0;
  }

  function candidateHasManualEdit(candidate) {
    return candidateCurrentBreakMode(candidate) !== 'auto' ||
      candidatePullUpEnabled(candidate) ||
      candidateCurrentSpaceMode(candidate) !== 'auto' ||
      candidateCurrentGapUnits(candidate) > 0;
  }

  function candidateHasAnyRecommendation(candidate) {
    var recommendation = candidateRecommendation(candidate);
    return !!(recommendation && (
      (recommendation.break && recommendation.break.mode === 'force') ||
      (recommendation.gap && recommendation.gap.units > 0)
    ));
  }

  function candidateHasOutstandingRecommendation(candidate) {
    var recommendation = candidateRecommendation(candidate);
    if (!recommendation) return false;
    if (recommendation.break && recommendation.break.mode === 'force' && candidateCurrentBreakMode(candidate) !== 'force') {
      return true;
    }
    if (recommendation.gap && recommendation.gap.units > candidateCurrentGapUnits(candidate)) {
      return true;
    }
    return false;
  }

  function sortedEditorCandidates() {
    var candidates = activeBreakCandidates();
    return candidates.sort(function (left, right) {
      var leftScore = (candidateHasOutstandingRecommendation(left) ? 200 : 0) +
        (candidateHasManualEdit(left) ? 80 : 0) +
        (candidateHasAnyRecommendation(left) ? 20 : 0) +
        (left.kind === 'section' ? 5 : 0);
      var rightScore = (candidateHasOutstandingRecommendation(right) ? 200 : 0) +
        (candidateHasManualEdit(right) ? 80 : 0) +
        (candidateHasAnyRecommendation(right) ? 20 : 0) +
        (right.kind === 'section' ? 5 : 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return breakCandidates.indexOf(left) - breakCandidates.indexOf(right);
    });
  }

  function distinctRenderedFigureIds() {
    var seen = {};
    Array.from(document.querySelectorAll('figure.image[data-print-persist-id]')).forEach(function (figure) {
      var figureId = figure.dataset && figure.dataset.printPersistId ? figure.dataset.printPersistId : '';
      if (figureId) seen[figureId] = true;
    });
    return Object.keys(seen);
  }

  function outstandingFigureRecommendationCount() {
    return distinctRenderedFigureIds().filter(function (figureId) {
      var recommendation = figureRecommendation(figureId);
      if (!recommendation || !(recommendation.targetScalePct < 100)) return false;
      return recommendation.targetScalePct < currentStoredImageScale(figureId) - 2;
    }).length;
  }

  function buildEditorMetrics() {
    var candidates = activeBreakCandidates();
    return {
      pageCount: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length,
      candidateCount: candidates.length,
      outstandingRecommendationCount: candidates.filter(candidateHasOutstandingRecommendation).length,
      recommendedCandidateCount: candidates.filter(candidateHasAnyRecommendation).length,
      manualCandidateCount: candidates.filter(candidateHasManualEdit).length,
      imageRecommendationCount: outstandingFigureRecommendationCount(),
      imageEditCount: Object.keys(imageScaleMap || {}).length,
      textEditCount: Object.keys(textOverrideMap || {}).length,
      deletedCount: Object.keys(deletedNodeMap || {}).length
    };
  }

  function renderSummaryChips(host, metrics) {
    if (!host) return;
    host.innerHTML = '';
    [
      { label: '페이지', value: metrics.pageCount },
      { label: '추천 블록', value: metrics.outstandingRecommendationCount },
      { label: '수동 조정', value: metrics.manualCandidateCount },
      { label: '이미지 추천', value: metrics.imageRecommendationCount }
    ].forEach(function (metric) {
      var chip = document.createElement('div');
      chip.className = 'print-editor-summary-chip';

      var value = document.createElement('strong');
      value.textContent = String(metric.value);
      chip.appendChild(value);

      var label = document.createElement('span');
      label.textContent = metric.label;
      chip.appendChild(label);

      host.appendChild(chip);
    });
  }

  function updateEditorUiSummary() {
    var metrics = buildEditorMetrics();
    renderSummaryChips(editorBannerSummary, metrics);
    renderSummaryChips(editorPanelSummary, metrics);

    if (editorNote) {
      if (metrics.outstandingRecommendationCount > 0 || metrics.imageRecommendationCount > 0) {
        editorNote.textContent = '1. 자동 정리 2. 문제 위치로 이동 3. 남은 곳만 수정하세요. 현재 추천 블록 ' + metrics.outstandingRecommendationCount + '개, 이미지 추천 ' + metrics.imageRecommendationCount + '개가 남아 있습니다.';
      } else if (metrics.manualCandidateCount > 0 || metrics.imageEditCount > 0 || metrics.textEditCount > 0 || metrics.deletedCount > 0) {
        editorNote.textContent = '수동 조정이 반영된 상태입니다. 블록마다 앞에 붙이기, 여기서 시작, 빈칸 조정으로 직접 다듬을 수 있습니다.';
      } else {
        editorNote.textContent = '자동 정리는 초안입니다. 실제 마감은 블록을 눌러 앞에 붙이기, 여기서 시작, 빈칸 조정으로 직접 맞추세요.';
      }
    }

    if (editorBannerRecommendationButton) {
      var hasRecommendation = metrics.outstandingRecommendationCount > 0 || metrics.imageRecommendationCount > 0;
      editorBannerRecommendationButton.disabled = !hasRecommendation;
      editorBannerRecommendationButton.textContent = hasRecommendation ? '2. 문제 위치' : '문제 없음';
    }
  }

  function syncEditorUiControls() {
    var isOpen = !!editorUiState.open;
    var filterMode = sanitizeEditorFilter(editorUiState.filter || 'all');

    if (document.body) {
      document.body.classList.toggle('print-editor-open', isOpen);
    }

    if (editorLauncher) {
      editorLauncher.textContent = isOpen ? '조정 닫기 (E)' : '블록 조정 (E)';
    }

    if (editorPanelToggleButton) {
      editorPanelToggleButton.textContent = isOpen ? '조정 닫기' : '3. 블록 조정';
    }

    if (editorPanel) {
      editorPanel.dataset.filter = filterMode;
    }

    if (editorFontSelect) {
      editorFontSelect.value = sanitizeViewFont(viewSettings.font);
    }

    if (editorSpacingSelect) {
      editorSpacingSelect.value = sanitizeViewSpacing(viewSettings.spacing);
    }

    if (editorTextEditToggle) {
      editorTextEditToggle.textContent = textEditModeEnabled ? '텍스트 수정 종료' : '텍스트 수정';
      editorTextEditToggle.classList.toggle('is-active', textEditModeEnabled);
    }

    Object.keys(editorFilterButtons).forEach(function (key) {
      if (!editorFilterButtons[key]) return;
      editorFilterButtons[key].classList.toggle('is-active', key === filterMode);
    });
  }

  function setEditorPanelOpen(open) {
    editorUiState.open = !!open;
    if (editorUiState.open && sanitizeEditorFilter(editorUiState.filter || 'all') === 'all') {
      var metrics = buildEditorMetrics();
      if (metrics.outstandingRecommendationCount > 0 || metrics.imageRecommendationCount > 0) {
        editorUiState.filter = 'recommended';
      }
    }
    writeStoredEditorUiState();
    syncEditorUiControls();
    refreshEditorList();
  }

  function toggleEditorPanel(forceOpen) {
    if (typeof forceOpen === 'boolean') {
      setEditorPanelOpen(forceOpen);
      return;
    }
    setEditorPanelOpen(!editorUiState.open);
  }

  function setEditorFilterMode(mode) {
    editorUiState.filter = sanitizeEditorFilter(mode);
    writeStoredEditorUiState();
    syncEditorUiControls();
    refreshEditorList();
  }

  function jumpToPageNumber(pageNumber) {
    if (!pageNumber) return;
    var pageNode = document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number="' + pageNumber + '"]');
    if (!pageNode) {
      updateEditorBannerStatus('선택한 페이지를 찾지 못했습니다');
      return;
    }
    setSelectedTarget({ kind: 'page', candidateId: '', persistId: '', pageNumber: parseInt(pageNumber, 10) || 0 }, { silent: true });
    scrollNodeToOffset(pageNode, 72, 'smooth');
    pageNode.classList.remove('print-page-target-highlight');
    void pageNode.offsetWidth;
    pageNode.classList.add('print-page-target-highlight');
    setTimeout(function () {
      pageNode.classList.remove('print-page-target-highlight');
    }, 1800);
    updateEditorBannerStatus(pageNumber + '페이지로 이동했습니다');
  }

  function jumpToSelectedPage() {
    if (!editorPageSelect || !editorPageSelect.value) {
      updateEditorBannerStatus('이동할 페이지를 먼저 선택하세요');
      return;
    }
    jumpToPageNumber(editorPageSelect.value);
  }

  function jumpToSelectedBlock() {
    if (!editorBlockSelect || !editorBlockSelect.value) {
      updateEditorBannerStatus('이동할 블록을 먼저 선택하세요');
      return;
    }
    var candidate = findCandidateById(editorBlockSelect.value);
    if (!candidate) {
      updateEditorBannerStatus('선택한 블록을 찾지 못했습니다');
      return;
    }
    jumpToCandidate(candidate);
    updateEditorBannerStatus('선택한 블록으로 이동했습니다');
  }

  function jumpToRecommendedItem() {
    var candidates = sortedEditorCandidates().filter(candidateHasOutstandingRecommendation);
    if (candidates.length) {
      setEditorPanelOpen(true);
      setEditorFilterMode('recommended');
      jumpToCandidate(candidates[0]);
      updateEditorBannerStatus('추천 블록으로 이동했습니다');
      return;
    }

    var recommendedFigureId = distinctRenderedFigureIds().find(function (figureId) {
      var recommendation = figureRecommendation(figureId);
      return !!(recommendation && recommendation.targetScalePct < currentStoredImageScale(figureId) - 2);
    }) || '';

    if (recommendedFigureId) {
      var figure = persistedNodeById(recommendedFigureId);
      if (figure) {
        setEditorPanelOpen(true);
        highlightAndScrollToNode(figure);
        updateEditorBannerStatus('이미지 추천 위치로 이동했습니다');
        return;
      }
    }

    updateEditorBannerStatus('현재 추천할 항목이 없습니다');
  }

  function findEditableWithinNode(node) {
    if (!node || !node.querySelector) return null;
    return node.querySelector('[data-print-edit-id]');
  }

  function persistEditableNode(node) {
    if (!node || !node.dataset) return;
    var id = node.dataset.printEditId;
    if (!id) return;
    textOverrideMap[id] = node.innerHTML;
    writeStoredTextOverrides();
    updateEditorUiSummary();
  }

  function setTextEditMode(enabled) {
    textEditModeEnabled = !!enabled;
    document.body.classList.toggle('print-text-edit-mode', textEditModeEnabled);
    Array.from(document.querySelectorAll('[data-print-edit-id]')).forEach(function (node) {
      if (textEditModeEnabled) {
        node.setAttribute('contenteditable', 'true');
        node.setAttribute('spellcheck', 'false');
        if (!node.dataset.printEditableBound) {
          node.addEventListener('blur', function () {
            persistEditableNode(node);
            updateEditorBannerStatus('텍스트 수정 저장됨');
          });
          node.addEventListener('input', function () {
            updateEditorBannerStatus('텍스트 수정 중…');
          });
          node.dataset.printEditableBound = 'true';
        }
      } else {
        node.removeAttribute('contenteditable');
      }
    });
    syncEditorUiControls();
  }

  function clearDropZoneHoverState() {
    Array.from(document.querySelectorAll('.print-page-dropzone.is-over')).forEach(function (node) {
      node.classList.remove('is-over');
    });
  }

  function clearDragInteractionState() {
    draggingCandidateId = null;
    clearDropZoneHoverState();
    if (document.body) {
      document.body.classList.remove('print-drag-active');
    }
    Array.from(document.querySelectorAll('.print-draggable-candidate.is-dragging')).forEach(function (node) {
      node.classList.remove('is-dragging');
    });
  }

  function scheduleDirectManipulationRefresh(delay) {
    if (directManipulationRetryTimer) {
      clearTimeout(directManipulationRetryTimer);
    }
    directManipulationRetryTimer = setTimeout(function () {
      directManipulationRetryTimer = null;
      if (imageScaleSliderDragState || imageResizeDragState) {
        directManipulationRefreshQueuedWhileDragging = true;
        return;
      }
      restoreStoredRenderedLayoutOnce();
      installDirectPageManipulation();
      refreshNavigatorOptions();
    }, typeof delay === 'number' ? delay : 120);
  }

  function findCandidateById(id) {
    return breakCandidates.find(function (candidate) {
      return candidate.id === id;
    }) || null;
  }

  function firstLastCandidateIdsInPage(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) {
      return { first: '', last: '' };
    }
    var ids = Array.from(pageNode.querySelectorAll('[data-print-break-id]')).map(function (node) {
      return node.getAttribute('data-print-break-id') || '';
    }).filter(Boolean);
    return {
      first: ids[0] || '',
      last: ids.length ? ids[ids.length - 1] : ''
    };
  }

  function mergeCandidateForPage(pageNode) {
    var meta = describeRenderedPage(pageNode);
    if (meta.mergeCandidateId) {
      var directCandidate = findCandidateById(meta.mergeCandidateId);
      if (directCandidate) return directCandidate;
    }
    var fallbackPersistNode = meta.anchorPersistId ? renderedNodeByPersistId(pageNode, meta.anchorPersistId) : null;
    if (!fallbackPersistNode || !fallbackPersistNode.dataset) return null;
    var fallbackCandidate = findCandidateByPersistId(fallbackPersistNode.dataset.printPersistId || '');
    if (!fallbackCandidate) return null;
    var renderedCandidate = findRenderedBreakNode(fallbackCandidate);
    return renderedCandidate && pageNode.contains(renderedCandidate) ? fallbackCandidate : null;
  }

  function renderedFlowRootForPage(pageNode) {
    if (!pageNode || !pageNode.querySelector) return null;
    var content = pageNode.querySelector('.pagedjs_page_content');
    if (!content) return null;
    return content.firstElementChild || content;
  }

  function findRenderedCandidateNode(id) {
    if (!id) return null;
    return document.querySelector('.pagedjs_pages [data-print-break-id="' + id + '"]');
  }

  function snapshotRenderedLayout() {
    return Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]')).map(function (pageNode) {
      return {
        page: pageNode.getAttribute('data-page-number') || '',
        ids: Array.from(pageNode.querySelectorAll('[data-print-break-id]')).map(function (node) {
          return node.getAttribute('data-print-break-id') || '';
        }).filter(Boolean)
      };
    });
  }

  function diffRenderedLayouts(beforeLayout, afterLayout) {
    var beforeIndex = {};
    var afterIndex = {};
    (Array.isArray(beforeLayout) ? beforeLayout : []).forEach(function (pageEntry) {
      (Array.isArray(pageEntry && pageEntry.ids) ? pageEntry.ids : []).forEach(function (candidateId, index) {
        if (!candidateId) return;
        beforeIndex[candidateId] = {
          page: String(pageEntry.page || ''),
          index: index
        };
      });
    });
    (Array.isArray(afterLayout) ? afterLayout : []).forEach(function (pageEntry) {
      (Array.isArray(pageEntry && pageEntry.ids) ? pageEntry.ids : []).forEach(function (candidateId, index) {
        if (!candidateId) return;
        afterIndex[candidateId] = {
          page: String(pageEntry.page || ''),
          index: index
        };
      });
    });
    var moved = [];
    Object.keys(afterIndex).forEach(function (candidateId) {
      if (!beforeIndex[candidateId]) return;
      if (beforeIndex[candidateId].page === afterIndex[candidateId].page && beforeIndex[candidateId].index === afterIndex[candidateId].index) return;
      moved.push(candidateId);
    });
    var removed = Object.keys(beforeIndex).filter(function (candidateId) {
      return !afterIndex[candidateId];
    });
    var inserted = Object.keys(afterIndex).filter(function (candidateId) {
      return !beforeIndex[candidateId];
    });
    return {
      moved_candidate_ids: moved,
      moved_candidate_count: moved.length,
      removed_candidate_ids: removed,
      removed_candidate_count: removed.length,
      inserted_candidate_ids: inserted,
      inserted_candidate_count: inserted.length
    };
  }

  function persistRenderedLayout() {
    writeStoredRenderedOrder(snapshotRenderedLayout());
  }

  function firstStoredLayoutCandidateId(pageEntry) {
    if (!pageEntry || !Array.isArray(pageEntry.ids)) return '';
    return pageEntry.ids.filter(Boolean)[0] || '';
  }

  function storedLayoutBoundaryCandidateIds(layout) {
    return (Array.isArray(layout) ? layout : []).map(firstStoredLayoutCandidateId).filter(Boolean).slice(1);
  }

  function applyStoredRenderedLayout() {
    var stored = readStoredRenderedOrder();
    if (!Array.isArray(stored) || !stored.length) return false;
    var movedAny = false;
    storedLayoutBoundaryCandidateIds(stored).forEach(function (candidateId) {
      var node = findRenderedCandidateNode(candidateId);
      var pageNode = closestRenderedPageNode(node);
      if (!node || !pageNode) return;
      if (firstLastCandidateIdsInPage(pageNode).first === candidateId) return;
      if (splitRenderedPageAtNodeForRestore(node)) {
        movedAny = true;
      }
    });

    if (!movedAny) return false;

    removeEmptyRenderedPages();
    renumberRenderedPages();
    Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]')).forEach(function (pageNode) {
      expandRenderedPageFrame(pageNode);
    });
    installDirectPageManipulation();
    refreshNavigatorOptions();
    refreshEditorList();
    persistRenderedLayout();
    return true;
  }

  function hasPersistedEditState() {
    return !!(
      Object.keys(breakOverrideMap || {}).length ||
      Object.keys(spaceOverrideMap || {}).length ||
      Object.keys(pullUpOverrideMap || {}).length ||
      Object.keys(textOverrideMap || {}).length ||
      Object.keys(deletedNodeMap || {}).length ||
      Object.keys(manualGapMap || {}).length ||
      Object.keys(imageScaleMap || {}).length
    );
  }

  function restoreStoredRenderedLayoutOnce() {
    if (storedRenderedLayoutApplied) return false;
    if (hasPersistedEditState()) {
      storedRenderedLayoutApplied = true;
      return false;
    }
    var stored = readStoredRenderedOrder();
    if (!Array.isArray(stored) || !stored.length) {
      storedRenderedLayoutApplied = true;
      return false;
    }
    var storedCandidateCount = stored.reduce(function (total, pageEntry) {
      return total + (Array.isArray(pageEntry && pageEntry.ids) ? pageEntry.ids.filter(Boolean).length : 0);
    }, 0);
    var liveCandidateCount = document.querySelectorAll('.pagedjs_pages [data-print-break-id]').length;
    if (liveCandidateCount < storedCandidateCount) return false;
    storedRenderedLayoutApplied = true;
    return applyStoredRenderedLayout();
  }

  function currentDragCandidateId(event) {
    if (event && event.dataTransfer) {
      var transferred = event.dataTransfer.getData('text/plain');
      if (transferred) return transferred;
    }
    return draggingCandidateId;
  }

  function pageNumberForRenderedCandidate(candidateId) {
    var node = findRenderedCandidateNode(candidateId);
    var page = node && node.closest ? node.closest('.pagedjs_page[data-page-number]') : null;
    return parseInt(page && page.getAttribute('data-page-number') || '0', 10) || 0;
  }

  function renderedPagesRoot() {
    return document.querySelector('.pagedjs_pages');
  }

  function captureRenderedMarkup() {
    var root = renderedPagesRoot();
    if (!root) return '';
    var clone = root.cloneNode(true);
    Array.from(clone.querySelectorAll('.print-page-chrome, .print-insert-actions, .print-page-action-group, .print-page-merge-button, .print-page-delete-button, .print-inline-tools')).forEach(function (node) {
      node.remove();
    });
    return clone.innerHTML;
  }

  function pushRenderedHistorySnapshot() {
    var html = captureRenderedMarkup();
    if (!html) return;
    renderedDomHistory.push({
      html: html,
      state: captureHistorySnapshot()
    });
    if (renderedDomHistory.length > 30) {
      renderedDomHistory = renderedDomHistory.slice(renderedDomHistory.length - 30);
    }
  }

  function restoreRenderedHistorySnapshot() {
    var root = renderedPagesRoot();
    if (!root || !renderedDomHistory.length) return false;
    var entry = renderedDomHistory.pop();
    root.innerHTML = entry && entry.html ? entry.html : '';
    if (entry && entry.state) {
      applyCapturedStateSnapshot(entry.state);
    }
    renumberRenderedPages();
    installDirectPageManipulation();
    refreshNavigatorOptions();
    return true;
  }

  function renumberRenderedPages() {
    Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]')).forEach(function (pageNode, index) {
      pageNode.setAttribute('data-page-number', String(index + 1));
    });
  }

  function uniqueTruthyStrings(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(function (value) {
      var key = String(value || '');
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function uniqueStringIntersection(leftValues, rightValues) {
    var rightLookup = {};
    uniqueTruthyStrings(rightValues).forEach(function (value) {
      rightLookup[value] = true;
    });
    return uniqueTruthyStrings(leftValues).filter(function (value) {
      return !!rightLookup[value];
    });
  }

  function pageCandidateIds(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) return [];
    return uniqueTruthyStrings(Array.from(pageNode.querySelectorAll('[data-print-break-id]')).map(function (node) {
      return node && node.getAttribute ? node.getAttribute('data-print-break-id') || '' : '';
    }));
  }

  function pagePersistIds(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) return [];
    return uniqueTruthyStrings(Array.from(pageNode.querySelectorAll('[data-print-persist-id]')).map(function (node) {
      return node && node.dataset ? node.dataset.printPersistId || '' : '';
    }));
  }

  function persistedIdsInRenderedPage(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) return [];
    return pagePersistIds(pageNode);
  }

  function renderedNodeByPersistId(pageNode, persistId) {
    if (!pageNode || !persistId || !pageNode.querySelector) return null;
    return pageNode.querySelector('[data-print-persist-id="' + persistId + '"]');
  }

  function pageLabelForPersistId(pageNode, persistId, fallback) {
    var labelFallback = fallback || '페이지';
    var node = persistId ? renderedNodeByPersistId(pageNode, persistId) : null;
    if (!node && pageNode && pageNode.querySelector) {
      node = pageNode.querySelector('[data-print-block-type="section_heading"], h1:not(.page-title), h2, h3, .print-major-title, .print-inline-block, p, figure.image, .print-table-block');
    }
    if (!node) return labelFallback;
    return candidateLabelFromBlock(blockContractNode(node) || node, labelFallback);
  }

  function describeRenderedPage(pageNode) {
    if (!pageNode) {
      return {
        pageNumber: 0,
        candidateIds: [],
        persistIds: [],
        firstCandidateId: '',
        lastCandidateId: '',
        firstPersistId: '',
        lastPersistId: '',
        anchorPersistId: '',
        primaryLabel: '페이지',
        trailingLabel: '',
        candidateCount: 0,
        persistCount: 0,
        sharedWithPrevious: [],
        sharedWithNext: [],
        continuedFromPrevious: false,
        continuesToNext: false,
        canMerge: false,
        canDelete: false,
        mergeCandidateId: '',
        mergeHelpText: '페이지 정보를 읽지 못했습니다',
        deleteHelpText: '페이지 정보를 읽지 못했습니다',
        continuationBadges: [],
        detailText: '블록 0개',
        signature: '',
        role: 'page'
      };
    }

    var previousPage = pageNode.previousElementSibling && pageNode.previousElementSibling.matches && pageNode.previousElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.previousElementSibling : null;
    var nextPage = pageNode.nextElementSibling && pageNode.nextElementSibling.matches && pageNode.nextElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.nextElementSibling : null;
    var candidateIds = pageCandidateIds(pageNode);
    var persistIds = pagePersistIds(pageNode);
    var previousPersistIds = pagePersistIds(previousPage);
    var nextPersistIds = pagePersistIds(nextPage);
    var sharedWithPrevious = uniqueStringIntersection(persistIds, previousPersistIds);
    var sharedWithNext = uniqueStringIntersection(persistIds, nextPersistIds);
    var continuedFromPrevious = sharedWithPrevious.length > 0;
    var continuesToNext = sharedWithNext.length > 0;
    var firstCandidateId = candidateIds[0] || '';
    var lastCandidateId = candidateIds.length ? candidateIds[candidateIds.length - 1] : '';
    var firstPersistId = persistIds[0] || '';
    var lastPersistId = persistIds.length ? persistIds[persistIds.length - 1] : '';
    var firstUniquePersistId = persistIds.find(function (persistId) {
      return sharedWithPrevious.indexOf(persistId) === -1;
    }) || '';
    var lastUniquePersistId = persistIds.slice().reverse().find(function (persistId) {
      return sharedWithNext.indexOf(persistId) === -1;
    }) || '';
    var anchorPersistId = firstUniquePersistId || firstPersistId || lastUniquePersistId || '';
    var primaryLabel = pageLabelForPersistId(pageNode, anchorPersistId, '페이지 ' + (pageNode.getAttribute('data-page-number') || '?'));
    var trailingLabel = pageLabelForPersistId(pageNode, lastUniquePersistId || lastPersistId, primaryLabel);
    var mergeableCandidateId = candidateIds.find(function (candidateId) {
      var persistId = persistedIdFromCandidateId(candidateId);
      return persistId && sharedWithPrevious.indexOf(persistId) === -1;
    }) || '';
    var deletablePersistIds = persistIds.filter(function (persistId) {
      return sharedWithPrevious.indexOf(persistId) === -1 && sharedWithNext.indexOf(persistId) === -1;
    });
    var continuationBadges = [];
    if (continuedFromPrevious) continuationBadges.push('앞 페이지에서 이어짐');
    if (continuesToNext) continuationBadges.push('다음 페이지로 이어짐');

    var mergeCandidateId = mergeableCandidateId || (!continuedFromPrevious ? firstCandidateId : '');
    var canMerge = !!mergeCandidateId && parseInt(pageNode.getAttribute('data-page-number') || '0', 10) > 1;
    var canDelete = deletablePersistIds.length > 0;

    var mergeHelpText = '앞 페이지로 자연스럽게 이어 붙입니다';
    if (!canMerge) {
      if (continuedFromPrevious && !mergeableCandidateId) {
        mergeHelpText = '이 페이지는 앞 페이지에서 이어진 내용만으로 시작해서 붙일 독립 블록이 없습니다';
      } else if (!firstCandidateId) {
        mergeHelpText = '페이지 시작 기준 블록을 찾지 못했습니다';
      } else {
        mergeHelpText = '첫 페이지는 앞 페이지에 붙일 수 없습니다';
      }
    }

    var deleteHelpText = continuesToNext || continuedFromPrevious
      ? '현재 페이지의 고유 내용만 삭제하고, 앞뒤 페이지와 이어진 블록은 유지합니다'
      : '현재 페이지에만 있는 내용을 삭제합니다';
    if (!canDelete) {
      if (!persistIds.length) {
        deleteHelpText = '삭제할 페이지 내용이 없습니다';
      } else {
        deleteHelpText = '이 페이지에는 앞뒤 페이지와 공유되지 않은 고유 블록이 없어 삭제할 내용이 없습니다';
      }
    }

    var detailBits = [String(candidateIds.length) + '개 블록'];
    if (trailingLabel && trailingLabel !== primaryLabel) {
      detailBits.push('끝 ' + trailingLabel);
    }

    return {
      pageNumber: parseInt(pageNode.getAttribute('data-page-number') || '0', 10) || 0,
      candidateIds: candidateIds,
      persistIds: persistIds,
      firstCandidateId: firstCandidateId,
      lastCandidateId: lastCandidateId,
      firstPersistId: firstPersistId,
      lastPersistId: lastPersistId,
      anchorPersistId: anchorPersistId,
      primaryLabel: primaryLabel,
      trailingLabel: trailingLabel,
      candidateCount: candidateIds.length,
      persistCount: persistIds.length,
      sharedWithPrevious: sharedWithPrevious,
      sharedWithNext: sharedWithNext,
      deletablePersistIds: deletablePersistIds,
      continuedFromPrevious: continuedFromPrevious,
      continuesToNext: continuesToNext,
      canMerge: canMerge,
      canDelete: canDelete,
      mergeCandidateId: mergeCandidateId,
      mergeHelpText: mergeHelpText,
      deleteHelpText: deleteHelpText,
      continuationBadges: continuationBadges,
      detailText: detailBits.join(' · '),
      signature: [
        String(pageNode.getAttribute('data-page-number') || ''),
        firstPersistId,
        lastPersistId,
        String(candidateIds.length)
      ].join('::'),
      role: continuedFromPrevious || continuesToNext ? 'continued_flow_page' : 'stable_page'
    };
  }

  function renderedContentRoot(pageNode) {
    if (!pageNode) return null;
    return pageNode.querySelector('.page-body') || renderedFlowRootForPage(pageNode);
  }

  function expandRenderedPageFrame(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) return;
    [pageNode].concat(Array.from(pageNode.querySelectorAll('.pagedjs_sheet, .pagedjs_pagebox, .pagedjs_page_content, .pagedjs_area, article.page'))).forEach(function (node) {
      if (!node || !node.style) return;
      node.style.height = 'auto';
      node.style.maxHeight = 'none';
      node.style.overflow = 'visible';
    });
  }

  function clearEditorArtifacts(root) {
    if (!root || !root.querySelectorAll) return;
    Array.from(root.querySelectorAll('.print-page-chrome, .print-insert-actions, .print-page-action-group, .print-page-merge-button, .print-page-delete-button, .print-inline-tools')).forEach(function (node) {
      node.remove();
    });
  }

  function cloneRenderedPageShell(pageNode) {
    var clone = pageNode.cloneNode(true);
    clearEditorArtifacts(clone);
    clone.removeAttribute('data-print-page-selection-bound');
    clone.removeAttribute('data-print-page-role');
    clone.removeAttribute('data-print-page-label');
    clone.removeAttribute('data-print-page-signature');
    clone.removeAttribute('data-print-page-anchor-persist-id');
    clone.removeAttribute('data-print-manual-page');
    clone.removeAttribute('data-print-manual-split-candidate');
    var article = clone.querySelector('article.page');
    if (article) {
      var header = article.querySelector('header');
      if (header) header.remove();
    }
    var contentRoot = renderedContentRoot(clone);
    if (contentRoot) {
      contentRoot.innerHTML = '';
    }
    return clone;
  }

  function isEditorArtifactNode(node) {
    return !!(node && node.nodeType === 1 && node.closest && node.closest('.print-page-chrome')) || !!(node && node.classList && (
      node.classList.contains('print-insert-actions') ||
      node.classList.contains('print-page-action-group') ||
      node.classList.contains('print-page-merge-button') ||
      node.classList.contains('print-page-delete-button') ||
      node.classList.contains('print-inline-tools') ||
      node.classList.contains('print-image-tools')
    ));
  }

  function hasMeaningfulRenderedContent(node) {
    if (!node || node.nodeType !== 1) return false;
    if (isEditorArtifactNode(node)) return false;
    if (node.hasAttribute && node.hasAttribute('data-print-persist-id')) return true;
    if (node.matches && node.matches('img, table, hr')) return true;
    var directText = normalizePrintText(Array.from(node.childNodes || []).filter(function (child) {
      return child.nodeType === 3;
    }).map(function (child) {
      return child.textContent || '';
    }).join(' '));
    if (directText) return true;
    return Array.from(node.children || []).some(function (child) {
      return hasMeaningfulRenderedContent(child);
    });
  }

  function pruneEmptyAncestors(startNode, stopRoot) {
    var current = startNode;
    while (current && current !== stopRoot) {
      var parent = current.parentElement;
      if (!hasMeaningfulRenderedContent(current)) {
        current.remove();
      } else {
        break;
      }
      current = parent;
    }
  }

  function removeEmptyRenderedPages() {
    var removedPages = [];
    var pages = Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]'));
    pages.forEach(function (pageNode) {
      if (document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length <= 1) return;
      var contentRoot = renderedContentRoot(pageNode);
      var hasContent = !!(contentRoot && Array.from(contentRoot.children || []).some(function (child) {
        return hasMeaningfulRenderedContent(child);
      }));
      if (hasContent) return;
      removedPages.push(pageNode.getAttribute('data-page-number') || '');
      pageNode.remove();
    });
    return removedPages;
  }

  function hasMeaningfulPrefixBeforeNode(parentNode, targetNode) {
    if (!parentNode || !targetNode) return false;
    var childNodes = Array.from(parentNode.childNodes || []);
    for (var index = 0; index < childNodes.length; index += 1) {
      var child = childNodes[index];
      if (child === targetNode) {
        return false;
      }
      if (child && child.nodeType === 1 && child.contains && child.contains(targetNode)) {
        return hasMeaningfulPrefixBeforeNode(child, targetNode);
      }
      if (child && child.nodeType === 1 && hasMeaningfulRenderedContent(child)) {
        return true;
      }
      if (child && child.nodeType === 3 && normalizePrintText(child.textContent || '')) {
        return true;
      }
    }
    return false;
  }

  function renderedSplitContainerClone(node) {
    if (!node || node.nodeType !== 1 || !node.cloneNode) return null;
    var clone = node.cloneNode(false);
    if (clone.classList) {
      clone.classList.remove('print-selected-target');
      clone.classList.remove('print-editor-target-highlight');
    }
    clone.removeAttribute('id');
    clone.removeAttribute('data-print-break-id');
    clone.removeAttribute('data-print-edit-id');
    clone.removeAttribute('data-print-selection-bound');
    clone.dataset.printRenderedFragment = 'true';
    return clone;
  }

  function isCalloutDecorationNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.hasAttribute('data-print-persist-id') || node.hasAttribute('data-print-break-id')) return false;
    if (node.querySelector && node.querySelector('[data-print-persist-id], [data-print-break-id], p, figure, table, ul, ol, li, details, blockquote, pre, h1, h2, h3, h4, h5, h6')) return false;
    if (node.querySelector && node.querySelector('.icon, img, svg')) return true;
    return /^[^\w\u3131-\u318e\uac00-\ud7a3A-Za-z0-9]+$/.test(normalizePrintText(node.textContent || ''));
  }

  function cloneCalloutDecorationPrefix(sourceParent, splitChild, targetParent) {
    if (!sourceParent || !splitChild || !targetParent) return;
    if (!(sourceParent.matches && sourceParent.matches('.callout'))) return;
    var children = Array.from(sourceParent.children || []);
    var splitIndex = children.indexOf(splitChild);
    if (splitIndex <= 0) return;
    children.slice(0, splitIndex).forEach(function (child) {
      if (!isCalloutDecorationNode(child)) return;
      var shellClone = child.cloneNode(true);
      shellClone.removeAttribute('id');
      shellClone.dataset.printRenderedShell = 'true';
      targetParent.appendChild(shellClone);
    });
  }

  function calloutContentContainer(node) {
    if (!node || node.nodeType !== 1 || !(node.matches && node.matches('.callout'))) return null;
    var children = Array.from(node.children || []).filter(function (child) {
      return child && child.nodeType === 1 && !isEditorArtifactNode(child);
    });
    if (!children.length) return null;
    var content = children.find(function (child) {
      return !isCalloutDecorationNode(child);
    });
    return content || children[children.length - 1] || null;
  }

  function canMergeAdjacentCalloutFragments(left, right) {
    if (!left || !right || left.nodeType !== 1 || right.nodeType !== 1) return false;
    if (!(left.matches && left.matches('.callout') && right.matches && right.matches('.callout'))) return false;
    if ((left.dataset && left.dataset.printPersistId || '') !== (right.dataset && right.dataset.printPersistId || '')) return false;
    return !!(left.dataset && left.dataset.printPersistId);
  }

  function mergeAdjacentCalloutFragments(parentNode) {
    if (!parentNode || !parentNode.children) return false;
    var changedAny = false;
    var cursor = parentNode.firstElementChild;
    while (cursor) {
      var next = cursor.nextElementSibling;
      if (canMergeAdjacentCalloutFragments(cursor, next)) {
        var leftContent = calloutContentContainer(cursor);
        var rightContent = calloutContentContainer(next);
        if (leftContent && rightContent) {
          while (rightContent.firstChild) {
            leftContent.appendChild(rightContent.firstChild);
          }
          next.remove();
          changedAny = true;
          continue;
        }
      }
      cursor = next;
    }
    Array.from(parentNode.children || []).forEach(function (child) {
      if (mergeAdjacentCalloutFragments(child)) {
        changedAny = true;
      }
    });
    return changedAny;
  }

  function directMeaningfulElementChildren(node) {
    if (!node || !node.children) return [];
    return Array.from(node.children || []).filter(function (child) {
      return child && child.nodeType === 1 && !isEditorArtifactNode(child);
    });
  }

  function firstBoundaryPersistedChild(node) {
    var children = directMeaningfulElementChildren(node);
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index];
      if (child && child.dataset && child.dataset.printPersistId) return child;
      var nested = firstBoundaryPersistedChild(child);
      if (nested) return nested;
    }
    return null;
  }

  function lastBoundaryPersistedChild(node) {
    var children = directMeaningfulElementChildren(node);
    for (var index = children.length - 1; index >= 0; index -= 1) {
      var child = children[index];
      if (child && child.dataset && child.dataset.printPersistId) return child;
      var nested = lastBoundaryPersistedChild(child);
      if (nested) return nested;
    }
    return null;
  }

  function isRenderedFragmentNode(node) {
    return !!(node && node.dataset && node.dataset.printRenderedFragment === 'true');
  }

  function childBoundaryPersistIds(node) {
    return directMeaningfulElementChildren(node).map(function (child) {
      var boundary = child && child.dataset && child.dataset.printPersistId ? child : firstBoundaryPersistedChild(child);
      return boundary && boundary.dataset ? boundary.dataset.printPersistId || '' : '';
    }).filter(Boolean);
  }

  function canMergeAdjacentFlowSegments(left, right) {
    if (!left || !right || left.nodeType !== 1 || right.nodeType !== 1) return false;
    if (!(left.classList && left.classList.contains('print-flow-segment'))) return false;
    if (!(right.classList && right.classList.contains('print-flow-segment'))) return false;
    if (left.tagName !== right.tagName) return false;
    if ((left.className || '') !== (right.className || '')) return false;
    var leftIds = childBoundaryPersistIds(left);
    var rightIds = childBoundaryPersistIds(right);
    if (!leftIds.length || !rightIds.length) return false;
    return leftIds.some(function (id) {
      return rightIds.indexOf(id) !== -1;
    }) || leftIds[leftIds.length - 1] === rightIds[0];
  }

  function mergeRenderedWrapperChildren(left, right) {
    if (!left || !right || left === right) return false;
    while (right.firstChild) {
      left.appendChild(right.firstChild);
    }
    right.remove();
    return true;
  }

  function mergeAdjacentFlowSegments(parentNode) {
    if (!parentNode || !parentNode.children) return false;
    var changedAny = false;
    var cursor = parentNode.firstElementChild;
    while (cursor) {
      var next = cursor.nextElementSibling;
      if (canMergeAdjacentFlowSegments(cursor, next)) {
        mergeRenderedWrapperChildren(cursor, next);
        changedAny = true;
        continue;
      }
      if (mergeAdjacentFlowSegments(cursor)) {
        changedAny = true;
      }
      cursor = next;
    }
    return changedAny;
  }

  function canMergeAdjacentListWrappers(left, right) {
    if (!left || !right || left.nodeType !== 1 || right.nodeType !== 1) return false;
    if (!(left.tagName === 'UL' || left.tagName === 'OL')) return false;
    if (left.tagName !== right.tagName) return false;
    if ((left.className || '') !== (right.className || '')) return false;
    var leftLast = lastBoundaryPersistedChild(left);
    var rightFirst = firstBoundaryPersistedChild(right);
    if (!leftLast || !rightFirst) return false;
    return (leftLast.dataset.printPersistId || '') === (rightFirst.dataset.printPersistId || '');
  }

  function mergeRenderedListWrapper(left, right) {
    if (!left || !right || left === right) return false;
    while (right.firstChild) {
      left.appendChild(right.firstChild);
    }
    right.remove();
    return true;
  }

  function mergeAdjacentListWrappers(parentNode) {
    if (!parentNode || !parentNode.children) return false;
    var changedAny = false;
    var cursor = parentNode.firstElementChild;
    while (cursor) {
      var next = cursor.nextElementSibling;
      if (canMergeAdjacentListWrappers(cursor, next)) {
        mergeRenderedListWrapper(cursor, next);
        changedAny = true;
        continue;
      }
      if (mergeAdjacentListWrappers(cursor)) {
        changedAny = true;
      }
      cursor = next;
    }
    return changedAny;
  }

  function majorItemBodyContainer(node) {
    if (!node || !(node.matches && node.matches('li.print-major-item'))) return null;
    var title = directChildByClass(node, 'print-major-title');
    var body = directChildByClass(node, 'print-major-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'print-major-body';
      if (title && title.nextSibling) {
        node.insertBefore(body, title.nextSibling);
      } else {
        node.appendChild(body);
      }
    }
    directMeaningfulElementChildren(node).forEach(function (child) {
      if (child === title || child === body) return;
      body.appendChild(child);
    });
    return body;
  }

  function mergeRenderedContainerChildren(left, right) {
    if (!left || !right || left === right) return false;
    var changedAny = false;
    Array.from(right.childNodes || []).forEach(function (child) {
      if (!child) return;
      if (child.nodeType !== 1) {
        left.appendChild(child);
        changedAny = true;
        return;
      }
      if (isEditorArtifactNode(child)) {
        child.remove();
        changedAny = true;
        return;
      }

      var targetParent = left;
      if (left.matches && left.matches('li.print-major-item') && !(child.classList && child.classList.contains('print-major-title'))) {
        targetParent = majorItemBodyContainer(left) || left;
      }

      var matching = null;
      var childPersistId = child.dataset && child.dataset.printPersistId || '';
      if (childPersistId) {
        matching = directMeaningfulElementChildren(targetParent).find(function (existing) {
          return existing !== child &&
            existing.tagName === child.tagName &&
            (existing.dataset && existing.dataset.printPersistId || '') === childPersistId;
        }) || null;
      }
      if (!matching && child.classList) {
        if (child.classList.contains('print-major-title')) {
          matching = directChildByClass(targetParent, 'print-major-title');
        } else if (child.classList.contains('print-major-body')) {
          matching = directChildByClass(targetParent, 'print-major-body');
        }
      }
      if (!matching && (child.tagName === 'UL' || child.tagName === 'OL')) {
        var siblingLists = directMeaningfulElementChildren(targetParent).filter(function (existing) {
          return existing.tagName === child.tagName;
        });
        var lastList = siblingLists.length ? siblingLists[siblingLists.length - 1] : null;
        if (canMergeAdjacentListWrappers(lastList, child)) {
          matching = lastList;
        }
      }

      if (matching && matching !== child) {
        if (matching.tagName === 'UL' || matching.tagName === 'OL') {
          mergeRenderedListWrapper(matching, child);
        } else {
          mergeRenderedContainerChildren(matching, child);
          child.remove();
        }
        changedAny = true;
        return;
      }

      targetParent.appendChild(child);
      changedAny = true;
    });

    if (right.parentNode) {
      right.remove();
      changedAny = true;
    }
    if (left.matches && left.matches('li.print-major-item')) {
      majorItemBodyContainer(left);
    }
    return changedAny;
  }

  function canMergeAdjacentPersistedFragments(left, right) {
    if (!left || !right || left.nodeType !== 1 || right.nodeType !== 1) return false;
    if (left.tagName !== right.tagName) return false;
    if (left.matches && left.matches('.callout')) return false;
    var leftPersistId = left.dataset && left.dataset.printPersistId || '';
    var rightPersistId = right.dataset && right.dataset.printPersistId || '';
    if (!leftPersistId || leftPersistId !== rightPersistId) return false;
    return true;
  }

  function mergeAdjacentPersistedFragments(parentNode) {
    if (!parentNode || !parentNode.children) return false;
    var changedAny = false;
    var cursor = parentNode.firstElementChild;
    while (cursor) {
      var next = cursor.nextElementSibling;
      if (canMergeAdjacentPersistedFragments(cursor, next)) {
        mergeRenderedContainerChildren(cursor, next);
        changedAny = true;
        continue;
      }
      if (mergeAdjacentPersistedFragments(cursor)) {
        changedAny = true;
      }
      cursor = next;
    }
    return changedAny;
  }

  function normalizeRenderedStructuralFragments(root) {
    var scope = root || renderedPagesRoot();
    if (!scope) return false;
    var changedAny = false;
    var passChanged = false;
    do {
      passChanged = false;
      if (mergeAdjacentFlowSegments(scope)) passChanged = true;
      if (mergeAdjacentPersistedFragments(scope)) passChanged = true;
      if (mergeAdjacentCalloutFragments(scope)) passChanged = true;
      if (mergeAdjacentListWrappers(scope)) passChanged = true;
      changedAny = changedAny || passChanged;
    } while (passChanged);
    return changedAny;
  }

  function splitRenderedTailIntoContainer(sourceParent, splitNode, targetParent) {
    if (!sourceParent || !splitNode || !targetParent) return false;
    var movedAny = false;
    var splitReached = false;
    Array.from(sourceParent.childNodes || []).forEach(function (child) {
      if (!splitReached) {
        if (child === splitNode) {
          splitReached = true;
          targetParent.appendChild(child);
          movedAny = true;
          return;
        }
        if (child && child.nodeType === 1 && child.contains && child.contains(splitNode)) {
          splitReached = true;
          var childClone = renderedSplitContainerClone(child);
          if (!childClone) return;
          cloneCalloutDecorationPrefix(sourceParent, child, targetParent);
          if (splitRenderedTailIntoContainer(child, splitNode, childClone) || childClone.childNodes.length) {
            targetParent.appendChild(childClone);
            movedAny = true;
          }
          pruneEmptyAncestors(child, sourceParent);
          return;
        }
        return;
      }
      targetParent.appendChild(child);
      movedAny = true;
    });
    return movedAny;
  }

  function focusManualPageSplitTarget(targetNode) {
    if (!targetNode) return;
    var targetSelection = selectionForNode(targetNode);
    if (targetSelection) {
      setSelectedTarget(targetSelection, { silent: true });
    } else {
      syncSelectedRenderedState();
    }
    restoreViewportAnchor(null, targetNode, {
      behavior: 'auto',
      highlight: false,
      offsetTopPx: 96
    });
    highlightAndScrollToNode(targetNode, {
      behavior: 'smooth',
      offsetTopPx: 96
    });
  }

  function syncManualPageSplitPersistence(candidate) {
    if (!candidate || !candidate.node || !candidate.node.dataset) return;
    candidate.node.dataset.printBreakMode = 'force';
    breakOverrideMap[candidate.id] = 'force';
    delete pullUpOverrideMap[candidate.id];
    writeStoredBreakOverrides();
    writeStoredPullUpOverrides();
  }

  function clearManualPageSplitPersistence(candidateId) {
    if (!candidateId) return;
    var candidate = findCandidateById(candidateId);
    if (candidate && candidate.node && candidate.node.dataset) {
      candidate.node.dataset.printBreakMode = 'auto';
    }
    delete breakOverrideMap[candidateId];
    delete pullUpOverrideMap[candidateId];
    writeStoredBreakOverrides();
    writeStoredPullUpOverrides();
  }

  function mergeRenderedPageLive(pageNode) {
    if (!pageNode) return false;
    var previousPage = pageNode.previousElementSibling && pageNode.previousElementSibling.matches && pageNode.previousElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.previousElementSibling : null;
    if (!previousPage) {
      updateEditorBannerStatus('앞 페이지가 없습니다');
      return false;
    }
    var currentContent = renderedContentRoot(pageNode);
    var previousContent = renderedContentRoot(previousPage);
    if (!currentContent || !previousContent) {
      updateEditorBannerStatus('페이지 내용을 합칠 수 없습니다');
      return false;
    }

    var pageMeta = describeRenderedPage(pageNode);
    pushRenderedHistorySnapshot();
    var splitCandidateId = pageNode.dataset ? pageNode.dataset.printManualSplitCandidate || '' : '';
    var mergeCandidate = null;
    var currentMode = 'auto';
    var currentSpaceMode = 'auto';
    var currentGapUnits = 0;
    var gapId = '';
    var mergePersistId = '';
    var mergeIntent = splitCandidateId ? 'merge_manual_page' : 'merge_with_previous_page';
    var focusNodeBefore = findRenderedCandidateNode(splitCandidateId) || currentContent.firstElementChild || pageNode;

    if (!splitCandidateId) {
      if (!pageMeta.canMerge) {
        updateEditorBannerStatus(pageMeta.mergeHelpText);
        return false;
      }
      mergeCandidate = mergeCandidateForPage(pageNode);
      if (!mergeCandidate) {
        updateEditorBannerStatus(pageMeta.mergeHelpText);
        return false;
      }
      currentMode = sanitizeBreakMode(mergeCandidate.node.dataset.printBreakMode || breakOverrideMap[mergeCandidate.id] || 'auto');
      currentSpaceMode = sanitizeSpaceMode(mergeCandidate.node.dataset.printSpaceMode || spaceOverrideMap[mergeCandidate.id] || 'auto');
      gapId = mergeCandidate.node.dataset ? (mergeCandidate.node.dataset.printBreakId || mergeCandidate.node.dataset.printPersistId || '') : '';
      currentGapUnits = gapId ? (parseInt(manualGapMap[gapId] || '0', 10) || 0) : 0;
      mergePersistId = mergeCandidate.node && mergeCandidate.node.dataset ? mergeCandidate.node.dataset.printPersistId || '' : '';
      focusNodeBefore = findRenderedBreakNode(mergeCandidate) || focusNodeBefore;
    } else {
      var splitCandidate = findCandidateById(splitCandidateId);
      mergePersistId = splitCandidate && splitCandidate.node && splitCandidate.node.dataset ? splitCandidate.node.dataset.printPersistId || '' : '';
    }

    var beforeLayout = snapshotRenderedLayout();
    pushHistorySnapshot('merge-page');
    var actionMeta = buildRuntimeActionMeta(focusNodeBefore, {
      intent: mergeIntent,
      effect: {
        layout_before: beforeLayout,
        split_candidate_id: splitCandidateId,
        merge_candidate_id: mergeCandidate ? mergeCandidate.id : '',
        page_label: pageMeta.primaryLabel,
        page_role: pageMeta.role,
        page_signature: pageMeta.signature,
        previous_page_number: previousPage.getAttribute('data-page-number') || '',
        current_page_number: pageNode.getAttribute('data-page-number') || '',
        cleared_gap_units: currentGapUnits,
        cleared_space_mode: currentSpaceMode
      }
    });

    if (mergeCandidate) {
      mergeCandidate.node.dataset.printBreakMode = 'auto';
      delete breakOverrideMap[mergeCandidate.id];
      if (currentSpaceMode !== 'auto') {
        mergeCandidate.node.dataset.printSpaceMode = 'auto';
        delete spaceOverrideMap[mergeCandidate.id];
      }
      if (gapId) {
        delete manualGapMap[gapId];
      }
      pullUpOverrideMap[mergeCandidate.id] = true;
      writeStoredBreakOverrides();
      writeStoredSpaceOverrides();
      writeStoredPullUpOverrides();
      writeStoredGaps();
      applyResolvedBreakModes();
      applyStoredManualGaps();
    } else {
      clearManualPageSplitPersistence(splitCandidateId);
    }

    while (currentContent.firstChild) {
      previousContent.appendChild(currentContent.firstChild);
    }
    pageNode.remove();

    removeEmptyRenderedPages();
    renumberRenderedPages();
    expandRenderedPageFrame(previousPage);
    installDirectPageManipulation();
    persistRenderedLayout();
    refreshNavigatorOptions();

    var focusNodeAfter = splitCandidateId ? findRenderedCandidateNode(splitCandidateId) : (previousContent.lastElementChild || previousPage);
    focusManualPageSplitTarget(focusNodeAfter || previousPage);
    refreshEditorList();
    var afterLayout = snapshotRenderedLayout();
    logLearningAction('merge_page', {
      targetNode: focusNodeAfter || previousPage,
      candidateId: mergeCandidate ? mergeCandidate.id : splitCandidateId,
      persistId: mergePersistId,
      before: {
        break_mode: currentMode,
        space_mode: currentSpaceMode,
        gap_units: currentGapUnits,
        page_number: actionMeta.page_before && actionMeta.page_before.page_number ? actionMeta.page_before.page_number : 0
      },
      after: {
        page_number: pageNumberFromNode(closestRenderedPageNode(focusNodeAfter || previousPage)),
        page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
      },
      ui: {
        source: 'page_merge_button',
        suggestion_source: 'manual'
      },
      meta: Object.assign({}, actionMeta, {
        focus_after: currentSelectedTarget(),
        target_after: captureRenderedNodePosition(focusNodeAfter || previousPage),
        page_after: captureRenderedPageSnapshot(closestRenderedPageNode(focusNodeAfter || previousPage)),
        effect: {
          merge_live_page: true,
          merge_manual_page: !mergeCandidate,
          merge_candidate_id: mergeCandidate ? mergeCandidate.id : '',
          split_candidate_id: splitCandidateId,
          layout_effect: diffRenderedLayouts(beforeLayout, afterLayout)
        }
      })
    });
    updateEditorBannerStatus('현재 페이지를 앞 페이지에 붙였습니다');
    return true;
  }

  function splitRenderedPageAtNode(renderedCandidate, options) {
    var config = options || {};
    if (!renderedCandidate) {
      updateEditorBannerStatus('나눌 블록을 찾지 못했습니다');
      return;
    }
    var pageNode = closestRenderedPageNode(renderedCandidate);
    var contentRoot = renderedContentRoot(pageNode);
    var candidateId = renderedCandidate.getAttribute('data-print-break-id') || '';
    var candidate = findCandidateById(candidateId);
    if (!candidate || !pageNode || !contentRoot || !contentRoot.contains(renderedCandidate)) {
      updateEditorBannerStatus('나눌 기준 블록을 찾지 못했습니다');
      return;
    }
    if (!hasMeaningfulPrefixBeforeNode(contentRoot, renderedCandidate)) {
      updateEditorBannerStatus('이미 이 페이지의 시작입니다');
      return;
    }

    pushRenderedHistorySnapshot();
    var beforeLayout = snapshotRenderedLayout();
    var actionMeta = buildRuntimeActionMeta(renderedCandidate, {
      intent: 'split_page_live',
      effect: {
        layout_before: beforeLayout
      }
    });
    var newPage = cloneRenderedPageShell(pageNode);
    if (!newPage || !pageNode.parentNode) {
      updateEditorBannerStatus('새 페이지를 만들지 못했습니다');
      return;
    }
    newPage.dataset.printManualPage = 'true';
    newPage.dataset.printManualSplitCandidate = candidate.id;
    pageNode.parentNode.insertBefore(newPage, pageNode.nextSibling);
    var newContentRoot = renderedContentRoot(newPage);
    var moved = splitRenderedTailIntoContainer(contentRoot, renderedCandidate, newContentRoot);
    if (!moved || !newContentRoot || !Array.from(newContentRoot.childNodes || []).some(function (child) {
      return (child.nodeType === 1 && hasMeaningfulRenderedContent(child)) || (child.nodeType === 3 && normalizePrintText(child.textContent || ''));
    })) {
      newPage.remove();
      updateEditorBannerStatus('이 위치에서 페이지를 나누지 못했습니다');
      return;
    }

    syncManualPageSplitPersistence(candidate);
    removeEmptyRenderedPages();
    renumberRenderedPages();
    expandRenderedPageFrame(pageNode);
    expandRenderedPageFrame(newPage);
    installDirectPageManipulation();
    persistRenderedLayout();
    refreshNavigatorOptions();
    focusManualPageSplitTarget(renderedCandidate);
    refreshEditorList();

    var afterLayout = snapshotRenderedLayout();
    logLearningAction('split_page', {
      targetNode: renderedCandidate,
      candidateId: candidate.id,
      before: {
        page_number: actionMeta.page_before && actionMeta.page_before.page_number ? actionMeta.page_before.page_number : 0
      },
      after: {
        page_number: pageNumberFromNode(closestRenderedPageNode(renderedCandidate)),
        page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
      },
      ui: {
        source: config.uiSource || 'inline_split_button',
        suggestion_source: suggestionSourceForBreak(candidate, 'force')
      },
      meta: Object.assign({}, actionMeta, {
        focus_after: currentSelectedTarget(),
        target_after: captureRenderedNodePosition(renderedCandidate),
        page_after: captureRenderedPageSnapshot(closestRenderedPageNode(renderedCandidate)),
        effect: {
          split_page_live: true,
          created_page_number: pageNumberFromNode(closestRenderedPageNode(renderedCandidate)),
          layout_effect: diffRenderedLayouts(beforeLayout, afterLayout)
        }
      })
    });
    updateEditorBannerStatus('이 블록부터 아래 내용을 다음 페이지로 보냈습니다');
  }

  function splitRenderedPageAtNodeForRestore(renderedCandidate) {
    if (!renderedCandidate) return false;
    var pageNode = closestRenderedPageNode(renderedCandidate);
    var contentRoot = renderedContentRoot(pageNode);
    var candidateId = renderedCandidate.getAttribute('data-print-break-id') || '';
    var candidate = findCandidateById(candidateId);
    if (!candidate || !pageNode || !contentRoot || !contentRoot.contains(renderedCandidate)) {
      return false;
    }
    if (!hasMeaningfulPrefixBeforeNode(contentRoot, renderedCandidate)) {
      return false;
    }

    var newPage = cloneRenderedPageShell(pageNode);
    if (!newPage || !pageNode.parentNode) {
      return false;
    }
    newPage.dataset.printManualPage = 'true';
    newPage.dataset.printManualSplitCandidate = candidate.id;
    pageNode.parentNode.insertBefore(newPage, pageNode.nextSibling);
    var newContentRoot = renderedContentRoot(newPage);
    var moved = splitRenderedTailIntoContainer(contentRoot, renderedCandidate, newContentRoot);
    if (!moved || !newContentRoot || !Array.from(newContentRoot.childNodes || []).some(function (child) {
      return (child.nodeType === 1 && hasMeaningfulRenderedContent(child)) || (child.nodeType === 3 && normalizePrintText(child.textContent || ''));
    })) {
      newPage.remove();
      return false;
    }

    syncManualPageSplitPersistence(candidate);
    removeEmptyRenderedPages();
    renumberRenderedPages();
    expandRenderedPageFrame(pageNode);
    expandRenderedPageFrame(newPage);
    return true;
  }

  function undoLastEdit() {
    var eventId = logLearningAction('undo', {
      before: {
        last_event_id: lastLearningActionEventId()
      },
      after: {
        requested: true
      },
      ui: {
        source: 'banner_undo',
        suggestion_source: 'manual'
      }
    });
    if (restoreRenderedHistorySnapshot()) {
      updateEditorBannerStatus('이전 레이아웃으로 되돌렸습니다');
      return;
    }
    if (!restoreLatestHistorySnapshot()) {
      updateEditorBannerStatus('되돌릴 작업이 없습니다');
      return;
    }
    updateEditorBannerStatus('이전 상태로 되돌리는 중…');
    reloadWithPreservedFocus({ intent: 'undo', actionEventId: eventId });
  }

  function mergeWithPreviousPage(pageNode) {
    if (!pageNode) return;
    mergeRenderedPageLive(pageNode);
  }

  function pullCandidateUpWithReload(candidate, options) {
    if (!candidate || !candidate.node) return;
    var config = options || {};
    var currentMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
    var currentSpaceMode = sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || spaceOverrideMap[candidate.id] || 'auto');
    var gapId = candidate.node.dataset ? (candidate.node.dataset.printBreakId || candidate.node.dataset.printPersistId || '') : '';
    var currentGapUnits = gapId ? (parseInt(manualGapMap[gapId] || '0', 10) || 0) : 0;
    var renderedNode = findRenderedBreakNode(candidate) || candidate.node;

    if (currentMode === 'auto' && candidatePullUpEnabled(candidate) && currentSpaceMode === 'auto' && currentGapUnits === 0) {
      updateEditorBannerStatus(config.alreadyStatus || '이미 앞 내용과 이어지도록 설정되어 있습니다');
      return;
    }

    pushHistorySnapshot(config.historyLabel || 'pull-up');
    var eventId = logLearningAction('set_break_mode', {
      targetNode: renderedNode,
      candidateId: candidate.id,
      before: {
        break_mode: currentMode,
        space_mode: currentSpaceMode,
        gap_units: currentGapUnits,
        page_number: pageNumberForRenderedCandidate(candidate.id)
      },
      after: {
        break_mode: 'auto',
        pull_up: true,
        gap_units: 0
      },
      ui: {
        source: config.uiSource || 'manual_pull_up',
        suggestion_source: 'manual'
      },
      meta: buildRuntimeActionMeta(renderedNode, {
        intent: config.intent || 'pull_up_block',
        effect: Object.assign({
          pull_up_block: true,
          cleared_gap_units: currentGapUnits,
          cleared_space_mode: currentSpaceMode,
          layout_before: snapshotRenderedLayout()
        }, config.effect || {})
      })
    });

    candidate.node.dataset.printBreakMode = 'auto';
    delete breakOverrideMap[candidate.id];
    if (currentSpaceMode !== 'auto') {
      candidate.node.dataset.printSpaceMode = 'auto';
      delete spaceOverrideMap[candidate.id];
    }
    if (gapId) {
      delete manualGapMap[gapId];
    }
    pullUpOverrideMap[candidate.id] = true;

    writeStoredBreakOverrides();
    writeStoredSpaceOverrides();
    writeStoredPullUpOverrides();
    writeStoredGaps();
    applyResolvedBreakModes();
    applyStoredManualGaps();
    refreshEditorList();
    flushLearningEvents(true);
    updateEditorBannerStatus(config.status || '앞 내용과 이어 붙이는 중…');
    reloadWithPreservedFocus({
      targetNode: renderedNode,
      candidateId: candidate.id,
      persistId: candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : '',
      intent: config.intent || 'pull_up_block',
      actionEventId: eventId
    });
  }

  function deleteRenderedPage(pageNode) {
    if (!pageNode) return;
    var allPages = Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]'));
    if (allPages.length <= 1) {
      updateEditorBannerStatus('한 페이지만 남아 있어 삭제할 수 없습니다');
      return;
    }

    var pageMeta = describeRenderedPage(pageNode);
    if (!pageMeta.canDelete) {
      updateEditorBannerStatus(pageMeta.deleteHelpText);
      return;
    }

    var pageNumber = pageMeta.pageNumber;
    var previousPage = pageNode.previousElementSibling;
    var nextPage = pageNode.nextElementSibling;
    var previousPageRange = firstLastCandidateIdsInPage(previousPage);
    var nextPageRange = firstLastCandidateIdsInPage(nextPage);
    var candidateIds = pageMeta.candidateIds.slice();
    var persistIds = (pageMeta.deletablePersistIds || []).slice();
    if (!persistIds.length && !candidateIds.length) {
      updateEditorBannerStatus('페이지를 없앨 수 없습니다');
      return;
    }

    var fallbackCandidateId = previousPageRange.last || nextPageRange.first || '';
    var fallbackPersistId = persistedIdFromCandidateId(fallbackCandidateId) || '';
    var fallbackNode = fallbackCandidateId ? findRenderedCandidateNode(fallbackCandidateId) : null;
    var eventId = logLearningAction('delete_page', {
      pageNode: pageNode,
      targetNode: pageNode,
      pageNumber: pageNumber,
      nodeKind: 'page',
      before: {
        page_number: pageNumber,
        block_count: candidateIds.length,
        page_label: pageMeta.primaryLabel,
        page_role: pageMeta.role
      },
      after: {
        deleted: true,
        deleted_block_count: persistIds.length
      },
      ui: {
        source: 'page_delete_button',
        suggestion_source: 'manual'
      },
      meta: buildRuntimeActionMeta(pageNode, {
        candidate_ids: candidateIds,
        persist_ids: persistIds,
        intent: 'delete_page',
        effect: {
          deleted_page_number: pageNumber,
          page_label: pageMeta.primaryLabel,
          page_role: pageMeta.role,
          page_signature: pageMeta.signature,
          shared_persist_ids: pageMeta.sharedWithPrevious.concat(pageMeta.sharedWithNext),
          deleted_persist_ids: persistIds,
          fallback_candidate_id: fallbackCandidateId,
          fallback_persist_id: fallbackPersistId,
          layout_before: snapshotRenderedLayout()
        }
      })
    });
    pushHistorySnapshot('delete-page');
    persistIds.forEach(function (persistId) {
      deletedNodeMap[persistId] = true;
    });
    writeStoredDeletedNodes();
    clearStateForDeletedPersistIds(persistIds);
    clearRenderedOrderStorage();
    flushLearningEvents(true);
    updateEditorBannerStatus('페이지의 고유 내용을 삭제하는 중…');
    reloadWithPreservedFocus({
      targetNode: fallbackNode,
      candidateId: fallbackCandidateId,
      persistId: fallbackPersistId,
      pageNode: previousPage || nextPage || null,
      pageNumber: previousPage ? (previousPage.getAttribute('data-page-number') || '') : (nextPage ? (nextPage.getAttribute('data-page-number') || '') : String(Math.max(1, pageNumber - 1))),
      intent: 'delete_page',
      actionEventId: eventId
    });
  }

  function setCandidateModeWithReload(candidate, mode, status, uiSource, intent) {
    if (!candidate) return;
    var currentMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
    var nextMode = sanitizeBreakMode(mode);
    var suggestionSource = suggestionSourceForBreak(candidate, nextMode);
    var renderedNode = findRenderedBreakNode(candidate) || candidate.node;
    pushHistorySnapshot('break-mode');
    var eventId = logLearningAction('set_break_mode', {
      targetNode: renderedNode,
      candidateId: candidate.id,
      before: {
        break_mode: currentMode,
        page_number: pageNumberForRenderedCandidate(candidate.id)
      },
      after: {
        break_mode: nextMode
      },
      ui: {
        source: uiSource || 'editor_panel',
        suggestion_source: suggestionSource
      },
      meta: buildRuntimeActionMeta(renderedNode, {
        intent: intent || '',
        effect: {
          requested_break_mode: nextMode,
          layout_before: snapshotRenderedLayout()
        }
      })
    });
    setCandidateMode(candidate, nextMode);
    flushLearningEvents(true);
    updateEditorBannerStatus(status || '페이지 배치 조정 중…');
    reloadWithPreservedFocus({
      targetNode: renderedNode,
      candidateId: candidate.id,
      persistId: candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : '',
      intent: intent || 'break_toggle',
      actionEventId: eventId
    });
  }

  function ensurePageChrome(pageNode, pageMeta) {
    if (!pageNode) return null;
    var chrome = directChildByClass(pageNode, 'print-page-chrome');
    if (!chrome) {
      chrome = document.createElement('div');
      chrome.className = 'print-page-chrome';
      pageNode.appendChild(chrome);
    }

    chrome.innerHTML = '';
    pageNode.dataset.printPageRole = pageMeta.role || 'page';
    pageNode.dataset.printPageLabel = pageMeta.primaryLabel || '';
    pageNode.dataset.printPageSignature = pageMeta.signature || '';
    pageNode.dataset.printPageAnchorPersistId = pageMeta.anchorPersistId || '';
    pageNode.classList.toggle('print-page-continued-top', !!pageMeta.continuedFromPrevious);
    pageNode.classList.toggle('print-page-continued-bottom', !!pageMeta.continuesToNext);

    var main = document.createElement('div');
    main.className = 'print-page-chrome-main';
    var summaryBits = [];
    if (pageMeta.primaryLabel) summaryBits.push(pageMeta.primaryLabel);
    if (pageMeta.detailText) summaryBits.push(pageMeta.detailText);
    var summaryText = summaryBits.join(' · ');

    var kicker = document.createElement('div');
    kicker.className = 'print-page-chrome-kicker';

    var pageChip = document.createElement('span');
    pageChip.className = 'print-page-chip is-strong';
    pageChip.textContent = (pageMeta.pageNumber || '?') + '페이지';
    if (summaryText) pageChip.title = summaryText;
    kicker.appendChild(pageChip);

    pageMeta.continuationBadges.forEach(function (label) {
      var chip = document.createElement('span');
      chip.className = 'print-page-chip is-flow';
      chip.textContent = label;
      kicker.appendChild(chip);
    });

    if (!pageMeta.canDelete && pageMeta.persistIds && pageMeta.persistIds.length) {
      var warningChip = document.createElement('span');
      warningChip.className = 'print-page-chip is-warning';
      warningChip.textContent = '페이지 단위 삭제 제한';
      warningChip.title = pageMeta.deleteHelpText;
      kicker.appendChild(warningChip);
    }

    main.appendChild(kicker);
    if (summaryText) main.title = summaryText;

    chrome.appendChild(main);

    var actionGroup = document.createElement('div');
    actionGroup.className = 'print-page-action-group';
    chrome.appendChild(actionGroup);
    return actionGroup;
  }

  function installDirectPageManipulation() {
    var pagesRoot = document.querySelector('.pagedjs_pages');
    if (!pagesRoot) return false;
    normalizeRenderedStructuralFragments(pagesRoot);
    var insertedHandles = 0;

    Array.from(pagesRoot.querySelectorAll('.pagedjs_page[data-page-number]')).forEach(function (pageNode, index) {
      var pageMeta = describeRenderedPage(pageNode);
      pageNode.classList.add('print-screen-page');
      var actionGroup = ensurePageChrome(pageNode, pageMeta);

      if (index > 0) {
        var mergeButton = document.createElement('button');
        mergeButton.type = 'button';
        mergeButton.className = 'print-page-merge-button';
        mergeButton.textContent = '앞 페이지로 붙이기';
        mergeButton.title = pageMeta.mergeHelpText;
        mergeButton.disabled = !pageMeta.canMerge;
        mergeButton.addEventListener('click', function () {
          mergeWithPreviousPage(pageNode);
        });
        actionGroup.appendChild(mergeButton);
      }

      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'print-page-delete-button';
      deleteButton.textContent = '페이지 내용 삭제';
      deleteButton.title = pageMeta.deleteHelpText;
      deleteButton.disabled = !pageMeta.canDelete;
      deleteButton.addEventListener('click', function () {
        deleteRenderedPage(pageNode);
      });
      actionGroup.appendChild(deleteButton);

      if (!pageNode.dataset.printPageSelectionBound) {
        pageNode.dataset.printPageSelectionBound = 'true';
        pageNode.addEventListener('click', function (event) {
          if (isInteractiveCanvasTarget(event.target)) return;
          if (event.target && event.target.closest && event.target.closest('[data-print-break-id], figure.image[data-print-persist-id]')) return;
          var liveMeta = describeRenderedPage(pageNode);
          setSelectedTarget({ kind: 'page', candidateId: '', persistId: '', pageNumber: liveMeta.pageNumber }, { silent: true });
          refreshNavigatorOptions();
          updateEditorBannerStatus(liveMeta.pageNumber + '페이지를 기준으로 보고 있습니다');
          event.stopPropagation();
        });
      }
    });

    Array.from(pagesRoot.querySelectorAll('[data-print-break-id]')).forEach(function (node) {
      node.classList.add('print-draggable-candidate');
      var candidateId = node.getAttribute('data-print-break-id') || '';
      var candidate = findCandidateById(candidateId);
      var recommendation = candidate ? candidateRecommendation(candidate) : null;

      if (!directChildByClass(node, 'print-insert-actions')) {
        var insertBar = document.createElement('span');
        insertBar.className = 'print-insert-actions';
        insertBar.dataset.targetBreakId = candidateId;

        var mergeButton = document.createElement('button');
        mergeButton.type = 'button';
        mergeButton.className = 'print-insert-action-button';
        mergeButton.textContent = '앞에 붙이기';
        mergeButton.title = '이 블록을 바로 앞 내용과 이어 붙이기';
        mergeButton.addEventListener('click', function () {
          var targetCandidate = findCandidateById(candidateId);
          if (!targetCandidate) return;
          pullCandidateUpWithReload(targetCandidate, {
            status: '앞 내용과 이어 붙이는 중…',
            uiSource: 'inline_pull_up_button',
            intent: 'pull_up_block'
          });
        });
        insertBar.appendChild(mergeButton);

        var splitButton = document.createElement('button');
        splitButton.type = 'button';
        splitButton.className = 'print-insert-action-button';
        splitButton.textContent = '여기서 시작';
        splitButton.title = '이 블록부터 새 페이지 시작';
        if (recommendation && recommendation.break && recommendation.break.mode === 'force') {
          splitButton.classList.add('is-suggested');
          splitButton.title = recommendation.break.label + ' - ' + (joinRecommendationReasons(recommendation.break) || '새 페이지 시작 추천');
        }
        splitButton.addEventListener('click', function () {
          splitRenderedPageAtNode(node);
        });
        insertBar.appendChild(splitButton);

        var gapButton = document.createElement('button');
        gapButton.type = 'button';
        gapButton.className = 'print-insert-action-button';
        gapButton.textContent = '빈칸 +';
        gapButton.title = '엔터 한 번 정도의 빈공간 추가';
        if (recommendation && recommendation.gap && recommendation.gap.units > 0) {
          gapButton.classList.add('is-suggested');
          gapButton.title = recommendation.gap.label + ' - ' + (joinRecommendationReasons(recommendation.gap) || '간격 추가 추천');
        }
        gapButton.addEventListener('click', function () {
          var candidate = findCandidateById(candidateId);
          if (!candidate) return;
          adjustCandidateGap(candidate, 1, 'inline_gap_button');
        });
        insertBar.appendChild(gapButton);

        var suggestionBadgeText = candidateSuggestionBadgeText(recommendation);
        if (suggestionBadgeText) {
          var insertBadge = document.createElement('span');
          insertBadge.className = 'print-inline-suggestion-badge';
          insertBadge.textContent = suggestionBadgeText;
          insertBar.appendChild(insertBadge);
        }

        node.appendChild(insertBar);
      }

      if (!directChildByClass(node, 'print-inline-tools')) {
        var inlineTools = document.createElement('span');
        inlineTools.className = 'print-inline-tools';

        var inlineDelete = document.createElement('button');
        inlineDelete.type = 'button';
        inlineDelete.className = 'print-inline-tool is-danger';
        inlineDelete.textContent = 'X';
        inlineDelete.title = '이 블록 삭제';
        inlineDelete.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          var targetCandidate = findCandidateById(candidateId);
          if (!targetCandidate) return;
          setSelectedCandidate(targetCandidate, { silent: true });
          deleteCandidateNode(targetCandidate, 'inline_delete_button');
        });
        inlineTools.appendChild(inlineDelete);

        node.appendChild(inlineTools);
      }

      if (!node.dataset.printSelectionBound) {
        node.dataset.printSelectionBound = 'true';
        node.addEventListener('click', function (event) {
          if (isInteractiveCanvasTarget(event.target)) return;
          var targetSelection = selectionForNode(node);
          if (!targetSelection) return;
          setSelectedTarget(targetSelection, { silent: true });
          event.stopPropagation();
        });
      }

      insertedHandles += 1;
    });

    Array.from(pagesRoot.querySelectorAll('figure.image[data-print-persist-id]')).forEach(function (figure) {
      var figureId = figure.getAttribute('data-print-persist-id') || '';
      if (!figureId) return;
      var imageTools = directChildByClass(figure, 'print-image-tools');
      if (imageTools) {
        imageTools.innerHTML = '';
      } else {
        imageTools = document.createElement('div');
        imageTools.className = 'print-image-tools';
      }

      var imageRecommendation = figureRecommendation(figureId);
      var imageLabel = document.createElement('div');
      imageLabel.className = 'print-image-tools-label';
      var imageLabelText = document.createElement('span');
      imageLabelText.textContent = '이미지 크기';
      imageLabel.appendChild(imageLabelText);
      var selectionCountBadge = document.createElement('span');
      selectionCountBadge.className = 'print-image-selection-count';
      imageLabel.appendChild(selectionCountBadge);
      if (imageRecommendation && imageRecommendation.targetScalePct < 100) {
        var imageBadge = document.createElement('span');
        imageBadge.className = 'print-inline-suggestion-badge';
        imageBadge.textContent = imageRecommendation.label;
        imageBadge.title = joinRecommendationReasons(imageRecommendation) || imageRecommendation.label;
        imageLabel.appendChild(imageBadge);
      }
      imageTools.appendChild(imageLabel);

      var infoRow = document.createElement('div');
      infoRow.className = 'print-image-width-live';
      infoRow.textContent = figureWidthInfoText(figure);
      imageTools.appendChild(infoRow);

      var sliderRow = document.createElement('div');
      sliderRow.className = 'print-image-tools-row';

      var scaleRange = document.createElement('div');
      scaleRange.className = 'print-image-scale-range';
      scaleRange.tabIndex = 0;
      scaleRange.setAttribute('role', 'slider');
      scaleRange.setAttribute('aria-label', '이미지 크기');
      scaleRange.title = imageRecommendation && imageRecommendation.targetScalePct < 100 ? (imageRecommendation.label + ' - ' + (joinRecommendationReasons(imageRecommendation) || '이미지 축소 추천')) : '이미지 크기 직접 조절';
      if (imageRecommendation && imageRecommendation.targetScalePct < 100) {
        scaleRange.dataset.printSuggestedScale = String(imageRecommendation.targetScalePct);
      } else {
        delete scaleRange.dataset.printSuggestedScale;
      }

      var scaleTrack = document.createElement('div');
      scaleTrack.className = 'print-image-scale-track';
      var scaleFill = document.createElement('div');
      scaleFill.className = 'print-image-scale-fill';
      scaleTrack.appendChild(scaleFill);
      var scaleThumb = document.createElement('div');
      scaleThumb.className = 'print-image-scale-thumb';
      scaleTrack.appendChild(scaleThumb);
      scaleRange.appendChild(scaleTrack);
      updateImageSliderVisual(scaleRange, currentStoredImageScale(figureId));
      sliderRow.appendChild(scaleRange);

      var scaleValue = document.createElement('span');
      scaleValue.className = 'print-image-scale-value';
      scaleValue.textContent = formatImageScaleLabel(currentStoredImageScale(figureId));
      sliderRow.appendChild(scaleValue);

      imageTools.appendChild(sliderRow);

      var widthRow = document.createElement('div');
      widthRow.className = 'print-image-tools-row print-image-width-row';

      var widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.className = 'print-image-width-input';
      widthInput.min = String(minimumFigureWidthPx(figure));
      widthInput.max = String(maximumFigureWidthPx(figure));
      widthInput.step = '1';
      widthInput.inputMode = 'numeric';
      widthInput.value = String(Math.max(1, figureRenderedWidthPx(figure) || 1));
      widthInput.title = '선택한 이미지에 적용할 목표 너비(px)';
      widthRow.appendChild(widthInput);

      var widthUnit = document.createElement('span');
      widthUnit.className = 'print-image-width-unit';
      widthUnit.textContent = 'px';
      widthRow.appendChild(widthUnit);

      var widthApplyButton = document.createElement('button');
      widthApplyButton.type = 'button';
      widthApplyButton.className = 'print-image-tool-button';
      widthApplyButton.textContent = '폭 적용';
      widthApplyButton.title = '현재 입력한 px 값을 선택한 이미지들에 적용';
      widthApplyButton.addEventListener('click', function () {
        var nextWidth = parseFloat(widthInput.value || '0');
        if (!(nextWidth > 0)) {
          updateEditorBannerStatus('적용할 이미지 너비(px)를 입력하세요');
          return;
        }
        applyFigureWidthToSelection(figureId, nextWidth, 'image_width_input');
      });
      widthRow.appendChild(widthApplyButton);

      widthInput.addEventListener('keydown', function (event) {
        if (!event || event.key !== 'Enter') return;
        widthApplyButton.click();
      });

      imageTools.appendChild(widthRow);

      var selectionRow = document.createElement('div');
      selectionRow.className = 'print-image-tools-row print-image-tools-actions';

      var selectionButton = document.createElement('button');
      selectionButton.type = 'button';
      selectionButton.className = 'print-image-tool-button print-image-selection-button';
      selectionButton.addEventListener('click', function () {
        var enabled = toggleImageSelectionId(figureId);
        updateEditorBannerStatus(enabled ? '이미지를 너비 통일 선택에 추가했습니다' : '이미지를 너비 통일 선택에서 제외했습니다');
      });
      selectionRow.appendChild(selectionButton);

      var unifyButton = document.createElement('button');
      unifyButton.type = 'button';
      unifyButton.className = 'print-image-tool-button print-image-unify-button';
      unifyButton.textContent = '현재 기준 통일';
      unifyButton.addEventListener('click', function () {
        unifySelectedImagesToFigure(figureId);
      });
      selectionRow.appendChild(unifyButton);

      imageTools.appendChild(selectionRow);

      var actionRow = document.createElement('div');
      actionRow.className = 'print-image-tools-row print-image-tools-actions';

      if (imageRecommendation && imageRecommendation.targetScalePct < 100) {
        var recommendButton = document.createElement('button');
        recommendButton.type = 'button';
        recommendButton.className = 'print-image-tool-button is-suggested';
        recommendButton.textContent = '추천';
        recommendButton.title = imageRecommendation.label + ' - ' + (joinRecommendationReasons(imageRecommendation) || '추천 크기로 조정');
        recommendButton.addEventListener('click', function () {
          updateImageSliderVisual(scaleRange, imageRecommendation.targetScalePct);
          scaleValue.textContent = formatImageScaleLabel(imageRecommendation.targetScalePct);
          setFigureScale(figureId, imageRecommendation.targetScalePct, 'image_recommend_button');
        });
        actionRow.appendChild(recommendButton);
      }

      var resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'print-image-tool-button';
      resetButton.textContent = '기본';
      resetButton.title = '이미지 크기 기본값으로';
      resetButton.addEventListener('click', function () {
        updateImageSliderVisual(scaleRange, 100);
        scaleValue.textContent = '100%';
        setFigureScale(figureId, 100, 'image_reset_button');
      });
      actionRow.appendChild(resetButton);

      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'print-image-tool-button is-danger';
      deleteButton.textContent = '삭제';
      deleteButton.title = '이 이미지를 출력본에서 삭제';
      deleteButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedPersistedNode(figure, 'image', { silent: true });
        deletePersistedNodeLive(figure, figureId, '이미지를 삭제했습니다', 'image_tools', 'image');
      });
      actionRow.appendChild(deleteButton);

      imageTools.appendChild(actionRow);

      var resizeHandle = directChildByClass(figure, 'print-image-resize-handle');
      if (!resizeHandle) {
        resizeHandle = document.createElement('button');
        resizeHandle.type = 'button';
        resizeHandle.className = 'print-image-resize-handle';
        resizeHandle.title = '드래그해서 이미지 너비 조절';
        resizeHandle.setAttribute('aria-label', '드래그해서 이미지 너비 조절');
        resizeHandle.textContent = '↘';
        figure.appendChild(resizeHandle);
      }

      if (!resizeHandle.dataset.printResizeBound) {
        resizeHandle.dataset.printResizeBound = 'true';
        resizeHandle.addEventListener('pointerdown', function (event) {
          if (event && event.preventDefault) {
            event.preventDefault();
          }
          if (event && event.stopPropagation) {
            event.stopPropagation();
          }
          beginImageResizeDrag(event, figure);
        });
      }

      scaleRange.addEventListener('pointerdown', function (event) {
        beginImageScaleSliderDrag(event, figure, scaleRange, scaleValue, figureId);
      });
      scaleRange.addEventListener('click', function (event) {
        if (event && event.stopPropagation) {
          event.stopPropagation();
        }
      });
      scaleRange.addEventListener('focus', function () {
        openImageToolPanel(figure);
        scaleRange.dataset.printScaleStart = String(currentStoredImageScale(figureId));
      });
      scaleRange.addEventListener('keydown', function (event) {
        if (!event) return;
        var currentValue = imageSliderValue(scaleRange);
        var nextValue = currentValue;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = currentValue - imageScaleStepPct;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = currentValue + imageScaleStepPct;
        if (event.key === 'PageDown') nextValue = currentValue - 2;
        if (event.key === 'PageUp') nextValue = currentValue + 2;
        if (event.key === 'Home') nextValue = minimumImageScalePct;
        if (event.key === 'End') nextValue = 100;
        if (nextValue === currentValue) return;
        event.preventDefault();
        openImageToolPanel(figure);
        updateImageSliderVisual(scaleRange, nextValue);
        scaleValue.textContent = formatImageScaleLabel(nextValue);
        setFigureScale(figureId, nextValue, 'image_slider_keyboard');
      });

      var commitScaleChange = function () {
        if (imageScaleSliderDragState && imageScaleSliderDragState.slider === scaleRange) {
          stopImageScaleSliderDrag(true);
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(scaleRange.dataset, 'printScaleStart')) {
          setImageSliderDraggingState(figure, false);
          return;
        }
        setImageSliderDraggingState(figure, false);
        var startValue = sanitizeImageScale(scaleRange.dataset.printScaleStart || currentStoredImageScale(figureId));
        var nextValue = imageSliderValue(scaleRange);
        delete scaleRange.dataset.printScaleStart;
        scaleValue.textContent = formatImageScaleLabel(nextValue);
        if (nextValue === startValue) {
          applyFigureScalePreview(figureId, currentStoredImageScale(figureId));
          return;
        }
        setFigureScale(figureId, nextValue, 'image_slider');
      };

      scaleRange.addEventListener('keyup', function (event) {
        if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
        commitScaleChange();
      });

      if (!imageTools.parentNode) {
        figure.appendChild(imageTools);
      }

      if (!figure.dataset.printImageToolsBound) {
        figure.dataset.printImageToolsBound = 'true';

        figure.addEventListener('click', function (event) {
          if (event.target && event.target.closest('.print-image-resize-handle')) {
            event.stopPropagation();
            return;
          }
          if (event.target && event.target.closest('.print-image-tools')) {
            openImageToolPanel(figure);
            event.stopPropagation();
            return;
          }
          if (event && (event.ctrlKey || event.metaKey)) {
            toggleImageSelectionId(figureId);
          }
          setSelectedPersistedNode(figure, 'image', { silent: true });
          var anchor = event.target && event.target.closest('a');
          if (anchor && figure.contains(anchor)) {
            event.preventDefault();
          }
          openImageToolPanel(figure);
          event.stopPropagation();
        });
      }

      updateFigureScaleUi(figure, currentStoredImageScale(figureId));
      updateFigureSelectionUi(figure);
      updateFigureWidthUi(figure);
    });

    if (!document.body.dataset.printImageToolsGlobalBound) {
      document.body.dataset.printImageToolsGlobalBound = 'true';
      document.addEventListener('pointerdown', function (event) {
        if (event.target && event.target.closest('figure.image[data-print-persist-id]')) return;
        closeImageToolPanels();
      });
      document.addEventListener('keydown', function (event) {
        if (!event || event.key !== 'Escape') return;
        closeImageToolPanels();
      });
      document.addEventListener('pointermove', function (event) {
        updateImageScaleSliderDrag(event);
        updateImageResizeDrag(event);
      });
      document.addEventListener('pointerup', function (event) {
        stopImageScaleSliderDrag(true, event);
        stopImageResizeDrag(true);
      });
      document.addEventListener('pointercancel', function (event) {
        stopImageScaleSliderDrag(true, event);
        stopImageResizeDrag(false);
      });
    }

    if (!document.body.dataset.printSelectionGlobalBound) {
      document.body.dataset.printSelectionGlobalBound = 'true';
      document.addEventListener('pointerdown', function (event) {
        if (!event || !event.target || !event.target.closest) return;
        if (event.target.closest('.pagedjs_pages [data-print-break-id], figure.image[data-print-persist-id], .print-editor-banner, .print-editor-panel')) return;
        clearSelectedTarget({ silent: true });
      });
    }

    syncSelectedRenderedState();

    var ready = insertedHandles > 0 || !!pagesRoot.querySelector('.print-insert-actions');
    updateEditorBannerStatus(ready ? '블록을 클릭해서 앞에 붙이기 또는 여기서 시작으로 바로 조정하세요' : '페이지 미리보기 준비 중');
    return ready;
  }

  function watchDirectManipulation() {
    var pagesRoot = document.querySelector('.pagedjs_pages');
    if (!pagesRoot) return;

    if (directManipulationObserver) {
      directManipulationObserver.disconnect();
    }

    directManipulationObserver = new MutationObserver(function () {
      scheduleDirectManipulationRefresh(80);
    });
    directManipulationObserver.observe(pagesRoot, { childList: true, subtree: true });
  }

  function scheduleDirectManipulationInstall() {
    restoreStoredRenderedLayoutOnce();
    installDirectPageManipulation();
    watchDirectManipulation();
    refreshNavigatorOptions();
    [200, 700, 1500, 3200].forEach(function (delay) {
      setTimeout(function () {
        restoreStoredRenderedLayoutOnce();
        installDirectPageManipulation();
        refreshNavigatorOptions();
      }, delay);
    });
  }

  function ensurePaginationStyles() {
    if (document.getElementById('notion-printer-pagination-style')) return;
    var style = document.createElement('style');
    style.id = 'notion-printer-pagination-style';
    style.textContent = [
      '.print-break-anchor{display:block;width:100%;height:0;margin:0;padding:0;border:0;}',
      '.print-page-start{break-before:page;page-break-before:always;}',
      '.print-block-page-start{break-before:page;page-break-before:always;}',
      '.print-force-break-after{break-after:page;page-break-after:always;}',
      'body.print-ready .print-space-tight{margin-top:0.12rem!important;}',
      'body.print-ready .print-space-wide{margin-top:1rem!important;}',
      'body.print-ready .print-has-manual-gap{margin-top:var(--print-manual-gap, 0.9em)!important;}',
      'body.print-ready[data-print-preview-font="xsmall"] article.page, body.print-ready[data-print-preview-font="xsmall"] .pagedjs_pages{font-size:0.88em!important;}',
      'body.print-ready[data-print-preview-font="small"] article.page, body.print-ready[data-print-preview-font="small"] .pagedjs_pages{font-size:0.94em!important;}',
      'body.print-ready[data-print-preview-font="normal"] article.page, body.print-ready[data-print-preview-font="normal"] .pagedjs_pages{font-size:1em!important;}',
      'body.print-ready[data-print-preview-font="large"] article.page, body.print-ready[data-print-preview-font="large"] .pagedjs_pages{font-size:1.08em!important;}',
      'body.print-ready[data-print-preview-font="xlarge"] article.page, body.print-ready[data-print-preview-font="xlarge"] .pagedjs_pages{font-size:1.16em!important;}',
      'body.print-ready[data-print-preview-spacing="compact"] .print-section{margin:0.55rem 0 0.72rem!important;}',
      'body.print-ready[data-print-preview-spacing="compact"] .print-figure-pair, body.print-ready[data-print-preview-spacing="compact"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="compact"] .print-shortcut-block{margin-top:0.08rem!important;margin-bottom:0.34rem!important;}',
      'body.print-ready[data-print-preview-spacing="normal"] .print-section{margin:0.75rem 0 0.95rem!important;}',
      'body.print-ready[data-print-preview-spacing="normal"] .print-figure-pair, body.print-ready[data-print-preview-spacing="normal"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="normal"] .print-shortcut-block{margin-bottom:0.55rem!important;}',
      'body.print-ready[data-print-preview-spacing="relaxed"] .print-section{margin:0.95rem 0 1.18rem!important;}',
      'body.print-ready[data-print-preview-spacing="relaxed"] .print-figure-pair, body.print-ready[data-print-preview-spacing="relaxed"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="relaxed"] .print-shortcut-block{margin-top:0.22rem!important;margin-bottom:0.72rem!important;}',
      'body.print-ready[data-print-preview-spacing="airy"] .print-section{margin:1.15rem 0 1.42rem!important;}',
      'body.print-ready[data-print-preview-spacing="airy"] .print-figure-pair, body.print-ready[data-print-preview-spacing="airy"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="airy"] .print-shortcut-block{margin-top:0.3rem!important;margin-bottom:0.9rem!important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureEditorOverrideStyles() {
    if (document.getElementById('notion-printer-editor-override-style')) return;
    var style = document.createElement('style');
    style.id = 'notion-printer-editor-override-style';
    style.textContent = [
      '.print-break-anchor{display:block;width:100%;height:0;margin:0;padding:0;border:0;}',
      '.print-page-start{break-before:page;page-break-before:always;}',
      '.print-block-page-start{break-before:page;page-break-before:always;}',
      '.print-force-break-after{break-after:page;page-break-after:always;}',
      'body.print-ready .print-split-block{display:block;width:100%;}',
      'body.print-ready .print-space-tight{margin-top:0.12rem!important;}',
      'body.print-ready .print-space-wide{margin-top:1rem!important;}',
      'body.print-ready[data-print-preview-font="xsmall"] article.page, body.print-ready[data-print-preview-font="xsmall"] .pagedjs_pages{font-size:0.88em!important;}',
      'body.print-ready[data-print-preview-font="small"] article.page, body.print-ready[data-print-preview-font="small"] .pagedjs_pages{font-size:0.94em!important;}',
      'body.print-ready[data-print-preview-font="normal"] article.page, body.print-ready[data-print-preview-font="normal"] .pagedjs_pages{font-size:1em!important;}',
      'body.print-ready[data-print-preview-font="large"] article.page, body.print-ready[data-print-preview-font="large"] .pagedjs_pages{font-size:1.08em!important;}',
      'body.print-ready[data-print-preview-font="xlarge"] article.page, body.print-ready[data-print-preview-font="xlarge"] .pagedjs_pages{font-size:1.16em!important;}',
      'body.print-ready[data-print-preview-spacing="compact"] .print-section{margin:0.55rem 0 0.72rem!important;}',
      'body.print-ready[data-print-preview-spacing="compact"] .print-figure-pair, body.print-ready[data-print-preview-spacing="compact"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="compact"] .print-shortcut-block{margin-top:0.08rem!important;margin-bottom:0.34rem!important;}',
      'body.print-ready[data-print-preview-spacing="normal"] .print-section{margin:0.75rem 0 0.95rem!important;}',
      'body.print-ready[data-print-preview-spacing="normal"] .print-figure-pair, body.print-ready[data-print-preview-spacing="normal"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="normal"] .print-shortcut-block{margin-bottom:0.55rem!important;}',
      'body.print-ready[data-print-preview-spacing="relaxed"] .print-section{margin:0.95rem 0 1.18rem!important;}',
      'body.print-ready[data-print-preview-spacing="relaxed"] .print-figure-pair, body.print-ready[data-print-preview-spacing="relaxed"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="relaxed"] .print-shortcut-block{margin-top:0.22rem!important;margin-bottom:0.72rem!important;}',
      'body.print-ready[data-print-preview-spacing="airy"] .print-section{margin:1.15rem 0 1.42rem!important;}',
      'body.print-ready[data-print-preview-spacing="airy"] .print-figure-pair, body.print-ready[data-print-preview-spacing="airy"] .print-numbered-step-pair, body.print-ready[data-print-preview-spacing="airy"] .print-shortcut-block{margin-top:0.3rem!important;margin-bottom:0.9rem!important;}',
      '@media screen {',
      '  body.print-ready{min-height:100vh;background:var(--print-ui-canvas)!important;}',
      '  body.print-ready.print-editor-open{padding-right:396px;}',
      '  body.print-ready .pagedjs_pages{max-width:880px;margin:0 auto;padding:18px 0 80px;}',
      '  body.print-ready .pagedjs_page{margin:0 auto 28px!important;border:1px solid rgba(19,22,27,0.42);border-radius:16px;background:#fcfcfb;box-shadow:var(--print-ui-paper-shadow);position:relative;overflow:visible;}',
      '  body.print-ready .pagedjs_page::before{display:none!important;content:none!important;}',
      '  body.print-ready .print-page-action-group{position:absolute;top:-16px;right:18px;display:flex;gap:8px;z-index:9;opacity:0;transform:translateY(-2px);transition:opacity 140ms ease,transform 140ms ease;}',
      '  body.print-ready .pagedjs_page:hover .print-page-action-group{opacity:1;transform:translateY(0);}',
      '  body.print-ready .print-page-merge-button, body.print-ready .print-page-delete-button{border:1px solid var(--print-editor-border);border-radius:999px;padding:5px 10px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 10px 18px rgba(4,6,10,0.22);}',
      '  body.print-ready .print-page-delete-button{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.28);}',
      '  body.print-ready .print-editor-banner{position:sticky;top:0;z-index:10000;display:flex!important;flex-wrap:wrap;align-items:center;gap:10px;margin:0 auto 14px;padding:12px 14px;max-width:980px;border:1px solid var(--print-editor-border);border-radius:18px;background:var(--print-ui-surface-strong);box-shadow:var(--print-ui-shadow);}',
      '  body.print-ready .print-editor-banner-button{border:1px solid var(--print-editor-border);border-radius:999px;padding:8px 12px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.84rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-banner-button.is-primary{background:var(--print-editor-accent);border-color:var(--print-editor-accent);color:#182230;}',
      '  body.print-ready .print-editor-banner-button:disabled{cursor:default;opacity:0.5;}',
      '  body.print-ready .print-editor-banner-summary{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
      '  body.print-ready .print-editor-banner-status{margin-left:auto;font-size:0.82rem;font-weight:700;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-banner{display:flex!important;}',
      '  body.print-ready .print-editor-launcher{position:fixed;right:18px;bottom:18px;z-index:9999;display:block!important;border:1px solid var(--print-editor-border);border-radius:999px;padding:12px 16px;background:var(--print-ui-surface-strong);color:var(--print-ui-text);font:inherit;font-weight:700;box-shadow:var(--print-ui-shadow);cursor:pointer;}',
      '  body.print-ready .print-editor-panel{position:fixed;top:16px;right:16px;bottom:16px;width:360px;display:none!important;flex-direction:column;gap:14px;padding:16px;border:1px solid var(--print-editor-border);border-radius:18px;background:var(--print-ui-surface);backdrop-filter:blur(12px);box-shadow:var(--print-ui-shadow);z-index:9998;}',
      '  body.print-ready .print-editor-panel{display:none!important;}',
      '  body.print-ready.print-editor-open .print-editor-panel{display:flex!important;}',
      '  body.print-ready .print-editor-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
      '  body.print-ready .print-editor-title{font-size:1rem;font-weight:800;line-height:1.35;margin:0;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-subtitle{margin:4px 0 0;font-size:0.86rem;line-height:1.45;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-close{border:1px solid var(--print-editor-border);background:var(--print-ui-surface-soft);color:var(--print-ui-text);border-radius:10px;padding:6px 10px;font:inherit;cursor:pointer;}',
      '  body.print-ready .print-editor-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
      '  body.print-ready .print-editor-summary-chip{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid var(--print-editor-border);border-radius:14px;background:rgba(255,255,255,0.06);}',
      '  body.print-ready .print-editor-summary-chip strong{font-size:1rem;line-height:1.1;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-summary-chip span{font-size:0.72rem;font-weight:700;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip{padding:6px 10px;gap:1px;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip strong{font-size:0.82rem;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip span{font-size:0.64rem;}',
      '  body.print-ready .print-editor-filter-bar{display:flex;flex-wrap:wrap;gap:6px;}',
      '  body.print-ready .print-editor-filter-button{border:1px solid var(--print-editor-border);border-radius:999px;padding:7px 11px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.78rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-filter-button.is-active{background:var(--print-editor-accent);border-color:var(--print-editor-accent);color:#182230;}',
      '  body.print-ready .print-editor-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '  body.print-ready .print-editor-actions button{border:1px solid var(--print-editor-border);background:var(--print-ui-surface-soft);color:var(--print-ui-text);border-radius:10px;padding:9px 10px;font:inherit;font-weight:700;cursor:pointer;}',
      '  body.print-ready .print-editor-actions button.print-editor-primary{background:var(--print-editor-accent);border-color:var(--print-editor-accent);color:#182230;}',
      '  body.print-ready .print-editor-actions button.is-active{background:var(--print-editor-accent);border-color:var(--print-editor-accent);color:#182230;}',
      '  body.print-ready .print-editor-note{margin:0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid var(--print-editor-border);font-size:0.84rem;line-height:1.5;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-navigator{display:grid;grid-template-columns:1fr auto;gap:8px 10px;padding:10px 12px;border:1px solid var(--print-editor-border);border-radius:14px;background:rgba(255,255,255,0.04);}',
      '  body.print-ready .print-editor-settings{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px;border:1px solid var(--print-editor-border);border-radius:14px;background:rgba(255,255,255,0.04);}',
      '  body.print-ready .print-editor-field{display:flex;flex-direction:column;gap:6px;}',
      '  body.print-ready .print-editor-field-label{font-size:0.78rem;font-weight:700;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-select{appearance:none;border:1px solid var(--print-editor-border);border-radius:10px;padding:9px 10px;background:var(--print-ui-surface-soft);font:inherit;font-size:0.85rem;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-secondary{align-self:end;border:1px solid var(--print-editor-border);background:var(--print-ui-surface-soft);color:var(--print-ui-text);border-radius:10px;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap;}',
      '  body.print-ready .print-editor-list-meta{margin:0;font-size:0.78rem;font-weight:700;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-list{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px;}',
      '  body.print-ready .print-editor-empty{padding:14px;border:1px dashed rgba(255,255,255,0.18);border-radius:14px;background:rgba(255,255,255,0.04);font-size:0.84rem;line-height:1.55;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-item{border:1px solid var(--print-editor-border);border-radius:14px;padding:12px;background:rgba(255,255,255,0.05);}',
      '  body.print-ready .print-editor-item.is-selected{border-color:rgba(154,179,223,0.52);box-shadow:0 0 0 2px rgba(154,179,223,0.18);}',
      '  body.print-ready .print-editor-item.print-mode-force{border-color:rgba(154,179,223,0.5);background:rgba(154,179,223,0.12);}',
      '  body.print-ready .print-editor-item.print-mode-keep{border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.03);}',
      '  body.print-ready .print-editor-item.is-recommended{box-shadow:0 0 0 2px rgba(154,179,223,0.26);}',
      '  body.print-ready .print-editor-item.is-manual{border-color:rgba(245,158,11,0.28);}',
      '  body.print-ready .print-editor-item-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;}',
      '  body.print-ready .print-editor-item-label{margin:0;font-size:0.92rem;font-weight:700;line-height:1.4;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-item-meta{margin:0;font-size:0.78rem;color:var(--print-ui-subtle);line-height:1.45;}',
      '  body.print-ready .print-editor-suggestion-badge, body.print-ready .print-inline-suggestion-badge{display:inline-flex!important;align-items:center;justify-content:center;width:max-content;margin-top:6px;padding:3px 8px;border-radius:999px;background:rgba(154,179,223,0.18);color:#d9e5fb;font-size:0.7rem;font-weight:800;letter-spacing:0.01em;}',
      '  body.print-ready .print-editor-item-jump{border:none;background:transparent;color:var(--print-editor-accent);font:inherit;font-weight:700;cursor:pointer;padding:0;white-space:nowrap;}',
      '  body.print-ready .print-editor-item-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}',
      '  body.print-ready .print-editor-item-controls button{border:1px solid var(--print-editor-border);background:var(--print-ui-surface-soft);color:var(--print-ui-text);border-radius:10px;padding:8px 6px;font:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;}',
      '  body.print-ready .print-editor-item-controls button.is-active{background:var(--print-editor-accent);border-color:var(--print-editor-accent);color:#182230;}',
      '  body.print-ready .print-editor-item-controls button.is-suggested, body.print-ready .print-insert-action-button.is-suggested, body.print-ready .print-image-tool-button.is-suggested{border-color:rgba(154,179,223,0.4);background:rgba(154,179,223,0.18);color:#d9e5fb;}',
      '  body.print-ready .print-draggable-candidate{position:relative;overflow:visible;}',
      '  body.print-ready figure.image[data-print-persist-id]{position:relative;overflow:visible;display:flex;flex-direction:column;align-items:center;text-align:center;}',
      '  body.print-ready figure.image[data-print-persist-id] > a, body.print-ready figure.image[data-print-persist-id] > img{display:block;}',
      '  body.print-ready figure.image[data-print-persist-id] img{margin:0 auto;}',
      '  body.print-ready figure.image.print-image-resized img{width:calc(100% * var(--print-image-scale, 1))!important;max-width:calc(100% * var(--print-image-scale, 1))!important;height:auto!important;}',
      '  body.print-ready .print-insert-actions{position:absolute;left:9%;right:9%;top:0;height:0;display:flex;align-items:center;justify-content:center;gap:8px;overflow:visible;pointer-events:auto;z-index:9;}',
      '  body.print-ready .print-insert-actions::before{content:"";position:absolute;left:0;right:0;top:0;transform:translateY(-50%);height:2px;border-radius:999px;background:rgba(47,111,237,0.18);transition:background 120ms ease,opacity 120ms ease;opacity:0.85;}',
      '  body.print-ready .print-draggable-candidate:hover{outline:2px solid rgba(154,179,223,0.18);outline-offset:4px;border-radius:10px;}',
      '  body.print-ready .print-draggable-candidate:hover > .print-insert-actions::before, body.print-ready .print-insert-actions:hover::before{background:rgba(47,111,237,0.42);opacity:1;}',
      '  body.print-ready .print-insert-action-button{position:relative;margin-top:-14px;border:1px solid var(--print-editor-border);border-radius:999px;padding:5px 10px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.73rem;font-weight:800;cursor:pointer;box-shadow:0 12px 20px rgba(4,6,10,0.24);pointer-events:auto;opacity:0;transform:translateY(-4px);transition:opacity 120ms ease,transform 120ms ease,box-shadow 120ms ease;background-clip:padding-box;}',
      '  body.print-ready .print-draggable-candidate:hover > .print-insert-actions .print-insert-action-button, body.print-ready .print-insert-actions:hover .print-insert-action-button{opacity:1;transform:translateY(-14px);box-shadow:0 10px 18px rgba(17,24,39,0.12);}',
      '  body.print-ready .print-page-dropzone{position:absolute;left:18px;right:18px;display:flex!important;align-items:center;justify-content:center;min-height:0;height:0;margin:0;border:none;background:transparent;color:transparent;font-size:0;line-height:0;text-align:center;transition:height 150ms ease,min-height 150ms ease,background 150ms ease,transform 150ms ease,opacity 150ms ease;z-index:7;pointer-events:auto;opacity:0;overflow:visible;}',
      '  body.print-ready .print-page-dropzone::before{content:"";display:block;width:100%;height:2px;border-radius:999px;background:rgba(47,111,237,0.22);transition:height 150ms ease,background 150ms ease,opacity 150ms ease,transform 150ms ease;opacity:0;transform:scaleX(0.96);}',
      '  body.print-ready .print-page-dropzone::after{content:attr(data-drop-label);position:absolute;left:50%;top:50%;transform:translate(-50%, -50%);padding:4px 10px;border-radius:999px;background:rgba(17,24,39,0.92);color:#fff;font-size:0.68rem;line-height:1.1;font-weight:800;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 150ms ease,transform 150ms ease;}',
      '  body.print-ready.print-drag-active .print-page-dropzone{opacity:1;}',
      '  body.print-ready.print-drag-active .print-page-dropzone::before{opacity:1;}',
      '  body.print-ready .print-page-dropzone-top{top:12px;}',
      '  body.print-ready .print-page-dropzone-bottom{bottom:12px;}',
      '  body.print-ready .print-page-dropzone.is-over{min-height:34px;height:34px;background:rgba(47,111,237,0.08);transform:scale(1.005);}',
      '  body.print-ready .print-page-dropzone.is-over::before{height:4px;background:rgba(47,111,237,0.72);opacity:1;transform:scaleX(1);}',
      '  body.print-ready .print-page-dropzone.is-over::after{opacity:1;transform:translate(-50%, -50%);}',
      '  body.print-ready .print-inline-dropzone{position:relative;left:auto;right:auto;top:auto;bottom:auto;min-height:0;height:0;margin:0 0 0.15rem;background:transparent;font-size:0;}',
      '  body.print-ready.print-drag-active .print-inline-dropzone{min-height:12px;height:12px;margin:3px 0 7px;}',
      '  body.print-ready.print-drag-active .print-inline-dropzone::before{opacity:0.48;}',
      '  body.print-ready .print-inline-dropzone.is-over{min-height:36px;height:36px;margin:6px 0 10px;}',
      '  body.print-ready .print-draggable-candidate{position:relative;}',
      '  body.print-ready .print-draggable-candidate:hover{outline:2px solid rgba(154,179,223,0.24);outline-offset:6px;border-radius:10px;}',
      '  body.print-ready .print-selected-target{outline:2px solid rgba(154,179,223,0.44)!important;outline-offset:6px;border-radius:12px;box-shadow:0 0 0 4px rgba(154,179,223,0.10)!important;}',
      '  body.print-ready .print-draggable-candidate.is-dragging{opacity:0.72;}',
      '  body.print-ready .print-inline-tools{position:absolute;top:-8px;right:-8px;display:flex;gap:4px;z-index:8;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity 120ms ease,transform 120ms ease;}',
      '  body.print-ready .print-draggable-candidate:hover > .print-inline-tools, body.print-ready .print-draggable-candidate.print-selected-target > .print-inline-tools, body.print-ready figure.image.print-selected-target > .print-inline-tools{opacity:1;transform:translateY(0);pointer-events:auto;}',
      '  body.print-ready .print-inline-tool{display:inline-flex!important;align-items:center;justify-content:center;min-width:24px;height:24px;border:1px solid var(--print-editor-border);border-radius:999px;padding:0 6px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.72rem;font-weight:800;cursor:pointer;box-shadow:0 8px 14px rgba(4,6,10,0.22);}',
      '  body.print-ready .print-inline-tool.is-danger{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.28);}',
      '  body.print-ready figure.image.print-image-group-selected{outline:2px solid rgba(154,179,223,0.52);outline-offset:8px;border-radius:14px;}',
      '  body.print-ready .print-image-tools{position:absolute;top:12px;left:50%;display:flex;flex-direction:column;gap:8px;width:min(320px, calc(100vw - 40px));max-width:calc(100vw - 40px);padding:10px 12px;border:1px solid var(--print-editor-border);border-radius:14px;background:var(--print-ui-surface);color:var(--print-ui-text);box-shadow:var(--print-ui-shadow);z-index:8;opacity:0;transform:translate(-50%,-6px) scale(0.96);transform-origin:center top;transition:opacity 140ms ease,transform 140ms ease;pointer-events:none;}',
      '  body.print-ready figure.image[data-print-persist-id]:hover .print-image-tools, body.print-ready figure.image[data-print-persist-id]:focus-within .print-image-tools, body.print-ready figure.image[data-print-persist-id].print-image-tools-open .print-image-tools{opacity:1;transform:translate(-50%,0) scale(1);pointer-events:auto;}',
      '  body.print-ready figure.image.print-image-slider-active .print-image-tools{transition:none!important;transform:translate(-50%,0) scale(1)!important;}',
      '  body.print-ready .print-image-tools-label{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.72rem;font-weight:800;letter-spacing:0.01em;color:var(--print-ui-muted);}',
      '  body.print-ready .print-image-selection-count{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,0.08);color:var(--print-ui-text);font-size:0.68rem;font-weight:800;}',
      '  body.print-ready .print-image-width-live{font-size:0.72rem;line-height:1.45;color:var(--print-ui-muted);}',
      '  body.print-ready .print-image-tools-row{display:flex;align-items:center;gap:10px;}',
      '  body.print-ready .print-image-tools-actions{justify-content:flex-end;flex-wrap:wrap;}',
      '  body.print-ready .print-image-scale-range{--print-image-thumb-scale:1;position:relative;display:flex;align-items:center;flex:1;min-height:26px;cursor:ew-resize;touch-action:none;-webkit-user-select:none;user-select:none;outline:none;}',
      '  body.print-ready .print-image-scale-track{position:relative;width:100%;height:6px;border-radius:999px;background:rgba(255,255,255,0.14);overflow:visible;}',
      '  body.print-ready .print-image-scale-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:linear-gradient(90deg, rgba(47,111,237,0.96), rgba(154,179,223,0.96));will-change:width;}',
      '  body.print-ready .print-image-scale-thumb{position:absolute;top:50%;left:100%;width:16px;height:16px;border:2px solid #d9e5fb;border-radius:999px;background:#182230;box-shadow:0 6px 16px rgba(4,6,10,0.28);transform:translate(-50%,-50%) scale(var(--print-image-thumb-scale));will-change:left,transform;}',
      '  body.print-ready .print-image-scale-range:focus-visible .print-image-scale-track{box-shadow:0 0 0 3px rgba(47,111,237,0.22);}',
      '  body.print-ready .print-image-scale-range:focus-visible, body.print-ready figure.image.print-image-slider-active .print-image-scale-range{--print-image-thumb-scale:1.06;}',
      '  body.print-ready .print-image-scale-value{min-width:46px;text-align:right;font-size:0.78rem;font-weight:800;color:var(--print-ui-text);}',
      '  body.print-ready .print-image-width-row{align-items:center;}',
      '  body.print-ready .print-image-width-input{width:92px;border:1px solid var(--print-editor-border);border-radius:10px;padding:7px 9px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.8rem;font-weight:700;}',
      '  body.print-ready .print-image-width-unit{font-size:0.76rem;font-weight:800;color:var(--print-ui-muted);}',
      '  body.print-ready .print-image-tool-button{display:inline-flex!important;align-items:center;justify-content:center;min-width:44px;height:28px;border:1px solid var(--print-editor-border);border-radius:999px;padding:0 10px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 8px 14px rgba(4,6,10,0.22);}',
      '  body.print-ready .print-image-tool-button.is-danger{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.28);}',
      '  body.print-ready .print-image-tool-button:disabled{opacity:0.45;cursor:default;}',
      '  body.print-ready.print-editor-open{padding-right:0!important;}',
      '  body.print-ready.print-ui-minimal .print-editor-panel, body.print-ready.print-ui-minimal .print-inline-tools, body.print-ready.print-ui-minimal .print-inline-suggestion-badge, body.print-ready.print-ui-minimal .print-editor-launcher, body.print-ready.print-ui-minimal .print-editor-banner-button[data-editor-role="panel-toggle"], body.print-ready.print-ui-minimal .print-editor-banner-summary, body.print-ready.print-ui-minimal .print-editor-banner-status{display:none!important;}',
      '  body.print-ready .print-page-sidebar-toggle{position:fixed;top:76px;left:18px;display:inline-flex!important;align-items:center;justify-content:center;min-width:44px;height:36px;padding:0 14px;border:1px solid var(--print-editor-border);border-radius:999px;background:rgba(18,22,27,0.92);color:var(--print-ui-text);font:inherit;font-size:0.76rem;font-weight:800;letter-spacing:0.01em;cursor:pointer;box-shadow:0 14px 28px rgba(4,6,10,0.26);z-index:18;transition:left 180ms ease,background 160ms ease,box-shadow 160ms ease;}',
      '  body.print-ready .print-page-sidebar-toggle:hover{background:rgba(29,34,41,0.96);box-shadow:0 16px 30px rgba(4,6,10,0.3);}',
      '  body.print-ready .print-page-sidebar{position:fixed;top:66px;left:12px;bottom:12px;width:196px;padding:14px 10px 16px;border:1px solid var(--print-editor-border);border-radius:22px;background:rgba(18,22,27,0.94);color:var(--print-ui-text);box-shadow:22px 0 52px rgba(4,6,10,0.28);backdrop-filter:blur(14px);z-index:17;display:flex;flex-direction:column;gap:12px;transform:translateX(calc(-100% - 16px));transition:transform 180ms ease;}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar{transform:translateX(0);}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle{left:154px;}',
      '  body.print-ready.print-page-sidebar-open .pagedjs_pages{margin-left:206px;transition:margin-left 180ms ease;}',
      '  body.print-ready .print-page-sidebar-header{display:flex;flex-direction:column;gap:4px;padding:0 6px;}',
      '  body.print-ready .print-page-sidebar-title{font-size:0.96rem;font-weight:900;line-height:1.2;color:var(--print-ui-text);}',
      '  body.print-ready .print-page-sidebar-subtitle{display:none!important;}',
      '  body.print-ready .print-page-sidebar-list{flex:1;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:18px;padding:6px 2px 12px;}',
      '  body.print-ready .print-page-sidebar-item{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;padding:0;border:none;background:transparent;color:var(--print-ui-text);text-align:center;font:inherit;cursor:pointer;transition:transform 140ms ease;}',
      '  body.print-ready .print-page-sidebar-item:hover{background:transparent;transform:translateY(-1px);}',
      '  body.print-ready .print-page-sidebar-item.is-active{background:transparent;box-shadow:none;}',
      '  body.print-ready .print-page-sidebar-thumb{position:relative;flex:0 0 auto;width:148px;max-width:100%;background:transparent;overflow:hidden;border-radius:14px;}',
      '  body.print-ready .print-page-sidebar-thumb-viewport{position:relative;display:block;width:100%;height:100%;padding:6px;background:transparent;overflow:hidden;border-radius:14px;}',
      '  body.print-ready .print-page-sidebar-sheet{position:relative;display:block;transform-origin:top left;border-radius:12px;overflow:hidden;background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,0.08), 0 12px 20px rgba(4,6,10,0.16);pointer-events:none;}',
      '  body.print-ready .print-page-sidebar-preview{position:relative;display:block;width:100%;min-height:100%;background:transparent;pointer-events:none;}',
      '  body.print-ready .print-page-sidebar-preview-content{max-width:none!important;min-height:100%;margin:0!important;border-radius:0!important;box-shadow:none!important;pointer-events:none;}',
      '  body.print-ready .print-page-sidebar-sheet .pagedjs_page, body.print-ready .print-page-sidebar-sheet article.page{margin:0!important;box-shadow:none!important;}',
      '  body.print-ready .print-page-sidebar-sheet .print-editor-banner, body.print-ready .print-page-sidebar-sheet .print-editor-panel, body.print-ready .print-page-sidebar-sheet .print-editor-launcher, body.print-ready .print-page-sidebar-sheet .print-insert-actions, body.print-ready .print-page-sidebar-sheet .print-page-dropzone, body.print-ready .print-page-sidebar-sheet .print-inline-dropzone, body.print-ready .print-page-sidebar-sheet .print-image-tools, body.print-ready .print-page-sidebar-sheet .print-image-resize-handle, body.print-ready .print-page-sidebar-sheet .print-page-target-highlight, body.print-ready .print-page-sidebar-sheet .print-editor-target-highlight{display:none!important;}',
      '  body.print-ready .print-page-sidebar-thumb-number{display:none!important;}',
      '  body.print-ready .print-page-sidebar-item.is-active .print-page-sidebar-sheet{box-shadow:inset 0 0 0 2px rgba(154,179,223,0.54), 0 16px 26px rgba(4,6,10,0.2);}',
      '  body.print-ready .print-page-sidebar-number{font-size:0.76rem;font-weight:900;line-height:1;color:var(--print-ui-muted);}',
      '  body.print-ready .print-page-sidebar-item.is-active .print-page-sidebar-number{color:var(--print-ui-text);}',
      '  body.print-ready .print-image-resize-handle{position:absolute;right:-10px;bottom:-10px;display:inline-flex!important;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--print-editor-border);border-radius:999px;background:var(--print-ui-surface-strong);color:var(--print-ui-text);font:inherit;font-size:0.88rem;font-weight:800;cursor:nwse-resize;box-shadow:0 10px 16px rgba(4,6,10,0.24);z-index:8;opacity:0;transform:scale(0.96);transition:opacity 120ms ease,transform 120ms ease;}',
      '  body.print-ready figure.image[data-print-persist-id]:hover .print-image-resize-handle, body.print-ready figure.image[data-print-persist-id].print-image-tools-open .print-image-resize-handle, body.print-ready figure.image.print-selected-target .print-image-resize-handle{opacity:1;transform:scale(1);}',
      '  body.print-ready.print-image-resizing .print-image-resize-handle{opacity:1;}',
      '  body.print-ready .print-drag-handle{cursor:grab!important;}',
      '  body.print-ready.print-drag-active .print-drag-handle{cursor:grabbing!important;}',
      '  body.print-ready.print-text-edit-mode [data-print-edit-id]{outline:2px dashed rgba(47,111,237,0.22);outline-offset:3px;border-radius:4px;min-height:1em;}',
      '  body.print-ready .print-has-manual-gap{margin-top:var(--print-manual-gap, 0.9em)!important;}',
      '  body.print-ready .print-page-target-highlight{box-shadow:0 0 0 4px rgba(154,179,223,0.16), 0 18px 34px rgba(4,6,10,0.22)!important;}',
      '  body.print-ready .print-editor-target-highlight{box-shadow:0 0 0 3px rgba(154,179,223,0.22)!important;}',
      '  @media (max-width: 1280px){body.print-ready.print-editor-open{padding-right:0;}body.print-ready .print-editor-panel{width:min(400px, calc(100vw - 28px));}}',
      '  @media (max-width: 900px){body.print-ready .print-editor-banner{padding:10px 12px;}body.print-ready .print-editor-panel{top:auto;left:12px;right:12px;bottom:12px;width:auto;max-height:78vh;border-radius:18px;}body.print-ready .print-editor-settings{grid-template-columns:1fr;}body.print-ready .print-editor-summary{grid-template-columns:repeat(2,minmax(0,1fr));}body.print-ready .print-page-sidebar{width:min(64vw,196px);}body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle{left:calc(min(64vw,196px) - 42px);}body.print-ready.print-page-sidebar-open .pagedjs_pages{margin-left:0;}}',
      '}',
      '@media print {',
      '  body.print-ready .print-editor-banner,',
      '  body.print-ready .print-editor-launcher,',
      '  body.print-ready .print-editor-panel,',
      '  body.print-ready .print-page-dropzone,',
      '  body.print-ready .print-drag-handle,',
      '  body.print-ready .print-image-resize-handle,',
      '  body.print-ready .print-page-action-group,',
      '  body.print-ready .print-page-merge-button,',
      '  body.print-ready .print-page-delete-button,',
      '  body.print-ready .print-image-tools,',
      '  body.print-ready .print-inline-tools,',
      '  body.print-ready .print-insert-actions{display:none!important;}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensurePageChromeStyles() {
    if (document.getElementById('notion-printer-page-chrome-style')) return;
    var style = document.createElement('style');
    style.id = 'notion-printer-page-chrome-style';
    style.textContent = [
      '@media screen {',
      '  body.print-ready .pagedjs_pages{padding-top:18px;}',
      '  body.print-ready .pagedjs_page{margin:0 auto 34px!important;border:1px solid rgba(19,22,27,0.42);border-radius:18px;background:linear-gradient(180deg, rgba(255,255,255,0.96) 0, rgba(252,252,251,1) 100%);box-shadow:var(--print-ui-paper-shadow);}',
      '  body.print-ready .pagedjs_page::before{content:none!important;}',
      '  body.print-ready .pagedjs_page.print-page-continued-top{border-top-color:rgba(47,111,237,0.38);}',
      '  body.print-ready .pagedjs_page.print-page-continued-bottom{border-bottom-color:rgba(47,111,237,0.38);}',
      '  body.print-ready .pagedjs_page.print-selected-target{box-shadow:0 0 0 3px rgba(154,179,223,0.18), var(--print-ui-paper-shadow)!important;}',
      '  body.print-ready .print-page-chrome{position:absolute;left:16px;right:16px;top:-18px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;z-index:10;pointer-events:none;}',
      '  body.print-ready .print-page-chrome-main{display:flex;align-items:center;gap:8px;min-width:0;padding:7px 10px;border:1px solid var(--print-editor-border);border-radius:999px;background:var(--print-ui-surface-strong);box-shadow:0 14px 24px rgba(4,6,10,0.24);pointer-events:auto;}',
      '  body.print-ready .print-page-chrome-kicker{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
      '  body.print-ready .print-page-chip{display:inline-flex;align-items:center;justify-content:center;padding:3px 9px;border-radius:999px;border:1px solid var(--print-editor-border);background:rgba(255,255,255,0.06);color:var(--print-ui-muted);font-size:0.68rem;font-weight:800;line-height:1.1;letter-spacing:0.01em;}',
      '  body.print-ready .print-page-chip.is-strong{background:var(--print-editor-accent);color:#182230;border-color:var(--print-editor-accent);}',
      '  body.print-ready .print-page-chip.is-flow{background:rgba(154,179,223,0.16);border-color:rgba(154,179,223,0.28);color:#d9e5fb;}',
      '  body.print-ready .print-page-chip.is-warning{background:var(--print-ui-danger-soft);border-color:rgba(240,177,173,0.28);color:var(--print-ui-danger);}',
      '  body.print-ready .print-page-chrome-title{max-width:440px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.92rem;font-weight:800;line-height:1.35;color:var(--print-ui-text);}',
      '  body.print-ready .print-page-chrome-meta{max-width:460px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.72rem;font-weight:700;line-height:1.35;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-page-action-group{position:static;display:flex;gap:8px;align-items:center;opacity:1!important;transform:none!important;pointer-events:auto;}',
      '  body.print-ready .print-page-merge-button, body.print-ready .print-page-delete-button{border:1px solid var(--print-editor-border);border-radius:999px;padding:8px 12px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 12px 20px rgba(4,6,10,0.22);}',
      '  body.print-ready .print-page-delete-button{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.28);}',
      '  body.print-ready .print-page-action-group button:disabled{cursor:not-allowed;opacity:0.52;box-shadow:none;background:rgba(255,255,255,0.05);color:var(--print-ui-subtle);border-color:rgba(255,255,255,0.08);}',
      '  body.print-ready .pagedjs_page.print-selected-target .print-page-chrome-main{box-shadow:0 0 0 3px rgba(154,179,223,0.14), 0 14px 24px rgba(4,6,10,0.22);}',
      '  @media (max-width: 900px){body.print-ready .print-page-chrome{left:10px;right:10px;top:-14px;flex-direction:column;align-items:stretch;}body.print-ready .print-page-chrome-title, body.print-ready .print-page-chrome-meta{max-width:none;}body.print-ready .print-page-action-group{justify-content:flex-end;}}',
      '}',
      '@media print {',
      '  body.print-ready .print-page-chrome{display:none!important;}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function installEditorKeyboardShortcuts() {
    if (!document.body || document.body.dataset.printEditorShortcutsBound) return;
    document.body.dataset.printEditorShortcutsBound = 'true';
    document.addEventListener('keydown', function (event) {
      if (!event) return;
      var target = event.target;
      if (target && (
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(target.tagName || '')
      )) {
        return;
      }

      var key = String(event.key || '');
      var normalizedKey = key.toLowerCase();

      if (!event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && normalizedKey === 'z') {
        event.preventDefault();
        undoLastEdit();
        return;
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && event.shiftKey && key === 'Delete') {
        event.preventDefault();
        resetAllEdits({ uiSource: 'keyboard_reset_all' });
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (normalizedKey === 'e') {
        event.preventDefault();
        toggleEditorPanel();
        return;
      }

      if (!event.shiftKey && normalizedKey === 'r') {
        event.preventDefault();
        jumpToRecommendedItem();
        return;
      }

      if (!event.shiftKey && key === 'Delete') {
        if (deleteSelectedTarget('keyboard_delete')) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === 'Escape') {
        if (textEditModeEnabled) {
          setTextEditMode(false);
          updateEditorBannerStatus('텍스트 수정 모드를 종료했습니다');
        }
        if (editorUiState.open) {
          setEditorPanelOpen(false);
        }
      }
    });
  }

  function pagesRootReady() {
    return pagedRenderReady();
  }

  function bootstrapEditorUi() {
    if (editorUiBootstrapped) return true;
    if (!pagesRootReady()) return false;
    ensureEditorOverrideStyles();
    ensurePageChromeStyles();
    buildEditorPanel();
    installEditorKeyboardShortcuts();
    editorUiBootstrapped = true;
    syncEditorUiControls();
    refreshEditorList();
    refreshNavigatorOptions();
    scheduleDirectManipulationInstall();
    scheduleReloadFocusRestore();
    scheduleAutoOptimizeResume();
    return true;
  }

  function waitForPagedEditorUi() {
    if (bootstrapEditorUi()) return;

    [80, 180, 350, 700, 1400, 2600, 4200, 6500, 9000].forEach(function (delay) {
      setTimeout(function () {
        bootstrapEditorUi();
      }, delay);
    });

    if (editorBootstrapObserver) {
      editorBootstrapObserver.disconnect();
    }

    editorBootstrapObserver = new MutationObserver(function () {
      if (bootstrapEditorUi() && editorBootstrapObserver) {
        editorBootstrapObserver.disconnect();
        editorBootstrapObserver = null;
      }
    });

    editorBootstrapObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function refreshEditorList() {
    if (!editorList) return;
    editorList.innerHTML = '';
    var filterMode = sanitizeEditorFilter(editorUiState.filter || 'all');
    var candidates = sortedEditorCandidates().filter(function (candidate) {
      if (filterMode === 'recommended') return candidateHasOutstandingRecommendation(candidate);
      if (filterMode === 'changed') return candidateHasManualEdit(candidate);
      return true;
    });

    if (editorListMeta) {
      var totalCount = activeBreakCandidates().length;
      var filterLabel = filterMode === 'recommended' ? '추천만' : (filterMode === 'changed' ? '수정됨만' : '전체');
      editorListMeta.textContent = filterLabel + ' 보기 · ' + candidates.length + ' / ' + totalCount + '개';
    }

    if (!candidates.length) {
      var empty = document.createElement('div');
      empty.className = 'print-editor-empty';
      empty.textContent = filterMode === 'recommended'
        ? '지금은 남아 있는 추천 블록이 없습니다. 이미지 추천만 남았을 수도 있으니 추천으로 이동 버튼도 함께 확인해 보세요.'
        : (filterMode === 'changed'
          ? '아직 수동으로 조정한 블록이 없습니다.'
          : '편집할 수 있는 블록을 아직 찾지 못했습니다.');
      editorList.appendChild(empty);
      updateEditorUiSummary();
      return;
    }

    candidates.forEach(function (candidate) {
      var mode = candidateCurrentBreakMode(candidate);
      var recommendation = candidateRecommendation(candidate);
      var hasOutstandingRecommendation = candidateHasOutstandingRecommendation(candidate);
      var hasManualEdit = candidateHasManualEdit(candidate);
      var item = document.createElement('div');
      item.className = 'print-editor-item print-mode-' + mode;
      if (selectedTargetState.candidateId === candidate.id) item.classList.add('is-selected');
      if (hasOutstandingRecommendation) item.classList.add('is-recommended');
      if (hasManualEdit) item.classList.add('is-manual');

      var header = document.createElement('div');
      header.className = 'print-editor-item-header';

      var textWrap = document.createElement('div');
      var title = document.createElement('p');
      title.className = 'print-editor-item-label';
      title.textContent = candidate.label;
      textWrap.appendChild(title);

      var suggestionBadgeText = candidateSuggestionBadgeText(recommendation);
      if (suggestionBadgeText) {
        var suggestionBadge = document.createElement('span');
        suggestionBadge.className = 'print-editor-suggestion-badge';
        suggestionBadge.textContent = suggestionBadgeText;
        textWrap.appendChild(suggestionBadge);
      }

      var meta = document.createElement('p');
      meta.className = 'print-editor-item-meta';
      meta.textContent = candidateAutoLabel(candidate) + ' / ' + candidateManualLabel(candidate) + ' / ' + candidateSpaceLabel(candidate) + ' / ' + candidateGapLabel(candidate);
      textWrap.appendChild(meta);
      header.appendChild(textWrap);

      var jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'print-editor-item-jump';
      jump.textContent = '이동';
      jump.addEventListener('click', function () {
        jumpToCandidate(candidate);
      });
      header.appendChild(jump);
      item.appendChild(header);

      var controls = document.createElement('div');
      controls.className = 'print-editor-item-controls';
      [
        {
          label: '기본 흐름',
          active: mode === 'auto' && !candidatePullUpEnabled(candidate),
          suggested: false,
          reason: '',
          action: function () {
            setCandidateModeWithReload(candidate, 'auto', '페이지 시작 지정 해제 중…', 'editor_panel', 'break_toggle');
          }
        },
        {
          label: '앞에 붙이기',
          active: candidatePullUpEnabled(candidate),
          suggested: false,
          reason: '이 블록을 앞 내용과 이어 붙입니다',
          action: function () {
            pullCandidateUpWithReload(candidate, {
              status: '앞 내용과 이어 붙이는 중…',
              uiSource: 'editor_panel_pull_up',
              intent: 'pull_up_block'
            });
          }
        },
        {
          label: '여기서 시작',
          active: mode === 'force',
          suggested: !!(recommendation && recommendation.break && recommendation.break.mode === 'force'),
          reason: recommendation && recommendation.break ? (joinRecommendationReasons(recommendation.break) || recommendation.break.label) : '',
          action: function () {
            splitRenderedPageAtNode(findRenderedBreakNode(candidate) || candidate.node, { uiSource: 'editor_panel' });
          }
        }
      ].forEach(function (option) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        if (option.active) {
          button.classList.add('is-active');
        }
        if (option.suggested) {
          button.classList.add('is-suggested');
        }
        if (option.reason) {
          button.title = option.reason;
        }
        button.addEventListener('click', option.action);
        controls.appendChild(button);
      });
      item.appendChild(controls);

      var spacingControls = document.createElement('div');
      spacingControls.className = 'print-editor-item-controls';
      [
        { label: '공백 기본', value: 'auto' },
        { label: '좁게', value: 'tight' },
        { label: '넓게', value: 'wide' }
      ].forEach(function (option) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        if (sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || 'auto') === option.value) {
          button.classList.add('is-active');
        }
        button.addEventListener('click', function () {
          setCandidateSpaceMode(candidate, option.value, 'editor_panel');
        });
        spacingControls.appendChild(button);
      });
      item.appendChild(spacingControls);

      var utilityControls = document.createElement('div');
      utilityControls.className = 'print-editor-item-controls';
      [
        {
          label: '빈칸 +',
          action: function () { adjustCandidateGap(candidate, 1, 'editor_panel'); },
          suggested: !!(recommendation && recommendation.gap && recommendation.gap.units > 0),
          reason: recommendation && recommendation.gap ? (joinRecommendationReasons(recommendation.gap) || recommendation.gap.label) : ''
        },
        {
          label: '빈칸 -',
          action: function () { adjustCandidateGap(candidate, -1, 'editor_panel'); },
          suggested: false,
          reason: ''
        },
        {
          label: '삭제',
          action: function () { deleteCandidateNode(candidate); },
          suggested: false,
          reason: ''
        }
      ].forEach(function (option) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        if (option.suggested) {
          button.classList.add('is-suggested');
          if (option.reason) button.title = option.reason;
        }
        button.addEventListener('click', option.action);
        utilityControls.appendChild(button);
      });
      item.appendChild(utilityControls);
      editorList.appendChild(item);
    });

    updateEditorUiSummary();
  }

  function setCandidateMode(candidate, mode) {
    var nextMode = sanitizeBreakMode(mode);
    candidate.node.dataset.printBreakMode = nextMode;

    if (nextMode === 'auto') {
      delete breakOverrideMap[candidate.id];
    } else {
      breakOverrideMap[candidate.id] = nextMode;
      delete pullUpOverrideMap[candidate.id];
    }

    writeStoredBreakOverrides();
    writeStoredPullUpOverrides();
    applyResolvedBreakModes();
    refreshEditorList();
  }

  function setCandidateSpaceMode(candidate, mode, uiSource) {
    var nextMode = sanitizeSpaceMode(mode);
    var previousMode = sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || spaceOverrideMap[candidate.id] || 'auto');
    var renderedNode = findRenderedBreakNode(candidate) || candidate.node;
    pushHistorySnapshot('space-mode');
    logLearningAction('set_space_mode', {
      targetNode: renderedNode,
      candidateId: candidate.id,
      before: {
        space_mode: previousMode
      },
      after: {
        space_mode: nextMode
      },
      ui: {
        source: uiSource || 'editor_panel',
        suggestion_source: 'manual'
      },
      meta: buildRuntimeActionMeta(renderedNode, {
        effect: {
          requested_space_mode: nextMode
        }
      })
    });
    candidate.node.dataset.printSpaceMode = nextMode;

    if (nextMode === 'auto') {
      delete spaceOverrideMap[candidate.id];
    } else {
      spaceOverrideMap[candidate.id] = nextMode;
    }

    writeStoredSpaceOverrides();
    applyResolvedBreakModes();
    refreshEditorList();
  }

  function adjustCandidateGap(candidate, delta, uiSource) {
    var gapId = candidate && candidate.node && candidate.node.dataset ? (candidate.node.dataset.printBreakId || candidate.node.dataset.printPersistId || '') : '';
    if (!gapId) return;
    pushRenderedHistorySnapshot();
    pushHistorySnapshot('gap');
    var current = parseInt(manualGapMap[gapId] || '0', 10);
    var next = current + delta;
    var suggestionSource = suggestionSourceForGap(candidate, delta);
    var renderedNode = findRenderedBreakNode(candidate) || candidate.node;
    logLearningAction('adjust_gap', {
      targetNode: renderedNode,
      candidateId: candidate.id,
      before: {
        gap_units: current
      },
      after: {
        gap_units: next > 0 ? next : 0
      },
      ui: {
        source: uiSource || 'inline_button',
        suggestion_source: suggestionSource
      },
      meta: buildRuntimeActionMeta(renderedNode, {
        effect: {
          gap_delta: delta
        }
      })
    });
    if (next <= 0) {
      delete manualGapMap[gapId];
    } else {
      manualGapMap[gapId] = next;
    }
    writeStoredGaps();
    applyStoredManualGaps();
    refreshEditorList();
    updateEditorBannerStatus(delta > 0 ? '빈공간을 추가했습니다' : '빈공간을 제거했습니다');
  }

  function setFigureScale(figureId, level, uiSource) {
    if (!figureId) return;
    pushRenderedHistorySnapshot();
    pushHistorySnapshot('image-scale');
    var figure = persistedNodeById(figureId);
    var currentLevel = currentStoredImageScale(figureId);
    var nextLevel = sanitizeImageScale(level);
    var suggestionSource = suggestionSourceForImageScale(figureId, nextLevel);
    logLearningAction('set_image_scale', {
      targetNode: figure,
      persistId: figureId,
      nodeKind: 'image',
      before: {
        scale_pct: currentLevel
      },
      after: {
        scale_pct: nextLevel
      },
      ui: {
        source: uiSource || 'image_slider',
        suggestion_source: suggestionSource
      },
      meta: buildRuntimeActionMeta(figure, {
        effect: {
          scale_delta: nextLevel - currentLevel
        }
      })
    });
    if (nextLevel >= 100) {
      delete imageScaleMap[figureId];
    } else {
      imageScaleMap[figureId] = nextLevel;
    }
    writeStoredImageScales();
    applyStoredImageScales();
    updateEditorUiSummary();
    scheduleFigureToolStateRefresh([figure]);
    updateEditorBannerStatus(nextLevel < 100 ? '이미지 크기를 조정했습니다' : '이미지 크기를 기본값으로 복원했습니다');
  }

  function setFigureScalesBatch(updates, uiSource, statusMessage) {
    var normalizedUpdates = uniqueTruthyStrings((updates || []).map(function (entry) {
      return entry && entry.figureId ? String(entry.figureId) : '';
    })).map(function (figureId) {
      var match = (updates || []).find(function (entry) {
        return entry && String(entry.figureId || '') === figureId;
      }) || null;
      if (!match) return null;
      return {
        figureId: figureId,
        level: sanitizeImageScale(match.level)
      };
    }).filter(Boolean).filter(function (entry) {
      return currentStoredImageScale(entry.figureId) !== entry.level;
    });

    if (!normalizedUpdates.length) {
      updateEditorBannerStatus('선택한 이미지의 너비가 이미 맞춰져 있습니다');
      return;
    }

    pushRenderedHistorySnapshot();
    pushHistorySnapshot('image-scale-batch');
    var primaryFigure = persistedNodeById(normalizedUpdates[0].figureId);
    logLearningAction('set_image_scale_batch', {
      targetNode: primaryFigure,
      persistId: normalizedUpdates[0].figureId,
      nodeKind: 'image',
      before: {
        image_count: normalizedUpdates.length
      },
      after: {
        image_count: normalizedUpdates.length,
        scale_updates: normalizedUpdates.map(function (entry) {
          return {
            persist_id: entry.figureId,
            scale_pct: entry.level
          };
        })
      },
      ui: {
        source: uiSource || 'image_batch',
        suggestion_source: 'manual'
      },
      meta: buildRuntimeActionMeta(primaryFigure, {
        effect: {
          image_scale_batch: true,
          image_count: normalizedUpdates.length
        }
      })
    });

    normalizedUpdates.forEach(function (entry) {
      if (entry.level >= 100) {
        delete imageScaleMap[entry.figureId];
      } else {
        imageScaleMap[entry.figureId] = entry.level;
      }
    });

    writeStoredImageScales();
    applyStoredImageScales();
    updateEditorUiSummary();
    scheduleFigureToolStateRefresh(normalizedUpdates.map(function (entry) {
      return persistedNodeById(entry.figureId);
    }).filter(Boolean));
    updateEditorBannerStatus(statusMessage || ('선택한 이미지 ' + normalizedUpdates.length + '개의 너비를 맞췄습니다'));
  }

  function applyFigureWidthToSelection(figureId, targetWidthPx, uiSource) {
    var targetIds = imageSelectionTargetIds(figureId);
    if (!targetIds.length) {
      updateEditorBannerStatus('너비를 맞출 이미지를 먼저 선택하세요');
      return;
    }
    var updates = targetIds.map(function (targetId) {
      var figure = persistedNodeById(targetId);
      if (!figure) return null;
      return {
        figureId: targetId,
        level: targetScaleForFigureWidthPx(figure, targetWidthPx)
      };
    }).filter(Boolean);

    if (!updates.length) {
      updateEditorBannerStatus('선택한 이미지 너비를 계산하지 못했습니다');
      return;
    }

    setFigureScalesBatch(updates, uiSource || 'image_width_input', targetIds.length > 1 ? ('선택한 이미지 ' + targetIds.length + '개의 너비를 ' + Math.round(targetWidthPx) + 'px 기준으로 맞췄습니다') : '이미지 너비를 적용했습니다');
  }

  function unifySelectedImagesToFigure(figureId) {
    var figure = persistedNodeById(figureId);
    if (!figure) {
      updateEditorBannerStatus('기준 이미지를 찾지 못했습니다');
      return;
    }
    var targetIds = imageSelectionTargetIds(figureId);
    if (targetIds.length < 2) {
      updateEditorBannerStatus('먼저 너비를 맞출 이미지를 두 개 이상 선택하세요');
      return;
    }
    var renderedWidth = figureRenderedWidthPx(figure);
    if (!(renderedWidth > 0)) {
      updateEditorBannerStatus('기준 이미지 너비를 계산하지 못했습니다');
      return;
    }
    applyFigureWidthToSelection(figureId, renderedWidth, 'image_unify_from_current');
  }

  function stopImageResizeDrag(commit) {
    if (!imageResizeDragState) return;
    var state = imageResizeDragState;
    imageResizeDragState = null;
    document.body.classList.remove('print-image-resizing');
    if (!commit) {
      applyFigureScalePreview(state.figureId, state.startLevel);
      return;
    }
    if (state.previewLevel === state.startLevel) {
      applyFigureScalePreview(state.figureId, state.startLevel);
      if (directManipulationRefreshQueuedWhileDragging) {
        directManipulationRefreshQueuedWhileDragging = false;
        scheduleDirectManipulationRefresh(0);
      }
      return;
    }
    setFigureScale(state.figureId, state.previewLevel, 'image_drag');
    if (directManipulationRefreshQueuedWhileDragging) {
      directManipulationRefreshQueuedWhileDragging = false;
      scheduleDirectManipulationRefresh(0);
    }
  }

  function syncImageScaleSliderDragStateNodes() {
    if (!imageScaleSliderDragState) return null;
    var currentFigure = persistedNodeById(imageScaleSliderDragState.figureId) || imageScaleSliderDragState.figure;
    if (!currentFigure) return null;
    var currentSlider = currentFigure.querySelector('.print-image-scale-range') || imageScaleSliderDragState.slider;
    var currentValueNode = currentFigure.querySelector('.print-image-scale-value') || imageScaleSliderDragState.valueNode || null;
    imageScaleSliderDragState.figure = currentFigure;
    imageScaleSliderDragState.slider = currentSlider;
    imageScaleSliderDragState.valueNode = currentValueNode;
    return imageScaleSliderDragState;
  }

  function updateImageScaleSliderDrag(event) {
    if (!imageScaleSliderDragState || !event) return;
    if (typeof imageScaleSliderDragState.pointerId === 'number' && typeof event.pointerId === 'number' && event.pointerId !== imageScaleSliderDragState.pointerId) {
      return;
    }
    var state = syncImageScaleSliderDragStateNodes();
    if (!state || !state.slider || !state.figure) return;
    var sliderSpan = 100 - minimumImageScalePct;
    var sliderRect = state.slider.getBoundingClientRect ? state.slider.getBoundingClientRect() : null;
    var sliderWidthPx = sliderRect && sliderRect.width > 0 ? sliderRect.width : (state.sliderWidthPx || 1);
    var deltaRatio = (event.clientX - state.pointerLastX) / sliderWidthPx;
    var nextValue = sanitizeImageScale(state.lastLevel + (deltaRatio * sliderSpan));
    state.pointerLastX = event.clientX;
    state.sliderWidthPx = sliderWidthPx;
    state.lastLevel = nextValue;
    updateImageSliderVisual(state.slider, nextValue);
    if (state.valueNode) {
      state.valueNode.textContent = formatImageScaleLabel(nextValue);
    }
    setImageSliderDraggingState(state.figure, true);
    applyFigureScaleToFigure(state.figure, nextValue, { skipUi: true });
  }

  function stopImageScaleSliderDrag(commit, event) {
    if (!imageScaleSliderDragState) return;
    if (event && typeof imageScaleSliderDragState.pointerId === 'number' && typeof event.pointerId === 'number' && event.pointerId !== imageScaleSliderDragState.pointerId) {
      return;
    }
    var state = syncImageScaleSliderDragStateNodes() || imageScaleSliderDragState;
    imageScaleSliderDragState = null;
    setImageSliderDraggingState(state.figure, false);
    if (state.slider && state.slider.dataset) {
      delete state.slider.dataset.printScaleStart;
    }
    var nextValue = sanitizeImageScale(state.lastLevel);
    if (!commit || !(nextValue > 0)) {
      applyFigureScalePreview(state.figureId, state.startLevel);
      if (directManipulationRefreshQueuedWhileDragging) {
        directManipulationRefreshQueuedWhileDragging = false;
        scheduleDirectManipulationRefresh(0);
      }
      return;
    }
    if (Math.abs(nextValue - state.startLevel) < (imageScaleStepPct / 2)) {
      applyFigureScalePreview(state.figureId, state.startLevel);
      if (directManipulationRefreshQueuedWhileDragging) {
        directManipulationRefreshQueuedWhileDragging = false;
        scheduleDirectManipulationRefresh(0);
      }
      return;
    }
    setFigureScale(state.figureId, nextValue, state.uiSource || 'image_slider');
    if (directManipulationRefreshQueuedWhileDragging) {
      directManipulationRefreshQueuedWhileDragging = false;
      scheduleDirectManipulationRefresh(0);
    }
  }

  function beginImageScaleSliderDrag(event, figure, slider, valueNode, figureId) {
    if (!event || !figure || !slider || !figureId) return;
    event.preventDefault();
    event.stopPropagation();
    openImageToolPanel(figure);
    var storedStartLevel = currentStoredImageScale(figureId);
    var dragStartLevel = imageSliderValueFromPointer(slider, event);
    slider.dataset.printScaleStart = String(storedStartLevel);
    setImageSliderDraggingState(figure, true);
    imageScaleSliderDragState = {
      figure: figure,
      figureId: figureId,
      slider: slider,
      valueNode: valueNode || null,
      pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
      pointerLastX: event.clientX,
      sliderWidthPx: slider.getBoundingClientRect && slider.getBoundingClientRect().width > 0 ? slider.getBoundingClientRect().width : 1,
      startLevel: storedStartLevel,
      dragStartLevel: dragStartLevel,
      lastLevel: dragStartLevel,
      uiSource: 'image_slider'
    };
    updateImageScaleSliderDrag(event);
  }

  function beginImageResizeDrag(event, figure) {
    if (!event || !figure || !figure.dataset) return;
    var figureId = figure.dataset.printPersistId || '';
    if (!figureId) return;
    var renderedWidth = figureRenderedWidthPx(figure);
    if (!(renderedWidth > 0)) return;
    event.preventDefault();
    event.stopPropagation();
    openImageToolPanel(figure);
    setSelectedPersistedNode(figure, 'image', { silent: true });
    imageResizeDragState = {
      figureId: figureId,
      startLevel: currentStoredImageScale(figureId),
      previewLevel: currentStoredImageScale(figureId),
      startWidthPx: renderedWidth,
      pointerStartX: event.clientX
    };
    document.body.classList.add('print-image-resizing');
  }

  function updateImageResizeDrag(event) {
    if (!imageResizeDragState || !event) return;
    var figure = persistedNodeById(imageResizeDragState.figureId);
    if (!figure) return;
    var deltaX = event.clientX - imageResizeDragState.pointerStartX;
    var nextWidth = imageResizeDragState.startWidthPx + deltaX;
    var nextLevel = targetScaleForFigureWidthPx(figure, nextWidth);
    imageResizeDragState.previewLevel = nextLevel;
    applyFigureScalePreview(imageResizeDragState.figureId, nextLevel);
  }

  function nudgeFigureScale(figureId, delta) {
    var current = currentStoredImageScale(figureId);
    setFigureScale(figureId, current + (delta * 6), 'image_nudge');
  }

  function candidateIdsForPersistIds(persistIds) {
    var allowed = {};
    uniqueTruthyStrings(persistIds || []).forEach(function (persistId) {
      allowed[persistId] = true;
    });
    return uniqueTruthyStrings(breakCandidates.map(function (candidate) {
      var candidatePersistId = candidate && candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : '';
      return allowed[candidatePersistId] ? candidate.id : '';
    }));
  }

  function collectEditableIdsForPersistIds(persistIds) {
    return uniqueTruthyStrings(uniqueTruthyStrings(persistIds || []).reduce(function (ids, persistId) {
      return ids.concat(Array.from(document.querySelectorAll('[data-print-persist-id="' + persistId + '"] [data-print-edit-id], [data-print-persist-id="' + persistId + '"][data-print-edit-id]')).map(function (node) {
        return node && node.dataset ? node.dataset.printEditId || '' : '';
      }));
    }, []));
  }

  function clearStateForDeletedPersistIds(persistIds) {
    var removedPersistIds = uniqueTruthyStrings(persistIds || []);
    if (!removedPersistIds.length) return;
    var removedEditableIds = collectEditableIdsForPersistIds(removedPersistIds);

    breakCandidates.forEach(function (candidate) {
      var candidatePersistId = candidate && candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : '';
      if (removedPersistIds.indexOf(candidatePersistId) === -1) return;
      var gapKey = candidate && candidate.node && candidate.node.dataset ? (candidate.node.dataset.printBreakId || candidate.node.dataset.printPersistId || '') : '';
      if (gapKey) delete manualGapMap[gapKey];
      delete breakOverrideMap[candidate.id];
      delete spaceOverrideMap[candidate.id];
      delete pullUpOverrideMap[candidate.id];
    });

    removedPersistIds.forEach(function (persistId) {
      delete manualGapMap[persistId];
      delete imageScaleMap[persistId];
    });

    removedEditableIds.forEach(function (editId) {
      delete textOverrideMap[editId];
    });

    writeStoredBreakOverrides();
    writeStoredSpaceOverrides();
    writeStoredPullUpOverrides();
    writeStoredGaps();
    writeStoredImageScales();
    writeStoredTextOverrides();
  }

  function nextSelectionAfterDelete(node, persistId) {
    var currentCandidateId = node && node.getAttribute ? node.getAttribute('data-print-break-id') || '' : '';
    if (!currentCandidateId) {
      var fallbackCandidate = findCandidateByPersistId(persistId);
      currentCandidateId = fallbackCandidate ? fallbackCandidate.id : '';
    }
    var renderedCandidates = Array.from(document.querySelectorAll('.pagedjs_pages [data-print-break-id]'));
    var currentIndex = currentCandidateId ? renderedCandidates.findIndex(function (candidateNode) {
      return (candidateNode.getAttribute('data-print-break-id') || '') === currentCandidateId;
    }) : -1;

    var nextNode = currentIndex >= 0 ? renderedCandidates.slice(currentIndex + 1).find(function (candidateNode) {
      return (candidateNode.getAttribute('data-print-persist-id') || '') !== persistId;
    }) : null;
    var previousNode = currentIndex > 0 ? renderedCandidates.slice(0, currentIndex).reverse().find(function (candidateNode) {
      return (candidateNode.getAttribute('data-print-persist-id') || '') !== persistId;
    }) : null;
    return selectionForNode(nextNode || previousNode || null);
  }

  function removePersistedNodesFromRenderedPreview(persistIds) {
    var removedParents = [];
    uniqueTruthyStrings(persistIds || []).forEach(function (persistId) {
      Array.from(document.querySelectorAll('[data-print-persist-id="' + persistId + '"]')).forEach(function (target) {
        removedParents.push({
          parent: target.parentElement,
          pageRoot: closestRenderedPageNode(target)
        });
        target.remove();
      });
    });
    removedParents.forEach(function (entry) {
      if (!entry || !entry.parent) return;
      pruneEmptyAncestors(entry.parent, entry.pageRoot || renderedPagesRoot());
    });
  }

  function deletePersistedNodeLive(node, persistId, statusMessage, uiSource, nodeKindOverride) {
    if (!node || !persistId) return;
    var beforeLayout = snapshotRenderedLayout();
    var beforeMeta = buildRuntimeActionMeta(node, {
      document_before: {
        page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
      }
    });
    var nextSelection = nextSelectionAfterDelete(node, persistId);
    var removedCandidateIds = candidateIdsForPersistIds([persistId]);
    var anchorBefore = beforeMeta.viewport_before && beforeMeta.viewport_before.anchor ? beforeMeta.viewport_before.anchor : captureViewportAnchor({ preferredNode: node });
    pushRenderedHistorySnapshot();
    pushHistorySnapshot('delete-node');
    deletedNodeMap[persistId] = true;
    writeStoredDeletedNodes();
    clearStateForDeletedPersistIds([persistId]);
    removePersistedNodesFromRenderedPreview([persistId]);
    closeImageToolPanels();
    var removedPages = removeEmptyRenderedPages();
    renumberRenderedPages();
    installDirectPageManipulation();
    if (nextSelection) {
      setSelectedTarget(nextSelection, { silent: true });
    } else {
      clearSelectedTarget({ silent: true });
    }
    var preferredNode = currentSelectedRenderedNode() || resolveViewportAnchorNode(anchorBefore);
    restoreViewportAnchor(anchorBefore, preferredNode, {
      behavior: 'auto',
      highlight: false,
      offsetTopPx: anchorBefore && typeof anchorBefore.offset_top_px === 'number' ? anchorBefore.offset_top_px : 96
    });
    refreshNavigatorOptions();
    refreshEditorList();
    var afterLayout = snapshotRenderedLayout();
    logLearningAction('delete_node', {
      targetNode: node,
      persistId: persistId,
      candidateId: removedCandidateIds[0] || '',
      pageNumber: beforeMeta.page_before && beforeMeta.page_before.page_number ? beforeMeta.page_before.page_number : 0,
      nodeKind: nodeKindOverride || learningNodeKind(node),
      before: {
        exists: true,
        page_number: beforeMeta.page_before && beforeMeta.page_before.page_number ? beforeMeta.page_before.page_number : 0
      },
      after: {
        deleted: true,
        page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length,
        replacement_candidate_id: nextSelection && nextSelection.candidateId ? nextSelection.candidateId : '',
        replacement_persist_id: nextSelection && nextSelection.persistId ? nextSelection.persistId : ''
      },
      ui: {
        source: uiSource || 'editor_panel',
        suggestion_source: 'manual'
      },
      meta: Object.assign({}, beforeMeta, {
        viewport_after: captureViewportMetrics(preferredNode),
        focus_after: currentSelectedTarget(),
        target_after: captureRenderedNodePosition(preferredNode),
        page_after: captureRenderedPageSnapshot(closestRenderedPageNode(preferredNode)),
        effect: {
          deleted_persist_ids: [persistId],
          removed_candidate_ids: removedCandidateIds,
          removed_page_numbers: removedPages,
          layout_effect: diffRenderedLayouts(beforeLayout, afterLayout)
        }
      })
    });
    updateEditorBannerStatus(statusMessage || '요소를 삭제했습니다');
    return true;
  }

  function deleteCandidateNode(candidate, uiSource) {
    var persistId = candidate && candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId : '';
    if (!persistId) return false;
    return deletePersistedNodeLive(findRenderedBreakNode(candidate) || candidate.node, persistId, '요소를 삭제했습니다', uiSource || 'editor_panel', 'block');
  }

  function deleteSelectedTarget(uiSource) {
    var selection = currentSelectedTarget();
    if (selection.kind === 'page' && selection.page_number) {
      updateEditorBannerStatus('페이지 조작은 페이지 헤더의 버튼에서 처리하세요');
      return false;
    }
    if (!selection.has_selection) {
      updateEditorBannerStatus('먼저 삭제할 블록을 선택하세요');
      return false;
    }
    if (selection.kind === 'image' && selection.persist_id) {
      var imageNode = persistedNodeById(selection.persist_id);
      if (!imageNode) {
        clearSelectedTarget({ silent: true });
        return false;
      }
      return deletePersistedNodeLive(imageNode, selection.persist_id, '이미지를 삭제했습니다', uiSource || 'keyboard_delete', 'image');
    }
    var candidate = selection.candidate_id ? findCandidateById(selection.candidate_id) : findCandidateByPersistId(selection.persist_id);
    if (!candidate) {
      var fallbackNode = selection.persist_id ? persistedNodeById(selection.persist_id) : null;
      if (!fallbackNode || !selection.persist_id) {
        clearSelectedTarget({ silent: true });
        updateEditorBannerStatus('선택한 블록을 찾지 못했습니다');
        return false;
      }
      return deletePersistedNodeLive(fallbackNode, selection.persist_id, '요소를 삭제했습니다', uiSource || 'keyboard_delete', 'block');
    }
    return deleteCandidateNode(candidate, uiSource || 'keyboard_delete');
  }

  function buildEditorPanel() {
    if (document.querySelector('.print-editor-banner')) {
      editorBanner = document.querySelector('.print-editor-banner');
      editorLauncher = document.querySelector('.print-editor-launcher');
      editorPanel = document.querySelector('.print-editor-panel');
      editorBannerSummary = document.querySelector('.print-editor-banner-summary');
      editorPanelSummary = document.querySelector('.print-editor-summary');
      editorListMeta = document.querySelector('.print-editor-list-meta');
      editorList = document.querySelector('.print-editor-list');
      editorPageSelect = document.querySelector('[data-editor-role="page-select"]');
      editorBlockSelect = document.querySelector('[data-editor-role="block-select"]');
      editorFontSelect = document.querySelector('[data-editor-role="font-select"]');
      editorSpacingSelect = document.querySelector('[data-editor-role="spacing-select"]');
      editorNote = document.querySelector('.print-editor-note');
      editorTextEditToggle = document.querySelector('[data-editor-role="text-edit-toggle"]');
      editorPanelToggleButton = document.querySelector('[data-editor-role="panel-toggle"]');
      editorBannerRecommendationButton = document.querySelector('[data-editor-role="jump-recommendation"]');
      syncEditorUiControls();
      refreshEditorList();
      return;
    }

    editorBanner = document.createElement('div');
    editorBanner.className = 'print-editor-banner';

    var bannerAutoOptimize = document.createElement('button');
    bannerAutoOptimize.type = 'button';
    bannerAutoOptimize.className = 'print-editor-banner-button is-primary';
    bannerAutoOptimize.textContent = '1. 자동 정리';
    bannerAutoOptimize.addEventListener('click', function () {
      startAutoOptimize('banner_auto_optimize');
    });
    editorBanner.appendChild(bannerAutoOptimize);

    var bannerUndo = document.createElement('button');
    bannerUndo.type = 'button';
    bannerUndo.className = 'print-editor-banner-button';
    bannerUndo.textContent = '되돌리기';
    bannerUndo.addEventListener('click', function () {
      undoLastEdit();
    });
    editorBanner.appendChild(bannerUndo);

    var bannerReset = document.createElement('button');
    bannerReset.type = 'button';
    bannerReset.className = 'print-editor-banner-button';
    bannerReset.textContent = '전체 초기화';
    bannerReset.title = '지금까지의 편집 내용을 기본 상태로 초기화';
    bannerReset.addEventListener('click', function () {
      resetAllEdits({ uiSource: 'banner_reset_all' });
    });
    editorBanner.appendChild(bannerReset);

    editorBannerRecommendationButton = document.createElement('button');
    editorBannerRecommendationButton.type = 'button';
    editorBannerRecommendationButton.className = 'print-editor-banner-button';
    editorBannerRecommendationButton.setAttribute('data-editor-role', 'jump-recommendation');
    editorBannerRecommendationButton.textContent = '2. 문제 위치';
    editorBannerRecommendationButton.addEventListener('click', function () {
      jumpToRecommendedItem();
    });
    editorBanner.appendChild(editorBannerRecommendationButton);

    editorPanelToggleButton = document.createElement('button');
    editorPanelToggleButton.type = 'button';
    editorPanelToggleButton.className = 'print-editor-banner-button';
    editorPanelToggleButton.setAttribute('data-editor-role', 'panel-toggle');
    editorPanelToggleButton.textContent = '3. 블록 조정';
    editorPanelToggleButton.addEventListener('click', function () {
      toggleEditorPanel();
    });
    editorBanner.appendChild(editorPanelToggleButton);

    var bannerPrint = document.createElement('button');
    bannerPrint.type = 'button';
    bannerPrint.className = 'print-editor-banner-button';
    bannerPrint.textContent = '바로 인쇄';
    bannerPrint.addEventListener('click', function () {
      window.print();
    });
    editorBanner.appendChild(bannerPrint);

    editorBannerSummary = document.createElement('div');
    editorBannerSummary.className = 'print-editor-banner-summary';
    editorBanner.appendChild(editorBannerSummary);

    var bannerStatus = document.createElement('span');
    bannerStatus.className = 'print-editor-banner-status';
    bannerStatus.textContent = '블록을 눌러 앞에 붙이기 또는 여기서 시작으로 직접 맞추세요';
    editorBanner.appendChild(bannerStatus);
    document.body.insertBefore(editorBanner, document.body.firstChild);

    editorLauncher = document.createElement('button');
    editorLauncher.type = 'button';
    editorLauncher.className = 'print-editor-launcher';
    editorLauncher.textContent = '블록 조정 (E)';
    editorLauncher.addEventListener('click', function () {
      toggleEditorPanel();
    });
    document.body.appendChild(editorLauncher);

    editorPanel = document.createElement('aside');
    editorPanel.className = 'print-editor-panel';

    var header = document.createElement('div');
    header.className = 'print-editor-header';

    var titleWrap = document.createElement('div');
    var title = document.createElement('h2');
    title.className = 'print-editor-title';
    title.textContent = '블록 조정';
    titleWrap.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.className = 'print-editor-subtitle';
    subtitle.textContent = '자동 정리는 초안만 잡습니다. 실제 수정은 블록마다 앞에 붙이기, 여기서 시작, 빈칸 조정으로 직접 맞추세요. E: 열기, R: 문제 위치, Ctrl/Cmd+Z: 되돌리기, Shift+Delete: 전체 초기화, Esc: 닫기.';
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'print-editor-close';
    closeButton.textContent = '닫기';
    closeButton.addEventListener('click', function () {
      setEditorPanelOpen(false);
    });
    header.appendChild(closeButton);
    editorPanel.appendChild(header);

    editorPanelSummary = document.createElement('div');
    editorPanelSummary.className = 'print-editor-summary';
    editorPanel.appendChild(editorPanelSummary);

    var filterBar = document.createElement('div');
    filterBar.className = 'print-editor-filter-bar';
    [
      { key: 'all', label: '전체' },
      { key: 'recommended', label: '추천만' },
      { key: 'changed', label: '수정됨' }
    ].forEach(function (filter) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'print-editor-filter-button';
      button.textContent = filter.label;
      button.addEventListener('click', function () {
        setEditorFilterMode(filter.key);
      });
      editorFilterButtons[filter.key] = button;
      filterBar.appendChild(button);
    });
    editorPanel.appendChild(filterBar);

    var actions = document.createElement('div');
    actions.className = 'print-editor-actions';

    var focusRecommendationButton = document.createElement('button');
    focusRecommendationButton.type = 'button';
    focusRecommendationButton.className = 'print-editor-primary';
    focusRecommendationButton.textContent = '문제 위치';
    focusRecommendationButton.addEventListener('click', function () {
      jumpToRecommendedItem();
    });
    actions.appendChild(focusRecommendationButton);

    var applyRecommendationButton = document.createElement('button');
    applyRecommendationButton.type = 'button';
    applyRecommendationButton.className = 'print-editor-primary';
    applyRecommendationButton.textContent = '자동 정리';
    applyRecommendationButton.addEventListener('click', function () {
      startAutoOptimize('panel_auto_optimize');
    });
    actions.appendChild(applyRecommendationButton);

    var panelRefresh = document.createElement('button');
    panelRefresh.type = 'button';
    panelRefresh.textContent = '다시 계산';
    panelRefresh.addEventListener('click', function () {
      reloadWithPreservedFocus({ intent: 'refresh_preview', actionEventId: '' });
    });
    actions.appendChild(panelRefresh);

    editorTextEditToggle = document.createElement('button');
    editorTextEditToggle.type = 'button';
    editorTextEditToggle.setAttribute('data-editor-role', 'text-edit-toggle');
    editorTextEditToggle.textContent = '텍스트 수정';
    editorTextEditToggle.addEventListener('click', function () {
      var nextEnabled = !textEditModeEnabled;
      setTextEditMode(nextEnabled);
      updateEditorBannerStatus(nextEnabled ? '텍스트 수정 모드를 시작했습니다' : '텍스트 수정 모드를 종료했습니다');
    });
    actions.appendChild(editorTextEditToggle);

    var panelUndo = document.createElement('button');
    panelUndo.type = 'button';
    panelUndo.textContent = '되돌리기';
    panelUndo.addEventListener('click', function () {
      undoLastEdit();
    });
    actions.appendChild(panelUndo);

    var panelReset = document.createElement('button');
    panelReset.type = 'button';
    panelReset.textContent = '전체 초기화';
    panelReset.addEventListener('click', function () {
      resetAllEdits({ uiSource: 'panel_reset_all' });
    });
    actions.appendChild(panelReset);

    editorPanel.appendChild(actions);

    editorNote = document.createElement('p');
    editorNote.className = 'print-editor-note';
    editorPanel.appendChild(editorNote);

    var navigator = document.createElement('div');
    navigator.className = 'print-editor-navigator';

    var pageField = document.createElement('label');
    pageField.className = 'print-editor-field';
    var pageLabel = document.createElement('span');
    pageLabel.className = 'print-editor-field-label';
    pageLabel.textContent = '페이지 이동';
    pageField.appendChild(pageLabel);
    editorPageSelect = document.createElement('select');
    editorPageSelect.className = 'print-editor-select';
    editorPageSelect.setAttribute('data-editor-role', 'page-select');
    pageField.appendChild(editorPageSelect);
    navigator.appendChild(pageField);

    var pageJumpButton = document.createElement('button');
    pageJumpButton.type = 'button';
    pageJumpButton.className = 'print-editor-secondary';
    pageJumpButton.textContent = '페이지 이동';
    pageJumpButton.addEventListener('click', function () {
      jumpToSelectedPage();
    });
    navigator.appendChild(pageJumpButton);

    var blockField = document.createElement('label');
    blockField.className = 'print-editor-field';
    var blockLabel = document.createElement('span');
    blockLabel.className = 'print-editor-field-label';
    blockLabel.textContent = '블록 이동';
    blockField.appendChild(blockLabel);
    editorBlockSelect = document.createElement('select');
    editorBlockSelect.className = 'print-editor-select';
    editorBlockSelect.setAttribute('data-editor-role', 'block-select');
    blockField.appendChild(editorBlockSelect);
    navigator.appendChild(blockField);

    var blockJumpButton = document.createElement('button');
    blockJumpButton.type = 'button';
    blockJumpButton.className = 'print-editor-secondary';
    blockJumpButton.textContent = '블록 이동';
    blockJumpButton.addEventListener('click', function () {
      jumpToSelectedBlock();
    });
    navigator.appendChild(blockJumpButton);
    editorPanel.appendChild(navigator);

    var viewControls = document.createElement('div');
    viewControls.className = 'print-editor-settings';

    var fontField = document.createElement('label');
    fontField.className = 'print-editor-field';
    var fontLabel = document.createElement('span');
    fontLabel.className = 'print-editor-field-label';
    fontLabel.textContent = '글자 크기';
    fontField.appendChild(fontLabel);
    editorFontSelect = document.createElement('select');
    editorFontSelect.className = 'print-editor-select';
    editorFontSelect.setAttribute('data-editor-role', 'font-select');
    [
      ['xsmall', '아주 작게'],
      ['small', '조금 작게'],
      ['normal', '기본'],
      ['large', '조금 크게'],
      ['xlarge', '크게']
    ].forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0];
      option.textContent = entry[1];
      editorFontSelect.appendChild(option);
    });
    editorFontSelect.addEventListener('change', function () {
      viewSettings.font = sanitizeViewFont(editorFontSelect.value);
      writeStoredViewSettings();
      applyViewSettings();
      syncEditorUiControls();
      updateEditorBannerStatus('글자 크기 보기를 조정했습니다');
    });
    fontField.appendChild(editorFontSelect);
    viewControls.appendChild(fontField);

    var spacingField = document.createElement('label');
    spacingField.className = 'print-editor-field';
    var spacingLabel = document.createElement('span');
    spacingLabel.className = 'print-editor-field-label';
    spacingLabel.textContent = '세로 간격';
    spacingField.appendChild(spacingLabel);
    editorSpacingSelect = document.createElement('select');
    editorSpacingSelect.className = 'print-editor-select';
    editorSpacingSelect.setAttribute('data-editor-role', 'spacing-select');
    [
      ['compact', '촘촘하게'],
      ['normal', '기본'],
      ['relaxed', '여유 있게'],
      ['airy', '넓게']
    ].forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0];
      option.textContent = entry[1];
      editorSpacingSelect.appendChild(option);
    });
    editorSpacingSelect.addEventListener('change', function () {
      viewSettings.spacing = sanitizeViewSpacing(editorSpacingSelect.value);
      writeStoredViewSettings();
      applyViewSettings();
      syncEditorUiControls();
      updateEditorBannerStatus('세로 간격 보기를 조정했습니다');
    });
    spacingField.appendChild(editorSpacingSelect);
    viewControls.appendChild(spacingField);
    editorPanel.appendChild(viewControls);

    editorListMeta = document.createElement('p');
    editorListMeta.className = 'print-editor-list-meta';
    editorPanel.appendChild(editorListMeta);

    editorList = document.createElement('div');
    editorList.className = 'print-editor-list';
    editorPanel.appendChild(editorList);

    document.body.appendChild(editorPanel);
    syncEditorUiControls();
    refreshEditorList();
  }

  function markerSymbolForListItem(li) {
    var styleType = (li.style && li.style.listStyleType ? li.style.listStyleType : '').trim();
    if (!styleType) {
      var inlineStyle = li.getAttribute('style') || '';
      var match = inlineStyle.match(/list-style-type:\s*([^;]+)/i);
      if (match) styleType = match[1].trim();
    }
    if (styleType === 'circle') return '\u25E6';
    if (styleType === 'square') return '\u25AA';
    return '\u2022';
  }

  function findBulletMarkerTarget(li) {
    var directText = directChildByClass(li, 'print-inline-block');
    if (directText) return directText;

    var directNumberedPair = directChildByClass(li, 'print-numbered-step-pair');
    if (directNumberedPair) {
      var numberedText = directChildByClass(directNumberedPair, 'print-inline-block');
      if (numberedText) return numberedText;
      return Array.from(directNumberedPair.querySelectorAll('p, div.print-inline-block')).find(function (child) {
        return !containsFigureDescendant(child);
      }) || null;
    }

    var directPair = directChildByClass(li, 'print-figure-pair');
    if (directPair) {
      var pairText = directChildByClass(directPair, 'print-inline-block');
      if (pairText) return pairText;
      return Array.from(directPair.children || []).find(function (child) {
        return child.tagName === 'P';
      }) || null;
    }

    return Array.from(li.children || []).find(function (child) {
      return child.tagName === 'P';
    }) || null;
  }

  pullUpOverrideMap = readStoredPullUpOverrides();

  Array.from(document.querySelectorAll('p')).forEach(function (p) {
    var text = (p.textContent || '').replace(/\u00a0/g, ' ').trim();
    var meaningfulChild = Array.from(p.children).some(function (child) {
      return child.tagName !== 'BR';
    });
    if (!text && !meaningfulChild) {
      p.remove();
    }
  });

  var pageBody = document.querySelector('.page-body');
  var headings = Array.from(document.querySelectorAll('.page-body [data-print-block-type="section_heading"], .page-body h1:not(.page-title), .page-body h2, .page-body h3'));
  if (headings.length > 0) {
    headings[0].classList.add('print-first-section');
  }

  if (pageBody && headings.length > 0) {
    headings.forEach(function (heading, index) {
      var headingBlock = blockContractNode(heading) || heading.parentElement;
      if (!headingBlock || headingBlock.parentElement !== pageBody) return;

      var section = document.createElement('section');
      section.className = 'print-section';

      pageBody.insertBefore(section, headingBlock);

      var cursor = headingBlock;
      while (cursor) {
        var next = cursor.nextSibling;
        var containsNextHeading = next && (
          (next.matches && next.matches(sectionHeadingSelector())) ||
          (next.querySelector && next.querySelector(sectionHeadingSelector()))
        );
        section.appendChild(cursor);
        if (!next || containsNextHeading) break;
        cursor = next;
      }
    });
  }

  flattenDetailsBlocks();
  wrapStandaloneTables();

  Array.from(document.querySelectorAll('.print-appendix-block')).forEach(function (details) {
    var shortcutLists = Array.from(details.querySelectorAll(':scope > .indented > ol.numbered-list, :scope > .indented > div > ol.numbered-list'));
    shortcutLists.forEach(function (list, index) {
      var block = list.parentElement && list.parentElement.tagName === 'DIV' ? list.parentElement : list;
      if (!block) return;
      block.classList.add('print-shortcut-block');
      if (index === 0) {
        block.classList.add('print-shortcut-first');
      }
    });
  });

  Array.from(document.querySelectorAll('li')).forEach(function (li) {
    var wrappedLeadingText = wrapLeadingTextNodes(li, 'print-inline-block');
    var parentList = li.parentElement;
    var isNumberedList = parentList && parentList.matches && parentList.matches('ol.numbered-list');
    if (wrappedLeadingText && isNumberedList) {
      wrappedLeadingText.classList.add('print-major-title');
      li.classList.add('print-major-item');
    }

    if (li.querySelector('figure.image')) {
      li.classList.add('print-breakable-item');
    }

    if (li.querySelector('table.simple-table, table.collection-content, table')) {
      li.classList.add('print-table-item');
    }

    if (li.querySelector('ul.bulleted-list')) {
      li.classList.add('print-nested-bullet-group');
    }
  });

  Array.from(document.querySelectorAll('ol.numbered-list > li.print-major-item')).forEach(function (li) {
    var title = directChildByClass(li, 'print-major-title');
    if (!title || title.querySelector('.print-major-number')) return;
    if (isNumberedStepText(title.textContent || '')) return;
    var siblings = Array.from(li.parentElement.children).filter(function (node) {
      return node.tagName === 'LI';
    });
    var start = parseInt(li.parentElement.getAttribute('start') || '1', 10);
    if (isNaN(start)) start = 1;
    var itemNumber = start + siblings.indexOf(li);
    li.setAttribute('data-print-major-number', String(itemNumber));
    var marker = document.createElement('span');
    marker.className = 'print-major-number';
    marker.textContent = itemNumber + '.';
    title.insertBefore(marker, title.firstChild);
    title.insertBefore(document.createTextNode(' '), marker.nextSibling);
  });

  Array.from(document.querySelectorAll('li.print-major-item')).forEach(function (li) {
    var title = directChildByClass(li, 'print-major-title');
    if (!title) return;
    var siblings = [];
    var cursor = title.nextSibling;
    while (cursor) {
      var next = cursor.nextSibling;
      siblings.push(cursor);
      cursor = next;
    }
    if (!siblings.length) return;
    var body = document.createElement('div');
    body.className = 'print-major-body';
    li.insertBefore(body, siblings[0]);
    siblings.forEach(function (node) {
      body.appendChild(node);
    });
  });

  if (pageBody) {
    pullTrailingInlineNodesAheadOfFigures(pageBody);
    pairFigureBlocks(pageBody);
    pairNumberedStepBlocks(pageBody);
  }

  splitMultiBlockBulletItems();
  splitIndentedFlowSegments();

  Array.from(document.querySelectorAll('ul.bulleted-list > li')).forEach(function (li) {
    if (isNumberedStepText(li.textContent || '')) {
      li.classList.add('print-bulletless-item');
    }

    var markerTarget = findBulletMarkerTarget(li);
    if (li.classList.contains('print-bulletless-item')) return;
    if (!markerTarget) return;
    if (markerTarget.querySelector && markerTarget.querySelector('.print-bullet-marker')) return;

    if (isNumberedStepText(markerTarget.textContent || '')) {
      li.classList.add('print-bulletless-item');
      return;
    }

    li.classList.add('print-bullet-item');
    var marker = document.createElement('span');
    marker.className = 'print-bullet-marker';
    marker.textContent = markerSymbolForListItem(li);
    markerTarget.insertBefore(marker, markerTarget.firstChild);
    markerTarget.insertBefore(document.createTextNode(' '), marker.nextSibling);
  });

  annotateEditableNodes();
  markSplitBlocks();
  clearLegacyOrderStorage();
  textOverrideMap = readStoredTextOverrides();
  deletedNodeMap = readStoredDeletedNodes();
  manualGapMap = readStoredGaps();
  imageScaleMap = readStoredImageScales();
  applyStoredTextOverrides();
  applyStoredDeletedNodes();
  annotateListBreakRoots();
  viewSettings = readStoredViewSettings();
  ensurePaginationStyles();
  applyViewSettings();
  applyUiMode(resolveUiMode());
  watchPagedRenderReady();
  if (pagedRenderReady()) {
    handlePagedRenderReady();
  }
  editorUiState = readStoredEditorUiState();
  breakOverrideMap = readStoredBreakOverrides();
  spaceOverrideMap = readStoredSpaceOverrides();
  pullUpOverrideMap = readStoredPullUpOverrides();
  registerBreakCandidates();
  applyStoredManualGaps();
  applyStoredImageScales();
  breakCandidates.forEach(function (candidate) {
    candidate.node.dataset.printBreakMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
    candidate.node.dataset.printSpaceMode = sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || spaceOverrideMap[candidate.id] || 'auto');
  });
  applyConditionalPageStarts();
  waitForPagedEditorUi();
  window.addEventListener('scroll', schedulePageSidebarSync, { passive: true });
  window.addEventListener('resize', refreshPageSidebar);
  window.addEventListener('load', function () {
    waitForPagedEditorUi();
    refreshPageSidebar();
  });
  } catch (error) {
    showRuntimeFailure((error && error.message) || String(error));
    throw error;
  }
})();
