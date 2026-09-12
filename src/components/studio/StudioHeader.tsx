/**
 * The slim top bar shared by every route — a page title/description on the
 * left, an optional slot for page-specific actions on the right (the
 * primary screen puts nothing extra here; SurfaceToolbar, one row below,
 * carries its controls instead).
 */
import type { ReactNode } from "react";
import "./StudioHeader.css";

interface StudioHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}

export function StudioHeader({ title, description, children }: StudioHeaderProps) {
  return (
    <header className="studio-header">
      <div className="studio-header__titles">
        <h1 className="studio-header__title">{title}</h1>
        {description ? <p className="studio-header__description">{description}</p> : null}
      </div>
      {children ? <div className="studio-header__actions">{children}</div> : null}
    </header>
  );
}
