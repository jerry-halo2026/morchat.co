"use client";

/**
 * The page body renderer.
 *
 * It reads the small Markdown model in `lib/wiki.ts` and owns the one product
 * behaviour that is not Markdown: a `[[link]]` whose target does not exist is a
 * red link — clicking it creates that page in place instead of navigating into
 * a 404.
 */

import { cn } from "@morechat/ui/lib/utils";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { extractOutline, parseBlocks, parseInline, resolveWikiTarget } from "../lib/wiki";

export function KnowledgeMarkdown({
  markdown,
  space,
  currentPath,
  knownPaths,
  onCreatePage,
}: {
  markdown: string;
  space: string;
  currentPath: string;
  /** `<space>/<path>` keys that exist; anything else is a red link. */
  knownPaths: ReadonlySet<string>;
  onCreatePage?: (space: string, path: string) => void;
}) {
  const p = useWorkspacePaths();
  const { t } = useT("knowledge");
  const blocks = parseBlocks(markdown);
  const headings = extractOutline(markdown);
  let headingIndex = 0;

  const renderInline = (text: string, key: string) =>
    parseInline(text).map((segment, index) => {
      const nodeKey = `${key}-${index}`;
      if (segment.kind === "code") {
        return (
          <code key={nodeKey} className="rounded bg-muted px-1 py-0.5 font-mono text-caption">
            {segment.text}
          </code>
        );
      }
      if (segment.kind === "strong") {
        return <strong key={nodeKey}>{segment.text}</strong>;
      }
      if (segment.kind === "link") {
        return (
          <AppLink key={nodeKey} href={segment.href} className="text-brand underline underline-offset-2">
            {segment.text}
          </AppLink>
        );
      }
      if (segment.kind === "wiki") {
        const target = resolveWikiTarget(segment.target, space, currentPath);
        const key = `${target.space}/${target.path}`;
        if (knownPaths.has(key)) {
          return (
            <AppLink
              key={nodeKey}
              href={p.knowledgePage(target.space, target.path)}
              className="text-brand underline underline-offset-2"
            >
              {segment.text}
            </AppLink>
          );
        }
        return (
          <button
            key={nodeKey}
            type="button"
            title={t(($) => $.reader.redlink_body, { path: target.path })}
            onClick={() => onCreatePage?.(target.space, target.path)}
            className="text-destructive underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {segment.text}
          </button>
        );
      }
      return <span key={nodeKey}>{segment.text}</span>;
    });

  return (
    <div className="min-w-0 text-body leading-relaxed">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.kind === "heading") {
          const level = block.level ?? 2;
          const anchor = headings[headingIndex]?.id;
          headingIndex += 1;
          const Tag = (`h${Math.min(level, 4)}` as unknown) as "h2";
          return (
            <Tag
              key={key}
              id={anchor}
              className={cn(
                "scroll-mt-6 font-semibold",
                level === 1 ? "mt-6 mb-3 text-title-lg" : level === 2 ? "mt-6 mb-2 text-title-sm" : "mt-4 mb-2 text-body",
              )}
            >
              {block.text}
            </Tag>
          );
        }
        if (block.kind === "code") {
          return (
            <pre
              key={key}
              className="my-3 overflow-x-auto rounded-lg border border-surface-border bg-muted/40 p-3 font-mono text-caption"
            >
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={key} className={cn("my-2 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
              {(block.items ?? []).map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </List>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote key={key} className="my-3 border-l-2 border-surface-border pl-3 text-muted-foreground">
              {renderInline(block.text ?? "", key)}
            </blockquote>
          );
        }
        if (block.kind === "rule") {
          return <hr key={key} className="my-4 border-surface-border" />;
        }
        return (
          <p key={key} className="my-2">
            {renderInline(block.text ?? "", key)}
          </p>
        );
      })}
    </div>
  );
}
