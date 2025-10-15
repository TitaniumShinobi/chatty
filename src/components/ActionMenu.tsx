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
          ${isOpen 
            ? 'bg-app-orange-700 text-white' 
            : 'text-app-orange-400 hover:text-white hover:bg-app-orange-700'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <Plus size={16} className={isOpen ? 'rotate-45' : ''} />
      </button>

      {/* Action Menu */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-app-orange-800 border border-app-orange-700 rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-app-orange-700">
            <h3 className="text-white font-medium">Chatty</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-app-orange-400 hover:text-white transition-colors"
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
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-app-orange-700 transition-colors text-left group"
                >
                  <div className="flex-shrink-0">
                    {getActionIcon(action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm">
                      {action.title}
                    </div>
                    <div className="text-app-orange-400 text-xs mt-1">
                      {action.description}
                    </div>
                  </div>
                  {action.fileTypes && (
                    <div className="flex-shrink-0 text-app-orange-500 text-xs">
                      {action.multiple ? 'Multiple' : 'Single'}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-app-orange-700">
            <div className="text-xs text-app-orange-500 text-center">
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
