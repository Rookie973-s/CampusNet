import { useNavigate } from "react-router-dom";
import Ic from "../components/Ic";
import BrandMark from "../components/BrandMark";

export default function AboutPage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div className="raised fu" style={{ padding: "clamp(22px,4vw,40px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <BrandMark size={52} />
          <div>
            <h1 style={{ fontSize: "clamp(24px,3.5vw,32px)", marginBottom: 2 }}>About CampusNetwork (Cenet)</h1>
            <p style={{ color: "var(--mut)", fontSize: 14 }}>The Student Community &amp; Academic Hub for ATBU</p>
          </div>
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.75, color: "var(--txt)", marginBottom: 18 }}>
          <strong>CampusNetwork (Cenet)</strong> connects students, class representatives, verified Student Union
          Government (SUG) officials, and academic departments across Abubakar Tafawa Balewa University in one unified,
          student-first platform.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, margin: "22px 0" }}>
          {[
            { ic: "msg", t: "Q&A Feed & Discussions", d: "Ask questions, share insights, mention peers with @username, and discover trending campus topics." },
            { ic: "compass", t: "Student Communities", d: "Follow campus clubs, tech groups, departmental channels, and the official CampusNetwork community." },
            { ic: "users", t: "SUG Directory & Direct Chat", d: "Rate SUG officials on real campus performance and message verified representatives directly." },
            { ic: "book", t: "Academic PDF Library", d: "Access course notes and past questions curated by approved class representatives." },
          ].map((item) => (
            <div key={item.t} style={{ padding: 16, borderRadius: "var(--r-md)", background: "var(--surfH)", boxShadow: "var(--sh-in)" }}>
              <div style={{ color: "var(--accent)", marginBottom: 8 }}><Ic n={item.ic} s={20} /></div>
              <h3 style={{ fontSize: 15, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginBottom: 4 }}>{item.t}</h3>
              <p style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.55 }}>{item.d}</p>
            </div>
          ))}
        </div>

        <div id="privacy" style={{ padding: 18, borderRadius: "var(--r-md)", background: "var(--surfA)", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>Privacy Policy &amp; Terms of Service</h2>
          <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.65 }}>
            CampusNetwork respects your privacy in line with the Nigeria Data Protection Act (NDPA). Private student
            information (phone numbers, email addresses, verification documents, and private SUG chats) is never exposed
            publicly. Users may delete their account and associated data at any time from Profile Settings. By using
            CampusNetwork, you agree to keep discussions respectful, refrain from impersonation or harassment, and
            comply with university community standards.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14, borderTop: "1px solid var(--brd)" }}>
          <div style={{ fontSize: 14, color: "var(--mut)" }}>
            Need help or have feedback? Email{" "}
            <a href="mailto:support@campusnetwork.edu.ng" style={{ color: "var(--accent)", fontWeight: 700 }}>
              support@campusnetwork.edu.ng
            </a>
          </div>
          <button type="button" className="btn btn-navy" onClick={() => navigate("/feed")}>
            Explore Feed <Ic n="arrow" s={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
