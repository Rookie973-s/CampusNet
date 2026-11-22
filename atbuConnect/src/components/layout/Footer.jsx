import { Link } from "react-router-dom";
import Ic from "../Ic";
import BrandMark from "../BrandMark";

export default function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-inner">
        <div className="site-footer-brand" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <BrandMark size={24} />
          <strong>CampusNetwork</strong> <span>(Cenet) · ATBU Student Community</span>
        </div>
        <nav className="site-footer-links" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/communities">Communities</Link>
          <Link to="/apply">SUG Access</Link>
          <a href="mailto:support@campusnetwork.edu.ng" className="site-footer-mail">
            <Ic n="mail" s={13} /> support@campusnetwork.edu.ng
          </a>
        </nav>
        <div className="site-footer-copy">
          © {new Date().getFullYear()} CampusNetwork (Cenet)
        </div>
      </div>
    </footer>
  );
}
