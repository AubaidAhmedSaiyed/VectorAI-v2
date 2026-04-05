import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Analytics from "../components/Analytics";
import SalesPredictionChart from "../components/SalesPredictionChart";
import Forecast from "../components/Forecast";
import Footer from "../components/Footer";
import {
  BRAND_NAME,
  TAGLINE,
  BRAND_DESCRIPTION,
} from "../config/brand";
import {
  TrendingUp,
  Boxes,
  BarChart3,
  Bell,
  CircleDollarSign,
  Leaf,
  Zap,
  Radar,
  Mail
} from "lucide-react";

function Landing({ toggleTheme, theme }) {
  const navigate = useNavigate();
  const fullText = BRAND_NAME;

  /* ===== TYPING LOGIC ===== */
  const [typedText, setTypedText] = useState("");
  const [activeFeature, setActiveFeature] = useState("AI Prediction");

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.slice(0, index + 1));
      index++;
      if (index === fullText.length) clearInterval(interval);
    }, 120);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            // Optional: observer.unobserve(entry.target) if you only want it to animate once
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = document.querySelectorAll(".reveal-on-scroll");
    elements.forEach((el) => observer.observe(el));

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [fullText]);

  /* ===== DEMO STOCK ===== */
  const demoStock = [
    { name: "Men Shirt", quantity: 48, soldToday: 12, price: 599, cost: 420 },
    { name: "Chino Pants", quantity: 32, soldToday: 8, price: 799, cost: 560 },
  ];

  const handleScroll = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const renderMockContent = () => {
    switch (activeFeature) {
      case "Sales Analysis":
        return (
          <div className="modern-feature-card">
            <div className="modern-feature-header">
              <div className="modern-feature-icon-wrapper"><TrendingUp size={24} /></div>
              <div>
                <h3 className="modern-feature-title">Sales Analysis</h3>
                <p className="modern-feature-desc">Track your revenue and profit margins over time.</p>
              </div>
            </div>
            <div style={{ height: '200px', width: '100%', marginTop: '24px' }}>
              <Analytics stock={demoStock} theme={theme} />
            </div>
          </div>
        );

      case "AI Prediction":
        return <Forecast theme={theme} />;
      case "Smart Inventory":
        return (
          <div className="modern-feature-card">
            <div className="modern-feature-header">
              <div className="modern-feature-icon-wrapper"><Boxes size={24} /></div>
              <div>
                <h3 className="modern-feature-title">Smart Inventory Mapping</h3>
                <p className="modern-feature-desc">Real-time insights and automated bundle suggestions.</p>
              </div>
            </div>
            <div className="mock-data-card" style={{ marginTop: '24px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
              <div className="bundle-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>Men’s Cotton Shirt</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  <span className="numeric" style={{ color: 'var(--accent)' }}>48</span> units · ₹
                  <span className="numeric">599</span>
                </span>
              </div>
              <div className="bundle-plus" style={{ textAlign: 'center', margin: '10px 0', color: 'var(--text-muted)' }}>+</div>
              <div className="bundle-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>Chino Pants</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  <span className="numeric" style={{ color: 'var(--accent)' }}>32</span> units · ₹
                  <span className="numeric">799</span>
                </span>
              </div>
              <div className="bundle-result" style={{ marginTop: '20px', padding: '16px', background: 'var(--accent-glow-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--accent-strong)' }}>
                  Suggested Bundle: ₹<span className="numeric">899</span>
                </strong>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Clearance rate: <span className="numeric" style={{ color: 'var(--accent)' }}>+45%</span>
                </span>
              </div>
            </div>
          </div>
        );

      case "Expiry Alerts":
        return (
          <div className="modern-feature-card">
            <div className="modern-feature-header">
              <div className="modern-feature-icon-wrapper" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger-text)' }}><Bell size={24} /></div>
              <div>
                <h3 className="modern-feature-title">Expiry Alerts</h3>
                <p className="modern-feature-desc">Automatically detect soon-to-expire batches.</p>
              </div>
            </div>
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="alert animate-tagline" style={{ padding: '16px', borderRadius: '12px', background: 'var(--status-danger-bg)', color: 'var(--status-danger-text)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem' }}>⚠️</span> 
                <div>
                    <strong>Critical:</strong> 15 units of Organic Milk expiring in 3 days. <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Apply 20% discount</span>.
                </div>
              </div>
              <div className="alert animate-support" style={{ padding: '16px', borderRadius: '12px', background: 'rgba(251, 146, 60, 0.1)', color: '#fb923c', border: '1px solid rgba(251, 146, 60, 0.2)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem' }}>🔔</span> 
                <div>
                    <strong>Notice:</strong> 40 units of Wheat Bread expiring in 7 days.
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="landing-page">
      <Navbar toggleTheme={toggleTheme} />

      {/* ================= HERO & DASHBOARD MOCKUP ================= */}
      <section className="dashboard-hero-section modern-hero">
        {/* Soft animated background elements */}
        <div className="hero-glow-blob"></div>
        <div className="hero-glow-blob-alt"></div>

        <div className="hero-text-content modern-hero-text">
          <span className="hero-badge animate-tagline">{TAGLINE}</span>

          <h1 className="flickr-title animate-title">
            Retail Intelligence, Powered by{" "}
            <span className="heading typing-text">{typedText}</span>
          </h1>

          <p className="hero-subtitle animate-support">
            Predict demand. Reduce waste. Act with confidence.
          </p>

          <p className="flickr-support animate-support">
            AI-powered retail intelligence that helps you sell smarter,
            manage inventory better, and make faster decisions.
          </p>

          <div className="landing-cta animate-cta">
            <button className="cta-primary-large cta-primary" onClick={() => navigate("/login")}>
              Explore Dashboard
            </button>
            <button
              className="ghost-btn-link"
              onClick={() => handleScroll('features')}
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Dashboard Mockup (based on sketch) */}
        <div className="mock-dashboard-wrapper modern-dashboard animate-cta">
          {/* Left Sidebar */}
          <div className="mock-sidebar modern-sidebar">
             <div className="mock-sidebar-title" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', margin: '10px 0 20px 14px', fontWeight: 600 }}>Dashboard Features</div>
             
             <div 
               className={`modern-sidebar-item ${activeFeature === "AI Prediction" ? "active" : ""}`}
               onClick={() => setActiveFeature("AI Prediction")}
             >
               <Radar size={20} />
               <span>AI Prediction</span>
             </div>

             <div 
               className={`modern-sidebar-item ${activeFeature === "Sales Analysis" ? "active" : ""}`}
               onClick={() => setActiveFeature("Sales Analysis")}
             >
               <TrendingUp size={20} />
               <span>Sales Analysis</span>
             </div>

             <div 
               className={`modern-sidebar-item ${activeFeature === "Smart Inventory" ? "active" : ""}`}
               onClick={() => setActiveFeature("Smart Inventory")}
             >
               <Boxes size={20} />
               <span>Smart Inventory</span>
             </div>

             <div 
               className={`modern-sidebar-item ${activeFeature === "Expiry Alerts" ? "active" : ""}`}
               onClick={() => setActiveFeature("Expiry Alerts")}
             >
               <Bell size={20} />
               <span>Expiry Alerts</span>
             </div>
          </div>

          {/* Right Main Content */}
          <div className="mock-content modern-content">
             {renderMockContent()}
          </div>
        </div>
      </section>

      {/* ================= BENEFITS ================= */}
      <section id="features" className="section reveal-on-scroll">
        <h2 className="section-title">Drive Real Results</h2>

        <div className="modern-card-grid">
          <div className="modern-feature-card">
            <div className="modern-feature-icon-wrapper" style={{ marginBottom: '16px' }}><CircleDollarSign size={26} /></div>
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Increase Profit</h3>
            <p className="modern-feature-desc">Optimize pricing and sell more at the right time.</p>
          </div>

          <div className="modern-feature-card">
            <div className="modern-feature-icon-wrapper" style={{ marginBottom: '16px' }}><Leaf size={26} /></div>
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Reduce Stock Waste</h3>
            <p className="modern-feature-desc">Clear expiring items before they become losses.</p>
          </div>

          <div className="modern-feature-card">
            <div className="modern-feature-icon-wrapper" style={{ marginBottom: '16px' }}><Zap size={26} /></div>
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Faster Decisions</h3>
            <p className="modern-feature-desc">Skip the spreadsheets. Get AI-backed insights instantly.</p>
          </div>

          <div className="modern-feature-card">
            <div className="modern-feature-icon-wrapper" style={{ marginBottom: '16px' }}><Radar size={26} /></div>
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Always Up-to-Date</h3>
            <p className="modern-feature-desc">Real-time alerts keep your team acting proactively.</p>
          </div>
        </div>
      </section>

      {/* ================= USERS ================= */}
      <section className="section alt-section reveal-on-scroll">
        <h2 className="section-title">Who Is It For?</h2>

        <div className="modern-card-grid">
          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Shop Owners</h3>
            <p className="modern-feature-desc">Complete visibility over sales & stock.</p>
          </div>

          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Store Staff</h3>
            <p className="modern-feature-desc">Faster billing with fewer mistakes.</p>
          </div>

          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Managers</h3>
            <p className="modern-feature-desc">Real-time performance tracking.</p>
          </div>

          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Business Owners</h3>
            <p className="modern-feature-desc">Monitor growth across locations.</p>
          </div>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section className="section reveal-on-scroll">
        <h2 className="section-title">About Vector AI</h2>

        <div className="modern-card-grid">
          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>What We Do</h3>
            <p className="modern-feature-desc">{BRAND_DESCRIPTION}</p>
          </div>

          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Why We Exist</h3>
            <p className="modern-feature-desc">To replace guesswork with intelligence.</p>
          </div>

          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>Our Vision</h3>
            <p className="modern-feature-desc">Enterprise-grade tools for every retailer.</p>
          </div>

          <div className="modern-feature-card">
            <h3 className="modern-feature-title" style={{ marginBottom: '8px' }}>How It Works</h3>
            <p className="modern-feature-desc">Sales + Inventory → Insights → Action.</p>
          </div>
        </div>
      </section>

      {/* ================= CONTACT ================= */}
      <section id="contact" className="section contact-highlight reveal-on-scroll">
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Mail size={32} style={{ color: 'var(--accent)' }}/>
          Contact Us
        </h2>

        <p className="section-text">
          Want to explore Vector AI for your business?
        </p>

        <div className="modern-contact-card">
          <form className="contact-form">
            <input type="text" placeholder="Your Name" />
            <input type="email" placeholder="Your Email" />
            <textarea placeholder="Your Message"></textarea>
            <button type="submit">Send Message</button>
          </form>
        </div>
      </section>
      
      <Footer />
    </div>
  );
}

export default Landing;
