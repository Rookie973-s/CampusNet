import React from "react";

/**
 * Safe React rich-text renderer — NEVER uses dangerouslySetInnerHTML.
 * Parses only whitelisted formatting tags (<b>, <strong>, <i>, <em>, <u>, <br>, <p>)
 * and converts @username mentions into clickable profile triggers.
 */
const MENTION_RE = /(@[A-Za-z0-9_.-]{2,30})/g;

function renderTextWithMentions(text, onMention, keyPrefix) {
  if (!text) return null;
  const parts = String(text).split(MENTION_RE);
  return parts.map((part, idx) => {
    if (part.startsWith("@") && part.length > 2) {
      const handle = part.slice(1);
      return (
        <button
          key={`${keyPrefix}-m-${idx}`}
          type="button"
          className="mention-chip"
          onClick={(e) => {
            e.stopPropagation();
            if (onMention) onMention(handle, e.currentTarget);
          }}
        >
          {part}
        </button>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
  });
}

function parseSafeTokens(html, onMention) {
  // Tokenize allowed tags only
  const tokenRe = /(<\/?(?:b|strong|i|em|u|p|br)\s*\/?>)/gi;
  const tokens = String(html).split(tokenRe);
  const root = { tag: "root", children: [] };
  const stack = [root];

  const unescape = (s) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  tokens.forEach((tok) => {
    if (!tok) return;
    const m = tok.match(/^<(\/?)(b|strong|i|em|u|p|br)\s*\/?>$/i);
    if (!m) {
      stack[stack.length - 1].children.push(unescape(tok));
      return;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") {
      stack[stack.length - 1].children.push({ tag: "br", children: [] });
      return;
    }
    if (!closing) {
      const node = { tag, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    }
  });

  const renderNode = (node, key) => {
    if (typeof node === "string") {
      return renderTextWithMentions(node, onMention, key);
    }
    if (node.tag === "br") return <br key={key} />;
    const kids = node.children.map((c, i) => renderNode(c, `${key}-${i}`));
    if (node.tag === "b" || node.tag === "strong") return <strong key={key}>{kids}</strong>;
    if (node.tag === "i" || node.tag === "em") return <em key={key}>{kids}</em>;
    if (node.tag === "u") return <u key={key}>{kids}</u>;
    if (node.tag === "p") return <p key={key} style={{ margin: "0 0 6px" }}>{kids}</p>;
    return <React.Fragment key={key}>{kids}</React.Fragment>;
  };

  return root.children.map((n, i) => renderNode(n, `n-${i}`));
}

export default function RichTextView({ body = "", bodyHtml = "", onMention, className = "", style = {} }) {
  const source = bodyHtml && bodyHtml.trim() ? bodyHtml : "";
  if (!source) {
    // Plain text with line breaks & clickable @mentions
    const lines = String(body || "").split("\n");
    return (
      <div className={className} style={{ whiteSpace: "pre-line", overflowWrap: "anywhere", ...style }}>
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            {renderTextWithMentions(line, onMention, `l-${i}`)}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </div>
    );
  }
  return (
    <div className={className} style={{ overflowWrap: "anywhere", ...style }}>
      {parseSafeTokens(source, onMention)}
    </div>
  );
}
