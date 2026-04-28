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
  var editorSearchInput = null;
  var editorSearchMeta = null;
  var editorSearchResults = null;
  var editorFontSelect = null;
  var editorSpacingSelect = null;
  var editorPanel = null;
  var editorLauncher = null;
  var editorPanelToggleButton = null;
  var editorBannerRecommendationButton = null;
  var editorBannerTextEditToggle = null;
  var editorBannerTitleNode = null;
  var editorBannerSubtitleNode = null;
  var editorBannerModeNode = null;
  var editorBannerSummary = null;
  var editorPanelSummary = null;
  var editorListMeta = null;
  var editorNote = null;
  var editorTextEditToggle = null;
  var editorFilterButtons = {};
  var editorUiState = { open: true, filter: 'all' };
  var editorSearchQuery = '';
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
  var pageSidebarForceSyncRequested = false;
  var pageSidebarActivePageNumber = '';
  var pageSidebarRefreshTimer = null;
  var pageSidebarEmptyAttemptCount = 0;
  var pagedReadyObserver = null;
  var pageSidebarHydrationTimer = null;
  var pageSidebarHydrationVersion = 0;
  var pageSidebarStructureKey = '';
  var mergedTocInteractionBound = false;
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
  var manifestUiDefaultMode = 'full';
  var uiMode = 'full';
  var selectedTargetState = { kind: '', candidateId: '', persistId: '', pageNumber: 0 };
  var selectedImageIds = [];
  var imageScaleSliderDragState = null;
  var figureToolRefreshScheduled = false;
  var pendingFigureToolRefreshIds = {};
  var hoverToolCloseTimers = typeof WeakMap === 'function' ? new WeakMap() : null;
  var pointerActivatedControls = typeof WeakMap === 'function' ? new WeakMap() : null;
  var listBreakRootCounter = 0;
  var queuedReloadNotice = '';
  var storedRenderedLayoutApplied = false;
  var viewportInteractionLocked = false;
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
    manifestUiDefaultMode = /^(full|minimal)$/.test(String(manifest.ui_default_mode || '')) ? String(manifest.ui_default_mode) : 'full';
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
    return manifestUiDefaultMode || 'full';
  }

  function sidebarFeatureDisabled() {
    // The left page sidebar has been retired. Keep it disabled so stale toggle
    // controls do not appear in older generated outputs.
    return true;
  }

  function applyUiMode(mode) {
    uiMode = /^(full|minimal)$/.test(String(mode || '')) ? String(mode) : 'full';
    if (document.body) {
      document.body.classList.toggle('print-ui-minimal', uiMode === 'minimal');
      document.body.classList.toggle('print-ui-full', uiMode === 'full');
    }
    pruneEditorBannerForMinimalMode();
  }

  function editorDocumentTitleText() {
    var titleNode = document.querySelector('.page-title');
    var text = titleNode ? String(titleNode.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (text) return text;
    if (manifestOutputName) return manifestOutputName;
    return 'Untitled document';
  }

  function editorVariantLabelText() {
    var bits = [];
    if (manifestIsCompactVariant) {
      bits.push('COMPACT');
    } else if (manifestVariantName) {
      bits.push('PRINT');
    }
    if (/fast/i.test(String(manifestVariantName || ''))) {
      bits.push('FAST');
    } else if (document.querySelector('.pagedjs_pages')) {
      bits.push('PAGED');
    } else {
      bits.push('FLOW');
    }
    return uniqueNonEmptyStrings(bits).join(' · ') || 'EDITOR';
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
      var defaultOpen = uiMode === 'full';
      return {
        open: defaultOpen,
        filter: sanitizeEditorFilter(stored.filter || 'all')
      };
    } catch (error) {
      return {
        open: uiMode === 'full',
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

  function hasReloadFocusNavigationToken() {
    try {
      return !!(new URL(window.location.href)).searchParams.get('np_reload');
    } catch (error) {
      return /(?:\?|&)np_reload=/.test(String(window.location.search || ''));
    }
  }

  function currentViewportScrollTop() {
    return Math.max(0, window.scrollY || window.pageYOffset || 0);
  }

  function lockViewportInteractionIfNeeded() {
    if (viewportInteractionLocked) return true;
    if (currentViewportScrollTop() > 24) {
      viewportInteractionLocked = true;
    }
    return viewportInteractionLocked;
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

  function recommendationRuntime() {
    return null;
  }

  function logLearningAction(actionType, payload) {
    return '';
  }

  function flushLearningEvents(useBeacon) {
    return;
  }

  function lastLearningActionEventId() {
    return '';
  }

  function persistedNodeById(persistId) {
    if (!persistId) return null;
    var renderedRoot = ensureRenderedPagesRoot();
    return (renderedRoot && renderedRoot.querySelector ? renderedRoot.querySelector('[data-print-persist-id="' + persistId + '"]') : null) ||
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
    if (!node || node.nodeType !== 1 || !node.closest) return null;
    var contractNode = node.hasAttribute && node.hasAttribute('data-print-persist-id') ? node : node.closest('[data-print-persist-id]');
    if (!contractNode || !contractNode.dataset) return null;
    return {
      contract_node: contractNode,
      persist_id: contractNode.dataset.printPersistId || '',
      block_type: contractNode.dataset.printBlockType || '',
      block_role: contractNode.dataset.printBlockRole || '',
      label: contractNode.dataset.printBlockLabel || '',
      atomic: contractNode.dataset.printAtomic === 'true'
    };
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
      return '새 페이지';
    }
    if (recommendation.gap && recommendation.gap.units > 0) {
      return '빈칸 +' + recommendation.gap.units;
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

  function clearHoverToolCloseTimer(node) {
    if (!node) return;
    if (hoverToolCloseTimers) {
      var mappedTimer = hoverToolCloseTimers.get(node);
      if (mappedTimer) {
        clearTimeout(mappedTimer);
        hoverToolCloseTimers.delete(node);
      }
      return;
    }
    if (node.__printHoverToolCloseTimer) {
      clearTimeout(node.__printHoverToolCloseTimer);
      node.__printHoverToolCloseTimer = 0;
    }
  }

  function setHoverToolCloseTimer(node, timerId) {
    if (!node) return;
    if (hoverToolCloseTimers) {
      if (timerId) {
        hoverToolCloseTimers.set(node, timerId);
      } else {
        hoverToolCloseTimers.delete(node);
      }
      return;
    }
    node.__printHoverToolCloseTimer = timerId || 0;
  }

  function hostMatchesInteractiveHoverState(node) {
    if (!node || !node.matches) return false;
    try {
      return node.matches(':hover') || node.matches(':focus-within');
    } catch (error) {
      return false;
    }
  }

  function setHoverToolClass(node, className, active) {
    if (!node || !node.classList) return;
    clearHoverToolCloseTimer(node);
    node.classList.toggle(className, !!active);
  }

  function scheduleHoverToolClassRemoval(node, className, delay) {
    if (!node || !node.classList) return;
    clearHoverToolCloseTimer(node);
    var timerId = setTimeout(function () {
      setHoverToolCloseTimer(node, 0);
      if (hostMatchesInteractiveHoverState(node)) return;
      if (className === 'print-image-tools-hover' && node.classList.contains('print-image-slider-active')) return;
      node.classList.remove(className);
      if (className === 'print-image-tools-hover' && !hostMatchesInteractiveHoverState(node)) {
        node.classList.remove('print-image-tools-open');
      }
    }, typeof delay === 'number' ? delay : 80);
    setHoverToolCloseTimer(node, timerId);
  }

  function bindHoverToolState(host, className, targets) {
    if (!host || !host.dataset) return;
    var bindingKey = className === 'print-image-tools-hover' ? 'printImageHoverStateBound' : 'printHoverStateBound';
    if (!host.dataset[bindingKey]) {
      host.dataset[bindingKey] = 'true';
      host.addEventListener('pointerenter', function () {
        setHoverToolClass(host, className, true);
      });
      host.addEventListener('pointerleave', function () {
        scheduleHoverToolClassRemoval(host, className, 80);
      });
      host.addEventListener('focusin', function () {
        setHoverToolClass(host, className, true);
      });
      host.addEventListener('focusout', function () {
        scheduleHoverToolClassRemoval(host, className, 80);
      });
    }
    (targets || []).filter(Boolean).forEach(function (target) {
      if (!target.dataset) return;
      if (target.dataset.printHoverStateBound === 'true') return;
      target.dataset.printHoverStateBound = 'true';
      target.addEventListener('pointerenter', function () {
        setHoverToolClass(host, className, true);
      });
      target.addEventListener('pointerleave', function () {
        scheduleHoverToolClassRemoval(host, className, 80);
      });
      target.addEventListener('focusin', function () {
        setHoverToolClass(host, className, true);
      });
      target.addEventListener('focusout', function () {
        scheduleHoverToolClassRemoval(host, className, 80);
      });
    });
  }

  function rememberPointerActivatedControl(control) {
    if (!control) return;
    var activatedAt = Date.now();
    if (pointerActivatedControls) {
      pointerActivatedControls.set(control, activatedAt);
      return;
    }
    control.__printPointerActivatedAt = activatedAt;
  }

  function consumeRecentPointerActivation(control, maxAgeMs) {
    if (!control) return false;
    var activatedAt = null;
    if (pointerActivatedControls) {
      activatedAt = pointerActivatedControls.get(control);
      pointerActivatedControls.delete(control);
    } else {
      activatedAt = control.__printPointerActivatedAt || 0;
      control.__printPointerActivatedAt = 0;
    }
    if (typeof activatedAt !== 'number' || !(activatedAt > 0)) return false;
    return (Date.now() - activatedAt) <= (typeof maxAgeMs === 'number' ? maxAgeMs : 700);
  }

  function releasePointerFocusIfNeeded(control, host, className) {
    if (!consumeRecentPointerActivation(control, 700)) return;
    setTimeout(function () {
      if (document.activeElement === control && typeof control.blur === 'function') {
        control.blur();
      }
      if (host && className && !hostMatchesInteractiveHoverState(host)) {
        scheduleHoverToolClassRemoval(host, className, 0);
      }
    }, 0);
  }

  function bindPointerFocusRelease(control, host, className) {
    if (!control || !control.addEventListener) return;
    if (control.dataset && control.dataset.printPointerFocusReleaseBound === 'true') return;
    if (control.dataset) {
      control.dataset.printPointerFocusReleaseBound = 'true';
    }
    control.addEventListener('pointerdown', function () {
      rememberPointerActivatedControl(control);
    });
    control.addEventListener('click', function () {
      releasePointerFocusIfNeeded(control, host, className);
    });
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
    Array.from(document.querySelectorAll('figure.image[data-print-persist-id]')).forEach(function (figure) {
      if (exceptFigure && figure === exceptFigure) return;
      clearHoverToolCloseTimer(figure);
      figure.classList.remove('print-image-tools-open');
      figure.classList.remove('print-image-tools-hover');
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
    if (!recommendation) return '추가 조정 없음';
    var parts = [];
    if (recommendation.break && recommendation.break.mode === 'force') {
      parts.push(recommendation.break.label);
    }
    if (recommendation.gap && recommendation.gap.units > 0) {
      parts.push(recommendation.gap.label);
    }
    return parts.length ? parts.join(', ') : '추가 조정 없음';
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
    renderEditorSearchResults();
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
    if (!hasReloadFocusNavigationToken()) {
      clearStoredReloadFocus();
      return false;
    }
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
    return labels.filter(Boolean).join(' · ');
  }

  function pagedRenderReady() {
    if (document.documentElement && document.documentElement.getAttribute('data-notion-printer-paged-ready') === 'true') {
      return true;
    }
    return actualRenderedPageNodes().length > 0;
  }

  function actualRenderedPageNodes() {
    return Array.from(document.querySelectorAll('.pagedjs_page')).filter(function (node) {
      return !!(node && node.nodeType === 1 && !(node.closest && node.closest('.print-page-sidebar')));
    });
  }

  function ensureRenderedPagesRoot() {
    var existing = document.querySelector('.pagedjs_pages');
    if (existing) return existing;

    var pages = actualRenderedPageNodes();
    if (!pages.length) return null;

    var parent = pages[0] && pages[0].parentElement ? pages[0].parentElement : null;
    if (!parent) return null;

    var sameParent = pages.every(function (pageNode) {
      return !!pageNode && pageNode.parentElement === parent;
    });
    if (!sameParent) return null;

    var wrapper = document.createElement('div');
    wrapper.className = 'pagedjs_pages';
    parent.insertBefore(wrapper, pages[0]);
    pages.forEach(function (pageNode) {
      wrapper.appendChild(pageNode);
    });
    return wrapper;
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
    pageSidebarStructureKey = '';
    pageSidebarForceSyncRequested = false;
    pageSidebarActivePageNumber = '';
    if (document.body) {
      document.body.classList.remove('print-page-sidebar-open');
    }
  }

  function mergedTocTargetNode(sectionId) {
    var safeSectionId = String(sectionId || '');
    if (!safeSectionId) return null;
    var pagesRoot = document.querySelector('.pagedjs_pages');
    if (!pagesRoot || !pagesRoot.querySelector) return null;
    return pagesRoot.querySelector('[data-merged-section-id="' + safeSectionId + '"]');
  }

  function mergedTocTargetPageNumber(sectionId) {
    var targetNode = mergedTocTargetNode(sectionId);
    var pageNode = closestRenderedPageNode(targetNode);
    if (!pageNode || !pageNode.getAttribute) return '';
    return String(pageNode.getAttribute('data-page-number') || '');
  }

  function refreshMergedTocPageNumbers() {
    var items = Array.from(document.querySelectorAll('[data-merged-toc-target]'));
    if (!items.length) return;
    var pageCache = {};
    items.forEach(function (item) {
      var sectionId = String(item.getAttribute('data-merged-toc-target') || '');
      if (!sectionId) return;
      if (typeof pageCache[sectionId] === 'undefined') {
        pageCache[sectionId] = mergedTocTargetPageNumber(sectionId);
      }
      var pageNumber = pageCache[sectionId];
      item.dataset.mergedTocPage = pageNumber || '';
      item.classList.toggle('is-unresolved', !pageNumber);
      var pageNode = item.querySelector('.print-merged-toc-page');
      if (pageNode) {
        pageNode.textContent = pageNumber || '--';
      }
    });
  }

  function focusMergedTocTarget(sectionId) {
    var targetNode = mergedTocTargetNode(sectionId);
    if (!targetNode || !targetNode.scrollIntoView) return false;
    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () {
      schedulePageSidebarSync(true);
    }, 40);
    return true;
  }

  function bindMergedTocInteractions() {
    if (mergedTocInteractionBound) return;
    mergedTocInteractionBound = true;
    document.addEventListener('click', function (event) {
      var item = event.target && event.target.closest ? event.target.closest('[data-merged-toc-target]') : null;
      if (!item) return;
      var sectionId = String(item.getAttribute('data-merged-toc-target') || '');
      if (!sectionId) return;
      if (focusMergedTocTarget(sectionId)) {
        event.preventDefault();
      }
    });
  }

  function handlePagedRenderReady() {
    if (document.body) {
      document.body.setAttribute('data-print-paged-output', 'true');
    }
    removePagedEditorChromeClones();
    resetPageSidebarDom();
    ensurePageSidebar();
    refreshPageSidebar();
    refreshMergedTocPageNumbers();
    [120, 400, 1200, 2400, 5200].forEach(function (delay) {
      setTimeout(function () {
        refreshPageSidebar();
        refreshMergedTocPageNumbers();
      }, delay);
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

  function bindPagedRenderReadyEvent() {
    if (!document.documentElement) return;
    if (document.documentElement.dataset.printPagedReadyEventBound === 'true') return;
    document.documentElement.dataset.printPagedReadyEventBound = 'true';
    document.addEventListener('notion-printer-paged-ready', function () {
      handlePagedRenderReady();
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

  function shouldRenderPageSidebar() {
    return sidebarRenderedPageNodes().length > 1;
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

  function sidebarPageStructureSignature(pages) {
    return (pages || []).map(function (pageNode, index) {
      if (!pageNode || !pageNode.getAttribute) return String(index + 1);
      return String(pageNode.getAttribute('data-page-number') || (index + 1));
    }).join('|');
  }

  function renderedPageNodeByNumber(pageNumber) {
    var targetPageNumber = String(pageNumber || '').trim();
    if (!targetPageNumber) return null;
    return sidebarRenderedPageNodes().find(function (pageNode, index) {
      if (!pageNode || !pageNode.getAttribute) return false;
      return String(pageNode.getAttribute('data-page-number') || (index + 1)) === targetPageNumber;
    }) || null;
  }

  function scrollPageSidebarItemIntoView(item) {
    if (!pageSidebarList || !item) return;
    var padding = 12;
    var itemTop = Math.max(0, item.offsetTop - padding);
    var itemBottom = item.offsetTop + item.offsetHeight + padding;
    var visibleTop = pageSidebarList.scrollTop;
    var visibleBottom = visibleTop + pageSidebarList.clientHeight;
    if (itemTop < visibleTop) {
      pageSidebarList.scrollTop = itemTop;
      return;
    }
    if (itemBottom > visibleBottom) {
      pageSidebarList.scrollTop = Math.max(0, itemBottom - pageSidebarList.clientHeight);
    }
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

  function sanitizePageSidebarPreview(root, sourceNode) {
    if (!root || !root.nodeType || root.nodeType !== 1) return null;
    clearEditorArtifacts(root);
    Array.from(root.querySelectorAll('script, style, .print-page-sidebar, .print-page-sidebar-toggle, .print-editor-banner, .print-editor-panel, .print-editor-launcher, .print-image-tools, .print-insert-actions, .print-page-dropzone, .print-inline-dropzone, .print-dropzone-active-indicator, .print-page-target-highlight, .print-editor-target-highlight')).forEach(function (node) {
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
    if (window.getComputedStyle) {
      var styleSource = sourceNode || root;
      var sourceStyle = styleSource && styleSource.nodeType === 1 ? window.getComputedStyle(styleSource) : null;
      var bodyStyle = document.body ? window.getComputedStyle(document.body) : null;
      root.style.color = (sourceStyle && sourceStyle.color) || (bodyStyle && bodyStyle.color) || '#25211d';
      root.style.textAlign = (sourceStyle && sourceStyle.textAlign && sourceStyle.textAlign !== 'start') || (bodyStyle && bodyStyle.textAlign && bodyStyle.textAlign !== 'start') || 'left';
      root.style.direction = (sourceStyle && sourceStyle.direction) || (bodyStyle && bodyStyle.direction) || 'ltr';
    } else {
      root.style.color = '#25211d';
      root.style.textAlign = 'left';
      root.style.direction = 'ltr';
    }
    root.style.background = '#fff';
    return root;
  }

  function buildPageSidebarPreviewContent(pageNode) {
    if (!pageNode || !pageNode.querySelector) return null;
    var sourcePageBox = pageNode.querySelector('.pagedjs_pagebox');
    if (sourcePageBox && sourcePageBox.cloneNode) {
      var pageBoxClone = sourcePageBox.cloneNode(true);
      pageBoxClone.classList.add('print-page-sidebar-preview-pagebox');
      return sanitizePageSidebarPreview(pageBoxClone, pageNode.querySelector('article.page') || pageNode);
    }
    var sourceArticle = pageNode.querySelector('article.page');
    if (!sourceArticle || !sourceArticle.cloneNode) {
      var fallbackRoot = renderedFlowRootForPage(pageNode);
      if (!fallbackRoot || !fallbackRoot.cloneNode) return null;
      var fallbackClone = fallbackRoot.cloneNode(true);
      return sanitizePageSidebarPreview(fallbackClone, fallbackRoot);
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
    return sanitizePageSidebarPreview(article, sourceArticle);
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
    var viewportOuterWidth = 160;
    var viewportFramePadding = 2;
    var viewportInnerWidth = Math.max(96, viewportOuterWidth - (viewportFramePadding * 2));
    var viewportScaleInsetPx = 1.6;
    var scale = Math.max(0.05, (viewportInnerWidth - viewportScaleInsetPx) / pageWidth);
    var scaledWidth = pageWidth * scale;
    var scaledHeight = pageHeight * scale;
    var viewportInnerHeight = Math.max(184, Math.ceil(scaledHeight + viewportScaleInsetPx));
    var viewportOuterHeight = viewportInnerHeight + (viewportFramePadding * 2);
    var offsetX = Math.max(0, Math.round((viewportInnerWidth - scaledWidth) / 2));

    thumb.style.height = viewportOuterHeight + 'px';
    viewport.style.height = viewportOuterHeight + 'px';
    viewport.style.padding = viewportFramePadding + 'px';
    var sheet = document.createElement('span');
    sheet.className = 'print-page-sidebar-sheet';
    sheet.style.width = pageWidth + 'px';
    sheet.style.height = pageHeight + 'px';
    sheet.style.position = 'absolute';
    sheet.style.left = offsetX + 'px';
    sheet.style.top = '0';
    sheet.style.transform = 'scale(' + scale.toFixed(6) + ')';
    sheet.style.pointerEvents = 'none';
    viewport.appendChild(sheet);

    var preview = document.createElement('span');
    preview.className = 'print-page-sidebar-preview';
    preview.style.width = pageWidth + 'px';
    preview.style.height = pageHeight + 'px';
    preview.style.minHeight = pageHeight + 'px';

    var clone = buildPageSidebarPreviewContent(pageNode);
    if (!clone) throw new Error('page sidebar preview content unavailable');
    clone.style.width = pageWidth + 'px';
    clone.style.height = pageHeight + 'px';
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

  function nodeHasMeaningfulPreviewContent(root) {
    if (!root || !root.querySelector) return false;
    if ((root.matches && root.matches('[data-print-manual-blank-page="true"]')) || root.querySelector('[data-print-manual-blank-page="true"]')) {
      return true;
    }
    if (root.querySelector('[data-print-break-id], img, svg, canvas, table, .print-table-block, .callout, pre, blockquote, .print-details-block')) {
      return true;
    }
    return normalizePrintText(root.textContent || '').length > 0;
  }

  function renderedPageNodeReadyForSidebarPreview(pageNode) {
    if (!pageNode || !pageNode.querySelector) return false;
    if (isManualBlankPage(pageNode)) return true;
    var pageBox = pageNode.querySelector('.pagedjs_pagebox');
    if (pageBox && nodeHasMeaningfulPreviewContent(pageBox)) return true;
    var article = pageNode.querySelector('article.page');
    if (article && nodeHasMeaningfulPreviewContent(article)) return true;
    return false;
  }

  function pageSidebarItemHasHydratedThumbnail(item) {
    if (!item || !item.querySelector) return false;
    var preview = item.querySelector('.print-page-sidebar-thumb .print-page-sidebar-preview');
    if (!preview) return false;
    return nodeHasMeaningfulPreviewContent(preview);
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
        if (pageSidebarItemHasHydratedThumbnail(item)) return;
        if (!renderedPageNodeReadyForSidebarPreview(pageNode)) return;
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
      var pendingHydration = Array.from(pageSidebarList.querySelectorAll('.print-page-sidebar-item')).some(function (item) {
        return !pageSidebarItemHasHydratedThumbnail(item);
      });
      if (pendingHydration) {
        schedulePageSidebarRefresh(220);
      }
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
    if (sidebarFeatureDisabled()) {
      if (pageSidebar && pageSidebar.remove) pageSidebar.remove();
      if (pageSidebarToggleButton && pageSidebarToggleButton.remove) pageSidebarToggleButton.remove();
      pageSidebar = null;
      pageSidebarList = null;
      pageSidebarToggleButton = null;
      pageSidebarOpen = false;
      if (document.body) {
        document.body.classList.remove('print-page-sidebar-open');
      }
      return;
    }
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
      pageSidebarToggleButton.setAttribute('aria-label', '페이지 패널 열기');
      pageSidebarToggleButton.setAttribute('title', '페이지 패널 열기');
      pageSidebarToggleButton.setAttribute('data-sidebar-label', '페이지 패널 열기');
      var toggleHandle = document.createElement('span');
      toggleHandle.className = 'print-page-sidebar-toggle-handle';
      for (var chevronIndex = 0; chevronIndex < 2; chevronIndex += 1) {
        var toggleChevron = document.createElement('span');
        toggleChevron.className = 'print-page-sidebar-toggle-chevron';
        toggleHandle.appendChild(toggleChevron);
      }
      pageSidebarToggleButton.appendChild(toggleHandle);
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
    if (sidebarFeatureDisabled()) {
      nextOpen = false;
    }
    var wasOpen = !!pageSidebarOpen;
    pageSidebarOpen = !!nextOpen;
    if (document.body) {
      document.body.classList.toggle('print-page-sidebar-open', pageSidebarOpen);
    }
    if (pageSidebarToggleButton) {
      var toggleLabel = pageSidebarOpen ? '페이지 패널 닫기' : '페이지 패널 열기';
      pageSidebarToggleButton.setAttribute('aria-label', toggleLabel);
      pageSidebarToggleButton.setAttribute('title', toggleLabel);
      pageSidebarToggleButton.setAttribute('data-sidebar-label', toggleLabel);
      pageSidebarToggleButton.setAttribute('aria-expanded', pageSidebarOpen ? 'true' : 'false');
    }
    if (pageSidebarOpen && !wasOpen) {
      schedulePageSidebarSync(true);
    }
  }

  function pruneEditorBannerForMinimalMode() {
    if (!editorBanner) return;
    Array.from(editorBanner.querySelectorAll('button')).forEach(function (button) {
      var role = String(button.getAttribute('data-editor-role') || '').trim();
      var shouldHide = uiMode === 'minimal' && (role === 'undo' || role === 'reset');
      button.style.display = shouldHide ? 'none' : '';
    });
    var summary = editorBanner.querySelector('.print-editor-banner-summary');
    if (summary) summary.style.display = '';
    var status = editorBanner.querySelector('.print-editor-banner-status');
    if (status) status.style.display = '';
  }

  function syncPageSidebarActiveState(followActive) {
    if (!pageSidebarList) return;
    var currentPageNumber = currentViewportPageNumber();
    var previousPageNumber = pageSidebarActivePageNumber;
    var activeButton = null;
    Array.from(pageSidebarList.querySelectorAll('.print-page-sidebar-item')).forEach(function (button) {
      var isActive = currentPageNumber && button.getAttribute('data-page-number') === currentPageNumber;
      button.classList.toggle('is-active', !!isActive);
      if (isActive) activeButton = button;
    });
    pageSidebarActivePageNumber = currentPageNumber;
    if (((followActive) || (currentPageNumber && currentPageNumber !== previousPageNumber)) && activeButton && pageSidebarOpen) {
      scrollPageSidebarItemIntoView(activeButton);
    }
  }

  function schedulePageSidebarSync(followActive) {
    if (followActive) pageSidebarForceSyncRequested = true;
    if (pageSidebarSyncScheduled) return;
    pageSidebarSyncScheduled = true;
    var run = function () {
      var shouldFollow = pageSidebarForceSyncRequested;
      pageSidebarForceSyncRequested = false;
      pageSidebarSyncScheduled = false;
      syncPageSidebarActiveState(shouldFollow);
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
      return;
    }
    setTimeout(run, 16);
  }

  function refreshPageSidebar() {
    if (!shouldRenderPageSidebar()) {
      resetPageSidebarDom();
      return;
    }
    ensurePageSidebar();
    if (!pageSidebarList) return;
    var pages = sidebarRenderedPageNodes();
    if (!pages.length) {
      pageSidebarList.innerHTML = '';
      pageSidebarStructureKey = '';
      pageSidebarEmptyAttemptCount += 1;
      schedulePageSidebarRefresh(pagedRenderReady() ? 900 : 260);
      return;
    }
    pageSidebarEmptyAttemptCount = 0;
    var structureKey = sidebarPageStructureSignature(pages);
    var needsRebuild = pageSidebarStructureKey !== structureKey || pageSidebarList.children.length !== pages.length;
    if (needsRebuild) {
      pageSidebarList.innerHTML = '';
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
          var livePageNode = renderedPageNodeByNumber(pageNumber);
          if (livePageNode && livePageNode.scrollIntoView) {
            livePageNode.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          }
          pageSidebarActivePageNumber = pageNumber;
          schedulePageSidebarSync(true);
        });
        pageSidebarList.appendChild(item);
      });
      pageSidebarStructureKey = structureKey;
    }
    if (!pageSidebarList.children.length && pageSidebarEmptyAttemptCount < 12) {
      schedulePageSidebarRefresh(260);
      return;
    }
    var needsHydration = needsRebuild || Array.from(pageSidebarList.querySelectorAll('.print-page-sidebar-item')).some(function (item) {
      return !pageSidebarItemHasHydratedThumbnail(item);
    });
    if (needsHydration) {
      schedulePageSidebarHydration(pages);
    }
    schedulePageSidebarSync();
  }

  function refreshNavigatorOptions() {
    pruneEditorBannerForMinimalMode();
    renderEditorSearchResults();
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
      return '페이지 다시 계산 ' + passIndex + '/' + maxPasses + '회차: 추가 반영 항목이 없습니다';
    }
    return '페이지 다시 계산 ' + passIndex + '/' + maxPasses + '회차: ' + parts.join(', ') + ' 반영';
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
      updateEditorBannerStatus('페이지 다시 계산 완료: 추가 반영 항목이 없습니다');
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
    updateEditorBannerStatus('이 기능은 현재 화면에서 숨겨져 있습니다');
  }

  function restorePendingAutoOptimize() {
    var pending = readStoredAutoOptimize();
    if (!pending) return false;
    if (!hasReloadFocusNavigationToken()) {
      clearStoredAutoOptimize();
      return false;
    }
    if (pending.at && Date.now() - pending.at > 120000) {
      clearStoredAutoOptimize();
      return false;
    }
    if (pending.mode === 'complete') {
      clearStoredAutoOptimize();
      updateEditorUiSummary();
      updateEditorBannerStatus(pending.message || '페이지 다시 계산 완료');
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
    clearStoredAutoOptimize();
    autoOptimizeResumeScheduled = false;
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
    var renderedPageCount = document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length;
    return {
      pageCount: renderedPageCount || (document.querySelector('article.page') ? 1 : 0),
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
      { label: '텍스트 수정', value: metrics.textEditCount },
      { label: '이미지 조정', value: metrics.imageEditCount },
      { label: '삭제됨', value: metrics.deletedCount }
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
      var visibleEditCount =
        metrics.textEditCount +
        metrics.imageEditCount +
        metrics.deletedCount +
        Object.keys(breakOverrideMap || {}).length +
        Object.keys(spaceOverrideMap || {}).length +
        Object.keys(pullUpOverrideMap || {}).length +
        Object.keys(manualGapMap || {}).length;
      if (visibleEditCount > 0) {
        editorNote.style.display = '';
        editorNote.textContent = '직접 편집 ' + visibleEditCount + '건이 반영되었습니다. 본문 위에서 바로 이어 붙이기, 여기서 시작, 빈칸 조정을 계속 할 수 있습니다.';
      } else {
        editorNote.textContent = '';
        editorNote.style.display = 'none';
      }
    }

    if (editorBannerRecommendationButton) {
      editorBannerRecommendationButton.disabled = true;
      editorBannerRecommendationButton.style.display = 'none';
    }
  }

  function syncEditorBannerContext() {
    if (editorBannerTitleNode) {
      editorBannerTitleNode.textContent = editorDocumentTitleText();
    }
    if (editorBannerSubtitleNode) {
      editorBannerSubtitleNode.textContent = '원본 문서 스타일 유지 · 편집 워크스페이스';
    }
    if (editorBannerModeNode) {
      editorBannerModeNode.textContent = editorVariantLabelText();
    }
  }

  function syncEditorUiControls() {
    var isOpen = !!editorUiState.open;
    var filterMode = sanitizeEditorFilter(editorUiState.filter || 'all');

    if (document.body) {
      document.body.classList.toggle('print-editor-open', isOpen);
    }

    if (editorPanelToggleButton) {
      editorPanelToggleButton.textContent = '편집 패널';
      editorPanelToggleButton.setAttribute('aria-label', isOpen ? '편집 패널 닫기' : '편집 패널 열기');
      editorPanelToggleButton.setAttribute('title', isOpen ? '편집 패널 닫기' : '편집 패널 열기');
      editorPanelToggleButton.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
      editorPanelToggleButton.classList.toggle('is-active', isOpen);
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
      editorTextEditToggle.textContent = textEditModeEnabled ? '텍스트 모드 종료' : '텍스트 수정';
      editorTextEditToggle.classList.toggle('is-active', textEditModeEnabled);
    }

    if (editorBannerTextEditToggle) {
      editorBannerTextEditToggle.textContent = textEditModeEnabled ? '텍스트 모드 종료' : '텍스트 수정';
      editorBannerTextEditToggle.classList.toggle('is-active', textEditModeEnabled);
    }

    syncEditorBannerContext();

    Object.keys(editorFilterButtons).forEach(function (key) {
      if (!editorFilterButtons[key]) return;
      editorFilterButtons[key].classList.toggle('is-active', key === filterMode);
    });
  }

  function toggleTextEditMode() {
    var nextEnabled = !textEditModeEnabled;
    setTextEditMode(nextEnabled);
    updateEditorBannerStatus(nextEnabled ? '텍스트 전용 편집 모드를 시작했습니다' : '텍스트 수정 모드를 종료했습니다');
    return nextEnabled;
  }

  function setEditorPanelOpen(open) {
    editorUiState.open = !!open;
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

  function normalizeSearchTextContent(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function searchQueryTerms(query) {
    var normalized = normalizeSearchTextContent(query);
    if (!normalized) return [];
    var seen = {};
    var terms = [];
    function pushTerm(value) {
      var term = normalizeSearchTextContent(value);
      if (!term) return;
      var key = term.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      terms.push(term);
    }
    pushTerm(normalized);
    normalized.split(' ').forEach(pushTerm);
    return terms;
  }

  function firstSearchMatch(text, query) {
    var source = normalizeSearchTextContent(text);
    var needles = searchQueryTerms(query);
    if (!source || !needles.length) return null;
    var lowerSource = source.toLowerCase();
    var best = null;
    needles.forEach(function (needle, index) {
      var matchIndex = lowerSource.indexOf(needle.toLowerCase());
      if (matchIndex === -1) return;
      var candidate = {
        index: matchIndex,
        length: needle.length,
        priority: index
      };
      if (
        !best ||
        candidate.index < best.index ||
        (candidate.index === best.index && candidate.length > best.length) ||
        (candidate.index === best.index && candidate.length === best.length && candidate.priority < best.priority)
      ) {
        best = candidate;
      }
    });
    return best;
  }

  function escapeSearchRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function candidateSearchPlainText(candidate) {
    if (!candidate) return '';
    var node = candidate.node;
    var text = node ? normalizeSearchTextContent(node.innerText || node.textContent || '') : '';
    if (!text || text === '이미지') {
      text = normalizeSearchTextContent(candidate.label || '');
    }
    return text;
  }

  function searchPageNumberForCandidate(candidate) {
    if (!candidate) return 0;
    var pageNumber = pageNumberForRenderedCandidate(candidate.id) || pageNumberFromNode(closestRenderedPageNode(candidate.node));
    if (!pageNumber && candidate.node && candidate.node.closest && candidate.node.closest('article.page')) {
      return 1;
    }
    return pageNumber;
  }

  function searchPageLabelForCandidate(candidate) {
    var pageNumber = searchPageNumberForCandidate(candidate);
    return pageNumber > 0 ? String(pageNumber) + '페이지' : '본문';
  }

  function editorSearchContextText(candidates, index) {
    var current = candidates[index];
    if (!current) return '';
    var currentPageNumber = searchPageNumberForCandidate(current);
    var parts = [];
    [index - 1, index, index + 1].forEach(function (candidateIndex) {
      var candidate = candidates[candidateIndex];
      if (!candidate) return;
      var pageNumber = searchPageNumberForCandidate(candidate);
      if (currentPageNumber && pageNumber && currentPageNumber !== pageNumber) return;
      var text = candidateSearchPlainText(candidate);
      if (!text) return;
      parts.push(text);
    });
    return normalizeSearchTextContent(parts.join(' / '));
  }

  function searchExcerptForQuery(text, query) {
    var source = normalizeSearchTextContent(text);
    var keyword = normalizeSearchTextContent(query);
    if (!source) return '';
    if (!keyword) {
      return source.length > 132 ? source.slice(0, 132).trim() + '…' : source;
    }
    var match = firstSearchMatch(source, keyword);
    if (!match) {
      return source.length > 132 ? source.slice(0, 132).trim() + '…' : source;
    }
    var start = Math.max(0, match.index - 40);
    var end = Math.min(source.length, match.index + match.length + 68);
    var prefix = start > 0 ? '…' : '';
    var suffix = end < source.length ? '…' : '';
    return prefix + source.slice(start, end).trim() + suffix;
  }

  function appendHighlightedSearchSnippet(host, text, query) {
    if (!host) return;
    var source = String(text || '');
    var needles = searchQueryTerms(query).slice().sort(function (a, b) {
      return b.length - a.length;
    });
    if (!needles.length) {
      host.textContent = source;
      return;
    }
    var regex = new RegExp(needles.map(escapeSearchRegExp).join('|'), 'ig');
    var lastIndex = 0;
    var matched = false;
    var match;
    while ((match = regex.exec(source))) {
      matched = true;
      if (match.index > lastIndex) {
        host.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
      }
      var mark = document.createElement('mark');
      mark.textContent = match[0];
      host.appendChild(mark);
      lastIndex = match.index + match[0].length;
      if (!match[0].length) {
        regex.lastIndex += 1;
      }
    }
    if (!matched) {
      host.textContent = source;
      return;
    }
    if (lastIndex < source.length) {
      host.appendChild(document.createTextNode(source.slice(lastIndex)));
    }
  }

  function collectEditorSearchResults(query) {
    var keyword = normalizeSearchTextContent(query);
    if (!keyword) return [];
    var candidates = activeBreakCandidates();
    var results = [];
    candidates.forEach(function (candidate, index) {
      var directText = candidateSearchPlainText(candidate);
      if (!directText) return;
      var directMatch = firstSearchMatch(directText, keyword);
      var contextText = editorSearchContextText(candidates, index) || directText;
      var contextMatch = firstSearchMatch(contextText, keyword);
      if (!directMatch && !contextMatch) return;
      results.push({
        candidateId: candidate.id,
        pageLabel: searchPageLabelForCandidate(candidate),
        pageNumber: searchPageNumberForCandidate(candidate),
        plainText: directText,
        excerpt: searchExcerptForQuery(contextText, keyword),
        rank: contextMatch ? contextMatch.index : directMatch.index,
        index: index
      });
    });
    return results.slice(0, 40);
  }

  function renderEditorSearchResults() {
    if (!editorSearchResults) return;
    var query = normalizeSearchTextContent(editorSearchInput ? editorSearchInput.value : editorSearchQuery);
    editorSearchQuery = query;
    editorSearchResults.innerHTML = '';
    if (editorSearchMeta) {
      editorSearchMeta.textContent = '';
    }

    var empty = document.createElement('div');
    empty.className = 'print-editor-empty';

    if (!query) {
      return;
    }

    var results = collectEditorSearchResults(query);
    if (!results.length) {
      empty.textContent = '"' + query + '"와 일치하는 문장을 찾지 못했습니다.';
      editorSearchResults.appendChild(empty);
      return;
    }

    if (editorSearchMeta) {
      editorSearchMeta.textContent = String(results.length) + '개 결과';
    }

    results.forEach(function (result) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'print-editor-search-result';
      if (selectedTargetState.candidateId && selectedTargetState.candidateId === result.candidateId) {
        button.classList.add('is-selected');
      }

      var page = document.createElement('span');
      page.className = 'print-editor-search-result-page';
      page.textContent = result.pageLabel;
      button.appendChild(page);

      var snippet = document.createElement('span');
      snippet.className = 'print-editor-search-result-snippet';
      appendHighlightedSearchSnippet(snippet, result.excerpt, query);
      button.appendChild(snippet);

      button.addEventListener('click', function () {
        var candidate = findCandidateById(result.candidateId);
        if (!candidate) {
          updateEditorBannerStatus('검색 결과에 해당하는 블록을 찾지 못했습니다');
          return;
        }
        jumpToCandidate(candidate);
        updateEditorBannerStatus('"' + query + '" 검색 결과로 이동했습니다');
        renderEditorSearchResults();
      });

      editorSearchResults.appendChild(button);
    });
  }

  function jumpToFirstSearchResult() {
    var query = normalizeSearchTextContent(editorSearchInput ? editorSearchInput.value : editorSearchQuery);
    var results = collectEditorSearchResults(query);
    if (!results.length) {
      updateEditorBannerStatus('먼저 찾을 단어를 입력해 주세요');
      return false;
    }
    var candidate = findCandidateById(results[0].candidateId);
    if (!candidate) {
      updateEditorBannerStatus('검색 결과에 해당하는 블록을 찾지 못했습니다');
      return false;
    }
    jumpToCandidate(candidate);
    updateEditorBannerStatus('첫 번째 검색 결과로 이동했습니다');
    renderEditorSearchResults();
    return true;
  }

  function jumpToRecommendedItem() {
    updateEditorBannerStatus('이 이동 기능은 현재 비활성화되어 있습니다');
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
    if (textEditModeEnabled) {
      closeImageToolPanels();
      clearDragInteractionState();
      setImageSelectionIds([]);
      clearSelectedTarget({ silent: true });
      setPageSidebarOpen(false);
      if (editorUiState.open) {
        setEditorPanelOpen(false);
      }
    } else {
      closeImageToolPanels();
    }
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
        node.removeAttribute('spellcheck');
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
      if (imageScaleSliderDragState) {
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

  function isManualBlankPage(pageNode) {
    return !!(pageNode && pageNode.dataset && pageNode.dataset.printManualBlankPage === 'true');
  }

  function nearestPageWithCandidateIds(pages, startIndex, step) {
    var pageNodes = Array.isArray(pages) ? pages : [];
    var direction = step < 0 ? -1 : 1;
    for (var index = startIndex + direction; index >= 0 && index < pageNodes.length; index += direction) {
      var pageNode = pageNodes[index];
      var boundary = firstLastCandidateIdsInPage(pageNode);
      if (boundary.first || boundary.last) return pageNode;
    }
    return null;
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
    var pages = Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]'));
    return pages.map(function (pageNode, index) {
      var candidateIds = Array.from(pageNode.querySelectorAll('[data-print-break-id]')).map(function (node) {
        return node.getAttribute('data-print-break-id') || '';
      }).filter(Boolean);
      if (isManualBlankPage(pageNode)) {
        var previousContentPage = nearestPageWithCandidateIds(pages, index, -1);
        var nextContentPage = nearestPageWithCandidateIds(pages, index, 1);
        var previousBoundary = firstLastCandidateIdsInPage(previousContentPage);
        var nextBoundary = firstLastCandidateIdsInPage(nextContentPage);
        return {
          page: pageNode.getAttribute('data-page-number') || '',
          ids: [],
          blank: true,
          prev_candidate_id: previousBoundary.last || '',
          next_candidate_id: nextBoundary.first || ''
        };
      }
      return {
        page: pageNode.getAttribute('data-page-number') || '',
        ids: candidateIds,
        blank: false
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

  function lastStoredLayoutCandidateId(pageEntry) {
    if (!pageEntry || !Array.isArray(pageEntry.ids)) return '';
    var ids = pageEntry.ids.filter(Boolean);
    return ids.length ? ids[ids.length - 1] : '';
  }

  function storedLayoutBoundaryCandidateIds(layout) {
    return (Array.isArray(layout) ? layout : []).map(firstStoredLayoutCandidateId).filter(Boolean).slice(1);
  }

  function storedLayoutBlankEntries(layout) {
    return (Array.isArray(layout) ? layout : []).filter(function (pageEntry) {
      return !!(pageEntry && pageEntry.blank);
    });
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

    var blankChanged = restoreManualBlankPagesFromStoredLayout(stored);
    if (!movedAny && !blankChanged) return false;

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

  function restoreStoredRenderedLayoutOnce() {
    if (storedRenderedLayoutApplied) return false;
    if (lockViewportInteractionIfNeeded()) {
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
    return ensureRenderedPagesRoot();
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
    refreshMergedTocPageNumbers();
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
    var pageNumber = parseInt(pageNode.getAttribute('data-page-number') || '0', 10) || 0;
    if (isManualBlankPage(pageNode)) {
      var canDeleteBlankPage = document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length > 1;
      var canMergeBlankPage = pageNumber > 1;
      return {
        pageNumber: pageNumber,
        candidateIds: [],
        persistIds: [],
        firstCandidateId: '',
        lastCandidateId: '',
        firstPersistId: '',
        lastPersistId: '',
        anchorPersistId: '',
        primaryLabel: '빈 페이지',
        trailingLabel: '',
        candidateCount: 0,
        persistCount: 0,
        sharedWithPrevious: [],
        sharedWithNext: [],
        deletablePersistIds: [],
        continuedFromPrevious: false,
        continuesToNext: false,
        canMerge: canMergeBlankPage,
        canDelete: canDeleteBlankPage,
        mergeCandidateId: '',
        mergeHelpText: canMergeBlankPage ? '앞 페이지와 합쳐 빈 페이지를 없앱니다' : '첫 페이지는 앞 페이지가 없습니다',
        deleteHelpText: canDeleteBlankPage ? '삽입한 빈 페이지를 삭제합니다' : '한 페이지만 남아 있어 삭제할 수 없습니다',
        continuationBadges: ['빈 페이지'],
        detailText: '내용 없음',
        signature: [String(pageNumber || ''), 'manual_blank_page'].join('::'),
        role: 'manual_blank_page'
      };
    }
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
      pageNumber: pageNumber,
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

  function measuredHeightPx(node, fallback) {
    var defaultHeight = typeof fallback === 'number' ? fallback : 0;
    if (!node || !node.getBoundingClientRect) return defaultHeight;
    var rect = node.getBoundingClientRect();
    var value = Math.round(rect && rect.height ? rect.height : 0);
    return value > 0 ? value : defaultHeight;
  }

  function applyManualBlankPageSizing(pageNode, referencePageNode) {
    if (!pageNode || !pageNode.dataset) return;
    var referenceNode = referencePageNode || pageNode;
    var outerHeight = measuredHeightPx(
      (referenceNode.querySelector && (referenceNode.querySelector('.pagedjs_sheet') || referenceNode.querySelector('.pagedjs_pagebox'))) || referenceNode,
      measuredHeightPx(referenceNode, 1120)
    );
    var contentHeight = measuredHeightPx(
      (referenceNode.querySelector && (referenceNode.querySelector('.pagedjs_page_content') || referenceNode.querySelector('article.page') || referenceNode.querySelector('.page-body'))) || referenceNode,
      Math.max(720, outerHeight - 96)
    );
    pageNode.dataset.printManualPage = 'true';
    pageNode.dataset.printManualBlankPage = 'true';
    pageNode.style.setProperty('--print-manual-blank-page-height', String(Math.max(720, outerHeight)) + 'px');
    pageNode.style.setProperty('--print-manual-blank-content-height', String(Math.max(520, contentHeight)) + 'px');
  }

  function expandRenderedPageFrame(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) return;
    [pageNode].concat(Array.from(pageNode.querySelectorAll('.pagedjs_sheet, .pagedjs_pagebox, .pagedjs_page_content, .pagedjs_area, article.page, .page-body'))).forEach(function (node) {
      if (!node || !node.style) return;
      if (isManualBlankPage(pageNode)) {
        node.style.maxHeight = 'none';
        node.style.overflow = 'visible';
        return;
      }
      node.style.height = 'auto';
      node.style.minHeight = '';
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
    clone.removeAttribute('data-print-manual-blank-page');
    clone.removeAttribute('data-print-blank-prev-candidate-id');
    clone.removeAttribute('data-print-blank-next-candidate-id');
    if (clone.style) {
      clone.style.removeProperty('--print-manual-blank-page-height');
      clone.style.removeProperty('--print-manual-blank-content-height');
    }
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

  function createManualBlankPage(referencePageNode, layoutEntry) {
    var templatePage = referencePageNode || document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number]');
    if (!templatePage) return null;
    var blankPage = cloneRenderedPageShell(templatePage);
    if (!blankPage) return null;
    applyManualBlankPageSizing(blankPage, templatePage);
    if (layoutEntry && blankPage.dataset) {
      blankPage.dataset.printBlankPrevCandidateId = String(layoutEntry.prev_candidate_id || lastStoredLayoutCandidateId(layoutEntry) || '');
      blankPage.dataset.printBlankNextCandidateId = String(layoutEntry.next_candidate_id || firstStoredLayoutCandidateId(layoutEntry) || '');
    }
    return blankPage;
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
      if (isManualBlankPage(pageNode)) return;
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

  function removeManualBlankPagesFromRenderedPreview() {
    var removedAny = false;
    Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number][data-print-manual-blank-page="true"]')).forEach(function (pageNode) {
      if (!pageNode || !pageNode.parentNode) return;
      pageNode.parentNode.removeChild(pageNode);
      removedAny = true;
    });
    return removedAny;
  }

  function restoreManualBlankPagesFromStoredLayout(layout) {
    var blankEntries = storedLayoutBlankEntries(layout);
    var removedAny = removeManualBlankPagesFromRenderedPreview();
    if (!blankEntries.length) return removedAny;
    var pagesRoot = renderedPagesRoot();
    if (!pagesRoot) return removedAny;
    var insertedAny = false;
    blankEntries.forEach(function (pageEntry) {
      var nextCandidateId = pageEntry && pageEntry.next_candidate_id ? String(pageEntry.next_candidate_id) : '';
      var prevCandidateId = pageEntry && pageEntry.prev_candidate_id ? String(pageEntry.prev_candidate_id) : '';
      var nextPage = nextCandidateId ? closestRenderedPageNode(findRenderedCandidateNode(nextCandidateId)) : null;
      var prevPage = prevCandidateId ? closestRenderedPageNode(findRenderedCandidateNode(prevCandidateId)) : null;
      var referencePage = nextPage || prevPage || pagesRoot.querySelector('.pagedjs_page[data-page-number]');
      var blankPage = createManualBlankPage(referencePage, pageEntry);
      if (!blankPage) return;
      if (nextPage && nextPage.parentNode === pagesRoot) {
        pagesRoot.insertBefore(blankPage, nextPage);
        insertedAny = true;
        return;
      }
      if (prevPage && prevPage.parentNode === pagesRoot) {
        var insertionPoint = prevPage.nextSibling;
        while (insertionPoint && insertionPoint.nodeType === 1 && isManualBlankPage(insertionPoint) && !(insertionPoint.dataset && insertionPoint.dataset.printBlankNextCandidateId)) {
          insertionPoint = insertionPoint.nextSibling;
        }
        pagesRoot.insertBefore(blankPage, insertionPoint || null);
        insertedAny = true;
        return;
      }
      pagesRoot.appendChild(blankPage);
      insertedAny = true;
    });
    return removedAny || insertedAny;
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

  function isCalloutSeamBoundaryNode(node) {
    if (!node || node.nodeType !== 1 || isEditorArtifactNode(node)) return false;
    if (node.matches && node.matches('p, ul, ol, figure, .image, table, .print-table-block, blockquote, pre, h1, h2, h3, h4, h5, h6, details, .print-details-block, .print-inline-block, .print-shortcut-block')) {
      return true;
    }
    return false;
  }

  function firstCalloutSeamBoundary(node) {
    if (!node || node.nodeType !== 1 || isEditorArtifactNode(node)) return null;
    if (isCalloutSeamBoundaryNode(node)) return node;
    var children = directMeaningfulElementChildren(node);
    for (var index = 0; index < children.length; index += 1) {
      var nested = firstCalloutSeamBoundary(children[index]);
      if (nested) return nested;
    }
    return null;
  }

  function lastCalloutSeamBoundary(node) {
    if (!node || node.nodeType !== 1 || isEditorArtifactNode(node)) return null;
    if (isCalloutSeamBoundaryNode(node)) return node;
    var children = directMeaningfulElementChildren(node);
    for (var index = children.length - 1; index >= 0; index -= 1) {
      var nested = lastCalloutSeamBoundary(children[index]);
      if (nested) return nested;
    }
    return null;
  }

  function clearCalloutMergeSeamMarkers(root) {
    if (!root || !root.querySelectorAll) return;
    Array.from(root.querySelectorAll('.print-callout-merge-head, .print-callout-merge-tail')).forEach(function (node) {
      if (!node || !node.classList) return;
      node.classList.remove('print-callout-merge-head');
      node.classList.remove('print-callout-merge-tail');
    });
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
          var leftBoundary = lastCalloutSeamBoundary(leftContent.lastElementChild || leftContent);
          var movedBoundary = firstCalloutSeamBoundary(rightContent.firstElementChild || rightContent);
          while (rightContent.firstChild) {
            leftContent.appendChild(rightContent.firstChild);
          }
          if (leftBoundary && leftBoundary.classList) {
            leftBoundary.classList.add('print-callout-merge-tail');
          }
          if (movedBoundary && movedBoundary.classList) {
            movedBoundary.classList.add('print-callout-merge-head');
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
    clearCalloutMergeSeamMarkers(scope);
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

  function focusRenderedPage(pageNode, statusMessage) {
    if (!pageNode) return;
    setSelectedTarget({
      kind: 'page',
      candidateId: '',
      persistId: '',
      pageNumber: pageNumberFromNode(pageNode)
    }, { silent: true });
    restoreViewportAnchor(null, pageNode, {
      behavior: 'auto',
      highlight: false,
      offsetTopPx: 72
    });
    highlightAndScrollToNode(pageNode, {
      behavior: 'smooth',
      offsetTopPx: 72
    });
    if (statusMessage) {
      updateEditorBannerStatus(statusMessage);
    }
  }

  function deleteBlankRenderedPage(pageNode, options) {
    if (!pageNode || !isManualBlankPage(pageNode)) return false;
    var config = options || {};
    var allPages = Array.from(document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]'));
    if (allPages.length <= 1) {
      updateEditorBannerStatus('한 페이지만 남아 있어 삭제할 수 없습니다');
      return false;
    }

    var blankPageNumber = pageNumberFromNode(pageNode);
    var previousPage = pageNode.previousElementSibling && pageNode.previousElementSibling.matches && pageNode.previousElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.previousElementSibling : null;
    var nextPage = pageNode.nextElementSibling && pageNode.nextElementSibling.matches && pageNode.nextElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.nextElementSibling : null;
    var beforeLayout = snapshotRenderedLayout();
    var actionMeta = buildRuntimeActionMeta(pageNode, {
      intent: config.intent || 'delete_blank_page',
      effect: {
        layout_before: beforeLayout,
        blank_page: true
      }
    });

    pushRenderedHistorySnapshot();
    pushHistorySnapshot(config.historyLabel || 'delete-blank-page');
    pageNode.remove();

    renumberRenderedPages();
    if (previousPage) expandRenderedPageFrame(previousPage);
    if (nextPage) expandRenderedPageFrame(nextPage);
    installDirectPageManipulation();
    persistRenderedLayout();
    refreshNavigatorOptions();
    refreshEditorList();

    var focusPage = (nextPage && nextPage.isConnected) ? nextPage : ((previousPage && previousPage.isConnected) ? previousPage : visibleRenderedPageNode());
    if (focusPage) {
      focusRenderedPage(focusPage, config.status || '빈 페이지를 삭제했습니다');
    } else {
      clearSelectedTarget({ silent: true });
      updateEditorBannerStatus(config.status || '빈 페이지를 삭제했습니다');
    }

    var afterLayout = snapshotRenderedLayout();
    logLearningAction(config.actionType || 'delete_blank_page', {
      pageNode: focusPage || null,
      targetNode: focusPage || null,
      pageNumber: blankPageNumber,
      nodeKind: 'page',
      before: {
        page_number: blankPageNumber,
        page_role: 'manual_blank_page'
      },
      after: {
        deleted: true,
        page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length,
        replacement_page_number: focusPage ? pageNumberFromNode(focusPage) : 0
      },
      ui: {
        source: config.uiSource || 'page_delete_button',
        suggestion_source: 'manual'
      },
      meta: Object.assign({}, actionMeta, {
        focus_after: currentSelectedTarget(),
        target_after: captureRenderedNodePosition(focusPage),
        page_after: captureRenderedPageSnapshot(focusPage),
        effect: {
          deleted_blank_page: true,
          deleted_page_number: blankPageNumber,
          layout_effect: diffRenderedLayouts(beforeLayout, afterLayout)
        }
      })
    });
    return true;
  }

  function insertBlankRenderedPage(pageNode, placement) {
    if (!pageNode || !pageNode.parentNode) {
      updateEditorBannerStatus('빈 페이지를 넣을 위치를 찾지 못했습니다');
      return false;
    }
    var direction = placement === 'before' ? 'before' : 'after';
    var previousPage = pageNode.previousElementSibling && pageNode.previousElementSibling.matches && pageNode.previousElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.previousElementSibling : null;
    var nextPage = pageNode.nextElementSibling && pageNode.nextElementSibling.matches && pageNode.nextElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.nextElementSibling : null;
    var previousBoundary = firstLastCandidateIdsInPage(direction === 'before' ? previousPage : pageNode);
    var nextBoundary = firstLastCandidateIdsInPage(direction === 'before' ? pageNode : nextPage);
    var blankEntry = {
      prev_candidate_id: previousBoundary.last || '',
      next_candidate_id: nextBoundary.first || ''
    };
    var beforeLayout = snapshotRenderedLayout();
    var actionMeta = buildRuntimeActionMeta(pageNode, {
      intent: 'insert_blank_page',
      effect: {
        layout_before: beforeLayout,
        placement: direction,
        blank_prev_candidate_id: blankEntry.prev_candidate_id,
        blank_next_candidate_id: blankEntry.next_candidate_id
      }
    });

    pushRenderedHistorySnapshot();
    pushHistorySnapshot('insert-blank-page');
    var blankPage = createManualBlankPage(pageNode, blankEntry);
    if (!blankPage) {
      updateEditorBannerStatus('빈 페이지를 만들지 못했습니다');
      return false;
    }

    pageNode.parentNode.insertBefore(blankPage, direction === 'before' ? pageNode : pageNode.nextSibling);
    renumberRenderedPages();
    expandRenderedPageFrame(pageNode);
    expandRenderedPageFrame(blankPage);
    installDirectPageManipulation();
    persistRenderedLayout();
    refreshNavigatorOptions();
    refreshEditorList();

    var blankPageNumber = pageNumberFromNode(blankPage);
    focusRenderedPage(blankPage, direction === 'before' ? '이 페이지 앞에 빈 페이지를 넣었습니다' : '이 페이지 뒤에 빈 페이지를 넣었습니다');

    var afterLayout = snapshotRenderedLayout();
    logLearningAction('insert_blank_page', {
      pageNode: blankPage,
      targetNode: blankPage,
      pageNumber: blankPageNumber,
      nodeKind: 'page',
      before: {
        reference_page_number: actionMeta.page_before && actionMeta.page_before.page_number ? actionMeta.page_before.page_number : pageNumberFromNode(pageNode),
        placement: direction
      },
      after: {
        page_number: blankPageNumber,
        page_count: document.querySelectorAll('.pagedjs_pages .pagedjs_page[data-page-number]').length
      },
      ui: {
        source: direction === 'before' ? 'page_blank_before_button' : 'page_blank_after_button',
        suggestion_source: 'manual'
      },
      meta: Object.assign({}, actionMeta, {
        focus_after: currentSelectedTarget(),
        target_after: captureRenderedNodePosition(blankPage),
        page_after: captureRenderedPageSnapshot(blankPage),
        effect: {
          inserted_blank_page: true,
          placement: direction,
          blank_prev_candidate_id: blankEntry.prev_candidate_id,
          blank_next_candidate_id: blankEntry.next_candidate_id,
          layout_effect: diffRenderedLayouts(beforeLayout, afterLayout)
        }
      })
    });
    return true;
  }

  function mergeRenderedPageLive(pageNode) {
    if (!pageNode) return false;
    var previousPage = pageNode.previousElementSibling && pageNode.previousElementSibling.matches && pageNode.previousElementSibling.matches('.pagedjs_page[data-page-number]') ? pageNode.previousElementSibling : null;
    if (!previousPage) {
      updateEditorBannerStatus('앞 페이지가 없습니다');
      return false;
    }
    if (isManualBlankPage(pageNode)) {
      return deleteBlankRenderedPage(pageNode, {
        status: '빈 페이지를 없앴습니다',
        uiSource: 'page_merge_button',
        actionType: 'merge_blank_page',
        intent: 'merge_blank_page',
        historyLabel: 'merge-blank-page'
      });
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
    if (isManualBlankPage(pageNode)) {
      deleteBlankRenderedPage(pageNode, {
        status: '빈 페이지를 삭제했습니다',
        uiSource: 'page_delete_button',
        actionType: 'delete_blank_page',
        intent: 'delete_blank_page'
      });
      return;
    }
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
    var pagesRoot = ensureRenderedPagesRoot();
    if (!pagesRoot) return false;
    normalizeRenderedStructuralFragments(pagesRoot);
    var insertedHandles = 0;

    Array.from(pagesRoot.querySelectorAll('.pagedjs_page[data-page-number]')).forEach(function (pageNode, index) {
      var pageMeta = describeRenderedPage(pageNode);
      pageNode.classList.add('print-screen-page');
      var actionGroup = ensurePageChrome(pageNode, pageMeta);

      var insertBeforeButton = document.createElement('button');
      insertBeforeButton.type = 'button';
      insertBeforeButton.className = 'print-page-insert-button is-before';
      insertBeforeButton.textContent = '앞 빈 페이지';
      insertBeforeButton.title = '현재 페이지 앞에 빈 페이지 추가';
      insertBeforeButton.addEventListener('click', function () {
        insertBlankRenderedPage(pageNode, 'before');
      });
      actionGroup.appendChild(insertBeforeButton);

      var insertAfterButton = document.createElement('button');
      insertAfterButton.type = 'button';
      insertAfterButton.className = 'print-page-insert-button is-after';
      insertAfterButton.textContent = '뒤 빈 페이지';
      insertAfterButton.title = '현재 페이지 뒤에 빈 페이지 추가';
      insertAfterButton.addEventListener('click', function () {
        insertBlankRenderedPage(pageNode, 'after');
      });
      actionGroup.appendChild(insertAfterButton);

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
          if (textEditModeEnabled) return;
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
      var candidatePageNode = closestRenderedPageNode(node);
      var pageEdgeCandidateIds = firstLastCandidateIdsInPage(candidatePageNode);
      node.classList.toggle('print-page-top-candidate', pageEdgeCandidateIds.first === candidateId);

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
        bindPointerFocusRelease(mergeButton, node, 'print-tools-hover');
        insertBar.appendChild(mergeButton);

        var splitButton = document.createElement('button');
        splitButton.type = 'button';
        splitButton.className = 'print-insert-action-button';
        splitButton.textContent = '여기서 시작';
        splitButton.title = '이 블록부터 새 페이지 시작';
        splitButton.addEventListener('click', function () {
          splitRenderedPageAtNode(node);
        });
        bindPointerFocusRelease(splitButton, node, 'print-tools-hover');
        insertBar.appendChild(splitButton);

        var gapButton = document.createElement('button');
        gapButton.type = 'button';
        gapButton.className = 'print-insert-action-button';
        gapButton.textContent = '빈칸 +';
        gapButton.title = '엔터 한 번 정도의 빈공간 추가';
        gapButton.addEventListener('click', function () {
          var candidate = findCandidateById(candidateId);
          if (!candidate) return;
          adjustCandidateGap(candidate, 1, 'inline_gap_button');
        });
        bindPointerFocusRelease(gapButton, node, 'print-tools-hover');
        insertBar.appendChild(gapButton);

        node.appendChild(insertBar);
      }

      if (!directChildByClass(node, 'print-inline-tools')) {
        var inlineTools = document.createElement('span');
        inlineTools.className = 'print-inline-tools';

        var inlineDelete = document.createElement('button');
        inlineDelete.type = 'button';
        inlineDelete.className = 'print-inline-tool is-danger';
        inlineDelete.textContent = '삭제';
        inlineDelete.title = '이 블록 삭제';
        inlineDelete.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          var targetCandidate = findCandidateById(candidateId);
          if (!targetCandidate) return;
          setSelectedCandidate(targetCandidate, { silent: true });
          deleteCandidateNode(targetCandidate, 'inline_delete_button');
        });
        bindPointerFocusRelease(inlineDelete, node, 'print-tools-hover');
        inlineTools.appendChild(inlineDelete);

        node.appendChild(inlineTools);
      }

      bindHoverToolState(node, 'print-tools-hover', [
        directChildByClass(node, 'print-insert-actions'),
        directChildByClass(node, 'print-inline-tools')
      ]);

      if (!node.dataset.printSelectionBound) {
        node.dataset.printSelectionBound = 'true';
        node.addEventListener('click', function (event) {
          if (textEditModeEnabled) return;
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

      var imageLabel = document.createElement('div');
      imageLabel.className = 'print-image-tools-label';
      var imageLabelText = document.createElement('span');
      imageLabelText.textContent = '이미지 크기';
      imageLabel.appendChild(imageLabelText);
      var selectionCountBadge = document.createElement('span');
      selectionCountBadge.className = 'print-image-selection-count';
      imageLabel.appendChild(selectionCountBadge);
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
      scaleRange.title = '이미지 크기 직접 조절';
      delete scaleRange.dataset.printSuggestedScale;

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
      bindPointerFocusRelease(widthApplyButton, figure, 'print-image-tools-hover');
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
      bindPointerFocusRelease(selectionButton, figure, 'print-image-tools-hover');
      selectionRow.appendChild(selectionButton);

      var unifyButton = document.createElement('button');
      unifyButton.type = 'button';
      unifyButton.className = 'print-image-tool-button print-image-unify-button';
      unifyButton.textContent = '현재 기준 통일';
      unifyButton.addEventListener('click', function () {
        unifySelectedImagesToFigure(figureId);
      });
      bindPointerFocusRelease(unifyButton, figure, 'print-image-tools-hover');
      selectionRow.appendChild(unifyButton);

      imageTools.appendChild(selectionRow);

      var actionRow = document.createElement('div');
      actionRow.className = 'print-image-tools-row print-image-tools-actions';

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
      bindPointerFocusRelease(resetButton, figure, 'print-image-tools-hover');
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
      bindPointerFocusRelease(deleteButton, figure, 'print-image-tools-hover');
      actionRow.appendChild(deleteButton);

      imageTools.appendChild(actionRow);

      Array.from(figure.querySelectorAll('.print-image-resize-handle')).forEach(function (node) {
        node.remove();
      });

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

      bindHoverToolState(figure, 'print-image-tools-hover', [imageTools]);

      if (!figure.dataset.printImageToolsBound) {
        figure.dataset.printImageToolsBound = 'true';

        figure.addEventListener('click', function (event) {
          if (textEditModeEnabled) return;
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
        clearSelectedTarget({ silent: true });
      });
      document.addEventListener('pointermove', function (event) {
        updateImageScaleSliderDrag(event);
      });
      document.addEventListener('pointerup', function (event) {
        stopImageScaleSliderDrag(true, event);
      });
      document.addEventListener('pointercancel', function (event) {
        stopImageScaleSliderDrag(true, event);
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
    updateEditorBannerStatus(ready ? '블록은 바로 조정하고, 페이지 헤더에서는 빈 페이지를 앞뒤로 넣을 수 있습니다' : '페이지 미리보기 준비 중');
    return ready;
  }

  function watchDirectManipulation() {
    var pagesRoot = ensureRenderedPagesRoot();
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
      'body.print-ready[data-print-preview-font="xlarge"] article.page, body.print-ready[data-print-preview-font="xlarge"] .pagedjs_pages{font-size:1.16em!important;}'
    ].concat(previewSpacingStyleLines()).join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function adjacentSpacingRule(prefix, selectors, declaration) {
    var rules = [];
    var list = Array.isArray(selectors) ? selectors.filter(Boolean) : [];
    list.forEach(function (left) {
      list.forEach(function (right) {
        rules.push(prefix + left + ' + ' + right);
      });
    });
    if (!rules.length) return '';
    return rules.join(',') + '{' + declaration + '}';
  }

  function previewSpacingStyleLines() {
    var pageFlowSelectors = [
      '.print-inline-block',
      '.print-table-block',
      '.print-shortcut-block',
      '.print-figure-pair',
      '.print-numbered-step-pair',
      '.callout',
      'blockquote',
      'pre',
      'details',
      '.print-details-block',
      'figure.image'
    ];
    var majorBodySelectors = [
      '.indented',
      'p',
      'figure',
      'ul',
      'ol',
      'div',
      '.print-inline-block',
      '.print-table-block',
      '.print-shortcut-block',
      '.callout',
      'blockquote',
      'pre',
      'details',
      '.print-details-block'
    ];
    return [
      'body.print-ready{--print-preview-section-top:0.75rem;--print-preview-section-bottom:0.95rem;--print-preview-cluster-top:0.12rem;--print-preview-cluster-bottom:0.55rem;--print-preview-flow-gap:0.18rem;--print-preview-major-gap:0.24rem;--print-preview-list-gap:0.14rem;--print-preview-nested-gap:0.18rem;--print-preview-title-gap:0.22rem;}',
      'body.print-ready[data-print-preview-spacing="compact"]{--print-preview-section-top:0.55rem;--print-preview-section-bottom:0.72rem;--print-preview-cluster-top:0.08rem;--print-preview-cluster-bottom:0.34rem;--print-preview-flow-gap:0.08rem;--print-preview-major-gap:0.14rem;--print-preview-list-gap:0.08rem;--print-preview-nested-gap:0.12rem;--print-preview-title-gap:0.16rem;}',
      'body.print-ready[data-print-preview-spacing="normal"]{--print-preview-section-top:0.75rem;--print-preview-section-bottom:0.95rem;--print-preview-cluster-top:0.12rem;--print-preview-cluster-bottom:0.55rem;--print-preview-flow-gap:0.18rem;--print-preview-major-gap:0.24rem;--print-preview-list-gap:0.14rem;--print-preview-nested-gap:0.18rem;--print-preview-title-gap:0.22rem;}',
      'body.print-ready[data-print-preview-spacing="relaxed"]{--print-preview-section-top:0.95rem;--print-preview-section-bottom:1.18rem;--print-preview-cluster-top:0.22rem;--print-preview-cluster-bottom:0.72rem;--print-preview-flow-gap:0.28rem;--print-preview-major-gap:0.34rem;--print-preview-list-gap:0.24rem;--print-preview-nested-gap:0.24rem;--print-preview-title-gap:0.28rem;}',
      'body.print-ready[data-print-preview-spacing="airy"]{--print-preview-section-top:1.15rem;--print-preview-section-bottom:1.42rem;--print-preview-cluster-top:0.30rem;--print-preview-cluster-bottom:0.90rem;--print-preview-flow-gap:0.4rem;--print-preview-major-gap:0.46rem;--print-preview-list-gap:0.32rem;--print-preview-nested-gap:0.30rem;--print-preview-title-gap:0.34rem;}',
      'body.print-ready .print-section{margin:var(--print-preview-section-top) 0 var(--print-preview-section-bottom)!important;}',
      'body.print-ready .print-figure-pair, body.print-ready .print-numbered-step-pair, body.print-ready .print-shortcut-block{margin-top:var(--print-preview-cluster-top)!important;margin-bottom:var(--print-preview-cluster-bottom)!important;}',
      'body.print-ready li.print-major-item{margin-top:var(--print-preview-major-gap)!important;}',
      'body.print-ready .print-merge-detached-title-host{margin:var(--print-preview-major-gap) 0 0!important;}',
      'body.print-ready li.print-major-item > .print-major-title, body.print-ready .print-merge-detached-title-host > .print-major-title, body.print-ready .print-merge-detached-title{margin:0 0 var(--print-preview-title-gap)!important;}',
      'body.print-ready ul.bulleted-list > li.print-detached-list-segment + li.print-detached-list-segment{margin-top:var(--print-preview-list-gap)!important;}',
      'body.print-ready ul.bulleted-list ul.bulleted-list{margin-top:var(--print-preview-nested-gap)!important;margin-bottom:var(--print-preview-nested-gap)!important;}',
      'body.print-ready ul.bulleted-list ul.bulleted-list > li{margin-top:calc(var(--print-preview-nested-gap) * 0.6)!important;}',
      adjacentSpacingRule('body.print-ready .page-body > ', pageFlowSelectors, 'margin-top:var(--print-preview-flow-gap)!important'),
      adjacentSpacingRule('body.print-ready li.print-major-item > .print-major-body > ', majorBodySelectors, 'margin-top:var(--print-preview-flow-gap)!important'),
      'body.print-ready .print-numbered-step-pair figure.image, body.print-ready .print-figure-pair figure.image{margin-top:calc(var(--print-preview-flow-gap) + 0.12rem)!important;}'
    ];
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
      'body.print-ready[data-print-preview-font="xlarge"] article.page, body.print-ready[data-print-preview-font="xlarge"] .pagedjs_pages{font-size:1.16em!important;}'
    ].concat(previewSpacingStyleLines(), [
      '  body.print-ready{min-height:100vh;background:var(--print-ui-canvas)!important;--print-stage-max-width:900px;--print-left-rail:0px;--print-right-rail:0px;--print-stage-shift:calc((var(--print-left-rail) - var(--print-right-rail)) / 2);position:relative;overflow-x:hidden;}',
      '  body.print-ready::before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 14% 12%, rgba(240,245,255,0.18) 0%, transparent 30%), radial-gradient(circle at 86% 10%, rgba(251,230,192,0.12) 0%, transparent 24%), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 88px), repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 88px);opacity:0.62;pointer-events:none;z-index:0;}',
      '  body.print-ready::after{content:"";position:fixed;left:50%;top:0;width:min(1120px, 92vw);height:100vh;transform:translateX(-50%);background:linear-gradient(180deg, rgba(255,255,255,0.06), transparent 24%, transparent 76%, rgba(255,255,255,0.04));pointer-events:none;opacity:0.58;z-index:0;}',
      '  body.print-ready.print-editor-open{--print-right-rail:392px;padding-right:0!important;}',
      '  body.print-ready.print-page-sidebar-open{--print-left-rail:226px;}',
      '  body.print-ready .pagedjs_pages{width:min(var(--print-stage-max-width), calc(100vw - 56px - var(--print-left-rail) - var(--print-right-rail)));max-width:var(--print-stage-max-width);margin:0 auto;padding:32px 0 112px;position:relative;transform:translateX(var(--print-stage-shift));transition:transform 180ms ease,width 180ms ease;z-index:1;}',
      '  body.print-ready .pagedjs_page{margin:0 auto 40px!important;border:1px solid rgba(203,213,225,0.78);border-radius:0;background:linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,252,1) 100%);box-shadow:0 38px 80px rgba(2,6,23,0.18), 0 14px 30px rgba(15,23,42,0.10);position:relative;overflow:visible;}',
      '  body.print-ready .pagedjs_page::before{display:none!important;content:none!important;}',
      '  body.print-ready .pagedjs_page::after{content:"";position:absolute;inset:10px;border-radius:0;box-shadow:inset 0 0 0 1px rgba(148,163,184,0.12);pointer-events:none;}',
      '  body.print-ready .pagedjs_page .pagedjs_pagebox, body.print-ready .pagedjs_page .pagedjs_page_content{border-radius:0;overflow:hidden;background:transparent;}',
      '  body.print-ready .print-page-action-group{position:absolute;top:-16px;right:18px;display:flex;gap:8px;z-index:9;opacity:0;transform:translateY(-2px);transition:opacity 140ms ease,transform 140ms ease;}',
      '  body.print-ready .pagedjs_page:hover .print-page-action-group{opacity:1;transform:translateY(0);}',
      '  body.print-ready .print-page-merge-button, body.print-ready .print-page-delete-button, body.print-ready .print-page-insert-button{border:1px solid var(--print-editor-border);border-radius:999px;padding:5px 10px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 10px 18px rgba(4,6,10,0.22);}',
      '  body.print-ready .print-page-insert-button{border-color:rgba(159,183,216,0.22);color:#e6eef8;}',
      '  body.print-ready .print-page-delete-button{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.28);}',
      '  body.print-ready .print-editor-banner{position:sticky;top:12px;z-index:10000;display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:12px 14px;margin:0 auto 22px;padding:14px 16px 12px;max-width:min(1120px, calc(100vw - 32px));border:1px solid rgba(233,240,248,0.08);border-radius:20px;background:rgba(11,14,18,0.84);backdrop-filter:blur(20px) saturate(140%);box-shadow:0 26px 64px rgba(2,6,23,0.24);transform:translateX(var(--print-stage-shift));transition:transform 180ms ease,border-color 160ms ease,box-shadow 160ms ease;overflow:hidden;}',
      '  body.print-ready .print-editor-banner::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01));pointer-events:none;}',
      '  body.print-ready .print-editor-banner > *{position:relative;z-index:1;}',
      '  body.print-ready .print-editor-banner-brand{display:flex;align-items:center;gap:12px;min-width:0;padding-right:14px;border-right:1px solid rgba(233,240,248,0.08);}',
      '  body.print-ready .print-editor-banner-brand::before{content:"";flex:0 0 10px;width:10px;height:10px;border-radius:999px;background:linear-gradient(180deg, #dbe6f3, #90a8c8);box-shadow:0 0 0 4px rgba(159,183,216,0.10);}',
      '  body.print-ready .print-editor-banner-brand-text{min-width:0;display:flex;flex-direction:column;gap:2px;}',
      '  body.print-ready .print-editor-banner-app{font-size:0.66rem;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-banner-title{display:block;min-width:0;font-size:0.98rem;font-weight:800;line-height:1.2;color:var(--print-ui-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '  body.print-ready .print-editor-banner-subtitle{font-size:0.72rem;font-weight:700;line-height:1.2;color:var(--print-ui-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '  body.print-ready .print-editor-banner-mode{display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;min-height:24px;padding:0 10px;border:1px solid rgba(233,240,248,0.10);border-radius:999px;background:rgba(255,255,255,0.05);font-size:0.68rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-banner-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;}',
      '  body.print-ready .print-editor-banner-actions.is-primary{grid-column:1 / -1;justify-content:flex-start;}',
      '  body.print-ready .print-editor-banner-actions.is-secondary{justify-content:flex-end;}',
      '  body.print-ready .print-editor-banner-meta{grid-column:1 / -1;display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding-top:10px;border-top:1px solid rgba(233,240,248,0.08);}',
      '  body.print-ready .print-editor-banner-button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;border:1px solid rgba(233,240,248,0.10);border-radius:12px;padding:0 12px;background:rgba(255,255,255,0.05);color:var(--print-ui-text);font:inherit;font-size:0.81rem;font-weight:800;cursor:pointer;transition:background 140ms ease,border-color 140ms ease,transform 140ms ease,box-shadow 140ms ease;}',
      '  body.print-ready .print-editor-banner-button:hover{transform:translateY(-1px);background:rgba(255,255,255,0.08);border-color:rgba(233,240,248,0.16);box-shadow:0 12px 24px rgba(2,6,23,0.16);}',
      '  body.print-ready .print-editor-banner-button.is-primary{background:linear-gradient(180deg, #d9e5f2 0%, #b8c9de 100%);border-color:rgba(211,225,241,0.72);color:#17202c;box-shadow:0 12px 24px rgba(2,6,23,0.16);}',
      '  body.print-ready .print-editor-banner-button.is-recommendation, body.print-ready .print-editor-banner-button.is-toggle.is-active, body.print-ready .print-editor-banner-button.is-panel.is-active{background:rgba(159,183,216,0.16);border-color:rgba(159,183,216,0.26);color:#eef3f9;}',
      '  body.print-ready .print-editor-banner-button.is-panel{position:relative;padding-left:42px;padding-right:14px;overflow:hidden;}',
      '  body.print-ready .print-editor-banner-button.is-panel::before{content:"";position:absolute;left:14px;top:50%;width:16px;height:16px;border-radius:6px;background:linear-gradient(180deg, rgba(219,230,243,0.96), rgba(144,168,200,0.82));box-shadow:inset 5px 0 0 rgba(23,32,44,0.22), 0 6px 14px rgba(2,6,23,0.18);transform:translateY(-50%) scale(1);transition:transform 180ms ease,box-shadow 180ms ease,background 180ms ease;}',
      '  body.print-ready .print-editor-banner-button.is-panel::after{content:"";position:absolute;left:24px;top:50%;width:4px;height:4px;border-radius:999px;background:rgba(17,24,39,0.52);transform:translate(-50%,-50%);box-shadow:0 8px 0 rgba(17,24,39,0.32), 0 -8px 0 rgba(17,24,39,0.18);transition:transform 180ms ease,opacity 180ms ease;}',
      '  body.print-ready .print-editor-banner-button.is-panel:hover::before{transform:translateY(-50%) scale(1.04);box-shadow:inset 5px 0 0 rgba(23,32,44,0.24), 0 10px 18px rgba(2,6,23,0.20);}',
      '  body.print-ready .print-editor-banner-button.is-panel.is-active::before{background:linear-gradient(180deg, #e6eef8, #b6cae2);transform:translateY(-50%) scale(1.05);}',
      '  body.print-ready .print-editor-banner-button.is-panel.is-active::after{transform:translate(-50%,-50%) scale(1.08);opacity:0.92;}',
      '  body.print-ready .print-editor-banner-button.is-danger{color:var(--print-ui-danger);border-color:rgba(239,179,174,0.24);background:rgba(239,179,174,0.08);}',
      '  body.print-ready .print-editor-banner-button:disabled{cursor:default;opacity:0.48;transform:none!important;box-shadow:none!important;}',
      '  body.print-ready .print-editor-banner-summary{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0;}',
      '  body.print-ready .print-editor-banner-status{margin-left:auto;min-width:260px;max-width:100%;font-size:0.78rem;font-weight:700;color:var(--print-ui-muted);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '  body.print-ready .print-editor-launcher{display:none!important;}',
      '  body.print-ready .print-editor-panel{position:fixed;top:16px;right:16px;bottom:16px;width:min(392px, calc(100vw - 32px));display:flex!important;flex-direction:column;gap:10px;padding:14px;border:1px solid rgba(233,240,248,0.08);border-radius:22px;background:rgba(11,14,18,0.90);backdrop-filter:blur(20px) saturate(140%);box-shadow:0 28px 72px rgba(2,6,23,0.30);z-index:9998;overflow:hidden;opacity:0;visibility:hidden;pointer-events:none;transform:translateX(22px) scale(0.985);transform-origin:right center;transition:transform 220ms cubic-bezier(0.22, 1, 0.36, 1),opacity 180ms ease,box-shadow 180ms ease,visibility 0s linear 220ms;}',
      '  body.print-ready .print-editor-panel::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01));pointer-events:none;}',
      '  body.print-ready .print-editor-panel > *{position:relative;z-index:1;}',
      '  body.print-ready.print-editor-open .print-editor-panel{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(0) scale(1);transition:transform 220ms cubic-bezier(0.22, 1, 0.36, 1),opacity 180ms ease,box-shadow 180ms ease;}',
      '  body.print-ready .print-editor-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 4px 2px;}',
      '  body.print-ready .print-editor-title{font-size:1.06rem;font-weight:900;line-height:1.25;margin:0;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-close{position:relative;flex:0 0 auto;width:36px;height:36px;border:1px solid rgba(233,240,248,0.10);background:rgba(255,255,255,0.05);color:transparent;border-radius:999px;padding:0;font:inherit;font-size:0;cursor:pointer;transition:transform 160ms ease,border-color 160ms ease,background 160ms ease,box-shadow 160ms ease;}',
      '  body.print-ready .print-editor-close::before, body.print-ready .print-editor-close::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:1.5px;border-radius:999px;background:rgba(236,243,255,0.92);transform-origin:center;transition:transform 180ms ease,background 160ms ease;}',
      '  body.print-ready .print-editor-close::before{transform:translate(-50%,-50%) rotate(45deg);}',
      '  body.print-ready .print-editor-close::after{transform:translate(-50%,-50%) rotate(-45deg);}',
      '  body.print-ready .print-editor-close:hover{transform:rotate(90deg) scale(1.04);border-color:rgba(233,240,248,0.16);background:rgba(255,255,255,0.08);box-shadow:0 12px 22px rgba(2,6,23,0.16);}',
      '  body.print-ready .print-editor-close:hover::before, body.print-ready .print-editor-close:hover::after{background:#f7fbff;}',
      '  body.print-ready .print-editor-close:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(159,183,216,0.22), 0 12px 22px rgba(2,6,23,0.16);}',
      '  body.print-ready .print-editor-section{padding:12px;border:1px solid rgba(233,240,248,0.08);border-radius:16px;background:rgba(255,255,255,0.04);}',
      '  body.print-ready .print-editor-section.is-list{flex:1;min-height:0;display:flex;flex-direction:column;}',
      '  body.print-ready .print-editor-section-title{margin:0 0 10px;font-size:0.68rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px;}',
      '  body.print-ready .print-editor-summary-chip{display:flex;flex-direction:column;gap:3px;padding:10px 11px;border:1px solid rgba(233,240,248,0.08);border-radius:14px;background:rgba(255,255,255,0.04);}',
      '  body.print-ready .print-editor-summary-chip strong{font-size:1rem;line-height:1.05;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-summary-chip span{font-size:0.68rem;font-weight:800;letter-spacing:0.03em;color:var(--print-ui-subtle);text-transform:uppercase;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip{min-width:76px;padding:6px 9px;gap:2px;background:rgba(255,255,255,0.03);}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip strong{font-size:0.8rem;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip span{font-size:0.58rem;}',
      '  body.print-ready .print-editor-filter-bar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:4px;border:1px solid rgba(233,240,248,0.08);border-radius:12px;background:rgba(255,255,255,0.03);}',
      '  body.print-ready .print-editor-filter-button{border:1px solid transparent;border-radius:10px;padding:8px 10px;background:transparent;color:var(--print-ui-muted);font:inherit;font-size:0.76rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-filter-button.is-active{background:rgba(159,183,216,0.16);border-color:rgba(159,183,216,0.24);color:#eef3f9;}',
      '  body.print-ready .print-editor-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;}',
      '  body.print-ready .print-editor-actions button{min-height:38px;border:1px solid rgba(233,240,248,0.08);background:rgba(255,255,255,0.05);color:var(--print-ui-text);border-radius:12px;padding:9px 10px;font:inherit;font-size:0.8rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-actions button.print-editor-primary, body.print-ready .print-editor-actions button.is-active{background:rgba(159,183,216,0.16);border-color:rgba(159,183,216,0.24);color:#eef3f9;}',
      '  body.print-ready .print-editor-note{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(233,240,248,0.08);font-size:0.8rem;line-height:1.5;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-shortcuts{display:flex;flex-direction:column;gap:8px;}',
      '  body.print-ready .print-editor-shortcut{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(233,240,248,0.08);border-radius:12px;background:rgba(255,255,255,0.03);}',
      '  body.print-ready .print-editor-shortcut-key{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border-radius:999px;background:rgba(159,183,216,0.16);color:#eef3f9;font-size:0.72rem;font-weight:800;letter-spacing:0.02em;white-space:nowrap;}',
      '  body.print-ready .print-editor-shortcut-desc{font-size:0.78rem;line-height:1.45;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-navigator{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:0;border:none;background:transparent;}',
      '  body.print-ready .print-editor-settings{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0;border:none;background:transparent;}',
      '  body.print-ready .print-editor-field{display:flex;flex-direction:column;gap:6px;}',
      '  body.print-ready .print-editor-field-label{font-size:0.74rem;font-weight:800;color:var(--print-ui-muted);}',
      '  body.print-ready .print-editor-search-input{appearance:none;width:100%;min-height:40px;border:1px solid rgba(233,240,248,0.10);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,0.05);font:inherit;font-size:0.84rem;color:var(--print-ui-text);outline:none;}',
      '  body.print-ready .print-editor-search-input::placeholder{color:rgba(214,224,236,0.52);}',
      '  body.print-ready .print-editor-search-input:focus{border-color:rgba(159,183,216,0.34);box-shadow:0 0 0 1px rgba(159,183,216,0.16);}',
      '  body.print-ready .print-editor-search-meta{margin:2px 0 0;font-size:0.74rem;font-weight:700;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-search-results{display:flex;flex-direction:column;gap:8px;max-height:280px;overflow:auto;padding-right:4px;}',
      '  body.print-ready .print-editor-search-result{display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;border:1px solid rgba(233,240,248,0.08);border-radius:14px;padding:11px 12px;background:rgba(255,255,255,0.04);color:var(--print-ui-text);font:inherit;text-align:left;cursor:pointer;transition:border-color 140ms ease,background 140ms ease,transform 140ms ease,box-shadow 140ms ease;}',
      '  body.print-ready .print-editor-search-result:hover{transform:translateY(-1px);border-color:rgba(159,183,216,0.20);background:rgba(255,255,255,0.06);box-shadow:0 12px 24px rgba(2,6,23,0.12);}',
      '  body.print-ready .print-editor-search-result.is-selected{border-color:rgba(159,183,216,0.34);box-shadow:0 0 0 1px rgba(159,183,216,0.22), 0 12px 24px rgba(2,6,23,0.12);}',
      '  body.print-ready .print-editor-search-result-page{display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:0 8px;border-radius:999px;background:rgba(159,183,216,0.16);color:#eef3f9;font-size:0.66rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;}',
      '  body.print-ready .print-editor-search-result-snippet{font-size:0.82rem;line-height:1.55;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-search-result-snippet mark{background:rgba(159,183,216,0.20);color:#f7fbff;padding:0 0.18em;border-radius:4px;}',
      '  body.print-ready .print-editor-select{appearance:none;border:1px solid rgba(233,240,248,0.08);border-radius:10px;padding:9px 10px;background:rgba(255,255,255,0.04);font:inherit;font-size:0.82rem;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-secondary{align-self:end;min-height:38px;border:1px solid rgba(233,240,248,0.08);background:rgba(255,255,255,0.05);color:var(--print-ui-text);border-radius:12px;padding:9px 12px;font:inherit;font-size:0.8rem;font-weight:800;cursor:pointer;white-space:nowrap;}',
      '  body.print-ready .print-editor-list-meta{margin:0 0 10px;font-size:0.76rem;font-weight:800;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-list{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px;}',
      '  body.print-ready .print-editor-empty{padding:14px;border:1px dashed rgba(233,240,248,0.14);border-radius:14px;background:rgba(255,255,255,0.03);font-size:0.82rem;line-height:1.55;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-editor-item{border:1px solid rgba(233,240,248,0.08);border-radius:14px;padding:11px 12px;background:rgba(255,255,255,0.04);box-shadow:inset 0 1px 0 rgba(255,255,255,0.02);}',
      '  body.print-ready .print-editor-item.is-selected{border-color:rgba(159,183,216,0.34);box-shadow:0 0 0 1px rgba(159,183,216,0.22), inset 0 1px 0 rgba(255,255,255,0.02);}',
      '  body.print-ready .print-editor-item.print-mode-force{border-color:rgba(159,183,216,0.34);background:rgba(159,183,216,0.10);}',
      '  body.print-ready .print-editor-item.print-mode-keep{border-color:rgba(255,255,255,0.10);background:rgba(255,255,255,0.025);}',
      '  body.print-ready .print-editor-item.is-recommended{box-shadow:0 0 0 1px rgba(159,183,216,0.24), 0 12px 24px rgba(2,6,23,0.10);}',
      '  body.print-ready .print-editor-item.is-manual{border-color:rgba(245,158,11,0.24);}',
      '  body.print-ready .print-editor-item-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;}',
      '  body.print-ready .print-editor-item-label{margin:0;font-size:0.9rem;font-weight:800;line-height:1.4;color:var(--print-ui-text);}',
      '  body.print-ready .print-editor-item-meta{margin:0;font-size:0.76rem;color:var(--print-ui-subtle);line-height:1.45;}',
      '  body.print-ready .print-editor-suggestion-badge, body.print-ready .print-inline-suggestion-badge{display:inline-flex!important;align-items:center;justify-content:center;width:max-content;margin-top:6px;padding:3px 8px;border-radius:999px;background:rgba(159,183,216,0.16);color:#e5eefb;font-size:0.68rem;font-weight:800;letter-spacing:0.03em;}',
      '  body.print-ready .print-editor-item-jump{border:none;background:transparent;color:#d8e6f8;font:inherit;font-weight:800;cursor:pointer;padding:0;white-space:nowrap;}',
      '  body.print-ready .print-editor-item-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}',
      '  body.print-ready .print-editor-item-controls button{border:1px solid rgba(233,240,248,0.08);background:rgba(255,255,255,0.05);color:var(--print-ui-text);border-radius:10px;padding:8px 6px;font:inherit;font-size:0.78rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-item-controls button.is-active, body.print-ready .print-editor-item-controls button.is-suggested, body.print-ready .print-insert-action-button.is-suggested, body.print-ready .print-image-tool-button.is-suggested{border-color:rgba(159,183,216,0.24);background:rgba(159,183,216,0.16);color:#eef3f9;}',
      '  body.print-ready .print-draggable-candidate{position:relative;overflow:visible;}',
      '  body.print-ready figure.image[data-print-persist-id]{position:relative;overflow:visible;display:flex;flex-direction:column;align-items:center;text-align:center;}',
      '  body.print-ready figure.image[data-print-persist-id] > a, body.print-ready figure.image[data-print-persist-id] > img{display:block;}',
      '  body.print-ready figure.image[data-print-persist-id] img{margin:0 auto;}',
      '  body.print-ready figure.image[data-print-image-scale] img{width:calc(100% * var(--print-image-scale, 1))!important;max-width:calc(100% * var(--print-image-scale, 1))!important;height:auto!important;}',
      '  body.print-ready .print-insert-actions{position:absolute;left:9%;right:9%;top:0;height:0;display:flex;align-items:center;justify-content:center;gap:8px;overflow:visible;pointer-events:auto;z-index:12;}',
      '  body.print-ready .print-insert-actions::before{content:"";position:absolute;left:0;right:0;top:0;transform:translateY(-50%);height:2px;border-radius:999px;background:rgba(47,111,237,0.18);transition:background 120ms ease,opacity 120ms ease;opacity:0.85;}',
      '  body.print-ready .print-draggable-candidate:hover{outline:2px solid rgba(154,179,223,0.18);outline-offset:4px;border-radius:10px;}',
      '  body.print-ready .print-draggable-candidate.print-selected-target > .print-insert-actions::before, body.print-ready .print-insert-actions:focus-within::before{background:rgba(47,111,237,0.42);opacity:1;}',
      '  body.print-ready .print-insert-action-button{position:relative;margin-top:-14px;border:1px solid var(--print-editor-border);border-radius:999px;padding:5px 10px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.73rem;font-weight:800;cursor:pointer;box-shadow:0 12px 20px rgba(4,6,10,0.24);pointer-events:auto;opacity:0;transform:translateY(-4px);transition:opacity 120ms ease,transform 120ms ease,box-shadow 120ms ease;background-clip:padding-box;}',
      '  body.print-ready .print-draggable-candidate.print-selected-target > .print-insert-actions .print-insert-action-button, body.print-ready .print-insert-actions:focus-within .print-insert-action-button{opacity:1;transform:translateY(-14px);box-shadow:0 10px 18px rgba(17,24,39,0.12);}',
      '  body.print-ready .print-draggable-candidate.print-page-top-candidate > .print-insert-actions{top:10px;}',
      '  body.print-ready .print-draggable-candidate.print-page-top-candidate > .print-insert-actions::before{transform:none;opacity:0.72;}',
      '  body.print-ready .print-draggable-candidate.print-page-top-candidate > .print-insert-actions .print-insert-action-button{margin-top:8px;transform:translateY(-6px);}',
      '  body.print-ready .print-draggable-candidate.print-page-top-candidate.print-selected-target > .print-insert-actions .print-insert-action-button, body.print-ready .print-draggable-candidate.print-page-top-candidate > .print-insert-actions:focus-within .print-insert-action-button{transform:translateY(0);}',
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
      '  body.print-ready .print-selected-target:not(figure.image){outline:2px solid rgba(154,179,223,0.44)!important;outline-offset:6px;border-radius:12px;box-shadow:0 0 0 4px rgba(154,179,223,0.10)!important;}',
      '  body.print-ready .print-draggable-candidate.is-dragging{opacity:0.72;}',
      '  body.print-ready .print-inline-tools{position:absolute;top:-8px;right:-8px;display:flex;gap:4px;z-index:8;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity 120ms ease,transform 120ms ease;}',
      '  body.print-ready .print-draggable-candidate.print-selected-target > .print-inline-tools, body.print-ready .print-inline-tools:focus-within, body.print-ready figure.image.print-selected-target > .print-inline-tools{opacity:1;transform:translateY(0);pointer-events:auto;}',
      '  body.print-ready .print-inline-tool{display:inline-flex!important;align-items:center;justify-content:center;min-width:24px;height:24px;border:1px solid var(--print-editor-border);border-radius:999px;padding:0 6px;background:var(--print-ui-surface-soft);color:var(--print-ui-text);font:inherit;font-size:0.72rem;font-weight:800;cursor:pointer;box-shadow:0 8px 14px rgba(4,6,10,0.22);}',
      '  body.print-ready .print-inline-tool.is-danger{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.28);}',
      '  body.print-ready figure.image.print-selected-target, body.print-ready figure.image.print-image-group-selected{outline:none!important;box-shadow:none!important;border-radius:0!important;}',
      '  body.print-ready .print-image-tools{position:absolute;top:12px;left:50%;display:flex;flex-direction:column;gap:8px;width:min(320px, calc(100vw - 40px));max-width:calc(100vw - 40px);padding:10px 12px;border:1px solid var(--print-editor-border);border-radius:14px;background:var(--print-ui-surface);color:var(--print-ui-text);box-shadow:var(--print-ui-shadow);z-index:8;opacity:0;transform:translate(-50%,-6px) scale(0.96);transform-origin:center top;transition:opacity 140ms ease,transform 140ms ease;pointer-events:none;}',
      '  body.print-ready figure.image[data-print-persist-id].print-image-tools-open .print-image-tools, body.print-ready .print-image-tools:focus-within{opacity:1;transform:translate(-50%,0) scale(1);pointer-events:auto;}',
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
      '  body.print-ready.print-ui-minimal .print-editor-panel{display:none!important;}',
      '  body.print-ready.print-ui-minimal .print-inline-tools, body.print-ready.print-ui-minimal .print-inline-suggestion-badge{display:none!important;}',
      '  body.print-ready.print-ui-minimal .print-editor-banner{gap:10px 12px;padding:12px 14px 11px;}',
      '  body.print-ready.print-ui-minimal .print-editor-banner-actions.is-secondary{display:none!important;}',
      '  body.print-ready.print-ui-minimal .print-editor-banner-meta{padding-top:8px;}',
      '  body.print-ready .print-page-sidebar-toggle{position:fixed;top:112px;left:18px;display:inline-flex!important;align-items:center;justify-content:center;width:46px;height:96px;padding:0;border:1px solid rgba(233,240,248,0.10);border-radius:24px;background:linear-gradient(180deg, rgba(16,21,28,0.96), rgba(8,11,16,0.92));color:var(--print-ui-text);cursor:pointer;box-shadow:0 22px 46px rgba(2,6,23,0.24), inset 0 1px 0 rgba(255,255,255,0.05);z-index:18;overflow:visible;transition:left 240ms cubic-bezier(0.2, 0.9, 0.3, 1),transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1),border-color 240ms cubic-bezier(0.2, 0.9, 0.3, 1),background 240ms cubic-bezier(0.2, 0.9, 0.3, 1),box-shadow 240ms cubic-bezier(0.2, 0.9, 0.3, 1);backdrop-filter:blur(20px) saturate(150%);}',
      '  body.print-ready .print-page-sidebar-toggle::before{content:"";position:absolute;inset:6px;border-radius:18px;background:linear-gradient(180deg, rgba(159,183,216,0.12), rgba(159,183,216,0.02));opacity:0.94;transition:transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1),opacity 180ms ease,background 240ms cubic-bezier(0.2, 0.9, 0.3, 1),inset 240ms cubic-bezier(0.2, 0.9, 0.3, 1);}',
      '  body.print-ready .print-page-sidebar-toggle::after{content:attr(data-sidebar-label);position:absolute;left:calc(100% + 12px);top:50%;padding:7px 10px;border:1px solid rgba(233,240,248,0.08);border-radius:10px;background:rgba(10,13,18,0.94);color:var(--print-ui-text);font-size:0.68rem;font-weight:800;letter-spacing:0.03em;line-height:1;white-space:nowrap;opacity:0;pointer-events:none;transform:translateY(-50%) translateX(-4px);transition:opacity 180ms ease,transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1);box-shadow:0 12px 22px rgba(2,6,23,0.20);}',
      '  body.print-ready .print-page-sidebar-toggle:hover{transform:translateY(-2px);border-color:rgba(233,240,248,0.16);background:linear-gradient(180deg, rgba(18,24,32,0.98), rgba(10,14,20,0.96));box-shadow:0 26px 52px rgba(2,6,23,0.30), inset 0 1px 0 rgba(255,255,255,0.08);}',
      '  body.print-ready .print-page-sidebar-toggle:hover::before{opacity:1;background:linear-gradient(180deg, rgba(174,197,255,0.16), rgba(159,183,216,0.03));}',
      '  body.print-ready .print-page-sidebar-toggle:hover::after, body.print-ready .print-page-sidebar-toggle:focus-visible::after{opacity:1;transform:translateY(-50%) translateX(0);}',
      '  body.print-ready .print-page-sidebar-toggle:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(159,183,216,0.20), 0 26px 52px rgba(2,6,23,0.30);}',
      '  body.print-ready .print-page-sidebar-toggle-handle{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;height:100%;z-index:1;}',
      '  body.print-ready .print-page-sidebar-toggle-handle::before{content:"";position:absolute;left:50%;top:50%;width:2px;height:34px;border-radius:999px;background:linear-gradient(180deg, rgba(236,243,255,0.16), rgba(236,243,255,0.58), rgba(236,243,255,0.16));transform:translate(-50%, -50%) scaleY(0.94);opacity:0.42;transition:transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1),opacity 180ms ease,background 240ms cubic-bezier(0.2, 0.9, 0.3, 1);}',
      '  body.print-ready .print-page-sidebar-toggle-handle::after{content:"";position:absolute;left:50%;top:50%;width:24px;height:24px;border-radius:999px;background:radial-gradient(circle, rgba(159,183,216,0.70) 0 28%, rgba(159,183,216,0.12) 30%, transparent 72%);transform:translate(-50%, -50%) scale(0.9);opacity:0.68;transition:transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1),opacity 180ms ease;}',
      '  body.print-ready .print-page-sidebar-toggle-chevron{display:block;width:9px;height:9px;border-top:2px solid rgba(236,243,255,0.96);border-right:2px solid rgba(236,243,255,0.96);transform:translateX(-1px) rotate(45deg);opacity:0.86;filter:drop-shadow(0 4px 10px rgba(6,10,16,0.24));transition:transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1),opacity 180ms ease,filter 240ms cubic-bezier(0.2, 0.9, 0.3, 1);}',
      '  body.print-ready .print-page-sidebar-toggle-chevron + .print-page-sidebar-toggle-chevron{margin-top:-4px;opacity:0.34;}',
      '  body.print-ready .print-page-sidebar-toggle:hover .print-page-sidebar-toggle-chevron{opacity:0.94;}',
      '  body.print-ready .print-page-sidebar-toggle:hover .print-page-sidebar-toggle-chevron + .print-page-sidebar-toggle-chevron{opacity:0.52;}',
      '  body.print-ready .print-page-sidebar{position:fixed;top:72px;left:16px;bottom:16px;width:220px;padding:14px 12px 16px;border:1px solid rgba(233,240,248,0.08);border-radius:22px;background:rgba(10,13,18,0.88);color:var(--print-ui-text);box-shadow:24px 0 56px rgba(2,6,23,0.24);backdrop-filter:blur(22px) saturate(150%);z-index:17;display:flex;flex-direction:column;gap:12px;opacity:0;transform:translateX(calc(-100% - 18px));transform-origin:left center;transition:transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1),opacity 180ms ease,box-shadow 240ms cubic-bezier(0.2, 0.9, 0.3, 1);}',
      '  body.print-ready .print-page-sidebar::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01));pointer-events:none;border-radius:inherit;}',
      '  body.print-ready .print-page-sidebar > *{position:relative;z-index:1;}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar{opacity:1;transform:translateX(0);}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle{left:210px;background:linear-gradient(180deg, rgba(18,24,32,0.98), rgba(11,15,22,0.96));border-color:rgba(159,183,216,0.22);box-shadow:0 24px 52px rgba(2,6,23,0.30), inset 0 1px 0 rgba(255,255,255,0.08);}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle::before{opacity:1;transform:translateX(1px);background:linear-gradient(180deg, rgba(174,197,255,0.18), rgba(159,183,216,0.05));}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle-handle::before{opacity:0.58;transform:translate(-50%, -50%) scaleY(1);background:linear-gradient(180deg, rgba(236,243,255,0.10), rgba(236,243,255,0.68), rgba(236,243,255,0.10));}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle-handle::after{transform:translate(-50%, -50%) scale(1);opacity:0.9;}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle-chevron{transform:translateX(1px) rotate(225deg);opacity:0.96;}',
      '  body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle-chevron + .print-page-sidebar-toggle-chevron{transform:translateX(1px) rotate(225deg);opacity:0.5;}',
      '  body.print-ready.print-page-sidebar-open .pagedjs_pages{margin-left:auto;}',
      '  body.print-ready .print-page-sidebar-header{display:flex;flex-direction:column;gap:4px;padding:2px 6px 0;}',
      '  body.print-ready .print-page-sidebar-title{font-size:0.78rem;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-page-sidebar-subtitle{display:block;font-size:0.72rem;font-weight:700;line-height:1.4;color:var(--print-ui-muted);}',
      '  body.print-ready .print-page-sidebar-list{flex:1;overflow:auto;display:flex;flex-direction:column;align-items:stretch;gap:10px;padding:6px 2px 14px;scrollbar-gutter:stable;}',
      '  body.print-ready .print-page-sidebar-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;padding:12px 4px 13px;border:1px solid transparent;border-radius:18px;background:transparent;color:var(--print-ui-text);text-align:center;font:inherit;cursor:pointer;transition:transform 140ms ease,background 140ms ease,box-shadow 140ms ease,border-color 140ms ease;}',
      '  body.print-ready .print-page-sidebar-item:hover{background:rgba(255,255,255,0.03);border-color:rgba(233,240,248,0.06);transform:translateY(-1px);}',
      '  body.print-ready .print-page-sidebar-item.is-active{background:linear-gradient(180deg, rgba(159,183,216,0.14), rgba(159,183,216,0.05));border-color:rgba(159,183,216,0.16);box-shadow:0 18px 28px rgba(2,6,23,0.14), inset 0 1px 0 rgba(255,255,255,0.04);}',
      '  body.print-ready .print-page-sidebar-thumb{position:relative;box-sizing:border-box;flex:0 0 auto;width:160px;max-width:100%;background:transparent;overflow:hidden;border-radius:0;}',
      '  body.print-ready .print-page-sidebar-thumb-viewport{position:relative;box-sizing:border-box;display:block;width:100%;height:100%;padding:0;background:#fff;overflow:hidden;border-radius:0;transition:background 140ms ease;}',
      '  body.print-ready .print-page-sidebar-sheet{position:relative;display:block;transform-origin:top left;border-radius:0;overflow:hidden;background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,0.08), 0 12px 20px rgba(4,6,10,0.16);pointer-events:none;transition:box-shadow 140ms ease,transform 140ms ease;}',
      '  body.print-ready .print-page-sidebar-preview{position:relative;display:block;width:100%;min-height:100%;background:transparent;pointer-events:none;}',
      '  body.print-ready .print-page-sidebar-preview-content{max-width:none!important;min-height:100%;margin:0!important;border-radius:0!important;box-shadow:none!important;pointer-events:none;}',
      '  body.print-ready .print-page-sidebar-preview-pagebox{width:100%!important;height:100%!important;display:grid!important;background:#fff;}',
      '  body.print-ready .print-page-sidebar-preview .pagedjs_margin:not(.hasContent){visibility:hidden;}',
      '  body.print-ready .print-page-sidebar-preview .pagedjs_pagebox > .pagedjs_area{background:transparent;}',
      '  body.print-ready .print-page-sidebar-preview .pagedjs_pagebox > .pagedjs_area > .pagedjs_page_content, body.print-ready .print-page-sidebar-preview .pagedjs_pagebox > .pagedjs_area > .pagedjs_page_content > div{height:100%!important;min-height:100%!important;}',
      '  body.print-ready .print-page-sidebar-sheet .pagedjs_page, body.print-ready .print-page-sidebar-sheet article.page{margin:0!important;box-shadow:none!important;}',
      '  body.print-ready .print-page-sidebar-sheet .print-editor-banner, body.print-ready .print-page-sidebar-sheet .print-editor-panel, body.print-ready .print-page-sidebar-sheet .print-editor-launcher, body.print-ready .print-page-sidebar-sheet .print-insert-actions, body.print-ready .print-page-sidebar-sheet .print-page-dropzone, body.print-ready .print-page-sidebar-sheet .print-inline-dropzone, body.print-ready .print-page-sidebar-sheet .print-image-tools, body.print-ready .print-page-sidebar-sheet .print-page-target-highlight, body.print-ready .print-page-sidebar-sheet .print-editor-target-highlight{display:none!important;}',
      '  body.print-ready .print-page-sidebar-thumb-number{display:none!important;}',
      '  body.print-ready .print-page-sidebar-item.is-active .print-page-sidebar-thumb-viewport{background:#fff;}',
      '  body.print-ready .print-page-sidebar-item.is-active .print-page-sidebar-sheet{transform:translateY(-1px);box-shadow:inset 0 0 0 1px rgba(159,183,216,0.56), 0 18px 30px rgba(2,6,23,0.18);}',
      '  body.print-ready .print-page-sidebar-number{display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:24px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,0.04);font-size:0.70rem;font-weight:900;line-height:1;color:var(--print-ui-muted);letter-spacing:0.04em;transition:background 140ms ease,color 140ms ease,box-shadow 140ms ease;}',
      '  body.print-ready .print-page-sidebar-item.is-active .print-page-sidebar-number{background:rgba(159,183,216,0.22);color:#f8fbff;box-shadow:inset 0 0 0 1px rgba(174,197,255,0.22);}',
      '  body.print-ready .print-drag-handle{cursor:grab!important;}',
      '  body.print-ready.print-drag-active .print-drag-handle{cursor:grabbing!important;}',
      '  body.print-ready.print-text-edit-mode .print-editor-panel, body.print-ready.print-text-edit-mode .print-editor-launcher, body.print-ready.print-text-edit-mode .print-page-sidebar, body.print-ready.print-text-edit-mode .print-page-sidebar-toggle, body.print-ready.print-text-edit-mode .print-page-chrome, body.print-ready.print-text-edit-mode .print-page-action-group, body.print-ready.print-text-edit-mode .print-page-merge-button, body.print-ready.print-text-edit-mode .print-page-delete-button, body.print-ready.print-text-edit-mode .print-page-dropzone, body.print-ready.print-text-edit-mode .print-inline-dropzone, body.print-ready.print-text-edit-mode .print-inline-tools, body.print-ready.print-text-edit-mode .print-insert-actions, body.print-ready.print-text-edit-mode .print-inline-suggestion-badge, body.print-ready.print-text-edit-mode .print-image-tools{display:none!important;}',
      '  body.print-ready.print-text-edit-mode .pagedjs_pages{margin-left:auto!important;padding-top:10px;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner{max-width:min(980px, calc(100vw - 28px));grid-template-columns:minmax(0,1fr) auto;gap:10px 12px;background:rgba(12,16,22,0.96);border-color:rgba(233,240,248,0.12);box-shadow:0 24px 48px rgba(2,6,23,0.28);}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-brand{padding-right:0;border-right:none;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-summary{display:none!important;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-actions.is-secondary{display:none!important;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-actions.is-primary{grid-column:auto;justify-content:flex-end;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-meta{grid-column:1 / -1;padding-top:0;border-top:none;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-button{display:none!important;}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-button[data-editor-role="text-edit-toggle-banner"]{display:inline-flex!important;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-color:rgba(159,183,216,0.28);background:rgba(159,183,216,0.16);color:#f8fbff;box-shadow:0 12px 24px rgba(2,6,23,0.18);}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-button[data-editor-role="text-edit-toggle-banner"].is-active{background:rgba(159,183,216,0.24);border-color:rgba(159,183,216,0.36);}',
      '  body.print-ready.print-text-edit-mode .print-editor-banner-status{display:block!important;margin-left:0!important;text-align:left;color:#d6deea;font-size:0.82rem;}',
      '  body.print-ready.print-text-edit-mode .print-selected-target, body.print-ready.print-text-edit-mode .print-page-target-highlight, body.print-ready.print-text-edit-mode figure.image.print-image-group-selected{outline:none!important;box-shadow:none!important;}',
      '  body.print-ready.print-text-edit-mode [data-print-edit-id]{cursor:text;outline:2px dashed rgba(47,111,237,0.22);outline-offset:3px;border-radius:4px;min-height:1em;}',
      '  body.print-ready.print-text-edit-mode [data-print-edit-id]:focus{outline:2px solid rgba(124,161,255,0.52);background:rgba(124,161,255,0.05);}',
      '  body.print-ready .print-has-manual-gap{margin-top:var(--print-manual-gap, 0.9em)!important;}',
      '  body.print-ready .print-page-target-highlight{box-shadow:0 0 0 4px rgba(154,179,223,0.16), 0 18px 34px rgba(4,6,10,0.22)!important;}',
      '  body.print-ready .print-editor-target-highlight{box-shadow:0 0 0 3px rgba(154,179,223,0.22)!important;}',
      '  @media (max-width: 1280px){body.print-ready.print-editor-open{--print-right-rail:0px;padding-right:0;}body.print-ready.print-page-sidebar-open{--print-left-rail:0px;}body.print-ready .print-editor-panel{width:min(400px, calc(100vw - 28px));}body.print-ready .pagedjs_pages, body.print-ready .print-editor-banner, body.print-ready article.page{transform:none;}}',
      '  @media (max-width: 900px){body.print-ready .print-editor-banner{grid-template-columns:minmax(0,1fr);gap:10px;padding:12px;transform:none;}body.print-ready .print-editor-banner-brand{padding-right:0;border-right:none;}body.print-ready .print-editor-banner-actions{justify-content:flex-start;}body.print-ready .print-editor-banner-meta{padding-top:8px;}body.print-ready .print-editor-banner-status{margin-left:0;min-width:0;text-align:left;}body.print-ready .print-editor-panel{top:auto;left:12px;right:12px;bottom:12px;width:auto;max-height:78vh;border-radius:18px;}body.print-ready .print-editor-settings{grid-template-columns:1fr;}body.print-ready .print-editor-summary{grid-template-columns:repeat(2,minmax(0,1fr));}body.print-ready .print-page-sidebar{width:min(68vw,220px);}body.print-ready .print-page-sidebar-toggle{top:104px;left:8px;width:44px;height:90px;}body.print-ready.print-page-sidebar-open{--print-left-rail:0px;}body.print-ready.print-page-sidebar-open .print-page-sidebar-toggle{left:calc(min(68vw,220px) - 2px);}body.print-ready .pagedjs_pages{width:min(var(--print-stage-max-width), calc(100vw - 24px));padding-top:24px;transform:none;}body.print-ready article.page{width:min(1040px, calc(100vw - 24px));transform:none;}}'
    ]).join('');
    (document.head || document.documentElement).appendChild(style);
    ensurePrintChromeHideStyles();
  }

  function ensurePrintChromeHideStyles() {
    if (document.getElementById('notion-printer-print-hide-style')) return;
    var style = document.createElement('style');
    style.id = 'notion-printer-print-hide-style';
    style.media = 'print';
    style.setAttribute('data-pagedjs-ignore', 'true');
    style.textContent = [
      'body.print-ready,',
      'body.print-ready.print-page-sidebar-open,',
      'body.print-ready.print-editor-open{--print-left-rail:0px!important;--print-right-rail:0px!important;padding-right:0!important;}',
      'body.print-ready .print-editor-banner,',
      'body.print-ready .print-editor-launcher,',
      'body.print-ready .print-editor-panel,',
      'body.print-ready .print-page-sidebar,',
      'body.print-ready .print-page-sidebar-toggle,',
      'body.print-ready .print-page-dropzone,',
      'body.print-ready .print-inline-dropzone,',
      'body.print-ready .print-drag-handle,',
      'body.print-ready .print-page-action-group,',
      'body.print-ready .print-page-merge-button,',
      'body.print-ready .print-page-delete-button,',
      'body.print-ready .print-page-insert-button,',
      'body.print-ready .print-image-tools,',
      'body.print-ready .print-inline-tools,',
      'body.print-ready .print-insert-actions,',
      'body.print-ready .print-page-chrome,',
      'body.print-ready .print-page-target-highlight,',
      'body.print-ready .print-editor-target-highlight,',
      'body.print-ready .print-inline-suggestion-badge{display:none!important;}',
      'html, body{margin:0!important;padding:0!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      'body.print-ready .pagedjs_pages{width:var(--pagedjs-width)!important;max-width:var(--pagedjs-width)!important;margin:0!important;padding:0!important;transform:none!important;overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;}',
      'body.print-ready .pagedjs_page{width:var(--pagedjs-width)!important;min-width:var(--pagedjs-width)!important;max-width:var(--pagedjs-width)!important;height:var(--pagedjs-height)!important;min-height:var(--pagedjs-height)!important;max-height:var(--pagedjs-height)!important;margin:0!important;padding:0!important;border:none!important;box-shadow:none!important;background:#fff!important;overflow:hidden!important;break-after:page!important;page-break-after:always!important;}',
      'body.print-ready .pagedjs_page:last-child{break-after:auto!important;page-break-after:auto!important;}',
      'body.print-ready .pagedjs_page::before, body.print-ready .pagedjs_page::after{display:none!important;content:none!important;}',
      'body.print-ready .pagedjs_sheet{width:var(--pagedjs-width)!important;min-width:var(--pagedjs-width)!important;max-width:var(--pagedjs-width)!important;height:var(--pagedjs-height)!important;min-height:var(--pagedjs-height)!important;max-height:var(--pagedjs-height)!important;margin:0!important;padding:0!important;overflow:hidden!important;}',
      'body.print-ready .pagedjs_pagebox{width:var(--pagedjs-pagebox-width)!important;min-width:var(--pagedjs-pagebox-width)!important;max-width:var(--pagedjs-pagebox-width)!important;height:var(--pagedjs-pagebox-height)!important;min-height:var(--pagedjs-pagebox-height)!important;max-height:var(--pagedjs-pagebox-height)!important;overflow:hidden!important;}',
      'body.print-ready .pagedjs_pagebox > .pagedjs_area{overflow:hidden!important;}',
      'body.print-ready .pagedjs_pagebox > .pagedjs_area > .pagedjs_page_content{overflow:hidden!important;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);

    if (!document.getElementById('notion-printer-print-state-style')) {
      var stateStyle = document.createElement('style');
      stateStyle.id = 'notion-printer-print-state-style';
      stateStyle.setAttribute('data-pagedjs-ignore', 'true');
      stateStyle.textContent = [
        'body.print-ready.print-is-printing .print-editor-banner,',
        'body.print-ready.print-is-printing .print-editor-launcher,',
        'body.print-ready.print-is-printing .print-editor-panel,',
        'body.print-ready.print-is-printing .print-page-sidebar,',
        'body.print-ready.print-is-printing .print-page-sidebar-toggle,',
        'body.print-ready.print-is-printing .print-page-dropzone,',
        'body.print-ready.print-is-printing .print-inline-dropzone,',
        'body.print-ready.print-is-printing .print-drag-handle,',
        'body.print-ready.print-is-printing .print-page-action-group,',
        'body.print-ready.print-is-printing .print-page-merge-button,',
        'body.print-ready.print-is-printing .print-page-delete-button,',
        'body.print-ready.print-is-printing .print-page-insert-button,',
        'body.print-ready.print-is-printing .print-image-tools,',
        'body.print-ready.print-is-printing .print-inline-tools,',
        'body.print-ready.print-is-printing .print-inline-suggestion-badge,',
        'body.print-ready.print-is-printing .print-insert-actions,',
        'body.print-ready.print-is-printing .print-page-target-highlight,',
        'body.print-ready.print-is-printing .print-editor-target-highlight,',
        'body.print-ready.print-is-printing .print-page-chrome{display:none!important;}'
      ].join('');
      (document.head || document.documentElement).appendChild(stateStyle);
    }
    ensurePrintLifecycleBinding();
  }

  function ensurePrintLifecycleBinding() {
    if (!document.documentElement || document.documentElement.dataset.printLifecycleBound === 'true') return;
    document.documentElement.dataset.printLifecycleBound = 'true';
    function syncPrintingState(active) {
      if (!document.body) return;
      document.body.classList.toggle('print-is-printing', !!active);
    }
    window.addEventListener('beforeprint', function () {
      syncPrintingState(true);
    });
    window.addEventListener('afterprint', function () {
      syncPrintingState(false);
    });
    if (window.matchMedia) {
      var printMedia = window.matchMedia('print');
      var listener = function (event) {
        syncPrintingState(!!(event && event.matches));
      };
      if (typeof printMedia.addEventListener === 'function') {
        printMedia.addEventListener('change', listener);
      } else if (typeof printMedia.addListener === 'function') {
        printMedia.addListener(listener);
      }
      syncPrintingState(!!printMedia.matches);
    }
  }

  function ensurePageChromeStyles() {
    if (document.getElementById('notion-printer-page-chrome-style')) return;
    var style = document.createElement('style');
    style.id = 'notion-printer-page-chrome-style';
    style.textContent = [
      '  body.print-ready .pagedjs_page, body.print-ready .pagedjs_sheet, body.print-ready .pagedjs_pagebox, body.print-ready .pagedjs_area, body.print-ready .pagedjs_page_content{--pagedjs-width:var(--print-page-width, 210mm)!important;--pagedjs-height:var(--print-page-height, 297mm)!important;--pagedjs-width-right:var(--print-page-width, 210mm)!important;--pagedjs-height-right:var(--print-page-height, 297mm)!important;--pagedjs-width-left:var(--print-page-width, 210mm)!important;--pagedjs-height-left:var(--print-page-height, 297mm)!important;--pagedjs-pagebox-width:var(--print-page-width, 210mm)!important;--pagedjs-pagebox-height:var(--print-page-height, 297mm)!important;--pagedjs-margin-top:var(--print-page-margin-top, 14mm)!important;--pagedjs-margin-right:var(--print-page-margin-right, 14mm)!important;--pagedjs-margin-bottom:var(--print-page-margin-bottom, 18mm)!important;--pagedjs-margin-left:var(--print-page-margin-left, 14mm)!important;}',
      '  body.print-ready .pagedjs_page, body.print-ready .pagedjs_sheet{width:var(--pagedjs-width)!important;height:var(--pagedjs-height)!important;}',
      '  body.print-ready .pagedjs_pagebox{width:var(--pagedjs-pagebox-width)!important;height:var(--pagedjs-pagebox-height)!important;}',
      '  body.print-ready .pagedjs_pagebox > .pagedjs_area{overflow:hidden;}',
      '  body.print-ready .pagedjs_pagebox > .pagedjs_area > .pagedjs_page_content{overflow:hidden;}',
      '  body.print-ready .pagedjs_pages{padding-top:24px;}',
      '  body.print-ready .pagedjs_page{margin:0 auto 40px!important;border:1px solid rgba(203,213,225,0.78);border-radius:0;background:linear-gradient(180deg, rgba(255,255,255,0.99) 0, rgba(248,250,252,1) 100%);box-shadow:var(--print-ui-paper-shadow);}',
      '  body.print-ready .pagedjs_page::before{content:none!important;}',
      '  body.print-ready .pagedjs_page.print-page-continued-top{border-top-color:rgba(47,111,237,0.38);}',
      '  body.print-ready .pagedjs_page.print-page-continued-bottom{border-bottom-color:rgba(47,111,237,0.38);}',
      '  body.print-ready .pagedjs_page.print-selected-target{box-shadow:0 0 0 3px rgba(154,179,223,0.18), var(--print-ui-paper-shadow)!important;}',
      '  body.print-ready .print-page-chrome{position:absolute;left:22px;right:22px;top:-18px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;z-index:10;pointer-events:none;}',
      '  body.print-ready .print-page-chrome-main{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 12px;border:1px solid rgba(233,240,248,0.08);border-radius:16px;background:rgba(10,13,18,0.86);backdrop-filter:blur(18px) saturate(140%);box-shadow:0 18px 36px rgba(2,6,23,0.18);pointer-events:auto;}',
      '  body.print-ready .print-page-chrome-kicker{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
      '  body.print-ready .pagedjs_page[data-print-manual-blank-page="true"], body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] .pagedjs_sheet, body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] .pagedjs_pagebox{min-height:var(--print-manual-blank-page-height, 1120px)!important;height:var(--print-manual-blank-page-height, 1120px)!important;}',
      '  body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] .pagedjs_page_content, body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] .pagedjs_area, body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] article.page, body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] .page-body{min-height:var(--print-manual-blank-content-height, 920px)!important;height:var(--print-manual-blank-content-height, 920px)!important;}',
      '  body.print-ready .pagedjs_page[data-print-manual-blank-page="true"] .page-body{display:block!important;}',
      '  body.print-ready .print-page-chip{display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:0 9px;border-radius:999px;border:1px solid rgba(233,240,248,0.08);background:rgba(255,255,255,0.05);color:var(--print-ui-muted);font-size:0.66rem;font-weight:800;line-height:1.1;letter-spacing:0.04em;text-transform:uppercase;}',
      '  body.print-ready .print-page-chip.is-strong{background:rgba(217,229,242,0.92);color:#17202c;border-color:rgba(217,229,242,0.92);}',
      '  body.print-ready .print-page-chip.is-flow{background:rgba(159,183,216,0.14);border-color:rgba(159,183,216,0.18);color:#e6eef8;}',
      '  body.print-ready .print-page-chip.is-warning{background:var(--print-ui-danger-soft);border-color:rgba(240,177,173,0.22);color:var(--print-ui-danger);}',
      '  body.print-ready .print-page-chrome-title{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.88rem;font-weight:800;line-height:1.35;color:var(--print-ui-text);}',
      '  body.print-ready .print-page-chrome-meta{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.71rem;font-weight:700;line-height:1.35;color:var(--print-ui-subtle);}',
      '  body.print-ready .print-page-action-group{position:static;display:flex;gap:8px;align-items:center;opacity:1!important;transform:none!important;pointer-events:auto;}',
      '  body.print-ready .print-page-merge-button, body.print-ready .print-page-delete-button, body.print-ready .print-page-insert-button{min-height:34px;border:1px solid rgba(233,240,248,0.08);border-radius:12px;padding:0 11px;background:rgba(10,13,18,0.84);color:var(--print-ui-text);font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 14px 24px rgba(2,6,23,0.18);backdrop-filter:blur(14px);}',
      '  body.print-ready .print-page-insert-button{border-color:rgba(159,183,216,0.18);color:#e6eef8;}',
      '  body.print-ready .print-page-delete-button{color:var(--print-ui-danger);border-color:rgba(240,177,173,0.22);}',
      '  body.print-ready .print-page-action-group button:disabled{cursor:not-allowed;opacity:0.48;box-shadow:none;background:rgba(255,255,255,0.05);color:var(--print-ui-subtle);border-color:rgba(255,255,255,0.08);}',
      '  body.print-ready .pagedjs_page.print-selected-target .print-page-chrome-main{box-shadow:0 0 0 3px rgba(159,183,216,0.18), 0 18px 32px rgba(2,6,23,0.22);}',
      '  @media (max-width: 900px){body.print-ready .print-page-chrome{left:10px;right:10px;top:-14px;flex-direction:column;align-items:stretch;}body.print-ready .print-page-chrome-main{padding:8px 10px;}body.print-ready .print-page-chrome-title, body.print-ready .print-page-chrome-meta{max-width:none;}body.print-ready .print-page-action-group{justify-content:flex-end;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
    ensurePrintChromeHideStyles();
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

      if (textEditModeEnabled && event.key === 'Escape') {
        setTextEditMode(false);
        updateEditorBannerStatus('텍스트 수정 모드를 종료했습니다');
        if (editorUiState.open) {
          setEditorPanelOpen(false);
        }
        return;
      }

      if (textEditModeEnabled) {
        return;
      }

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

      if (!event.shiftKey && key === 'Delete') {
        if (deleteSelectedTarget('keyboard_delete')) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === 'Escape') {
        if (editorUiState.open) {
          setEditorPanelOpen(false);
        }
      }
    });
  }

  function pagesRootReady() {
    return pagedRenderReady();
  }

  function createEditorPanelSection(titleText, extraClass) {
    var section = document.createElement('section');
    section.className = 'print-editor-section' + (extraClass ? ' ' + extraClass : '');
    if (titleText) {
      var heading = document.createElement('div');
      heading.className = 'print-editor-section-title';
      heading.textContent = titleText;
      section.appendChild(heading);
    }
    return section;
  }

  function topLevelEditorChromeNode(selector) {
    return Array.from(document.querySelectorAll(selector)).find(function (node) {
      return !(node && node.closest && node.closest('.pagedjs_pages'));
    }) || null;
  }

  function removePagedEditorChromeClones() {
    Array.from(document.querySelectorAll('.pagedjs_pages .print-editor-banner, .pagedjs_pages .print-editor-launcher, .pagedjs_pages .print-editor-panel')).forEach(function (node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }

  function bootstrapEditorUi() {
    if (editorUiBootstrapped) return true;
    if (!pagesRootReady()) return false;
    ensureRenderedPagesRoot();
    ensureEditorOverrideStyles();
    ensurePageChromeStyles();
    buildEditorPanel();
    installEditorKeyboardShortcuts();
    editorUiBootstrapped = true;
    if (uiMode === 'full' && !textEditModeEnabled) {
      editorUiState.open = true;
    }
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
      var filterLabel = filterMode === 'recommended' ? '표시 후보' : (filterMode === 'changed' ? '수정됨만' : '전체');
      editorListMeta.textContent = filterLabel + ' 보기 · ' + candidates.length + ' / ' + totalCount + '개';
    }

    if (!candidates.length) {
      var empty = document.createElement('div');
      empty.className = 'print-editor-empty';
      empty.textContent = filterMode === 'recommended'
        ? '지금은 남아 있는 표시 후보가 없습니다.'
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
    var existingBanner = topLevelEditorChromeNode('.print-editor-banner');
    var existingLauncher = topLevelEditorChromeNode('.print-editor-launcher');
    var existingPanel = topLevelEditorChromeNode('.print-editor-panel');
    if (existingLauncher && existingLauncher.parentNode) {
      existingLauncher.parentNode.removeChild(existingLauncher);
    }
    if (existingBanner && existingPanel) {
      editorBanner = existingBanner;
      editorLauncher = null;
      editorPanel = existingPanel;
      editorBannerTitleNode = editorBanner.querySelector('.print-editor-banner-title');
      editorBannerSubtitleNode = editorBanner.querySelector('.print-editor-banner-subtitle');
      editorBannerModeNode = editorBanner.querySelector('.print-editor-banner-mode');
      editorBannerSummary = editorBanner.querySelector('.print-editor-banner-summary');
      editorPanelSummary = editorPanel.querySelector('.print-editor-summary');
      editorListMeta = editorPanel.querySelector('.print-editor-list-meta');
      editorList = editorPanel.querySelector('.print-editor-list');
      editorPageSelect = editorPanel.querySelector('[data-editor-role="page-select"]');
      editorBlockSelect = editorPanel.querySelector('[data-editor-role="block-select"]');
      editorSearchInput = editorPanel.querySelector('[data-editor-role="search-input"]');
      editorSearchMeta = editorPanel.querySelector('[data-editor-role="search-meta"]');
      editorSearchResults = editorPanel.querySelector('[data-editor-role="search-results"]');
      editorFontSelect = editorPanel.querySelector('[data-editor-role="font-select"]');
      editorSpacingSelect = editorPanel.querySelector('[data-editor-role="spacing-select"]');
      editorNote = editorPanel.querySelector('.print-editor-note');
      editorTextEditToggle = editorPanel.querySelector('[data-editor-role="text-edit-toggle"]');
      editorBannerTextEditToggle = editorBanner.querySelector('[data-editor-role="text-edit-toggle-banner"]');
      editorPanelToggleButton = editorBanner.querySelector('[data-editor-role="panel-toggle"]');
      editorBannerRecommendationButton = editorBanner.querySelector('[data-editor-role="jump-recommendation"]');
      removePagedEditorChromeClones();
      syncEditorUiControls();
      refreshEditorList();
      renderEditorSearchResults();
      return;
    }

    editorBanner = document.createElement('div');
    editorBanner.className = 'print-editor-banner';
    editorBanner.setAttribute('data-pagedjs-ignore', 'true');

    var bannerBrand = document.createElement('div');
    bannerBrand.className = 'print-editor-banner-brand';

    var bannerBrandText = document.createElement('div');
    bannerBrandText.className = 'print-editor-banner-brand-text';

    var bannerApp = document.createElement('span');
    bannerApp.className = 'print-editor-banner-app';
    bannerApp.textContent = 'Notion Printer';
    bannerBrandText.appendChild(bannerApp);

    editorBannerTitleNode = document.createElement('strong');
    editorBannerTitleNode.className = 'print-editor-banner-title';
    editorBannerTitleNode.textContent = editorDocumentTitleText();
    bannerBrandText.appendChild(editorBannerTitleNode);

    editorBannerSubtitleNode = document.createElement('span');
    editorBannerSubtitleNode.className = 'print-editor-banner-subtitle';
    editorBannerSubtitleNode.textContent = '원본 문서 스타일 유지 · 편집 워크스페이스';
    bannerBrandText.appendChild(editorBannerSubtitleNode);
    bannerBrand.appendChild(bannerBrandText);

    editorBannerModeNode = document.createElement('span');
    editorBannerModeNode.className = 'print-editor-banner-mode';
    editorBannerModeNode.textContent = editorVariantLabelText();
    bannerBrand.appendChild(editorBannerModeNode);
    editorBanner.appendChild(bannerBrand);

    var bannerPrimaryActions = document.createElement('div');
    bannerPrimaryActions.className = 'print-editor-banner-actions is-primary';

    var bannerUndo = document.createElement('button');
    bannerUndo.type = 'button';
    bannerUndo.className = 'print-editor-banner-button is-secondary';
    bannerUndo.setAttribute('data-editor-role', 'undo');
    bannerUndo.textContent = '되돌리기';
    bannerUndo.addEventListener('click', function () {
      undoLastEdit();
    });

    var bannerReset = document.createElement('button');
    bannerReset.type = 'button';
    bannerReset.className = 'print-editor-banner-button is-danger';
    bannerReset.setAttribute('data-editor-role', 'reset');
    bannerReset.textContent = '초기화';
    bannerReset.title = '지금까지의 편집 내용을 기본 상태로 초기화';
    bannerReset.addEventListener('click', function () {
      resetAllEdits({ uiSource: 'banner_reset_all' });
    });

    editorPanelToggleButton = document.createElement('button');
    editorPanelToggleButton.type = 'button';
    editorPanelToggleButton.className = 'print-editor-banner-button is-panel';
    editorPanelToggleButton.setAttribute('data-editor-role', 'panel-toggle');
    editorPanelToggleButton.textContent = '편집 패널';
    editorPanelToggleButton.addEventListener('click', function () {
      toggleEditorPanel();
    });
    bannerPrimaryActions.appendChild(editorPanelToggleButton);

    var bannerPrint = document.createElement('button');
    bannerPrint.type = 'button';
    bannerPrint.className = 'print-editor-banner-button is-secondary';
    bannerPrint.setAttribute('data-editor-role', 'print');
    bannerPrint.textContent = '인쇄';
    bannerPrint.addEventListener('click', function () {
      window.print();
    });

    editorBannerTextEditToggle = document.createElement('button');
    editorBannerTextEditToggle.type = 'button';
    editorBannerTextEditToggle.className = 'print-editor-banner-button is-toggle';
    editorBannerTextEditToggle.setAttribute('data-editor-role', 'text-edit-toggle-banner');
    editorBannerTextEditToggle.textContent = '텍스트 수정';
    editorBannerTextEditToggle.addEventListener('click', function () {
      toggleTextEditMode();
    });
    bannerPrimaryActions.appendChild(editorBannerTextEditToggle);
    editorBanner.appendChild(bannerPrimaryActions);

    var bannerSecondaryActions = document.createElement('div');
    bannerSecondaryActions.className = 'print-editor-banner-actions is-secondary';
    bannerSecondaryActions.appendChild(bannerUndo);
    bannerSecondaryActions.appendChild(bannerPrint);
    bannerSecondaryActions.appendChild(bannerReset);
    editorBanner.appendChild(bannerSecondaryActions);

    var bannerMeta = document.createElement('div');
    bannerMeta.className = 'print-editor-banner-meta';
    editorBannerSummary = null;

    var bannerStatus = document.createElement('span');
    bannerStatus.className = 'print-editor-banner-status';
    bannerStatus.textContent = '미리보기 준비됨';
    bannerMeta.appendChild(bannerStatus);
    editorBanner.appendChild(bannerMeta);
    document.body.insertBefore(editorBanner, document.body.firstChild);
    editorLauncher = null;

    editorPanel = document.createElement('aside');
    editorPanel.className = 'print-editor-panel';
    editorPanel.setAttribute('data-pagedjs-ignore', 'true');

    var header = document.createElement('div');
    header.className = 'print-editor-header';

    var titleWrap = document.createElement('div');
    var title = document.createElement('h2');
    title.className = 'print-editor-title';
    title.textContent = '편집 패널';
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'print-editor-close';
    closeButton.setAttribute('aria-label', '편집 패널 닫기');
    closeButton.setAttribute('title', '편집 패널 닫기');
    closeButton.textContent = 'x';
    closeButton.addEventListener('click', function () {
      setEditorPanelOpen(false);
    });
    header.appendChild(closeButton);
    editorPanel.appendChild(header);

    var commandSection = createEditorPanelSection('빠른 작업', 'is-command');
    editorPanelSummary = null;

    var actions = document.createElement('div');
    actions.className = 'print-editor-actions';

    var panelRefresh = document.createElement('button');
    panelRefresh.type = 'button';
    panelRefresh.className = 'print-editor-primary';
    panelRefresh.textContent = '미리보기 다시 계산';
    panelRefresh.title = '현재 편집 내용을 기준으로 페이지 나눔과 미리보기를 다시 계산합니다';
    panelRefresh.addEventListener('click', function () {
      updateEditorBannerStatus('페이지 미리보기를 다시 계산하는 중…');
      reloadWithPreservedFocus({ intent: 'refresh_preview', actionEventId: '' });
    });
    actions.appendChild(panelRefresh);

    editorTextEditToggle = document.createElement('button');
    editorTextEditToggle.type = 'button';
    editorTextEditToggle.setAttribute('data-editor-role', 'text-edit-toggle');
    editorTextEditToggle.textContent = '텍스트 수정';
    editorTextEditToggle.addEventListener('click', function () {
      toggleTextEditMode();
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
    panelReset.textContent = '편집 초기화';
    panelReset.addEventListener('click', function () {
      resetAllEdits({ uiSource: 'panel_reset_all' });
    });
    actions.appendChild(panelReset);

    commandSection.appendChild(actions);

    editorNote = document.createElement('p');
    editorNote.className = 'print-editor-note';
    commandSection.appendChild(editorNote);
    editorPanel.appendChild(commandSection);

    editorPageSelect = null;
    editorBlockSelect = null;
    var searchSection = createEditorPanelSection('검색', 'is-search');
    var searchField = document.createElement('label');
    searchField.className = 'print-editor-field';
    var searchLabel = document.createElement('span');
    searchLabel.className = 'print-editor-field-label';
    searchLabel.textContent = '단어 검색';
    searchField.appendChild(searchLabel);
    editorSearchInput = document.createElement('input');
    editorSearchInput.type = 'search';
    editorSearchInput.className = 'print-editor-search-input';
    editorSearchInput.placeholder = '용어, 장비명, 문장 일부 검색';
    editorSearchInput.setAttribute('data-editor-role', 'search-input');
    editorSearchInput.autocomplete = 'off';
    editorSearchInput.spellcheck = false;
    editorSearchInput.value = editorSearchQuery;
    editorSearchInput.addEventListener('input', function () {
      editorSearchQuery = editorSearchInput.value || '';
      renderEditorSearchResults();
    });
    editorSearchInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      jumpToFirstSearchResult();
    });
    searchField.appendChild(editorSearchInput);
    searchSection.appendChild(searchField);

    editorSearchMeta = document.createElement('div');
    editorSearchMeta.className = 'print-editor-search-meta';
    editorSearchMeta.setAttribute('data-editor-role', 'search-meta');
    searchSection.appendChild(editorSearchMeta);

    editorSearchResults = document.createElement('div');
    editorSearchResults.className = 'print-editor-search-results';
    editorSearchResults.setAttribute('data-editor-role', 'search-results');
    searchSection.appendChild(editorSearchResults);
    editorPanel.appendChild(searchSection);

    var viewSection = createEditorPanelSection('보기', 'is-view');
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
      var nextSpacing = sanitizeViewSpacing(editorSpacingSelect.value);
      if (viewSettings.spacing === nextSpacing) return;
      viewSettings.spacing = nextSpacing;
      writeStoredViewSettings();
      applyViewSettings();
      syncEditorUiControls();
      updateEditorBannerStatus('세로 간격을 반영해 페이지를 다시 계산하는 중…');
      reloadWithPreservedFocus({ intent: 'view_spacing', actionEventId: '' });
    });
    spacingField.appendChild(editorSpacingSelect);
    viewControls.appendChild(spacingField);
    viewSection.appendChild(viewControls);
    editorPanel.appendChild(viewSection);

    var shortcutSection = createEditorPanelSection('단축키', 'is-shortcuts');
    var shortcutList = document.createElement('div');
    shortcutList.className = 'print-editor-shortcuts';
    [
      ['E', '편집 패널 열기 또는 닫기'],
      ['Ctrl/Cmd+Z', '마지막 편집 되돌리기'],
      ['Delete', '선택한 블록이나 이미지 삭제'],
      ['Shift+Delete', '전체 편집 초기화'],
      ['Esc', '편집 패널 닫기 또는 텍스트 수정 종료']
    ].forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'print-editor-shortcut';

      var key = document.createElement('span');
      key.className = 'print-editor-shortcut-key';
      key.textContent = entry[0];
      row.appendChild(key);

      var desc = document.createElement('span');
      desc.className = 'print-editor-shortcut-desc';
      desc.textContent = entry[1];
      row.appendChild(desc);

      shortcutList.appendChild(row);
    });
    shortcutSection.appendChild(shortcutList);
    editorPanel.appendChild(shortcutSection);
    editorListMeta = null;
    editorList = null;

    document.body.appendChild(editorPanel);
    removePagedEditorChromeClones();
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
  ensureEditorOverrideStyles();
  ensurePageChromeStyles();
  bindMergedTocInteractions();
  bindPagedRenderReadyEvent();
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
  window.addEventListener('scroll', function () {
    lockViewportInteractionIfNeeded();
    schedulePageSidebarSync();
  }, { passive: true });
  window.addEventListener('resize', refreshPageSidebar);
  window.addEventListener('load', function () {
    waitForPagedEditorUi();
    refreshPageSidebar();
    refreshMergedTocPageNumbers();
  });
  } catch (error) {
    showRuntimeFailure((error && error.message) || String(error));
    throw error;
  }
})();
