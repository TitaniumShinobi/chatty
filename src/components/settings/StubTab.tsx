import React from 'react';

interface StubTabProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const StubTab: React.FC<StubTabProps> = ({ title, description, icon }) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--chatty-text)' }}>
        {title}
      </h3>
      <div className="space-y-4">
        {icon && (
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full" style={{ backgroundColor: '#feffaf' }}>
              {icon}
            </div>
          </div>
        )}
        
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
            {description || `${title} settings are coming soon. This section will be expanded with more options in future updates.`}
          </p>
          
          <div className="p-4 rounded-lg border-2 border-dashed" style={{ borderColor: 'var(--chatty-line)' }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--chatty-text)' }}>
                Feature in Development
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              We're working hard to bring you more customization options and features.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StubTab;
