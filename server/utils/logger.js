/**
 * OUREL ADS — Activity Logger Utility
 */
function logActivity(db, userId, action, entityType, entityId, details, ip) {
  try {
    db.prepare(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`).run(
      userId, action, entityType, entityId, details || null, ip || null
    );
  } catch (e) {
    console.error('Activity log error:', e.message);
  }
}

function createRevision(db, entityType, entityId, data, changedBy, summary) {
  try {
    db.prepare(`INSERT INTO revisions (entity_type, entity_id, data, changed_by, change_summary) VALUES (?, ?, ?, ?, ?)`).run(
      entityType, entityId, typeof data === 'string' ? data : JSON.stringify(data), changedBy, summary
    );
  } catch (e) {
    console.error('Revision error:', e.message);
  }
}

module.exports = { logActivity, createRevision };
