import React, { useEffect } from 'react';
import { 
  Smartphone, 
  Clock, 
  FolderDown, 
  Sparkles
} from 'lucide-react';

export default function AppComingSoonModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Push a dummy history state so pressing Android/Browser "Back" closes the modal
    window.history.pushState({ modalOpen: true }, '');

    const handlePopState = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content coming-soon-modal" onClick={(e) => e.stopPropagation()}>
        {/* Cross icon removed per user instructions. Dismissable via back, outside click, or Got It button */}
        <div className="cs-icon-wrapper">
          <div className="cs-icon-circle">
            <Smartphone size={36} className="text-cyan" />
          </div>
          <div className="cs-sparkle">
            <Sparkles size={18} className="text-purple" />
          </div>
        </div>

        <div className="cs-badge">
          <Clock size={13} />
          <span>BUILD IN PREPARATION</span>
        </div>

        <h3 className="cs-title">Android App Coming Soon</h3>

        <p className="cs-desc">
          The native Android APK for <strong>GrowMore</strong> is currently undergoing 
          testing and preparation. We ensure zero fake files or mock downloads.
        </p>

        {/* Developer / Operator Instruction Box */}
        <div className="cs-instruction-box">
          <div className="cs-box-title">
            <FolderDown size={16} className="text-cyan" />
            <span>How to Link Your APK (For Developers):</span>
          </div>
          <p className="cs-box-text">
            Once compiled, place the production APK file at:
          </p>
          <div className="cs-path-code">
            <code>public/downloads/growmore.apk</code>
          </div>
          <p className="cs-box-footnote">
            The download button will automatically detect and deliver the real file as soon as it exists.
          </p>
        </div>

        <div className="cs-actions">
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
            <span>Got It, Thanks!</span>
          </button>
        </div>
      </div>
    </div>
  );
}
