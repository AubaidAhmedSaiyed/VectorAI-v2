import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { BRAND_NAME } from "../config/brand";
import logo from "../assets/logo.png";
import { SunMoon } from "lucide-react";

const Navbar = ({ toggleTheme, variant }) => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleDocScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleDocScroll);
    return () => window.removeEventListener('scroll', handleDocScroll);
  }, []);

  const handleScroll = (id) => {
    if (window.location.pathname !== "/") {
      navigate("/");
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className={`navbar modern-navbar-enhanced ${isScrolled ? 'scrolled' : ''}`}>
      {/* Left: Brand */}
      <div
        className="nav-left"
        onClick={() => navigate("/")}
        style={{ cursor: "pointer" }}
      >
        <img src={logo} alt="Vector AI" className="brand-logo" />
        <span className="brand-text">{BRAND_NAME}</span>
      </div>

      {/* Right actions */}
      <div className="nav-actions">
        {/* Desktop Links */}
        <div className="nav-links-wrapper">
          <button className="nav-text-link" onClick={() => handleScroll('features')}>
            Features
          </button>
          <button className="nav-text-link" onClick={() => handleScroll('contact')}>
            Contact Us
          </button>
        </div>

        {/* Theme toggle (professional) */}
        <button
          onClick={toggleTheme}
          title="Switch theme"
          className="theme-toggle-btn"
        >
          <SunMoon size={18} />
        </button>

        <button className="nav-link-btn" onClick={() => navigate("/login")}>
          Login
        </button>

        <button className="nav-primary-btn cta-primary" onClick={() => navigate("/signup")}>
          Sign Up
        </button>
      </div>
    </header>
  );
};

export default Navbar;
