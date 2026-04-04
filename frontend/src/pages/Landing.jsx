import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Analytics from "../components/Analytics";
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
  Radar
} from "lucide-react";

function Landing({ toggleTheme, theme }) {
  const navigate = useNavigate();
  const fullText = BRAND_NAME;

  /* ===== TYPING LOGIC ===== */
  const [typedText, setTypedText] = useState("");
  const [activeFeature, setActiveFeature] = useState("Forecast");

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
      case "Forecast":
        return (
          <>
            <div className="mock-content-header">
              <h3>AI Demand Forecasting</h3>
              <p>Predicted sales for the next 4 weeks based on historical data.</p>
            </div>
            <div style={{ height: '300px', width: '100%' }}>
              <Analytics stock={demoStock} theme={theme} />
            </div>
          </>
        );
      case "Smart Inventory":
        return (
          <>
            <div className="mock-content-header">
              <h3>Smart Inventory Mapping</h3>
              <p>Real-time insights and automated bundle suggestions.</p>
            </div>
            <div className="mock-data-card">
              <div className="bundle-item">
                <span>Men’s Cotton Shirt</span>
                <span>
                  <span className="numeric">48</span> units · ₹
                  <span className="numeric">599</span>
                </span>
              </div>
              <div className="bundle-plus">+</div>
              <div className="bundle-item">
                <span>Chino Pants</span>
                <span>
                  <span className="numeric">32</span> units · ₹
                  <span className="numeric">799</span>
                </span>
              </div>
              <div className="bundle-result">
                <strong>
                  Suggested Bundle: ₹
                  <span className="numeric">899</span>
                </strong>
                <span>
                  Estimated clearance:{" "}
                  <span className="numeric">45</span> bundles / month
                </span>
              </div>
            </div>
          </>
        );
      case "Sales Analytics":
        return (
          <>
            <div className="mock-content-header">
              <h3>Sales Analytics</h3>
              <p>Track your revenue, profit margins, and top-performing products.</p>
            </div>
            <div className="mock-widget-placeholder">
              [ Dynamic Sales Chart Placeholder ]
            </div>
          </>
        );
      case "Expiry Alerts":
        return (
          <>
            <div className="mock-content-header">
              <h3>Expiry Alerts</h3>
              <p>Automatically detect soon-to-expire batches.</p>
            </div>
            <div className="alert animate-tagline">
              ⚠️ Warning: 15 units of Organic Milk expiring in 3 days. Recommend 20% discount.
            </div>
            <div className="alert animate-support" style={{ background: 'rgba(251, 146, 60, 0.15)', color: '#fb923c' }}>
              Notice: 40 units of Wheat Bread expiring in 7 days.
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="landing-page">
      <Navbar toggleTheme={toggleTheme} />

      {/* ================= HERO & DASHBOARD MOCKUP ================= */}
      <section className="dashboard-hero-section">
        {/* Soft animated background elements */}
        <div className="hero-glow-blob"></div>
        <div className="hero-glow-blob-alt"></div>

        <div className="hero-text-content">
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
            <button className="cta-primary-large" onClick={() => navigate("/login")}>
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
        <div className="mock-dashboard-wrapper animate-cta">
          {/* Left Sidebar */}
          <div className="mock-sidebar">
             <div className="mock-sidebar-title">Features</div>
             
             <div 
               className={`mock-sidebar-item ${activeFeature === "Forecast" ? "active" : ""}`}
               onClick={() => setActiveFeature("Forecast")}
             >
               <TrendingUp size={20} />
               <span>Forecast</span>
             </div>

             <div 
               className={`mock-sidebar-item ${activeFeature === "Smart Inventory" ? "active" : ""}`}
               onClick={() => setActiveFeature("Smart Inventory")}
             >
               <Boxes size={20} />
               <span>Smart Inventory</span>
             </div>

             <div 
               className={`mock-sidebar-item ${activeFeature === "Sales Analytics" ? "active" : ""}`}
               onClick={() => setActiveFeature("Sales Analytics")}
             >
               <BarChart3 size={20} />
               <span>Sales Analytics</span>
             </div>

             <div 
               className={`mock-sidebar-item ${activeFeature === "Expiry Alerts" ? "active" : ""}`}
               onClick={() => setActiveFeature("Expiry Alerts")}
             >
               <Bell size={20} />
               <span>Expiry Alerts</span>
             </div>
          </div>

          {/* Right Main Content */}
          <div className="mock-content">
             {renderMockContent()}
          </div>
        </div>
      </section>

      {/* ================= BENEFITS ================= */}
      <section id="features" className="section reveal-on-scroll">
        <h2 className="section-title">Drive Real Results</h2>

        <div className="card-grid">
          <div className="info-card">
            <CircleDollarSign size={26} className="feature-icon" />
            <h3>Increase Profit</h3>
            <p>Optimize pricing and sell more at the right time.</p>
          </div>

          <div className="info-card">
            <Leaf size={26} className="feature-icon" />
            <h3>Reduce Stock Waste</h3>
            <p>Clear expiring items before they become losses.</p>
          </div>

          <div className="info-card">
            <Zap size={26} className="feature-icon" />
            <h3>Faster Decisions</h3>
            <p>Skip the spreadsheets. Get AI-backed insights instantly.</p>
          </div>

          <div className="info-card">
            <Radar size={26} className="feature-icon" />
            <h3>Always Up-to-Date</h3>
            <p>Real-time alerts keep your team acting proactively.</p>
          </div>
        </div>
      </section>

      {/* ================= USERS ================= */}
      <section className="section alt-section reveal-on-scroll">
        <h2 className="section-title">Who Is It For?</h2>

        <div className="card-grid">
          <div className="info-card">
            <h3>Shop Owners</h3>
            <p>Complete visibility over sales & stock.</p>
          </div>

          <div className="info-card">
            <h3>Store Staff</h3>
            <p>Faster billing with fewer mistakes.</p>
          </div>

          <div className="info-card">
            <h3>Managers</h3>
            <p>Real-time performance tracking.</p>
          </div>

          <div className="info-card">
            <h3>Business Owners</h3>
            <p>Monitor growth across locations.</p>
          </div>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section className="section reveal-on-scroll">
        <h2 className="section-title">About Vector AI</h2>

        <div className="card-grid">
          <div className="info-card">
            <h3>What We Do</h3>
            <p>{BRAND_DESCRIPTION}</p>
          </div>

          <div className="info-card">
            <h3>Why We Exist</h3>
            <p>To replace guesswork with intelligence.</p>
          </div>

          <div className="info-card">
            <h3>Our Vision</h3>
            <p>Enterprise-grade tools for every retailer.</p>
          </div>

          <div className="info-card">
            <h3>How It Works</h3>
            <p>Sales + Inventory → Insights → Action.</p>
          </div>
        </div>
      </section>

      {/* ================= CONTACT ================= */}
      <section id="contact" className="section contact-highlight reveal-on-scroll">
        <h2 className="section-title">Contact Us</h2>

        <p className="section-text">
          Want to explore Vector AI for your business?
        </p>

        <form className="contact-form">
          <input type="text" placeholder="Your Name" />
          <input type="email" placeholder="Your Email" />
          <textarea placeholder="Your Message"></textarea>
          <button type="submit">Send Message</button>
        </form>
      </section>
      
      <Footer />
    </div>
  );
}

export default Landing;
