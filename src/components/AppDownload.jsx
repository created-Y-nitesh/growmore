import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Smartphone, 
  Download, 
  QrCode, 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  Bell, 
  Sparkles,
  ExternalLink
} from 'lucide-react';

export default function AppDownload({ onTriggerDownload }) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('/qr-code-placeholder.svg');
  const [downloadUrl, setDownloadUrl] = useState('/downloads/growmore.apk');

  useEffect(() => {
    try {
      const isLocal = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const host = isLocal ? '192.168.1.4' : window.location.hostname;
      const port = (window.location.port && window.location.port !== '80' && window.location.port !== '443')
        ? `:${window.location.port}`
        : (isLocal ? ':3000' : '');
      const protocol = isLocal ? 'http:' : (window.location.protocol || 'http:');
      const fullUrl = `${protocol}//${host}${port}/downloads/growmore.apk`;
      
      setDownloadUrl(fullUrl);

      // Generate authentic high-resolution scannable QR code
      QRCode.toDataURL(fullUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0a0f24',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'H'
      }).then(url => {
        setQrCodeDataUrl(url);
      }).catch(err => {
        console.warn('QRCode generation fallback:', err);
        setQrCodeDataUrl('/growmore-apk-qr.png');
      });
    } catch (e) {
      setQrCodeDataUrl('/growmore-apk-qr.png');
    }
  }, []);

  const appBenefits = [
    {
      icon: <Zap size={18} className="text-cyan" />,
      title: 'Lightning-Fast Execution',
      desc: 'Optimized native performance with immediate portfolio updates.'
    },
    {
      icon: <ShieldCheck size={18} className="text-purple" />,
      title: 'Biometric Security',
      desc: 'Seamless fingerprint and facial recognition authentication preview.'
    },
    {
      icon: <Bell size={18} className="text-cyan" />,
      title: 'Instant Push Alerts',
      desc: 'Real-time notifications for transaction events and plan maturities.'
    }
  ];

  return (
    <section id="download" className="section-padding">
      <div className="container">
        <div className="download-banner-card glass-card">
          {/* Background Ambient Glow */}
          <div className="dl-glow dl-glow-purple"></div>
          <div className="dl-glow dl-glow-cyan"></div>

          <div className="download-grid">
            {/* Left Column: Copy & Download Actions */}
            <div className="download-copy-col">
              <div className="badge badge-cyan">
                <Smartphone size={13} />
                <span>Mobile Experience</span>
              </div>

              <h2 className="download-heading">
                Download the <span className="text-gradient">GrowMore</span> Android App
              </h2>

              <p className="download-subtext">
                Manage your investments on the go. Experience smooth navigation, responsive 
                interactive graphs, and instant transaction notifications straight from your 
                Android device.
              </p>

              {/* Benefits Checklist */}
              <div className="app-benefits-list">
                {appBenefits.map((item, idx) => (
                  <div key={idx} className="benefit-row">
                    <div className="benefit-icon-box">{item.icon}</div>
                    <div>
                      <div className="benefit-title">{item.title}</div>
                      <div className="benefit-desc">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Download Buttons and Instructions */}
              <div className="download-buttons-cluster">
                <a 
                  href="/downloads/growmore.apk"
                  download="growmore.apk"
                  className="btn btn-primary btn-lg download-main-btn"
                  onClick={onTriggerDownload}
                  id="btn-download-apk"
                  style={{ textDecoration: 'none' }}
                >
                  <Download size={20} />
                  <div className="btn-text-block">
                    <span className="btn-label-sm">Official Build</span>
                    <span className="btn-label-lg">Download Android App (.APK)</span>
                  </div>
                </a>

                <div className="apk-metadata-pill">
                  <span className="dot-status"></span>
                  <span>Target: Android 8.0+ • Format: Standalone APK</span>
                </div>
              </div>

              <div className="apk-storage-hint">
                <CheckCircle2 size={15} className="text-cyan flex-shrink-0" />
                <span>
                  Official Release: GrowMore v2.4.1 (143.7 MB) • Verified APK Package • Compatible with all Android 8.0+ devices.
                </span>
              </div>
            </div>

            {/* Right Column: Dynamic Scannable QR Code Card */}
            <div className="download-qr-col">
              <div className="qr-card">
                <div className="qr-card-header">
                  <QrCode size={18} className="text-cyan" />
                  <span>Scan to Download</span>
                </div>

                <div 
                  className="qr-image-wrapper"
                  onClick={onTriggerDownload}
                  title="Click to download APK directly or scan with camera"
                >
                  <img 
                    src={qrCodeDataUrl} 
                    alt="GrowMore Android App Download QR Code" 
                    className="qr-img" 
                  />
                  <div className="qr-scan-line"></div>
                </div>

                <div className="qr-instructions">
                  <p className="qr-tagline">Quick Device Transfer</p>
                  <p className="qr-sub">
                    Open your Android phone camera to scan and download the APK directly, or tap the QR code above.
                  </p>
                </div>

                <div className="qr-footer-badge">
                  <Sparkles size={13} className="text-purple" />
                  <span>Verified GrowMore Release</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
