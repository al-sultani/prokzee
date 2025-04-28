import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ContextMenuState {
  x: number;
  y: number;
  show: boolean;
  items: ContextMenuSection[];
}

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  action: () => void;
  className?: string;
}

interface ContextMenuSection {
  title?: string;
  items: ContextMenuItem[];
}

interface ContextMenuContextType {
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  hideContextMenu: () => void;
  contextMenuState: ContextMenuState;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useContextMenu = () => {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return context;
};

interface ContextMenuProviderProps {
  children: ReactNode;
}

export function ContextMenuProvider({ children }: ContextMenuProviderProps) {
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    show: false,
    items: [],
  });

  const showContextMenu = (x: number, y: number, items: ContextMenuItem[]) => {
    // Group items into sections based on type
    const editItems = items.filter(item => 
      ["Copy", "Cut", "Paste", "Inject Placeholder"].includes(item.label)
    );

    const actionItems = items.filter(item => 
      !["Copy", "Cut", "Paste", "Inject Placeholder"].includes(item.label)
    );

    const sections = [];
    if (editItems.length > 0) {
      sections.push({
        title: "Edit",
        items: editItems
      });
    }
    if (actionItems.length > 0) {
      sections.push({
        title: "Actions",
        items: actionItems
      });
    }

    setContextMenuState({ x, y, show: true, items: sections });
  };

  const hideContextMenu = () => {
    setContextMenuState(prev => ({ ...prev, show: false }));
  };

  // Click outside handler
  React.useEffect(() => {
    const handleClickOutside = () => {
      hideContextMenu();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };

    if (contextMenuState.show) {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuState.show]);

  return (
    <ContextMenuContext.Provider value={{ showContextMenu, hideContextMenu, contextMenuState }}>
      {children}
      {contextMenuState.show && (
        <div 
          className="fixed z-50 bg-white dark:bg-dark-secondary shadow-lg rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 w-72"
          style={{ 
            left: `${contextMenuState.x}px`,
            top: `${contextMenuState.y}px`,
            opacity: 0,
            pointerEvents: 'none',
            transition: "opacity 150ms ease, transform 150ms ease",
            transform: "scale(0.95)"
          }}
          ref={(el) => {
            if (el) {
              // Get dimensions and adjust position if needed
              const menuRect = el.getBoundingClientRect();
              
              // Adjust for right edge of viewport
              if (contextMenuState.x + menuRect.width > window.innerWidth) {
                el.style.left = `${window.innerWidth - menuRect.width - 5}px`;
              }
              
              // Adjust for bottom edge of viewport
              if (contextMenuState.y + menuRect.height > window.innerHeight) {
                el.style.top = `${window.innerHeight - menuRect.height - 5}px`;
              }
              
              // Make visible after positioning
              setTimeout(() => {
                if (el) {
                  el.style.opacity = '1';
                  el.style.pointerEvents = 'auto';
                  el.style.transform = "scale(1)";
                }
              }, 0);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            // Prevent mousedown from triggering context menu
            if (e.button === 2) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          }}
        >
          {contextMenuState.items.map((section, sectionIndex) => (
            <div 
              key={sectionIndex} 
              className={`${sectionIndex > 0 ? 'border-t border-gray-200 dark:border-gray-700 mt-1 pt-1' : ''} p-2 space-y-1`}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }}
              onMouseDown={(e) => {
                // Prevent mousedown from triggering context menu
                if (e.button === 2) {
                  e.preventDefault();
                  e.stopPropagation();
                  return false;
                }
              }}
            >
              {section.title && (
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-left">
                  {section.title}
                </div>
              )}
              {section.items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  role="menuitem"
                  tabIndex={0}
                  className={item.className || "flex items-center w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-blue-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors duration-150 group cursor-pointer"}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.nativeEvent as MouseEvent).stopImmediatePropagation();
                    item.action();
                    hideContextMenu();
                  }}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.nativeEvent as KeyboardEvent).stopImmediatePropagation();
                      item.action();
                      hideContextMenu();
                    }
                  }}
                  onContextMenu={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.nativeEvent as MouseEvent).stopImmediatePropagation();
                    return false;
                  }}
                  onMouseDown={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.nativeEvent as MouseEvent).stopImmediatePropagation();
                    if (e.button === 2) {
                      return false;
                    }
                  }}
                  onMouseUp={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.nativeEvent as MouseEvent).stopImmediatePropagation();
                  }}
                  onPointerDown={(e: React.PointerEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.nativeEvent as PointerEvent).stopImmediatePropagation();
                  }}
                  onPointerUp={(e: React.PointerEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.nativeEvent as PointerEvent).stopImmediatePropagation();
                  }}
                >
                  {item.icon && (
                    <span className="w-4 h-4 mr-3 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors duration-150">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </ContextMenuContext.Provider>
  );
} 