import React, { useState } from 'react';
import { Dice5, Timer, Monitor, BookOpen, Target, Brain, BarChart3, Bookmark, Search } from 'lucide-react';
import './TabNavigation.css';

export type TabType = 'random' | 'mock' | 'fullmock' | 'practice' | 'study' | 'spaced-repetition' | 'history' | 'bookmarks' | 'search';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tabs = [
    { id: 'random' as TabType, label: 'Random Practice', icon: <Dice5 size={18} /> },
    { id: 'mock' as TabType, label: 'Practice Mock', icon: <Timer size={18} /> },
    { id: 'fullmock' as TabType, label: 'Full Mock', icon: <Monitor size={18} /> },
    { id: 'practice' as TabType, label: 'Practice Mode', icon: <BookOpen size={18} /> },
    { id: 'study' as TabType, label: 'Study Mode', icon: <Target size={18} /> },
    { id: 'spaced-repetition' as TabType, label: 'Spaced Repetition', icon: <Brain size={18} /> },
    { id: 'history' as TabType, label: 'Test History', icon: <BarChart3 size={18} /> },
    { id: 'bookmarks' as TabType, label: 'Bookmarks', icon: <Bookmark size={18} /> },
    { id: 'search' as TabType, label: 'Search', icon: <Search size={18} /> }
  ];

  const handleTabChange = (tab: TabType) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false); // Close mobile menu when tab is selected
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const activeTabData = tabs.find(tab => tab.id === activeTab);

  return (
    <nav className="tab-navigation" aria-label="Mode navigation">
      {/* Desktop Navigation */}
      <div className="desktop-tabs" role="tablist" aria-label="Practice modes">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={tab.label}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Mobile Navigation */}
      <div className="mobile-nav">
        <button 
          className="mobile-menu-button"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
        >
          <div className="current-tab">
            <span className="tab-icon">{activeTabData?.icon}</span>
            <span className="tab-label">{activeTabData?.label}</span>
          </div>
          <div className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>

        {/* Mobile Dropdown Menu */}
        <div className={`mobile-menu ${isMobileMenuOpen ? 'open' : ''}`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`mobile-tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-menu-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </nav>

  );
};

export default TabNavigation;
