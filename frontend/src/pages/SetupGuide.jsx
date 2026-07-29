import { Link } from 'react-router-dom';
import { Upload, Settings, Eye, Code, HelpCircle, CheckCircle } from 'lucide-react';

const steps = [
  {
    icon: Upload,
    title: 'Upload Your Knowledge Base',
    desc: 'Go to the Documents page and upload your business information. The AI will learn everything it needs to answer questions accurately.',
    details: [
      'Supports .md, .pdf, .txt, and .json files',
      'Upload FAQs, service descriptions, policies, pricing',
      'The system automatically chunks and indexes your content',
      'You can re-index or delete documents anytime',
    ],
    link: { to: '/documents', label: 'Go to Documents →' },
  },
  {
    icon: Settings,
    title: 'Customize Your Widget',
    desc: 'Configure the chat widget appearance to match your brand. Set colors, greeting message, and position.',
    details: [
      'Choose primary and hover colors',
      'Set a greeting message for new visitors',
      'Pick widget position (bottom-right or bottom-left)',
      'Add a custom SVG icon (optional)',
      'Live preview shows changes in real-time',
    ],
    link: { to: '/admin/widget', label: 'Go to Widget Config →' },
  },
  {
    icon: Eye,
    title: 'Test Your Widget',
    desc: 'Before embedding, test the widget to make sure everything works — chat, voice, and knowledge responses.',
    details: [
      'Open the Widget Demo page',
      'Click the blue button in the corner to open the chat',
      'Try asking questions about your business',
      'Test the voice chat feature',
      'Verify the AI responds accurately',
    ],
    link: { to: '/widget', label: 'Go to Widget Demo →' },
  },
  {
    icon: Code,
    title: 'Embed on Your Website',
    desc: 'Copy the script tag and paste it into your website HTML. The widget will appear on every page.',
    details: [
      'Works with any website — HTML, React, WordPress, Shopify',
      'Copy the embed code from Widget Config page',
      'Paste it just before the closing </body> tag',
      'The widget loads instantly and starts working',
      'No API keys or server setup needed on your end',
    ],
    code: true,
  },
];

const platforms = [
  {
    name: 'Raw HTML',
    code: `<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
</head>
<body>
  <!-- Your content here -->

  <!-- Loggix AI Widget -->
  <script>
  window.LoggixWidget = {
    title: "My Support",
    greeting: "Hi! How can I help?",
    primaryColor: "#0061FF"
  };
  </script>
  <script src="https://your-railway-url.up.railway.app/static/widget.js"></script>
</body>
</html>`,
  },
  {
    name: 'React / Next.js',
    code: `// Add to your layout or _app.tsx
import { useEffect } from 'react';

export default function Layout({ children }) {
  useEffect(() => {
    window.LoggixWidget = {
      title: "My Support",
      greeting: "Hi! How can I help?",
      primaryColor: "#0061FF"
    };
    const script = document.createElement('script');
    script.src = "https://your-railway-url.up.railway.app/static/widget.js";
    document.body.appendChild(script);
  }, []);

  return <>{children}</>;
}`,
  },
  {
    name: 'WordPress',
    code: `// Add to your theme's footer.php
// Or use "Insert Headers and Footers" plugin

<script>
window.LoggixWidget = {
  title: "My Support",
  greeting: "Hi! How can I help?",
  primaryColor: "#0061FF"
};
</script>
<script src="https://your-railway-url.up.railway.app/static/widget.js"></script>`,
  },
];

const faqs = [
  { q: 'Does the widget work on mobile?', a: 'Yes. The widget is fully responsive and works on all devices.' },
  { q: 'Can I customize the AI responses?', a: 'Yes. Upload your own knowledge documents and the AI will use them as context.' },
  { q: 'Is voice chat included?', a: 'Yes. The widget supports voice chat via Vapi.ai when configured.' },
  { q: 'Do I need to pay for the voice calls?', a: 'Voice calls use Vapi.ai which has its own pricing. Check Vapi.ai for details.' },
  { q: 'Can I use my own phone number?', a: 'Contact us for custom phone number integration options.' },
];

export default function SetupGuide() {
  return (
    <div style={{ padding: '3rem 2rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 800,
          marginBottom: '0.75rem',
          background: 'linear-gradient(135deg, #fff 0%, #0061FF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Setup Guide
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1rem', maxWidth: 500, margin: '0 auto' }}>
          Get your AI receptionist running in under 5 minutes. Follow these steps.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '3rem' }}>
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} style={{
              background: 'var(--glass)',
              border: '1px solid var(--glass-border)',
              borderRadius: 20,
              padding: '2rem',
              transition: 'all 0.3s',
            }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{
                  width: 48, height: 48,
                  borderRadius: 14,
                  background: 'rgba(0,97,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={24} color="#0061FF" />
                </div>
                <div>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    marginBottom: '0.25rem',
                  }}>
                    STEP {i + 1}
                  </div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{step.title}</h2>
                </div>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1rem', marginLeft: '4rem' }}>
                {step.desc}
              </p>
              <div style={{ marginLeft: '4rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {step.details.map((d, j) => (
                  <div key={j} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', color: '#94a3b8', fontSize: '0.88rem' }}>
                    <CheckCircle size={16} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
              {step.link && (
                <div style={{ marginLeft: '4rem', marginTop: '1rem' }}>
                  <Link to={step.link.to} style={{
                    color: '#0061FF',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}>
                    {step.link.label}
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' }}>
          Platform-Specific Embed Examples
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {platforms.map((p, i) => (
            <div key={i} style={{
              background: 'var(--glass)',
              border: '1px solid var(--glass-border)',
              borderRadius: 16,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 600, fontSize: '0.9rem' }}>
                {p.name}
              </div>
              <pre style={{
                padding: '1.5rem',
                margin: 0,
                color: '#10b981',
                fontFamily: "'Courier New', monospace",
                fontSize: '0.82rem',
                lineHeight: 1.6,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>{p.code}</pre>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HelpCircle size={20} color="#0061FF" /> Frequently Asked Questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {faqs.map((f, i) => (
            <details key={i} style={{
              background: 'var(--glass)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
              padding: '1rem 1.5rem',
              cursor: 'pointer',
            }}>
              <summary style={{ fontWeight: 600, fontSize: '0.95rem', outline: 'none' }}>{f.q}</summary>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.75rem', lineHeight: 1.5 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
