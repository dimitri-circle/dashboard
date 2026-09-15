/**
 * Add this block to CircleClick Weekly Docs Rollover - Vast.ai.
 * CONFIG must include:
 *   templateDocumentId: '1hh2OpbNzkMzPwh8ngGzOBnPz4qrrLCwEM2KhIPN6ePw'
 *   dashboardManagedMeetingDocs: true
 * Script Properties must include DASHBOARD_DOC_SYNC_SECRET before doPost is deployed.
 */

function getMeetingTemplateFile_() {
  var template = DriveApp.getFileById(CONFIG.templateDocumentId);
  if (template.isTrashed() || template.getMimeType() !== MimeType.GOOGLE_DOCS) {
    throw new Error('The configured meeting template is unavailable or is not a native Google Doc.');
  }
  return template;
}

function prepareMeetingTemplateCopy_(documentId, reportDate, client, actions) {
  if (documentId === CONFIG.templateDocumentId) throw new Error('Refusing to edit the master meeting template.');
  var doc = DocumentApp.openById(documentId);
  var body = doc.getBody();
  updateReportDate_(body, reportDate, client);
  updateMeetingMetadata_(body, client, reportDate);
  replaceAgendaTable_(doc, body, actionsToDashboardItems_(actions, reportDate));
  replaceMeetingSection_(body, 'Analytics / SEO', 'Dashboard insights will appear here after the first sync.');
  replaceMeetingSection_(body, 'Content', 'Dashboard work updates will appear here after the first sync.');
  addDashboardManagedRanges_(doc, body);
  doc.saveAndClose();
  registerLatestDashboardMeetingDoc_(client, reportDate, documentId);
}

function registerLatestDashboardMeetingDoc_(client, reportDate, documentId) {
  if (documentId === CONFIG.templateDocumentId) throw new Error('Refusing to register the master meeting template.');
  PropertiesService.getScriptProperties().setProperty(
    dashboardLatestDocKey_(client),
    JSON.stringify({documentId: documentId, reportDate: reportDate, registeredAt: new Date().toISOString()})
  );
}

function dashboardLatestDocKey_(client) {
  return 'DASHBOARD_LATEST_MEETING_DOC_' + String(client.key || client.name || '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function getLatestDashboardMeetingDoc_(client) {
  var raw = PropertiesService.getScriptProperties().getProperty(dashboardLatestDocKey_(client));
  if (!raw) throw new Error('No generated meeting document is registered for this client yet.');
  var latest = JSON.parse(raw);
  var reportDate = normalizeDashboardText_(latest.reportDate, 10);
  parseIsoDate_(reportDate);
  var documentId = normalizeDashboardText_(latest.documentId, 120);
  if (!documentId || documentId === CONFIG.templateDocumentId) throw new Error('The registered meeting document is invalid.');
  return {documentId: documentId, reportDate: reportDate};
}

function syncAllDashboardMeetingDocuments() {
  var properties = PropertiesService.getScriptProperties();
  var secret = String(properties.getProperty('DASHBOARD_DOC_SYNC_SECRET') || '');
  var baseUrl = String(properties.getProperty('DASHBOARD_MEETING_DOC_EXPORT_URL') || '');
  if (secret.length < 24 || !/^https:\/\//.test(baseUrl)) throw new Error('Dashboard meeting document export is not configured.');
  return CONFIG.clients.map(function(client) {
    var latest;
    try { latest = getLatestDashboardMeetingDoc_(client); }
    catch (error) { return {ok: false, skipped: true, client: client.name, reason: errorMessage_(error)}; }
    var response = UrlFetchApp.fetch(baseUrl + '?client=' + encodeURIComponent(client.name), {
      method: 'get',
      headers: {Authorization: 'Bearer ' + secret},
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Dashboard export failed for ' + client.name + ' with HTTP ' + response.getResponseCode() + '.');
    }
    var payload = JSON.parse(response.getContentText());
    return syncDashboardMeetingDocument_({
      secret: secret,
      clientKey: client.name,
      reportDate: latest.reportDate,
      documentId: latest.documentId,
      items: payload.items || []
    });
  });
}

function installDashboardMeetingDocumentTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncAllDashboardMeetingDocuments') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncAllDashboardMeetingDocuments').timeBased().everyMinutes(15).create();
}

function updateMeetingMetadata_(body, client, reportDate) {
  var tables = body.getTables();
  for (var i = 0; i < tables.length; i++) {
    var table = tables[i];
    if (table.getNumRows() < 2 || table.getRow(0).getNumCells() < 4) continue;
    var headers = table.getRow(0).getText().toUpperCase();
    if (headers.indexOf('PREPARED FOR') < 0 || headers.indexOf('AUTHOR') < 0 || headers.indexOf('STATUS') < 0) continue;
    var values = table.getRow(1);
    values.getCell(0).setText(client.name);
    values.getCell(1).setText(Utilities.formatDate(parseIsoDate_(reportDate), CONFIG.timezone, 'MMMM yyyy'));
    values.getCell(2).setText('CircleClick Team');
    values.getCell(3).setText('Working Draft');
    return;
  }
  throw new Error('The meeting template metadata table could not be found.');
}

function actionsToDashboardItems_(actions, reportDate) {
  return (actions || []).map(function(action, index) {
    var raw = typeof action === 'string' ? action : action.text;
    var match = String(raw || '').match(/^\[([^\]]+)\]\s*(.+)$/);
    return {
      id: 'meeting-action-' + index,
      title: match ? match[2] : String(raw || ''),
      ownerName: match ? match[1] : '',
      dueDate: reportDate,
      status: 'new',
      channelName: 'Meeting Actions',
      nowText: '',
      nextText: match ? match[2] : String(raw || ''),
      blockerText: '',
      sourceUrl: '',
      evidenceUrl: ''
    };
  });
}

