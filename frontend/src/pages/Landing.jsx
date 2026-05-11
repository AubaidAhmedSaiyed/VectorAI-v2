import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Analytics from "../components/Analytics";
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
  Bell,
  Mail,
  LineChart,
  Package,
  Clock,
  ShieldCheck,
} from "lucide-react";

/** Each block = one scroll target; UI panel reuses the same demo components as before the hero mock was removed. */
const DASHBOARD_FEATURE_SECTIONS = [
  {
    id: "features",
    featureKey: "AI Prediction",
    kicker: "Forecast",
    title: "AI Prediction",
    description:
      "Project weekly demand from your sales history so purchasing and promos follow a signal—not a hunch.",
  },
  {
    id: "feature-sales-analysis",
    featureKey: "Sales Analysis",
    kicker: "Performance",
    title: "Sales Analysis",
    description:
      "Track revenue and margin over time with the same numbers your floor already records—no extra exports.",
  },
  {
    id: "feature-smart-inventory",
    featureKey: "Smart Inventory",
    kicker: "Bundles",
    title: "Smart Inventory",
    description:
      "Pair slow movers with bestsellers using live quantities and pricing to surface bundles that clear stock.",
  },
  {
    id: "feature-expiry-alerts",
    featureKey: "Expiry Alerts",
    kicker: "Safety net",
    title: "Expiry Alerts",
    description:
      "Surface batches nearing expiry before they hit shrink, with room to discount or move product early.",
  },
];

const BENEFIT_ITEMS = [
  {
    title: "Fewer stock-outs",
    description:
      "Align orders and promos with predicted demand so bestsellers stay on the shelf when traffic spikes.",
    Icon: Package,
  },
  {
    title: "Less shrink & spoilage",
    description:
      "Catch expiring batches and slow movers earlier—discount or bundle before they become write-offs.",
    Icon: ShieldCheck,
  },
  {
    title: "Clearer performance",
    description:
      "One view of sales, margin, and inventory so weekly reviews are minutes, not spreadsheet archaeology.",
    Icon: LineChart,
  },
  {
    title: "Faster reactions",
    description:
      "Alerts and forecasts update with your data so staff and managers act in time—not after the fact.",
    Icon: Clock,
  },
];

function Landing({ toggleTheme, theme }) {
  const navigate = useNavigate();
  const fullText = BRAND_NAME;

  /* ===== TYPING LOGIC ===== */
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.slice(0, index + 1));
      index++;
      if (index === fullText.length) clearInterval(interval);
    }, 120);

    return () => clearInterval(interval);
  }, [fullText]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    document.querySelectorAll(".reveal-on-scroll").forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const handleScroll = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const renderFeaturePanel = (featureKey) => {
    switch (featureKey) {
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
            <div style={{ height: "200px", width: "100%", marginTop: "24px" }}>
              <Analytics theme={theme} useLiveData={false} />
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
            <div
              className="mock-data-card"
              style={{
                marginTop: "24px",
                background: "var(--bg-main)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-ui)",
                padding: "20px",
              }}
            >
              <div
                className="bundle-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-main)" }}>Men’s Cotton Shirt</span>
                <span style={{ color: "var(--text-muted)" }}>
                  <span className="numeric" style={{ color: "var(--accent)" }}>
                    48
                  </span>{" "}
                  units · ₹<span className="numeric">599</span>
                </span>
              </div>
              <div className="bundle-plus" style={{ textAlign: "center", margin: "10px 0", color: "var(--text-muted)" }}>
                +
              </div>
              <div
                className="bundle-item"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-main)" }}>Chino Pants</span>
                <span style={{ color: "var(--text-muted)" }}>
                  <span className="numeric" style={{ color: "var(--accent)" }}>
                    32
                  </span>{" "}
                  units · ₹<span className="numeric">799</span>
                </span>
              </div>
              <div
                className="bundle-result"
                style={{
                  marginTop: "20px",
                  padding: "16px",
                  background: "var(--accent-glow-secondary)",
                  borderRadius: "var(--radius-tight)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong style={{ color: "var(--accent-strong)" }}>
                  Suggested Bundle: ₹<span className="numeric">899</span>
                </strong>
                <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  Clearance rate:{" "}
                  <span className="numeric" style={{ color: "var(--accent)" }}>
                    +45%
                  </span>
                </span>
              </div>
            </div>
          </div>
        );

      case "Expiry Alerts":
        return (
          <div className="modern-feature-card">
            <div className="modern-feature-header">
              <div
                className="modern-feature-icon-wrapper"
                style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-text)" }}
              >
                <Bell size={24} />
              </div>
              <div>
                <h3 className="modern-feature-title">Expiry Alerts</h3>
                <p className="modern-feature-desc">Automatically detect soon-to-expire batches.</p>
              </div>
            </div>
            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                className="alert"
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-ui)",
                  background: "var(--status-danger-bg)",
                  color: "var(--status-danger-text)",
                  border: "1px solid color-mix(in srgb, var(--accent-warm) 35%, transparent)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "1.2rem" }} aria-hidden>
                  ⚠️
                </span>
                <div>
                  <strong>Critical:</strong> 15 units of Organic Milk expiring in 3 days.{" "}
                  <span style={{ textDecoration: "underline", cursor: "pointer" }}>Apply 20% discount</span>.
                </div>
              </div>
              <div
                className="alert"
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-ui)",
                  background: "color-mix(in srgb, var(--accent-warm) 10%, transparent)",
                  color: "var(--accent-warm)",
                  border: "1px solid color-mix(in srgb, var(--accent-warm) 28%, transparent)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "1.2rem" }} aria-hidden>
                  🔔
                </span>
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

      {/* ================= HERO ================= */}
      <section className="dashboard-hero-section modern-hero landing-hero-simple">
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
              onClick={() => handleScroll("features")}
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* ================= DASHBOARD FEATURES — zig-zag: text | UI, then UI | text ================= */}
      {DASHBOARD_FEATURE_SECTIONS.map((item, index) => {
        const flipUiLeft = index % 2 === 1;
        return (
          <section
            key={item.id}
            id={item.id}
            className={`section landing-feature-section landing-feature-zigzag reveal-on-scroll${flipUiLeft ? " alt-section landing-feature-zigzag--flip" : ""}`}
          >
            <div className="landing-feature-inner">
              <div className="landing-feature-copy">
                <p className="landing-feature-kicker">{item.kicker}</p>
                <h2 className="section-title landing-feature-title">{item.title}</h2>
                <p className="section-text landing-feature-lead">{item.description}</p>
              </div>
              <div className="landing-feature-ui">
                <div className="landing-feature-mock">{renderFeaturePanel(item.featureKey)}</div>
              </div>
            </div>
          </section>
        );
      })}

      {/* ================= BENEFITS ================= */}
      <section id="benefits" className="section landing-benefits-section reveal-on-scroll">
        <h2 className="section-title">Benefits for your store</h2>
        <p className="section-text">
          These capabilities are built to save time, cut waste, and make every shift a little more predictable.
        </p>
        <div className="landing-benefits-grid">
          {BENEFIT_ITEMS.map(({ title, description, Icon }) => (
            <article key={title} className="landing-benefit-card">
              <div className="landing-benefit-icon" aria-hidden>
                <Icon size={22} strokeWidth={2} />
              </div>
              <h3 className="landing-benefit-title">{title}</h3>
              <p className="landing-benefit-desc">{description}</p>
            </article>
          ))}
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
