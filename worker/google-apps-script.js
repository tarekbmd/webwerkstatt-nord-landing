/**
 * Google Apps Script — Inbound Leads Sheet Writer
 *
 * Deploy as Web App:
 * 1. Open Google Sheet (ID: 1YiHWqXtcAnOR2EBXDQ0olyiMBH5LN2FvsFLFIxAEgP4)
 * 2. Extensions → Apps Script
 * 3. Paste this code
 * 4. Create sheet tab "Inbound Leads" with headers:
 *    Timestamp | Firmenname | Email | Telefon | Quelle
 * 5. Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the Web App URL → set as APPS_SCRIPT_URL in Cloudflare Worker
 */

var SHEET_NAME = 'Inbound Leads';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
      sheet.appendRow(['Timestamp', 'Firmenname', 'Email', 'Telefon', 'Quelle']);
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.firma || '',
      data.email || '',
      data.telefon || '',
      data.quelle || 'landing-page'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
