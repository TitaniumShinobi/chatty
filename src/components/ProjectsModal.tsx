import React from 'react'
import { X, FolderPlus } from 'lucide-react'
import { Z_LAYERS } from '../lib/zLayers'

type ProjectsModalProps = {
  isOpen: boolean
  onClose: () => void
}

const ProjectsModal: React.FC<ProjectsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: Z_LAYERS.modal }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--chatty-bg-main)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#2F2510', color: 'var(--chatty-text)' }}
            >
              <FolderPlus size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--chatty-text)' }}>
                Projects
              </h2>
              <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.65 }}>
                Organize related chats, files, and notes in one place.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md transition-colors"
            style={{ color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            aria-label="Close projects modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4" style={{ color: 'var(--chatty-text)' }}>
          <div className="rounded-xl px-4 py-4" style={{ backgroundColor: '#2F2510' }}>
            <h3 className="text-sm font-semibold mb-2">Coming soon</h3>
            <p className="text-sm" style={{ opacity: 0.8 }}>
              Projects will let you collect conversations, upload briefs, and track action items together.
              For now, you can start a new chat and use the tags below to note your intent.
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase font-semibold tracking-wide mb-2" style={{ opacity: 0.6 }}>
              Quick tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {['Planning', 'Writing', 'Homework', 'Research', 'Personal'].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-3 py-1 text-xs rounded-full"
                  style={{ backgroundColor: '#2F2510', color: 'var(--chatty-text)', opacity: 0.85 }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase font-semibold tracking-wide mb-2" style={{ opacity: 0.6 }}>
              Ideas for first release
            </h4>
            <ul className="list-disc space-y-1 pl-4 text-sm" style={{ opacity: 0.85 }}>
              <li>Group conversations by project</li>
              <li>Add lightweight notes or instructions</li>
              <li>Attach key files for quick reference</li>
              <li>Track progress with simple status badges</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md transition-colors"
            style={{ backgroundColor: '#2F2510', color: 'var(--chatty-text)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3D3015')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2F2510')}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectsModal
