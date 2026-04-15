import React from 'react';

const skipLinkStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-9999px',
  top: 'auto',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  zIndex: 9999,
};

const skipLinkFocusStyle: React.CSSProperties = {
  position: 'fixed',
  top: '8px',
  left: '8px',
  width: 'auto',
  height: 'auto',
  overflow: 'visible',
  padding: '12px 24px',
  background: 'var(--primary-color, #232f3e)',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  borderRadius: '4px',
  textDecoration: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

const SkipLink: React.FC = () => {
  const [focused, setFocused] = React.useState(false);

  return (
    <a
      href="#main-content"
      style={focused ? skipLinkFocusStyle : skipLinkStyle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="skip-link"
    >
      Skip to main content
    </a>
  );
};

export default SkipLink;