function findAgendaTable_(body) {
  var tables = body.getTables();
  for (var i = 0; i < tables.length; i++) {
    if (!tables[i].getNumRows()) continue;
    var header = tables[i].getRow(0).getText().toUpperCase();
    if (header.indexOf('STRATEGIC OBJECTIVE') >= 0 && header.indexOf('OWNER') >= 0 &&
        header.indexOf('TIMELINE') >= 0 && header.indexOf('STATUS') >= 0) return tables[i];
  }
  throw new Error('The meeting template Agenda table could not be found.');
}

function replaceAgendaTable_(doc, body, items) {
  var table = findAgendaTable_(body);
  if (table.getNumRows() < 2) throw new Error('The Agenda table needs one styled example row.');
  var styledRow = table.getRow(1).copy();
  while (table.getNumRows() > 1) table.removeRow(1);
  var active = (items || []).filter(function(item) { return !item.dismissed && item.status !== 'done'; }).slice(0, 40);
  if (!active.length) active = [{title: 'No active work for this meeting', ownerName: '—', dueDate: '', status: 'new'}];
  active.forEach(function(item) {
    var row = table.appendTableRow(styledRow.copy());
    row.getCell(0).setText(normalizeDashboardText_(item.title, 180) || 'Untitled work');
    row.getCell(1).setText(normalizeDashboardText_(item.ownerName, 120) || 'Owner to confirm');
    row.getCell(2).setText(formatDashboardTimeline_(item.dueDate));
    row.getCell(3).setText(dashboardStatusLabel_(item.status));
  });
  replaceNamedRange_(doc, 'CC_DASHBOARD_AGENDA', table);
}

function replaceMeetingSection_(body, heading, content) {
  var start = findFirstBodyParagraphByText_(body, heading);
  if (!start || start.getParent() !== body) throw new Error('Missing direct-body meeting section: ' + heading);
  var startIndex = body.getChildIndex(start);
  var endIndex = body.getNumChildren();
  for (var i = startIndex + 1; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH && child.asParagraph().getHeading() !== DocumentApp.ParagraphHeading.NORMAL) {
      endIndex = i;
      break;
    }
  }
  for (var j = endIndex - 1; j > startIndex; j--) body.removeChild(body.getChild(j));
  var paragraph = body.insertParagraph(startIndex + 1, content || 'No updates yet.');
  paragraph.setSpacingAfter(8).setLineSpacing(1.15);
}

function addDashboardManagedRanges_(doc, body) {
  ['Analytics / SEO', 'Content'].forEach(function(heading) {
    var paragraph = findFirstBodyParagraphByText_(body, heading);
    if (!paragraph) return;
    replaceNamedRange_(doc, 'CC_DASHBOARD_' + heading.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), paragraph);
  });
}

