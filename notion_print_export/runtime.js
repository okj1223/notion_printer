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
  var editorBootstrapObserver = null;
  var textEditModeEnabled = false;
  var storageVersion = 'v8';
  var renderedDomHistory = [];
  var reloadFocusRestoreScheduled = false;
  var manifestStorageSalt = '';
  var selectedTargetState = { kind: '', candidateId: '', persistId: '', pageNumber: 0 };

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
    if (!manifestStorageSalt) return base;
    return base + '::' + manifestStorageSalt;
  }

  (function primeManifestStorageSalt() {
    var manifest = readManifestPayload();
    if (!manifest || typeof manifest !== 'object') return;
    var generatedAt = typeof manifest.generated_at === 'string' ? manifest.generated_at : '';
    var outputName = typeof manifest.output_name === 'string' ? manifest.output_name : '';
    var sourceHash = typeof manifest.source_hash === 'string' ? manifest.source_hash : '';
    manifestStorageSalt = generatedAt || [outputName, sourceHash].filter(Boolean).join('::');
  })();

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
    var parsed = Math.round(parseFloat(level));
    if (isNaN(parsed)) return 100;
    if (parsed >= 0 && parsed <= 4) {
      if (parsed === 1) return 92;
      if (parsed === 2) return 84;
      if (parsed === 3) return 76;
      if (parsed === 4) return 68;
      return 100;
    }
    if (parsed < 60) return 60;
    if (parsed > 100) return 100;
    return parsed;
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

  function learningRuntime() {
    return window.NotionPrinterLearning || null;
  }

  function recommendationRuntime() {
    return window.NotionPrinterRecommendation || null;
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
      images: JSON.parse(JSON.stringify(imageScaleMap || {}))
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

    writeStoredBreakOverrides();
    writeStoredSpaceOverrides();
    writeStoredPullUpOverrides();
    writeStoredViewSettings();
    writeStoredTextOverrides();
    writeStoredDeletedNodes();
    writeStoredGaps();
    writeStoredImageScales();

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
    return candidate.node.closest('li, details, blockquote, .callout, .print-table-block, .print-details-block');
  }

  function candidatePullUpEnabled(candidate) {
    if (!candidate || !candidate.node) return false;
    return !!(pullUpOverrideMap[candidate.id] || candidate.node.dataset.printPullUpMode === 'pull_up');
  }

  function imageScaleValue(level) {
    return sanitizeImageScale(level) / 100;
  }

  function updateFigureScaleUi(figure, level) {
    if (!figure) return;
    var safeLevel = sanitizeImageScale(level);
    var slider = figure.querySelector('.print-image-scale-range');
    var value = figure.querySelector('.print-image-scale-value');
    if (slider) slider.value = String(safeLevel);
    if (value) value.textContent = safeLevel + '%';
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

  function applyFigureScaleToFigure(figure, level) {
    if (!figure) return;
    var safeLevel = sanitizeImageScale(level);
    var factor = imageScaleValue(safeLevel);
    figure.dataset.printImageScale = String(safeLevel);
    figure.style.setProperty('--print-image-scale', String(factor));
    figure.classList.toggle('print-image-resized', safeLevel < 100);
    updateFigureScaleUi(figure, safeLevel);
  }

  function applyFigureScalePreview(figureId, level) {
    var safeLevel = sanitizeImageScale(level);
    Array.from(document.querySelectorAll('figure.image[data-print-persist-id]')).forEach(function (figure) {
      var key = figure.dataset && figure.dataset.printPersistId ? figure.dataset.printPersistId : '';
      if (key !== figureId) return;
      applyFigureScaleToFigure(figure, safeLevel);
    });
  }

  function currentStoredImageScale(figureId) {
    return sanitizeImageScale(imageScaleMap[figureId] || 100);
  }

  function applyStoredImageScales() {
    Array.from(document.querySelectorAll('figure.image[data-print-persist-id]')).forEach(function (figure) {
      var key = figure.dataset && figure.dataset.printPersistId ? figure.dataset.printPersistId : '';
      if (!key) return;
      applyFigureScaleToFigure(figure, currentStoredImageScale(key));
    });
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

  function firstSplitBlockInListItem(listItem) {
    if (!listItem || !listItem.querySelectorAll) return null;
    return Array.from(listItem.querySelectorAll('.print-split-block')).find(function (node) {
      return node && node.nodeType === 1 && node.closest && node.closest('li') === listItem;
    }) || null;
  }

  function physicalBreakRootForNode(node) {
    if (!node || node.nodeType !== 1 || !node.closest) return node;
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

  function registerCandidate(node, options) {
    if (!node || node.hasAttribute('data-print-break-id')) return;
    var id = options.id;
    ensurePersistentId(node, options.kind || 'candidate');
    var breakRoot = options.breakNode || ensureBreakAnchor(physicalBreakRootForNode(node), id);
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
    var resolved = manualMode === 'force' || (manualMode === 'auto' && autoBreak);
    var breakNode = candidate.breakNode || candidate.node;

    candidate.node.dataset.printBreakMode = manualMode;
    candidate.node.classList.remove(candidate.className);
    if (breakNode && breakNode !== candidate.node) {
      breakNode.classList.remove(candidate.className);
    }
    if (breakNode) {
      breakNode.classList.toggle(candidate.className, resolved);
    }
    candidate.node.dataset.printBreakResolved = resolved ? 'on' : 'off';
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

  function applyResolvedBreakModes() {
    breakCandidates.forEach(function (candidate) {
      applyBreakModeToCandidate(candidate);
      applyPullUpModeToCandidate(candidate);
      applySpaceModeToCandidate(candidate);
    });
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
    if (candidatePullUpEnabled(candidate)) return '수동: 위로 당김';
    return '수동: 해제';
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
    if (!config.silent && selectedTargetState.persistId) {
      updateEditorBannerStatus('선택한 블록을 기준으로 편집합니다');
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
    if (!persistedNode) return null;
    var fallbackCandidate = findCandidateByPersistId(persistedNode.dataset && persistedNode.dataset.printPersistId ? persistedNode.dataset.printPersistId : '');
    return {
      kind: 'block',
      candidateId: fallbackCandidate ? fallbackCandidate.id : '',
      persistId: persistedNode.dataset && persistedNode.dataset.printPersistId ? persistedNode.dataset.printPersistId : '',
      pageNumber: pageNumberFromNode(closestRenderedPageNode(persistedNode))
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
    var range = firstLastCandidateIdsInPage(pageNode);
    return {
      page_number: pageNode.getAttribute('data-page-number') || '',
      first_candidate_id: range.first || '',
      last_candidate_id: range.last || '',
      candidate_count: pageNode.querySelectorAll('[data-print-break-id]').length,
      persist_count: pageNode.querySelectorAll('[data-print-persist-id]').length
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
      target_offset_px: clampNumber(targetOffsetPx, 56, Math.max(96, (window.innerHeight || 720) - 96)),
      viewport_anchor: captureViewportAnchor({ preferredNode: fallbackNode || pageNode || null }),
      selection: currentSelectedTarget(),
      layout_before: snapshotRenderedLayout()
    };
  }

  function reloadWithPreservedFocus(options) {
    var payload = buildReloadFocusPayload(options || {});
    writeStoredReloadFocus(payload);
    setTimeout(function () {
      window.location.reload();
    }, 120);
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
    var pageNumber = pageNode.getAttribute('data-page-number') || '?';
    var heading = pageNode.querySelector('.print-section [data-print-block-type="section_heading"], .print-section h1:not(.page-title), .print-section h2, .print-section h3, .print-major-title, .page-title');
    var snippet = breakLabelText(heading, '페이지 ' + pageNumber);
    return pageNumber + '페이지 - ' + snippet;
  }

  function refreshNavigatorOptions() {
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
    }
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
        editorNote.textContent = '추천 블록 ' + metrics.outstandingRecommendationCount + '개와 이미지 추천 ' + metrics.imageRecommendationCount + '개가 남아 있습니다. 먼저 추천만 보기로 빠르게 훑어보세요.';
      } else if (metrics.manualCandidateCount > 0 || metrics.imageEditCount > 0 || metrics.textEditCount > 0 || metrics.deletedCount > 0) {
        editorNote.textContent = '수동 조정이 반영된 상태입니다. 되돌리기 전에는 추천보다 현재 편집 내용을 우선으로 유지합니다.';
      } else {
        editorNote.textContent = '아직 수동 조정이 없습니다. 추천을 먼저 적용한 뒤 필요한 부분만 미세 조정하면 로그 품질이 더 좋아집니다.';
      }
    }

    if (editorBannerRecommendationButton) {
      var hasRecommendation = metrics.outstandingRecommendationCount > 0 || metrics.imageRecommendationCount > 0;
      editorBannerRecommendationButton.disabled = !hasRecommendation;
      editorBannerRecommendationButton.textContent = hasRecommendation ? '추천으로 이동' : '추천 없음';
    }
  }

  function syncEditorUiControls() {
    var isOpen = !!editorUiState.open;
    var filterMode = sanitizeEditorFilter(editorUiState.filter || 'all');

    if (document.body) {
      document.body.classList.toggle('print-editor-open', isOpen);
    }

    if (editorLauncher) {
      editorLauncher.textContent = isOpen ? '패널 닫기 (E)' : '편집 패널 (E)';
    }

    if (editorPanelToggleButton) {
      editorPanelToggleButton.textContent = isOpen ? '패널 닫기' : '편집 패널';
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
    writeStoredEditorUiState();
    syncEditorUiControls();
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
    var range = firstLastCandidateIdsInPage(pageNode);
    if (range.first) {
      var directCandidate = findCandidateById(range.first);
      if (directCandidate) return directCandidate;
    }
    var fallbackPersistNode = pageNode && pageNode.querySelector ? pageNode.querySelector('[data-print-persist-id]') : null;
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

  function applyStoredRenderedLayout() {
    var stored = readStoredRenderedOrder();
    if (!Array.isArray(stored) || !stored.length) return;

    stored.forEach(function (pageEntry) {
      var pageNode = document.querySelector('.pagedjs_pages .pagedjs_page[data-page-number="' + String(pageEntry.page || '') + '"]');
      var flowRoot = renderedFlowRootForPage(pageNode);
      if (!pageNode || !flowRoot || !Array.isArray(pageEntry.ids)) return;

      pageEntry.ids.forEach(function (id) {
        var node = findRenderedCandidateNode(id);
        if (!node || node === flowRoot || node.contains(flowRoot)) return;
        flowRoot.appendChild(node);
      });
    });
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
    Array.from(clone.querySelectorAll('.print-insert-actions, .print-page-action-group, .print-page-merge-button, .print-page-delete-button, .print-inline-tools')).forEach(function (node) {
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

  function persistedIdsInRenderedPage(pageNode) {
    if (!pageNode || !pageNode.querySelectorAll) return [];
    return uniqueTruthyStrings(Array.from(pageNode.querySelectorAll('[data-print-persist-id]')).map(function (node) {
      return node && node.dataset ? node.dataset.printPersistId || '' : '';
    }));
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
    Array.from(root.querySelectorAll('.print-insert-actions, .print-page-action-group, .print-page-merge-button, .print-page-delete-button, .print-inline-tools')).forEach(function (node) {
      node.remove();
    });
  }

  function cloneRenderedPageShell(pageNode) {
    var clone = pageNode.cloneNode(true);
    clearEditorArtifacts(clone);
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
    return !!(node && node.classList && (
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

  function splitRenderedPageAtNode(renderedCandidate) {
    if (!renderedCandidate) {
      updateEditorBannerStatus('나눌 블록을 찾지 못했습니다');
      return;
    }
    var candidateId = renderedCandidate.getAttribute('data-print-break-id') || '';
    var candidate = findCandidateById(candidateId);
    if (!candidate) {
      updateEditorBannerStatus('나눌 기준 블록을 찾지 못했습니다');
      return;
    }
    setCandidateModeWithReload(candidate, 'force', '여기서 새 페이지 시작으로 적용 중…', 'inline_split_button', 'split_page');
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
    var previousPage = pageNode.previousElementSibling;
    if (!previousPage) {
      updateEditorBannerStatus('앞 페이지가 없습니다');
      return;
    }
    var candidate = mergeCandidateForPage(pageNode);
    if (!candidate) {
      updateEditorBannerStatus('이 페이지는 현재 이어붙일 기준 블록을 찾지 못했습니다');
      return;
    }
    var currentMode = sanitizeBreakMode(candidate.node.dataset.printBreakMode || breakOverrideMap[candidate.id] || 'auto');
    var currentSpaceMode = sanitizeSpaceMode(candidate.node.dataset.printSpaceMode || spaceOverrideMap[candidate.id] || 'auto');
    var gapId = candidate && candidate.node && candidate.node.dataset ? (candidate.node.dataset.printBreakId || candidate.node.dataset.printPersistId || '') : '';
    var currentGapUnits = gapId ? (parseInt(manualGapMap[gapId] || '0', 10) || 0) : 0;
    var renderedNode = findRenderedBreakNode(candidate) || candidate.node;
    var beforeLayout = snapshotRenderedLayout();
    pushHistorySnapshot('merge-page');
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
        source: 'page_merge_button',
        suggestion_source: 'manual'
      },
      meta: buildRuntimeActionMeta(renderedNode, {
        intent: 'merge_with_previous_page',
        effect: {
          merge_with_previous_page: true,
          cleared_gap_units: currentGapUnits,
          cleared_space_mode: currentSpaceMode,
          previous_page_number: previousPage.getAttribute('data-page-number') || '',
          current_page_number: pageNode.getAttribute('data-page-number') || '',
          layout_before: beforeLayout
        }
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
    updateEditorBannerStatus('앞 페이지와 더 자연스럽게 이어 붙이는 중…');
    reloadWithPreservedFocus({
      targetNode: renderedNode,
      candidateId: candidate.id,
      persistId: candidate.node && candidate.node.dataset ? candidate.node.dataset.printPersistId || '' : '',
      intent: 'merge_with_previous_page',
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

    var pageNumber = parseInt(pageNode.getAttribute('data-page-number') || '0', 10) || 0;
    var previousPage = pageNode.previousElementSibling;
    var nextPage = pageNode.nextElementSibling;
    var previousPageRange = firstLastCandidateIdsInPage(previousPage);
    var nextPageRange = firstLastCandidateIdsInPage(nextPage);
    var candidateIds = uniqueTruthyStrings(Array.from(pageNode.querySelectorAll('[data-print-break-id]')).map(function (node) {
      return node.getAttribute('data-print-break-id') || '';
    }));
    var persistIds = persistedIdsInRenderedPage(pageNode);
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
        block_count: candidateIds.length
      },
      after: {
        deleted: true
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
    updateEditorBannerStatus('페이지와 해당 내용을 삭제하는 중…');
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

  function installDirectPageManipulation() {
    var pagesRoot = document.querySelector('.pagedjs_pages');
    if (!pagesRoot) return false;
    var insertedHandles = 0;

    Array.from(pagesRoot.querySelectorAll('.pagedjs_page[data-page-number]')).forEach(function (pageNode, index) {
      pageNode.classList.add('print-screen-page');
      var actionGroup = directChildByClass(pageNode, 'print-page-action-group');
      if (!actionGroup) {
        actionGroup = document.createElement('div');
        actionGroup.className = 'print-page-action-group';
        pageNode.appendChild(actionGroup);
      }

      var existingMerge = actionGroup.querySelector('.print-page-merge-button');
      if (index === 0 && existingMerge) {
        existingMerge.remove();
      }

      if (index > 0 && !actionGroup.querySelector('.print-page-merge-button')) {
        var mergeButton = document.createElement('button');
        mergeButton.type = 'button';
        mergeButton.className = 'print-page-merge-button';
        mergeButton.textContent = '페이지 합치기';
        mergeButton.title = '앞 페이지와 합치기';
        mergeButton.addEventListener('click', function () {
          mergeWithPreviousPage(pageNode);
        });
        actionGroup.appendChild(mergeButton);
      }

      if (!actionGroup.querySelector('.print-page-delete-button')) {
        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'print-page-delete-button';
        deleteButton.textContent = '페이지 없애기';
        deleteButton.title = '현재 페이지와 해당 내용을 삭제';
        deleteButton.addEventListener('click', function () {
          deleteRenderedPage(pageNode);
        });
        actionGroup.appendChild(deleteButton);
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

        var splitButton = document.createElement('button');
        splitButton.type = 'button';
        splitButton.className = 'print-insert-action-button';
        splitButton.textContent = '페이지 나누기';
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
        gapButton.textContent = '빈공간 삽입';
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
      if (imageRecommendation && imageRecommendation.targetScalePct < 100) {
        var imageBadge = document.createElement('span');
        imageBadge.className = 'print-inline-suggestion-badge';
        imageBadge.textContent = imageRecommendation.label;
        imageBadge.title = joinRecommendationReasons(imageRecommendation) || imageRecommendation.label;
        imageLabel.appendChild(imageBadge);
      }
      imageTools.appendChild(imageLabel);

      var sliderRow = document.createElement('div');
      sliderRow.className = 'print-image-tools-row';

      var scaleRange = document.createElement('input');
      scaleRange.type = 'range';
      scaleRange.className = 'print-image-scale-range';
      scaleRange.min = '60';
      scaleRange.max = '100';
      scaleRange.step = '1';
      scaleRange.value = String(currentStoredImageScale(figureId));
      scaleRange.title = imageRecommendation && imageRecommendation.targetScalePct < 100 ? (imageRecommendation.label + ' - ' + (joinRecommendationReasons(imageRecommendation) || '이미지 축소 추천')) : '이미지 크기 직접 조절';
      if (imageRecommendation && imageRecommendation.targetScalePct < 100) {
        scaleRange.dataset.printSuggestedScale = String(imageRecommendation.targetScalePct);
      } else {
        delete scaleRange.dataset.printSuggestedScale;
      }
      sliderRow.appendChild(scaleRange);

      var scaleValue = document.createElement('span');
      scaleValue.className = 'print-image-scale-value';
      scaleValue.textContent = scaleRange.value + '%';
      sliderRow.appendChild(scaleValue);

      imageTools.appendChild(sliderRow);

      var actionRow = document.createElement('div');
      actionRow.className = 'print-image-tools-row print-image-tools-actions';

      if (imageRecommendation && imageRecommendation.targetScalePct < 100) {
        var recommendButton = document.createElement('button');
        recommendButton.type = 'button';
        recommendButton.className = 'print-image-tool-button is-suggested';
        recommendButton.textContent = '추천';
        recommendButton.title = imageRecommendation.label + ' - ' + (joinRecommendationReasons(imageRecommendation) || '추천 크기로 조정');
        recommendButton.addEventListener('click', function () {
          scaleRange.value = String(imageRecommendation.targetScalePct);
          scaleValue.textContent = imageRecommendation.targetScalePct + '%';
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
        scaleRange.value = '100';
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

      scaleRange.addEventListener('pointerdown', function () {
        openImageToolPanel(figure);
        scaleRange.dataset.printScaleStart = String(currentStoredImageScale(figureId));
      });
      scaleRange.addEventListener('focus', function () {
        openImageToolPanel(figure);
        scaleRange.dataset.printScaleStart = String(currentStoredImageScale(figureId));
      });
      scaleRange.addEventListener('input', function () {
        openImageToolPanel(figure);
        var value = sanitizeImageScale(scaleRange.value);
        scaleValue.textContent = value + '%';
        applyFigureScalePreview(figureId, value);
      });

      var commitScaleChange = function () {
        var startValue = sanitizeImageScale(scaleRange.dataset.printScaleStart || currentStoredImageScale(figureId));
        var nextValue = sanitizeImageScale(scaleRange.value);
        delete scaleRange.dataset.printScaleStart;
        scaleValue.textContent = nextValue + '%';
        if (nextValue === startValue) {
          applyFigureScalePreview(figureId, currentStoredImageScale(figureId));
          return;
        }
        setFigureScale(figureId, nextValue, 'image_slider');
      };

      scaleRange.addEventListener('change', commitScaleChange);
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
          if (event.target && event.target.closest('.print-image-tools')) {
            openImageToolPanel(figure);
            event.stopPropagation();
            return;
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
    updateEditorBannerStatus(ready ? '페이지 나누기/빈공간/합치기 준비됨' : '페이지 미리보기 준비 중');
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
    clearRenderedOrderStorage();
    installDirectPageManipulation();
    watchDirectManipulation();
    [200, 700, 1500, 3200].forEach(function (delay) {
      setTimeout(function () {
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
      '  body.print-ready.print-editor-open{padding-right:396px;}',
      '  body.print-ready .pagedjs_pages{max-width:880px;margin:0 auto;padding-bottom:80px;}',
      '  body.print-ready .pagedjs_page{margin:0 auto 28px!important;border:2px solid rgba(37,33,29,0.14);border-radius:16px;background:#fff;box-shadow:0 18px 34px rgba(17,24,39,0.08);position:relative;overflow:visible;}',
      '  body.print-ready .pagedjs_page::before{content:"Page " attr(data-page-number);position:absolute;top:-12px;left:18px;padding:2px 10px;border-radius:999px;background:#111827;color:#fff;font-size:0.76rem;font-weight:700;letter-spacing:0.02em;}',
      '  body.print-ready .print-page-action-group{position:absolute;top:-16px;right:18px;display:flex;gap:8px;z-index:9;opacity:0;transform:translateY(-2px);transition:opacity 140ms ease,transform 140ms ease;}',
      '  body.print-ready .pagedjs_page:hover .print-page-action-group{opacity:1;transform:translateY(0);}',
      '  body.print-ready .print-page-merge-button, body.print-ready .print-page-delete-button{border:1px solid rgba(17,24,39,0.14);border-radius:999px;padding:5px 10px;background:#fff;color:#111827;font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 8px 16px rgba(17,24,39,0.08);}',
      '  body.print-ready .print-page-delete-button{color:#7f1d1d;border-color:rgba(127,29,29,0.18);}',
      '  body.print-ready .print-editor-banner{position:sticky;top:0;z-index:10000;display:flex!important;flex-wrap:wrap;align-items:center;gap:10px;margin:0 auto 14px;padding:12px 14px;max-width:980px;border-bottom:1px solid rgba(17,24,39,0.08);background:rgba(255,248,215,0.98);box-shadow:0 8px 24px rgba(17,24,39,0.08);}',
      '  body.print-ready .print-editor-banner-button{border:1px solid rgba(17,24,39,0.12);border-radius:999px;padding:8px 12px;background:#fff;color:#111827;font:inherit;font-size:0.84rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-banner-button.is-primary{background:#111827;color:#fff;}',
      '  body.print-ready .print-editor-banner-button:disabled{cursor:default;opacity:0.5;}',
      '  body.print-ready .print-editor-banner-summary{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
      '  body.print-ready .print-editor-banner-status{margin-left:auto;font-size:0.82rem;font-weight:700;color:#5f4c1c;}',
      '  body.print-ready .print-editor-banner{display:flex!important;}',
      '  body.print-ready .print-editor-launcher{position:fixed;right:18px;bottom:18px;z-index:9999;display:block!important;border:none;border-radius:999px;padding:12px 16px;background:#111827;color:#fff;font:inherit;font-weight:700;box-shadow:0 12px 30px rgba(17,24,39,0.22);cursor:pointer;}',
      '  body.print-ready .print-editor-panel{position:fixed;top:16px;right:16px;bottom:16px;width:360px;display:none!important;flex-direction:column;gap:14px;padding:16px;border:1px solid rgba(39,41,46,0.12);border-radius:18px;background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);box-shadow:0 24px 60px rgba(17,24,39,0.16);z-index:9998;}',
      '  body.print-ready .print-editor-panel{display:none!important;}',
      '  body.print-ready.print-editor-open .print-editor-panel{display:flex!important;}',
      '  body.print-ready .print-editor-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
      '  body.print-ready .print-editor-title{font-size:1rem;font-weight:800;line-height:1.35;margin:0;}',
      '  body.print-ready .print-editor-subtitle{margin:4px 0 0;font-size:0.86rem;line-height:1.45;color:#4b5563;}',
      '  body.print-ready .print-editor-close{border:1px solid rgba(39,41,46,0.12);background:#fff;border-radius:10px;padding:6px 10px;font:inherit;cursor:pointer;}',
      '  body.print-ready .print-editor-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
      '  body.print-ready .print-editor-summary-chip{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:1px solid rgba(148,163,184,0.18);border-radius:14px;background:#f8fafc;}',
      '  body.print-ready .print-editor-summary-chip strong{font-size:1rem;line-height:1.1;color:#111827;}',
      '  body.print-ready .print-editor-summary-chip span{font-size:0.72rem;font-weight:700;color:#64748b;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip{padding:6px 10px;gap:1px;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip strong{font-size:0.82rem;}',
      '  body.print-ready .print-editor-banner-summary .print-editor-summary-chip span{font-size:0.64rem;}',
      '  body.print-ready .print-editor-filter-bar{display:flex;flex-wrap:wrap;gap:6px;}',
      '  body.print-ready .print-editor-filter-button{border:1px solid rgba(39,41,46,0.12);border-radius:999px;padding:7px 11px;background:#fff;color:#111827;font:inherit;font-size:0.78rem;font-weight:800;cursor:pointer;}',
      '  body.print-ready .print-editor-filter-button.is-active{background:#111827;border-color:#111827;color:#fff;}',
      '  body.print-ready .print-editor-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '  body.print-ready .print-editor-actions button{border:1px solid rgba(39,41,46,0.12);background:#fff;border-radius:10px;padding:9px 10px;font:inherit;font-weight:700;cursor:pointer;}',
      '  body.print-ready .print-editor-actions button.print-editor-primary{background:#2f6fed;border-color:#2f6fed;color:#fff;}',
      '  body.print-ready .print-editor-actions button.is-active{background:#111827;border-color:#111827;color:#fff;}',
      '  body.print-ready .print-editor-note{margin:0;padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid rgba(148,163,184,0.18);font-size:0.84rem;line-height:1.5;color:#475569;}',
      '  body.print-ready .print-editor-navigator{display:grid;grid-template-columns:1fr auto;gap:8px 10px;padding:10px 12px;border:1px solid rgba(148,163,184,0.18);border-radius:14px;background:#fff;}',
      '  body.print-ready .print-editor-settings{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px;border:1px solid rgba(148,163,184,0.18);border-radius:14px;background:#fff;}',
      '  body.print-ready .print-editor-field{display:flex;flex-direction:column;gap:6px;}',
      '  body.print-ready .print-editor-field-label{font-size:0.78rem;font-weight:700;color:#475569;}',
      '  body.print-ready .print-editor-select{appearance:none;border:1px solid rgba(39,41,46,0.12);border-radius:10px;padding:9px 10px;background:#fff;font:inherit;font-size:0.85rem;color:#111827;}',
      '  body.print-ready .print-editor-secondary{align-self:end;border:1px solid rgba(39,41,46,0.12);background:#fff;border-radius:10px;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap;}',
      '  body.print-ready .print-editor-list-meta{margin:0;font-size:0.78rem;font-weight:700;color:#64748b;}',
      '  body.print-ready .print-editor-list{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px;}',
      '  body.print-ready .print-editor-empty{padding:14px;border:1px dashed rgba(148,163,184,0.38);border-radius:14px;background:#f8fafc;font-size:0.84rem;line-height:1.55;color:#64748b;}',
      '  body.print-ready .print-editor-item{border:1px solid rgba(39,41,46,0.12);border-radius:14px;padding:12px;background:#fff;}',
      '  body.print-ready .print-editor-item.is-selected{border-color:rgba(37,99,235,0.34);box-shadow:0 0 0 2px rgba(37,99,235,0.12);}',
      '  body.print-ready .print-editor-item.print-mode-force{border-color:rgba(47,111,237,0.4);background:rgba(47,111,237,0.05);}',
      '  body.print-ready .print-editor-item.print-mode-keep{border-color:rgba(148,163,184,0.38);background:rgba(248,250,252,0.92);}',
      '  body.print-ready .print-editor-item.is-recommended{box-shadow:0 0 0 2px rgba(191,219,254,0.7);}',
      '  body.print-ready .print-editor-item.is-manual{border-color:rgba(245,158,11,0.28);}',
      '  body.print-ready .print-editor-item-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;}',
      '  body.print-ready .print-editor-item-label{margin:0;font-size:0.92rem;font-weight:700;line-height:1.4;color:#111827;}',
      '  body.print-ready .print-editor-item-meta{margin:0;font-size:0.78rem;color:#6b7280;line-height:1.45;}',
      '  body.print-ready .print-editor-suggestion-badge, body.print-ready .print-inline-suggestion-badge{display:inline-flex!important;align-items:center;justify-content:center;width:max-content;margin-top:6px;padding:3px 8px;border-radius:999px;background:rgba(47,111,237,0.12);color:#1d4ed8;font-size:0.7rem;font-weight:800;letter-spacing:0.01em;}',
      '  body.print-ready .print-editor-item-jump{border:none;background:transparent;color:#2f6fed;font:inherit;font-weight:700;cursor:pointer;padding:0;white-space:nowrap;}',
      '  body.print-ready .print-editor-item-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}',
      '  body.print-ready .print-editor-item-controls button{border:1px solid rgba(39,41,46,0.12);background:#fff;border-radius:10px;padding:8px 6px;font:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;}',
      '  body.print-ready .print-editor-item-controls button.is-active{background:#111827;border-color:#111827;color:#fff;}',
      '  body.print-ready .print-editor-item-controls button.is-suggested, body.print-ready .print-insert-action-button.is-suggested, body.print-ready .print-image-tool-button.is-suggested{border-color:rgba(29,78,216,0.4);background:rgba(219,234,254,0.88);color:#1d4ed8;}',
      '  body.print-ready .print-draggable-candidate{position:relative;overflow:visible;}',
      '  body.print-ready figure.image[data-print-persist-id]{position:relative;overflow:visible;display:flex;flex-direction:column;align-items:center;text-align:center;}',
      '  body.print-ready figure.image[data-print-persist-id] > a, body.print-ready figure.image[data-print-persist-id] > img{display:block;}',
      '  body.print-ready figure.image[data-print-persist-id] img{margin:0 auto;}',
      '  body.print-ready figure.image.print-image-resized img{width:calc(100% * var(--print-image-scale, 1))!important;max-width:calc(100% * var(--print-image-scale, 1))!important;}',
      '  body.print-ready .print-insert-actions{position:absolute;left:9%;right:9%;top:0;height:0;display:flex;align-items:center;justify-content:center;gap:8px;overflow:visible;pointer-events:auto;z-index:9;}',
      '  body.print-ready .print-insert-actions::before{content:"";position:absolute;left:0;right:0;top:0;transform:translateY(-50%);height:2px;border-radius:999px;background:rgba(47,111,237,0.18);transition:background 120ms ease,opacity 120ms ease;opacity:0.85;}',
      '  body.print-ready .print-draggable-candidate:hover{outline:2px solid rgba(47,111,237,0.12);outline-offset:4px;border-radius:10px;}',
      '  body.print-ready .print-draggable-candidate:hover > .print-insert-actions::before, body.print-ready .print-insert-actions:hover::before{background:rgba(47,111,237,0.42);opacity:1;}',
      '  body.print-ready .print-insert-action-button{position:relative;margin-top:-14px;border:1px solid rgba(17,24,39,0.14);border-radius:999px;padding:5px 10px;background:#fff;color:#111827;font:inherit;font-size:0.73rem;font-weight:800;cursor:pointer;box-shadow:0 8px 16px rgba(17,24,39,0.08);pointer-events:auto;opacity:0;transform:translateY(-4px);transition:opacity 120ms ease,transform 120ms ease,box-shadow 120ms ease;background-clip:padding-box;}',
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
      '  body.print-ready .print-draggable-candidate:hover{outline:2px solid rgba(47,111,237,0.18);outline-offset:6px;border-radius:10px;}',
      '  body.print-ready .print-selected-target{outline:2px solid rgba(37,99,235,0.34)!important;outline-offset:6px;border-radius:12px;box-shadow:0 0 0 4px rgba(37,99,235,0.08)!important;}',
      '  body.print-ready .print-draggable-candidate.is-dragging{opacity:0.72;}',
      '  body.print-ready .print-inline-tools{position:absolute;top:-8px;right:-8px;display:flex;gap:4px;z-index:8;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity 120ms ease,transform 120ms ease;}',
      '  body.print-ready .print-draggable-candidate:hover > .print-inline-tools, body.print-ready .print-draggable-candidate.print-selected-target > .print-inline-tools, body.print-ready figure.image.print-selected-target > .print-inline-tools{opacity:1;transform:translateY(0);pointer-events:auto;}',
      '  body.print-ready .print-inline-tool{display:inline-flex!important;align-items:center;justify-content:center;min-width:24px;height:24px;border:1px solid rgba(17,24,39,0.14);border-radius:999px;padding:0 6px;background:rgba(255,255,255,0.96);color:#111827;font:inherit;font-size:0.72rem;font-weight:800;cursor:pointer;box-shadow:0 6px 12px rgba(17,24,39,0.08);}',
      '  body.print-ready .print-inline-tool.is-danger{color:#7f1d1d;border-color:rgba(127,29,29,0.2);}',
      '  body.print-ready .print-image-tools{position:absolute;top:50%;left:50%;display:flex;flex-direction:column;gap:8px;width:min(280px, calc(100vw - 40px));max-width:calc(100vw - 40px);padding:10px 12px;border:1px solid rgba(17,24,39,0.14);border-radius:14px;background:rgba(255,255,255,0.98);color:#111827;box-shadow:0 12px 26px rgba(17,24,39,0.16);z-index:8;opacity:0;transform:translate(-50%,-50%) scale(0.96);transition:opacity 140ms ease,transform 140ms ease;pointer-events:none;}',
      '  body.print-ready figure.image[data-print-persist-id]:hover .print-image-tools, body.print-ready figure.image[data-print-persist-id]:focus-within .print-image-tools, body.print-ready figure.image[data-print-persist-id].print-image-tools-open .print-image-tools{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto;}',
      '  body.print-ready .print-image-tools-label{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.72rem;font-weight:800;letter-spacing:0.01em;color:#475569;}',
      '  body.print-ready .print-image-tools-row{display:flex;align-items:center;gap:10px;}',
      '  body.print-ready .print-image-tools-actions{justify-content:flex-end;flex-wrap:wrap;}',
      '  body.print-ready .print-image-scale-range{flex:1;accent-color:#2f6fed;cursor:pointer;}',
      '  body.print-ready .print-image-scale-value{min-width:46px;text-align:right;font-size:0.78rem;font-weight:800;color:#111827;}',
      '  body.print-ready .print-image-tool-button{display:inline-flex!important;align-items:center;justify-content:center;min-width:44px;height:28px;border:1px solid rgba(17,24,39,0.14);border-radius:999px;padding:0 10px;background:rgba(255,255,255,0.98);color:#111827;font:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;box-shadow:0 6px 12px rgba(17,24,39,0.08);}',
      '  body.print-ready .print-image-tool-button.is-danger{color:#7f1d1d;border-color:rgba(127,29,29,0.2);}',
      '  body.print-ready .print-drag-handle{cursor:grab!important;}',
      '  body.print-ready.print-drag-active .print-drag-handle{cursor:grabbing!important;}',
      '  body.print-ready.print-text-edit-mode [data-print-edit-id]{outline:2px dashed rgba(47,111,237,0.22);outline-offset:3px;border-radius:4px;min-height:1em;}',
      '  body.print-ready .print-has-manual-gap{margin-top:var(--print-manual-gap, 0.9em)!important;}',
      '  body.print-ready .print-page-target-highlight{box-shadow:0 0 0 4px rgba(59,130,246,0.18), 0 18px 34px rgba(17,24,39,0.08)!important;}',
      '  body.print-ready .print-editor-target-highlight{box-shadow:0 0 0 3px rgba(59,130,246,0.18)!important;}',
      '  @media (max-width: 1280px){body.print-ready.print-editor-open{padding-right:0;}body.print-ready .print-editor-panel{width:min(400px, calc(100vw - 28px));}}',
      '  @media (max-width: 900px){body.print-ready .print-editor-banner{padding:10px 12px;}body.print-ready .print-editor-panel{top:auto;left:12px;right:12px;bottom:12px;width:auto;max-height:78vh;border-radius:18px;}body.print-ready .print-editor-settings{grid-template-columns:1fr;}body.print-ready .print-editor-summary{grid-template-columns:repeat(2,minmax(0,1fr));}}',
      '}',
      '@media print {',
      '  body.print-ready .print-editor-banner,',
      '  body.print-ready .print-editor-launcher,',
      '  body.print-ready .print-editor-panel,',
      '  body.print-ready .print-page-dropzone,',
      '  body.print-ready .print-drag-handle,',
      '  body.print-ready .print-page-action-group,',
      '  body.print-ready .print-page-merge-button,',
      '  body.print-ready .print-page-delete-button,',
      '  body.print-ready .print-image-tools,',
      '  body.print-ready .print-insert-actions{display:none!important;}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function installEditorKeyboardShortcuts() {
    if (!document.body || document.body.dataset.printEditorShortcutsBound) return;
    document.body.dataset.printEditorShortcutsBound = 'true';
    document.addEventListener('keydown', function (event) {
      if (!event || event.altKey || event.ctrlKey || event.metaKey) return;
      var target = event.target;
      if (target && (
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(target.tagName || '')
      )) {
        return;
      }

      if (event.key === 'e' || event.key === 'E') {
        event.preventDefault();
        toggleEditorPanel();
        return;
      }

      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        jumpToRecommendedItem();
        return;
      }

      if (event.key === 'Delete') {
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
    var root = document.querySelector('.pagedjs_pages');
    return !!(root && root.querySelector('.pagedjs_area'));
  }

  function bootstrapEditorUi() {
    if (editorUiBootstrapped) return true;
    if (!pagesRootReady()) return false;
    ensureEditorOverrideStyles();
    buildEditorPanel();
    installEditorKeyboardShortcuts();
    editorUiBootstrapped = true;
    syncEditorUiControls();
    refreshEditorList();
    refreshNavigatorOptions();
    scheduleDirectManipulationInstall();
    scheduleReloadFocusRestore();
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
        { label: '해제', value: 'auto' },
        { label: '여기서 시작', value: 'force' }
      ].forEach(function (option) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        if (mode === option.value) {
          button.classList.add('is-active');
        }
        if (recommendation && recommendation.break && recommendation.break.mode === option.value && option.value === 'force') {
          button.classList.add('is-suggested');
          button.title = joinRecommendationReasons(recommendation.break) || recommendation.break.label;
        }
        button.addEventListener('click', function () {
          setCandidateModeWithReload(candidate, option.value, option.value === 'force' ? '이 위치에서 시작하도록 조정 중…' : '페이지 시작 지정 해제 중…', 'editor_panel', 'break_toggle');
        });
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
    refreshEditorList();
    updateEditorBannerStatus(nextLevel > 0 ? '이미지 크기를 조정했습니다' : '이미지 크기를 기본값으로 복원했습니다');
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

    var bannerRefresh = document.createElement('button');
    bannerRefresh.type = 'button';
    bannerRefresh.className = 'print-editor-banner-button is-primary';
    bannerRefresh.textContent = '미리보기 다시 계산';
    bannerRefresh.addEventListener('click', function () {
      reloadWithPreservedFocus({ intent: 'refresh_preview', actionEventId: '' });
    });
    editorBanner.appendChild(bannerRefresh);

    var bannerUndo = document.createElement('button');
    bannerUndo.type = 'button';
    bannerUndo.className = 'print-editor-banner-button';
    bannerUndo.textContent = '되돌리기';
    bannerUndo.addEventListener('click', function () {
      undoLastEdit();
    });
    editorBanner.appendChild(bannerUndo);

    editorBannerRecommendationButton = document.createElement('button');
    editorBannerRecommendationButton.type = 'button';
    editorBannerRecommendationButton.className = 'print-editor-banner-button';
    editorBannerRecommendationButton.setAttribute('data-editor-role', 'jump-recommendation');
    editorBannerRecommendationButton.textContent = '추천으로 이동';
    editorBannerRecommendationButton.addEventListener('click', function () {
      jumpToRecommendedItem();
    });
    editorBanner.appendChild(editorBannerRecommendationButton);

    editorPanelToggleButton = document.createElement('button');
    editorPanelToggleButton.type = 'button';
    editorPanelToggleButton.className = 'print-editor-banner-button';
    editorPanelToggleButton.setAttribute('data-editor-role', 'panel-toggle');
    editorPanelToggleButton.textContent = '편집 패널';
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
    bannerStatus.textContent = '페이지 미리보기 준비 중';
    editorBanner.appendChild(bannerStatus);
    document.body.insertBefore(editorBanner, document.body.firstChild);

    editorLauncher = document.createElement('button');
    editorLauncher.type = 'button';
    editorLauncher.className = 'print-editor-launcher';
    editorLauncher.textContent = '편집 패널 (E)';
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
    title.textContent = 'Layout Assistant';
    titleWrap.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.className = 'print-editor-subtitle';
    subtitle.textContent = '추천을 먼저 확인하고 필요한 블록만 수동으로 조정하세요. E: 패널 열기, R: 추천 이동, Esc: 닫기.';
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
    focusRecommendationButton.textContent = '추천으로 이동';
    focusRecommendationButton.addEventListener('click', function () {
      jumpToRecommendedItem();
    });
    actions.appendChild(focusRecommendationButton);

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

    var panelPrint = document.createElement('button');
    panelPrint.type = 'button';
    panelPrint.textContent = '바로 인쇄';
    panelPrint.addEventListener('click', function () {
      window.print();
    });
    actions.appendChild(panelPrint);
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
  viewSettings = readStoredViewSettings();
  ensurePaginationStyles();
  applyViewSettings();
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
  window.addEventListener('load', function () {
    waitForPagedEditorUi();
  });
  } catch (error) {
    showRuntimeFailure((error && error.message) || String(error));
    throw error;
  }
})();
