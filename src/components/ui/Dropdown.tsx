import { useState, useRef, useEffect, ReactNode } from "react";
import { Icon } from "./Icon.js";
import "./Dropdown.css";

interface DropdownProps {
  label: string;
  children: ReactNode;
}

export function Dropdown({ label, children }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="dropdown" ref={containerRef}>
      <button 
        type="button" 
        className="dropdown__trigger" 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {label}
        <span className="dropdown__trigger-icon">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={12} />
        </span>
      </button>
      
      {isOpen ? (
        <div className="dropdown__menu" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface DropdownItemProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

export function DropdownItem({ onClick, disabled, title, children }: DropdownItemProps) {
  return (
    <button
      type="button"
      className="dropdown__item"
      onClick={onClick}
      disabled={disabled}
      title={title}
      role="menuitem"
    >
      {children}
    </button>
  );
}
