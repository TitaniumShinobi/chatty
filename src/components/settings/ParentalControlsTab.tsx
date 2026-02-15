import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, UserPlus, Copy, Check, Trash2, Eye,
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp,
  Users, Settings, Bell, Clock, Shield
} from 'lucide-react'

interface FamilyStatus {
  isParent: boolean
  isChild: boolean
  accountType: string
  children: ChildLink[]
  parents: ParentLink[]
  pendingInvites: Invite[]
  incomingInvites: Invite[]
}

interface ChildLink {
  id: string
  childUserId: string
  childEmail: string
  childName: string
  linkedAt: string
  settings: ChildSettings
}

interface ParentLink {
  id: string
  parentUserId: string
  linkedAt: string
}

interface ChildSettings {
  contentFilterLevel: string
  roleplayAllowed: boolean
  adultContentAllowed: boolean
  reportToParent: boolean
  maxDailyMessages: number
  quietHoursStart: string
  quietHoursEnd: string
  quietHoursEnabled: boolean
}

interface Invite {
  id: string
  code: string
  childEmail: string
  childName: string
  status: string
  createdAt: string
  expiresAt: string
}

interface Report {
  id: string
  constructId: string
  severity: string
  category: string
  summary: string
  messageExcerpt: string
  flaggedContent: string
  timestamp: string
  reviewed: boolean
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#3B82F6',
}

const SEVERITY_ICONS: Record<string, typeof AlertTriangle> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
}

