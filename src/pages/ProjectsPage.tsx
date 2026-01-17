import React from 'react'
import { Folder, Plus, Clock, Star } from 'lucide-react'

export default function ProjectsPage() {
  const projects: any[] = []

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--chatty-bg-main)' }}>
      <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--chatty-line)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--chatty-text)' }}>
          Projects
        </h1>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
          style={{
            backgroundColor: 'var(--chatty-button)',
            color: 'var(--chatty-text-inverse)'
          }}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
            <Folder className="w-16 h-16 mb-4" style={{ color: 'var(--chatty-text)' }} />
            <p className="text-lg mb-2" style={{ color: 'var(--chatty-text)' }}>
              No projects yet
            </p>
            <p className="text-sm" style={{ color: 'var(--chatty-text)' }}>
              Create a project to organize your conversations and files
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project, index) => (
              <div
                key={index}
                className="p-4 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--chatty-bg-sidebar)' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Folder className="w-6 h-6" style={{ color: 'var(--chatty-button)' }} />
                  <h3 className="font-semibold" style={{ color: 'var(--chatty-text)' }}>
                    {project.name}
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-sm opacity-50">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{project.lastModified}</span>
                  </div>
                  {project.starred && (
                    <Star className="w-3 h-3 fill-current text-yellow-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
