import React, { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const tweetPattern = /^https?:\/\/(twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/\d+.*$/;

function TweetEmbed({ url }) {
  useEffect(() => {
    if (window.twttr?.widgets) {
      window.twttr.widgets.load();
      return;
    }

    const existing = document.querySelector("script[data-twitter-widgets]");
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    script.dataset.twitterWidgets = "true";
    document.body.appendChild(script);
  }, [url]);

  return (
    <div className="tweet-shell">
      <blockquote className="twitter-tweet">
        <a href={url}>{url}</a>
      </blockquote>
    </div>
  );
}

function parseImageAlt(value = "") {
  const match = value.match(/^(.*?)(?:\|w=(\d{1,3}))$/);
  if (!match) {
    return { alt: value, width: null };
  }

  const width = Math.max(20, Math.min(100, Number(match[2])));
  return { alt: match[1].trim(), width };
}

function MarkdownImage({ alt = "", ...props }) {
  const image = parseImageAlt(alt);
  return (
    <span className="article-image" style={image.width ? { "--image-width": `${image.width}%` } : undefined}>
      <img {...props} alt={image.alt} loading="lazy" />
    </span>
  );
}

function MarkdownBlock({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        img: ({ node, ...props }) => <MarkdownImage {...props} />,
        code: ({ inline, className, children: codeChildren, ...props }) =>
          inline ? (
            <code {...props}>{codeChildren}</code>
          ) : (
            <pre>
              <code className={className} {...props}>
                {codeChildren}
              </code>
            </pre>
          ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default function ArticleRenderer({ content }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <article className="article-body">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (tweetPattern.test(trimmed)) {
          return <TweetEmbed key={`${trimmed}-${index}`} url={trimmed} />;
        }

        return (
          <MarkdownBlock key={`${trimmed.slice(0, 24)}-${index}`}>
            {trimmed}
          </MarkdownBlock>
        );
      })}
    </article>
  );
}