function replaceNamedRange_(doc, name, element) {
  removeNamedRange_(doc, name);
  var range = doc.newRange();
  range.addElement(element);
  doc.addNamedRange(name, range.build());
}

function doPost(e) {
  var response;
  try {
    var payload = JSON.parse(e && e.postData && e.postData.contents || '{}');
    verifyDashboardSyncSecret_(payload.secret);
    response = syncDashboardMeetingDocument_(payload);
  } catch (error) {
    response = {ok: false, error: errorMessage_(error)};
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function verifyDashboardSyncSecret_(supplied) {
  var expected = String(PropertiesService.getScriptProperties().getProperty('DASHBOARD_DOC_SYNC_SECRET') || '');
  if (expected.length < 24 || String(supplied || '') !== expected) throw new Error('Dashboard document sync authorization failed.');
}

function syncDashboardMeetingDocument_(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another meeting-document sync is running.');
  try {
    var client = getClientConfig_(normalizeDashboardText_(payload.clientKey, 60));
    var reportDate = normalizeDashboardText_(payload.reportDate, 10);
    var latest = reportDate ? null : getLatestDashboardMeetingDoc_(client);
    if (!reportDate) reportDate = latest.reportDate;
    parseIsoDate_(reportDate);
    var key = idempotencyKey_(client, reportDate, false);
    var expectedId = PropertiesService.getScriptProperties().getProperty(key) || (latest && latest.documentId);
    var requestedId = normalizeDashboardText_(payload.documentId, 120);
    if (!expectedId) throw new Error('No generated meeting document is registered for this client and week.');
    if (requestedId && requestedId !== expectedId) throw new Error('The requested document does not match the registered generated copy.');
    if (expectedId === CONFIG.templateDocumentId) throw new Error('Refusing to sync the master meeting template.');
    var items = normalizeDashboardItems_(payload.items);
    var doc = DocumentApp.openById(expectedId);
    var body = doc.getBody();
    replaceAgendaTable_(doc, body, items);
    replaceMeetingSection_(body, 'Analytics / SEO', buildDashboardSection_(items, ['analytics', 'seo']));
    replaceMeetingSection_(body, 'Content', buildDashboardSection_(items, ['content', 'video']));
    updateMeetingMetadata_(body, client, reportDate);
    doc.saveAndClose();
    var result = {ok: true, client: client.name, reportDate: reportDate, documentId: expectedId, url: documentUrl_(expectedId), itemCount: items.length};
    log_('dashboard_document_sync', result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function normalizeDashboardItems_(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Dashboard items must be an array of at most 100 entries.');
  return value.map(function(raw) {
    raw = raw || {};
    return {
      id: normalizeDashboardText_(raw.id, 120), title: normalizeDashboardText_(raw.title, 180),
      ownerName: normalizeDashboardText_(raw.ownerName, 120), dueDate: normalizeDashboardText_(raw.dueDate, 10),
      status: normalizeDashboardText_(raw.status, 40), channelName: normalizeDashboardText_(raw.channelName, 100),
      nowText: normalizeDashboardText_(raw.nowText, 1200), nextText: normalizeDashboardText_(raw.nextText, 1200),
      blockerText: normalizeDashboardText_(raw.blockerText, 600), dismissed: raw.dismissed === true
    };
  }).filter(function(item) { return item.id && item.title; });
}

function buildDashboardSection_(items, keywords) {
  var matching = items.filter(function(item) {
    var channel = item.channelName.toLowerCase();
    return keywords.some(function(keyword) { return channel.indexOf(keyword) >= 0; });
  }).slice(0, 20);
  if (!matching.length) return 'No active updates from the dashboard.';
  return matching.map(function(item) {
    var detail = item.nowText || item.nextText || 'Update needed.';
    return '• ' + item.title + ' — ' + dashboardStatusLabel_(item.status) + '\n  ' + detail;
  }).join('\n');
}

function normalizeDashboardText_(value, maximum) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function formatDashboardTimeline_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'No date';
  return Utilities.formatDate(parseIsoDate_(value), CONFIG.timezone, 'MMM d');
}

function dashboardStatusLabel_(status) {
  var labels = {new: 'Ready', in_progress: 'In Progress', blocked: 'Blocked', done: 'Completed', needs_evidence: 'Needs Proof', unknown: 'Needs Clarification'};
  return labels[String(status || '')] || 'Ready';
}
