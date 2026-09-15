/**
 * Paste this adapter into the existing "ABK Video Work Status Tracker" Apps
 * Script project. It reuses that project's CONFIG, readWorkItems_,
 * getOrCreateTrackingSpreadsheet_, ensureTrackingSheets_, and logRun_ helpers.
 *
 * Required Script Properties:
 *   WORK_MANAGER_INGEST_URL
 *   WORK_MANAGER_INGEST_SECRET
 */

function syncWorkManagerNow() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = getOrCreateTrackingSpreadsheet_(properties);
  ensureTrackingSheets_(spreadsheet);
  return syncWorkManagerWorkItems_(spreadsheet, properties);
}

function syncWorkManagerWorkItems_(spreadsheet, properties) {
  const endpoint = String(properties.getProperty('WORK_MANAGER_INGEST_URL') || '').trim();
  const secret = String(properties.getProperty('WORK_MANAGER_INGEST_SECRET') || '').trim();
  if (!endpoint || !secret) {
    return {ok: false, skipped: 'work_manager_not_configured'};
  }

  const items = readWorkItems_(spreadsheet)
    .map(workManagerItemFromTrackerRow_)
    .filter(function(item) { return Boolean(item.externalId && item.title); });
  if (!items.length) return {ok: true, sent: 0, batches: 0};

  let sent = 0;
  let batches = 0;
  for (let offset = 0; offset < items.length; offset += 50) {
    const payload = {
      sourceKind: 'slack',
      workspaceRef: CONFIG.workspaceId,
      sourceRef: CONFIG.channelId,
      items: items.slice(offset, offset + 50)
    };
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {Authorization: 'Bearer ' + secret},
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      throw new Error('Work Manager ingest failed with HTTP ' + responseCode + '.');
    }
    sent += payload.items.length;
    batches += 1;
  }
  return {ok: true, sent: sent, batches: batches};
}

function workManagerItemFromTrackerRow_(row) {
  const status = workManagerStatusFromTracker_(row.status);
  const detail = String(row.status_detail || '').trim();
  const evidenceUrl = firstHttpUrl_(row.evidence_urls);
  return {
    externalId: String(row.request_id || row.thread_ts || '').trim(),
    title: String(row.request || '').trim(),
    nowText: detail,
    nextText: '',
    ownerName: '',
    status: status,
    blockerText: status === 'blocked' ? detail : '',
    sourceUrl: String(row.status_permalink || row.permalink || '').trim(),
    completionEvidenceUrl: status === 'done' ? evidenceUrl : '',
    clientVisible: false
  };
}

function workManagerStatusFromTracker_(status) {
  const normalized = String(status || '').trim().toUpperCase();
  const mapping = {
    'NEW': 'new',
    'IN PROGRESS': 'in_progress',
    'BLOCKED': 'blocked',
    'DONE': 'done',
    'NEEDS EVIDENCE': 'needs_evidence',
    'UNKNOWN': 'unknown'
  };
  return mapping[normalized] || 'unknown';
}

function firstHttpUrl_(value) {
  const matches = String(value || '').match(/https?:\/\/[^\s,]+/g);
  return matches && matches.length ? matches[0] : '';
}

/**
 * Add this block after refreshWorkStatuses_ in scanAbkVideoWork(). A dashboard
 * outage stays isolated from Slack collection, email, and the daily digest.
 *
 * let dashboardSync;
 * try {
 *   dashboardSync = syncWorkManagerWorkItems_(spreadsheet, properties);
 * } catch (dashboardError) {
 *   dashboardSync = {ok: false, error: String(dashboardError.message || dashboardError)};
 *   logRun_('WARN', 'syncWorkManagerWorkItems', 'Dashboard sync failed', dashboardSync);
 * }
 *
 * Then include dashboardSync: dashboardSync in the scan result object.
 */
