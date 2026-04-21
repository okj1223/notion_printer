(function () {
  if (window.NotionPrinterRecommendation) return;

  function parseScriptJson(id) {
    var node = document.getElementById(id);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || '{}');
    } catch (error) {
      return null;
    }
  }

  var rules = parseScriptJson('notion-printer-recommendation-rules') || {};
  var model = parseScriptJson('notion-printer-recommendation-model') || {};
  var blocksPayload = parseScriptJson('notion-printer-blocks-manifest') || {};
  var blockLookup = buildBlockLookup(blocksPayload);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundScore(score) {
    return Math.round(clamp(score, 0, 1) * 100);
  }

  function numericSetting(value, fallback) {
    var parsed = Number(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  function taskRules(name) {
    var tasks = rules && rules.tasks ? rules.tasks : {};
    return tasks[name] || {};
  }

  function taskModel(name) {
    var tasks = model && model.tasks ? model.tasks : {};
    return tasks[name] || {};
  }

  function normalizeText(text) {
    return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
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

  function pushReason(reasons, text) {
    if (!text) return;
    if (reasons.indexOf(text) !== -1) return;
    reasons.push(text);
  }

  function blockTypeRule(config, blockType) {
    var byType = config && config.per_block_type ? config.per_block_type : {};
    if (!blockType || !Object.prototype.hasOwnProperty.call(byType, blockType)) return {};
    return byType[blockType] || {};
  }

  function nearestPageNode(node) {
    return node && node.closest ? node.closest('.pagedjs_page[data-page-number]') : null;
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
      contractNode: contractNode,
      persistId: contractNode.dataset.printPersistId || '',
      blockType: contractNode.dataset.printBlockType || '',
      blockRole: contractNode.dataset.printBlockRole || '',
      atomic: contractNode.dataset.printAtomic === 'true',
      sectionIndex: parseIntOr(contractNode.dataset.printSectionIndex, -1),
      orderIndex: parseIntOr(contractNode.dataset.printOrderIndex, -1),
      label: contractNode.dataset.printBlockLabel || '',
      tagName: contractNode.tagName ? contractNode.tagName.toLowerCase() : ''
    };
  }

  function readBlockMeta(node) {
    var datasetMeta = readDatasetBlockMeta(node);
    var persistId = datasetMeta && datasetMeta.persistId ? datasetMeta.persistId : '';
    var manifestMeta = persistId ? blockLookup[persistId] || null : null;
    if (!datasetMeta && !manifestMeta) return null;
    return {
      contractNode: datasetMeta && datasetMeta.contractNode ? datasetMeta.contractNode : nearestContractNode(node),
      persistId: persistId || String((manifestMeta && manifestMeta.persist_id) || ''),
      blockType: String((datasetMeta && datasetMeta.blockType) || (manifestMeta && manifestMeta.block_type) || ''),
      blockRole: String((datasetMeta && datasetMeta.blockRole) || (manifestMeta && manifestMeta.block_role) || ''),
      atomic: datasetMeta ? !!datasetMeta.atomic : !!(manifestMeta && manifestMeta.atomic),
      sectionIndex: datasetMeta && datasetMeta.sectionIndex >= 0 ? datasetMeta.sectionIndex : parseIntOr(manifestMeta && manifestMeta.section_index, -1),
      orderIndex: datasetMeta && datasetMeta.orderIndex >= 0 ? datasetMeta.orderIndex : parseIntOr(manifestMeta && manifestMeta.order_index, -1),
      label: String((datasetMeta && datasetMeta.label) || (manifestMeta && manifestMeta.label) || ''),
      tagName: String((datasetMeta && datasetMeta.tagName) || (manifestMeta && manifestMeta.tag_name) || '')
    };
  }

  function detectBlockType(node) {
    var meta = readBlockMeta(node);
    if (meta && meta.blockType) return meta.blockType;
    return fallbackBlockType(node);
  }

  function capturePageContext(node) {
    var page = nearestPageNode(node);
    if (!page) {
      return {
        pageNumber: 0,
        remainingSpacePx: null,
        usedHeightRatio: null,
        blockCount: 0
      };
    }
    var pageRect = page.getBoundingClientRect();
    var nodeRect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    var remaining = nodeRect ? Math.max(0, Math.round(pageRect.bottom - nodeRect.bottom)) : null;
    var ratio = remaining === null || !pageRect.height ? null : Number(((pageRect.height - remaining) / pageRect.height).toFixed(4));
    return {
      pageNumber: parseInt(page.getAttribute('data-page-number') || '0', 10) || 0,
      remainingSpacePx: remaining,
      usedHeightRatio: ratio,
      blockCount: page.querySelectorAll('[data-print-break-id]').length
    };
  }

  function captureBlockContext(node) {
    if (!node || node.nodeType !== 1) {
      return {
        blockType: 'unknown',
        textCharCount: 0,
        hasImage: false,
        hasTable: false,
        domHeightPx: 0
      };
    }
    var meta = readBlockMeta(node);
    var contractNode = meta && meta.contractNode ? meta.contractNode : node;
    var text = normalizeText(contractNode.textContent || '');
    var rect = contractNode.getBoundingClientRect ? contractNode.getBoundingClientRect() : null;
    return {
      blockType: detectBlockType(node),
      blockRole: meta && meta.blockRole ? meta.blockRole : '',
      sectionIndex: meta && meta.sectionIndex >= 0 ? meta.sectionIndex : 0,
      orderIndex: meta && meta.orderIndex >= 0 ? meta.orderIndex : -1,
      textCharCount: text.length,
      hasImage: !!contractNode.querySelector('img'),
      hasTable: isTableLikeNode(contractNode) || !!contractNode.querySelector('table, .print-table-block'),
      domHeightPx: rect ? Math.round(rect.height) : 0,
      imageAspectRatio: (function () {
        var image = contractNode.matches('img') ? contractNode : contractNode.querySelector('img');
        if (!image || !image.naturalWidth || !image.naturalHeight) return null;
        return Number((image.naturalWidth / image.naturalHeight).toFixed(4));
      })()
    };
  }

  function positiveRateByBlockType(taskName, blockType) {
    var section = taskModel(taskName);
    var byType = section && section.by_block_type ? section.by_block_type : {};
    var entry = byType[blockType] || null;
    return entry && typeof entry.positive_rate === 'number' ? entry.positive_rate : null;
  }

  function globalPositiveRate(taskName) {
    var section = taskModel(taskName);
    if (typeof section.global_positive_rate === 'number') return section.global_positive_rate;
    if (typeof section.global_force_rate === 'number') return section.global_force_rate;
    return null;
  }

  function recommendationThreshold(taskName, fallback) {
    var section = taskModel(taskName);
    if (typeof section.suggestion_threshold === 'number') return section.suggestion_threshold;
    return fallback;
  }

  function breakRecommendation(node) {
    var config = taskRules('break_recommendation');
    if (config.enabled === false) {
      return { mode: 'auto', score: 0, label: '판단 없음', reasons: [], source: 'none' };
    }

    var page = capturePageContext(node);
    var block = captureBlockContext(node);
    var thresholds = config.thresholds || {};
    var weights = config.weights || {};
    var blockRule = blockTypeRule(config, block.blockType);
    var remainingSoft = numericSetting(blockRule.remaining_space_px_soft, numericSetting(thresholds.remaining_space_px_soft, 120));
    var remainingHard = numericSetting(blockRule.remaining_space_px_hard, numericSetting(thresholds.remaining_space_px_hard, 72));
    var textSoft = numericSetting(blockRule.text_char_count_soft, numericSetting(thresholds.text_char_count_soft, 140));
    var imageHeightHard = numericSetting(blockRule.image_dom_height_px_hard, numericSetting(thresholds.image_dom_height_px_hard, 220));
    var score = numericSetting(blockRule.base_bonus, 0);
    var reasons = [];
    var remainingSpaceWeight = numericSetting(blockRule.remaining_space_weight, numericSetting(weights.remaining_space_px, 0.55));
    var textWeight = numericSetting(blockRule.block_text_char_count_weight, numericSetting(weights.block_text_char_count, 0.2));
    var imageWeight = numericSetting(blockRule.block_has_image_weight, numericSetting(weights.block_has_image, 0.15));
    var tableWeight = numericSetting(blockRule.block_has_table_weight, numericSetting(weights.block_has_table, 0.1));
    var usedHeightMin = numericSetting(blockRule.used_height_ratio_min, null);
    var usedHeightBonus = numericSetting(blockRule.used_height_ratio_bonus, 0);
    var largeBlockHeight = numericSetting(blockRule.large_block_dom_height_px, null);
    var largeBlockBonus = numericSetting(blockRule.large_block_bonus, 0);

    pushReason(reasons, blockRule.base_reason || '');

    if (typeof page.remainingSpacePx === 'number') {
      if (page.remainingSpacePx <= remainingHard) {
        score += remainingSpaceWeight;
        pushReason(reasons, blockRule.hard_remaining_reason || '페이지 하단 여백이 매우 적음');
      } else if (page.remainingSpacePx <= remainingSoft) {
        var band = (remainingSoft - page.remainingSpacePx) / Math.max(1, remainingSoft - remainingHard);
        score += remainingSpaceWeight * clamp(band, 0.35, 0.85);
        pushReason(reasons, blockRule.soft_remaining_reason || '페이지 하단 여백이 빠르게 줄어듦');
      }
    }

    if (block.textCharCount >= textSoft) {
      score += textWeight * clamp(block.textCharCount / Math.max(textSoft, 1), 0.4, 1);
      pushReason(reasons, blockRule.long_text_reason || '블록 텍스트 길이가 김');
    }
    if (block.hasImage || block.domHeightPx >= imageHeightHard) {
      score += imageWeight;
      pushReason(reasons, blockRule.image_reason || '이미지 또는 큰 미디어 블록');
    }
    if (block.hasTable) {
      score += tableWeight;
      pushReason(reasons, blockRule.table_reason || '표 블록 포함');
    }
    if (typeof page.usedHeightRatio === 'number' && typeof usedHeightMin === 'number' && page.usedHeightRatio >= usedHeightMin) {
      score += usedHeightBonus;
      pushReason(reasons, blockRule.used_height_reason || '현재 페이지 사용량이 높음');
    }
    if (typeof largeBlockHeight === 'number' && block.domHeightPx >= largeBlockHeight) {
      score += largeBlockBonus;
      pushReason(reasons, blockRule.large_block_reason || '블록 높이가 커서 다음 페이지 배치가 안정적임');
    }

    var blockTypeRate = positiveRateByBlockType('break_recommendation', block.blockType);
    var globalRate = globalPositiveRate('break_recommendation');
    var source = 'rules';
    if (typeof blockTypeRate === 'number') {
      score = (score * 0.78) + (blockTypeRate * 0.22);
      source = 'rules+model';
      if (blockTypeRate >= 0.55) pushReason(reasons, '유사 블록에서 새 페이지 선호');
    } else if (typeof globalRate === 'number') {
      score = (score * 0.84) + (globalRate * 0.16);
      source = 'rules+model';
    }

    var threshold = numericSetting(blockRule.suggestion_threshold, recommendationThreshold('break_recommendation', 0.62));
    var mode = score >= threshold ? 'force' : 'auto';
    var label = mode === 'force' ? '새 페이지 ' + roundScore(score) + '%' : '유지 ' + roundScore(1 - score) + '%';
    return {
      mode: mode,
      score: clamp(score, 0, 1),
      label: label,
      reasons: reasons,
      source: source
    };
  }

  function gapRecommendation(node) {
    var config = taskRules('gap_recommendation');
    if (config.enabled === false) {
      return { units: 0, score: 0, label: '추가 빈칸 없음', reasons: [], source: 'none' };
    }
    var page = capturePageContext(node);
    var block = captureBlockContext(node);
    var thresholds = config.thresholds || {};
    var defaults = config.defaults || {};
    var blockRule = blockTypeRule(config, block.blockType);
    var tight = numericSetting(blockRule.remaining_space_px_tight, numericSetting(thresholds.remaining_space_px_tight, 56));
    var soft = numericSetting(blockRule.remaining_space_px_soft, numericSetting(thresholds.remaining_space_px_soft, 96));
    var maxUnits = numericSetting(defaults.max_gap_units, 3);
    var softGapUnits = numericSetting(blockRule.soft_gap_units, numericSetting(defaults.soft_gap_units, 1));
    var tightGapUnits = numericSetting(blockRule.tight_gap_units, 1);
    var usedHeightMin = numericSetting(blockRule.used_height_ratio_min, null);
    var usedHeightUnits = numericSetting(blockRule.used_height_ratio_units, softGapUnits);
    var usedHeightScore = numericSetting(blockRule.used_height_ratio_score, 0.66);
    var units = 0;
    var score = 0;
    var reasons = [];

    if (typeof page.remainingSpacePx === 'number' && page.remainingSpacePx <= tight) {
      units = Math.max(units, tightGapUnits);
      score = Math.max(score, numericSetting(blockRule.tight_score, 0.74));
      pushReason(reasons, blockRule.tight_reason || '페이지 하단 밀집도가 높음');
    } else if (typeof page.remainingSpacePx === 'number' && page.remainingSpacePx <= soft && (block.blockType === 'section_heading' || block.blockType === 'table' || numericSetting(blockRule.allow_soft_gap, 0) === 1)) {
      units = Math.max(units, softGapUnits);
      score = Math.max(score, numericSetting(blockRule.soft_score, 0.62));
      pushReason(reasons, blockRule.soft_reason || '섹션 전환 또는 표 앞 간격이 필요함');
    }

    if (typeof page.usedHeightRatio === 'number' && typeof usedHeightMin === 'number' && page.usedHeightRatio >= usedHeightMin) {
      units = Math.max(units, usedHeightUnits);
      score = Math.max(score, usedHeightScore);
      pushReason(reasons, blockRule.used_height_reason || '페이지 사용량이 높아 앞 간격 조정 여지가 큼');
    }

    var blockTypeRate = positiveRateByBlockType('gap_recommendation', block.blockType);
    if (typeof blockTypeRate === 'number' && blockTypeRate >= 0.5) {
      units = Math.max(units, softGapUnits);
      score = Math.max(score, blockTypeRate);
      pushReason(reasons, '유사 블록에서 추가 간격 선호');
    }
    units = clamp(units, 0, maxUnits);
    return {
      units: units,
      score: clamp(score, 0, 1),
      label: units > 0 ? '빈칸 +' + units : '추가 빈칸 없음',
      reasons: reasons,
      source: typeof blockTypeRate === 'number' ? 'rules+model' : 'rules'
    };
  }

  function imageRecommendation(node) {
    var config = taskRules('image_scale_recommendation');
    if (config.enabled === false) {
      return { targetScalePct: 100, score: 0, label: '판단 없음', reasons: [], source: 'none' };
    }
    var page = capturePageContext(node);
    var block = captureBlockContext(node);
    var thresholds = config.thresholds || {};
    var defaults = config.defaults || {};
    var blockRule = blockTypeRule(config, block.blockType);
    var remainingThreshold = numericSetting(blockRule.remaining_space_px, numericSetting(thresholds.remaining_space_px, 60));
    var imageHeightThreshold = numericSetting(blockRule.image_dom_height_px, numericSetting(thresholds.image_dom_height_px, 260));
    var targetScaleDefault = numericSetting(blockRule.target_scale_pct, numericSetting(defaults.target_scale_pct, 88));
    var minScaleDefault = numericSetting(blockRule.min_scale_pct, numericSetting(defaults.min_scale_pct, 68));
    var portraitAspectRatioMax = numericSetting(blockRule.portrait_aspect_ratio_max, null);
    var portraitTargetScale = numericSetting(blockRule.portrait_target_scale_pct, targetScaleDefault);
    var usedHeightMin = numericSetting(blockRule.used_height_ratio_min, null);
    var usedHeightScore = numericSetting(blockRule.used_height_ratio_score, 0.82);
    var targetScale = 100;
    var score = 0;
    var reasons = [];

    if (typeof page.remainingSpacePx === 'number' && page.remainingSpacePx <= remainingThreshold) {
      targetScale = targetScaleDefault;
      score = Math.max(score, numericSetting(blockRule.remaining_space_score, 0.72));
      pushReason(reasons, blockRule.remaining_space_reason || '이미지 아래 여백이 부족함');
    }
    if (block.domHeightPx >= imageHeightThreshold) {
      targetScale = Math.min(targetScale, targetScaleDefault);
      score = Math.max(score, numericSetting(blockRule.image_height_score, 0.68));
      pushReason(reasons, blockRule.image_height_reason || '이미지 높이가 큼');
    }
    if (typeof page.remainingSpacePx === 'number' && page.remainingSpacePx <= Math.max(24, remainingThreshold / 2)) {
      targetScale = Math.min(targetScale, minScaleDefault);
      score = Math.max(score, numericSetting(blockRule.tight_remaining_score, 0.84));
      pushReason(reasons, blockRule.tight_remaining_reason || '현재 페이지에서 이미지가 과밀함');
    }
    if (typeof page.usedHeightRatio === 'number' && typeof usedHeightMin === 'number' && page.usedHeightRatio >= usedHeightMin) {
      targetScale = Math.min(targetScale, targetScaleDefault);
      score = Math.max(score, usedHeightScore);
      pushReason(reasons, blockRule.used_height_reason || '페이지 사용량이 높아 이미지 축소 여지가 큼');
    }
    if (typeof portraitAspectRatioMax === 'number' && typeof block.imageAspectRatio === 'number' && block.imageAspectRatio <= portraitAspectRatioMax) {
      targetScale = Math.min(targetScale, portraitTargetScale);
      score = Math.max(score, numericSetting(blockRule.portrait_score, 0.76));
      pushReason(reasons, blockRule.portrait_reason || '세로형 이미지는 조금 줄이면 페이지 안정성이 좋아짐');
    }

    var modelSection = taskModel('image_scale_recommendation');
    if (typeof modelSection.avg_target_scale_pct === 'number' && targetScale < 100) {
      targetScale = Math.round((targetScale * 0.65) + (modelSection.avg_target_scale_pct * 0.35));
      score = Math.max(score, 0.7);
    }

    targetScale = clamp(Math.round(targetScale), minScaleDefault, 100);
    return {
      targetScalePct: targetScale,
      score: clamp(score, 0, 1),
      label: targetScale < 100 ? targetScale + '%' : '판단 없음',
      reasons: reasons,
      source: modelSection && Object.keys(modelSection).length ? 'rules+model' : 'rules'
    };
  }

  function candidate(node) {
    return {
      break: breakRecommendation(node),
      gap: gapRecommendation(node)
    };
  }

  window.NotionPrinterRecommendation = {
    rules: rules,
    model: model,
    recommendCandidate: candidate,
    recommendFigure: imageRecommendation
  };
})();