const ParentalControlsTab: React.FC = () => {
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'overview' | 'invite' | 'reports' | 'settings'>('overview')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteChildName, setInviteChildName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [selectedChild, setSelectedChild] = useState<string | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchFamilyStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/family/status')
      const data = await res.json()
      if (data.ok) {
        setFamilyStatus(data)
        setError(null)
      } else {
        setError(data.error || 'Failed to load family status')
      }
    } catch (err) {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFamilyStatus()
  }, [fetchFamilyStatus])

  const handleSendInvite = async () => {
    if (!inviteEmail) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childEmail: inviteEmail, childName: inviteChildName }),
      })
      const data = await res.json()
      if (data.ok) {
        setInviteEmail('')
        setInviteChildName('')
        await fetchFamilyStatus()
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to send invite')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAcceptInvite = async () => {
    if (!inviteCode) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/family/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      })
      const data = await res.json()
      if (data.ok) {
        setInviteCode('')
        await fetchFamilyStatus()
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to accept invite')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await fetch(`/api/family/invite/${inviteId}`, { method: 'DELETE' })
      await fetchFamilyStatus()
    } catch {
      setError('Failed to revoke invite')
    }
  }

  const handleRemoveChild = async (childUserId: string) => {
    if (!confirm('Remove this child from your family? This will disable parental controls for their account.')) return
    try {
      await fetch(`/api/family/child/${childUserId}`, { method: 'DELETE' })
      await fetchFamilyStatus()
    } catch {
      setError('Failed to remove child')
    }
  }

  const handleUpdateChildSettings = async (childUserId: string, updates: Partial<ChildSettings>) => {
    try {
      const res = await fetch(`/api/family/child-settings/${childUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (data.ok) {
        await fetchFamilyStatus()
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to update settings')
    }
  }

  const handleLoadReports = async (childUserId: string) => {
    setReportsLoading(true)
    setSelectedChild(childUserId)
    try {
      const res = await fetch(`/api/family/reports/${childUserId}?includeReviewed=true&limit=50`)
      const data = await res.json()
      if (data.ok) {
        setReports(data.reports)
      }
    } catch {
      setError('Failed to load reports')
    } finally {
      setReportsLoading(false)
    }
  }

  const handleMarkReviewed = async (reportId: string) => {
    try {
      await fetch(`/api/family/reports/${reportId}/reviewed`, { method: 'POST' })
      if (selectedChild) await handleLoadReports(selectedChild)
    } catch {
      setError('Failed to mark report as reviewed')
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 rounded w-48" style={{ backgroundColor: 'var(--chatty-line)' }} />
        <div className="h-32 rounded" style={{ backgroundColor: 'var(--chatty-line)' }} />
      </div>
    )
  }

  const isParent = familyStatus?.isParent || false
  const isChild = familyStatus?.isChild || false
  const hasFamily = isParent || isChild

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck size={24} style={{ color: 'var(--chatty-text)' }} />
        <h3 className="text-lg font-medium" style={{ color: 'var(--chatty-text)' }}>
          Parental Controls & Family
        </h3>
      </div>

      {error && (
        <div className="p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {!hasFamily && <SetupView
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteChildName={inviteChildName}
        setInviteChildName={setInviteChildName}
        inviteCode={inviteCode}
        setInviteCode={setInviteCode}
        onSendInvite={handleSendInvite}
        onAcceptInvite={handleAcceptInvite}
        actionLoading={actionLoading}
      />}

      {isParent && <ParentView
        familyStatus={familyStatus!}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteChildName={inviteChildName}
        setInviteChildName={setInviteChildName}
        onSendInvite={handleSendInvite}
        onRevokeInvite={handleRevokeInvite}
        onRemoveChild={handleRemoveChild}
        onUpdateChildSettings={handleUpdateChildSettings}
        onLoadReports={handleLoadReports}
        onMarkReviewed={handleMarkReviewed}
        onCopyCode={handleCopyCode}
        copiedCode={copiedCode}
        reports={reports}
        reportsLoading={reportsLoading}
        selectedChild={selectedChild}
        actionLoading={actionLoading}
      />}

      {isChild && <ChildView familyStatus={familyStatus!} />}
    </div>
  )
}

const SetupView: React.FC<{
  inviteEmail: string
  setInviteEmail: (v: string) => void
  inviteChildName: string
  setInviteChildName: (v: string) => void
  inviteCode: string
  setInviteCode: (v: string) => void
  onSendInvite: () => void
  onAcceptInvite: () => void
  actionLoading: boolean
}> = ({ inviteEmail, setInviteEmail, inviteChildName, setInviteChildName, inviteCode, setInviteCode, onSendInvite, onAcceptInvite, actionLoading }) => (
  <div className="space-y-6">
    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
      <p className="text-sm mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
        Family accounts let parents monitor and control their child's AI interactions. 
        Set content filters, view activity reports, and get alerts when the AI flags concerning conversations.
      </p>
    </div>

    <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-bg-message)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} style={{ color: 'var(--chatty-text)' }} />
        <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>I'm a Parent</h4>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
        Invite your child to link their account. You'll be able to set content filters and receive activity reports.
      </p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Child's name"
          value={inviteChildName}
          onChange={(e) => setInviteChildName(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm"
          style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
        />
        <input
          type="email"
          placeholder="Child's email address"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm"
          style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
        />
        <button
          onClick={onSendInvite}
          disabled={!inviteEmail || actionLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#3B82F6', color: 'white' }}
        >
          <UserPlus size={16} />
          {actionLoading ? 'Sending...' : 'Send Invite'}
        </button>
      </div>
    </div>

    <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-bg-message)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Shield size={18} style={{ color: 'var(--chatty-text)' }} />
        <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>I Have an Invite Code</h4>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
        If a parent sent you an invite code, enter it here to link your account.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Enter invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          className="flex-1 px-3 py-2 rounded text-sm font-mono"
          style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
          maxLength={12}
        />
        <button
          onClick={onAcceptInvite}
          disabled={!inviteCode || actionLoading}
          className="px-4 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#10B981', color: 'white' }}
        >
          {actionLoading ? 'Linking...' : 'Link'}
        </button>
      </div>
    </div>
  </div>
)

const ParentView: React.FC<{
  familyStatus: FamilyStatus
  activeSection: string
  setActiveSection: (s: 'overview' | 'invite' | 'reports' | 'settings') => void
  inviteEmail: string
  setInviteEmail: (v: string) => void
  inviteChildName: string
  setInviteChildName: (v: string) => void
  onSendInvite: () => void
  onRevokeInvite: (id: string) => void
  onRemoveChild: (id: string) => void
  onUpdateChildSettings: (childId: string, updates: Partial<ChildSettings>) => void
  onLoadReports: (childId: string) => void
  onMarkReviewed: (reportId: string) => void
  onCopyCode: (code: string) => void
  copiedCode: string | null
  reports: Report[]
  reportsLoading: boolean
  selectedChild: string | null
  actionLoading: boolean
}> = ({
  familyStatus, activeSection, setActiveSection,
  inviteEmail, setInviteEmail, inviteChildName, setInviteChildName,
  onSendInvite, onRevokeInvite, onRemoveChild,
  onUpdateChildSettings, onLoadReports, onMarkReviewed,
  onCopyCode, copiedCode, reports, reportsLoading, selectedChild, actionLoading
}) => {
  const tabs = [
    { id: 'overview' as const, label: 'Family', icon: Users },
    { id: 'invite' as const, label: 'Invite', icon: UserPlus },
    { id: 'reports' as const, label: 'Reports', icon: Bell },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ]

  const unreviewed = familyStatus.children.reduce((acc, child) => acc, 0)

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: activeSection === tab.id ? 'var(--chatty-bg-main)' : 'transparent',
                color: 'var(--chatty-text)',
                opacity: activeSection === tab.id ? 1 : 0.7,
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeSection === 'overview' && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
            Linked Children ({familyStatus.children.length})
          </h4>
          {familyStatus.children.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              No children linked yet. Use the Invite tab to add a child.
            </p>
          ) : (
            familyStatus.children.map(child => (
              <ChildCard
                key={child.id}
                child={child}
                onRemove={() => onRemoveChild(child.childUserId)}
                onViewReports={() => { onLoadReports(child.childUserId); setActiveSection('reports') }}
                onSettings={() => setActiveSection('settings')}
              />
            ))
          )}

          {familyStatus.pendingInvites.length > 0 && (
            <>
              <h4 className="text-sm font-medium mt-4" style={{ color: 'var(--chatty-text)' }}>
                Pending Invites ({familyStatus.pendingInvites.length})
              </h4>
              {familyStatus.pendingInvites.map(inv => (
                <div key={inv.id} className="p-3 rounded-lg flex items-center justify-between" style={{ backgroundColor: 'var(--chatty-bg-message)', border: '1px solid var(--chatty-line)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                      {inv.childName || inv.childEmail}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                      Code: <span className="font-mono">{inv.code}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onCopyCode(inv.code)} className="p-1.5 rounded transition-colors" style={{ color: 'var(--chatty-text)' }}>
                      {copiedCode === inv.code ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => onRevokeInvite(inv.id)} className="p-1.5 rounded transition-colors" style={{ color: '#EF4444' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {activeSection === 'invite' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border" style={{ borderColor: 'var(--chatty-line)', backgroundColor: 'var(--chatty-bg-message)' }}>
            <h4 className="font-medium mb-3" style={{ color: 'var(--chatty-text)' }}>Invite a Child</h4>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Child's name"
                value={inviteChildName}
                onChange={(e) => setInviteChildName(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
              />
              <input
                type="email"
                placeholder="Child's email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
              />
              <button
                onClick={onSendInvite}
                disabled={!inviteEmail || actionLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: '#3B82F6', color: 'white' }}
              >
                <UserPlus size={16} />
                {actionLoading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
            <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              After sending an invite, share the invite code with your child. They can enter it in their own 
              Settings &gt; Parental Controls to link their account.
            </p>
          </div>
        </div>
      )}

      {activeSection === 'reports' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={16} style={{ color: 'var(--chatty-text)' }} />
            <h4 className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>Activity Reports</h4>
          </div>

          {familyStatus.children.length > 1 && (
            <div className="flex gap-2 mb-3">
              {familyStatus.children.map(child => (
                <button
                  key={child.childUserId}
                  onClick={() => onLoadReports(child.childUserId)}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: selectedChild === child.childUserId ? 'var(--chatty-bg-main)' : 'var(--chatty-bg-message)',
                    color: 'var(--chatty-text)',
                    border: selectedChild === child.childUserId ? '1px solid var(--chatty-line)' : '1px solid transparent',
                  }}
                >
                  {child.childName || child.childEmail}
                </button>
              ))}
            </div>
          )}

          {!selectedChild && familyStatus.children.length > 0 && (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                Select a child to view their activity reports.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                {familyStatus.children.map(child => (
                  <button
                    key={child.childUserId}
                    onClick={() => onLoadReports(child.childUserId)}
                    className="px-4 py-2 rounded text-sm"
                    style={{ backgroundColor: '#3B82F6', color: 'white' }}
                  >
                    {child.childName || child.childEmail}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reportsLoading && (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded" style={{ backgroundColor: 'var(--chatty-line)' }} />
              ))}
            </div>
          )}

          {selectedChild && !reportsLoading && reports.length === 0 && (
            <div className="text-center py-8 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
              <ShieldCheck size={32} className="mx-auto mb-2" style={{ color: '#10B981' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>All Clear</p>
              <p className="text-xs mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                No flagged activity to report. Keep up the good work!
              </p>
            </div>
          )}

          {selectedChild && !reportsLoading && reports.map(report => (
            <ReportCard key={report.id} report={report} onMarkReviewed={onMarkReviewed} />
          ))}
        </div>
      )}

      {activeSection === 'settings' && (
        <div className="space-y-4">
          {familyStatus.children.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              No children linked. Add a child to configure their settings.
            </p>
          ) : (
            familyStatus.children.map(child => (
              <ChildSettingsPanel
                key={child.childUserId}
                child={child}
                onUpdate={(updates) => onUpdateChildSettings(child.childUserId, updates)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

const ChildCard: React.FC<{
  child: ChildLink
  onRemove: () => void
  onViewReports: () => void
  onSettings: () => void
}> = ({ child, onRemove, onViewReports, onSettings }) => (
  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)', border: '1px solid var(--chatty-line)' }}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
          {child.childName || 'Unnamed Child'}
        </p>
        <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
          {child.childEmail} &middot; Filter: {child.settings.contentFilterLevel}
        </p>
      </div>
      <div className="flex gap-1">
        <button onClick={onViewReports} className="p-1.5 rounded transition-colors" style={{ color: 'var(--chatty-text)' }} title="View Reports">
          <Bell size={14} />
        </button>
        <button onClick={onSettings} className="p-1.5 rounded transition-colors" style={{ color: 'var(--chatty-text)' }} title="Settings">
          <Settings size={14} />
        </button>
        <button onClick={onRemove} className="p-1.5 rounded transition-colors" style={{ color: '#EF4444' }} title="Remove">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  </div>
)

const ChildSettingsPanel: React.FC<{
  child: ChildLink
  onUpdate: (updates: Partial<ChildSettings>) => void
}> = ({ child, onUpdate }) => {
  const [expanded, setExpanded] = useState(true)
  const s = child.settings

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--chatty-line)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
        style={{ color: 'var(--chatty-text)' }}
      >
        <span className="text-sm font-medium">{child.childName || child.childEmail}</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="p-3 pt-0 space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>Content Filter Level</label>
            <div className="flex gap-2">
              {['strict', 'moderate', 'light'].map(level => (
                <button
                  key={level}
                  onClick={() => onUpdate({ contentFilterLevel: level })}
                  className="flex-1 px-3 py-2 rounded text-xs font-medium transition-all"
                  style={{
                    backgroundColor: s.contentFilterLevel === level
                      ? (level === 'strict' ? '#10B981' : level === 'moderate' ? '#EAB308' : '#F97316')
                      : 'var(--chatty-bg-message)',
                    color: s.contentFilterLevel === level ? 'white' : 'var(--chatty-text)',
                    border: `1px solid ${s.contentFilterLevel === level ? 'transparent' : 'var(--chatty-line)'}`,
                  }}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <ToggleSetting
            label="Report Activity to Parent"
            description="AI constructs will flag concerning conversations and report them to you"
            checked={s.reportToParent}
            onChange={(v) => onUpdate({ reportToParent: v })}
          />

          <ToggleSetting
            label="Allow Roleplay"
            description="Let constructs engage in roleplay and character narration"
            checked={s.roleplayAllowed}
            onChange={(v) => onUpdate({ roleplayAllowed: v })}
          />

          <ToggleSetting
            label="Quiet Hours"
            description={`Restrict usage between ${s.quietHoursStart} - ${s.quietHoursEnd}`}
            checked={s.quietHoursEnabled}
            onChange={(v) => onUpdate({ quietHoursEnabled: v })}
          />

          {s.quietHoursEnabled && (
            <div className="flex gap-3 pl-4">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>Start</label>
                <input
                  type="time"
                  value={s.quietHoursStart}
                  onChange={(e) => onUpdate({ quietHoursStart: e.target.value })}
                  className="px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>End</label>
                <input
                  type="time"
                  value={s.quietHoursEnd}
                  onChange={(e) => onUpdate({ quietHoursEnd: e.target.value })}
                  className="px-2 py-1 rounded text-xs"
                  style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ToggleSetting: React.FC<{
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}> = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between">
    <div className="flex-1">
      <p className="text-xs font-medium" style={{ color: 'var(--chatty-text)' }}>{label}</p>
      <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>{description}</p>
    </div>
    <button
      onClick={() => onChange(!checked)}
      className="w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ml-3"
      style={{ backgroundColor: checked ? '#3B82F6' : 'var(--chatty-line)' }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ left: checked ? '22px' : '2px' }}
      />
    </button>
  </div>
)

const ReportCard: React.FC<{
  report: Report
  onMarkReviewed: (id: string) => void
}> = ({ report, onMarkReviewed }) => {
  const Icon = SEVERITY_ICONS[report.severity] || Info
  const color = SEVERITY_COLORS[report.severity] || '#3B82F6'

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--chatty-bg-message)',
        borderLeft: `3px solid ${color}`,
        opacity: report.reviewed ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon size={16} style={{ color, flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color }}>
              {report.severity.toUpperCase()} &middot; {report.category.replace(/_/g, ' ')}
            </span>
            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
              {new Date(report.timestamp).toLocaleDateString()} {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--chatty-text)' }}>
            {report.summary}
          </p>
          {report.messageExcerpt && (
            <p className="text-xs mt-1 p-2 rounded" style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', opacity: 0.7 }}>
              "{report.messageExcerpt.substring(0, 150)}{report.messageExcerpt.length > 150 ? '...' : ''}"
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}>
              Construct: {report.constructId}
            </span>
            {!report.reviewed && (
              <button
                onClick={() => onMarkReviewed(report.id)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
                style={{ backgroundColor: 'var(--chatty-bg-main)', color: 'var(--chatty-text)', border: '1px solid var(--chatty-line)' }}
              >
                <Eye size={12} />
                Mark Reviewed
              </button>
            )}
            {report.reviewed && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#10B981' }}>
                <Check size={12} />
                Reviewed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const ChildView: React.FC<{ familyStatus: FamilyStatus }> = ({ familyStatus }) => (
  <div className="space-y-4">
    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)', border: '1px solid var(--chatty-line)' }}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={20} style={{ color: '#3B82F6' }} />
        <h4 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Family Account Active</h4>
      </div>
      <p className="text-sm" style={{ color: 'var(--chatty-text)', opacity: 0.8 }}>
        Your account is linked to a parent. Some content and features may be restricted based on your parent's settings.
      </p>
    </div>

    <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--chatty-bg-message)' }}>
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--chatty-text)' }}>What this means:</p>
      <ul className="space-y-1.5">
        <li className="text-xs flex items-start gap-2" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
          <Shield size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#3B82F6' }} />
          Content filters are applied to keep conversations safe
        </li>
        <li className="text-xs flex items-start gap-2" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
          <Bell size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#EAB308' }} />
          Your parent may receive reports about concerning conversations
        </li>
        <li className="text-xs flex items-start gap-2" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
          <Clock size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#8B5CF6' }} />
          Usage hours may be limited during quiet hours
        </li>
      </ul>
    </div>

    {familyStatus.incomingInvites.length > 0 && (
      <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3B82F6' }}>
        <p className="text-xs font-medium" style={{ color: '#3B82F6' }}>
          You have {familyStatus.incomingInvites.length} pending invite(s)
        </p>
      </div>
    )}
  </div>
)

export default ParentalControlsTab
