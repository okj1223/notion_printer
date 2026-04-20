(function () {
  if (window.NotionPrinterLearning) return;

  var storageVersion = 'v1';
  var manifest = readManifest();
  var blocksPayload = readBlocksPayload();
  var blockLookup = buildBlockLookup(blocksPayload);
  var orderedBlocks = buildOrderedBlocks(blockLookup);
  var session = null;
  var queue = [];
  var flushTimer = null;
  var documentContext = null;
  var lastActionEventId = '';

  function nowIso() {
    return new Date().toISOString();
  }

  function randomToken() {
    return Math.random().toString(36).slice(2, 10);
  }

  function buildId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + randomToken();
  }

  function manifestScriptNode() {
    return document.getElementById('notion-printer-manifest');
  }

  function parseScriptJson(id) {
    var node = document.getElementById(id);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || '{}');
    } catch (error) {
      return null;
    }
  }

  function readManifest() {
    var parsed = parseScriptJson('notion-printer-manifest');
    if (!parsed || !parsed.document_id) {
      return null;
    }
    return parsed;
  }

  function readBlocksPayload() {
    var parsed = parseScriptJson('notion-printer-blocks-manifest');
    if (!parsed || !parsed.document_id || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  }

  function buildBlockLookup(payload) {
    var lookup = {};
    var blocks = payload && Array.isArray(payload.blocks) ? payload.blocks : [];
    blocks.forEach(function (block) {
      if (!block || typeof block !== 'object') return;
      var persistId = String(block.persist_id || '');
      if (!persistId) return;
      lookup[persistId] = block;
    });
    return lookup;
  }

  function buildOrderedBlocks(lookup) {
    return Object.keys(lookup).map(function (persistId) {
      return lookup[persistId];
    }).filter(function (block) {
      return block && typeof block.order_index === 'number' && block.order_index >= 0;
    }).sort(function (left, right) {
      return left.order_index - right.order_index;
    });
  }

  function nearestContractNode(node) {
    if (!node || node.nodeType !== 1 || !node.closest) return null;
    if (node.hasAttribute && node.hasAttribute('data-print-persist-id')) return node;
    return node.closest('[data-print-persist-id]');
  }

  function parseIntOr(value, fallback) {
    var parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  function readDatasetBlockMeta(node) {
    var contractNode = nearestContractNode(node);
    if (!contractNode || !contractNode.dataset) return null;
    return {
      contract_node: contractNode,
      persist_id: contractNode.dataset.printPersistId || '',
      block_type: contractNode.dataset.printBlockType || '',
      block_role: contractNode.dataset.printBlockRole || '',
      atomic: contractNode.dataset.printAtomic === 'true',
      section_index: parseIntOr(contractNode.dataset.printSectionIndex, -1),
      order_index: parseIntOr(contractNode.dataset.printOrderIndex, -1),
      label: contractNode.dataset.printBlockLabel || '',
      tag_name: contractNode.tagName ? contractNode.tagName.toLowerCase() : ''
    };
  }

  function readBlockMeta(node) {
    var datasetMeta = readDatasetBlockMeta(node);
    var persistId = datasetMeta && datasetMeta.persist_id ? datasetMeta.persist_id : '';
    var manifestMeta = persistId ? blockLookup[persistId] || null : null;
    if (!datasetMeta && !manifestMeta) return null;
    return {
      contract_node: datasetMeta && datasetMeta.contract_node ? datasetMeta.contract_node : nearestContractNode(node),
      persist_id: persistId || String((manifestMeta && manifestMeta.persist_id) || ''),
      block_type: String((datasetMeta && datasetMeta.block_type) || (manifestMeta && manifestMeta.block_type) || ''),
      block_role: String((datasetMeta && datasetMeta.block_role) || (manifestMeta && manifestMeta.block_role) || ''),
      atomic: datasetMeta ? !!datasetMeta.atomic : !!(manifestMeta && manifestMeta.atomic),
      section_index: datasetMeta && datasetMeta.section_index >= 0 ? datasetMeta.section_index : parseIntOr(manifestMeta && manifestMeta.section_index, -1),
      order_index: datasetMeta && datasetMeta.order_index >= 0 ? datasetMeta.order_index : parseIntOr(manifestMeta && manifestMeta.order_index, -1),
      label: String((datasetMeta && datasetMeta.label) || (manifestMeta && manifestMeta.label) || ''),
      tag_name: String((datasetMeta && datasetMeta.tag_name) || (manifestMeta && manifestMeta.tag_name) || '')
    };
  }

  function pendingStorageKey() {
    if (!manifest || !manifest.document_id) return 'notion-printer-learning::pending::unknown';
    return 'notion-printer-learning::' + storageVersion + '::' + manifest.document_id + '::' + (manifest.variant || 'unknown');
  }

  function normalizeText(text) {
    return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function hashText(text) {
    var normalized = normalizeText(text);
    var hash = 2166136261;
    for (var i = 0; i < normalized.length; i += 1) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 'fnv1a_' + (hash >>> 0).toString(16);
  }

  function readPendingQueue() {
    try {
      var raw = JSON.parse(localStorage.getItem(pendingStorageKey()) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (error) {
      return [];
    }
  }

  function writePendingQueue() {
    try {
      localStorage.setItem(pendingStorageKey(), JSON.stringify(queue));
    } catch (error) {
      // Ignore localStorage issues and continue with in-memory queue.
    }
  }

  function clearPendingQueue() {
    queue = [];
    try {
      localStorage.removeItem(pendingStorageKey());
    } catch (error) {
      // Ignore localStorage issues and continue.
    }
  }

  function postJson(url, payload, keepalive) {
    if (!window.fetch) {
      return Promise.reject(new Error('fetch unavailable'));
    }
    return window.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: !!keepalive,
      credentials: 'same-origin'
    });
  }

  function flushWithBeacon(payload) {
    if (!navigator.sendBeacon) return false;
    try {
      return navigator.sendBeacon('/__notion_printer/events', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    } catch (error) {
      return false;
    }
  }

  function scheduleFlush(delay) {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flushEvents(false);
    }, typeof delay === 'number' ? delay : 3000);
  }

  function nearestPageNode(node) {
    if (!node || !node.closest) return null;
    return node.closest('.pagedjs_page[data-page-number]');
  }

  function pageNumberFromNode(pageNode) {
    return parseInt(pageNode && pageNode.getAttribute('data-page-number') || '0', 10) || 0;
  }

  function candidateNodes(root) {
    return Array.from((root || document).querySelectorAll('[data-print-break-id]'));
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

  function blockType(node) {
    var meta = readBlockMeta(node);
    if (meta && meta.block_type) return meta.block_type;
    return fallbackBlockType(node);
  }

  function sectionIndex(node) {
    var meta = readBlockMeta(node);
    if (meta && meta.section_index >= 0) return meta.section_index;
    var section = node && node.closest ? node.closest('.print-section') : null;
    if (!section) return 0;
    var sections = Array.from(document.querySelectorAll('.print-section'));
    var index = sections.indexOf(section);
    return index >= 0 ? index : 0;
  }

  function listDepth(node) {
    var depth = 0;
    var cursor = node;
    while (cursor && cursor.parentElement) {
      cursor = cursor.parentElement.closest('ul, ol');
      if (!cursor) break;
      depth += 1;
    }
    return depth;
  }

  function blockOrderIndex(node) {
    var meta = readBlockMeta(node);
    if (meta && meta.order_index >= 0) return meta.order_index;
    if (!node) return -1;
    var nodes = candidateNodes(document);
    return nodes.indexOf(node);
  }

  function captureDocumentContext() {
    return {
      section_count: document.querySelectorAll('.print-section').length || document.querySelectorAll('[data-print-block-type="section_heading"], h1:not(.page-title), h2, h3').length,
      paragraph_count: document.querySelectorAll('p').length,
      image_count: document.querySelectorAll('figure.image img, figure.image > img').length,
      table_count: document.querySelectorAll('table').length,
      list_item_count: document.querySelectorAll('li').length,
      page_count: document.querySelectorAll('.pagedjs_page[data-page-number]').length,
      block_count: blocksPayload && typeof blocksPayload.block_count === 'number' ? blocksPayload.block_count : 0,
      variant: manifest && manifest.variant ? manifest.variant : '',
      source_hash: manifest && manifest.source_hash ? manifest.source_hash : ''
    };
  }

  function capturePageContext(pageNode, targetNode) {
    var page = pageNode || nearestPageNode(targetNode);
    if (!page) {
      return {
        page_number: 0,
        block_count: 0,
        image_count: 0,
        remaining_space_px: null,
        used_height_ratio: null
      };
    }

    var pageRect = page.getBoundingClientRect();
    var pageHeight = Math.max(1, Math.round(pageRect.height));
    var targetRect = targetNode && targetNode.getBoundingClientRect ? targetNode.getBoundingClientRect() : null;
    var remaining = targetRect ? Math.max(0, Math.round(pageRect.bottom - targetRect.bottom)) : null;
    var usedRatio = remaining === null ? null : Number(((pageHeight - remaining) / pageHeight).toFixed(4));

    return {
      page_number: pageNumberFromNode(page),
      block_count: page.querySelectorAll('[data-print-break-id]').length,
      image_count: page.querySelectorAll('figure.image').length,
      remaining_space_px: remaining,
      used_height_ratio: usedRatio,
      first_candidate_id: (page.querySelector('[data-print-break-id]') || {}).getAttribute ? page.querySelector('[data-print-break-id]').getAttribute('data-print-break-id') || '' : '',
      last_candidate_id: (function () {
        var nodes = page.querySelectorAll('[data-print-break-id]');
        var lastNode = nodes.length ? nodes[nodes.length - 1] : null;
        return lastNode ? lastNode.getAttribute('data-print-break-id') || '' : '';
      })()
    };
  }

  function captureBlockContext(node) {
    if (!node || node.nodeType !== 1) {
      return {
        block_type: 'unknown'
      };
    }
    var meta = readBlockMeta(node);
    var contractNode = meta && meta.contract_node ? meta.contract_node : node;
    var rect = contractNode && contractNode.getBoundingClientRect ? contractNode.getBoundingClientRect() : null;
    var text = normalizeText((contractNode || node).textContent || '');
    return {
      persist_id: meta && meta.persist_id ? meta.persist_id : '',
      block_type: blockType(node),
      block_role: meta && meta.block_role ? meta.block_role : '',
      atomic: meta ? !!meta.atomic : false,
      block_label: meta && meta.label ? meta.label : '',
      tag_name: meta && meta.tag_name ? meta.tag_name : (contractNode.tagName || '').toLowerCase(),
      section_index: sectionIndex(node),
      order_index: blockOrderIndex(node),
      text_char_count: text.length,
      text_hash: hashText(text),
      has_image: !!contractNode.querySelector('img'),
      has_table: isTableLikeNode(contractNode) || !!contractNode.querySelector('table, .print-table-block'),
      list_depth: listDepth(contractNode),
      dom_height_px: rect ? Math.round(rect.height) : null,
      dom_width_px: rect ? Math.round(rect.width) : null,
      image_aspect_ratio: (function () {
        var image = contractNode.matches('img') ? contractNode : contractNode.querySelector('img');
        if (!image || !image.naturalWidth || !image.naturalHeight) return null;
        return Number((image.naturalWidth / image.naturalHeight).toFixed(4));
      })()
    };
  }

  function captureNeighbors(node) {
    if (!node) {
      return {
        previous_candidate_id: '',
        next_candidate_id: ''
      };
    }
    var meta = readBlockMeta(node);
    if (meta && meta.order_index >= 0 && orderedBlocks.length) {
      var previousEntry = meta.order_index > 0 ? orderedBlocks[meta.order_index - 1] : null;
      var nextEntry = meta.order_index + 1 < orderedBlocks.length ? orderedBlocks[meta.order_index + 1] : null;
      return {
        previous_candidate_id: previousEntry ? String(previousEntry.persist_id || '') : '',
        next_candidate_id: nextEntry ? String(nextEntry.persist_id || '') : '',
        previous_block_type: previousEntry ? String(previousEntry.block_type || '') : '',
        next_block_type: nextEntry ? String(nextEntry.block_type || '') : ''
      };
    }
    var previous = node.previousElementSibling && node.previousElementSibling.closest ? node.previousElementSibling : null;
    while (previous && !previous.hasAttribute('data-print-break-id')) {
      previous = previous.previousElementSibling;
    }
    var next = node.nextElementSibling;
    while (next && !next.hasAttribute('data-print-break-id')) {
      next = next.nextElementSibling;
    }
    return {
      previous_candidate_id: previous ? previous.getAttribute('data-print-break-id') || '' : '',
      next_candidate_id: next ? next.getAttribute('data-print-break-id') || '' : '',
      previous_block_type: previous ? blockType(previous) : '',
      next_block_type: next ? blockType(next) : ''
    };
  }

  function buildTarget(payload, targetNode, pageNode) {
    var node = targetNode || null;
    var meta = readBlockMeta(node);
    return {
      candidate_id: (payload && payload.candidateId) || (node && node.getAttribute ? node.getAttribute('data-print-break-id') || '' : ''),
      persist_id: (payload && payload.persistId) || (meta && meta.persist_id) || (node && node.getAttribute ? node.getAttribute('data-print-persist-id') || '' : ''),
      page_number: (payload && payload.pageNumber) || pageNumberFromNode(pageNode || nearestPageNode(node)),
      node_kind: (payload && payload.nodeKind) || blockType(node),
      tag_name: (meta && meta.tag_name) || (node && node.tagName ? node.tagName.toLowerCase() : '')
    };
  }

  function buildSession() {
    return {
      schema_version: 1,
      session_id: buildId('sess'),
      document_id: manifest.document_id,
      variant: manifest.variant || '',
      started_at: nowIso(),
      preview_url: location.href,
      user_agent: navigator.userAgent || '',
      source_hash: manifest.source_hash || ''
    };
  }

  function startSession() {
    if (!manifest) return;
    session = buildSession();
    documentContext = captureDocumentContext();
    queue = readPendingQueue();
    postJson('/__notion_printer/session', {
      schema_version: 1,
      manifest: manifest,
      blocks: blocksPayload,
      session: session,
      context: {
        doc: documentContext
      }
    }, false).catch(function () {
      return null;
    });
  }

  function flushEvents(useBeacon) {
    if (!manifest || !session || !queue.length) return;
    var payload = {
      schema_version: 1,
      manifest: manifest,
      blocks: blocksPayload,
      session: session,
      events: queue.slice()
    };
    if (useBeacon && flushWithBeacon(payload)) {
      clearPendingQueue();
      return;
    }
    postJson('/__notion_printer/events', payload, !!useBeacon).then(function (response) {
      if (!response || !response.ok) return;
      clearPendingQueue();
    }).catch(function () {
      writePendingQueue();
    });
  }

  function logAction(actionType, payload) {
    if (!manifest || !session) return '';
    var safePayload = payload || {};
    var targetNode = safePayload.targetNode || safePayload.node || null;
    var pageNode = safePayload.pageNode || nearestPageNode(targetNode);
    var eventId = buildId('evt');
    var event = {
      schema_version: 1,
      event_id: eventId,
      session_id: session.session_id,
      document_id: manifest.document_id,
      variant: manifest.variant || '',
      ts: nowIso(),
      action_type: actionType,
      target: buildTarget(safePayload, targetNode, pageNode),
      before: safePayload.before || {},
      after: safePayload.after || {},
      context: {
        doc: documentContext || captureDocumentContext(),
        page: capturePageContext(pageNode, targetNode),
        block: captureBlockContext(targetNode),
        neighbors: captureNeighbors(targetNode)
      },
      ui: safePayload.ui || {}
    };
    if (safePayload.meta) {
      event.meta = safePayload.meta;
    }
    queue.push(event);
    lastActionEventId = eventId;
    writePendingQueue();
    if (queue.length >= 5) {
      flushEvents(false);
    } else {
      scheduleFlush(2500);
    }
    return eventId;
  }

  window.addEventListener('pagehide', function () {
    flushEvents(true);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushEvents(true);
    }
  });

  if (manifest) {
    startSession();
  }

  window.NotionPrinterLearning = {
    manifest: manifest,
    session: function () {
      return session;
    },
    blocks: blocksPayload,
    logAction: logAction,
    flushEvents: flushEvents,
    getBlockMeta: function (node) {
      return readBlockMeta(node);
    },
    getLastActionEventId: function () {
      return lastActionEventId;
    }
  };
})();
