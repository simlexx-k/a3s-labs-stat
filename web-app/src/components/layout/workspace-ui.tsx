import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkspacePageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  leading?: ReactNode;
  status?: ReactNode;
  title: ReactNode;
};

export function WorkspacePageHeader({ actions, description, eyebrow, leading, status, title }: WorkspacePageHeaderProps) {
  return (
    <header className="workspace-page-header">
      <div className="workspace-page-heading">
        {leading ? <div className="workspace-page-leading">{leading}</div> : null}
        <div className="workspace-page-title">
          <p className="workspace-eyebrow">{eyebrow}</p>
          <div className="workspace-title-line"><h1>{title}</h1>{status}</div>
          {description ? <div className="workspace-page-description">{description}</div> : null}
        </div>
      </div>
      {actions ? <div className="workspace-page-actions">{actions}</div> : null}
    </header>
  );
}

export type WorkspaceSummaryItem = {
  detail: ReactNode;
  label: string;
  tone?: "default" | "danger" | "success" | "warning";
  value: ReactNode;
};

export function WorkspaceSummary({ ariaLabel, items }: { ariaLabel: string; items: WorkspaceSummaryItem[] }) {
  return (
    <section aria-label={ariaLabel} className="workspace-summary">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone && item.tone !== "default" ? `tone-${item.tone}` : undefined}>{item.value}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </section>
  );
}

type WorkspacePanelProps = {
  action?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  id?: string;
  title?: ReactNode;
};

export function WorkspacePanel({ action, ariaLabel, children, className, eyebrow, id, title }: WorkspacePanelProps) {
  return (
    <section aria-label={ariaLabel} className={cn("panel workspace-panel", className)} id={id}>
      {title ? (
        <div className="panel-heading workspace-panel-heading">
          <div>{eyebrow ? <p className="workspace-eyebrow">{eyebrow}</p> : null}<h2>{title}</h2></div>
          {action ? <div className="panel-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function WorkspaceNotice({ actionLabel = "Retry", children, icon, onAction, title, tone = "warning" }: {
  actionLabel?: string;
  children: ReactNode;
  icon: ReactNode;
  onAction?: () => void;
  title: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className={cn("workspace-notice", `workspace-notice-${tone}`)} role="alert">
      <span className="workspace-notice-icon">{icon}</span>
      <div><strong>{title}</strong><span>{children}</span></div>
      {onAction ? <Button onClick={onAction} size="sm" variant="outline">{actionLabel}</Button> : null}
    </div>
  );
}

export function WorkspaceStatus({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "accent" | "danger" | "neutral" | "success" | "warning";
}) {
  return <span className={cn("workspace-status", `workspace-status-${tone}`)}>{children}</span>;
}

export function WorkspaceEmptyState({ action, description, icon, title }: {
  action?: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="workspace-empty-state">
      <span className="workspace-empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="workspace-empty-action">{action}</div> : null}
    </div>
  );
}
