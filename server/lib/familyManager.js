import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FAMILY_FILE = path.join(PROJECT_ROOT, 'family_data.json');

const DEFAULT_CHILD_SETTINGS = {
  contentFilterLevel: 'strict',
  roleplayAllowed: false,
  adultContentAllowed: false,
  reportToParent: true,
  maxDailyMessages: 100,
  allowedConstructs: [],
  blockedConstructs: [],
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursEnabled: false,
};

async function loadFamilyData() {
  try {
    const content = await fs.readFile(FAMILY_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        links: {},
        invites: {},
        reports: {},
        settings: {},
      };
    }
    throw error;
  }
}

async function saveFamilyData(data) {
  await fs.writeFile(FAMILY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateInviteCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

export async function createInvite(parentUserId, parentEmail, childEmail, childName) {
  const data = await loadFamilyData();

  const existingInvite = Object.values(data.invites).find(
    inv => inv.parentUserId === parentUserId && inv.childEmail === childEmail && inv.status === 'pending'
  );
  if (existingInvite) {
    return { ok: false, error: 'Invite already pending for this email' };
  }

  const code = generateInviteCode();
  const invite = {
    id: `inv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    code,
    parentUserId,
    parentEmail,
    childEmail,
    childName: childName || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  data.invites[invite.id] = invite;
  await saveFamilyData(data);

  return { ok: true, invite };
}

export async function acceptInvite(childUserId, childEmail, inviteCode) {
  const data = await loadFamilyData();

  const invite = Object.values(data.invites).find(
    inv => inv.code === inviteCode && inv.status === 'pending'
  );

  if (!invite) {
    return { ok: false, error: 'Invalid or expired invite code' };
  }

  if (new Date(invite.expiresAt) < new Date()) {
    invite.status = 'expired';
    await saveFamilyData(data);
    return { ok: false, error: 'Invite has expired' };
  }

  if (invite.childEmail && invite.childEmail !== childEmail) {
    return { ok: false, error: 'This invite was sent to a different email address' };
  }

  invite.status = 'accepted';
  invite.acceptedAt = new Date().toISOString();
  invite.childUserId = childUserId;

  const linkId = `link_${Date.now()}`;
  data.links[linkId] = {
    id: linkId,
    parentUserId: invite.parentUserId,
    childUserId: childUserId,
    childEmail: childEmail,
    childName: invite.childName,
    linkedAt: new Date().toISOString(),
    active: true,
  };

  if (!data.settings[childUserId]) {
    data.settings[childUserId] = { ...DEFAULT_CHILD_SETTINGS };
  }

  await saveFamilyData(data);

  return { ok: true, link: data.links[linkId] };
}

export async function getFamilyForUser(userId, userEmail) {
  const data = await loadFamilyData();

  const childLinks = Object.values(data.links).filter(
    l => l.parentUserId === userId && l.active
  );

  const parentLinks = Object.values(data.links).filter(
    l => l.childUserId === userId && l.active
  );

  const pendingInvites = Object.values(data.invites).filter(
    inv => inv.parentUserId === userId && inv.status === 'pending'
  );

  const incomingInvites = Object.values(data.invites).filter(
    inv => inv.childEmail === userEmail && inv.status === 'pending'
  );

  const isParent = childLinks.length > 0 || pendingInvites.length > 0;
  const isChild = parentLinks.length > 0;

  const children = childLinks.map(link => ({
    ...link,
    settings: data.settings[link.childUserId] || { ...DEFAULT_CHILD_SETTINGS },
  }));

  return {
    isParent,
    isChild,
    children,
    parents: parentLinks,
    pendingInvites,
    incomingInvites,
    accountType: isChild ? 'child' : (isParent ? 'parent' : 'standard'),
  };
}

export async function getAccountType(userId) {
  const data = await loadFamilyData();

  const isChild = Object.values(data.links).some(
    l => l.childUserId === userId && l.active
  );
  if (isChild) return 'child';

  const isParent = Object.values(data.links).some(
    l => l.parentUserId === userId && l.active
  );
  if (isParent) return 'parent';

  return 'standard';
}

export async function getChildSettings(childUserId) {
  const data = await loadFamilyData();
  return data.settings[childUserId] || null;
}

export async function updateChildSettings(parentUserId, childUserId, updates) {
  const data = await loadFamilyData();

  const link = Object.values(data.links).find(
    l => l.parentUserId === parentUserId && l.childUserId === childUserId && l.active
  );

  if (!link) {
    return { ok: false, error: 'You are not the parent of this account' };
  }

  const allowed = [
    'contentFilterLevel', 'roleplayAllowed', 'adultContentAllowed',
    'reportToParent', 'maxDailyMessages', 'allowedConstructs',
    'blockedConstructs', 'quietHoursStart', 'quietHoursEnd', 'quietHoursEnabled'
  ];

  if (!data.settings[childUserId]) {
    data.settings[childUserId] = { ...DEFAULT_CHILD_SETTINGS };
  }

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      data.settings[childUserId][key] = updates[key];
    }
  }

  data.settings[childUserId].updatedAt = new Date().toISOString();
  data.settings[childUserId].updatedBy = parentUserId;

  await saveFamilyData(data);

  return { ok: true, settings: data.settings[childUserId] };
}

export async function addReport(childUserId, constructId, report) {
  const data = await loadFamilyData();

  if (!data.reports[childUserId]) {
    data.reports[childUserId] = [];
  }

  const entry = {
    id: `rpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    childUserId,
    constructId,
    severity: report.severity || 'info',
    category: report.category || 'general',
    summary: report.summary || '',
    messageExcerpt: report.messageExcerpt || '',
    flaggedContent: report.flaggedContent || '',
    timestamp: new Date().toISOString(),
    reviewed: false,
  };

  data.reports[childUserId].push(entry);

  if (data.reports[childUserId].length > 500) {
    data.reports[childUserId] = data.reports[childUserId].slice(-500);
  }

  await saveFamilyData(data);

  return entry;
}

export async function getReportsForChild(parentUserId, childUserId, options = {}) {
  const data = await loadFamilyData();

  const link = Object.values(data.links).find(
    l => l.parentUserId === parentUserId && l.childUserId === childUserId && l.active
  );

  if (!link) {
    return { ok: false, error: 'You are not the parent of this account' };
  }

  let reports = data.reports[childUserId] || [];

  if (options.severity) {
    reports = reports.filter(r => r.severity === options.severity);
  }
  if (options.since) {
    reports = reports.filter(r => new Date(r.timestamp) >= new Date(options.since));
  }
  if (!options.includeReviewed) {
    reports = reports.filter(r => !r.reviewed);
  }

  reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const limit = options.limit || 50;
  reports = reports.slice(0, limit);

  return { ok: true, reports, total: (data.reports[childUserId] || []).length };
}

export async function markReportReviewed(parentUserId, reportId) {
  const data = await loadFamilyData();

  for (const childId of Object.keys(data.reports)) {
    const link = Object.values(data.links).find(
      l => l.parentUserId === parentUserId && l.childUserId === childId && l.active
    );
    if (!link) continue;

    const report = data.reports[childId].find(r => r.id === reportId);
    if (report) {
      report.reviewed = true;
      report.reviewedAt = new Date().toISOString();
      report.reviewedBy = parentUserId;
      await saveFamilyData(data);
      return { ok: true };
    }
  }

  return { ok: false, error: 'Report not found or access denied' };
}

export async function removeChildLink(parentUserId, childUserId) {
  const data = await loadFamilyData();

  const link = Object.values(data.links).find(
    l => l.parentUserId === parentUserId && l.childUserId === childUserId && l.active
  );

  if (!link) {
    return { ok: false, error: 'Link not found' };
  }

  link.active = false;
  link.removedAt = new Date().toISOString();

  delete data.settings[childUserId];

  await saveFamilyData(data);

  return { ok: true };
}

export async function revokeInvite(parentUserId, inviteId) {
  const data = await loadFamilyData();

  const invite = data.invites[inviteId];
  if (!invite || invite.parentUserId !== parentUserId) {
    return { ok: false, error: 'Invite not found' };
  }

  invite.status = 'revoked';
  invite.revokedAt = new Date().toISOString();

  await saveFamilyData(data);

  return { ok: true };
}

export { DEFAULT_CHILD_SETTINGS };
