/**
 * Action Menu Component - ChatGPT-style "+" button with capabilities
 * Similar to ChatGPT's interface with MOCR as a dedicated capability
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  FileText, 
  Image, 
  Video, 
  Search, 
  Brain, 
  Code, 
  Zap,
  X,
  Upload,
  Camera,
  FileImage
} from 'lucide-react';
import { Z_LAYERS } from '../lib/zLayers';

interface ActionMenuProps {
  onAction: (action: string, files?: File[]) => void;
  disabled?: boolean;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  fileTypes?: string[];
  multiple?: boolean;
}

const ActionMenu: React.FC<ActionMenuProps> = ({ onAction, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const actions: ActionItem[] = [
    {
      id: 'add-files',
      title: 'Add files',
      description: 'Analyze or summarize documents, images, and videos',
      icon: <FileText size={20} />,
      color: 'text-blue-500',
      fileTypes: ['.pdf', '.txt', '.md', '.csv', '.html', '.docx', '.json'],
      multiple: true
    },
    {
      id: 'mocr-video',
      title: 'MOCR Video Analysis',
      description: 'Motion Optical Character Recognition for video content',
      icon: <Video size={20} />,
      color: 'text-purple-500',
      fileTypes: ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'],
      multiple: false
    },
    {
      id: 'ocr-image',
      title: 'OCR Image Analysis',
      description: 'Extract text from images and screenshots',
      icon: <Image size={20} />,
      color: 'text-green-500',
      fileTypes: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg'],
      multiple: true
    },
    {
      id: 'web-search',
      title: 'Web search',
      description: 'Find real-time news and information',
      icon: <Search size={20} />,
      color: 'text-orange-500'
    },
    {
      id: 'deep-research',
      title: 'Deep research',
      description: 'Get a detailed report on any topic',
      icon: <Brain size={20} />,
      color: 'text-indigo-500'
    },
    {
      id: 'code-analysis',
      title: 'Code analysis',
      description: 'Analyze and explain code files',
      icon: <Code size={20} />,
      color: 'text-cyan-500',
      fileTypes: ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs'],
      multiple: true
    },
    {
      id: 'create-image',
      title: 'Create image',
      description: 'Visualize anything with AI',
      icon: <Camera size={20} />,
      color: 'text-pink-500'
    }
  ];

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedAction(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleActionClick = (action: ActionItem) => {
    if (action.fileTypes) {
      setSelectedAction(action);
      // Set up file input for this action
      if (fileInputRef.current) {
        fileInputRef.current.accept = action.fileTypes.join(',');
        fileInputRef.current.multiple = action.multiple || false;
        fileInputRef.current.click();
      }
    } else {
      // Direct action without file upload
      onAction(action.id);
      setIsOpen(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0 && selectedAction) {
      onAction(selectedAction.id, files);
    }
    setIsOpen(false);
    setSelectedAction(null);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getActionIcon = (action: ActionItem) => {
    switch (action.id) {
      case 'mocr-video':
        return <Video size={20} className="text-purple-500" />;
      case 'ocr-image':
        return <FileImage size={20} className="text-green-500" />;
      case 'add-files':
        return <Upload size={20} className="text-blue-500" />;
      default:
        return action.icon;
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Plus Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          p-2 rounded-lg transition-all duration-200
          text-inherit
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        style={{
          backgroundColor: isOpen ? 'var(--chatty-highlight)' : 'var(--chatty-button)',
          color: 'var(--chatty-plus-button)'
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.backgroundColor = 'var(--chatty-button)'
          }
        }}
      >
        <Plus
          size={16}
          className={isOpen ? 'rotate-45' : ''}
          color="var(--chatty-plus-button)"
        />
      </button>

      {/* Action Menu */}
      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-2 w-80 rounded-lg shadow-xl"
          style={{
            backgroundColor: 'var(--chatty-button)',
            border: '1px solid var(--chatty-line)',
            zIndex: Z_LAYERS.popover
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--chatty-line)' }}>
            <h3 className="font-medium" style={{ color: 'var(--chatty-text)' }}>Chatty</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="transition-colors"
              style={{ color: 'var(--chatty-text)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--chatty-highlight)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--chatty-text)'}
            >
              <X size={16} />
            </button>
          </div>

          {/* Actions Grid */}
          <div className="p-4">
            <div className="grid grid-cols-1 gap-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  className="flex items-center gap-3 p-3 rounded-lg transition-colors text-left group"
                  style={{ color: 'var(--chatty-text)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div className="flex-shrink-0">
                    {getActionIcon(action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: 'var(--chatty-text)' }}>
                      {action.title}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
                      {action.description}
                    </div>
                  </div>
                  {action.fileTypes && (
                    <div className="flex-shrink-0 text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
                      {action.multiple ? 'Multiple' : 'Single'}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--chatty-line)' }}>
            <div className="text-xs text-center" style={{ color: 'var(--chatty-text)', opacity: 0.6 }}>
              Choose an action to get started
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default ActionMenu;
